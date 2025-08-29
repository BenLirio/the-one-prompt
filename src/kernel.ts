// Kernel now delegates cell evolution to OpenAI based on a user-provided prompt.
// A Cell only has a text field. '1' means alive, anything else treated as dead (semantic left to the prompt).

import { z } from "zod";
import { OpenAIHelper } from "./openaiHelper";

export interface Cell {
  text: string;
}

const CellResultSchema = z.object({ resultValue: z.string() });

// Asynchronously obtain the next value for a cell by sending context to the model.
export async function kernel(
  helper: OpenAIHelper,
  userPrompt: string,
  top: Cell | null,
  bottom: Cell | null,
  left: Cell | null,
  right: Cell | null,
  current: Cell
): Promise<string> {
  const composed = `${userPrompt}\n\nCurrent cell text: ${
    current.text
  }\nNeighbors:\n top: ${top ? top.text : "null"}\n bottom: ${
    bottom ? bottom.text : "null"
  }\n left: ${left ? left.text : "null"}\n right: ${
    right ? right.text : "null"
  }\n\nReturn strictly JSON with shape { \"resultValue\": string } where resultValue is the new text for the cell.`;
  const parsed = await helper.getStructuredWithZod(
    composed,
    CellResultSchema,
    "cell_result"
  );
  return parsed.resultValue;
}

export {}; // ensure this file is treated as a module
