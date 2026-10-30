import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryStore } from "@/lib/db/memory-store";
import type { AppStore } from "@/lib/db/store";
import { encryptSecret } from "@/lib/webhooks/secret";
import { signBody } from "@/lib/webhooks/signature";

const KEY = Buffer.alloc(32, 9);
const SECRET = "whsec_test";
let store: AppStore;
vi.mock("@/lib/db", () => ({ getStore: () => store }));

const { POST } = await import("@/app/api/hooks/marketing/route");

const drafted = JSON.stringify({ event: "post.drafted", siteId: "site_fakher", at: "2026-10-22T12:00:00+04:00", data: { postId: "p_1", status: "pending" } });

/** A delivery as the engine sends it: signed with SECRET, event id evt_1, unless the headers say otherwise. */
function deliver(body: string, headers: Record<string, string> = {}) {
  return POST(
    new Request("http://localhost/api/hooks/marketing", {
      method: "POST",
      body,
      headers: { "X-Signature": signBody(body, SECRET), "X-Event-Id": "evt_1", ...headers },
    }),
  );
}

beforeEach(async () => {
  vi.stubEnv("DB_MODE", "memory");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("WEBHOOK_ENCRYPTION_KEY", KEY.toString("base64"));
  store = createMemoryStore("site_fakher");
  await store.saveWebhook({ url: "https://portal.example/api/hooks/marketing", secretCipher: encryptSecret(SECRET, KEY), updatedAt: new Date() });
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/hooks/marketing (spec v1.1 §8, §10; design §11, §14)", () => {
  it("accepts a signed delivery, remembers its id and queues the email it causes", async () => {
    const response = await deliver(drafted);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: { received: true } });
    expect(await store.hasEvent("evt_1")).toBe(true);
    expect(await store.pendingNotifications()).toMatchObject([{ eventId: "evt_1", kind: "drafted", audience: "reviewers", data: { postId: "p_1" } }]);
  });

  it("rejects a wrong signature, a body changed after signing, or no signature, and records nothing (Review Focus 1)", async () => {
    const changed = new Request("http://localhost/api/hooks/marketing", {
      method: "POST",
      body: `${drafted} `,
      headers: { "X-Signature": signBody(drafted, SECRET), "X-Event-Id": "evt_1" },
    });
    const unsigned = new Request("http://localhost/api/hooks/marketing", { method: "POST", body: drafted, headers: { "X-Event-Id": "evt_1" } });
    for (const response of [await deliver(drafted, { "X-Signature": signBody(drafted, "whsec_other") }), await POST(changed), await POST(unsigned)]) {
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ ok: false, error: { code: "invalid_signature" } });
    }
    expect(await store.hasEvent("evt_1")).toBe(false);
    expect(await store.pendingNotifications()).toEqual([]);
  });

  it("refuses, the same way, a correctly signed delivery that names a site this app doesn't serve (P1b)", async () => {
    const elsewhere = drafted.replace("site_fakher", "site_unknown");
    const response = await deliver(elsewhere, { "X-Signature": signBody(elsewhere, SECRET) });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "invalid_signature" } });
    expect(await store.hasEvent("evt_1")).toBe(false);
  });

  it("acknowledges a repeated X-Event-Id and ignores it: one email, not two (Review Focus 1)", async () => {
    await deliver(drafted);
    const again = await deliver(drafted);
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ ok: true, data: { duplicate: true } });
    expect(await store.pendingNotifications()).toHaveLength(1);
  });

  it("refuses every delivery before a webhook is set up, or when this key can't read the stored secret", async () => {
    store = createMemoryStore("site_fakher");
    expect((await deliver(drafted)).status).toBe(401);
    await store.saveWebhook({ url: "https://portal.example/api/hooks/marketing", secretCipher: encryptSecret(SECRET, Buffer.alloc(32, 3)), updatedAt: new Date() });
    expect((await deliver(drafted)).status).toBe(401);
  });

  it("answers 400 for a missing or malformed event id or a body that isn't a delivery, and 413 for an oversized one", async () => {
    expect((await deliver(drafted, { "X-Event-Id": "" })).status).toBe(400);
    expect((await deliver(drafted, { "X-Event-Id": "evt 1/../x" })).status).toBe(400);
    // P1b: a body that names no site can't be checked against any site's secret: refused like a wrong signature.
    expect((await deliver("not json")).status).toBe(401);
    expect((await deliver(JSON.stringify({ hello: "world" }))).status).toBe(401);
    expect((await deliver(JSON.stringify({ siteId: "site_fakher", hello: "world" }))).status).toBe(400);
    expect((await deliver(JSON.stringify({ event: "post.drafted", siteId: "s", at: "t", data: { pad: "x".repeat(300_000) } }))).status).toBe(413);
    expect(await store.pendingNotifications()).toEqual([]);
  });

  it("accepts an event it doesn't know, without an email, so the engine stops retrying", async () => {
    const response = await deliver(JSON.stringify({ event: "something.new", siteId: "site_fakher", at: "t", data: {} }), { "X-Event-Id": "evt_new" });
    expect(response.status).toBe(200);
    expect(await store.hasEvent("evt_new")).toBe(true);
    expect(await store.pendingNotifications()).toEqual([]);
  });
});

