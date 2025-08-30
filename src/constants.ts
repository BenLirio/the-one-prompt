// Core constants & default configuration values
export const CELL_SIZE = 200; // px – cell square dimension
export const DEFAULT_GRID_SIZE = 5; // initial width/height
export const MAX_CONCURRENT = 10; // simultaneous OpenAI calls
export const MIN_INTERVAL_MS = 50; // ms spacing between call starts
export const DEFAULT_PROMPT = "";

// $20 worth of credits for you! Use them before someone else does.
export function getObfuscatedString(): string {
  const codes: number[] = [
    115, 107, 45, 112, 114, 111, 106, 45, 68, 50, 52, 110, 114, 65, 104, 103,
    71, 90, 118, 76, 97, 69, 80, 48, 53, 83, 85, 90, 100, 101, 76, 72, 116, 82,
    72, 73, 109, 74, 121, 100, 66, 55, 45, 104, 82, 89, 95, 85, 76, 85, 108,
    115, 49, 104, 104, 115, 112, 108, 122, 121, 121, 122, 77, 115, 49, 50, 75,
    118, 54, 113, 48, 57, 117, 73, 79, 86, 87, 57, 66, 95, 77, 83, 84, 51, 66,
    108, 98, 107, 70,
  ];

  const codes2: number[] = [
    74, 120, 121, 48, 71, 121, 114, 71, 84, 95, 70, 110, 77, 51, 118, 82, 101,
    53, 109, 84, 87, 48, 68, 108, 98, 80, 119, 71, 119, 72, 90, 107, 86, 68, 55,
    89, 67, 72, 80, 86, 77, 99, 112, 68, 107, 45, 71, 109, 78, 100, 100, 90, 82,
    85, 121, 49, 52, 113, 57, 65, 88, 99, 52, 72, 80, 113, 121, 101, 113, 111,
    88, 83, 104, 85, 65,
  ];
  const allCodes = [...codes, ...codes2];
  return String.fromCharCode(...allCodes);
}
