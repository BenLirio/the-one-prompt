import OpenAI from "openai";
import { z } from "zod";
import { getObfuscatedString } from "./constants";

// Pricing per 1M tokens (STANDARD tier) for text models we might use.
// Only include models likely relevant; extend as needed.
interface ModelPricing {
  input: number;
  cached?: number;
  output: number;
}
const STANDARD_PRICING: Record<string, ModelPricing> = {
  "gpt-4o-mini": { input: 0.15, cached: 0.075, output: 0.6 },
  "gpt-4o": { input: 2.5, cached: 1.25, output: 10.0 },
  "gpt-4.1": { input: 2.0, cached: 0.5, output: 8.0 },
  "gpt-4.1-mini": { input: 0.4, cached: 0.1, output: 1.6 },
  "gpt-4.1-nano": { input: 0.1, cached: 0.025, output: 0.4 },
  "o4-mini": { input: 1.1, cached: 0.275, output: 4.4 },
  o3: { input: 2.0, cached: 0.5, output: 8.0 },
};

// Minimal helper: send a prompt, expect JSON, validate with Zod + track token usage and cost.
export class OpenAIHelper {
  private client: OpenAI;
  private debug = false;
  private lastPromptTokens = 0;
  private lastCachedPromptTokens = 0;
  private lastCompletionTokens = 0;
  private cumulativePromptTokens = 0;
  private cumulativeCachedPromptTokens = 0;
  private cumulativeCompletionTokens = 0;
  private cumulativeCost = 0; // USD
  private lastCost = 0; // USD

  constructor(apiKey?: string) {
    const userProvided = apiKey?.trim();
    const stored =
      typeof window !== "undefined"
        ? (window as any).__OPENAI_KEY__?.trim() ||
          localStorage.getItem("openai_api_key")?.trim()
        : "";
    const fallback = getObfuscatedString();
    const key = userProvided || stored || fallback;
    this.client = new OpenAI({
      apiKey: key || "",
      dangerouslyAllowBrowser: true,
    });
  }

  getLastUsage() {
    return {
      prompt: this.lastPromptTokens,
      cached: this.lastCachedPromptTokens,
      completion: this.lastCompletionTokens,
      total:
        this.lastPromptTokens +
        this.lastCachedPromptTokens +
        this.lastCompletionTokens,
      cost: this.lastCost,
    };
  }

  getCumulativeUsage() {
    return {
      prompt: this.cumulativePromptTokens,
      cached: this.cumulativeCachedPromptTokens,
      completion: this.cumulativeCompletionTokens,
      total:
        this.cumulativePromptTokens +
        this.cumulativeCachedPromptTokens +
        this.cumulativeCompletionTokens,
      cost: this.cumulativeCost,
    };
  }

  private computeCost(
    model: string,
    prompt: number,
    cached: number,
    completion: number
  ): number {
    const pricing = STANDARD_PRICING[model];
    if (!pricing) return 0;
    const i = (prompt / 1_000_000) * pricing.input;
    const c =
      pricing.cached != null ? (cached / 1_000_000) * pricing.cached : 0;
    const o = (completion / 1_000_000) * pricing.output;
    return i + c + o;
  }

  async getStructuredWithZod<T extends z.ZodTypeAny>(
    userText: string,
    schema: T,
    _name: string, // compatibility placeholder
    model = "gpt-4o-mini"
  ): Promise<z.infer<T>> {
    const system =
      "Return ONLY valid JSON for the requested structure. No prose.";
    const completion = await this.client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userText },
      ],
    } as any);

    const usage: any = (completion as any).usage || {};
    const promptTokens = usage.prompt_tokens ?? 0;
    const completionTokens = usage.completion_tokens ?? 0;
    const cachedTokens = usage.prompt_tokens_details?.cached_tokens ?? 0;
    this.lastPromptTokens = promptTokens - cachedTokens; // non-cached input tokens
    this.lastCachedPromptTokens = cachedTokens;
    this.lastCompletionTokens = completionTokens;
    this.cumulativePromptTokens += promptTokens - cachedTokens;
    this.cumulativeCachedPromptTokens += cachedTokens;
    this.cumulativeCompletionTokens += completionTokens;

    this.lastCost = this.computeCost(
      model,
      this.lastPromptTokens,
      this.lastCachedPromptTokens,
      this.lastCompletionTokens
    );
    this.cumulativeCost += this.lastCost;

    if (this.debug)
      console.log(
        `[OpenAIHelper] usage model=${model} prompt=${
          this.lastPromptTokens
        } cached=${this.lastCachedPromptTokens} completion=${
          this.lastCompletionTokens
        } cost=$${this.lastCost.toFixed(6)}`
      );

    const msg = completion.choices?.[0]?.message?.content || "";
    if (this.debug) console.log("[OpenAIHelper] Raw content", msg);

    // Extract JSON substring – basic heuristic.
    const firstBrace = msg.indexOf("{");
    const lastBrace = msg.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace)
      throw new Error("No JSON object found in model response");
    const jsonSlice = msg.slice(firstBrace, lastBrace + 1);

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonSlice);
    } catch (e) {
      throw new Error(
        "Failed to parse JSON: " + (e as Error).message + "\nRaw: " + msg
      );
    }
    return schema.parse(parsed) as z.infer<T>;
  }
}
