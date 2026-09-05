import { eq } from "drizzle-orm";
import { db } from "@/db";
import { invites } from "@/db/schema";
import { copy } from "@/lib/copy";
import { InviteForm } from "./InviteForm";

export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [invite] = await db.select().from(invites).where(eq(invites.token, token)).limit(1);
  const valid = Boolean(invite && !invite.usedAt);

  return (
    <main className="grid min-h-dvh place-items-center bg-gradient-to-b from-brand-50 via-white to-sand-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-3xl bg-brand-600 text-2xl text-white shadow-soft">⛵</div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{copy.brand}</h1>
          <p className="mt-1 text-sm text-slate-500">{valid ? "You've been invited to the boat assistant" : "Invite link"}</p>
        </div>
        <div className="rounded-3xl bg-white p-6 shadow-card ring-1 ring-slate-100">
          {valid ? (
            <InviteForm token={token} email={invite.email} />
          ) : (
            <p className="text-center text-sm text-slate-600">This invite link has already been used or is no longer valid. Ask the owner for a new one.</p>
          )}
        </div>
      </div>
    </main>
  );
}
