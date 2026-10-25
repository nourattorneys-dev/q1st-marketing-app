import { boolean, datetime, int, json, mysqlTable, primaryKey, text, varchar } from "drizzle-orm/mysql-core";
import type { Audience } from "./store";

// Design §4: the dashboard's only database, the client's MySQL (M5a). Articles, keywords, photos and schedules stay in
// Quantum1st's engine. Times are UTC to the millisecond; keys are varchar(191), the utf8mb4 index limit.
const at = (name: string) => datetime(name, { mode: "date", fsp: 3 });
const key = (name: string) => varchar(name, { length: 191 });

/** Webhook deliveries already handled, by X-Event-Id (kept 30 days). */
export const webhookEvents = mysqlTable("webhook_events", {
  id: key("id").primaryKey(),
  event: text("event").notNull(),
  receivedAt: at("received_at").notNull(),
});

/** The one webhook registration (row id 1): our address and the signing secret, encrypted. */
export const webhookConfig = mysqlTable("webhook_config", {
  id: int("id").primaryKey(),
  url: text("url").notNull(),
  secretCipher: text("secret_cipher").notNull(),
  updatedAt: at("updated_at").notNull(),
});

/** The notification log: one row per delivery that emails someone; sent_at stays null until it goes out. */
export const notifications = mysqlTable("notifications", {
  eventId: key("event_id").primaryKey(),
  kind: varchar("kind", { length: 64 }).notNull(),
  audience: varchar("audience", { length: 64 }).$type<Audience>().notNull(),
  data: json("data").$type<Record<string, unknown>>().notNull(),
  createdAt: at("created_at").notNull(),
  sentAt: at("sent_at"),
  recipients: json("recipients").$type<string[]>(),
});

/** Who got which notification: a retried batch emails each person only what they haven't had (no one gets it twice). */
export const notificationDeliveries = mysqlTable(
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
export const notificationPrefs = mysqlTable("notification_prefs", {
  userId: key("user_id").primaryKey(),
  emailOff: boolean("email_off").notNull(),
  updatedAt: at("updated_at").notNull(),
});
