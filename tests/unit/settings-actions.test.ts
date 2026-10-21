import { beforeEach, describe, expect, it, vi } from "vitest";

const engine = {
  seoSettings: vi.fn(),
  saveSeo: vi.fn(),
  proposeSeo: vi.fn(),
  uploadSeoPicture: vi.fn(),
  removeSeoPicture: vi.fn(),
  publishingSettings: vi.fn(),
  savePublishing: vi.fn(),
  websiteSettings: vi.fn(),
  saveWebsite: vi.fn(),
  testWebsite: vi.fn(),
  connectSocial: vi.fn(),
  disconnectSocial: vi.fn(),
  connectSearchConsole: vi.fn(),
  disconnectSearchConsole: vi.fn(),
};
const refresh = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh }));
const requirePermission = vi.fn(async () => ({ email: "admin@example.com" }));
vi.mock("@/lib/auth/session", () => ({ requirePermission }));
vi.mock("@/lib/engine", () => ({ getEngine: async () => engine }));
let requestHeaders = new Headers();
vi.mock("next/headers", () => ({ headers: async () => requestHeaders }));

const actions = await import("@/app/[locale]/(app)/settings/actions");

const key = "key-12345678";
const SEO_UPDATE = {
  siteName: "Fakher & Co",
  siteUrl: "https://fakhernco.com",
  blogPath: null,
  defaultLang: "en",
  focusKeywords: [],
  locations: [],
  author: null,
  linkedin: null,
  instagram: null,
  ogImage: null,
  cta: null,
  tone: null,
  audience: null,
  avoid: [],
  version: 3,
};
const PUBLISHING = { autoPublish: true, perDay: 2, days: ["sun"], from: "10:00", to: "17:00", gapMinutes: 180, version: 1 };
const TARGET = { type: "wordpress", settings: { url: "https://fakhernco.com" }, fieldMap: {}, body: { format: "html" }, arabic: { mode: "translatepress" } };

beforeEach(() => {
  vi.clearAllMocks();
  requestHeaders = new Headers({ host: "portal.example", "x-forwarded-proto": "https" });
  for (const method of Object.values(engine)) method.mockResolvedValue({ version: 2 });
});

describe("settings actions are for admins (design §5: settings.manage; Review Focus 5)", () => {
  it("checks settings.manage before every read and change", async () => {
    const picture = new FormData();
    picture.set("locale", "en");
    picture.set("idempotencyKey", key);
    picture.set("file", new File(["png"], "share.png", { type: "image/png" }));
    await actions.loadSeoAction({ locale: "en" });
    await actions.saveSeoAction({ locale: "en", update: SEO_UPDATE, idempotencyKey: key });
    await actions.proposeSeoAction({ locale: "en", idempotencyKey: key });
    await actions.uploadSeoPictureAction(picture);
    await actions.removeSeoPictureAction({ locale: "en", idempotencyKey: key });
    await actions.loadPublishingAction({ locale: "en" });
    await actions.savePublishingAction({ locale: "en", update: PUBLISHING, idempotencyKey: key });
    await actions.loadWebsiteAction({ locale: "en" });
    await actions.testWebsiteAction({ locale: "en", target: TARGET, idempotencyKey: key });
    await actions.saveWebsiteAction({ locale: "en", update: { ...TARGET, version: 1 }, idempotencyKey: key });
    await actions.connectSocialAction({ locale: "en", platform: "linkedin" });
    await actions.disconnectSocialAction({ locale: "en", platform: "linkedin", idempotencyKey: key });
    await actions.connectSearchConsoleAction({ locale: "en" });
    await actions.disconnectSearchConsoleAction({ locale: "en", idempotencyKey: key });
    expect(requirePermission.mock.calls).toEqual(Array.from({ length: 14 }, () => ["en", "settings.manage"]));
  });

  it("refuses a malformed platform or a schedule number that isn't whole, without calling the engine", async () => {
    expect(await actions.disconnectSocialAction({ locale: "en", platform: "../x", idempotencyKey: key })).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(await actions.savePublishingAction({ locale: "en", update: { ...PUBLISHING, perDay: 1.5 }, idempotencyKey: key })).toMatchObject({ ok: false });
    expect(engine.disconnectSocial).not.toHaveBeenCalled();
    expect(engine.savePublishing).not.toHaveBeenCalled();
  });

  it("connects a social account with this portal's own return address", async () => {
    engine.connectSocial.mockResolvedValue({ authorizeUrl: "https://www.linkedin.com/oauth/v2/authorization?x=1" });
    expect(await actions.connectSocialAction({ locale: "ar", platform: "linkedin" })).toEqual({
      ok: true,
      data: { authorizeUrl: "https://www.linkedin.com/oauth/v2/authorization?x=1" },
    });
    expect(engine.connectSocial).toHaveBeenCalledWith("linkedin", "https://portal.example/ar/settings/social");
  });

  it("won't connect when the request's own address can't be worked out", async () => {
    requestHeaders = new Headers({ host: "evil.example/path" });
    expect(await actions.connectSocialAction({ locale: "en", platform: "linkedin" })).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(engine.connectSocial).not.toHaveBeenCalled();
  });

  it("a connection test and an AI proposal don't refresh the page; a save does", async () => {
    await actions.testWebsiteAction({ locale: "en", target: TARGET, idempotencyKey: key });
    await actions.proposeSeoAction({ locale: "en", idempotencyKey: key });
    expect(refresh).not.toHaveBeenCalled();
    await actions.saveWebsiteAction({ locale: "en", update: { ...TARGET, version: 1 }, idempotencyKey: key });
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
