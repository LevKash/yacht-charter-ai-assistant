import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users, type User } from "@/db/schema";
import { env } from "./config";

export const SESSION_COOKIE = "bax_session";
const SESSION_DAYS = 30;

/* ---------------------------- passwords ---------------------------- */

/** scrypt hash, stored as `salt:hash` (hex). No external dependency needed. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

/* ----------------------------- sessions ---------------------------- */

export async function createSession(userId: number): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({ token, userId, expiresAt });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.token, token));
  jar.delete(SESSION_COOKIE);
}

export type SessionUser = Pick<User, "id" | "email" | "name" | "role">;

/** Returns the signed-in user or null. Safe to call anywhere on the server. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const [row] = await db
    .select({ id: users.id, email: users.email, name: users.name, role: users.role })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.token, token), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return row ?? null;
}

/** For pages/actions: redirect to login when signed out. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  return user;
}

export async function requireOwner(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "owner") redirect("/admin/boats");
  return user;
}

/* --------------------------- bootstrapping ------------------------- */

/**
 * Makes sure an owner account exists. Uses ADMIN_EMAIL / ADMIN_PASSWORD from
 * the environment; if those are missing, falls back to a documented default so
 * the first login always works (the owner changes it in Settings).
 */
export const DEFAULT_OWNER = { email: "owner@baxyachting.com", password: "changeme123" };

export async function ensureOwner(): Promise<{ email: string; usedDefault: boolean }> {
  const [existing] = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.role, "owner")).limit(1);
  if (existing) return { email: existing.email, usedDefault: false };

  const email = (env.adminEmail || DEFAULT_OWNER.email).toLowerCase();
  const password = env.adminPassword || DEFAULT_OWNER.password;
  await db
    .insert(users)
    .values({ email, passwordHash: hashPassword(password), role: "owner", name: "Owner" })
    .onConflictDoNothing();
  return { email, usedDefault: !env.adminEmail || !env.adminPassword };
}
