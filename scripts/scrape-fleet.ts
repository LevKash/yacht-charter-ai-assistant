/**
 * Fleet scraper: downloads https://www.baxyachting.com/fleet, follows every
 * boat page and extracts specifications, feature icons and the full equipment
 * list into scripts/data/fleet.json.
 *
 *   npx tsx scripts/scrape-fleet.ts
 *
 * Plain GET + HTML parsing — no browser, no third-party parser. The site is a
 * uniform template (validated 05 Sep 2026), so the extraction is deliberately
 * strict: if anything looks structurally wrong the script exits non-zero
 * without writing the JSON file (never fabricate boat data).
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE_URL = "https://www.baxyachting.com";
const FLEET_URL = `${BASE_URL}/fleet`;
const OUTPUT_FILE = path.join("scripts", "data", "fleet.json");
const EXPECTED_BOATS = 17;
const MIN_SECTIONS = 10;
const MAX_SECTIONS = 14;
const USER_AGENT = "Mozilla/5.0 (compatible; BaxFleetScraper/1.0; +https://www.baxyachting.com)";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type Spec = { label: string; value: string };
export type EquipmentSection = { section: string; items: string[] };
export type FleetBoat = {
  slug: string;
  name: string;
  pageTitle: string;
  type: string;
  url: string;
  specs: Spec[];
  features: string[];
  equipment: EquipmentSection[];
};
export type FleetFile = {
  scrapedAt: string;
  source: string;
  /** Slugs explicitly allowed through with < MIN_SECTIONS equipment sections (source page is incomplete). */
  incompleteSourcePages: string[];
  boats: FleetBoat[];
};

/**
 * `--allow-incomplete=slug-a,slug-b` — opt-in per boat: the page was checked by
 * hand and really contains fewer than MIN_SECTIONS equipment sections. The boat
 * is then kept with exactly what the site shows (nothing is invented) and the
 * exception is recorded in fleet.json and the final report.
 */
function parseAllowIncomplete(argv: string[]): Set<string> {
  const out = new Set<string>();
  for (const a of argv) {
    const m = /^--allow-incomplete=(.+)$/.exec(a);
    if (m) m[1].split(",").map((s) => s.trim()).filter(Boolean).forEach((s) => out.add(s));
  }
  return out;
}

class ScrapeError extends Error {}

/* ------------------------------------------------------------------ */
/* HTTP                                                                */
/* ------------------------------------------------------------------ */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchHtml(url: string, attempts = 3): Promise<string> {
  let lastError: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: { "user-agent": USER_AGENT, accept: "text/html" },
        redirect: "follow",
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new ScrapeError(`HTTP ${res.status} for ${url}`);
      const html = await res.text();
      if (html.length < 1000) throw new ScrapeError(`Suspiciously short response (${html.length} bytes) for ${url}`);
      return html;
    } catch (err) {
      lastError = err;
      if (i < attempts) await sleep(1000 * i);
    }
  }
  throw new ScrapeError(`Failed to download ${url} after ${attempts} attempts: ${String(lastError)}`);
}

/* ------------------------------------------------------------------ */
/* Minimal HTML helpers                                                */
/* ------------------------------------------------------------------ */

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  copy: "©",
  deg: "°",
  times: "×",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  eacute: "é",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

