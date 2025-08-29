// Kernel now delegates cell evolution to OpenAI based on a user-provided prompt.
// A Cell only has a text field. '1' means alive, anything else treated as dead (semantic left to the prompt).

import { z } from "zod";
import { OpenAIHelper } from "./openaiHelper";

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
  const composed = `${userPrompt}\n\nCurrent cell text: ${current.text}\nNeighbors (wrap-around grid):\n top: ${top.text}\n bottom: ${bottom.text}\n left: ${left.text}\n right: ${right.text}\n\nReturn strictly JSON with shape { \"resultValue\": string } where resultValue is the new text for the cell.`;
  const parsed = await helper.getStructuredWithZod(
    composed,
    CellResultSchema,
    "cell_result"
  );
  return parsed.resultValue;
}

export {}; // ensure this file is treated as a module
