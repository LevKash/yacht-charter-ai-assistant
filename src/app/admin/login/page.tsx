import { redirect } from "next/navigation";
import { DEFAULT_OWNER, ensureOwner, getCurrentUser } from "@/lib/auth";
import { copy } from "@/lib/copy";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const me = await getCurrentUser();
  if (me) redirect("/admin/boats");
  const owner = await ensureOwner();

  return (
    <main className="grid min-h-dvh place-items-center bg-gradient-to-b from-brand-50 via-white to-sand-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-3xl bg-brand-600 text-2xl text-white shadow-soft">⛵</div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{copy.brand}</h1>
          <p className="mt-1 text-sm text-slate-500">Boat assistant · admin</p>
        </div>
        <div className="rounded-3xl bg-white p-6 shadow-card ring-1 ring-slate-100">
          <LoginForm />
        </div>
        {owner.usedDefault && (
          <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-center text-xs text-amber-800 ring-1 ring-amber-100">
            First run: sign in with <b>{owner.email}</b> / <b>{DEFAULT_OWNER.password}</b> and change the password in Settings. Set ADMIN_EMAIL / ADMIN_PASSWORD in your environment to choose your own.
          </p>
        )}
      </div>
    </main>
  );
}
