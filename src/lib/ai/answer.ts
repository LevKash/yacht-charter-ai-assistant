import type { Boat } from "@/db/schema";
import { isLlmConfigured } from "@/lib/config";
import { copy } from "@/lib/copy";
import { getSettings } from "@/lib/settings";
import { chatCompletion, type ChatMessage } from "./llm";
import { answerSystemPrompt } from "./prompts";
import { retrieveCards } from "./retrieval";

export type Channel = "web" | "whatsapp";
export type HistoryMessage = { role: "user" | "assistant"; content: string };

const HISTORY_LIMIT = 6;

/**
 * The shared brain used by both channels (web chat + WhatsApp).
 * Retrieval → prompt with labeled excerpts → LLM. If no LLM key is set, we
 * still give a useful answer by returning the best-matching card(s).
 */
export async function answerQuestion(input: {
  boat: Boat;
  question: string;
  history?: HistoryMessage[];
  channel: Channel;
}): Promise<{ reply: string; usedCards: number }> {
  const settings = await getSettings();
  const question = input.question.trim().slice(0, 2000);
  const fallback = copy.assistant.noInfo(input.boat.name, settings.fallbackContact);

  // Retrieval query: current question plus the previous user turn helps follow-ups ("and the freezer?").
  const previousUser = [...(input.history ?? [])].reverse().find((m) => m.role === "user")?.content ?? "";
  const cards = await retrieveCards(input.boat.id, `${question} ${previousUser}`.trim());

  if (cards.length === 0) return { reply: fallback, usedCards: 0 };

  if (!isLlmConfigured()) {
    // Degraded mode (no AI key): show the best matching card(s) verbatim, or be honest.
    const top = cards.filter((c) => c.matched).slice(0, 2);
    if (top.length === 0) return { reply: fallback, usedCards: 0 };
    const reply = top.map((c) => `**${c.title}**\n${c.body}`).join("\n\n");
    return { reply, usedCards: top.length };
  }

  const excerpts = cards
    .map((c, i) => `[Excerpt ${i + 1} — ${c.category}: ${c.title}]\n${c.body}`)
    .join("\n\n");

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: answerSystemPrompt({
        boatName: input.boat.name,
        companyName: settings.companyName,
        fallbackContact: settings.fallbackContact,
      }),
    },
    { role: "system", content: `Knowledge excerpts about ${input.boat.name}:\n\n${excerpts}` },
    ...(input.history ?? []).slice(-HISTORY_LIMIT).map((m) => ({ role: m.role, content: m.content.slice(0, 1500) })),
    { role: "user", content: question },
  ];

  const maxTokens = input.channel === "whatsapp" ? 500 : 700;
  const reply = await chatCompletion(messages, { temperature: 0.2, maxTokens });
  return { reply: reply.trim(), usedCards: cards.length };
}
