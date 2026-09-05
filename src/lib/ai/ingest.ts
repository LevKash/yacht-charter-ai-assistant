import { guessCategory, normalizeCategory } from "@/lib/categories";
import { isLlmConfigured } from "@/lib/config";
import { chatCompletion, extractJson, LlmError } from "./llm";
import { textToCardsSystemPrompt, whatsappToCardsSystemPrompt } from "./prompts";

export type ProposedCard = { title: string; category: string; body: string };
export type IngestResult = { cards: ProposedCard[]; remaining: number; mode: "ai" | "heuristic" };

const MAX_INPUT_CHARS = 60_000;

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

function validateCards(raw: unknown): { cards: ProposedCard[]; remaining: number } {
  const obj = (Array.isArray(raw) ? { cards: raw } : raw) as { cards?: unknown; remaining?: unknown };
  if (!obj || !Array.isArray(obj.cards)) throw new LlmError("Model reply did not contain a cards array");
  const cards: ProposedCard[] = [];
  for (const item of obj.cards) {
    if (!item || typeof item !== "object") continue;
    const c = item as Record<string, unknown>;
    const title = typeof c.title === "string" ? c.title.trim() : "";
    const body = typeof c.body === "string" ? c.body.trim() : "";
    if (!title || !body) continue;
    cards.push({ title: title.slice(0, 120), category: normalizeCategory(typeof c.category === "string" ? c.category : ""), body: body.slice(0, 4000) });
  }
  const remaining = typeof obj.remaining === "number" && obj.remaining > 0 ? Math.round(obj.remaining) : 0;
  return { cards: cards.slice(0, 12), remaining };
}

/* ------------------------------------------------------------------ */
/* WhatsApp export pre-processing                                      */
/* ------------------------------------------------------------------ */

const SYSTEM_LINE_PATTERNS = [
  /<media omitted>/i,
  /\b(image|video|audio|sticker|gif|document|contact card) omitted\b/i,
  /messages and calls are end-to-end encrypted/i,
  /this message was deleted/i,
  /you deleted this message/i,
  /\bcreated group\b/i,
  /\badded\b.*$/i,
  /\bjoined using this group's invite link\b/i,
  /\bleft$/i,
  /\bchanged the (subject|group description|group icon)\b/i,
  /\bchanged this group's settings\b/i,
  /\bmissed voice call\b/i,
  /\bmissed video call\b/i,
  /^\u200e?\[?\d{1,2}[./]\d{1,2}[./]\d{2,4},? \d{1,2}:\d{2}(?::\d{2})?\]? ?-? ?[^:]*: ?\u200e?(PTT-|AUD-|IMG-|VID-)/i,
];

/**
 * Cleans a WhatsApp export: strips invisible marks, drops system/media lines,
 * and trims to a size the model handles comfortably. Also handy for the preview.
 */
export function cleanWhatsappExport(raw: string): { text: string; totalLines: number; keptLines: number } {
  const lines = raw.replace(/\r\n?/g, "\n").replace(/[\u200e\u200f\u202a-\u202e]/g, "").split("\n");
  const kept: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (SYSTEM_LINE_PATTERNS.some((p) => p.test(trimmed))) continue;
    kept.push(trimmed);
  }
  return { text: kept.join("\n"), totalLines: lines.length, keptLines: kept.length };
}

/* ------------------------------------------------------------------ */
/* Heuristic fallback (used only when no LLM key is configured)        */
/* ------------------------------------------------------------------ */

function heuristicCards(text: string): ProposedCard[] {
  const blocks = text
    .split(/\n\s*\n+/)
    .map((b) => b.trim())
    .filter((b) => b.length > 30);
  const cards = blocks.slice(0, 8).map((block) => {
    const firstLine = block.split("\n")[0].replace(/^[-*#\d.)\s]+/, "").trim();
    const title = (firstLine.length > 70 ? `${firstLine.slice(0, 67)}…` : firstLine) || "Untitled note";
    return { title, category: guessCategory(block), body: block };
  });
  return cards;
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

async function runCardsPrompt(systemPrompt: string, userText: string): Promise<{ cards: ProposedCard[]; remaining: number }> {
  const messages = [
    { role: "system" as const, content: systemPrompt },
    { role: "user" as const, content: `Material:\n\n${userText}` },
  ];
  try {
    return validateCards(extractJson(await chatCompletion(messages, { json: true, temperature: 0.2, maxTokens: 3000 })));
  } catch (err) {
    if (!(err instanceof SyntaxError) && !(err instanceof LlmError)) throw err;
    // One retry with a stricter reminder (covers models that ignore JSON mode).
    const retry = [...messages, { role: "user" as const, content: "Your previous reply was not valid JSON. Reply with ONLY the JSON object, nothing else." }];
    return validateCards(extractJson(await chatCompletion(retry, { json: true, temperature: 0.1, maxTokens: 3000 })));
  }
}

/** Free text (pasted notes, voice transcript) → proposed cards. */
export async function textToCards(rawText: string): Promise<IngestResult> {
  const text = rawText.trim().slice(0, MAX_INPUT_CHARS);
  if (!text) return { cards: [], remaining: 0, mode: "ai" };
  if (!isLlmConfigured()) return { cards: heuristicCards(text), remaining: 0, mode: "heuristic" };
  const result = await runCardsPrompt(textToCardsSystemPrompt(), text);
  return { ...result, mode: "ai" };
}

/** WhatsApp group export → proposed cards. */
export async function whatsappExportToCards(rawExport: string): Promise<IngestResult> {
  const { text } = cleanWhatsappExport(rawExport);
  const trimmed = text.slice(0, MAX_INPUT_CHARS);
  if (!trimmed) return { cards: [], remaining: 0, mode: "ai" };
  if (!isLlmConfigured()) {
    // Without AI we can at least surface the longest messages as raw notes.
    const long = trimmed
      .split("\n")
      .map((l) => l.replace(/^\[?[\d./,: -]+\]?\s*-?\s*[^:]{1,40}:\s*/, "").trim())
      .filter((l) => l.length > 60)
      .slice(0, 8);
    return { cards: long.map((body) => ({ title: `${body.slice(0, 60)}…`, category: guessCategory(body), body })), remaining: 0, mode: "heuristic" };
  }
  const result = await runCardsPrompt(whatsappToCardsSystemPrompt(), trimmed);
  return { ...result, mode: "ai" };
}
