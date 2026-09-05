import { db } from "@/db";
import { settings, type Settings } from "@/db/schema";
import { env } from "./config";

/** Settings are a single row (id = 1); created on first read. */
export async function getSettings(): Promise<Settings> {
  const [row] = await db.select().from(settings).limit(1);
  if (row) return row;
  const [created] = await db.insert(settings).values({ id: 1 }).onConflictDoNothing().returning();
  if (created) return created;
  const [again] = await db.select().from(settings).limit(1);
  return again;
}

/** Model name: settings override wins, then env, then default. */
export async function getLlmModel(): Promise<string> {
  const s = await getSettings();
  return s.llmModel?.trim() || env.llmModel;
}
