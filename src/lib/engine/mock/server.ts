import type { FetchLike } from "../client";
import { MOCK_SITE_ID, mockMeta, mockPlan, mockSite } from "./fixtures";
import { createMockStore, type MockOutcome, type MockStore } from "./store";

/** normal · unauthorized (revoked key) · down (unreachable) · drift (changed shapes) · manual (auto-publish off). */
export type MockScenario = "normal" | "unauthorized" | "down" | "drift" | "manual";
const MOCK_SCENARIOS: readonly MockScenario[] = ["normal", "unauthorized", "down", "drift", "manual"];
export const MOCK_SCENARIO_COOKIE = "mock_scenario";

export function isMockScenario(value: unknown): value is MockScenario {
  return typeof value === "string" && (MOCK_SCENARIOS as readonly string[]).includes(value);
}

type MockOptions = { baseUrl: string; apiKey: string; scenario?: MockScenario; store?: MockStore };
type Reply = { status: number; json: unknown };

/** An in-process stand-in for Quantum1st's API: same envelope, status codes, auth, acting-user and idempotency rules. */
export function createMockFetch(options: MockOptions): FetchLike {
  const basePath = new URL(options.baseUrl).pathname.replace(/\/+$/, "");
  const store = options.store ?? createMockStore();

  return async (input, init) => {
    const scenario = options.scenario ?? "normal";
    if (scenario === "down") throw new TypeError("fetch failed");

    const headers = new Headers(init.headers);
    if (scenario === "unauthorized" || headers.get("X-Api-Key") !== options.apiKey) {
      return send(fail(401, "unauthorized", "Key missing, revoked, or the account is suspended."));
    }

    const url = new URL(input);
    if (!url.pathname.startsWith(basePath)) return send(fail(404, "not_found", "Not found."));
    const path = url.pathname.slice(basePath.length);
    const method = (init.method ?? "GET").toUpperCase();
    const body = typeof init.body === "string" ? init.body : "";

    if (method === "GET") return send(route(method, path, url, {}, "", scenario, store));

    const actor = headers.get("X-Acting-User");
    if (!actor) return send(fail(400, "invalid_input", "X-Acting-User is required for changes."));
    const key = headers.get("Idempotency-Key");
    if (!key) return send(fail(400, "invalid_input", "Idempotency-Key is required for changes."));

    const fingerprint = `${method} ${path} ${body}`;
    const seen = store.idempotency.get(key);
    if (seen) {
      return seen.fingerprint === fingerprint
        ? send({ status: seen.status, json: seen.json })
        : send(fail(422, "idempotency_mismatch", "This Idempotency-Key was already used for a different request."));
    }

    let parsed: Record<string, unknown> = {};
    try {
      parsed = body ? (JSON.parse(body) as Record<string, unknown>) : {};
    } catch {
      return send(fail(400, "invalid_input", "The request body isn't valid JSON."));
    }

    const reply = route(method, path, url, parsed, actor, scenario, store);
    store.idempotency.set(key, { fingerprint, status: reply.status, json: reply.json });
    return send(reply);
  };
}

function route(
  method: string,
  path: string,
  url: URL,
  body: Record<string, unknown>,
  actor: string,
  scenario: MockScenario,
  store: MockStore,
): Reply {
  if (method === "GET" && path === "/meta") return ok(mockMeta());
  if (method === "GET" && path === "/sites") return ok([scenario === "drift" ? driftedSite() : mockSite()]);
  if (method === "GET" && path === "/account/plan") return ok(mockPlan());

  const jobRoute = /^\/jobs\/([^/]+)$/.exec(path);
  if (jobRoute && method === "GET") return outcome(store.job(decodeURIComponent(jobRoute[1])));

  const siteRoute = /^\/sites\/([^/]+)(\/.*)?$/.exec(path);
  if (!siteRoute) return fail(404, "not_found", `No mock route for ${method} ${path}.`);
  if (decodeURIComponent(siteRoute[1]) !== MOCK_SITE_ID) return fail(404, "not_found", "Site not found.");
  const rest = siteRoute[2] ?? "";

  if (method === "GET" && rest === "") return ok(scenario === "drift" ? driftedSite() : mockSite());
  if (method === "GET" && rest === "/scheduled") {
    const pageSize = Number(url.searchParams.get("pageSize")) || null;
    return outcome(store.scheduled(scenario !== "manual", pageSize));
  }
  if (method === "GET" && rest === "/website/categories") return outcome(store.categories());

  if (rest === "/posts" && method === "GET") {
    const statuses = url.searchParams.get("status")?.split(",").filter(Boolean) ?? null;
    const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize")) || 25));
    const listed = store.listPosts(statuses, page, pageSize, url.searchParams.get("sort"));
    return listed.ok ? { status: 200, json: { ok: true, data: listed.data.items, meta: listed.data.meta } } : outcome(listed);
  }
  if (rest === "/posts/bulk" && method === "POST") {
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
    return outcome(store.bulk(String(body.action ?? ""), ids, optionalText(body.note), actor));
  }

  const postRoute = /^\/posts\/([^/]+)(\/.*)?$/.exec(rest);
  if (postRoute) {
    const id = decodeURIComponent(postRoute[1]);
    const action = postRoute[2] ?? "";
    if (action === "" && method === "GET") return outcome(store.getPost(id));
    if (action === "" && method === "PUT") return outcome(store.updatePost(id, body, actor));
    if (action === "" && method === "DELETE") return outcome(store.remove(id, actor));
    if (action === "/approve" && method === "POST") return outcome(store.approve(id, optionalText(body.overrideReason), actor));
    if (action === "/changes" && method === "POST") return outcome(store.requestChanges(id, String(body.note ?? ""), actor));
    if (action === "/reject" && method === "POST") return outcome(store.reject(id, optionalText(body.note), actor));
    if (action === "/lock" && method === "POST") return outcome(store.lock(id, actor));
    if (action === "/lock" && method === "DELETE") return outcome(store.unlock(id, actor));
    if (action === "/takeover" && method === "POST") return outcome(store.takeover(id, actor));
    if (action === "/publish" && method === "POST") return outcome(store.publish(id, actor));
    if (action === "/hold" && method === "POST") return outcome(store.hold(id, body.hold === true, actor));
  }

  return fail(404, "not_found", `No mock route for ${method} ${path}.`);
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function outcome<T>(result: MockOutcome<T>): Reply {
  if (result.ok) return { status: result.status, json: { ok: true, data: result.data } };
  const { code, message, fields, details } = result;
  return { status: result.status, json: { ok: false, error: { code, message, ...(fields ? { fields } : {}), ...(details ? { details } : {}) } } };
}

function ok(data: unknown): Reply {
  return { status: 200, json: { ok: true, data } };
}

function fail(status: number, code: string, message: string): Reply {
  return { status, json: { ok: false, error: { code, message } } };
}

function send(reply: Reply): Response {
  return Response.json(reply.json, { status: reply.status });
}

/** The site as an engine that changed its shape would send it: `counts` is gone. */
function driftedSite(): Record<string, unknown> {
  const site: Record<string, unknown> = { ...mockSite() };
  delete site.counts;
  return site;
}
