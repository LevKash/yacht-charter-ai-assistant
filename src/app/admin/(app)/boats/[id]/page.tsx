import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { boats, knowledgeCards } from "@/db/schema";
import { KnowledgeClient } from "./KnowledgeClient";

export const dynamic = "force-dynamic";

export default async function BoatKnowledgePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const boatId = Number(id);
  if (!Number.isFinite(boatId)) notFound();
  const [boat] = await db.select().from(boats).where(eq(boats.id, boatId)).limit(1);
  if (!boat) notFound();
  const cards = await db
    .select({
      id: knowledgeCards.id,
      title: knowledgeCards.title,
      category: knowledgeCards.category,
      body: knowledgeCards.body,
      source: knowledgeCards.source,
      status: knowledgeCards.status,
      updatedAt: knowledgeCards.updatedAt,
    })
    .from(knowledgeCards)
    .where(eq(knowledgeCards.boatId, boatId))
    .orderBy(desc(knowledgeCards.updatedAt));

  return <KnowledgeClient boat={boat} cards={cards.map((c) => ({ ...c, updatedAt: c.updatedAt.toISOString() }))} />;
}
