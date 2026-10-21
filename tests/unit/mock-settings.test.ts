import { beforeEach, describe, expect, it } from "vitest";
import { createEngineApi } from "@/lib/engine/api";
import { createEngineClient } from "@/lib/engine/client";
import { createMockFetch, type MockScenario } from "@/lib/engine/mock/server";
import { createMockStore, type MockStore } from "@/lib/engine/mock/store";
import type { SeoSettings, SeoUpdate } from "@/lib/engine/schemas";

const BASE = "https://mock.engine.local/api/v1";
const ME = "admin@example.com";
const PNG = { name: "share.png", type: "image/png", size: 68, dataUrl: "data:image/png;base64,AAAA" };
let t = Date.parse("2026-10-22T08:00:00Z");
let store: MockStore;

function data<T>(outcome: { ok: boolean; data?: T }): T {
  expect(outcome.ok).toBe(true);
  return (outcome as { data: T }).data;
}

/** The engine API over the mock server, as a page sees it. */
function httpEngine(scenario: MockScenario = "normal") {
  const fetch = createMockFetch({ baseUrl: BASE, apiKey: "mock-key", scenario });
  return createEngineApi(createEngineClient({ baseUrl: BASE, apiKey: "mock-key", fetch, retryDelaysMs: [0, 0] }));
}

const seoUpdate = (seo: SeoSettings): SeoUpdate => ({
  siteName: seo.siteName,
  siteUrl: seo.siteUrl,
  blogPath: seo.blogPath ?? null,
  defaultLang: seo.defaultLang,
  focusKeywords: seo.focusKeywords,
  locations: seo.locations,
  author: seo.author ?? null,
  linkedin: seo.linkedin ?? null,
  instagram: seo.instagram ?? null,
  ogImage: seo.ogImage ?? null,
  cta: seo.cta ?? null,
  tone: seo.tone ?? null,
  audience: seo.audience ?? null,
  avoid: seo.avoid,
  version: seo.version,
});
const seoInput = () => seoUpdate(data(store.settings.seo())) as Record<string, unknown>;
const schedule = () => data(store.settings.publishing()) as Record<string, unknown>;

beforeEach(() => {
  t = Date.parse("2026-10-22T08:00:00Z");
  store = createMockStore({ now: () => t, jobDurationMs: 1000 });
});

describe("SEO profile (spec v1.1 §4 SeoSettings)", () => {
  it("describes Fakher & Co as a legal consultancy, never a law firm", () => {
    const seo = data(store.settings.seo());
    expect([seo.siteName, seo.defaultLang, seo.version]).toEqual(["Fakher & Co", "en", 3]);
    expect(JSON.stringify([seo, store.settings.seoProposal()]).toLowerCase()).not.toContain("law firm");
  });

  it("saves with the version it started from; a save from an older version is a conflict", () => {
    const saved = data(store.settings.saveSeo({ ...seoInput(), cta: "Talk to us", focusKeywords: [" contract review uae ", ""] }));
    expect([saved.cta, saved.focusKeywords, saved.version]).toEqual(["Talk to us", ["contract review uae"], 4]);
    expect(store.settings.saveSeo({ ...seoInput(), version: 3 })).toMatchObject({ ok: false, status: 409, code: "version_conflict" });
  });

  it("names each field it can't accept (spec v1.1 §9: error.fields)", () => {
    expect(store.settings.saveSeo({ ...seoInput(), siteUrl: "fakhernco", defaultLang: "fr", linkedin: "our page" })).toMatchObject({
      ok: false,
      status: 400,
      code: "invalid_input",
      fields: { siteUrl: expect.any(String), defaultLang: expect.any(String), linkedin: expect.any(String) },
    });
  });

  it("keeps the share picture apart from the profile: uploading and removing it leave the version alone", () => {
    expect(data(store.settings.uploadSeoPicture(PNG))).toEqual({ url: PNG.dataUrl });
    expect(data(store.settings.seo())).toMatchObject({ ogImageUploaded: { url: PNG.dataUrl }, version: 3 });
    expect(store.settings.uploadSeoPicture({ ...PNG, name: "notes.txt", type: "text/plain" })).toMatchObject({
      ok: false,
      status: 400,
      fields: { file: expect.any(String) },
    });
    expect(data(store.settings.removeSeoPicture())).toEqual({ removed: true });
    expect(data(store.settings.seo()).ogImageUploaded).toBeNull();
  });

  it("proposes focus keywords and a call to action as a job, without saving them", () => {
    const { jobId } = data(store.proposeSeo());
    t += 1000;
    expect(data(store.job(jobId))).toMatchObject({
      status: "done",
      result: { focusKeywords: expect.arrayContaining(["uae labour law advice"]), cta: "Book a consultation with Fakher & Co" },
    });
    expect(data(store.settings.seo())).toMatchObject({ cta: "Book a consultation", version: 3 });
  });
});

