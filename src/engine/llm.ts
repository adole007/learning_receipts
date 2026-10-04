import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

let client: Anthropic | null = null;
function anthropic() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  client ??= new Anthropic();
  return client;
}

export const MODEL = () => process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
export const VERIFIER_MODEL = () => process.env.ANTHROPIC_VERIFIER_MODEL || MODEL();

type CallOpts<T extends z.ZodType> = {
  system: string;
  prompt: string;
  tool: { name: string; description: string; schema: T };
  model?: string;
  maxTokens?: number;
};

/**
 * Structured call: forces Claude to answer through a single tool whose input
 * schema is derived from a zod schema, then validates the result. One repair
 * retry is attempted if validation fails.
 */
export async function callStructured<T extends z.ZodType>(opts: CallOpts<T>): Promise<z.infer<T>> {
  const inputSchema = z.toJSONSchema(opts.tool.schema, { target: "draft-7" }) as Anthropic.Tool["input_schema"];
  const tools: Anthropic.Tool[] = [{ name: opts.tool.name, description: opts.tool.description, input_schema: inputSchema }];
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: opts.prompt }];

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await anthropic().messages.create({
      model: opts.model ?? MODEL(),
      max_tokens: opts.maxTokens ?? 8000,
      system: opts.system,
      tools,
      tool_choice: { type: "tool", name: opts.tool.name },
      messages,
    });
    const block = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!block) throw new Error("Model did not return structured output");
    const parsed = opts.tool.schema.safeParse(block.input);
    if (parsed.success) return parsed.data;

    messages.push({ role: "assistant", content: res.content });
    messages.push({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: block.id,
          is_error: true,
          content: `Your output failed validation:\n${z.prettifyError(parsed.error)}\nCall the tool again with corrected input.`,
        },
      ],
    });
  }
  throw new Error("Model output failed validation twice");
}
