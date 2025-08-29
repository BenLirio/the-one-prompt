import p5 from "p5";
import { kernel, Cell } from "./kernel";

// Dynamic configuration
let GRID_COLS = 5;
let GRID_ROWS = 5;
const CELL_SIZE = 56; // larger for readability

let grid: Cell[][] = [];
let pInstance: p5;

function createGrid(): Cell[][] {
  return Array.from({ length: GRID_ROWS }, () =>
    Array.from({ length: GRID_COLS }, () => ({ text: Math.random() > 0.5 ? '1' : '0' }))
  );
}

function nextGeneration(current: Cell[][]): Cell[][] {
  const next: Cell[][] = current.map(row => row.map(cell => ({ ...cell })));
  for (let y = 0; y < GRID_ROWS; y++) {
    for (let x = 0; x < GRID_COLS; x++) {
      const top = y > 0 ? current[y - 1][x] : null;
      const bottom = y < GRID_ROWS - 1 ? current[y + 1][x] : null;
      const left = x > 0 ? current[y][x - 1] : null;
      const right = x < GRID_COLS - 1 ? current[y][x + 1] : null;
      next[y][x].text = kernel(top, bottom, left, right, current[y][x]);
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
  p.background(255); // white background
  p.fill(0); // text color only
  p.stroke(200); // light grid lines
  p.strokeWeight(1);
  for (let y = 0; y < GRID_ROWS; y++) {
    for (let x = 0; x < GRID_COLS; x++) {
      p.noFill();
      p.rect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
      p.fill(0);
      p.text(grid[y][x].text, x * CELL_SIZE + CELL_SIZE / 2, y * CELL_SIZE + CELL_SIZE / 2 + 1);
      p.noFill();
    }
  }
}

const sketch = (p: p5) => {
  pInstance = p;
  p.setup = () => {
    p.createCanvas(GRID_COLS * CELL_SIZE, GRID_ROWS * CELL_SIZE).parent('app');
    grid = createGrid();
    p.textAlign(p.CENTER, p.CENTER);
    p.textSize(CELL_SIZE * 0.5);
    p.noLoop(); // do not auto-run
    // Hook up controls
    const sizeInput = document.getElementById('gridSizeInput') as HTMLInputElement | null;
    const resizeBtn = document.getElementById('resizeBtn');
    const stepBtn = document.getElementById('stepBtn');
    resizeBtn?.addEventListener('click', () => {
      const val = sizeInput ? parseInt(sizeInput.value, 10) : GRID_COLS;
      if (!isNaN(val) && val > 0 && val <= 50) {
        resizeGrid(val);
        drawGrid(p);
      }
    });
    stepBtn?.addEventListener('click', () => {
      grid = nextGeneration(grid);
      drawGrid(p);
    });
    drawGrid(p);
  };

  p.draw = () => {
    // Intentionally empty; drawing handled manually via step
  };
};

new p5(sketch);
