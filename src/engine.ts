import p5 from "p5";
import { kernel, Cell } from "./kernel";
import { OpenAIHelper } from "./openaiHelper";
import { layoutCellText } from "./textLayout";
import { RateLimiter } from "./rateLimiter";
import {
  CELL_SIZE,
  MAX_CONCURRENT,
  MIN_INTERVAL_MS,
  DEFAULT_PROMPT,
} from "./constants";

// Helper to parse hash hex colors like #RGB, #RGBA, #RRGGBB, #RRGGBBAA
interface ParsedHexColor {
  r: number;
  g: number;
  b: number;
  a?: number;
}
function parseHexColor(raw: string | undefined): ParsedHexColor | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!/^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(s))
    return null;
  const hex = s.slice(1);
  let r: number, g: number, b: number, a: number | undefined;
  if (hex.length === 3 || hex.length === 4) {
    // #RGB or #RGBA (each nibble duplicated)
    const rn = parseInt(hex[0] + hex[0], 16);
    const gn = parseInt(hex[1] + hex[1], 16);
    const bn = parseInt(hex[2] + hex[2], 16);
    r = rn;
    g = gn;
    b = bn;
    if (hex.length === 4) a = parseInt(hex[3] + hex[3], 16);
  } else if (hex.length === 6 || hex.length === 8) {
    r = parseInt(hex.slice(0, 2), 16);
    g = parseInt(hex.slice(2, 4), 16);
    b = parseInt(hex.slice(4, 6), 16);
    if (hex.length === 8) a = parseInt(hex.slice(6, 8), 16);
  } else return null;
  return { r, g, b, a };
}

// Encapsulates grid state, OpenAI interaction, rate limiting & drawing logic
export class Engine {
  cols: number;
  rows: number;
  grid: Cell[][] = [];
  private helper: OpenAIHelper | null = null;
  private tokenDiv: HTMLElement | null = null;
  private generationInProgress = false;
  private loadingCells = new Set<string>();
  private limiter = new RateLimiter(MAX_CONCURRENT, MIN_INTERVAL_MS);

  constructor(cols: number, rows: number) {
    this.cols = cols;
    this.rows = rows;
    this.grid = this.createGrid();
  }

  // --- Initialization & configuration ---
  initHelperFromStorage() {
    const stored = localStorage.getItem("openai_api_key") || "";
    if (stored) (window as any).__OPENAI_KEY__ = stored;
    this.helper = new OpenAIHelper(stored || undefined);
  }
  setApiKey(key: string) {
    this.helper = new OpenAIHelper(key || undefined);
  }
  setTokenDiv(div: HTMLElement) {
    this.tokenDiv = div;
  }

  // --- Grid management ---
  private createGrid(): Cell[][] {
    return Array.from({ length: this.rows }, () =>
      Array.from({ length: this.cols }, () => ({ text: "" }))
    );
  }
  resize(newSize: number, p?: p5) {
    const oldCols = this.cols;
    const oldRows = this.rows;
    const oldGrid = this.grid;
    if (newSize === oldCols && newSize === oldRows) return;
    const newGrid: Cell[][] = Array.from({ length: newSize }, () =>
      Array.from({ length: newSize }, () => ({ text: "" }))
    );
    const copyCols = Math.min(oldCols, newSize);
    const copyRows = Math.min(oldRows, newSize);
    for (let y = 0; y < copyRows; y++) {
      for (let x = 0; x < copyCols; x++) {
        newGrid[y][x].text = oldGrid[y][x].text;
      }
    }
    this.cols = newSize;
    this.rows = newSize;
    this.grid = newGrid;
    if (p) p.resizeCanvas(this.cols * CELL_SIZE, this.rows * CELL_SIZE);
  }

  // --- Utility ---
  private cellKey(x: number, y: number) {
    return `${x},${y}`;
  }
  private snapshot(): Cell[][] {
    return this.grid.map((row) => row.map((c) => ({ ...c })));
  }

  // --- Token display ---
  updateTokenDisplay() {
    if (!this.helper || !this.tokenDiv) return;
    const cum = this.helper.getCumulativeUsage();
    this.tokenDiv.textContent = `$${cum.cost.toFixed(4)}`;
  }

