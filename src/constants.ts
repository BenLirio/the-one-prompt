// Core constants & default configuration values
export const CELL_SIZE = 200; // px – cell square dimension
export const DEFAULT_GRID_SIZE = 5; // initial width/height
export const MAX_CONCURRENT = 10; // simultaneous OpenAI calls
export const MIN_INTERVAL_MS = 50; // ms spacing between call starts
export const DEFAULT_PROMPT =
  "Update the cell based on neighbors; return the same value.";
