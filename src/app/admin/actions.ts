"use server";

import { randomBytes } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { boats, importJobs, invites, knowledgeCards, settings, users, whatsappBindings, type CardSource } from "@/db/schema";
import { createSession, destroySession, ensureOwner, getCurrentUser, hashPassword, requireOwner, requireUser, verifyPassword } from "@/lib/auth";
import { normalizeCategory } from "@/lib/categories";
import { createDemoBoat } from "@/lib/demo";
import { slugify } from "@/lib/utils";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

const ok = <T,>(data: T): ActionResult<T> => ({ ok: true, data });
const fail = <T = undefined,>(error: string): ActionResult<T> => ({ ok: false, error });

/* ------------------------------------------------------------------ */
/* Auth                                                                */
/* ------------------------------------------------------------------ */

export async function loginAction(_: unknown, formData: FormData): Promise<{ error?: string }> {
  await ensureOwner();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Please enter your email and password." };
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || !verifyPassword(password, user.passwordHash)) return { error: "Email or password is not right." };
  await createSession(user.id);
  redirect("/admin/boats");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/admin/login");
}

export async function changePasswordAction(current: string, next: string): Promise<ActionResult> {
  const me = await requireUser();
  if (next.length < 8) return fail("New password must be at least 8 characters.");
  const [user] = await db.select().from(users).where(eq(users.id, me.id)).limit(1);
  if (!user || !verifyPassword(current, user.passwordHash)) return fail("Current password is not right.");
  await db.update(users).set({ passwordHash: hashPassword(next) }).where(eq(users.id, me.id));
  return ok(undefined);
}

/* ------------------------------------------------------------------ */
/* Boats                                                               */
/* ------------------------------------------------------------------ */

export async function createBoatAction(input: { name: string; slug?: string; note?: string }): Promise<ActionResult<{ id: number }>> {
  await requireUser();
  const name = input.name.trim();
  if (!name) return fail("Please give the boat a name.");
  const slug = slugify(input.slug?.trim() || name);
  if (!slug) return fail("The short link name can only contain letters and numbers.");
  const [existing] = await db.select({ id: boats.id }).from(boats).where(eq(boats.slug, slug)).limit(1);
  if (existing) return fail(`The link name "${slug}" is already used by another boat.`);
  const [boat] = await db.insert(boats).values({ name, slug, note: input.note?.trim() || null }).returning({ id: boats.id });
  revalidatePath("/admin");
  return ok({ id: boat.id });
}

export async function updateBoatAction(id: number, input: { name: string; slug: string; note?: string }): Promise<ActionResult> {
  await requireUser();
  const name = input.name.trim();
  const slug = slugify(input.slug);
  if (!name || !slug) return fail("Name and link name are required.");
  const [clash] = await db.select({ id: boats.id }).from(boats).where(and(eq(boats.slug, slug), ne(boats.id, id))).limit(1);
  if (clash) return fail(`The link name "${slug}" is already used by another boat.`);
  await db.update(boats).set({ name, slug, note: input.note?.trim() || null }).where(eq(boats.id, id));
  revalidatePath("/admin");
  return ok(undefined);
}

export async function deleteBoatAction(id: number, confirmName: string): Promise<ActionResult> {
  await requireUser();
  const [boat] = await db.select().from(boats).where(eq(boats.id, id)).limit(1);
  if (!boat) return fail("Boat not found.");
  if (confirmName.trim().toLowerCase() !== boat.name.trim().toLowerCase()) return fail("The name you typed doesn't match.");
  await db.delete(boats).where(eq(boats.id, id));
  revalidatePath("/admin");
  return ok(undefined);
}

export async function createDemoBoatAction(): Promise<ActionResult<{ id: number }>> {
  const me = await requireUser();
  const id = await createDemoBoat(me.id);
  revalidatePath("/admin");
  return ok({ id });
}

/* ------------------------------------------------------------------ */
/* Knowledge cards                                                     */
/* ------------------------------------------------------------------ */

type CardInput = { title: string; category: string; body: string; status?: "draft" | "saved" };

type CleanCard = { title: string; body: string; category: string; status: "draft" | "saved" };

function cleanCard(input: CardInput): CleanCard | { error: string } {
  const title = input.title.trim().slice(0, 120);
  const body = input.body.trim().slice(0, 8000);
  if (!title) return { error: "Please add a short title." };
  if (!body) return { error: "Please add the actual information in the text field." };
  return { title, body, category: normalizeCategory(input.category) || "General", status: input.status ?? "saved" };
}

export async function createCardAction(boatId: number, input: CardInput): Promise<ActionResult<{ id: number }>> {
  const me = await requireUser();
  const c = cleanCard(input);
  if ("error" in c) return fail(c.error);
  const [row] = await db
    .insert(knowledgeCards)
    .values({ boatId, title: c.title, body: c.body, category: c.category, status: c.status, source: "manual", createdBy: me.id })
    .returning({ id: knowledgeCards.id });
  revalidatePath(`/admin/boats/${boatId}`);
  return ok({ id: row.id });
}

export async function updateCardAction(id: number, input: CardInput): Promise<ActionResult> {
  await requireUser();
  const c = cleanCard(input);
  if ("error" in c) return fail(c.error);
  const [row] = await db
    .update(knowledgeCards)
    .set({ title: c.title, body: c.body, category: c.category, status: c.status, updatedAt: new Date() })
    .where(eq(knowledgeCards.id, id))
    .returning({ boatId: knowledgeCards.boatId });
  if (row) revalidatePath(`/admin/boats/${row.boatId}`);
  return ok(undefined);
}

