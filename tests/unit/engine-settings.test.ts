import { describe, expect, it } from "vitest";
import { mockMeta } from "@/lib/engine/mock/fixtures";
import type { SeoUpdate } from "@/lib/engine/schemas";
import { fakeEngine, type FakeCall } from "./fake-engine";

const ctx = { actingUser: "admin@example.com", idempotencyKey: "key-12345678" };
const SEO = {
  siteName: "Fakher & Co",
  siteUrl: "https://fakhernco.com",
  blogPath: "/insights",
  defaultLang: "en",
  focusKeywords: ["legal consultancy dubai"],
  locations: ["Dubai"],
  author: "Fakher & Co",
  cta: "Book a consultation",
  tone: "clear",
  audience: "UAE businesses",
  avoid: [],
  version: 3,
};
const SEO_UPDATE: SeoUpdate = { ...SEO, linkedin: null, instagram: null, ogImage: null };
const PUBLISHING = { autoPublish: true, perDay: 2, days: ["sun", "mon"], from: "10:00", to: "17:00", gapMinutes: 180, version: 1 };
const TARGET = {
  type: "wordpress",
  settings: { url: "https://fakhernco.com", username: "articles-ai" },
  fieldMap: { title: "title" },
  body: { format: "html" },
  arabic: { mode: "translatepress" },
};
const WEBSITE = {
  ...TARGET,
  secret: "should-never-come-back",
  secretSet: true,
  languages: ["en", "ar"],
  status: "ok",
  lastCheckedAt: "2026-10-21T09:00:00+04:00",
  lastError: null,
  version: 1,
};
const changes = (calls: FakeCall[]) => calls.filter((call) => call.method !== "GET").map((call) => [call.method, call.path, call.body]);