describe("publishing schedule (spec v1.1 §4 PublishingSettings)", () => {
  it("starts at 2 a day, Sunday to Thursday, from 10:00, 3 hours apart", () => {
    expect(schedule()).toEqual({ autoPublish: true, perDay: 2, days: ["sun", "mon", "tue", "wed", "thu"], from: "10:00", to: "17:00", gapMinutes: 180, version: 1 });
  });

  it("the queue follows a saved schedule: one a day at 09:00", () => {
    expect(data(store.settings.savePublishing({ ...schedule(), perDay: 1, from: "09:00" })).version).toBe(2);
    const queue = data(store.scheduled(true, null));
    const times = queue.posts.map((post) => post.schedule?.scheduledAt).filter(Boolean);
    expect([queue.nextSlotAt, ...times.slice(0, 2)]).toEqual(["2026-10-22T09:00:00+04:00", "2026-10-22T09:00:00+04:00", "2026-10-25T09:00:00+04:00"]);
  });

  it("turning auto-publish off takes the times away, like the manual scenario", () => {
    data(store.settings.savePublishing({ ...schedule(), autoPublish: false }));
    expect(data(store.scheduled(true, null))).toMatchObject({ autoPublish: false, nextSlotAt: null });
  });

  it("refuses a schedule whose posts don't fit between the hours, naming the field", () => {
    expect(store.settings.savePublishing({ ...schedule(), perDay: 4 })).toMatchObject({
      ok: false,
      status: 400,
      fields: { perDay: expect.stringContaining("don't fit") },
    });
  });

  it("refuses no days, an end before the start, a number that isn't whole, and a stale version", () => {
    expect(store.settings.savePublishing({ ...schedule(), days: [], to: "09:00", gapMinutes: 1.5 })).toMatchObject({
      ok: false,
      fields: { days: expect.any(String), to: expect.any(String), gapMinutes: expect.any(String) },
    });
    expect(store.settings.savePublishing({ ...schedule(), version: 0 })).toMatchObject({ ok: false, status: 409, code: "version_conflict" });
  });
});

describe("settings over HTTP (mock server)", () => {
  it("serves and saves the SEO profile, the schedule and the share picture in the v1.1 shapes", async () => {
    const engine = httpEngine();
    const key = (n: number) => ({ actingUser: ME, idempotencyKey: `key-settings-${n}` });
    const seo = await engine.seoSettings();
    expect((await engine.saveSeo({ ...seoUpdate(seo), cta: "Talk to us" }, key(1))).version).toBe(4);
    const publishing = await engine.publishingSettings();
    expect((await engine.savePublishing({ ...publishing, perDay: 1 }, key(2))).perDay).toBe(1);
    expect((await engine.proposeSeo(key(3))).jobId).toMatch(/^j_/);
    const picture = await engine.uploadSeoPicture(new File([new Uint8Array(68)], "share.png", { type: "image/png" }), key(4));
    expect(picture.url).toMatch(/^data:image\/png;base64,/);
    expect(await engine.removeSeoPicture(key(5))).toEqual({ removed: true });
  });
});
