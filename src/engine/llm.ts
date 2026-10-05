import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

/**
 * Provider selection: Anthropic (Claude) whenever ANTHROPIC_API_KEY is set,
 * otherwise NVIDIA's OpenAI-compatible API (build.nvidia.com) via NVIDIA_API_KEY.
 */
export type Provider = "anthropic" | "nvidia";

export function llmProvider(): Provider | null {
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.NVIDIA_API_KEY) return "nvidia";
  return null;
}

let client: Anthropic | null = null;
function anthropic() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  client ??= new Anthropic();
  return client;
}

export const MODEL = () =>
  llmProvider() === "nvidia"
    ? process.env.NVIDIA_MODEL || "nvidia/nemotron-3-super-120b-a12b"
    : process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
export const VERIFIER_MODEL = () =>
  (llmProvider() === "nvidia" ? process.env.NVIDIA_VERIFIER_MODEL : process.env.ANTHROPIC_VERIFIER_MODEL) || MODEL();

type CallOpts<T extends z.ZodType, V extends z.ZodType = T> = {
  system: string;
  prompt: string;
  tool: { name: string; description: string; schema: T };
  /** Looser schema to accept the output with (defaults to tool.schema); the model still sees tool.schema. */
  validate?: V;
  model?: string;
  maxTokens?: number;
  /** Epoch ms after which no request may still be running (serverless functions are killed at maxDuration). */
  deadline?: number;
};

const MAX_CALL_MS = 240_000;

/** Time allowed for the next request, or an error if the deadline leaves too little to be useful. */
function callTimeout(deadline?: number) {
  const ms = Math.min(MAX_CALL_MS, (deadline ?? Infinity) - Date.now());
  if (ms < 15_000) throw new Error("Ran out of time for this step; try again");
  return ms;
}

const repairMessage = (error: z.ZodError) =>
  `Your output failed validation:\n${z.prettifyError(error)}\nCall the tool again with corrected input.`;

/**
 * Structured call: forces the model to answer through a single tool whose input
 * schema is derived from a zod schema, then validates the result. One repair
 * retry is attempted if validation fails.
 */
export async function callStructured<T extends z.ZodType, V extends z.ZodType = T>(opts: CallOpts<T, V>): Promise<z.infer<V>> {
  const provider = llmProvider();
  if (!provider) throw new Error("No LLM configured: set ANTHROPIC_API_KEY or NVIDIA_API_KEY");
  return provider === "anthropic" ? callAnthropic(opts) : callNvidia(opts);
}

async function callAnthropic<T extends z.ZodType, V extends z.ZodType>(opts: CallOpts<T, V>): Promise<z.infer<V>> {
  const check = (opts.validate ?? opts.tool.schema) as V;
  const inputSchema = z.toJSONSchema(opts.tool.schema, { target: "draft-7" }) as Anthropic.Tool["input_schema"];
  const tools: Anthropic.Tool[] = [{ name: opts.tool.name, description: opts.tool.description, input_schema: inputSchema }];
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: opts.prompt }];

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await anthropic().messages.create(
      {
        model: opts.model ?? MODEL(),
        max_tokens: opts.maxTokens ?? 8000,
        system: opts.system,
        tools,
        tool_choice: { type: "tool", name: opts.tool.name },
        messages,
      },
      { timeout: callTimeout(opts.deadline), maxRetries: 0 },
    );
    const block = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!block) throw new Error("Model did not return structured output");
    const parsed = check.safeParse(block.input);
    if (parsed.success) return parsed.data;

    messages.push({ role: "assistant", content: res.content });
    messages.push({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: block.id, is_error: true, content: repairMessage(parsed.error) }],
    });
  }
  throw new Error("Model output failed validation twice");
}

type OpenAIToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
type OpenAIMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: OpenAIToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

/** Pulls a JSON object out of plain text, for models that answer in content instead of calling the tool. */
function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return JSON.parse(candidate);
}

async function callNvidia<T extends z.ZodType, V extends z.ZodType>(opts: CallOpts<T, V>): Promise<z.infer<V>> {
  const check = (opts.validate ?? opts.tool.schema) as V;
  const { $schema: _ignored, ...parameters } = z.toJSONSchema(opts.tool.schema, { target: "draft-7" }) as Record<string, unknown>;
  const tools = [{ type: "function", function: { name: opts.tool.name, description: opts.tool.description, parameters } }];
  const messages: OpenAIMessage[] = [
    { role: "system", content: opts.system },
    { role: "user", content: opts.prompt },
  ];
  const baseUrl = process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1";
  let lastProblem = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    const timeout = callTimeout(opts.deadline);
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.NVIDIA_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: opts.model ?? MODEL(),
        // Reasoning models spend output tokens thinking before the tool call; a larger budget mostly buys longer thinking.
        max_tokens: (opts.maxTokens ?? 8000) + 4000,
        temperature: 0.2,
        messages,
        tools,
        tool_choice: { type: "function", function: { name: opts.tool.name } },
      }),
      // Hosted NVIDIA models can queue indefinitely when busy.
      signal: AbortSignal.timeout(timeout),
    }).catch((e: Error) => {
      if (e.name === "TimeoutError") throw new Error(`The AI model did not answer within ${Math.round(timeout / 1000)}s`);
      throw e;
    });
    if (!res.ok) throw new Error(`NVIDIA API ${res.status}: ${(await res.text()).slice(0, 500)}`);
    const data = (await res.json()) as {
      choices: { finish_reason?: string; message: { content: string | null; tool_calls?: OpenAIToolCall[] } }[];
    };
    const choice = data.choices[0];
    if (!choice?.message) throw new Error("Model returned no choices");
    const msg = choice.message;

    const call = msg.tool_calls?.find((c) => c.function.name === opts.tool.name) ?? msg.tool_calls?.[0];
    let input: unknown;
    try {
      input = call ? JSON.parse(call.function.arguments) : extractJson(msg.content ?? "");
    } catch {
      lastProblem = `Model did not return structured output (finish_reason: ${choice.finish_reason ?? "unknown"})`;
      messages.push({
        role: "user",
        content: `Your previous reply was not a complete ${opts.tool.name} call. Think briefly, then call the ${opts.tool.name} tool with valid JSON arguments.`,
      });
      continue;
    }
    const parsed = check.safeParse(input);
    if (parsed.success) return parsed.data;

    lastProblem = `Model output failed validation twice: ${z.prettifyError(parsed.error).slice(0, 300)}`;
    if (call) {
      messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: [call] });
      messages.push({ role: "tool", tool_call_id: call.id, content: repairMessage(parsed.error) });
    } else {
      messages.push({ role: "assistant", content: msg.content ?? "" });
      messages.push({ role: "user", content: repairMessage(parsed.error) });
    }
  }
  throw new Error(lastProblem);
}