describe("settings (spec v1.1 §4, §7)", () => {
  it("reads the SEO profile, the schedule and the website connection; the website secret never comes back (Review Focus 3)", async () => {
    const { engine } = fakeEngine({
      "GET /sites/site_1/settings/seo": SEO,
      "GET /sites/site_1/settings/publishing": PUBLISHING,
      "GET /sites/site_1/settings/website": WEBSITE,
    });
    expect(await engine.seoSettings()).toMatchObject({ siteName: "Fakher & Co", focusKeywords: ["legal consultancy dubai"], version: 3 });
    expect(await engine.publishingSettings()).toEqual(PUBLISHING);
    const website = await engine.websiteSettings();
    expect(website).not.toHaveProperty("secret");
    expect([website.secretSet, website.settings.url, website.body?.format, website.arabic?.mode]).toEqual([true, "https://fakhernco.com", "html", "translatepress"]);
  });

  it("lists social accounts, skipping one in an unexpected shape", async () => {
    const { engine } = fakeEngine({
      "GET /sites/site_1/settings/social": [{ platform: "linkedin", accountName: "Fakher & Co", status: "expiring", expiresAt: "2026-10-30T10:00:00+04:00" }, { platform: 7 }],
    });
    const social = await engine.socialConnections();
    expect([social.connections.map((connection) => connection.platform), social.skipped]).toEqual([["linkedin"], 1]);
  });

  it("saves each model with its version, tests unsaved website values, and asks for SEO proposals", async () => {
    const { engine, calls } = fakeEngine({
      "PUT /sites/site_1/settings/seo": SEO,
      "PUT /sites/site_1/settings/publishing": PUBLISHING,
      "PUT /sites/site_1/settings/website": WEBSITE,
      "POST /sites/site_1/settings/website/test": { ok: false, error: "WordPress refused the connection (401 Unauthorized)." },
      "POST /sites/site_1/settings/seo/propose": { jobId: "j_9" },
    });
    await engine.saveSeo(SEO_UPDATE, ctx);
    await engine.savePublishing(PUBLISHING, ctx);
    await engine.saveWebsite({ ...TARGET, secret: "new-password", version: 1 }, ctx);
    expect(await engine.testWebsite(TARGET, ctx)).toEqual({
      ok: false,
      error: "WordPress refused the connection (401 Unauthorized).",
      categories: [],
      languages: [],
      fields: [],
      blockTypes: [],
      suggestedFieldMap: {},
      suggestedBlockMap: {},
    });
    expect((await engine.proposeSeo(ctx)).jobId).toBe("j_9");
    expect(changes(calls)).toEqual([
      ["PUT", "/sites/site_1/settings/seo", SEO_UPDATE],
      ["PUT", "/sites/site_1/settings/publishing", PUBLISHING],
      ["PUT", "/sites/site_1/settings/website", { ...TARGET, secret: "new-password", version: 1 }],
      ["POST", "/sites/site_1/settings/website/test", TARGET],
      ["POST", "/sites/site_1/settings/seo/propose", {}],
    ]);
  });

  it("uploads and removes the share picture", async () => {
    const { engine, calls } = fakeEngine({
      "POST /sites/site_1/settings/seo/picture": { url: "https://cdn.example/share.png" },
      "DELETE /sites/site_1/settings/seo/picture": { removed: true },
    });
    expect(await engine.uploadSeoPicture(new File(["png"], "share.png", { type: "image/png" }), ctx)).toEqual({ url: "https://cdn.example/share.png" });
    expect(((calls.at(-1)?.body as FormData).get("file") as File).name).toBe("share.png");
    expect(await engine.removeSeoPicture(ctx)).toEqual({ removed: true });
  });

  it("asks for the OAuth address with the portal's return address, and refuses a platform that isn't an id", async () => {
    const { engine, calls } = fakeEngine({
      "GET /sites/site_1/settings/social/linkedin/connect": { authorizeUrl: "https://www.linkedin.com/oauth/v2/authorization?state=x" },
      "DELETE /sites/site_1/settings/social/instagram": { disconnected: true },
      "GET /sites/site_1/settings/search-console/connect": { authorizeUrl: "https://accounts.google.com/o/oauth2/auth?state=y" },
      "DELETE /sites/site_1/settings/search-console": { disconnected: true },
    });
    const back = "https://portal.example/en/settings/social";
    expect((await engine.connectSocial("linkedin", back)).authorizeUrl).toContain("linkedin.com");
    expect(new URLSearchParams(calls.at(-1)?.search).get("returnUrl")).toBe(back);
    expect(await engine.disconnectSocial("instagram", ctx)).toEqual({ disconnected: true });
    expect((await engine.connectSearchConsole(back)).authorizeUrl).toContain("google.com");
    expect(await engine.disconnectSearchConsole(ctx)).toEqual({ disconnected: true });
    const before = calls.length;
    await expect(engine.connectSocial("../account", back)).rejects.toMatchObject({ code: "not_found" });
    expect(calls.length).toBe(before);
  });
  it("treats a website connection the engine hasn't created yet (404) as not connected, so first-run setup opens the form (Review Focus 4)", async () => {
    const { engine } = fakeEngine({});
    expect(await engine.websiteSettings()).toMatchObject({ type: null, settings: {}, secretSet: false, status: "missing", version: 0 });
  });

  it("reads an SEO profile and a website connection whose fields aren't set yet (Review Focus 4)", async () => {
    const { engine } = fakeEngine({
      "GET /sites/site_1/settings/seo": { ...SEO, siteName: null, siteUrl: null, defaultLang: null },
      "GET /sites/site_1/settings/website": { ...WEBSITE, secretSet: null, status: null },
    });
    expect(await engine.seoSettings()).toMatchObject({ siteName: "", siteUrl: "", defaultLang: "" });
    expect(await engine.websiteSettings()).toMatchObject({ secretSet: false, status: "missing" });
  });
  it("never hands the browser a secret-type setting, whatever the field is called, on read or after a save (final review; Review Focus 4)", async () => {
    const meta = mockMeta();
    const targetTypes = meta.targetTypes.map((type) => {
      const secretField = type.fields.find((field) => field.kind === "secret");
      return type.type === "wordpress" && secretField ? { ...type, fields: [...type.fields, { ...secretField, key: "token" }] } : type;
    });
    const leaked = { ...WEBSITE, settings: { ...WEBSITE.settings, token: "leaked-token", secret: "leaked-secret" } };
    const { engine } = fakeEngine({
      "GET /meta": { ...meta, targetTypes },
      "GET /sites/site_1/settings/website": leaked,
      "PUT /sites/site_1/settings/website": leaked,
    });
    for (const target of [await engine.websiteSettings(), await engine.saveWebsite({ ...TARGET, version: 1 }, ctx)]) {
      expect(target.settings).not.toHaveProperty("token");
      expect(target.settings).not.toHaveProperty("secret");
      expect(target.settings).toMatchObject({ url: "https://fakhernco.com" });
    }
  });
});
