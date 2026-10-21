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

describe("AI jobs (spec v1.1 §2: drafting is async)", () => {
  const finish = () => {
    t += 1000;
  };

  it("proposes keywords that appear in the New tab once the job is done", () => {
    const { jobId } = data(store.proposeKeywords("en"));
    expect(data(store.job(jobId)).status).not.toBe("done");
    finish();
    expect(data(store.job(jobId)).status).toBe("done");
    expect(data(store.listKeywords(["new"], 1, 25)).items.map((keyword) => keyword.phrase)).toEqual(
      expect.arrayContaining(["labour court claims dubai", "non-compete clause uae"]),
    );
  });

  it("proposes a topic idea per keyword, but not for dismissed keywords", () => {
    const { jobId } = data(store.keywordTopics(["kw_5"]));
    finish();
    expect((data(store.job(jobId)).result as { suggestionIds: string[] }).suggestionIds).toHaveLength(1);
    expect(data(store.listSuggestions(["new"])).at(-1)).toMatchObject({
      title: "What to know about shareholder deadlock uae",
      keywords: ["shareholder deadlock uae"],
    });
    expect(store.keywordTopics(["kw_8"])).toMatchObject({ ok: false, status: 422 });
  });

  it("drafts one article per keyword; both languages make a linked pair whose structures match (Review Focus 5)", () => {
    const started = data(store.draftKeywordArticles(["kw_3"], "both", ME));
    expect(started.postIds).toHaveLength(2);
    const [en, ar] = started.postIds.map((id) => data(store.getPost(id)));
    expect([en.status, ar.status, en.pairId, ar.pairId, en.language, ar.language]).toEqual(["drafting", "drafting", ar.id, en.id, "en", "ar"]);
    finish();
    const done = started.postIds.map((id) => data(store.getPost(id)));
    expect(done.map((post) => post.status)).toEqual(["pending", "pending"]);
    expect(done[1].findings.some((finding) => finding.code === "structure_mismatch")).toBe(false);
    expect(data(store.listKeywords(["new"], 1, 25)).items.find((keyword) => keyword.id === "kw_3")?.uses).toBe(1);
  });

  it("drafts a topic idea: drafting with links to its drafts, then drafted", () => {
    const started = data(store.draftSuggestion("sg_1", "en", ME));
    expect(data(store.listSuggestions(["drafting"]))).toMatchObject([{ id: "sg_1", postIds: started.postIds }]);
    finish();
    expect(data(store.listSuggestions(["drafted"])).map((suggestion) => suggestion.id)).toContain("sg_1");
    expect(data(store.getPost(started.postIds[0]))).toMatchObject({
      status: "pending",
      title: "End-of-service gratuity: how to work out what you're owed",
    });
  });

  it("bulk drafts and dismisses topic ideas, naming what it couldn't do (Review Focus 4)", () => {
    expect(data(store.bulkSuggestions("draft", ["sg_2", "sg_5"], "en", ME))).toEqual({
      done: ["sg_2"],
      failed: [{ id: "sg_5", code: "invalid_input", message: "Only new topic ideas can be drafted." }],
    });
    expect(data(store.bulkSuggestions("dismiss", ["sg_3"], undefined, ME)).done).toEqual(["sg_3"]);
  });

  it("checks a new draft request the way the engine would", () => {
    expect(store.createDrafts({ topic: "", kind: "blog", platform: "linkedin", language: "fr" }, ME)).toMatchObject({
      ok: false,
      status: 400,
      fields: { topic: expect.any(String), platform: expect.any(String), language: expect.any(String) },
    });
    const started = data(store.createDrafts({ topic: "Gratuity for part-time staff", kind: "social", platform: "linkedin", language: "en" }, ME));
    expect(data(store.getPost(started.postIds[0]))).toMatchObject({ kind: "social", platform: "linkedin", status: "drafting" });
  });
});
