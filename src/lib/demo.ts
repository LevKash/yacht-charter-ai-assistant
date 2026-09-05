import { eq } from "drizzle-orm";
import { db } from "@/db";
import { boats, knowledgeCards } from "@/db/schema";

export const DEMO_SLUG = "demo-yacht";

/** Sample knowledge so every screen can be seen working immediately. */
export const DEMO_CARDS = [
  {
    category: "Fridge",
    title: "Fridge: how to open and keep it cold",
    body: "The fridge is the top-loading box under the galley counter, right of the sink. Lift the lid by the recessed handle — it sticks a little, pull firmly.\n\nIt runs on the house batteries. Keep the lid closed as much as possible; on hot days set the dial to 4 (not max, it will ice up). If it stops cooling, check the 'FRIDGE' breaker on the main panel above the chart table.",
  },
  {
    category: "BBQ",
    title: "Where is the BBQ and how to use it",
    body: "The gas BBQ is stored in the starboard aft locker (the one behind the helm seat). Mount it on the stern rail bracket next to the ladder.\n\nUse the small green gas cartridges from the same locker. Light with the built-in igniter; if it doesn't spark, use the long lighter in the galley drawer. Never use the BBQ while under sail or in a marina berth close to other boats.",
  },
  {
    category: "Anchor",
    title: "Anchor stuck: what to do",
    body: "1. Motor slowly forward directly over the anchor with the chain tight to change the pull angle.\n2. Try a few gentle bursts forward, then let the boat's motion work it loose.\n3. Never force the windlass — it will trip the breaker (located next to the battery switches).\n\nIf it is still stuck after 10 minutes, do not dive on it. Call the base — we will send help.",
  },
  {
    category: "Water",
    title: "Water heater: hot water for showers",
    body: "Hot water comes from the engine (run it 20–30 minutes) or from shore power in a marina (switch on the 'BOILER' breaker on the AC panel).\n\nThe boat has 2 water tanks (300 L each). Switch between them with the valve under the saloon floor hatch. Fill up in every marina — showers use more than you think!",
  },
  {
    category: "Safety",
    title: "Safety: life jackets, fire extinguishers and emergencies",
    body: "Life jackets are under the port saloon seat (8 adult, 2 child). Fire extinguishers: one at the galley, one in the aft cabin, one at the companionway.\n\nIn any emergency (fire, water in the boat, injury, engine failure in bad weather) call the base immediately — the number is on the sticker at the chart table — and use VHF channel 16 if you cannot reach us.",
  },
];

/** Creates the demo boat with sample cards (idempotent). Returns the boat id. */
export async function createDemoBoat(userId: number | null): Promise<number> {
  const [existing] = await db.select({ id: boats.id }).from(boats).where(eq(boats.slug, DEMO_SLUG)).limit(1);
  if (existing) return existing.id;
  const [boat] = await db
    .insert(boats)
    .values({ slug: DEMO_SLUG, name: "Demo Yacht", note: "Example boat — delete it whenever you like." })
    .returning({ id: boats.id });
  await db.insert(knowledgeCards).values(
    DEMO_CARDS.map((c) => ({ ...c, boatId: boat.id, source: "manual" as const, status: "saved" as const, createdBy: userId })),
  );
  return boat.id;
}
