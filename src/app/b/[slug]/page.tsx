import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { boats } from "@/db/schema";
import { copy } from "@/lib/copy";
import { getSettings } from "@/lib/settings";
import { GuestChat } from "./GuestChat";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const [boat] = await db.select({ name: boats.name }).from(boats).where(eq(boats.slug, slug.toLowerCase())).limit(1);
  return { title: boat ? `${boat.name} — Boat Assistant` : "Boat Assistant" };
}

export default async function GuestBoatPage({ params }: Props) {
  const { slug } = await params;
  const [boat] = await db.select().from(boats).where(eq(boats.slug, slug.toLowerCase())).limit(1);
  const settings = await getSettings();

  if (!boat) {
    return (
      <main className="grid min-h-dvh place-items-center bg-gradient-to-b from-brand-50 to-white px-6">
        <div className="max-w-sm text-center">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-white text-3xl shadow-card">⛵</div>
          <h1 className="text-xl font-semibold text-slate-900">{copy.guest.notFoundTitle}</h1>
          <p className="mt-2 text-sm text-slate-500">{copy.guest.notFoundBody}</p>
        </div>
      </main>
    );
  }

  return <GuestChat slug={boat.slug} boatName={boat.name} companyName={settings.companyName} />;
}