export async function deleteCardAction(id: number): Promise<ActionResult> {
  await requireUser();
  const [row] = await db.delete(knowledgeCards).where(eq(knowledgeCards.id, id)).returning({ boatId: knowledgeCards.boatId });
  if (row) revalidatePath(`/admin/boats/${row.boatId}`);
  return ok(undefined);
}

/** Review screen → persist confirmed cards. Only this step turns an import into knowledge. */
export async function saveProposedCardsAction(input: {
  boatId: number;
  jobId: number | null;
  source: CardSource;
  status: "draft" | "saved";
  cards: Array<{ title: string; category: string; body: string }>;
}): Promise<ActionResult<{ count: number }>> {
  const me = await requireUser();
  const [boat] = await db.select({ id: boats.id }).from(boats).where(eq(boats.id, input.boatId)).limit(1);
  if (!boat) return fail("Please choose which boat this knowledge belongs to.");
  const rows = input.cards
    .map((c) => cleanCard({ ...c, status: input.status }))
    .filter((c): c is CleanCard => !("error" in c));
  if (rows.length === 0) return fail("There are no complete cards to save (each needs a title and text).");
  await db.insert(knowledgeCards).values(
    rows.map((c) => ({ boatId: input.boatId, title: c.title, body: c.body, category: c.category, status: c.status, source: input.source, jobId: input.jobId, createdBy: me.id })),
  );
  if (input.jobId) {
    await db.update(importJobs).set({ status: "done", savedCount: rows.length, boatId: input.boatId }).where(eq(importJobs.id, input.jobId));
  }
  revalidatePath(`/admin/boats/${input.boatId}`);
  revalidatePath("/admin/boats");
  return ok({ count: rows.length });
}

/* ------------------------------------------------------------------ */
/* People (owner only)                                                 */
/* ------------------------------------------------------------------ */

export async function createInviteAction(email: string): Promise<ActionResult<{ token: string }>> {
  const me = await requireOwner();
  const clean = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return fail("Please enter a valid email address.");
  const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.email, clean)).limit(1);
  if (exists) return fail("This person already has an account.");
  const token = randomBytes(24).toString("base64url");
  await db.insert(invites).values({ email: clean, token, createdBy: me.id });
  revalidatePath("/admin/settings");
  return ok({ token });
}

export async function revokeInviteAction(id: number): Promise<ActionResult> {
  await requireOwner();
  await db.delete(invites).where(eq(invites.id, id));
  revalidatePath("/admin/settings");
  return ok(undefined);
}

export async function removeMemberAction(userId: number): Promise<ActionResult> {
  const me = await requireOwner();
  if (userId === me.id) return fail("You can't remove yourself.");
  const [target] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  if (!target) return fail("User not found.");
  if (target.role === "owner") return fail("The owner account can't be removed.");
  await db.delete(users).where(eq(users.id, userId));
  revalidatePath("/admin/settings");
  return ok(undefined);
}

/** Public: invited person sets a password and becomes a member. */
export async function acceptInviteAction(token: string, name: string, password: string): Promise<ActionResult> {
  const [invite] = await db.select().from(invites).where(eq(invites.token, token)).limit(1);
  if (!invite || invite.usedAt) return fail("This invite link is no longer valid.");
  if (password.length < 8) return fail("Password must be at least 8 characters.");
  const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.email, invite.email)).limit(1);
  if (exists) return fail("An account with this email already exists — just sign in.");
  const [user] = await db
    .insert(users)
    .values({ email: invite.email, name: name.trim() || null, passwordHash: hashPassword(password), role: "member" })
    .returning({ id: users.id });
  await db.update(invites).set({ usedAt: new Date() }).where(eq(invites.id, invite.id));
  await createSession(user.id);
  return ok(undefined);
}

/* ------------------------------------------------------------------ */
/* Settings & WhatsApp (owner only)                                    */
/* ------------------------------------------------------------------ */

export async function updateSettingsAction(input: { companyName: string; fallbackContact: string; defaultLanguage: string; llmModel: string }): Promise<ActionResult> {
  await requireOwner();
  const companyName = input.companyName.trim() || "Bax Yachting";
  const fallbackContact = input.fallbackContact.trim();
  if (!fallbackContact) return fail("Please add a fallback contact line — guests see it when the assistant doesn't know.");
  await db
    .insert(settings)
    .values({ id: 1, companyName, fallbackContact, defaultLanguage: input.defaultLanguage.trim() || "en", llmModel: input.llmModel.trim() || null })
    .onConflictDoUpdate({
      target: settings.id,
      set: { companyName, fallbackContact, defaultLanguage: input.defaultLanguage.trim() || "en", llmModel: input.llmModel.trim() || null, updatedAt: new Date() },
    });
  revalidatePath("/admin");
  return ok(undefined);
}

export async function removeWhatsappBindingAction(id: number): Promise<ActionResult> {
  await requireOwner();
  await db.delete(whatsappBindings).where(eq(whatsappBindings.id, id));
  revalidatePath("/admin/settings");
  return ok(undefined);
}

export async function toggleWhatsappBindingAction(id: number, active: boolean): Promise<ActionResult> {
  await requireOwner();
  await db.update(whatsappBindings).set({ active, updatedAt: new Date() }).where(eq(whatsappBindings.id, id));
  revalidatePath("/admin/settings");
  return ok(undefined);
}

/** Small helper for client components that need to know who is signed in. */
export async function whoAmIAction() {
  return getCurrentUser();
}
