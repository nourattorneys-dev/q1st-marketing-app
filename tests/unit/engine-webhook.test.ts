import { describe, expect, it } from "vitest";
import { createEngineApi } from "@/lib/engine/api";
import { createEngineClient } from "@/lib/engine/client";
import { deliverMockEvent } from "@/lib/engine/mock/deliver";
import { createMockFetch } from "@/lib/engine/mock/server";
import { createMockStore } from "@/lib/engine/mock/store";
import { verifySignature } from "@/lib/webhooks/signature";
import { fakeEngine } from "./fake-engine";

const BASE = "https://mock.engine.local/api/v1";
const HOOK = "https://portal.example/api/hooks/marketing";
const ctx = (n: number) => ({ actingUser: "admin@example.com", idempotencyKey: `key-${n}-2345678` });

function mockEngine() {
  const store = createMockStore();
  const fetch = createMockFetch({ baseUrl: BASE, apiKey: "mock-key", store });
  return { store, engine: createEngineApi(createEngineClient({ baseUrl: BASE, apiKey: "mock-key", fetch, retryDelaysMs: [0, 0] })) };
}

describe("the webhook registration (spec v1.1 §7 GET/PUT …/webhook)", () => {
  it("reads and saves it on the site; a secret in a GET answer is dropped", async () => {
    const { engine, calls } = fakeEngine({
      "GET /sites/site_1/webhook": { url: HOOK, events: ["post.drafted"], secret: "leaked" },
      "PUT /sites/site_1/webhook": { url: HOOK, events: ["post.drafted"], secret: "whsec_1" },
    });
    expect(await engine.webhookSettings()).toEqual({ url: HOOK, events: ["post.drafted"] });
    expect(await engine.saveWebhook({ url: HOOK, events: ["post.drafted"], rotateSecret: true }, ctx(1))).toEqual({
      url: HOOK,
      events: ["post.drafted"],
      secret: "whsec_1",
    });
    expect(calls.at(-1)).toMatchObject({ method: "PUT", path: "/sites/site_1/webhook", body: { url: HOOK, events: ["post.drafted"], rotateSecret: true } });
  });

  it("the mock engine returns the secret once, on the first save or a rotation, and never from GET", async () => {
    const { engine } = mockEngine();
    expect(await engine.webhookSettings()).toEqual({ url: null, events: [] });
    const first = await engine.saveWebhook({ url: HOOK, events: ["post.drafted"], rotateSecret: false }, ctx(1));
    expect(first.secret).toMatch(/^whsec_/);
    const again = await engine.saveWebhook({ url: HOOK, events: ["post.drafted", "post.failed"], rotateSecret: false }, ctx(2));
    expect(again.secret).toBeUndefined();
    const rotated = await engine.saveWebhook({ url: HOOK, events: ["post.drafted"], rotateSecret: true }, ctx(3));
    expect(rotated.secret).toMatch(/^whsec_/);
    expect(rotated.secret).not.toBe(first.secret);
    expect(await engine.webhookSettings()).toEqual({ url: HOOK, events: ["post.drafted"] });
  });

  it("the mock engine refuses an address that isn't a web address, and an empty event list", async () => {
    const { engine } = mockEngine();
    await expect(engine.saveWebhook({ url: "ftp://x.example", events: [], rotateSecret: true }, ctx(1))).rejects.toMatchObject({
      code: "invalid_input",
      fields: { url: expect.any(String), events: expect.any(String) },
    });
  });
});

describe("deliveries from the mock engine (test logins only)", () => {
  it("signs the raw body with the registered secret and sends the event id", async () => {
    const { store, engine } = mockEngine();
    const saved = await engine.saveWebhook({ url: HOOK, events: ["post.drafted"], rotateSecret: true }, ctx(1));
    const sent: { url: string; init: RequestInit }[] = [];
    const result = await deliverMockEvent(store, "post.drafted", { postId: "p_1", status: "pending" }, {
      eventId: "evt_test",
      fetch: async (url, init) => {
        sent.push({ url, init });
        return Response.json({ ok: true, data: { received: true } });
      },
    });
    expect(result).toEqual({ delivered: true, eventId: "evt_test", status: 200, body: { ok: true, data: { received: true } } });
    const headers = new Headers(sent[0].init.headers);
    expect([sent[0].url, headers.get("X-Event-Id")]).toEqual([HOOK, "evt_test"]);
    expect(verifySignature(String(sent[0].init.body), headers.get("X-Signature"), saved.secret ?? "")).toBe(true);
    expect(JSON.parse(String(sent[0].init.body))).toMatchObject({ event: "post.drafted", siteId: "site_fakher", data: { postId: "p_1" } });
  });

  it("delivers nothing before a webhook is set up", async () => {
    const { store } = mockEngine();
    expect(await deliverMockEvent(store, "post.drafted", {})).toEqual({ delivered: false, reason: "no_webhook" });
  });
});

