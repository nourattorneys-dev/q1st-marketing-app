import { beforeEach, describe, expect, it } from "vitest";
import { createEngineApi } from "@/lib/engine/api";
import { createEngineClient } from "@/lib/engine/client";
import { mockPlan } from "@/lib/engine/mock/fixtures";
import { createMockFetch, type MockScenario } from "@/lib/engine/mock/server";
import { createMockStore, type MockStore } from "@/lib/engine/mock/store";
import { mockUsage } from "@/lib/engine/mock/usage";

const BASE = "https://mock.engine.local/api/v1";
let t = Date.parse("2026-10-22T08:00:00Z");
let store: MockStore;

function data<T>(outcome: { ok: boolean; data?: T }): T {
  expect(outcome.ok).toBe(true);
  return (outcome as { data: T }).data;
}
const ids = (outcome: { ok: boolean; data?: { items: { id: string }[] } }) => data(outcome).items.map((finding) => finding.id);

function httpEngine(scenario: MockScenario = "normal") {
  const fetch = createMockFetch({ baseUrl: BASE, apiKey: "mock-key", scenario });
  return createEngineApi(createEngineClient({ baseUrl: BASE, apiKey: "mock-key", fetch, retryDelaysMs: [0, 0] }));
}

beforeEach(() => {
  t = Date.parse("2026-10-22T08:00:00Z");
  store = createMockStore({ now: () => t, jobDurationMs: 1000 });
});

describe("site health (spec v1.1 §6 /site-health)", () => {
  it("lists findings by status and level, a page at a time", () => {
    expect(ids(store.listFindings(["open", "prepared"], null, 1, 25))).toEqual(["sf_1", "sf_2", "sf_3", "sf_4"]);
    expect(ids(store.listFindings(null, ["critical"], 1, 25))).toEqual(["sf_1", "sf_3"]);
    expect(data(store.listFindings(null, null, 1, 2)).meta).toEqual({ page: 1, pageSize: 2, total: 6 });
  });

  it("a scan is a job that adds what it found (Review Focus 2)", () => {
    const { jobId } = data(store.scanSite());
    t += 1000;
    expect(data(store.job(jobId))).toMatchObject({ status: "done", result: { findingIds: ["sf_7"] } });
    expect(ids(store.listFindings(["open"], null, 1, 25))).toContain("sf_7");
  });

  it("prepares fixes for the open findings chosen, as a job, and refuses when none is open", () => {
    const { jobId } = data(store.prepareFixes(["sf_1", "sf_3", "sf_5"]));
    t += 1000;
    expect(data(store.job(jobId)).result).toEqual({ findingIds: ["sf_1"] });
    expect(data(store.listFindings(["prepared"], null, 1, 25)).items.find((finding) => finding.id === "sf_1")).toMatchObject({
      status: "prepared",
      fix: expect.stringContaining("Fakher & Co"),
    });
    expect(store.prepareFixes(["sf_5", "sf_99"])).toMatchObject({ ok: false, status: 422, code: "invalid_input" });
  });

  it("applies only prepared fixes and dismisses only open or prepared findings, naming each refusal (Review Focus 1)", () => {
    expect(data(store.bulkFindings("apply", ["sf_3", "sf_1", "sf_99"]))).toEqual({
      done: ["sf_3"],
      failed: [
        { id: "sf_1", code: "invalid_input", message: "Prepare the fix first." },
        { id: "sf_99", code: "not_found", message: "This finding no longer exists." },
      ],
    });
    expect(data(store.bulkFindings("dismiss", ["sf_2", "sf_5"]))).toEqual({
      done: ["sf_2"],
      failed: [{ id: "sf_5", code: "invalid_input", message: "Only open or prepared findings can be dismissed." }],
    });
    expect(store.bulkFindings("delete", ["sf_1"])).toMatchObject({ ok: false, status: 400 });
  });

  it("never calls Fakher & Co a law firm", () => {
    const { jobId } = data(store.prepareFixes(["sf_1", "sf_2", "sf_4"]));
    t += 1000;
    data(store.job(jobId));
    expect(JSON.stringify(data(store.listFindings(null, null, 1, 50))).toLowerCase()).not.toContain("law firm");
  });
});

describe("usage (spec v1.1 §7 GET /account/usage)", () => {
  it("reports every month in the range, with no site numbers for a month it has none for", () => {
    const usage = mockUsage("2026-04", "2026-06");
    expect(usage?.months.map((month) => [month.month, month.sites.length])).toEqual([
      ["2026-04", 0],
      ["2026-05", 1],
      ["2026-06", 1],
    ]);
    expect(usage?.results).toEqual([{ siteId: "site_fakher", published: 41, keywordsCovered: 12 }]);
  });

  it("refuses months it can't read, or a range that runs backwards", () => {
    expect([mockUsage("2026-13", "2026-10"), mockUsage("2026-10", "2026-05"), mockUsage("", "2026-05")]).toEqual([null, null, null]);
  });
});

describe("over HTTP", () => {
  it("serves findings, a scan, fix preparation, bulk actions and usage", async () => {
    const engine = httpEngine();
    const key = (n: number) => ({ actingUser: "admin@example.com", idempotencyKey: `key-health-${n}` });
    expect((await engine.listFindings({ statuses: ["open"], levels: ["warn"] })).findings.map((finding) => finding.id)).toEqual(["sf_2", "sf_4"]);
    expect((await engine.scanSite(key(1))).jobId).toMatch(/^j_/);
    expect((await engine.prepareFixes(["sf_1"], key(2))).jobId).toMatch(/^j_/);
    expect(await engine.bulkFindings("dismiss", ["sf_2"], key(3))).toEqual({ done: ["sf_2"], failed: [] });
    expect((await engine.usage({ from: "2026-05", to: "2026-10" })).months).toHaveLength(6);
    await expect(engine.usage({ from: "May", to: "2026-10" })).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("the quota scenario refuses scans and AI proposals with their metrics, and the plan shows hard quotas at their limit", async () => {
    const quota = httpEngine("quota");
    const key = (n: number) => ({ actingUser: "admin@example.com", idempotencyKey: `key-quota-${n}` });
    await expect(quota.scanSite(key(1))).rejects.toMatchObject({ code: "quota_exceeded", details: { metric: "siteScans" } });
    await expect(quota.proposeKeywords(undefined, key(2))).rejects.toMatchObject({ code: "quota_exceeded", details: { metric: "aiTokens" } });
    await expect(quota.proposeSeo(key(3))).rejects.toMatchObject({ code: "quota_exceeded", details: { metric: "aiTokens" } });
    const plan = await quota.plan();
    const at = (metric: string) => plan.quotas.find((row) => row.metric === metric);
    expect([at("articles")?.used, at("siteScans")?.used, at("aiTokens")?.used]).toEqual([40, 4, 2_000_000]);
    expect(mockPlan().quotas.find((row) => row.metric === "siteScans")).toMatchObject({ limit: 4, used: 2, mode: "hard" });
  });
});
