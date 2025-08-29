import OpenAI from "openai";
import { z } from "zod";

export class OpenAIHelper {
  private client: OpenAI;
  private debug = true; // set false to silence logs

  constructor(apiKey?: string) {
    const inferred =
      apiKey ??
      (typeof window !== "undefined" ? (window as any).__OPENAI_KEY__ : "");
    if (!inferred && this.debug)
      console.warn("[OpenAIHelper] No API key provided.");
    this.client = new OpenAI({
      apiKey: inferred || "",
      dangerouslyAllowBrowser: true,
    });
  }

  private assertObjectSchema(
    schema: z.ZodTypeAny
  ): asserts schema is z.ZodObject<any> {
    if (!(schema instanceof z.ZodObject))
      throw new Error("Root schema must be a Zod object (z.object({...}))");
  }

  private zodObjectToJsonSchema(obj: z.ZodObject<any>) {
    // Zod v3: _def.shape() is function; Zod v4: _def.shape is the shape object.
    const rawShape = (obj as any)._def.shape;
    const shape: Record<string, z.ZodTypeAny> =
      typeof rawShape === "function" ? rawShape() : rawShape;
    const properties: Record<string, any> = {};
    const required: string[] = [];
    for (const key of Object.keys(shape)) {
      const field: z.ZodTypeAny = shape[key];
      let schemaFragment: any = {};
      const base =
        field instanceof z.ZodOptional ? (field as any)._def.innerType : field;
      if (base instanceof z.ZodString) schemaFragment.type = "string";
      else if (base instanceof z.ZodNumber) schemaFragment.type = "number";
      else if (base instanceof z.ZodBoolean) schemaFragment.type = "boolean";
      else if (base instanceof z.ZodArray) {
        schemaFragment.type = "array";
        const inner = (base as any)._def.type;
        if (inner instanceof z.ZodString)
          schemaFragment.items = { type: "string" };
        else if (inner instanceof z.ZodNumber)
          schemaFragment.items = { type: "number" };
        else if (inner instanceof z.ZodBoolean)
          schemaFragment.items = { type: "boolean" };
        else schemaFragment.items = { type: "string" }; // fallback
      } else if (base instanceof z.ZodObject) {
        schemaFragment = this.zodObjectToJsonSchema(base as any); // recursive
      } else {
        schemaFragment.type = "string"; // default fallback
      }
      properties[key] = schemaFragment;
      if (!field.isOptional()) required.push(key);
    }
    const root: any = {
      type: "object",
      properties,
      additionalProperties: false,
    };
    if (required.length) root.required = required;
    return root;
  }

  async getStructuredWithZod<T extends z.ZodTypeAny>(
    text: string,
    schema: T,
    name: string,
    model = "gpt-4o-mini"
  ): Promise<z.infer<T>> {
    this.assertObjectSchema(schema);
    const jsonSchema = this.zodObjectToJsonSchema(schema);
    const payload = {
      model,
      messages: [
        {
          role: "system",
          content: "Return ONLY JSON per the provided schema.",
        },
        { role: "user", content: text },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name, strict: true, schema: jsonSchema },
      },
    } as any;

    if (this.debug) console.log("[OpenAIHelper] Sending request", payload);

    try {
      const completion = await this.client.chat.completions.create(payload);
      const msg: any = completion.choices[0].message;
      if (this.debug) console.log("[OpenAIHelper] Raw message", msg);
      if (msg.refusal) throw new Error(`Model refusal: ${msg.refusal}`);
      if (!msg.content) throw new Error("Empty response content");
      return JSON.parse(msg.content) as z.infer<T>;
    } catch (sdkErr) {
      if (this.debug)
        console.warn(
          "[OpenAIHelper] SDK path failed, attempting direct fetch fallback",
          sdkErr
        );
      // Fallback manual fetch (in case the SDK short-circuited locally)
      const key =
        (this.client as any).apiKey ||
        (typeof window !== "undefined" ? (window as any).__OPENAI_KEY__ : "");
      if (!key) throw sdkErr;
      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error("Fetch fallback failed: " + txt);
      }
      const data = await resp.json();
      if (this.debug) console.log("[OpenAIHelper] Fallback data", data);
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error("No content in fallback response");
      return JSON.parse(content) as z.infer<T>;
    }
  }
}

// Usage: set window.__OPENAI_KEY__ or use API key input.
