/**
 * Fleet importer: reads scripts/data/fleet.json (produced by scrape-fleet.ts,
 * no network needed here) and syncs it into the database.
 *
 *   npx tsx scripts/import-fleet.ts
 *
 * Per boat:
 *   1. upsert `boats` by slug (update name if changed; `note` is never overwritten)
 *   2. delete this boat's cards WHERE source = 'text_dump'   ← idempotency key
 *   3. insert 1 "Specifications" card + 1 card per equipment section
 *
 * Only cards created by this importer (source = 'text_dump') are ever removed;
 * manual / voice / whatsapp_export cards are never touched. Running the script
 * twice yields the same card count.
 *
 * Env: DATABASE_URL (required), ADMIN_EMAIL (optional — falls back to the
 * existing owner account, or creates it via ensureOwner() like scripts/seed.ts).
 */
import "./load-env";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { and, asc, eq, sql } from "drizzle-orm";
import { db, pool } from "../src/db";
import { boats, knowledgeCards, users } from "../src/db/schema";
import { ensureOwner } from "../src/lib/auth";
import type { FleetBoat, FleetFile } from "./scrape-fleet";

const DATA_FILE = path.join("scripts", "data", "fleet.json");
const SOURCE = "text_dump" as const;
const STATUS = "saved" as const;
const SPECS_CATEGORY = "Specifications";
const TITLE_MAX = 120;
const BODY_MAX = 4000;
const CATEGORY_MAX = 40;

type CardDraft = { category: string; title: string; body: string };

/* ------------------------------------------------------------------ */
/* Card building                                                       */
/* ------------------------------------------------------------------ */

function specsCard(boat: FleetBoat): CardDraft {
  const lines = boat.specs.map((s) => `${s.label}: ${s.value}`);
  if (boat.type) lines.push(`Type: ${boat.type}`);
  if (boat.features.length) {
    lines.push("Features:");
    for (const f of boat.features) lines.push(`- ${f}`);
  }
  return { category: SPECS_CATEGORY, title: `${boat.name}: ${SPECS_CATEGORY}`, body: lines.join("\n") };
}

