import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMemoryStore } from "@/lib/db/memory-store";
import { connectMysql, type MysqlConnection } from "@/lib/db/mysql";
import { createMysqlStore } from "@/lib/db/mysql-store";
import type { AppStore } from "@/lib/db/store";
import { freshTestDatabase } from "./mysql-test-db";

const at = (minute: number) => new Date(Date.UTC(2026, 9, 22, 8, minute));
const drafted = (eventId: string, minute: number) => ({
  eventId,
  kind: "drafted",
  audience: "reviewers" as const,
  data: { postId: `p_${eventId}` },
  createdAt: at(minute),
});

const TABLES = ["webhook_events", "webhook_config", "notifications", "notification_deliveries", "notification_prefs"];
let mysql: MysqlConnection;

beforeAll(async () => {
  mysql = connectMysql(await freshTestDatabase("store"));
  await mysql.ready();
});

afterAll(async () => {
  await mysql?.close();
});

/** A MySQL store over emptied tables, so each case starts clean, as a new in-memory store does. */
async function emptyMysqlStore(): Promise<AppStore> {
  for (const table of TABLES) await mysql.pool.query(`DELETE FROM \`${table}\``);
  return createMysqlStore(mysql);
}

describe.each([
  { name: "the in-memory store (DB_MODE=memory)", createStore: async (): Promise<AppStore> => createMemoryStore() },
  { name: "the MySQL store (DB_MODE=mysql)", createStore: emptyMysqlStore },
])("$name", ({ createStore }) => {
  it("remembers a delivery once, with its notification, however often it's recorded (spec v1.1 §8: deliveries are retried)", async () => {
    const store = await createStore();
    expect(await store.hasEvent("evt_1")).toBe(false);
    await store.recordEvent({ id: "evt_1", event: "post.drafted", receivedAt: at(0) }, drafted("evt_1", 0));
    await store.recordEvent({ id: "evt_1", event: "post.drafted", receivedAt: at(5) }, { ...drafted("evt_1", 5), data: { postId: "other" } });
    expect(await store.hasEvent("evt_1")).toBe(true);
    expect(await store.pendingNotifications()).toEqual([drafted("evt_1", 0)]);
    expect(await store.lastEventAt()).toEqual(at(0));
  });

  it("lists pending notifications oldest first and marks them sent once", async () => {
    const store = await createStore();
    await store.recordEvent({ id: "evt_2", event: "post.drafted", receivedAt: at(2) }, drafted("evt_2", 2));
    await store.recordEvent({ id: "evt_1", event: "post.drafted", receivedAt: at(1) }, drafted("evt_1", 1));
    await store.recordEvent({ id: "evt_3", event: "post.published", receivedAt: at(3) }, null);
    expect((await store.pendingNotifications()).map((item) => item.eventId)).toEqual(["evt_1", "evt_2"]);
    await store.markSent(["evt_1"], ["reviewer@example.com"], at(4));
    expect((await store.pendingNotifications()).map((item) => item.eventId)).toEqual(["evt_2"]);
    expect(await store.lastEventAt()).toEqual(at(3));
  });

  it("forgets deliveries and sent notifications older than the cutoff, but never an unsent one", async () => {
    const store = await createStore();
    await store.recordEvent({ id: "evt_old", event: "post.drafted", receivedAt: at(0) }, drafted("evt_old", 0));
    await store.recordEvent({ id: "evt_sent", event: "post.drafted", receivedAt: at(1) }, drafted("evt_sent", 1));
    await store.markSent(["evt_sent"], [], at(2));
    await store.forgetBefore(at(10));
    expect(await store.hasEvent("evt_old")).toBe(false);
    expect((await store.pendingNotifications()).map((item) => item.eventId)).toEqual(["evt_old"]);
  });

  it("keeps one webhook registration and each person's email choice", async () => {
    const store = await createStore();
    expect(await store.webhook()).toBeNull();
    await store.saveWebhook({ url: "https://portal.example/api/hooks/marketing", secretCipher: "v1:a", updatedAt: at(0) });
    await store.saveWebhook({ url: "https://portal.example/api/hooks/marketing", secretCipher: "v1:b", updatedAt: at(1) });
    expect(await store.webhook()).toEqual({ url: "https://portal.example/api/hooks/marketing", secretCipher: "v1:b", updatedAt: at(1) });
    await store.setEmailOff("user_1", true, at(0));
    await store.setEmailOff("user_2", true, at(0));
    await store.setEmailOff("user_2", false, at(1));
    expect([...(await store.emailOffUsers())]).toEqual(["user_1"]);
  });

  it("records who got which notification, once each (final review: no one is emailed twice)", async () => {
    const store = await createStore();
    expect(await store.deliveries(["evt_1"])).toEqual(new Map());
    await store.recordDelivery(["evt_1", "evt_2"], "a@example.com", at(1));
    await store.recordDelivery(["evt_1"], "b@example.com", at(2));
    await store.recordDelivery(["evt_1"], "a@example.com", at(3));
    expect(await store.deliveries(["evt_1", "evt_2", "evt_3"])).toEqual(
      new Map([
        ["evt_1", new Set(["a@example.com", "b@example.com"])],
        ["evt_2", new Set(["a@example.com"])],
      ]),
    );
    await store.forgetBefore(at(2));
    expect(await store.deliveries(["evt_1", "evt_2"])).toEqual(new Map([["evt_1", new Set(["b@example.com"])]]));
  });

  it("runs one job of a kind at a time, and frees it when the job ends or throws (M5b: one notification run at a time)", async () => {
    const store = await createStore();
    let inner: unknown;
    let other: unknown;
    const outer = await store.exclusive("articles_ai_flush", async () => {
      inner = await store.exclusive("articles_ai_flush", async () => "second");
      other = await store.exclusive("another_job", async () => "other");
      return "first";
    });
    expect(outer).toEqual({ ran: true, value: "first" });
    expect(inner).toEqual({ ran: false });
    expect(other).toEqual({ ran: true, value: "other" });
    await expect(
      store.exclusive("articles_ai_flush", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await store.exclusive("articles_ai_flush", async () => "again")).toEqual({ ran: true, value: "again" });
  });
});
