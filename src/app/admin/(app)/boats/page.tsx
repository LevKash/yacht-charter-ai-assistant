import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { boats, knowledgeCards } from "@/db/schema";
import { BoatsClient } from "./BoatsClient";

export const dynamic = "force-dynamic";

export default async function BoatsPage() {
  const rows = await db
    .select({
      id: boats.id,
      name: boats.name,
      slug: boats.slug,
      note: boats.note,
      savedCount: sql<number>`count(*) filter (where ${knowledgeCards.status} = 'saved')::int`,
      draftCount: sql<number>`count(*) filter (where ${knowledgeCards.status} = 'draft')::int`,
    })
    .from(boats)
    .leftJoin(knowledgeCards, eq(knowledgeCards.boatId, boats.id))
    .groupBy(boats.id)
    .orderBy(desc(boats.createdAt));

  return <BoatsClient boats={rows} />;
}