/** Splits an item list into chunks whose "- item\n" body stays within BODY_MAX (never splits inside an item). */
function chunkLines(lines: string[], max: number): string[][] {
  const chunks: string[][] = [];
  let current: string[] = [];
  let len = 0;
  for (const line of lines) {
    const add = line.length + (current.length ? 1 : 0);
    if (current.length && len + add > max) {
      chunks.push(current);
      current = [];
      len = 0;
    }
    current.push(line);
    len += current.length === 1 ? line.length : add;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

function clip(value: string, max: number): string {
  return value.length > max ? value.slice(0, max).trimEnd() : value;
}

function buildCards(boat: FleetBoat, log: (msg: string) => void): CardDraft[] {
  const drafts: CardDraft[] = [specsCard(boat)];

  for (const section of boat.equipment) {
    const title = `${boat.name}: ${section.section}`;
    const lines = section.items.map((i) => `- ${i}`);
    if (!lines.length) {
      log(`skip empty section "${section.section}" (no items)`);
      continue;
    }
    const chunks = chunkLines(lines, BODY_MAX);
    if (chunks.length > 1) log(`section "${section.section}" split into ${chunks.length} cards (body > ${BODY_MAX} chars)`);
    chunks.forEach((chunk, i) => {
      const t = chunks.length > 1 ? `${title} (part ${i + 1})` : title;
      drafts.push({ category: section.section, title: t, body: chunk.join("\n") });
    });
  }

  const out: CardDraft[] = [];
  for (const d of drafts) {
    const body = d.body.trim();
    if (!body) {
      log(`skip card "${d.title}" (empty body)`);
      continue;
    }
    const title = clip(d.title.trim(), TITLE_MAX);
    const category = clip(d.category.trim(), CATEGORY_MAX) || "General";
    if (title !== d.title) log(`title clipped to ${TITLE_MAX} chars: "${d.title}"`);
    if (category !== d.category) log(`category clipped to ${CATEGORY_MAX} chars: "${d.category}"`);
    if (body.length > BODY_MAX) {
      // Only reachable for a pathological single item longer than BODY_MAX.
      log(`body clipped to ${BODY_MAX} chars: "${d.title}"`);
    }
    out.push({ category, title, body: clip(body, BODY_MAX) });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Owner resolution                                                    */
/* ------------------------------------------------------------------ */

async function resolveOwnerId(): Promise<{ id: number; email: string }> {
  const adminEmail = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const byEmail = async () =>
    adminEmail
      ? (await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.email, adminEmail)).limit(1))[0]
      : undefined;
  const byRole = async () =>
    (await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.role, "owner")).limit(1))[0];

  let user = (await byEmail()) ?? (await byRole());
  if (!user) {
    const created = await ensureOwner();
    console.log(`  ℹ no owner existed — created ${created.email} via ensureOwner()`);
    user = (await byEmail()) ?? (await byRole());
  }
  if (!user) throw new Error("Could not resolve an owner user for created_by");
  if (adminEmail && user.email.toLowerCase() !== adminEmail) {
    console.log(`  ⚠ ADMIN_EMAIL=${adminEmail} not found in users — using owner account ${user.email} instead`);
  }
  return user;
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

async function loadFleet(): Promise<FleetFile> {
  const raw = await readFile(DATA_FILE, "utf8");
  const data = JSON.parse(raw) as FleetFile;
  if (!data || !Array.isArray(data.boats) || data.boats.length === 0) {
    throw new Error(`${DATA_FILE} has no boats — run scripts/scrape-fleet.ts first`);
  }
  const slugs = new Set<string>();
  for (const b of data.boats) {
    if (!b.slug || !b.name) throw new Error(`Invalid boat entry (missing slug/name): ${JSON.stringify(b).slice(0, 200)}`);
    if (slugs.has(b.slug)) throw new Error(`Duplicate slug in ${DATA_FILE}: ${b.slug}`);
    slugs.add(b.slug);
    if (!Array.isArray(b.specs) || !Array.isArray(b.equipment) || !Array.isArray(b.features)) {
      throw new Error(`Invalid boat entry ${b.slug}: specs/equipment/features must be arrays`);
    }
  }
  return data;
}

async function main() {
  const fleet = await loadFleet();
  console.log(`→ ${DATA_FILE}: ${fleet.boats.length} boats (scraped ${fleet.scrapedAt})`);
  if (fleet.incompleteSourcePages?.length) {
    console.log(`  ⚠ boats with incomplete source pages: ${fleet.incompleteSourcePages.join(", ")}`);
  }

  const owner = await resolveOwnerId();
  console.log(`→ created_by = ${owner.email} (user id ${owner.id})`);

  const perBoat: { slug: string; name: string; boatId: number; cards: number; action: string }[] = [];

  for (const boat of fleet.boats) {
    const notes: string[] = [];
    const log = (m: string) => notes.push(m);
    const cards = buildCards(boat, log);

    const result = await db.transaction(async (tx) => {
      // 1. upsert boat by slug
      const [existing] = await tx
        .select({ id: boats.id, name: boats.name })
        .from(boats)
        .where(eq(boats.slug, boat.slug))
        .limit(1);

      let boatId: number;
      let action: string;
      if (existing) {
        boatId = existing.id;
        if (existing.name !== boat.name) {
          await tx.update(boats).set({ name: boat.name }).where(eq(boats.id, boatId));
          action = `updated name "${existing.name}" → "${boat.name}"`;
        } else {
          action = "exists";
        }
      } else {
        const [inserted] = await tx
          .insert(boats)
          .values({ slug: boat.slug, name: boat.name, note: boat.type || null })
          .returning({ id: boats.id });
        boatId = inserted.id;
        action = "inserted";
      }

      // 2. remove only the cards this importer owns
      const deleted = await tx
        .delete(knowledgeCards)
        .where(and(eq(knowledgeCards.boatId, boatId), eq(knowledgeCards.source, SOURCE)))
        .returning({ id: knowledgeCards.id });

      // 3. insert fresh cards
      if (cards.length) {
        await tx.insert(knowledgeCards).values(
          cards.map((c) => ({
            boatId,
            category: c.category,
            title: c.title,
            body: c.body,
            source: SOURCE,
            status: STATUS,
            createdBy: owner.id,
            jobId: null,
          })),
        );
      }
      return { boatId, action, deletedCount: deleted.length };
    });

    perBoat.push({ slug: boat.slug, name: boat.name, boatId: result.boatId, cards: cards.length, action: result.action });
    console.log(
      `  ✓ ${boat.slug.padEnd(50)} boat#${String(result.boatId).padEnd(3)} ${result.action}; replaced ${result.deletedCount} → ${cards.length} cards`,
    );
    for (const n of notes) console.log(`      ⚠ ${n}`);
  }

  /* ---------------- verification ---------------- */
  console.log("\n→ Verification");
  const [{ count: boatCount }] = await db.select({ count: sql<number>`count(*)::int` }).from(boats);
  const [{ count: cardCount }] = await db.select({ count: sql<number>`count(*)::int` }).from(knowledgeCards);
  console.log(`  boats total: ${boatCount}`);
  console.log(`  knowledge_cards total: ${cardCount}`);

  const bySource = await db
    .select({ source: knowledgeCards.source, count: sql<number>`count(*)::int` })
    .from(knowledgeCards)
    .groupBy(knowledgeCards.source)
    .orderBy(knowledgeCards.source);
  console.log(`  by source: ${bySource.map((r) => `${r.source}=${r.count}`).join(", ")}`);

  const rows = await db
    .select({
      slug: boats.slug,
      name: boats.name,
      imported: sql<number>`count(*) filter (where ${knowledgeCards.source} = ${SOURCE})::int`,
      other: sql<number>`count(*) filter (where ${knowledgeCards.source} <> ${SOURCE})::int`,
    })
    .from(boats)
    .leftJoin(knowledgeCards, eq(knowledgeCards.boatId, boats.id))
    .groupBy(boats.id, boats.slug, boats.name)
    .orderBy(asc(boats.slug));

  console.log("\n| slug | name | imported cards (text_dump) | other cards |");
  console.log("|------|------|----------------------------|-------------|");
  for (const r of rows) console.log(`| ${r.slug} | ${r.name} | ${r.imported} | ${r.other} |`);

  const demo = rows.find((r) => r.slug === "demo-yacht");
  if (demo) console.log(`\n  demo-yacht: ${demo.other} non-imported card(s) untouched, ${demo.imported} imported`);

  const importedTotal = perBoat.reduce((n, b) => n + b.cards, 0);
  console.log(`\n✓ Import complete: ${perBoat.length} boats, ${importedTotal} imported cards`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
