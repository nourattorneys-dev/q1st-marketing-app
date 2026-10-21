import { describe, expect, it } from "vitest";
import { fakeEngine } from "./fake-engine";

const ctx = { actingUser: "sara@example.com", idempotencyKey: "key-12345678" };
const KEYWORD = { id: "kw_1", phrase: "commission uae", language: "en", source: "ai", status: "new", createdAt: "2026-10-20T10:00:00+04:00" };
const SUGGESTION = { id: "sg_1", title: "Commission after resignation", kind: "blog", language: "en", status: "new", createdAt: "2026-10-20T10:00:00+04:00" };
const JOB = { jobId: "j_1", status: "queued", postIds: ["p_1"] };
const posts = (calls: { method: string; path: string; body: unknown }[]) => calls.filter((call) => call.method === "POST").map((call) => [call.path, call.body]);

describe("keywords and suggestions (spec v1.1 §7)", () => {
  it("lists keywords and suggestions, skipping items in an unexpected shape", async () => {
    const { engine, calls } = fakeEngine({
      "GET /sites/site_1/keywords": [KEYWORD, { id: 3 }],
      "GET /sites/site_1/suggestions": [SUGGESTION, { title: null }],
    });
    const keywords = await engine.listKeywords({ statuses: ["dismissed", "off_strategy"], page: 2, pageSize: 25 });
    expect([keywords.keywords.map((k) => k.id), keywords.skipped, keywords.meta?.total]).toEqual([["kw_1"], 1, 3]);
    const query = new URLSearchParams(calls.at(-1)?.search);
    expect([query.get("status"), query.get("page"), query.get("pageSize")]).toEqual(["dismissed,off_strategy", "2", "25"]);

    const suggestions = await engine.listSuggestions({ statuses: ["new", "drafting", "drafted"] });
    expect(suggestions.suggestions).toEqual([{ ...SUGGESTION, keywords: [], postIds: [] }]);
    expect(suggestions.skipped).toBe(1);
  });

  it("sends keyword changes and AI jobs", async () => {
    const { engine, calls } = fakeEngine({
      "POST /sites/site_1/keywords": [KEYWORD],
      "POST /sites/site_1/keywords/bulk": { done: ["kw_1"], failed: [] },
      "POST /sites/site_1/keywords/propose": { jobId: "j_2" },
      "POST /sites/site_1/keywords/topics": { jobId: "j_3" },
      "POST /sites/site_1/keywords/draft-articles": JOB,
    });
    expect(await engine.addKeywords(["commission uae"], "en", ctx)).toHaveLength(1);
    await engine.bulkKeywords("approve", ["kw_1"], ctx);
    expect((await engine.proposeKeywords("ar", ctx)).jobId).toBe("j_2");
    await engine.keywordTopics(["kw_1"], ctx);
    expect((await engine.draftKeywordArticles(["kw_1"], "both", ctx)).postIds).toEqual(["p_1"]);
    expect(posts(calls)).toEqual([
      ["/sites/site_1/keywords", { phrases: ["commission uae"], language: "en" }],
      ["/sites/site_1/keywords/bulk", { action: "approve", ids: ["kw_1"] }],
      ["/sites/site_1/keywords/propose", { language: "ar" }],
      ["/sites/site_1/keywords/topics", { ids: ["kw_1"] }],
      ["/sites/site_1/keywords/draft-articles", { ids: ["kw_1"], language: "both" }],
    ]);
  });

  it("sends suggestion changes, new drafts and upgrade requests", async () => {
    const { engine, calls } = fakeEngine({
      "POST /sites/site_1/suggestions/sg_1/draft": JOB,
      "POST /sites/site_1/suggestions/sg_1/dismiss": { ...SUGGESTION, status: "dismissed" },
      "POST /sites/site_1/suggestions/bulk": { done: ["sg_1"], failed: [] },
      "POST /sites/site_1/drafts": JOB,
      "POST /account/upgrade-request": { requested: true },
    });
    await engine.draftSuggestion("sg_1", "ar", ctx);
    expect((await engine.dismissSuggestion("sg_1", ctx)).status).toBe("dismissed");
    await engine.bulkSuggestions("draft", ["sg_1"], "en", ctx);
    await engine.createDrafts({ topic: "Gratuity", kind: "blog", platform: "website", language: "both", keywords: ["gratuity uae"] }, ctx);
    expect(await engine.requestUpgrade("articles", undefined, ctx)).toEqual({ requested: true });
    expect(posts(calls)).toEqual([
      ["/sites/site_1/suggestions/sg_1/draft", { language: "ar" }],
      ["/sites/site_1/suggestions/sg_1/dismiss", {}],
      ["/sites/site_1/suggestions/bulk", { action: "draft", ids: ["sg_1"], language: "en" }],
      ["/sites/site_1/drafts", { topic: "Gratuity", kind: "blog", platform: "website", language: "both", keywords: ["gratuity uae"] }],
      ["/account/upgrade-request", { metric: "articles" }],
    ]);
  });

  it("refuses a suggestion id that would address another endpoint, before any request", async () => {
    const { engine, calls } = fakeEngine({});
    await expect(engine.dismissSuggestion("..", ctx)).rejects.toMatchObject({ code: "not_found" });
    expect(calls).toEqual([]);
  });
});
