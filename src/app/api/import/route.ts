import { eq } from "drizzle-orm";
import { db } from "@/db";
import { boats, importJobs } from "@/db/schema";
import { textToCards, whatsappExportToCards, type ProposedCard } from "@/lib/ai/ingest";
import { transcribeAudio } from "@/lib/ai/stt";
import { getCurrentUser } from "@/lib/auth";
import { isSttConfigured } from "@/lib/config";
import { clampText } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_FILE_BYTES = 20 * 1024 * 1024;

export type ImportResponse = {
  jobId: number;
  cards: ProposedCard[];
  remaining: number;
  mode: "ai" | "heuristic";
  transcript?: string;
};

/**
 * Runs one import (text | whatsapp | voice) and returns PROPOSED cards.
 * Nothing is saved as knowledge here — the review screen does that explicitly.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });

  const form = await req.formData().catch(() => null);
  if (!form) return Response.json({ error: "Invalid upload." }, { status: 400 });

  const kind = String(form.get("kind") ?? "");
  const boatIdRaw = form.get("boatId");
  const boatId = boatIdRaw ? Number(boatIdRaw) : null;
  if (boatId) {
    const [boat] = await db.select({ id: boats.id }).from(boats).where(eq(boats.id, boatId)).limit(1);
    if (!boat) return Response.json({ error: "Boat not found." }, { status: 404 });
  }

  let rawText = "";
  let transcript: string | undefined;

  try {
    if (kind === "text") {
      rawText = String(form.get("text") ?? "");
    } else if (kind === "whatsapp") {
      const file = form.get("file");
      if (!(file instanceof File)) return Response.json({ error: "Please choose the exported .txt file." }, { status: 400 });
      if (file.size > MAX_FILE_BYTES) return Response.json({ error: "File is too large (max 20 MB)." }, { status: 413 });
      rawText = await file.text();
    } else if (kind === "voice") {
      if (!isSttConfigured()) return Response.json({ error: "Voice import is not set up yet." }, { status: 503 });
      const file = form.get("file");
      if (!(file instanceof File)) return Response.json({ error: "Please choose an audio file." }, { status: 400 });
      if (file.size > MAX_FILE_BYTES) return Response.json({ error: "File is too large (max 20 MB)." }, { status: 413 });
      transcript = await transcribeAudio(file);
      rawText = transcript;
    } else {
      return Response.json({ error: "Unknown import type." }, { status: 400 });
    }
  } catch (err) {
    console.error("import prepare failed", err);
    return Response.json({ error: err instanceof Error ? err.message : "Couldn't read this file." }, { status: 502 });
  }

  if (!rawText.trim()) return Response.json({ error: "There is nothing to analyze — the input is empty." }, { status: 400 });

  const [job] = await db
    .insert(importJobs)
    .values({ boatId, kind: kind as "text" | "voice" | "whatsapp", rawPreview: clampText(rawText, 500), createdBy: user.id })
    .returning({ id: importJobs.id });

  try {
    const result = kind === "whatsapp" ? await whatsappExportToCards(rawText) : await textToCards(rawText);
    await db.update(importJobs).set({ status: "review", proposedCount: result.cards.length }).where(eq(importJobs.id, job.id));
    const payload: ImportResponse = { jobId: job.id, ...result, transcript };
    return Response.json(payload);
  } catch (err) {
    console.error("import analysis failed", err);
    await db.update(importJobs).set({ status: "failed" }).where(eq(importJobs.id, job.id));
    return Response.json({ error: "Couldn't process this right now — please try again." }, { status: 502 });
  }
}
