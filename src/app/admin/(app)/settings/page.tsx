import { asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { boats, invites, users, whatsappBindings } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { env, isLlmConfigured, isSttConfigured, isWhatsappConfigured } from "@/lib/config";
import { getSettings } from "@/lib/settings";
import { SettingsClient } from "./SettingsClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const me = await requireUser();
  const [current, people, openInvites, bindings] = await Promise.all([
    getSettings(),
    db.select({ id: users.id, email: users.email, name: users.name, role: users.role, createdAt: users.createdAt }).from(users).orderBy(asc(users.createdAt)),
    db.select({ id: invites.id, email: invites.email, token: invites.token, createdAt: invites.createdAt }).from(invites).where(isNull(invites.usedAt)).orderBy(desc(invites.createdAt)),
    db
      .select({ id: whatsappBindings.id, groupId: whatsappBindings.groupId, active: whatsappBindings.active, boatName: boats.name, updatedAt: whatsappBindings.updatedAt })
      .from(whatsappBindings)
      .leftJoin(boats, eq(whatsappBindings.boatId, boats.id))
      .orderBy(desc(whatsappBindings.updatedAt)),
  ]);

  return (
    <SettingsClient
      me={me}
      settings={{ companyName: current.companyName, fallbackContact: current.fallbackContact, defaultLanguage: current.defaultLanguage, llmModel: current.llmModel ?? "" }}
      envModel={env.llmModel}
      people={people.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() }))}
      invites={openInvites.map((i) => ({ ...i, createdAt: i.createdAt.toISOString() }))}
      bindings={bindings.map((b) => ({ ...b, updatedAt: b.updatedAt.toISOString() }))}
      status={{ ai: isLlmConfigured(), stt: isSttConfigured(), whatsapp: isWhatsappConfigured(), botName: env.whatsappBotName }}
    />
  );
}
