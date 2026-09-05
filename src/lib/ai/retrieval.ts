import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { knowledgeCards } from "@/db/schema";

export type RetrievedCard = {
  id: number;
  title: string;
  category: string;
  body: string;
  /** true when the card actually matched the query (FTS or keyword), false when added as background context */
  matched: boolean;
};

const SMALL_BOAT_THRESHOLD = 12;
const TOP_K = 5;

type Row = { id: number; title: string; category: string; body: string };
const columns = { id: knowledgeCards.id, title: knowledgeCards.title, category: knowledgeCards.category, body: knowledgeCards.body };

/**
 * Finds the most relevant *saved* cards for a boat.
 *
 * Strategy (v1, no vector DB):
 *  1. Postgres full-text search (title weighted A, category B, body C) using websearch syntax.
 *  2. ILIKE fallback on individual keywords when FTS finds too little.
 *  3. If the boat has only a handful of cards, the rest are appended as background
 *     context — the LLM can then handle vague or indirect questions too.
 *
 * Clean seam: swap this function for an embeddings search later without touching callers.
 */
export async function retrieveCards(boatId: number, query: string): Promise<RetrievedCard[]> {
  const savedFilter = and(eq(knowledgeCards.boatId, boatId), eq(knowledgeCards.status, "saved"));
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(knowledgeCards).where(savedFilter);
  if (count === 0) return [];

  const cleaned = query.replace(/[^\p{L}\p{N}\s'-]/gu, " ").replace(/\s+/g, " ").trim();
  const results: RetrievedCard[] = [];
  const push = (rows: Row[], matched: boolean) => {
    for (const row of rows) if (!results.some((r) => r.id === row.id)) results.push({ ...row, matched });
  };

  // 1. Full-text search.
  // Query built as OR over the question's lexemes: stop words ("how", "many",
  // "does", "is", "there") are dropped by to_tsvector, and an AND over the rest
  // would kill composite questions ("cabins AND watermaker") because the facts
  // live in separate cards. OR + ts_rank naturally ranks cards matching more
  // query terms on top.
  if (cleaned) {
    const vector = sql`(setweight(to_tsvector('english', ${knowledgeCards.title}), 'A') || setweight(to_tsvector('english', coalesce(${knowledgeCards.category}, '')), 'B') || setweight(to_tsvector('english', ${knowledgeCards.body}), 'C'))`;
    const tsQuery = sql`to_tsquery('english', (select string_agg(lexeme, ' | ') from unnest(to_tsvector('english', ${cleaned}))))`;
    const rows = await db
      .select(columns)
      .from(knowledgeCards)
      .where(and(savedFilter, sql`${vector} @@ ${tsQuery}`))
      .orderBy(sql`ts_rank(${vector}, ${tsQuery}) desc`)
      .limit(TOP_K);
    push(rows, true);
  }

  // 2. Keyword fallback (handles typos in stemming, short words, non-English hints)
  if (results.length < 2 && cleaned) {
    const words = Array.from(new Set(cleaned.toLowerCase().split(" ").filter((w) => w.length > 3))).slice(0, 6);
    if (words.length) {
      const conditions = words.map(
        (w) => sql`(${knowledgeCards.title} ilike ${"%" + w + "%"} or ${knowledgeCards.body} ilike ${"%" + w + "%"} or ${knowledgeCards.category} ilike ${"%" + w + "%"})`,
      );
      // Rank by how many query words a card matches (equal `updated_at` on bulk
      // imports would otherwise return an arbitrary top 5).
      const score = sql.join(
        words.map((w) => sql`((${knowledgeCards.title} ilike ${"%" + w + "%"})::int + (${knowledgeCards.body} ilike ${"%" + w + "%"})::int + (${knowledgeCards.category} ilike ${"%" + w + "%"})::int)`),
        sql` + `,
      );
      const rows = await db
        .select(columns)
        .from(knowledgeCards)
        .where(and(savedFilter, sql.join(conditions, sql` or `)))
        .orderBy(desc(score), desc(knowledgeCards.updatedAt))
        .limit(TOP_K);
      push(rows, true);
    }
  }

  // 3. Small knowledge base → include everything as background context
  if (count <= SMALL_BOAT_THRESHOLD) {
    const all = await db.select(columns).from(knowledgeCards).where(savedFilter).orderBy(desc(knowledgeCards.updatedAt));
    push(all, false);
    return results;
  }

  return results.slice(0, TOP_K);
}
