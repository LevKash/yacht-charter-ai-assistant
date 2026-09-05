import { eq } from "drizzle-orm";
import { db } from "@/db";
import { boats } from "@/db/schema";
import { answerQuestion, type HistoryMessage } from "@/lib/ai/answer";
import { copy } from "@/lib/copy";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Body = { slug?: string; question?: string; history?: HistoryMessage[] };

/** Public guest chat endpoint. Stateless: the client sends recent history each time. */
export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const slug = String(body.slug ?? "").trim().toLowerCase();
  const question = String(body.question ?? "").trim();
  if (!slug || !question) return Response.json({ error: "Missing question" }, { status: 400 });

  const [boat] = await db.select().from(boats).where(eq(boats.slug, slug)).limit(1);
  if (!boat) return Response.json({ error: "Boat not found" }, { status: 404 });

  const history = Array.isArray(body.history)
    ? body.history
        .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
        .slice(-8)
        .map((m) => ({ role: m.role, content: m.content.slice(0, 1500) }))
    : [];

  try {
    const { reply } = await answerQuestion({ boat, question, history, channel: "web" });
    return Response.json({ reply });
  } catch (err) {
    console.error("chat error", err);
    return Response.json({ error: copy.guest.error }, { status: 502 });
  }
}
