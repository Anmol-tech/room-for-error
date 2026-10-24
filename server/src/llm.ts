// Shared chat client for the director (text) and hotspot detection (vision).
import OpenAI from "openai";
import { LLM, LLM_REASONING_EFFORT } from "./config.ts";

// OpenRouter speaks the OpenAI API, so the same client works for both.
const client = LLM.apiKey
  ? new OpenAI({
      apiKey: LLM.apiKey,
      baseURL: LLM.baseURL,
      ...(LLM.provider === "openrouter" ? { defaultHeaders: { "X-Title": "Room for Error" } } : {}),
    })
  : null;

export const llmEnabled = () => client !== null;

export type UserContent = string | OpenAI.ChatCompletionContentPart[];

/** Sends one system + user message and parses the JSON object the model returns. */
export async function chatJson(
  system: string,
  user: UserContent,
  opts: { model?: string; tag: string; reasoningEffort?: string },
): Promise<Record<string, unknown>> {
  if (!client) throw new Error("No LLM key set (OPENROUTER_API_KEY or OPENAI_API_KEY)");
  const model = opts.model ?? LLM.model;
  const effort = opts.reasoningEffort ?? LLM_REASONING_EFFORT;
  const started = Date.now();
  const params = {
    model,
    response_format: { type: "json_object" as const },
    messages: [
      { role: "system" as const, content: system },
      { role: "user" as const, content: user },
    ],
    // OpenRouter normalizes reasoning settings across models; OpenAI takes reasoning_effort.
    ...(LLM.provider === "openrouter"
      ? { reasoning: { effort } }
      : { reasoning_effort: effort }),
  };
  const res = await client.chat.completions.create(params as OpenAI.ChatCompletionCreateParamsNonStreaming);
  const text = res.choices[0]?.message?.content;
  console.log(
    `[${opts.tag}] ${LLM.provider}/${model} ${((Date.now() - started) / 1000).toFixed(1)}s, ${res.usage?.completion_tokens ?? "?"} output tokens`,
  );
  if (!text) throw new Error(`${opts.tag}: empty response`);
  // Some models wrap JSON in prose or code fences; take the outermost object.
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  const body = text.slice(start, end + 1);
  try {
    return JSON.parse(body);
  } catch {
    try {
      // Occasionally the JSON arrives with its newlines and quotes escaped as literal text.
      return JSON.parse(body.replace(/\\n/g, "\n").replace(/\\"/g, '"'));
    } catch {
      throw new Error(`${opts.tag}: response was not JSON: ${text.slice(0, 300)}`);
    }
  }
}
