import p5 from "p5";
import { kernel, Cell } from "./kernel";
import { OpenAIHelper } from "./openaiHelper";
import { layoutCellText } from "./textLayout";
import { RateLimiter } from "./rateLimiter"; // added

// Dynamic configuration
let GRID_COLS = 5;
let GRID_ROWS = 5;
const CELL_SIZE = 100; // enlarged for better text fit

// Rate limiter config (tweak as needed)
const MAX_CONCURRENT = 3; // number of simultaneous OpenAI calls
const MIN_INTERVAL_MS = 150; // spacing between starting calls
const limiter = new RateLimiter(MAX_CONCURRENT, MIN_INTERVAL_MS);

let grid: Cell[][] = [];
let pInstance: p5;
let helper: OpenAIHelper;
let tokenDiv: HTMLElement | null = null; // added reference
let generationInProgress = false; // track full-step runs
// Track cells currently being updated (grey them out)
const loadingCells = new Set<string>();

function cellKey(x: number, y: number) {
  return `${x},${y}`;
}

function createGrid(): Cell[][] {
  return Array.from({ length: GRID_ROWS }, () =>
    Array.from({ length: GRID_COLS }, () => ({
      text: Math.random() > 0.5 ? "1" : "0",
    }))
  );
}

function updateTokenDisplay() {
  if (!helper || !tokenDiv) return;
  const cum = helper.getCumulativeUsage();
  tokenDiv.textContent = `Cost: $${cum.cost.toFixed(4)}`;
}

async function updateSingleCell(cx: number, cy: number, rulePrompt: string) {
  if (generationInProgress) return; // avoid conflict with full generation
  if (!helper) return;
  // Bounds safety
  if (cy < 0 || cy >= GRID_ROWS || cx < 0 || cx >= GRID_COLS) return;
  const snapshot: Cell[][] = grid.map((row) => row.map((c) => ({ ...c })));
  // Wrap indices for neighbors
  const upY = (cy - 1 + GRID_ROWS) % GRID_ROWS;
  const downY = (cy + 1) % GRID_ROWS;
  const leftX = (cx - 1 + GRID_COLS) % GRID_COLS;
  const rightX = (cx + 1) % GRID_COLS;
  const top = snapshot[upY][cx];
  const bottom = snapshot[downY][cx];
  const left = snapshot[cy][leftX];
  const right = snapshot[cy][rightX];
  await limiter.acquire();
  const key = cellKey(cx, cy);
  loadingCells.add(key);
  drawGrid(pInstance);
  try {
    const newText = await kernel(
      helper,
      rulePrompt,
      top,
      bottom,
      left,
      right,
      snapshot[cy][cx]
    );
    grid[cy][cx].text = newText;
  } catch (e) {
    console.error("Single cell kernel error", e);
  } finally {
    loadingCells.delete(key);
    drawGrid(pInstance);
    updateTokenDisplay();
    limiter.release();
  }
}

async function nextGeneration(
  modelPrompt: string,
  current: Cell[][]
): Promise<Cell[][]> {
  generationInProgress = true;
  // Snapshot to ensure each kernel invocation sees ORIGINAL generation values
  const snapshot: Cell[][] = current.map((row) =>
    row.map((cell) => ({ ...cell }))
  );
  const next: Cell[][] = current.map((row) => row.map((cell) => ({ ...cell })));

  const tasks: Promise<void>[] = [];
  for (let y = 0; y < GRID_ROWS; y++) {
    for (let x = 0; x < GRID_COLS; x++) {
      const task = (async (cx: number, cy: number) => {
        await limiter.acquire();
        const key = cellKey(cx, cy);
        loadingCells.add(key);
        drawGrid(pInstance);
        try {
          // Wrap indices (toroidal grid)
          const upY = (cy - 1 + GRID_ROWS) % GRID_ROWS;
          const downY = (cy + 1) % GRID_ROWS;
          const leftX = (cx - 1 + GRID_COLS) % GRID_COLS;
          const rightX = (cx + 1) % GRID_COLS;
          const top = snapshot[upY][cx];
          const bottom = snapshot[downY][cx];
          const left = snapshot[cy][leftX];
          const right = snapshot[cy][rightX];
          const newText = await kernel(
            helper,
            modelPrompt,
            top,
            bottom,
            left,
            right,
            snapshot[cy][cx]
          );
          next[cy][cx].text = newText;
          grid[cy][cx].text = newText; // progressive update
        } catch (e) {
          console.error("Kernel error", e);
          next[cy][cx].text = snapshot[cy][cx].text; // fallback
        } finally {
          loadingCells.delete(key);
          drawGrid(pInstance);
          updateTokenDisplay(); // update token usage after each call
          limiter.release();
        }
      })(x, y);
      tasks.push(task);
    }
  }
  await Promise.all(tasks);
  generationInProgress = false;
  return next;
}

function resizeGrid(newSize: number) {
  GRID_COLS = newSize;
  GRID_ROWS = newSize;
  grid = createGrid();
  pInstance.resizeCanvas(GRID_COLS * CELL_SIZE, GRID_ROWS * CELL_SIZE);
}

