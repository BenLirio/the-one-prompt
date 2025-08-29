// Kernel logic separated from main sketch.
// A Cell only has a text field. '1' means alive, anything else treated as dead.

export interface Cell {
  text: string;
}

// Compute next text value for a cell based on its 4-neighborhood.
// top/bottom/left/right can be null if out of bounds.
export function kernel(
  top: Cell | null,
  bottom: Cell | null,
  left: Cell | null,
  right: Cell | null,
  current: Cell
): string {
  const isAlive = current.text === "1";
  const neighbors = [top, bottom, left, right];
  let aliveCount = 0;
  for (const c of neighbors) {
    if (c && c.text === "1") aliveCount++;
  }
  // Adapted Conway rules for 4-neighborhood (still illustrative):
  // Survive with 2 or 3, birth with exactly 3 (same as original, though >3 is rare here).
  if (isAlive && (aliveCount < 2 || aliveCount > 3)) return "0";
  if (!isAlive && aliveCount === 3) return "1";
  return current.text; // unchanged
}

export {}; // ensure this file is treated as a module
