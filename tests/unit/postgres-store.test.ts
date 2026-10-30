import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectPostgres, type PostgresConnection } from "@/lib/db/postgres";
import { createPostgresStore, MAX_EMAIL_LENGTH, MAX_KEY_LENGTH, queries } from "@/lib/db/postgres-store";
import { freshTestDatabase, testDatabaseUrl } from "./postgres-test-db";

const AT = new Date("2026-10-30T12:34:56.789Z");

describe("the Postgres store's SQL (DB_MODE=postgres)", () => {
  // toSQL() only builds the statement: this pool never connects.
  const { db } = connectPostgres("postgres://nobody@127.0.0.1:1/never");

  it("keeps the first copy of a repeated event, notification or delivery (a retried webhook adds nothing)", () => {
    const notification = queries.insertNotification(db, "site_a", { eventId: "evt_1", kind: "drafted", audience: "reviewers", data: {}, createdAt: AT });
    expect(notification.toSQL().sql).toMatch(/on conflict do nothing$/);
    expect(queries.insertEvent(db, "site_a", { id: "evt_1", event: "post.drafted", receivedAt: AT }).toSQL().sql).toMatch(/on conflict do nothing$/);
    expect(queries.recordDelivery(db, ["evt_1"], "a@example.com", AT).toSQL().sql).toMatch(/on conflict do nothing$/);
  });

  it("replaces the webhook row and a person's choice in place", () => {
    expect(queries.saveWebhook(db, "site_a", { url: "https://p.example/api/hooks/marketing", secretCipher: "v1:x", updatedAt: AT }).toSQL().sql).toMatch(/on conflict \("site_id"\) do update/);
    expect(queries.setEmailOff(db, "user_1", true, AT).toSQL().sql).toMatch(/on conflict \("user_id"\) do update/);
  });

  it("marks only unsent notifications, and forgets only sent ones", () => {
    expect(queries.markSent(db, ["evt_1"], [], AT).toSQL().sql).toMatch(/"sent_at" is null/);
    const forget = queries.forgetSent(db, AT).toSQL().sql;
    expect(forget).toMatch(/"sent_at" is not null/);
  });
});

describe("the Postgres store on a real database", () => {
  let connection: PostgresConnection;

  beforeAll(async () => {
    connection = connectPostgres(await freshTestDatabase("postgres_store"));
    await connection.ready();
  });

  afterAll(async () => {
    await connection?.close();
  });

  it("creates the dashboard's 10 tables", async () => {
    const { rows } = await connection.pool.query<{ n: string }>(
      "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = 'public'",
    );
    expect(Number(rows[0]?.n)).toBe(14);
  });

  it("returns Arabic text and emoji unchanged, and times as the same instant", async () => {
    const store = createPostgresStore(connection, "site_a");
    const notification = { eventId: "evt_ar", kind: "drafted", audience: "reviewers" as const, data: { title: "كيف تختار مستشارًا قانونيًا 👋" }, createdAt: AT };
    await store.recordEvent({ id: "evt_ar", event: "post.drafted", receivedAt: AT }, notification);
    expect((await store.pendingNotifications()).find((item) => item.eventId === "evt_ar")).toEqual(notification);
    expect(await store.lastEventAt()).toEqual(AT);
    await store.saveWebhook({ url: "https://مثال.example/api/hooks/marketing", secretCipher: "v1:x", updatedAt: AT });
    expect(await store.webhook()).toEqual({ url: "https://مثال.example/api/hooks/marketing", secretCipher: "v1:x", updatedAt: AT });
  });

  it("refuses an id longer than its column with a plain message", async () => {
    const store = createPostgresStore(connection, "site_a");
    const long = "e".repeat(MAX_KEY_LENGTH + 1);
    await expect(store.recordEvent({ id: long, event: "post.drafted", receivedAt: AT }, null)).rejects.toThrow(`longer than ${MAX_KEY_LENGTH} characters`);
    expect(await store.hasEvent(long.slice(0, MAX_KEY_LENGTH))).toBe(false);
    await expect(store.setEmailOff("u".repeat(MAX_KEY_LENGTH + 1), true, AT)).rejects.toThrow(`longer than ${MAX_KEY_LENGTH} characters`);
  });

  it("keeps an email of 254 characters, the longest valid, and refuses a longer one", async () => {
    const store = createPostgresStore(connection, "site_a");
    const longest = `${"a".repeat(64)}@${"b".repeat(185)}.com`;
    expect(longest).toHaveLength(254);
    await store.recordDelivery(["evt_mail"], longest, AT);
    expect(await store.deliveries(["evt_mail"])).toEqual(new Map([["evt_mail", new Set([longest])]]));
    await expect(store.recordDelivery(["evt_mail"], `${"a".repeat(MAX_EMAIL_LENGTH)}@example.com`, AT)).rejects.toThrow(
      `longer than ${MAX_EMAIL_LENGTH} characters`,
    );
  });
});

describe("one notification run at a time across server processes (M5b)", () => {
  const opened: PostgresConnection[] = [];
  /** A store with its own pool, as another server process would have. */
  const storeOn = (url: string) => {
    const connection = connectPostgres(url);
    opened.push(connection);
    return createPostgresStore(connection, "site_a");
  };

  afterAll(async () => {
    for (const connection of opened) await connection.close();
  });

  it("blocks a second copy on the same database, but not a copy on another database", async () => {
    const first = storeOn(await freshTestDatabase("exclusive_a"));
    const sameDatabase = storeOn(testDatabaseUrl("exclusive_a"));
    const otherDatabase = storeOn(await freshTestDatabase("exclusive_b"));
    const inside = await first.exclusive("articles_ai_flush", async () => ({
      same: await sameDatabase.exclusive("articles_ai_flush", async () => "ran"),
      other: await otherDatabase.exclusive("articles_ai_flush", async () => "ran"),
    }));
    expect(inside).toEqual({ ran: true, value: { same: { ran: false }, other: { ran: true, value: "ran" } } });
    expect(await sameDatabase.exclusive("articles_ai_flush", async () => "after")).toEqual({ ran: true, value: "after" });
  });

  it("frees the lock when the run fails, so the next run goes ahead", async () => {
    const store = storeOn(await freshTestDatabase("exclusive_fail"));
    await expect(store.exclusive("articles_ai_flush", async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(await store.exclusive("articles_ai_flush", async () => "again")).toEqual({ ran: true, value: "again" });
  });
});
