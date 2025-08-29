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

function createGrid(): Cell[][] {
  return Array.from({ length: GRID_ROWS }, () =>
    Array.from({ length: GRID_COLS }, () => ({
      text: Math.random() > 0.5 ? "1" : "0",
    }))
  );
}

async function nextGeneration(
  modelPrompt: string,
  current: Cell[][]
): Promise<Cell[][]> {
  // Snapshot to ensure each kernel invocation sees ORIGINAL generation values
  const snapshot: Cell[][] = current.map((row) =>
    row.map((cell) => ({ ...cell }))
  );
  // Prepare next grid we will eventually return
  const next: Cell[][] = current.map((row) => row.map((cell) => ({ ...cell })));

  // Launch all cell computations in parallel with rate limiting
  const tasks: Promise<void>[] = [];
  for (let y = 0; y < GRID_ROWS; y++) {
    for (let x = 0; x < GRID_COLS; x++) {
      const task = (async (cx: number, cy: number) => {
        await limiter.acquire();
        try {
          const top = cy > 0 ? snapshot[cy - 1][cx] : null;
          const bottom = cy < GRID_ROWS - 1 ? snapshot[cy + 1][cx] : null;
          const left = cx > 0 ? snapshot[cy][cx - 1] : null;
          const right = cx < GRID_COLS - 1 ? snapshot[cy][cx + 1] : null;
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
          // Update visible grid immediately for progressive feedback.
          grid[cy][cx].text = newText;
          drawGrid(pInstance);
        } catch (e) {
          console.error("Kernel error", e);
          next[cy][cx].text = snapshot[cy][cx].text; // fallback to old value
        } finally {
          limiter.release();
        }
      })(x, y);
      tasks.push(task);
    }
  }
  await Promise.all(tasks);
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
      const elapsed = Math.round(performance.now() - start);
      stepBtn!.textContent = `Step (${elapsed}ms)`;
      if (stepBtn) stepBtn.disabled = false;
    });

    drawGrid(p);
  };

  p.draw = () => {
    // Intentionally empty; drawing handled manually via step
  };
};

new p5(sketch);
