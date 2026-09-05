import { env, isWhatsappConfigured } from "@/lib/config";
import { handleIncomingWhatsapp, parseMetaWebhook, sendWhatsappText } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Meta webhook verification handshake. */
export async function GET(req: Request) {
  if (!isWhatsappConfigured()) return new Response("WhatsApp not configured", { status: 503 });
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token === env.whatsappVerifyToken && challenge) {
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

/** Incoming messages. Always answers 200 quickly so Meta does not retry. */
export async function POST(req: Request) {
  if (!isWhatsappConfigured()) return Response.json({ error: "WhatsApp not configured" }, { status: 503 });
  const body = await req.json().catch(() => null);
  if (!body) return Response.json({ ok: false }, { status: 400 });

  const messages = parseMetaWebhook(body);
  const replies: Array<{ to: string; reply: string }> = [];
  for (const msg of messages) {
    try {
      const reply = await handleIncomingWhatsapp(msg);
      if (reply) {
        await sendWhatsappText(msg.replyTo, reply);
        replies.push({ to: msg.replyTo, reply });
      }
    } catch (err) {
      console.error("webhook handling failed", err);
    }
  }
  return Response.json({ ok: true, handled: messages.length, replied: replies.length });
}
