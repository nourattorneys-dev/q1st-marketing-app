import { describe, expect, it } from "vitest";
import { createEngineApi } from "@/lib/engine/api";
import { createEngineClient } from "@/lib/engine/client";
import { EngineError } from "@/lib/engine/errors";
import { MOCK_SITE_ID, mockMeta, mockPlan, mockScheduled, mockSite } from "@/lib/engine/mock/fixtures";
import { createMockFetch, isMockScenario, type MockScenario } from "@/lib/engine/mock/server";
import { engineNoticeKey } from "@/lib/engine/notice";
import { MetaSchema, PlanSchema, ScheduledSchema, SiteSchema } from "@/lib/engine/schemas";

const BASE = "https://mock.engine.local/api/v1";

function setup(options: { scenario?: MockScenario; clientKey?: string } = {}) {
  const calls: string[] = [];
  const mockFetch = createMockFetch({ baseUrl: BASE, apiKey: "mock-key", scenario: options.scenario });
  const client = createEngineClient({
    baseUrl: BASE,
    apiKey: options.clientKey ?? "mock-key",
    retryDelaysMs: [0, 0],
    fetch: (url, init) => {
      calls.push(`${init.method} ${new URL(url).pathname}`);
      return mockFetch(url, init);
    },
  });
  return { client, engine: createEngineApi(client), calls };
}

async function failure(promise: Promise<unknown>): Promise<EngineError> {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(EngineError);
  return error as EngineError;
}

describe("mock fixtures", () => {
  it("match the v1.1 schemas", () => {
    expect(MetaSchema.safeParse(mockMeta()).success).toBe(true);
    expect(SiteSchema.safeParse(mockSite()).success).toBe(true);
    expect(ScheduledSchema.safeParse(mockScheduled()).success).toBe(true);
    expect(PlanSchema.safeParse(mockPlan()).success).toBe(true);
  });

  it("describe Fakher & Co as a legal consultancy, never a law firm", () => {
    expect(mockSite().category).toBe("legal consultancy");
    expect(JSON.stringify([mockSite(), mockScheduled(), mockPlan()]).toLowerCase()).not.toContain("law firm");
  });
});

describe("engine API over the mock engine", () => {
  it("resolves the site once per request and returns typed data", async () => {
    const { engine, calls } = setup();
    const site = await engine.site();
    const scheduled = await engine.scheduled({ pageSize: 2 });
    await engine.site();

    expect(site.id).toBe(MOCK_SITE_ID);
    expect(site.timezone).toBe("Asia/Dubai");
    expect(scheduled.posts).toHaveLength(2);
    expect(calls.filter((c) => c === "GET /api/v1/sites")).toHaveLength(1);
    expect(calls.filter((c) => c === `GET /api/v1/sites/${MOCK_SITE_ID}`)).toHaveLength(1);
  });

  it("returns meta and the plan", async () => {
    const { engine } = setup();
    expect((await engine.meta()).pollSeconds).toBeGreaterThan(0);
    expect((await engine.plan()).plan.name).toBe("Pro");
  });

  it("rejects a wrong key with 401 unauthorized", async () => {
    const { engine } = setup({ clientKey: "wrong" });
    expect(await failure(engine.plan())).toMatchObject({ status: 401, code: "unauthorized" });
  });

  it("simulates a revoked key", async () => {
    const { engine } = setup({ scenario: "unauthorized" });
    expect((await failure(engine.meta())).code).toBe("unauthorized");
  });

  it("simulates an unreachable engine", async () => {
    const { engine } = setup({ scenario: "down" });
    expect((await failure(engine.plan())).code).toBe("network_error");
  });

  it("isolates a changed response shape to the data that changed, even when /sites drifts too", async () => {
    const { engine } = setup({ scenario: "drift" });
    expect((await failure(engine.siteCounts())).code).toBe("invalid_response");
    await expect(engine.siteTimezone()).resolves.toEqual({ timezone: "Asia/Dubai" });
    await expect(engine.siteConnections()).resolves.toMatchObject({ connections: { linkedin: "expiring" } });
    await expect(engine.scheduled()).resolves.toMatchObject({ autoPublish: true });
    await expect(engine.plan()).resolves.toMatchObject({ plan: { name: "Pro" } });
  });

  it("answers unknown routes with not_found", async () => {
    const { client } = setup();
    const error = await failure(client.request({ method: "GET", path: "/nope", schema: MetaSchema }));
    expect(error).toMatchObject({ status: 404, code: "not_found" });
  });

  it("only accepts known scenario names", () => {
    expect(isMockScenario("drift")).toBe(true);
    expect(isMockScenario("explode")).toBe(false);
  });
});

describe("date-time fields", () => {
  it("accept ISO 8601 times without seconds and reject non-dates", () => {
    expect(ScheduledSchema.safeParse({ autoPublish: true, nextSlotAt: "2026-10-22T10:00+04:00", posts: [] }).success).toBe(true);
    expect(ScheduledSchema.safeParse({ autoPublish: true, nextSlotAt: "tomorrow", posts: [] }).success).toBe(false);
  });
});

describe("engineNoticeKey", () => {
  it("translates local and auth failures, and leaves engine messages as they are", () => {
    expect(engineNoticeKey("unauthorized")).toBe("serviceUnavailable");
    expect(engineNoticeKey("network_error")).toBe("engineUnreachable");
    expect(engineNoticeKey("engine_unavailable")).toBe("engineUnreachable");
    expect(engineNoticeKey("invalid_response")).toBe("engineInvalid");
    expect(engineNoticeKey("quota_exceeded")).toBeNull();
  });
});