  // --- Single cell update ---
  async updateSingleCell(
    cx: number,
    cy: number,
    prompt: string = DEFAULT_PROMPT,
    p?: p5
  ) {
    if (this.generationInProgress) return;
    if (!this.helper) return;
    if (cy < 0 || cy >= this.rows || cx < 0 || cx >= this.cols) return;
    const key = this.cellKey(cx, cy); // compute early
    // Prevent starting another request for the same cell while one is in flight
    if (this.loadingCells.has(key)) return;
    const snapshot = this.snapshot();
    const upY = (cy - 1 + this.rows) % this.rows;
    const downY = (cy + 1) % this.rows;
    const leftX = (cx - 1 + this.cols) % this.cols;
    const rightX = (cx + 1) % this.cols;
    await this.limiter.acquire();
    this.loadingCells.add(key);
    if (p) this.draw(p);
    try {
      const newText = await kernel(
        this.helper,
        prompt,
        snapshot[upY][cx],
        snapshot[downY][cx],
        snapshot[cy][leftX],
        snapshot[cy][rightX],
        snapshot[cy][cx]
      );
      this.grid[cy][cx].text = newText;
    } catch (e) {
      console.error("Single cell kernel error", e);
      const errMsg = e instanceof Error ? e.message : String(e);
      this.grid[cy][cx].text = errMsg;
    } finally {
      this.loadingCells.delete(key);
      if (p) this.draw(p);
      this.updateTokenDisplay();
      this.limiter.release();
    }
  }

  // --- Generation step (all cells) ---
  async nextGeneration(prompt: string, p?: p5) {
    this.generationInProgress = true;
    const snapshot = this.snapshot();
    const tasks: Promise<void>[] = [];
    // Collect all cell coordinates first
    const coords: Array<{ x: number; y: number }> = [];
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        coords.push({ x, y });
      }
    }
    // Fisher-Yates shuffle for random order each generation
    for (let i = coords.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [coords[i], coords[j]] = [coords[j], coords[i]];
    }
    // Launch tasks in randomized order
    for (const { x, y } of coords) {
      const task = (async (cx: number, cy: number) => {
        await this.limiter.acquire();
        const key = this.cellKey(cx, cy);
        this.loadingCells.add(key);
        if (p) this.draw(p);
        try {
          const upY = (cy - 1 + this.rows) % this.rows;
          const downY = (cy + 1) % this.rows;
          const leftX = (cx - 1 + this.cols) % this.cols;
          const rightX = (cx + 1) % this.cols;
          const newText = await kernel(
            this.helper!,
            prompt,
            snapshot[upY][cx],
            snapshot[downY][cx],
            snapshot[cy][leftX],
            snapshot[cy][rightX],
            snapshot[cy][cx]
          );
          this.grid[cy][cx].text = newText;
        } catch (e) {
          console.error("Kernel error", e);
          const errMsg = e instanceof Error ? e.message : String(e);
          this.grid[cy][cx].text = errMsg;
        } finally {
          this.loadingCells.delete(key);
          if (p) this.draw(p);
          this.updateTokenDisplay();
          this.limiter.release();
        }
      })(x, y);
      tasks.push(task);
    }
    await Promise.all(tasks);
    this.generationInProgress = false;
  }

  // --- Drawing ---
  draw(p: p5) {
    p.background(255);
    p.fill(0);
    // We'll draw cell contents first (without per-cell borders) then overlay a single grid so shared lines aren't doubled.
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const cellX = x * CELL_SIZE;
        const cellY = y * CELL_SIZE;

        const content = this.grid[y][x].text;
        const color = parseHexColor(content);
        if (color) {
          p.push();
            p.noStroke();
            if (color.a !== undefined) p.fill(color.r, color.g, color.b, color.a);
            else p.fill(color.r, color.g, color.b);
            p.rect(cellX, cellY, CELL_SIZE, CELL_SIZE);
          p.pop();
        } else {
          // Only layout & draw text if not a color cell
          const layout = layoutCellText(p, content, CELL_SIZE, {
            maxFactor: 0.55,
            minFactor: 0.08,
          });
          p.textSize(layout.fontSize);
          p.fill(0);
          const totalTextHeight = layout.totalHeight;
          let startY = cellY + (CELL_SIZE - totalTextHeight) / 2 + layout.lineHeight * 0.8;
          for (const line of layout.lines) {
            p.textAlign(p.CENTER, p.BASELINE);
            p.text(line, cellX + CELL_SIZE / 2, startY);
            startY += layout.lineHeight;
          }
        }

        // Loading overlay (on top of base color if any)
        if (this.loadingCells.has(this.cellKey(x, y))) {
          p.push();
            p.noStroke();
            p.fill(0, 0, 0, 60);
            p.rect(cellX, cellY, CELL_SIZE, CELL_SIZE);
          p.pop();
        }
      }
    }

    // Draw grid once for crisper, more prominent lines
    p.push();
      p.noFill();
      p.stroke(120); // darker than previous 200 for stronger contrast
      p.strokeWeight(1.5); // slightly thicker
      const w = this.cols * CELL_SIZE;
      const h = this.rows * CELL_SIZE;
      // Outer rectangle
      p.rect(0, 0, w, h);
      // Internal vertical lines
      for (let x = 1; x < this.cols; x++) {
        const xx = x * CELL_SIZE;
        p.line(xx, 0, xx, h);
      }
      // Internal horizontal lines
      for (let y = 1; y < this.rows; y++) {
        const yy = y * CELL_SIZE;
        p.line(0, yy, w, yy);
      }
    p.pop();
  }
}
