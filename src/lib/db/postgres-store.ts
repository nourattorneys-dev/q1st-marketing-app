import { and, desc, eq, inArray, isNotNull, isNull, lt } from "drizzle-orm";
import { lockKey, type PostgresConnection, type PostgresDb } from "./postgres";
import * as schema from "./schema";
import type { AppStore, StoredNotification, WebhookConfig } from "./store";

const WEBHOOK_ROW = 1;
const { webhookEvents, webhookConfig, notifications, notificationDeliveries, notificationPrefs } = schema;

/** Key columns are varchar(191) and emails varchar(255): a longer value is refused here, with a plain message. */
export const MAX_KEY_LENGTH = 191;
export const MAX_EMAIL_LENGTH = 255;

function fits(value: string, max: number, what: string): void {
  if (value.length > max) throw new Error(`${what} is longer than ${max} characters, which the database can't keep.`);
}

/** The database, or a transaction on it: both run these queries. */
type Runner = Pick<PostgresDb, "select" | "insert" | "update" | "delete">;

/** The queries, kept apart from running them so tests can read the SQL they make. */
export const queries = {
  hasEvent: (db: Runner, id: string) => db.select({ id: webhookEvents.id }).from(webhookEvents).where(eq(webhookEvents.id, id)).limit(1),
  insertNotification: (db: Runner, item: StoredNotification) =>
    db
      .insert(notifications)
      .values({ eventId: item.eventId, kind: item.kind, audience: item.audience, data: item.data, createdAt: item.createdAt })
      .onConflictDoNothing(),
  insertEvent: (db: Runner, event: { id: string; event: string; receivedAt: Date }) => db.insert(webhookEvents).values(event).onConflictDoNothing(),
  lastEventAt: (db: Runner) => db.select({ at: webhookEvents.receivedAt }).from(webhookEvents).orderBy(desc(webhookEvents.receivedAt)).limit(1),
  webhook: (db: Runner) => db.select().from(webhookConfig).where(eq(webhookConfig.id, WEBHOOK_ROW)).limit(1),
  saveWebhook: (db: Runner, config: WebhookConfig) =>
    db
      .insert(webhookConfig)
      .values({ id: WEBHOOK_ROW, ...config })
      .onConflictDoUpdate({ target: webhookConfig.id, set: { url: config.url, secretCipher: config.secretCipher, updatedAt: config.updatedAt } }),
  pending: (db: Runner) => db.select().from(notifications).where(isNull(notifications.sentAt)).orderBy(notifications.createdAt),
  markSent: (db: Runner, eventIds: string[], recipients: string[], at: Date) =>
    db
      .update(notifications)
      .set({ sentAt: at, recipients })
      .where(and(inArray(notifications.eventId, eventIds), isNull(notifications.sentAt))),
  deliveries: (db: Runner, eventIds: string[]) =>
    db
      .select({ eventId: notificationDeliveries.eventId, email: notificationDeliveries.email })
      .from(notificationDeliveries)
      .where(inArray(notificationDeliveries.eventId, eventIds)),
  recordDelivery: (db: Runner, eventIds: string[], email: string, at: Date) =>
    db
      .insert(notificationDeliveries)
      .values(eventIds.map((eventId) => ({ eventId, email, sentAt: at })))
      .onConflictDoNothing(),
  forgetDeliveries: (db: Runner, cutoff: Date) => db.delete(notificationDeliveries).where(lt(notificationDeliveries.sentAt, cutoff)),
  forgetEvents: (db: Runner, cutoff: Date) => db.delete(webhookEvents).where(lt(webhookEvents.receivedAt, cutoff)),
  forgetSent: (db: Runner, cutoff: Date) => db.delete(notifications).where(and(isNotNull(notifications.sentAt), lt(notifications.sentAt, cutoff))),
  emailOffUsers: (db: Runner) => db.select({ userId: notificationPrefs.userId }).from(notificationPrefs).where(eq(notificationPrefs.emailOff, true)),
  setEmailOff: (db: Runner, userId: string, off: boolean, at: Date) =>
    db
      .insert(notificationPrefs)
      .values({ userId, emailOff: off, updatedAt: at })
      .onConflictDoUpdate({ target: notificationPrefs.userId, set: { emailOff: off, updatedAt: at } }),
};

