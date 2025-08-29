import p5 from "p5";

// Example Game of Life grid setup placeholders
const CELL_SIZE = 10;
const GRID_COLS = 40;
const GRID_ROWS = 40;

let grid: number[][] = [];

function createGrid(): number[][] {
  return Array.from({ length: GRID_ROWS }, () =>
    Array.from({ length: GRID_COLS }, () => (Math.random() > 0.7 ? 1 : 0))
  );
}

function nextGeneration(current: number[][]): number[][] {
  const next = current.map((arr) => [...arr]);
  for (let y = 0; y < GRID_ROWS; y++) {
    for (let x = 0; x < GRID_COLS; x++) {
      let neighbors = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const ny = y + dy;
          const nx = x + dx;
          if (ny >= 0 && ny < GRID_ROWS && nx >= 0 && nx < GRID_COLS) {
            neighbors += current[ny][nx];
          }
        }
      }
      const alive = current[y][x] === 1;
      if (alive && (neighbors < 2 || neighbors > 3)) next[y][x] = 0; // dies
      else if (!alive && neighbors === 3) next[y][x] = 1; // born
    }
  }
  return next;
}

const sketch = (p: p5) => {
  p.setup = () => {
    p.createCanvas(GRID_COLS * CELL_SIZE, GRID_ROWS * CELL_SIZE).parent("app");
    grid = createGrid();
    p.frameRate(12);
  };

  p.draw = () => {
    p.background(17);

    // Draw & update
    p.noStroke();
    for (let y = 0; y < GRID_ROWS; y++) {
      for (let x = 0; x < GRID_COLS; x++) {
        if (grid[y][x]) {
          p.fill(0, 200, 120);
        } else {
          p.fill(30);
        }
        p.rect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
      }
    }

    grid = nextGeneration(grid);
  };
};

new p5(sketch);
