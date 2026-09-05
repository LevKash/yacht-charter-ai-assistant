import { asc } from "drizzle-orm";
import { db } from "@/db";
import { boats } from "@/db/schema";
import { isLlmConfigured, isSttConfigured } from "@/lib/config";
import { ImportClient } from "./ImportClient";

export const dynamic = "force-dynamic";

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ boat?: string }> }) {
  const { boat } = await searchParams;
  const allBoats = await db.select({ id: boats.id, name: boats.name, slug: boats.slug }).from(boats).orderBy(asc(boats.name));
  const preselected = boat ? Number(boat) : null;
  return (
    <ImportClient
      boats={allBoats}
      initialBoatId={preselected && allBoats.some((b) => b.id === preselected) ? preselected : allBoats[0]?.id ?? null}
      sttEnabled={isSttConfigured()}
      aiEnabled={isLlmConfigured()}
    />
  );
}