function drawGrid(p: p5) {
  p.background(255);
  p.fill(0);
  p.stroke(200);
  p.strokeWeight(1);
  for (let y = 0; y < GRID_ROWS; y++) {
    for (let x = 0; x < GRID_COLS; x++) {
      const cellX = x * CELL_SIZE;
      const cellY = y * CELL_SIZE;
      p.noFill();
      p.rect(cellX, cellY, CELL_SIZE, CELL_SIZE);
      // Grey overlay if loading
      if (loadingCells.has(cellKey(x, y))) {
        p.push();
        p.noStroke();
        p.fill(0, 0, 0, 60); // semi-transparent dark overlay
        p.rect(cellX, cellY, CELL_SIZE, CELL_SIZE);
        p.pop();
      }
      const content = grid[y][x].text;
      const layout = layoutCellText(p, content, CELL_SIZE, {
        maxFactor: 0.55,
        minFactor: 0.08,
      });
      p.textSize(layout.fontSize);
      p.fill(0);
      // Draw lines centered vertically
      const totalTextHeight = layout.totalHeight;
      let startY =
        cellY + (CELL_SIZE - totalTextHeight) / 2 + layout.lineHeight * 0.8; // adjust baseline
      for (const line of layout.lines) {
        p.textAlign(p.CENTER, p.BASELINE);
        p.text(line, cellX + CELL_SIZE / 2, startY);
        startY += layout.lineHeight;
      }
      p.noFill();
    }
  }
}

function initHelperFromStorage() {
  const stored = localStorage.getItem("openai_api_key") || "";
  if (stored) (window as any).__OPENAI_KEY__ = stored;
  helper = new OpenAIHelper(stored || undefined);
}

const sketch = (p: p5) => {
  pInstance = p;
  p.setup = () => {
    initHelperFromStorage();
    p.createCanvas(GRID_COLS * CELL_SIZE, GRID_ROWS * CELL_SIZE).parent("app");
    grid = createGrid();
    p.textAlign(p.CENTER, p.CENTER);
    p.textSize(CELL_SIZE * 0.32); // smaller default
    p.noLoop(); // do not auto-run
    // Hook up controls
    const sizeInput = document.getElementById(
      "gridSizeInput"
    ) as HTMLInputElement | null;
    const resizeBtn = document.getElementById("resizeBtn");
    const stepBtn = document.getElementById(
      "stepBtn"
    ) as HTMLButtonElement | null;
    const promptInput = document.getElementById(
      "promptInput"
    ) as HTMLInputElement | null;
    const apiKeyInput = document.getElementById(
      "apiKeyInput"
    ) as HTMLInputElement | null;
    tokenDiv = document.getElementById("tokenUsage");

    if (apiKeyInput) {
      const stored = localStorage.getItem("openai_api_key");
      if (stored) apiKeyInput.value = stored;
      apiKeyInput.addEventListener("change", () => {
        const val = apiKeyInput.value.trim();
        if (val) {
          localStorage.setItem("openai_api_key", val);
          (window as any).__OPENAI_KEY__ = val;
          helper = new OpenAIHelper(val);
        } else {
          localStorage.removeItem("openai_api_key");
          (window as any).__OPENAI_KEY__ = "";
          helper = new OpenAIHelper("");
        }
      });
    }

    resizeBtn?.addEventListener("click", () => {
      const val = sizeInput ? parseInt(sizeInput.value, 10) : GRID_COLS;
      if (!isNaN(val) && val > 0 && val <= 50) {
        resizeGrid(val);
        drawGrid(p);
      }
    });

    stepBtn?.addEventListener("click", async () => {
      if (!promptInput) return;
      const rulePrompt =
        promptInput.value ||
        "Update the cell based on neighbors; return the same value.";
      if (stepBtn) stepBtn.disabled = true;
      stepBtn!.textContent = "Running...";
      const start = performance.now();
      grid = await nextGeneration(rulePrompt, grid);
      drawGrid(p);
      updateTokenDisplay(); // final update after generation
      const elapsed = Math.round(performance.now() - start);
      stepBtn!.textContent = `Step (${elapsed}ms)`;
      if (stepBtn) stepBtn.disabled = false;
    });

    // Add mouse click handler for single-cell update
    const canvasEl = (p as any)?._renderer?.canvas as HTMLCanvasElement | undefined;
    if (canvasEl) {
      canvasEl.addEventListener("click", (ev: MouseEvent) => {
        const rect = canvasEl.getBoundingClientRect();
        const mx = ev.clientX - rect.left;
        const my = ev.clientY - rect.top;
        const cx = Math.floor(mx / CELL_SIZE);
        const cy = Math.floor(my / CELL_SIZE);
        const promptInput = document.getElementById("promptInput") as HTMLInputElement | null;
        const rulePrompt =
          (promptInput && promptInput.value) ||
          "Update the cell based on neighbors; return the same value.";
        updateSingleCell(cx, cy, rulePrompt);
      });
    }

    drawGrid(p);
    updateTokenDisplay();
  };

  p.draw = () => {
    // Intentionally empty; drawing handled manually via step
  };
};

new p5(sketch);
