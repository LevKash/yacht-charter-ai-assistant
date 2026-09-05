import { eq, ilike } from "drizzle-orm";
import { db } from "@/db";
import { boats, whatsappBindings } from "@/db/schema";
import { answerQuestion } from "./ai/answer";
import { env, isWhatsappConfigured } from "./config";
import { copy } from "./copy";

const GRAPH_URL = "https://graph.facebook.com/v21.0";

/** Send a plain text message via the Meta Cloud API. */
export async function sendWhatsappText(to: string, body: string): Promise<void> {
  if (!isWhatsappConfigured()) return;
  const res = await fetch(`${GRAPH_URL}/${env.whatsappPhoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.whatsappToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body: body.slice(0, 4000) },
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("WhatsApp send failed", res.status, text.slice(0, 300));
  }
}

/* ------------------------------------------------------------------ */
/* Incoming message handling (channel-agnostic core, testable)          */
/* ------------------------------------------------------------------ */

export type IncomingWhatsapp = {
  /** Group id when the message comes from a group, otherwise the sender's number. */
  conversationId: string;
  /** Where the reply should be sent (group id or sender). */
  replyTo: string;
  text: string;
  isGroup: boolean;
};

/** Strip a mention of the bot name ("@assistant how…" → "how…"). Returns null if not mentioned. */
function extractMention(text: string): string | null {
  const name = env.whatsappBotName.trim();
  if (!name) return null;
  const re = new RegExp(`@?${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b[:,]?\\s*`, "i");
  if (!re.test(text)) return null;
  return text.replace(re, "").trim();
}

/** Words that mark the boat *model* in a name (hint stops before them). */
const MODEL_WORDS = new Set([
  "fountaine", "pajot", "beneteau", "oceanis", "sun", "odyssey", "lagoon",
  "dufour", "bali", "aventura", "yacht", "saba", "charter",
]);

/**
 * Short memorable hint for !bind — leading name tokens up to the model word,
 * so lookalikes stay distinct (Dione vs Dione II) but model noise is cut.
 */
export function bindHint(name: string): string {
  const words = name
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const tokens: string[] = [];
  for (const w of words) {
    if (MODEL_WORDS.has(w) || /^\d+$/.test(w)) break;
    tokens.push(w);
  }
  return tokens.join(" ") || words[0] || name.toLowerCase();
}

/**
 * Decide what (if anything) to reply. Returns null to stay silent — important
 * in busy groups: the bot only reacts to commands and mentions.
 */
export async function handleIncomingWhatsapp(msg: IncomingWhatsapp): Promise<string | null> {
  const text = msg.text.trim();
  if (!text) return null;
  const lower = text.toLowerCase();

  const [binding] = await db
    .select({ id: whatsappBindings.id, boatId: whatsappBindings.boatId, active: whatsappBindings.active, boatName: boats.name, boatSlug: boats.slug })
    .from(whatsappBindings)
    .leftJoin(boats, eq(whatsappBindings.boatId, boats.id))
    .where(eq(whatsappBindings.groupId, msg.conversationId))
    .limit(1);

  // --- commands -----------------------------------------------------
  if (lower.startsWith("!bind")) {
    const term = text
      .slice(5)
      .trim()
      .toLowerCase()
      .replace(/^@/, "")
      .replace(/[%_]/g, (m) => `\\${m}`);
    if (!term) return copy.whatsapp.unbound;
    // Accept an exact slug ("sissy-fountaine-pajot-42…") or any human-friendly
    // fragment of the name ("sissy") — captains won't remember slugs.
    const [bySlug] = await db.select().from(boats).where(eq(boats.slug, term)).limit(1);
    let matches: Array<{ id: number; name: string; slug: string }> = [];
    if (bySlug) {
      matches = [bySlug];
    } else {
      matches = await db.select().from(boats).where(ilike(boats.name, `%${term}%`)).limit(5);
      if (!matches.length) matches = await db.select().from(boats).where(ilike(boats.slug, `%${term}%`)).limit(5);
    }
    if (!matches.length) return copy.whatsapp.unknownBoat(term.replace(/\\/g, ""));
    if (matches.length > 1) return copy.whatsapp.ambiguous(matches.map((b) => bindHint(b.name)).join(", "));
    const boat = matches[0];
    await db
      .insert(whatsappBindings)
      .values({ groupId: msg.conversationId, boatId: boat.id, active: true })
      .onConflictDoUpdate({ target: whatsappBindings.groupId, set: { boatId: boat.id, active: true, updatedAt: new Date() } });
    return copy.whatsapp.bound(boat.name);
  }
  if (lower === "!unbind") {
    if (binding) await db.delete(whatsappBindings).where(eq(whatsappBindings.id, binding.id));
    return copy.whatsapp.unbound_ok;
  }
  if (lower === "!boats") {
    const all = await db.select({ name: boats.name }).from(boats).orderBy(boats.name);
    return copy.whatsapp.boatsList(all.map((b) => b.name));
  }
  if (lower === "!status") return copy.whatsapp.status(binding?.boatName ?? null, binding?.active ?? false);
  if (lower === "!off" || lower === "!on") {
    if (!binding) return copy.whatsapp.unbound;
    const active = lower === "!on";
    await db.update(whatsappBindings).set({ active, updatedAt: new Date() }).where(eq(whatsappBindings.id, binding.id));
    return active ? copy.whatsapp.on : copy.whatsapp.off;
  }
  if (lower === "!help" || lower === "!start") return copy.whatsapp.help;

  // --- questions ----------------------------------------------------
  let question: string | null = null;
  if (lower.startsWith("!ask")) question = text.slice(4).trim();
  else question = extractMention(text);
  if (question === null) {
    // In 1:1 chats every message is a question; in groups we stay silent unless addressed.
    if (msg.isGroup) return null;
    question = text;
  }
  if (!question) return null;

  if (!binding?.boatId) return copy.whatsapp.unbound;
  if (!binding.active) return null;

  const [boat] = await db.select().from(boats).where(eq(boats.id, binding.boatId)).limit(1);
  if (!boat) return copy.whatsapp.unbound;

  try {
    const { reply } = await answerQuestion({ boat, question, channel: "whatsapp" });
    // WhatsApp has no markdown headings; keep bold (*text*) and lists.
    return reply.replace(/\*\*(.+?)\*\*/g, "*$1*").replace(/^#+\s*/gm, "");
  } catch (err) {
    console.error("WhatsApp answer failed", err);
    return "Sorry, I couldn't process that right now — please try again in a moment.";
  }
}

/* ------------------------------------------------------------------ */
/* Webhook payload parsing (Meta Cloud API)                             */
/* ------------------------------------------------------------------ */

type MetaMessage = {
  from?: string;
  id?: string;
  type?: string;
  text?: { body?: string };
  group_id?: string;
  context?: { group_id?: string };
};

/** Extract text messages from a Meta webhook body; ignores statuses and non-text. */
export function parseMetaWebhook(body: unknown): IncomingWhatsapp[] {
  const out: IncomingWhatsapp[] = [];
  const entries = (body as { entry?: Array<{ changes?: Array<{ value?: { messages?: MetaMessage[]; group_id?: string } }> }> })?.entry ?? [];
  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      for (const m of value?.messages ?? []) {
        if (m.type !== "text" || !m.text?.body || !m.from) continue;
        const groupId = m.group_id ?? m.context?.group_id ?? value?.group_id;
        out.push({
          conversationId: groupId ?? m.from,
          replyTo: groupId ?? m.from,
          text: m.text.body,
          isGroup: Boolean(groupId),
        });
      }
    }
  }
  return out;
}
