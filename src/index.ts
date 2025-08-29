import p5 from "p5";
import { kernel, Cell } from "./kernel";
import { OpenAIHelper } from "./openaiHelper";
import { layoutCellText } from "./textLayout";

// Dynamic configuration
let GRID_COLS = 5;
let GRID_ROWS = 5;
const CELL_SIZE = 100; // enlarged for better text fit

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
  const next: Cell[][] = current.map((row) => row.map((cell) => ({ ...cell })));
  for (let y = 0; y < GRID_ROWS; y++) {
    for (let x = 0; x < GRID_COLS; x++) {
      const top = y > 0 ? current[y - 1][x] : null;
      const bottom = y < GRID_ROWS - 1 ? current[y + 1][x] : null;
      const left = x > 0 ? current[y][x - 1] : null;
      const right = x < GRID_COLS - 1 ? current[y][x + 1] : null;
      try {
        next[y][x].text = await kernel(
          helper,
          modelPrompt,
          top,
          bottom,
          left,
          right,
          current[y][x]
        );
      } catch (e) {
        console.error("Kernel error", e);
        next[y][x].text = current[y][x].text; // fallback
      }
    }
  }
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
      grid = await nextGeneration(rulePrompt, grid);
      drawGrid(p);
      stepBtn!.textContent = "Step";
      if (stepBtn) stepBtn.disabled = false;
    });

    drawGrid(p);
  };

  p.draw = () => {
    // Intentionally empty; drawing handled manually via step
  };
};

new p5(sketch);
