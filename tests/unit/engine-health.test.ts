import { describe, expect, it } from "vitest";
import { fakeEngine, type FakeCall } from "./fake-engine";

const ctx = { actingUser: "admin@example.com", idempotencyKey: "key-12345678" };
const FINDING = { id: "sf_1", url: "https://fakhernco.com/services/", level: "critical", issue: "Missing meta description", fix: null, status: "open" };
const changes = (calls: FakeCall[]) => calls.filter((call) => call.method !== "GET").map((call) => [call.path, call.body]);

describe("site health (spec v1.1 §4 SiteFinding, §7)", () => {
  it("lists findings a page at a time by status and level, skipping one in an unexpected shape", async () => {
    const { engine, calls } = fakeEngine({ "GET /sites/site_1/site/findings": [FINDING, { id: 4 }] });
    const list = await engine.listFindings({ statuses: ["open", "prepared"], levels: ["critical"], page: 2, pageSize: 25 });
    expect([list.findings.map((finding) => finding.id), list.skipped, list.meta?.total]).toEqual([["sf_1"], 1, 3]);
    const query = new URLSearchParams(calls.at(-1)?.search);
    expect([query.get("status"), query.get("level"), query.get("page"), query.get("pageSize")]).toEqual(["open,prepared", "critical", "2", "25"]);
    await engine.listFindings({ statuses: ["applied"], levels: [] });
    expect(new URLSearchParams(calls.at(-1)?.search).has("level")).toBe(false);
  });

  it("starts a scan and fix preparation as jobs, and applies or dismisses findings in bulk", async () => {
    const { engine, calls } = fakeEngine({
      "POST /sites/site_1/site/scan": { jobId: "j_1" },
      "POST /sites/site_1/site/fixes": { jobId: "j_2" },
      "POST /sites/site_1/site/findings/bulk": { done: ["sf_1"], failed: [] },
    });
    expect((await engine.scanSite(ctx)).jobId).toBe("j_1");
    expect((await engine.prepareFixes(["sf_1", "sf_2"], ctx)).jobId).toBe("j_2");
    expect(await engine.bulkFindings("apply", ["sf_1"], ctx)).toEqual({ done: ["sf_1"], failed: [] });
    expect(changes(calls)).toEqual([
      ["/sites/site_1/site/scan", {}],
      ["/sites/site_1/site/fixes", { ids: ["sf_1", "sf_2"] }],
      ["/sites/site_1/site/findings/bulk", { action: "apply", ids: ["sf_1"] }],
    ]);
  });
});

describe("usage (spec v1.1 §7 GET /account/usage)", () => {
  it("asks for a month range and returns this site's months and results", async () => {
    const { engine, calls } = fakeEngine({
      "GET /account/usage": {
        months: [{ month: "2026-10", sites: [{ siteId: "site_1", metrics: { articles: 24 } }] }, { month: "2026-09" }],
        results: [{ siteId: "site_1", published: 41, keywordsCovered: 12 }],
      },
    });
    const usage = await engine.usage({ from: "2026-05", to: "2026-10" });
    expect([usage.months[0].sites[0].metrics.articles, usage.months[1].sites, usage.results[0].published]).toEqual([24, [], 41]);
    const query = new URLSearchParams(calls.at(-1)?.search);
    expect([query.get("from"), query.get("to")]).toEqual(["2026-05", "2026-10"]);
  });
});
