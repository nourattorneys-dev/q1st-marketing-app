import { beforeEach, describe, expect, it } from "vitest";
import { createMockStore, type MockStore } from "@/lib/engine/mock/store";

const ME = "reviewer@example.com";
let t = Date.parse("2026-10-22T08:00:00Z");
let store: MockStore;

function data<T>(outcome: { ok: boolean; data?: T }): T {
  expect(outcome.ok).toBe(true);
  return (outcome as { data: T }).data;
}

const tab = (statuses: string[]) => data(store.listKeywords(statuses, 1, 25)).items.map((keyword) => keyword.id);

beforeEach(() => {
  t = Date.parse("2026-10-22T08:00:00Z");
  store = createMockStore({ now: () => t, jobDurationMs: 1000 });
});

describe("keywords (spec v1.1 §6 /keywords)", () => {
  it("lists each tab's keywords; off-strategy keywords sit with the dismissed ones", () => {
    expect(tab(["new"])).toEqual(["kw_3", "kw_5", "kw_6", "kw_7"]);
    expect(tab(["approved"])).toEqual(["kw_1", "kw_2", "kw_10", "kw_11"]);
    expect(tab(["covered"])).toEqual(["kw_4"]);
    expect(tab(["dismissed", "off_strategy"])).toEqual(["kw_8", "kw_9"]);
    expect(data(store.listKeywords(["new"], 1, 2)).meta).toEqual({ page: 1, pageSize: 2, total: 4 });
  });

  it("adds new phrases as person-added keywords and skips ones that already exist, ignoring case and spacing (Review Focus 3)", () => {
    const created = data(store.addKeywords(["Laser hair removal dubai", "Commission  UAE labour law", "laser hair removal dubai"], "en", ME));
    expect(created.map((keyword) => [keyword.phrase, keyword.source, keyword.status])).toEqual([["Laser hair removal dubai", "person", "new"]]);
    expect(tab(["new"])).toContain(created[0].id);
  });

  it("refuses a language the site doesn't have", () => {
    expect(store.addKeywords(["x"], "fr", ME)).toMatchObject({ ok: false, status: 400, code: "invalid_input", fields: { language: expect.any(String) } });
  });

  it("approves, dismisses and restores, and names what it couldn't do (Review Focus 4)", () => {
    expect(data(store.bulkKeywords("approve", ["kw_3", "kw_4"]))).toEqual({
      done: ["kw_3"],
      failed: [{ id: "kw_4", code: "invalid_input", message: "Only new keywords can be approved." }],
    });
    expect(data(store.bulkKeywords("dismiss", ["kw_3"])).done).toEqual(["kw_3"]);
    expect(data(store.bulkKeywords("restore", ["kw_3", "kw_9"])).done).toEqual(["kw_3", "kw_9"]);
    expect(tab(["new"])).toEqual(expect.arrayContaining(["kw_3", "kw_9"]));
    expect(store.bulkKeywords("archive", ["kw_3"])).toMatchObject({ ok: false, status: 400 });
  });
});

describe("topic ideas (spec v1.1 §6 /suggestions)", () => {
  it("lists suggestions by status and dismisses a new one", () => {
    const shown = () => data(store.listSuggestions(["new", "drafting", "drafted"])).map((suggestion) => suggestion.id);
    expect(shown()).toEqual(["sg_1", "sg_2", "sg_3", "sg_4", "sg_5"]);
    expect(data(store.dismissSuggestion("sg_2")).status).toBe("dismissed");
    expect(shown()).toEqual(["sg_1", "sg_3", "sg_4", "sg_5"]);
    expect(store.dismissSuggestion("sg_5")).toMatchObject({ ok: false, status: 422 });
  });

  it("links a drafted suggestion to its drafts", () => {
    expect(data(store.listSuggestions(["drafted"]))[0]).toMatchObject({ id: "sg_5", postIds: ["p_201", "p_202"] });
  });
});
