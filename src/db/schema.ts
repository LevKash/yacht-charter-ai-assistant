import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* Enums                                                               */
/* ------------------------------------------------------------------ */

export const userRoleEnum = pgEnum("user_role", ["owner", "member"]);
export const cardSourceEnum = pgEnum("card_source", [
  "manual",
  "text_dump",
  "voice",
  "whatsapp_export",
]);
export const cardStatusEnum = pgEnum("card_status", ["draft", "saved"]);
export const importKindEnum = pgEnum("import_kind", ["text", "voice", "whatsapp"]);
export const importStatusEnum = pgEnum("import_status", [
  "processing",
  "review",
  "done",
  "cancelled",
  "failed",
]);

/* ------------------------------------------------------------------ */
/* Fleet                                                               */
/* ------------------------------------------------------------------ */

export const boats = pgTable("boats", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* People & auth                                                       */
/* ------------------------------------------------------------------ */

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  passwordHash: text("password_hash").notNull(),
  role: userRoleEnum("role").notNull().default("member"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: serial("id").primaryKey(),
    token: text("token").notNull().unique(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const invites = pgTable("invites", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  token: text("token").notNull().unique(),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});

/* ------------------------------------------------------------------ */
/* Knowledge                                                           */
/* ------------------------------------------------------------------ */

export const importJobs = pgTable("import_jobs", {
  id: serial("id").primaryKey(),
  boatId: integer("boat_id").references(() => boats.id, { onDelete: "set null" }),
  kind: importKindEnum("kind").notNull(),
  rawPreview: text("raw_preview").notNull().default(""),
  status: importStatusEnum("status").notNull().default("processing"),
  proposedCount: integer("proposed_count").notNull().default(0),
  savedCount: integer("saved_count").notNull().default(0),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const knowledgeCards = pgTable(
  "knowledge_cards",
  {
    id: serial("id").primaryKey(),
    boatId: integer("boat_id")
      .notNull()
      .references(() => boats.id, { onDelete: "cascade" }),
    category: text("category").notNull().default("General"),
    title: text("title").notNull(),
    body: text("body").notNull(),
    source: cardSourceEnum("source").notNull().default("manual"),
    status: cardStatusEnum("status").notNull().default("saved"),
    jobId: integer("job_id").references(() => importJobs.id, { onDelete: "set null" }),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("cards_boat_idx").on(t.boatId), index("cards_boat_status_idx").on(t.boatId, t.status)],
);

/* ------------------------------------------------------------------ */
/* Channels                                                            */
/* ------------------------------------------------------------------ */

export const whatsappBindings = pgTable(
  "whatsapp_bindings",
  {
    id: serial("id").primaryKey(),
    groupId: text("group_id").notNull(),
    boatId: integer("boat_id").references(() => boats.id, { onDelete: "cascade" }),
    active: boolean("active").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("whatsapp_group_unique").on(t.groupId)],
);

/* ------------------------------------------------------------------ */
/* Company settings (single row, id = 1)                               */
/* ------------------------------------------------------------------ */

export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  companyName: text("company_name").notNull().default("Bax Yachting"),
  fallbackContact: text("fallback_contact")
    .notNull()
    .default("For urgent help, contact the Bax Yachting base by phone or WhatsApp."),
  defaultLanguage: text("default_language").notNull().default("en"),
  llmModel: text("llm_model"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type Boat = typeof boats.$inferSelect;
export type User = typeof users.$inferSelect;
export type KnowledgeCard = typeof knowledgeCards.$inferSelect;
export type ImportJob = typeof importJobs.$inferSelect;
export type WhatsappBinding = typeof whatsappBindings.$inferSelect;
export type Settings = typeof settings.$inferSelect;
export type CardSource = KnowledgeCard["source"];
export type CardStatus = KnowledgeCard["status"];
