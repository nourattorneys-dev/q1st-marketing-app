import { describe, expect, it } from "vitest";
import { originOf, safeRedirectUrl } from "@/lib/settings/addresses";
import { afterSave, changedKeys, draftOf, edit, rebase, unsavedKeys, withMyChanges } from "@/lib/settings/draft";
import { settingsFieldErrors } from "@/lib/settings/field-errors";

type Form = { cta: string; tone: string; map: Record<string, string> };
const BASE: Form = { cta: "Book", tone: "clear", map: { title: "title", slug: "slug" } };

describe("settings drafts (design §9: someone saved first, nothing is discarded)", () => {
  it("counts only real edits; a map with the same entries in another order is unchanged", () => {
    const draft = draftOf(BASE, 3);
    expect(unsavedKeys(edit(draft, "map", { slug: "slug", title: "title" }))).toEqual([]);
    expect(unsavedKeys(edit(draft, "cta", "Call us"))).toEqual(["cta"]);
  });

  it("after a save, the engine's copy is the base and anything typed since the save was sent stays unsaved", () => {
    const sending = edit(draftOf(BASE, 3), "cta", "Call us ");
    const typedSince = edit(sending, "tone", "warm");
    const after = afterSave(typedSince, sending.form, { ...BASE, cta: "Call us" }, 4);
    expect([after.version, after.form.cta, after.form.tone, unsavedKeys(after)]).toEqual([4, "Call us", "warm", ["tone"]]);
  });

  it("a newer version replaces the form only when nothing is unsaved", () => {
    const theirs = { ...BASE, tone: "formal" };
    expect(rebase(draftOf(BASE, 3), theirs, 4).form.tone).toBe("formal");
    const editing = edit(draftOf(BASE, 3), "cta", "Call us");
    expect(rebase(editing, theirs, 4)).toBe(editing);
    expect(rebase(draftOf(BASE, 3), theirs, 3).form.tone).toBe("clear");
  });

  it("keep mine: their values with only my changed fields on top, at their version (Review Focus 4)", () => {
    const mine = edit(draftOf(BASE, 3), "cta", "Call us");
    expect(withMyChanges(mine, { ...BASE, tone: "formal" }, 4)).toEqual({
      base: { ...BASE, tone: "formal" },
      version: 4,
      form: { ...BASE, tone: "formal", cta: "Call us" },
    });
  });

  it("lists the fields where two versions differ, for the conflict panel", () => {
    expect(changedKeys({ ...BASE, cta: "Call us" }, { ...BASE, tone: "formal" })).toEqual(["cta", "tone"]);
  });
});

describe("settingsFieldErrors (spec v1.1 §9)", () => {
  it("puts each message by its field, in camelCase, and lists the ones the form doesn't show", () => {
    const error = { status: 400, code: "invalid_input", message: "x", fields: { site_url: "Bad", "body.format": "Pick one", mystery: "?" } };
    expect(settingsFieldErrors(error, ["siteUrl", "body.format"])).toEqual({
      byField: { siteUrl: "Bad", "body.format": "Pick one" },
      other: [{ field: "mystery", message: "?" }],
    });
    expect(settingsFieldErrors(null, ["siteUrl"])).toEqual({ byField: {}, other: [] });
  });
});

describe("originOf", () => {
  it("uses the forwarded host and protocol (Vercel), or plain http on this machine", () => {
    expect(originOf(new Headers({ "x-forwarded-host": "portal.fakhernco.com", "x-forwarded-proto": "https", host: "internal:3000" }))).toBe(
      "https://portal.fakhernco.com",
    );
    expect(originOf(new Headers({ host: "localhost:3100" }))).toBe("http://localhost:3100");
    expect(originOf(new Headers({ host: "portal.example" }))).toBe("https://portal.example");
  });

  it("gives up on a host that isn't a plain host name", () => {
    expect([originOf(new Headers({ host: "a.example/evil" })), originOf(new Headers())]).toEqual([null, null]);
  });
});

describe("safeRedirectUrl", () => {
  it("follows https, and plain http only on this machine", () => {
    expect(safeRedirectUrl("https://www.linkedin.com/oauth?x=1")).toBe("https://www.linkedin.com/oauth?x=1");
    expect(safeRedirectUrl("http://localhost:3100/en/settings/social?connected=instagram")).toBe("http://localhost:3100/en/settings/social?connected=instagram");
  });

  it("never follows another scheme, plain http elsewhere, or something that isn't an address", () => {
    expect([safeRedirectUrl("javascript:alert(1)"), safeRedirectUrl("data:text/html,x"), safeRedirectUrl("http://evil.example/"), safeRedirectUrl("not a url")]).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });
});
