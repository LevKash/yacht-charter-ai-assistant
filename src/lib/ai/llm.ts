import { env, isLlmConfigured } from "@/lib/config";
import { getLlmModel } from "@/lib/settings";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export class LlmError extends Error {}

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const TIMEOUT_MS = 45_000;

/**
 * Single entry point for all LLM calls (OpenAI-compatible via OpenRouter).
 * Low temperature, timeout, one automatic retry. Server-side only.
 */
export async function chatCompletion(
  messages: ChatMessage[],
  opts: { json?: boolean; temperature?: number; maxTokens?: number } = {},
): Promise<string> {
  if (!isLlmConfigured()) throw new LlmError("LLM not configured");
  const model = await getLlmModel();

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(OPENROUTER_URL, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${env.openrouterKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": env.appUrl || "https://baxyachting.com",
          "X-Title": "Bax Yachting Boat Assistant",
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: opts.temperature ?? 0.2,
          max_tokens: opts.maxTokens ?? 1800,
          ...(opts.json ? { response_format: { type: "json_object" } } : {}),
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new LlmError(`LLM provider error ${res.status}: ${text.slice(0, 300)}`);
      }
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new LlmError("Empty response from LLM");
      return content;
    } catch (err) {
      lastError = err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new LlmError("LLM call failed");
}

/** Pull the first JSON object/array out of a model reply (tolerates ``` fences). */
export function extractJson<T = unknown>(raw: string): T {
  const cleaned = raw.replace(/```(?:json)?/gi, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = Math.min(...["{", "["].map((c) => cleaned.indexOf(c)).filter((i) => i >= 0));
    const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
    if (!Number.isFinite(start) || end <= start) throw new LlmError("Could not parse JSON from model reply");
    return JSON.parse(cleaned.slice(start, end + 1)) as T;
  }
}
