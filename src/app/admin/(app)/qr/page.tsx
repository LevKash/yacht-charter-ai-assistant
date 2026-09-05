import { desc } from "drizzle-orm";
import { db } from "@/db";
import { boats } from "@/db/schema";
import { env } from "@/lib/config";
import { QrClient } from "./QrClient";

export const dynamic = "force-dynamic";

export default async function QrPage() {
  const rows = await db
    .select({ id: boats.id, name: boats.name, slug: boats.slug })
    .from(boats)
    .orderBy(desc(boats.createdAt));

  const baseUrl = env.appUrl || "https://yacht-charter-ai-assistant.vercel.app";

  return <QrClient boats={rows} baseUrl={baseUrl} />;
}
