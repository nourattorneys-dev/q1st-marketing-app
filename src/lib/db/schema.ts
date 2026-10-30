import { boolean, char, index, integer, jsonb, pgTable, primaryKey, text, timestamp, varchar } from "drizzle-orm/pg-core";
import type { Role } from "@/lib/auth/roles";
import type { Audience } from "./store";

// Design §4: the dashboard's only database, its own Postgres. Articles, keywords, photos and schedules stay in
// Quantum1st's engine. Times are stored with their time zone, to the millisecond; keys are varchar(191).
const at = (name: string) => timestamp(name, { mode: "date", precision: 3, withTimezone: true });
const key = (name: string) => varchar(name, { length: 191 });

/** Webhook deliveries already handled, by X-Event-Id (kept 30 days). */
export const webhookEvents = pgTable("webhook_events", {
  id: key("id").primaryKey(),
  event: text("event").notNull(),
  receivedAt: at("received_at").notNull(),
});

/** The one webhook registration (row id 1): our address and the signing secret, encrypted. */
export const webhookConfig = pgTable("webhook_config", {
  id: integer("id").primaryKey(),
  url: text("url").notNull(),
  secretCipher: text("secret_cipher").notNull(),
  updatedAt: at("updated_at").notNull(),
});

/** The notification log: one row per delivery that emails someone; sent_at stays null until it goes out. */
export const notifications = pgTable("notifications", {
  eventId: key("event_id").primaryKey(),
  kind: varchar("kind", { length: 64 }).notNull(),
  audience: varchar("audience", { length: 64 }).$type<Audience>().notNull(),
  data: jsonb("data").$type<Record<string, unknown>>().notNull(),
  createdAt: at("created_at").notNull(),
  sentAt: at("sent_at"),
  recipients: jsonb("recipients").$type<string[]>(),
});

/** Who got which notification: a retried batch emails each person only what they haven't had (no one gets it twice). */
export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    eventId: key("event_id").notNull(),
    // The longest valid address is 254 characters.
    email: varchar("email", { length: 255 }).notNull(),
    sentAt: at("sent_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.eventId, table.email] })],
);

/** Each person's choice: notification emails are on unless they turned them off. */
export const notificationPrefs = pgTable("notification_prefs", {
  userId: key("user_id").primaryKey(),
  emailOff: boolean("email_off").notNull(),
  updatedAt: at("updated_at").notNull(),
});

// M5c: the dashboard's own sign-in. Emails are stored trimmed and lowercased (at most 254 characters, as everywhere);
// tokens only as their sha256 (64 hex characters), so a copy of the database holds no working link or session.

/** Someone who can sign in. role null = No access (the account stays). */
export const users = pgTable("users", {
  id: key("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique("users_email"),
  name: varchar("name", { length: 200 }).notNull(),
  role: varchar("role", { length: 16 }).$type<Role>(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  createdAt: at("created_at").notNull(),
  passwordChangedAt: at("password_changed_at").notNull(),
  lastSignInAt: at("last_sign_in_at"),
});

/** A signed-in browser: the session cookie's hash (30 days). */
export const sessions = pgTable(
  "sessions",
  {
    tokenHash: char("token_hash", { length: 64 }).primaryKey(),
    userId: key("user_id").notNull(),
    createdAt: at("created_at").notNull(),
    expiresAt: at("expires_at").notNull(),
  },
  (table) => [index("sessions_user_id").on(table.userId)],
);

/** At most one pending invitation per email (7 days); deleted when accepted or revoked. */
export const invitations = pgTable("invitations", {
  id: key("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique("invitations_email"),
  role: varchar("role", { length: 16 }).$type<Role>().notNull(),
  tokenHash: char("token_hash", { length: 64 }).notNull().unique("invitations_token_hash"),
  invitedBy: key("invited_by"),
  createdAt: at("created_at").notNull(),
  expiresAt: at("expires_at").notNull(),
});

/** A "Forgot password" link (1 hour); all of someone's are deleted when one is used. */
export const passwordResets = pgTable(
  "password_resets",
  {
    tokenHash: char("token_hash", { length: 64 }).primaryKey(),
    userId: key("user_id").notNull(),
    createdAt: at("created_at").notNull(),
    expiresAt: at("expires_at").notNull(),
  },
  (table) => [index("password_resets_user_id").on(table.userId)],
);

/** Guessing limits: `email:<address>`, `ip:<address>`, `reset:<address>`, `setup:<address>`, each a count in a window. */
export const signInLimits = pgTable("sign_in_limits", {
  key: varchar("key", { length: 300 }).primaryKey(),
  count: integer("count").notNull(),
  windowStart: at("window_start").notNull(),
});
