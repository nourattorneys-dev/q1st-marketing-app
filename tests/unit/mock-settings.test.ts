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
  services: seo.services,
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
const WORDPRESS = {
  type: "wordpress",
  settings: { url: "https://fakhernco.com", username: "articles-ai", postType: "post" },
  fieldMap: { title: "title" },
  body: { format: "html" },
  arabic: { mode: "translatepress" },
};
const STRAPI = {
  type: "strapi",
  settings: { url: "https://cms.fakhernco.com", collection: "posts" },
  secret: "strapi-api-token",
  fieldMap: {},
  body: { format: "blocks", blockMap: {} },
  arabic: { mode: "locale" },
};

describe("website connection (spec v1.1 §4 PublishTarget, §7, §10)", () => {
  it("never returns the secret, only whether one is stored (Review Focus 3)", () => {
    const website = data(store.settings.website());
    expect(website).toMatchObject({ type: "wordpress", secretSet: true, status: "ok", version: 1 });
    expect(JSON.stringify(website)).not.toContain("seeded-application-password");
  });

  it("a wrong application password fails the test with its message, and the changed connection is saved only after a test passes (Review Focus 1)", () => {
    expect(data(store.settings.testWebsite({ ...WORDPRESS, secret: "wrong-password" }))).toEqual({ ok: false, error: expect.stringContaining("401 Unauthorized") });
    expect(store.settings.saveWebsite({ ...WORDPRESS, secret: "wrong-password", version: 1 })).toMatchObject({ ok: false, status: 422, code: "not_connected" });
    expect(data(store.settings.testWebsite({ ...WORDPRESS, secret: "new-password" }))).toMatchObject({ ok: true, suggestedFieldMap: { metaTitle: "yoast.title" } });
    expect(data(store.settings.saveWebsite({ ...WORDPRESS, secret: "new-password", version: 1 }))).toMatchObject({ status: "ok", secretSet: true, version: 2 });
  });

  it("a site that has this kind of sign-in turned off answers the test with 422 not_connected and its reason (final review)", () => {
    expect(store.settings.testWebsite({ ...WORDPRESS, secret: "disabled-password" })).toMatchObject({
      ok: false,
      status: 422,
      code: "not_connected",
      message: expect.stringContaining("turned off on the site"),
    });
  });

  it("saves a change to the field map, the format or the Arabic mode without a new test", () => {
    expect(data(store.settings.saveWebsite({ ...WORDPRESS, fieldMap: { title: "title", slug: "slug" }, body: { format: "boldbuilder" }, version: 1 }))).toMatchObject({
      fieldMap: { title: "title", slug: "slug" },
      body: { format: "boldbuilder" },
      version: 2,
    });
  });

  it("tests with the stored secret when none is typed, but another type needs its own (Review Focus 3)", () => {
    expect(data(store.settings.testWebsite(WORDPRESS))).toMatchObject({ ok: true });
    expect(store.settings.testWebsite({ ...STRAPI, secret: undefined })).toMatchObject({ ok: false, status: 400, fields: { secret: "Required." } });
  });

  it("names missing fields, addresses that aren't web addresses, and a format the type doesn't offer", () => {
    expect(store.settings.testWebsite({ ...WORDPRESS, settings: { url: "fakhernco", username: "" } })).toMatchObject({
      ok: false,
      fields: { url: expect.any(String), username: "Required." },
    });
    expect(store.settings.saveWebsite({ ...WORDPRESS, body: { format: "blocks" }, version: 1 })).toMatchObject({ ok: false, fields: { "body.format": expect.any(String) } });
    expect(store.settings.saveWebsite({ ...WORDPRESS, version: 0 })).toMatchObject({ ok: false, status: 409, code: "version_conflict" });
  });

  it("switching to Strapi: the test suggests both maps; published posts keep WordPress and new ones go to Strapi (Review Focus 2)", () => {
    expect(data(store.settings.testWebsite(STRAPI))).toMatchObject({
      ok: true,
      blockTypes: expect.arrayContaining(["blocks.faq"]),
      suggestedBlockMap: { heading: "blocks.heading", table: "blocks.data-table" },
      suggestedFieldMap: { metaTitle: "seo.metaTitle" },
    });
    expect(data(store.settings.saveWebsite({ ...STRAPI, version: 1 }))).toMatchObject({ type: "strapi", body: { format: "blocks" }, arabic: { mode: "locale" } });
    expect(data(store.publish("p_101", ME)).published?.target).toBe("strapi");
    expect(data(store.getPost("p_301")).published?.target).toBe("wordpress");
  });
});

describe("first run, connections and social accounts (spec v1.1 §6, §7)", () => {
  it("a first-run site has no website or social connection, and publishing is refused with not_connected", () => {
    const fresh = createMockStore({ now: () => t, firstRun: true });
    expect(data(fresh.settings.website())).toMatchObject({ type: null, status: "missing", secretSet: false });
    expect(fresh.settings.connections(false)).toEqual({ website: { type: null, status: "missing" }, linkedin: "missing", instagram: "missing", searchConsole: null });
    expect(fresh.publish("p_101", ME)).toMatchObject({ ok: false, status: 422, code: "not_connected", details: { connection: "website" } });
  });

  it("connects a social account through an address that comes back to the portal, then disconnects it", () => {
    const back = "http://localhost:3100/en/settings/social";
    expect(data(store.settings.connectSocial("instagram", back))).toEqual({ authorizeUrl: `${back}?connected=instagram` });
    expect(store.settings.connections(false).instagram).toBe("ok");
    expect(data(store.settings.socialList()).find((account) => account.platform === "instagram")).toMatchObject({ status: "ok", accountName: "Fakher & Co" });
    expect(data(store.settings.disconnectSocial("instagram"))).toEqual({ disconnected: true });
    expect(store.settings.connections(false).instagram).toBe("missing");
  });

  it("refuses an unknown platform and a return address that isn't a web address", () => {
    expect(store.settings.connectSocial("tiktok", "http://localhost:3100/x")).toMatchObject({ ok: false, status: 404 });
    expect(store.settings.connectSocial("linkedin", "javascript:alert(1)")).toMatchObject({ ok: false, status: 400 });
  });

  it("over HTTP, the performance scenario lists the feature and offers Search Console; the normal one does neither", async () => {
    const performance = httpEngine("performance");
    expect((await performance.meta()).features).toEqual(["performance"]);
    expect((await performance.siteConnections()).connections.searchConsole).toBe("missing");
    expect((await performance.connectSearchConsole("http://localhost:3100/en/settings/social")).authorizeUrl).toContain("connected=searchConsole");
    const normal = httpEngine();
    expect((await normal.siteConnections()).connections.searchConsole).toBeNull();
    await expect(normal.connectSearchConsole("http://localhost:3100/en/settings/social")).rejects.toMatchObject({ code: "not_found" });
  });
});
