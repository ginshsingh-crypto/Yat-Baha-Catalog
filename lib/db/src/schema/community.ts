import { pgTable, text, timestamp, boolean, integer, uniqueIndex } from "drizzle-orm/pg-core";

export const reports = pgTable("reports", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  description: text("description").notNull(),
  city: text("city").notNull(),
  place: text("place").notNull(),
  date: text("date").notNull(),
  photoId: text("photo_id"),
  status: text("status").notNull().default("open"),
  hidden: boolean("hidden").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("photo_per_report").on(t.photoId)]);

export const photos = pgTable("photos", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  rawPath: text("raw_path").notNull(),
  cleanPath: text("clean_path"),
  rawPurgedAt: timestamp("raw_purged_at", { withTimezone: true }),
  size: integer("size").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const claims = pgTable("claims", {
  id: text("id").primaryKey(),
  reportId: text("report_id").notNull().references(() => reports.id, { onDelete: "cascade" }),
  claimantId: text("claimant_id").notNull(),
  evidence: text("evidence").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("claim_per_user").on(t.reportId, t.claimantId)]);

export const messages = pgTable("claim_messages", {
  id: text("id").primaryKey(),
  claimId: text("claim_id").notNull().references(() => claims.id, { onDelete: "cascade" }),
  senderId: text("sender_id").notNull(),
  body: text("body").notNull(),
  status: text("status").notNull().default("pending"),
  reviewedBy: text("reviewed_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const abuses = pgTable("abuse_reports", {
  id: text("id").primaryKey(),
  reportId: text("report_id").notNull().references(() => reports.id, { onDelete: "cascade" }),
  reporterId: text("reporter_id").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pending"),
  reviewedBy: text("reviewed_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("abuse_per_user").on(t.reportId, t.reporterId)]);

export const moderators = pgTable("moderators", {
  userId: text("user_id").primaryKey(),
});

// Kept after identity deletion so an unexpired session cannot recreate data.
// This contains only the identity provider's opaque user ID and deletion time.
export const accountDeletions = pgTable("account_deletions", {
  userId: text("user_id").primaryKey(),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
});

// A short-lived upload URL may outlive report/account deletion. Retain the
// opaque path until it expires, then remove any raw object recreated with it.
export const photoDeletions = pgTable("photo_deletions", {
  photoId: text("photo_id").primaryKey(),
  rawPath: text("raw_path").notNull(),
  notBefore: timestamp("not_before", { withTimezone: true }).notNull(),
});
