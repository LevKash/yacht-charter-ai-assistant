import { env, isSttConfigured } from "@/lib/config";

/**
 * Speech-to-text seam. v1 calls any OpenAI-compatible `/audio/transcriptions`
 * endpoint (OpenAI, Groq, self-hosted Whisper…). Swap the body of this
 * function to change providers.
 */
export async function transcribeAudio(file: File): Promise<string> {
  if (!isSttConfigured()) throw new Error("Voice transcription is not configured (STT_API_KEY missing).");

  const form = new FormData();
  form.append("file", file, file.name || "audio.m4a");
  form.append("model", env.sttModel);
  form.append("response_format", "json");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 55_000);
  try {
    const res = await fetch(`${env.sttBaseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.sttKey}` },
      body: form,
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Transcription failed (${res.status}): ${text.slice(0, 200)}`);
    }
    const data = (await res.json()) as { text?: string };
    if (!data.text?.trim()) throw new Error("The transcription came back empty.");
    return data.text.trim();
  } finally {
    clearTimeout(timer);
  }
}