/** Strip tags, decode entities, normalise whitespace, trim. Content itself is left verbatim. */
function text(fragment: string): string {
  return decodeEntities(fragment.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Returns the inner HTML of the element whose opening tag contains `marker`
 * (e.g. `class="cell yacht-spec"` or `id="equipmentlist"`), starting the search
 * at `from`. Matching is done by counting nested <div> / </div> tags, which is
 * enough for this template (all containers we care about are divs).
 */
function divBlock(html: string, marker: string | RegExp, from = 0): { inner: string; end: number } | null {
  const re = typeof marker === "string" ? new RegExp(escapeRe(marker)) : marker;
  const slice = html.slice(from);
  const m = re.exec(slice);
  if (!m) return null;
  const markerPos = from + m.index;
  const openStart = html.lastIndexOf("<div", markerPos);
  if (openStart === -1) return null;
  const openEnd = html.indexOf(">", markerPos);
  if (openEnd === -1) return null;

  const tagRe = /<div\b|<\/div\s*>/gi;
  tagRe.lastIndex = openEnd + 1;
  let depth = 1;
  let t: RegExpExecArray | null;
  while ((t = tagRe.exec(html))) {
    depth += t[0].toLowerCase().startsWith("</") ? -1 : 1;
    if (depth === 0) {
      return { inner: html.slice(openEnd + 1, t.index), end: t.index + t[0].length };
    }
  }
  return null;
}

function allDivBlocks(html: string, marker: string): string[] {
  const out: string[] = [];
  let pos = 0;
  for (;;) {
    const b = divBlock(html, marker, pos);
    if (!b) break;
    out.push(b.inner);
    pos = b.end;
  }
  return out;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* ------------------------------------------------------------------ */
/* Fleet index                                                         */
/* ------------------------------------------------------------------ */

export function parseFleetIndex(html: string): string[] {
  const urls = new Set<string>();
  const re = /href\s*=\s*["']((?:https?:\/\/(?:www\.)?baxyachting\.com)?\/fleet\/([^"'#?\s]+))["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const slug = m[2].replace(/\/+$/, "");
    if (!slug || slug.includes("/")) continue;
    urls.add(`${BASE_URL}/fleet/${slug}`);
  }
  return [...urls].sort();
}

/* ------------------------------------------------------------------ */
/* Boat page                                                           */
/* ------------------------------------------------------------------ */

const LOCATION_SUFFIX = /\s+for\s+charter(?:\s+in\s+[A-Za-z][A-Za-z\s]*)?\s*$/i;

export function parseBoatPage(html: string, url: string): FleetBoat {
  const slug = url.slice(url.lastIndexOf("/") + 1);

  const intro = divBlock(html, 'id="yacht-intro"');
  if (!intro) throw new ScrapeError(`${slug}: div#yacht-intro not found`);

  const typeBlock = divBlock(intro.inner, /class="[^"]*\byt--intro--type\b[^"]*"/);
  const type = typeBlock ? text(typeBlock.inner) : "";

  const titleBlock = divBlock(intro.inner, /class="[^"]*\byt--intro--title\b[^"]*"/);
  const h1 = titleBlock ? /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(titleBlock.inner) : null;
  const pageTitle = h1 ? text(h1[1]) : "";
  const name = pageTitle.replace(LOCATION_SUFFIX, "").trim();
  if (!name) throw new ScrapeError(`${slug}: could not read the boat name (h1 in .yt--intro--title)`);

  // (b) specs
  const specsBlock = divBlock(html, /class="[^"]*\byacht-specs\b[^"]*"/);
  if (!specsBlock) throw new ScrapeError(`${slug}: div.yacht-specs not found`);
  const specs: Spec[] = [];
  for (const cell of allDivBlocks(specsBlock.inner, 'class="cell yacht-spec"')) {
    const span = /<span[^>]*>([\s\S]*?)<\/span>/i.exec(cell);
    if (!span) continue;
    const value = text(cell.slice(0, span.index));
    const label = text(span[1]);
    if (!value || !label) continue; // known empty placeholder cell
    specs.push({ label, value });
  }

  // (c) feature icons
  const features: string[] = [];
  const iconsBlock = divBlock(html, /class="[^"]*\byacht-icons-container\b[^"]*"/);
  if (iconsBlock) {
    for (const item of allDivBlocks(iconsBlock.inner, 'class="cell intro-icons-item"')) {
      const title = divBlock(item, 'class="intro-icon-title"');
      const t = title ? text(title.inner) : "";
      if (t) features.push(t);
    }
  }

  // (d) equipment list (modal content is inline in the same HTML)
  const eqBlock = divBlock(html, 'id="equipmentlist"');
  if (!eqBlock) throw new ScrapeError(`${slug}: #equipmentlist modal not found in page HTML`);
  const equipment: EquipmentSection[] = [];
  for (const item of allDivBlocks(eqBlock.inner, 'class="el--item"')) {
    const titleM = /<span[^>]*class="[^"]*\bel--title\b[^"]*"[^>]*>([\s\S]*?)<\/span>/i.exec(item);
    const section = titleM ? text(titleM[1]) : "";
    if (!section) throw new ScrapeError(`${slug}: an .el--item without .el--title was found`);
    const items: string[] = [];
    const liRe = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
    let li: RegExpExecArray | null;
    while ((li = liRe.exec(item))) {
      const t = text(li[1]);
      if (t) items.push(t);
    }
    equipment.push({ section, items });
  }

  return { slug, name, pageTitle, type, url, specs, features, equipment };
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

function validate(boats: FleetBoat[], allowIncomplete: Set<string>): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const slug of allowIncomplete) {
    if (!boats.some((b) => b.slug === slug)) warnings.push(`--allow-incomplete lists unknown slug "${slug}"`);
  }

  if (boats.length !== EXPECTED_BOATS) errors.push(`expected ${EXPECTED_BOATS} boats, got ${boats.length}`);

  const seen = new Set<string>();
  for (const b of boats) {
    if (!b.slug) errors.push(`boat with empty slug (${b.url})`);
    if (!b.name) errors.push(`${b.slug}: empty name`);
    if (seen.has(b.slug)) errors.push(`duplicate slug ${b.slug}`);
    seen.add(b.slug);
    if (!b.type) warnings.push(`${b.slug}: no boat type found (.yt--intro--type)`);
    if (b.specs.length < 1) errors.push(`${b.slug}: no specifications parsed`);
    if (b.equipment.length < MIN_SECTIONS) {
      const msg = `${b.slug}: only ${b.equipment.length} equipment sections (< ${MIN_SECTIONS})`;
      if (allowIncomplete.has(b.slug)) {
        warnings.push(`${msg} — INCLUDED AS-IS via --allow-incomplete (source page is incomplete)`);
      } else {
        errors.push(
          `${msg} — page structure may have changed. Inspect the page; if it really has that few sections, re-run with --allow-incomplete=${b.slug}`,
        );
      }
    } else if (b.equipment.length > MAX_SECTIONS) {
      warnings.push(`${b.slug}: ${b.equipment.length} equipment sections (> ${MAX_SECTIONS} expected max)`);
    }
    for (const s of b.equipment) {
      if (s.items.length === 0) warnings.push(`${b.slug}: section "${s.section}" has zero items`);
    }
    if (b.features.length === 0) warnings.push(`${b.slug}: no feature icons`);
  }
  return { errors, warnings };
}

function summaryTable(boats: FleetBoat[]): string {
  const rows = boats.map((b) => [
    b.slug,
    b.name,
    b.type,
    String(b.specs.length),
    String(b.equipment.length),
    String(b.equipment.reduce((n, s) => n + s.items.length, 0)),
  ]);
  const header = ["slug", "name", "type", "specs", "sections", "total items"];
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (r: string[]) => "| " + r.map((c, i) => c.padEnd(widths[i])).join(" | ") + " |";
  const sep = "|" + widths.map((w) => "-".repeat(w + 2)).join("|") + "|";
  return [line(header), sep, ...rows.map(line)].join("\n");
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

async function main() {
  const allowIncomplete = parseAllowIncomplete(process.argv.slice(2));
  if (allowIncomplete.size) console.log(`ℹ allow-incomplete: ${[...allowIncomplete].join(", ")}`);
  console.log(`→ Downloading fleet index ${FLEET_URL}`);
  const indexHtml = await fetchHtml(FLEET_URL);
  const urls = parseFleetIndex(indexHtml);
  console.log(`  found ${urls.length} distinct boat URLs`);
  if (urls.length < EXPECTED_BOATS) {
    throw new ScrapeError(
      `Only ${urls.length} boat URLs found on the fleet page (expected ${EXPECTED_BOATS}). Stopping.\n` + urls.join("\n"),
    );
  }

  const boats: FleetBoat[] = [];
  for (const url of urls) {
    process.stdout.write(`→ ${url} … `);
    const html = await fetchHtml(url);
    const boat = parseBoatPage(html, url);
    console.log(
      `${boat.name} [${boat.type}] specs=${boat.specs.length} features=${boat.features.length} sections=${boat.equipment.length}`,
    );
    boats.push(boat);
    await sleep(400); // be polite to the site
  }

  const { errors, warnings } = validate(boats, allowIncomplete);
  for (const w of warnings) console.warn(`  ⚠ ${w}`);
  if (errors.length) {
    console.error("\n✗ Validation failed — fleet.json NOT written:");
    for (const e of errors) console.error(`  • ${e}`);
    process.exit(1);
  }

  const out: FleetFile = {
    scrapedAt: new Date().toISOString(),
    source: FLEET_URL,
    incompleteSourcePages: boats.filter((b) => b.equipment.length < MIN_SECTIONS).map((b) => b.slug),
    boats,
  };
  await mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  await writeFile(OUTPUT_FILE, JSON.stringify(out, null, 2) + "\n", "utf8");

  const totalItems = boats.reduce((n, b) => n + b.equipment.reduce((m, s) => m + s.items.length, 0), 0);
  console.log(`\n✓ Wrote ${OUTPUT_FILE}: ${boats.length} boats, ${totalItems} equipment items\n`);
  console.log(summaryTable(boats));
  if (warnings.length) console.log(`\n${warnings.length} warning(s) listed above.`);
}

const isDirectRun = process.argv[1] && /scrape-fleet\.(ts|js|mts|mjs)$/.test(process.argv[1]);
if (isDirectRun) {
  main().catch((err) => {
    console.error(err instanceof ScrapeError ? `✗ ${err.message}` : err);
    process.exit(1);
  });
}
