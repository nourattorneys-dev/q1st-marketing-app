import { describe, expect, it } from "vitest";
import { createMemoryStore } from "@/lib/db/memory-store";

const at = (minute: number) => new Date(Date.UTC(2026, 9, 22, 8, minute));
const drafted = (eventId: string, minute: number) => ({
  eventId,
  kind: "drafted",
  audience: "reviewers" as const,
  data: { postId: `p_${eventId}` },
  createdAt: at(minute),
});

describe("the in-memory store (DB_MODE=memory)", () => {
  it("remembers a delivery once, with its notification, however often it's recorded (spec v1.1 §8: deliveries are retried)", async () => {
    const store = createMemoryStore();
    expect(await store.hasEvent("evt_1")).toBe(false);
    await store.recordEvent({ id: "evt_1", event: "post.drafted", receivedAt: at(0) }, drafted("evt_1", 0));
    await store.recordEvent({ id: "evt_1", event: "post.drafted", receivedAt: at(5) }, { ...drafted("evt_1", 5), data: { postId: "other" } });
    expect(await store.hasEvent("evt_1")).toBe(true);
    expect(await store.pendingNotifications()).toEqual([drafted("evt_1", 0)]);
    expect(await store.lastEventAt()).toEqual(at(0));
  });

  it("lists pending notifications oldest first and marks them sent once", async () => {
    const store = createMemoryStore();
    await store.recordEvent({ id: "evt_2", event: "post.drafted", receivedAt: at(2) }, drafted("evt_2", 2));
    await store.recordEvent({ id: "evt_1", event: "post.drafted", receivedAt: at(1) }, drafted("evt_1", 1));
    await store.recordEvent({ id: "evt_3", event: "post.published", receivedAt: at(3) }, null);
    expect((await store.pendingNotifications()).map((item) => item.eventId)).toEqual(["evt_1", "evt_2"]);
    await store.markSent(["evt_1"], ["reviewer@example.com"], at(4));
    expect((await store.pendingNotifications()).map((item) => item.eventId)).toEqual(["evt_2"]);
    expect(await store.lastEventAt()).toEqual(at(3));
  });

  it("forgets deliveries and sent notifications older than the cutoff, but never an unsent one", async () => {
    const store = createMemoryStore();
    await store.recordEvent({ id: "evt_old", event: "post.drafted", receivedAt: at(0) }, drafted("evt_old", 0));
    await store.recordEvent({ id: "evt_sent", event: "post.drafted", receivedAt: at(1) }, drafted("evt_sent", 1));
    await store.markSent(["evt_sent"], [], at(2));
    await store.forgetBefore(at(10));
    expect(await store.hasEvent("evt_old")).toBe(false);
    expect((await store.pendingNotifications()).map((item) => item.eventId)).toEqual(["evt_old"]);
  });

  it("keeps one webhook registration and each person's email choice", async () => {
    const store = createMemoryStore();
    expect(await store.webhook()).toBeNull();
    await store.saveWebhook({ url: "https://portal.example/api/hooks/marketing", secretCipher: "v1:a", updatedAt: at(0) });
    await store.saveWebhook({ url: "https://portal.example/api/hooks/marketing", secretCipher: "v1:b", updatedAt: at(1) });
    expect(await store.webhook()).toEqual({ url: "https://portal.example/api/hooks/marketing", secretCipher: "v1:b", updatedAt: at(1) });
    await store.setEmailOff("user_1", true, at(0));
    await store.setEmailOff("user_2", true, at(0));
    await store.setEmailOff("user_2", false, at(1));
    expect([...(await store.emailOffUsers())]).toEqual(["user_1"]);
  });
});
