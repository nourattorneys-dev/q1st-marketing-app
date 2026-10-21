import { and, desc, eq, inArray, isNotNull, isNull, lt } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";
import type { AppStore, StoredNotification, WebhookConfig } from "./store";

export type Db = NeonHttpDatabase<typeof schema>;
const WEBHOOK_ROW = 1;
const { webhookEvents, webhookConfig, notifications, notificationPrefs } = schema;

/** The queries, kept apart from running them so tests can read the SQL they make (no database runs locally). */
export const queries = {
  hasEvent: (db: Db, id: string) => db.select({ id: webhookEvents.id }).from(webhookEvents).where(eq(webhookEvents.id, id)).limit(1),
  insertNotification: (db: Db, item: StoredNotification) =>
    db
      .insert(notifications)
      .values({ eventId: item.eventId, kind: item.kind, audience: item.audience, data: item.data, createdAt: item.createdAt })
      .onConflictDoNothing(),
  insertEvent: (db: Db, event: { id: string; event: string; receivedAt: Date }) => db.insert(webhookEvents).values(event).onConflictDoNothing(),
  lastEventAt: (db: Db) => db.select({ at: webhookEvents.receivedAt }).from(webhookEvents).orderBy(desc(webhookEvents.receivedAt)).limit(1),
  webhook: (db: Db) => db.select().from(webhookConfig).where(eq(webhookConfig.id, WEBHOOK_ROW)).limit(1),
  saveWebhook: (db: Db, config: WebhookConfig) =>
    db
      .insert(webhookConfig)
      .values({ id: WEBHOOK_ROW, ...config })
      .onConflictDoUpdate({ target: webhookConfig.id, set: { url: config.url, secretCipher: config.secretCipher, updatedAt: config.updatedAt } }),
  pending: (db: Db) => db.select().from(notifications).where(isNull(notifications.sentAt)).orderBy(notifications.createdAt),
  markSent: (db: Db, eventIds: string[], recipients: string[], at: Date) =>
    db
      .update(notifications)
      .set({ sentAt: at, recipients })
      .where(and(inArray(notifications.eventId, eventIds), isNull(notifications.sentAt))),
  forgetEvents: (db: Db, cutoff: Date) => db.delete(webhookEvents).where(lt(webhookEvents.receivedAt, cutoff)),
  forgetSent: (db: Db, cutoff: Date) => db.delete(notifications).where(and(isNotNull(notifications.sentAt), lt(notifications.sentAt, cutoff))),
  emailOffUsers: (db: Db) => db.select({ userId: notificationPrefs.userId }).from(notificationPrefs).where(eq(notificationPrefs.emailOff, true)),
  setEmailOff: (db: Db, userId: string, off: boolean, at: Date) =>
    db
      .insert(notificationPrefs)
      .values({ userId, emailOff: off, updatedAt: at })
      .onConflictDoUpdate({ target: notificationPrefs.userId, set: { emailOff: off, updatedAt: at } }),
};

/** DB_MODE=neon: Neon Postgres over HTTP (design §4, D14). Apply the migrations in ./drizzle first (pnpm db:migrate). */
export function createNeonStore(db: Db): AppStore {
  return {
    async hasEvent(id) {
      return (await queries.hasEvent(db, id)).length > 0;
    },

    async recordEvent(event, notification) {
      // One round trip in one transaction: the notification and the event id land together or not at all.
      if (notification) await db.batch([queries.insertNotification(db, notification), queries.insertEvent(db, event)]);
      else await queries.insertEvent(db, event);
    },

    async lastEventAt() {
      return (await queries.lastEventAt(db))[0]?.at ?? null;
    },

    async webhook() {
      const row = (await queries.webhook(db))[0];
      return row ? { url: row.url, secretCipher: row.secretCipher, updatedAt: row.updatedAt } : null;
    },

    async saveWebhook(config) {
      await queries.saveWebhook(db, config);
    },

    async pendingNotifications() {
      return (await queries.pending(db)).map((row) => ({
        eventId: row.eventId,
        kind: row.kind,
        audience: row.audience,
        data: row.data,
        createdAt: row.createdAt,
      }));
    },

    async markSent(eventIds, recipients, at) {
      if (eventIds.length > 0) await queries.markSent(db, eventIds, recipients, at);
    },

    async forgetBefore(cutoff) {
      await db.batch([queries.forgetEvents(db, cutoff), queries.forgetSent(db, cutoff)]);
    },

    async emailOffUsers() {
      return new Set((await queries.emailOffUsers(db)).map((row) => row.userId));
    },

    async setEmailOff(userId, off, at) {
      await queries.setEmailOff(db, userId, off, at);
    },
  };
}
