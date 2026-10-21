import { boolean, integer, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import type { Audience } from "./store";

// Design §4: the dashboard's only database. Articles, keywords, photos and schedules stay in Quantum1st's engine.
const at = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/** Webhook deliveries already handled, by X-Event-Id (kept 30 days). */
export const webhookEvents = pgTable("webhook_events", {
  id: text("id").primaryKey(),
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
  eventId: text("event_id").primaryKey(),
  kind: text("kind").notNull(),
  audience: text("audience").$type<Audience>().notNull(),
  data: jsonb("data").$type<Record<string, unknown>>().notNull(),
  createdAt: at("created_at").notNull(),
  sentAt: at("sent_at"),
  recipients: jsonb("recipients").$type<string[]>(),
});

/** Who got which notification: a retried batch emails each person only what they haven't had (no one gets it twice). */
export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    eventId: text("event_id").notNull(),
    email: text("email").notNull(),
    sentAt: at("sent_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.eventId, table.email] })],
);

/** Each person's choice: notification emails are on unless they turned them off. */
export const notificationPrefs = pgTable("notification_prefs", {
  userId: text("user_id").primaryKey(),
  emailOff: boolean("email_off").notNull(),
  updatedAt: at("updated_at").notNull(),
});
