import type { RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectMysql, type MysqlConnection } from "@/lib/db/mysql";
import { createMysqlStore, MAX_EMAIL_LENGTH, MAX_KEY_LENGTH, queries } from "@/lib/db/mysql-store";
import { adminQuery, freshTestDatabase, testDatabaseName } from "./mysql-test-db";

const AT = new Date("2026-10-22T08:00:00.123Z");

describe("the MySQL store's SQL (DB_MODE=mysql)", () => {
  // toSQL() only builds the statement: this pool never connects.
  const { db } = connectMysql("mysql://nobody@127.0.0.1:1/never");

  it("records a delivery, its notification and who got it with INSERT IGNORE, so a retry changes nothing", () => {
    const notification = queries.insertNotification(db, { eventId: "evt_1", kind: "drafted", audience: "reviewers", data: { postId: "p_1" }, createdAt: AT });
    expect(notification.toSQL().sql).toMatch(/^insert ignore into `notifications`/);
    expect(queries.insertEvent(db, { id: "evt_1", event: "post.drafted", receivedAt: AT }).toSQL().sql).toMatch(/^insert ignore into `webhook_events`/);
    expect(queries.recordDelivery(db, ["evt_1"], "a@example.com", AT).toSQL().sql).toMatch(/^insert ignore into `notification_deliveries`/);
  });

  it("keeps one webhook row and one preference row per person, updating them in place", () => {
    expect(queries.saveWebhook(db, { url: "https://p.example/api/hooks/marketing", secretCipher: "v1:x", updatedAt: AT }).toSQL().sql).toMatch(/on duplicate key update/);
    expect(queries.setEmailOff(db, "user_1", true, AT).toSQL().sql).toMatch(/on duplicate key update/);
  });

  it("marks only unsent notifications sent, and forgets only sent ones", () => {
    expect(queries.markSent(db, ["evt_1"], [], AT).toSQL().sql).toMatch(/`sent_at` is null/);
    const forget = queries.forgetSent(db, AT).toSQL().sql;
    expect(forget).toMatch(/`sent_at` is not null/);
    expect(forget).toMatch(/`sent_at` < \?/);
  });
});

describe("the MySQL store on a real database", () => {
  let connection: MysqlConnection;

  beforeAll(async () => {
    // A host whose databases default to latin1: the tables must still be utf8mb4 (Review Focus 1).
    connection = connectMysql(await freshTestDatabase("mysql_store", { charset: "latin1" }));
    await connection.ready();
  });

  afterAll(async () => {
    await connection?.close();
  });

  it("creates utf8mb4 tables even where the database defaults to latin1 (Review Focus 1)", async () => {
    const [tables] = await connection.pool.query<RowDataPacket[]>(
      "SELECT table_name AS name, table_collation AS collation FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name <> '__drizzle_migrations' ORDER BY table_name",
    );
    expect(tables.map((table) => table.name)).toEqual(["notification_deliveries", "notification_prefs", "notifications", "webhook_config", "webhook_events"]);
    expect(new Set(tables.map((table) => table.collation))).toEqual(new Set(["utf8mb4_0900_ai_ci"]));
  });

  it("returns Arabic text and emoji unchanged, and times as the same instant", async () => {
    const store = createMysqlStore(connection);
    const notification = { eventId: "evt_ar", kind: "drafted", audience: "reviewers" as const, data: { title: "كيف تختار مستشارًا قانونيًا 👋" }, createdAt: AT };
    await store.recordEvent({ id: "evt_ar", event: "post.drafted", receivedAt: AT }, notification);
    expect((await store.pendingNotifications()).find((item) => item.eventId === "evt_ar")).toEqual(notification);
    expect(await store.lastEventAt()).toEqual(AT);
    await store.saveWebhook({ url: "https://مثال.example/api/hooks/marketing", secretCipher: "v1:x", updatedAt: AT });
    expect(await store.webhook()).toEqual({ url: "https://مثال.example/api/hooks/marketing", secretCipher: "v1:x", updatedAt: AT });
  });

  it("refuses an id longer than its column instead of letting INSERT IGNORE cut it (Review Focus 4)", async () => {
    const store = createMysqlStore(connection);
    const long = "e".repeat(MAX_KEY_LENGTH + 1);
    await expect(store.recordEvent({ id: long, event: "post.drafted", receivedAt: AT }, null)).rejects.toThrow(`longer than ${MAX_KEY_LENGTH} characters`);
    expect(await store.hasEvent(long.slice(0, MAX_KEY_LENGTH))).toBe(false);
    await expect(store.setEmailOff("u".repeat(MAX_KEY_LENGTH + 1), true, AT)).rejects.toThrow(`longer than ${MAX_KEY_LENGTH} characters`);
  });

  it("keeps an email of 254 characters, the longest valid, and refuses a longer one (Review Focus 4)", async () => {
    const store = createMysqlStore(connection);
    const longest = `${"a".repeat(64)}@${"b".repeat(185)}.com`;
    expect(longest).toHaveLength(254);
    await store.recordDelivery(["evt_mail"], longest, AT);
    expect(await store.deliveries(["evt_mail"])).toEqual(new Map([["evt_mail", new Set([longest])]]));
    await expect(store.recordDelivery(["evt_mail"], `${"a".repeat(MAX_EMAIL_LENGTH)}@example.com`, AT)).rejects.toThrow(
      `longer than ${MAX_EMAIL_LENGTH} characters`,
    );
  });
});

describe("preparing the dashboard's tables after an interrupted first attempt", () => {
  it("finishes the job when a first attempt was cut off after some tables (final review: CREATE TABLE commits each statement)", async () => {
    const url = await freshTestDatabase("half_prepared");
    // What a first preparation leaves if the process dies after its first CREATE TABLE: one table, no migration recorded.
    await adminQuery(
      `CREATE TABLE \`${testDatabaseName("half_prepared")}\`.\`notification_deliveries\` (\`event_id\` varchar(191) NOT NULL, \`email\` varchar(255) NOT NULL, \`sent_at\` datetime(3) NOT NULL, PRIMARY KEY (\`event_id\`, \`email\`)) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
    );
    const connection = connectMysql(url);
    try {
      await connection.ready();
      const [tables] = await connection.pool.query<RowDataPacket[]>(
        "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name <> '__drizzle_migrations'",
      );
      expect(Number(tables[0]?.n)).toBe(5);
      const [applied] = await connection.pool.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM __drizzle_migrations");
      expect(Number(applied[0]?.n)).toBe(1);
    } finally {
      await connection.close();
    }
  });
});
