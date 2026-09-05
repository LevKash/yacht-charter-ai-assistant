import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";
import { isLlmConfigured } from "@/lib/config";
import { copy } from "@/lib/copy";
import { AdminNav } from "./AdminNav";

export const dynamic = "force-dynamic";

/** Authenticated admin shell: top bar (desktop) + bottom tabs (mobile). */
export default async function AdminAppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  return (
    <div className="min-h-dvh pb-20 sm:pb-8">
      <AdminNav user={user} />
      {!isLlmConfigured() && (
        <div className="mx-auto mt-4 max-w-5xl px-4">
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span className="text-lg leading-none">⚡</span>
            <p>{copy.admin.aiDisabled}</p>
          </div>
        </div>
      )}
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