/** DB_MODE=postgres: the dashboard's own Postgres. Every call first makes sure the tables are prepared. */
export function createPostgresStore(connection: Pick<PostgresConnection, "db" | "ready" | "pool">): AppStore {
  const { db } = connection;

  return {
    async hasEvent(id) {
      await connection.ready();
      return (await queries.hasEvent(db, id)).length > 0;
    },

    async recordEvent(event, notification) {
      fits(event.id, MAX_KEY_LENGTH, "The event id");
      if (notification) fits(notification.eventId, MAX_KEY_LENGTH, "The event id");
      await connection.ready();
      // One transaction: the notification and the event id land together or not at all.
      await db.transaction(async (tx) => {
        if (notification) await queries.insertNotification(tx, notification);
        await queries.insertEvent(tx, event);
      });
    },

    async lastEventAt() {
      await connection.ready();
      return (await queries.lastEventAt(db))[0]?.at ?? null;
    },

    async webhook() {
      await connection.ready();
      const row = (await queries.webhook(db))[0];
      return row ? { url: row.url, secretCipher: row.secretCipher, updatedAt: row.updatedAt } : null;
    },

    async saveWebhook(config) {
      await connection.ready();
      await queries.saveWebhook(db, config);
    },

    async pendingNotifications() {
      await connection.ready();
      return (await queries.pending(db)).map((row) => ({
        eventId: row.eventId,
        kind: row.kind,
        audience: row.audience,
        data: row.data,
        createdAt: row.createdAt,
      }));
    },

    async markSent(eventIds, recipients, at) {
      if (eventIds.length === 0) return;
      await connection.ready();
      await queries.markSent(db, eventIds, recipients, at);
    },

    async deliveries(eventIds) {
      const found = new Map<string, Set<string>>();
      if (eventIds.length === 0) return found;
      await connection.ready();
      for (const row of await queries.deliveries(db, eventIds)) found.set(row.eventId, (found.get(row.eventId) ?? new Set()).add(row.email));
      return found;
    },

    async recordDelivery(eventIds, email, at) {
      fits(email, MAX_EMAIL_LENGTH, "The email address");
      for (const eventId of eventIds) fits(eventId, MAX_KEY_LENGTH, "The event id");
      if (eventIds.length === 0) return;
      await connection.ready();
      await queries.recordDelivery(db, eventIds, email, at);
    },

    async forgetBefore(cutoff) {
      await connection.ready();
      await db.transaction(async (tx) => {
        await queries.forgetEvents(tx, cutoff);
        await queries.forgetSent(tx, cutoff);
        await queries.forgetDeliveries(tx, cutoff);
      });
    },

    async emailOffUsers() {
      await connection.ready();
      return new Set((await queries.emailOffUsers(db)).map((row) => row.userId));
    },

    async setEmailOff(userId, off, at) {
      fits(userId, MAX_KEY_LENGTH, "The user id");
      await connection.ready();
      await queries.setEmailOff(db, userId, off, at);
    },

    async exclusive<T>(name: string, run: () => Promise<T>): Promise<{ ran: true; value: T } | { ran: false }> {
      // Its own connection: a session advisory lock belongs to the connection that took it, and goes with it if the
      // process dies. Advisory locks are per database, so other copies of the app on the same server never clash.
      const held = await connection.pool.connect();
      try {
        const { rows } = await held.query<{ key: string }>(lockKey(name));
        const taken = await held.query<{ got: boolean }>("SELECT pg_try_advisory_lock($1) AS got", [rows[0].key]);
        if (!taken.rows[0]?.got) return { ran: false };
        try {
          return { ran: true, value: await run() };
        } finally {
          await held.query("SELECT pg_advisory_unlock($1)", [rows[0].key]);
        }
      } finally {
        held.release();
      }
    },
  };
}
