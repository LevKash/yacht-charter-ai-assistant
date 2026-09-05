"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SessionUser } from "@/lib/auth";
import { copy } from "@/lib/copy";
import { cx } from "@/lib/utils";
import { logoutAction } from "../actions";

const items = [
  { href: "/admin/boats", label: copy.admin.nav.boats, icon: "⛵" },
  { href: "/admin/import", label: copy.admin.nav.import, icon: "✨" },
  { href: "/admin/settings", label: copy.admin.nav.settings, icon: "⚙️" },
];

export function AdminNav({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <>
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
          <Link href="/admin/boats" className="flex items-center gap-2 font-semibold text-slate-900">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand-600 text-white">⛵</span>
            <span className="hidden sm:inline">{copy.brand}</span>
            <span className="hidden text-slate-400 sm:inline">· Assistant</span>
          </Link>
          <nav className="hidden items-center gap-1 sm:flex">
            {items.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                className={cx(
                  "rounded-xl px-3.5 py-2 text-sm font-medium transition",
                  isActive(it.href) ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100",
                )}
              >
                {it.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2 text-sm">
            <span className="hidden max-w-[160px] truncate text-slate-500 md:inline" title={user.email}>
              {user.name || user.email}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium capitalize text-slate-600">{user.role}</span>
            <form action={logoutAction}>
              <button className="rounded-xl px-2.5 py-1.5 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-800">{copy.admin.nav.signOut}</button>
            </form>
          </div>
        </div>
      </header>

      {/* Bottom tabs (mobile) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
        {items.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            className={cx("flex flex-col items-center gap-0.5 py-2 text-xs font-medium", isActive(it.href) ? "text-brand-700" : "text-slate-500")}
          >
            <span className="text-lg leading-none">{it.icon}</span>
            {it.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
