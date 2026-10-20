import type { FetchLike } from "../client";
import { MOCK_SITE_ID, mockMeta, mockPlan, mockScheduled, mockSite } from "./fixtures";

export type MockScenario = "normal" | "unauthorized" | "down" | "drift";
const MOCK_SCENARIOS: readonly MockScenario[] = ["normal", "unauthorized", "down", "drift"];
export const MOCK_SCENARIO_COOKIE = "mock_scenario";

export function isMockScenario(value: unknown): value is MockScenario {
  return typeof value === "string" && (MOCK_SCENARIOS as readonly string[]).includes(value);
}

type MockOptions = { baseUrl: string; apiKey: string; scenario?: MockScenario };

/** An in-process stand-in for Quantum1st's API: same envelope, status codes and auth check. */
export function createMockFetch(options: MockOptions): FetchLike {
  const basePath = new URL(options.baseUrl).pathname.replace(/\/+$/, "");

  return async (input, init) => {
    const scenario = options.scenario ?? "normal";
    if (scenario === "down") throw new TypeError("fetch failed");

    const key = new Headers(init.headers).get("X-Api-Key");
    if (scenario === "unauthorized" || key !== options.apiKey) {
      return fail(401, "unauthorized", "Key missing, revoked, or the account is suspended.");
    }

    const url = new URL(input);
    if (!url.pathname.startsWith(basePath)) return fail(404, "not_found", "Not found.");
    const path = url.pathname.slice(basePath.length);
    const method = (init.method ?? "GET").toUpperCase();

    if (method === "GET" && path === "/meta") return ok(mockMeta());
    if (method === "GET" && path === "/sites") return ok([scenario === "drift" ? driftedSite() : mockSite()]);
    if (method === "GET" && path === "/account/plan") return ok(mockPlan());

    const siteRoute = /^\/sites\/([^/]+)(\/.*)?$/.exec(path);
    if (siteRoute) {
      if (decodeURIComponent(siteRoute[1]) !== MOCK_SITE_ID) return fail(404, "not_found", "Site not found.");
      const rest = siteRoute[2] ?? "";
      if (method === "GET" && rest === "") return ok(scenario === "drift" ? driftedSite() : mockSite());
      if (method === "GET" && rest === "/scheduled") {
        const scheduled = mockScheduled();
        const pageSize = Number(url.searchParams.get("pageSize") ?? scheduled.posts.length);
        return ok({ ...scheduled, posts: scheduled.posts.slice(0, pageSize) });
      }
    }

    return fail(404, "not_found", `No mock route for ${method} ${path}.`);
  };
}

function ok(data: unknown): Response {
  return Response.json({ ok: true, data });
}

function fail(status: number, code: string, message: string): Response {
  return Response.json({ ok: false, error: { code, message } }, { status });
}

/** The site as an engine that changed its shape would send it: `counts` is gone. */
function driftedSite(): Record<string, unknown> {
  const site: Record<string, unknown> = { ...mockSite() };
  delete site.counts;
  return site;
}
