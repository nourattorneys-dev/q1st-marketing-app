import { describe, expect, it } from "vitest";
import { mockMeta } from "@/lib/engine/mock/fixtures";
import type { PublishTarget } from "@/lib/engine/schemas";
import {
  connectionFingerprint,
  mapKeys,
  missingRequired,
  needsTest,
  prefillMap,
  switchType,
  toWebsiteForm,
  toWebsiteTarget,
  toWebsiteUpdate,
} from "@/lib/settings/website-form";

const TYPES = mockMeta().targetTypes;
const SAVED: PublishTarget = {
  type: "wordpress",
  settings: { url: "https://fakhernco.com", username: "articles-ai", postType: "post", ctaText: "Book a consultation" },
  secretSet: true,
  fieldMap: { title: "title", subtitle: "excerpt" },
  body: { format: "html", blockMap: null },
  arabic: { mode: "translatepress" },
  languages: ["en", "ar"],
  status: "ok",
  lastCheckedAt: "2026-10-21T09:00:00+04:00",
  lastError: null,
  version: 1,
};

describe("the website form (spec v1.1 §4 PublishTarget, §6, §10)", () => {
  it("starts from the saved connection with an empty secret, and sends back settings it doesn't show (Review Focus 3)", () => {
    const form = toWebsiteForm(SAVED, TYPES);
    expect(form).toMatchObject({ type: "wordpress", secret: "", bodyFormat: "html", arabicMode: "translatepress" });
    expect(toWebsiteTarget(form, TYPES)).toEqual({
      type: "wordpress",
      settings: { url: "https://fakhernco.com", username: "articles-ai", postType: "post", ctaText: "Book a consultation" },
      fieldMap: { title: "title", subtitle: "excerpt" },
      body: { format: "html" },
      arabic: { mode: "translatepress" },
    });
    expect(toWebsiteUpdate({ ...form, secret: "new-password" }, TYPES, 1)).toMatchObject({ secret: "new-password", version: 1 });
  });

  it("a first connection starts on the first type /meta lists", () => {
    const missing = { ...SAVED, type: null, settings: {}, secretSet: false, fieldMap: {}, body: null, arabic: null, status: "missing", version: 0 };
    expect(toWebsiteForm(missing, TYPES)).toEqual({
      type: "wordpress",
      settings: {},
      secret: "",
      fieldMap: {},
      bodyFormat: "html",
      blockMap: {},
      arabicMode: "translatepress",
    });
  });

  it("switching type drops the old type's fields and maps, and takes the new type's first format and Arabic mode (Review Focus 2)", () => {
    expect(switchType({ ...toWebsiteForm(SAVED, TYPES), secret: "typed" }, "strapi", TYPES)).toEqual({
      type: "strapi",
      settings: { ctaText: "Book a consultation" },
      secret: "",
      fieldMap: {},
      bodyFormat: "blocks",
      blockMap: {},
      arabicMode: "locale",
    });
  });

  it("needs a test for a changed type, connection field or typed secret, but not for the maps, format or Arabic mode (Review Focus 1)", () => {
    const form = toWebsiteForm(SAVED, TYPES);
    expect(needsTest(form, SAVED, TYPES)).toBe(false);
    expect(needsTest({ ...form, fieldMap: { title: "title" }, bodyFormat: "boldbuilder", arabicMode: "separate" }, SAVED, TYPES)).toBe(false);
    expect(needsTest({ ...form, settings: { ...form.settings, url: "https://www.fakhernco.com" } }, SAVED, TYPES)).toBe(true);
    expect(needsTest({ ...form, secret: "new-password" }, SAVED, TYPES)).toBe(true);
    expect(needsTest(switchType(form, "strapi", TYPES), SAVED, TYPES)).toBe(true);
    expect(needsTest(form, { ...SAVED, status: "missing" }, TYPES)).toBe(true);
  });

  it("a passing test proves only the connection values it tested", () => {
    const form = toWebsiteForm(SAVED, TYPES);
    const tested = connectionFingerprint(form, TYPES);
    expect(connectionFingerprint({ ...form, fieldMap: {}, bodyFormat: "boldbuilder" }, TYPES)).toBe(tested);
    expect(connectionFingerprint({ ...form, settings: { ...form.settings, username: "other" } }, TYPES)).not.toBe(tested);
    expect(connectionFingerprint({ ...form, secret: "x" }, TYPES)).not.toBe(tested);
  });

  it("names the required fields left empty; the stored secret counts only for the same type", () => {
    const form = toWebsiteForm(SAVED, TYPES);
    expect(missingRequired(form, SAVED, TYPES)).toEqual([]);
    expect(missingRequired({ ...form, settings: { ...form.settings, username: " " } }, SAVED, TYPES)).toEqual(["username"]);
    expect(missingRequired(switchType(form, "strapi", TYPES), SAVED, TYPES)).toEqual(["url", "secret", "collection"]);
  });

  it("a test's suggestions fill empty rows and rows the website doesn't have; a valid choice stays", () => {
    const choices = ["title", "post_title", "excerpt", "slug", "tags"];
    expect(prefillMap({ title: "title", subtitle: "summary", slug: "" }, { title: "post_title", subtitle: "excerpt", slug: "slug", keywords: "tags" }, choices)).toEqual({
      title: "title",
      subtitle: "excerpt",
      slug: "slug",
      keywords: "tags",
    });
    expect(mapKeys({ title: "title" }, { slug: "slug", title: "title" })).toEqual(["title", "slug"]);
  });

  it("sends a block map only with the blocks format, without empty rows", () => {
    const strapi = { ...switchType(toWebsiteForm(SAVED, TYPES), "strapi", TYPES), blockMap: { heading: "blocks.heading", quote: "" } };
    expect(toWebsiteTarget(strapi, TYPES).body).toEqual({ format: "blocks", blockMap: { heading: "blocks.heading" } });
  });
});
