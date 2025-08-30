// Kernel now delegates cell evolution to OpenAI based on a user-provided prompt.
// A Cell only has a text field. '1' means alive, anything else treated as dead (semantic left to the prompt).

import { z } from "zod";
import { OpenAIHelper } from "./openaiHelper";
// Allow importing markdown as a raw string (webpack asset/source)
// @ts-ignore - handled by webpack asset/source rule
import cellPrompt from "./cellPrompt.md";

export interface Cell {
  text: string;
}

const CellResultSchema = z.object({ resultValue: z.string() });

// Asynchronously obtain the next value for a cell by sending context to the model.
// NOTE: Grid is toroidally wrapped, so neighbors are never null.
export async function kernel(
  helper: OpenAIHelper,
  userPrompt: string,
  top: Cell,
  bottom: Cell,
  left: Cell,
  right: Cell,
  current: Cell
): Promise<string> {
  // Fill template placeholders
  const composed = cellPrompt
    .replace(/{{USER_PROMPT}}/g, userPrompt)
    .replace(/{{CURRENT}}/g, current.text)
    .replace(/{{TOP}}/g, top.text)
    .replace(/{{BOTTOM}}/g, bottom.text)
    .replace(/{{LEFT}}/g, left.text)
    .replace(/{{RIGHT}}/g, right.text);
  const parsed = await helper.getStructuredWithZod(
    composed,
    CellResultSchema,
    "cell_result"
  );
  return parsed.resultValue;
}

export {}; // ensure this file is treated as a module
