// Core constants & default configuration values
export const CELL_SIZE = 100; // px – cell square dimension
export const DEFAULT_GRID_SIZE = 5; // initial width/height
export const MAX_CONCURRENT = 3; // simultaneous OpenAI calls
export const MIN_INTERVAL_MS = 150; // ms spacing between call starts
export const DEFAULT_PROMPT =
  "Update the cell based on neighbors; return the same value.";
