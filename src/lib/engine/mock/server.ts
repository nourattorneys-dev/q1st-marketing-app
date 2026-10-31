import type { FetchLike } from "../client";
import { MOCK_SITE_ID, mockMeta, mockPlan, mockSite } from "./fixtures";
import { createMockStore, type ExportFile, type MockOutcome, type MockStore, type UploadedFile } from "./store";
import { mockUsage } from "./usage";

/**
 * normal · unauthorized (revoked key) · down (unreachable) · drift (changed shapes) · manual (auto-publish off)
 * · crash (a non-engine error) · quota (monthly limits reached: articles for drafting, aiTokens for AI proposals, siteScans for scans)
 * · firstrun (a store created with no website or social connection) · performance (the feature, with Search Console).
 */
export type MockScenario = "normal" | "unauthorized" | "down" | "drift" | "manual" | "crash" | "quota" | "firstrun" | "performance";
const MOCK_SCENARIOS: readonly MockScenario[] = ["normal", "unauthorized", "down", "drift", "manual", "crash", "quota", "firstrun", "performance"];
export const MOCK_SCENARIO_COOKIE = "mock_scenario";

export function isMockScenario(value: unknown): value is MockScenario {
  return typeof value === "string" && (MOCK_SCENARIOS as readonly string[]).includes(value);
}

type MockOptions = { baseUrl: string; apiKey: string; scenario?: MockScenario; store?: MockStore };
type Reply = { status: number; json?: unknown; file?: ExportFile };

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
    const form = init.body instanceof FormData ? init.body : null;
    const text = typeof init.body === "string" ? init.body : "";

    if (method === "GET") return send(route(method, path, url, {}, "", scenario, store));

    const actor = headers.get("X-Acting-User");
    if (!actor) return send(fail(400, "invalid_input", "X-Acting-User is required for changes."));
    const key = headers.get("Idempotency-Key");
    if (!key) return send(fail(400, "invalid_input", "Idempotency-Key is required for changes."));

    const fingerprint = `${method} ${path} ${form ? describeForm(form) : text}`;
    const seen = store.idempotency.get(key);
    if (seen) {
      return seen.fingerprint === fingerprint
        ? send({ status: seen.status, json: seen.json })
        : send(fail(422, "idempotency_mismatch", "This Idempotency-Key was already used for a different request."));
    }

    let parsed: Record<string, unknown> = {};
    if (form) {
      parsed = await readForm(form);
    } else {
      try {
        parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
      } catch {
        return send(fail(400, "invalid_input", "The request body isn't valid JSON."));
      }
    }

    const reply = route(method, path, url, parsed, actor, scenario, store);
    store.idempotency.set(key, { fingerprint, status: reply.status, json: reply.json });
    return send(reply);
  };
}

/** With the "drift" scenario, lists also carry a post in a shape the portal doesn't know (Review Focus 4). */
const DRIFTED_POST = { id: "p_drift", title: 42 };

/** Requests that draft with AI, refused with 429 in the "quota" scenario (design §9). */
const DRAFTING_ROUTE = /^\/(keywords\/draft-articles|drafts|suggestions\/bulk|suggestions\/[^/]+\/draft)$/;

/** A 429 for a metered request in the "quota" scenario: the metric's limit is reached (design §9). */
function quotaRefusal(metric: string): Reply {
  const limit = mockPlan().quotas.find((quota) => quota.metric === metric)?.limit ?? 0;
  return {
    status: 429,
    json: { ok: false, error: { code: "quota_exceeded", message: `Monthly limit reached for ${metric}.`, details: { metric, used: limit, limit } } },
  };
}

/** The plan as it looks in the "quota" scenario: every hard quota is at its limit. */
function planAtLimit() {
  const plan = mockPlan();
  return { ...plan, quotas: plan.quotas.map((quota) => (quota.mode === "hard" && quota.limit !== null ? { ...quota, used: quota.limit } : quota)) };
}

/** The site, with the connections the settings store has (spec v1.1 §4 Site.connections). */
function siteOf(store: MockStore, scenario: MockScenario) {
  return { ...mockSite(), connections: store.settings.connections(scenario === "performance") };
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
  if (method === "GET" && path === "/meta") return ok(scenario === "performance" ? { ...mockMeta(), features: ["performance"] } : mockMeta());
  if (method === "GET" && path === "/sites") return ok([scenario === "drift" ? driftedSite() : siteOf(store, scenario)]);
  if (method === "GET" && path === "/account/plan") return ok(scenario === "quota" ? planAtLimit() : mockPlan());
  if (method === "POST" && path === "/account/upgrade-request") return ok({ requested: true });
  if (method === "GET" && path === "/account/usage") {
    const usage = mockUsage(url.searchParams.get("from") ?? "", url.searchParams.get("to") ?? "");
    return usage ? ok(usage) : fail(400, "invalid_input", "Use months like 2026-05, with from no later than to.");
  }

  const jobRoute = /^\/jobs\/([^/]+)$/.exec(path);
  if (jobRoute && method === "GET") return outcome(store.job(decodeURIComponent(jobRoute[1])));

  const siteRoute = /^\/sites\/([^/]+)(\/.*)?$/.exec(path);
  if (!siteRoute) return fail(404, "not_found", `No mock route for ${method} ${path}.`);
  if (decodeURIComponent(siteRoute[1]) !== MOCK_SITE_ID) return fail(404, "not_found", "Site not found.");
  const rest = siteRoute[2] ?? "";

  if (method === "GET" && rest === "") return ok(scenario === "drift" ? driftedSite() : siteOf(store, scenario));
  if (method === "GET" && rest === "/scheduled") {
    const pageSize = Number(url.searchParams.get("pageSize")) || null;
    const queue = store.scheduled(scenario !== "manual", pageSize);
    if (queue.ok && scenario === "drift") return ok({ ...queue.data, posts: [...queue.data.posts, DRIFTED_POST] });
    return outcome(queue);
  }
  if (method === "GET" && rest === "/website/categories") return outcome(store.categories());
  if (method === "GET" && rest === "/photos/search") {
    return outcome(store.searchPhotos(url.searchParams.get("q") ?? "", Math.max(1, Number(url.searchParams.get("page")) || 1)));
  }

  const statusesOf = () => url.searchParams.get("status")?.split(",").filter(Boolean) ?? null;
  const pageOf = () => ({
    page: Math.max(1, Number(url.searchParams.get("page")) || 1),
    pageSize: Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize")) || 25)),
  });
  const idsOf = (value: unknown) => (Array.isArray(value) ? value.map(String) : []);

  // The "quota" scenario: scans and AI proposals are metered too (spec v1.1 §4 metrics).
  if (scenario === "quota" && method === "POST" && rest === "/site/scan") return quotaRefusal("siteScans");
  if (scenario === "quota" && method === "POST" && (rest === "/keywords/propose" || rest === "/settings/seo/propose")) return quotaRefusal("aiTokens");
  if (rest === "/site/findings" && method === "GET") {
    const levels = url.searchParams.get("level")?.split(",").filter(Boolean) ?? null;
    const { page, pageSize } = pageOf();
    const listed = store.listFindings(statusesOf(), levels, page, pageSize);
    return listed.ok ? { status: 200, json: { ok: true, data: listed.data.items, meta: listed.data.meta } } : outcome(listed);
  }
  if (rest === "/site/scan" && method === "POST") return outcome(store.scanSite());
  if (rest === "/site/fixes" && method === "POST") return outcome(store.prepareFixes(idsOf(body.ids)));
  if (rest === "/site/findings/bulk" && method === "POST") return outcome(store.bulkFindings(String(body.action ?? ""), idsOf(body.ids)));
  if (rest === "/settings/seo" && method === "GET") return outcome(store.settings.seo());
  if (rest === "/settings/seo" && method === "PUT") return outcome(store.settings.saveSeo(body));
  if (rest === "/settings/seo/propose" && method === "POST") return outcome(store.proposeSeo());
  if (rest === "/settings/seo/picture" && method === "POST") return outcome(store.settings.uploadSeoPicture(uploadedFile(body.file)));
  if (rest === "/settings/seo/picture" && method === "DELETE") return outcome(store.settings.removeSeoPicture());
  if (rest === "/settings/publishing" && method === "GET") return outcome(store.settings.publishing());
  if (rest === "/settings/publishing" && method === "PUT") return outcome(store.settings.savePublishing(body));
  if (rest === "/settings/website" && method === "GET") return outcome(store.settings.website());
  if (rest === "/settings/website" && method === "PUT") return outcome(store.settings.saveWebsite(body));
  if (rest === "/settings/website/test" && method === "POST") return outcome(store.settings.testWebsite(body));
  if (rest === "/settings/social" && method === "GET") return outcome(store.settings.socialList());
  if (rest === "/webhook" && method === "GET") return outcome(store.settings.webhook());
  if (rest === "/webhook" && method === "PUT") return outcome(store.settings.saveWebhook(body));
  if (rest.startsWith("/settings/search-console") && scenario !== "performance") return fail(404, "not_found", "Search Console needs the performance feature.");
  if (rest === "/settings/search-console/connect" && method === "GET") {
    return outcome(store.settings.connectSearchConsole(url.searchParams.get("returnUrl") ?? ""));
  }
  if (rest === "/settings/search-console" && method === "DELETE") return outcome(store.settings.disconnectSearchConsole());
  const socialRoute = /^\/settings\/social\/([^/]+)(\/connect)?$/.exec(rest);
  if (socialRoute?.[2] && method === "GET") {
    return outcome(store.settings.connectSocial(decodeURIComponent(socialRoute[1]), url.searchParams.get("returnUrl") ?? ""));
  }
  if (socialRoute && !socialRoute[2] && method === "DELETE") return outcome(store.settings.disconnectSocial(decodeURIComponent(socialRoute[1])));
  if (rest === "/keywords" && method === "GET") {
    const { page, pageSize } = pageOf();
    const listed = store.listKeywords(statusesOf(), page, pageSize);
    return listed.ok ? { status: 200, json: { ok: true, data: listed.data.items, meta: listed.data.meta } } : outcome(listed);
  }
  if (rest === "/keywords" && method === "POST") return outcome(store.addKeywords(body.phrases, body.language, actor));
  if (rest === "/keywords/bulk" && method === "POST") return outcome(store.bulkKeywords(String(body.action ?? ""), idsOf(body.ids)));
  if (rest === "/suggestions" && method === "GET") {
    const listed = store.listSuggestions(statusesOf());
    if (!listed.ok) return outcome(listed);
    const { page, pageSize } = pageOf();
    const items = listed.data.slice((page - 1) * pageSize, page * pageSize);
    return { status: 200, json: { ok: true, data: items, meta: { page, pageSize, total: listed.data.length } } };
  }
  const draftingRequest = method === "POST" && DRAFTING_ROUTE.test(rest) && !(rest === "/suggestions/bulk" && body.action !== "draft");
  if (scenario === "quota" && draftingRequest) return quotaRefusal("articles");
  if (rest === "/keywords/propose" && method === "POST") return outcome(store.proposeKeywords(body.language));
  if (rest === "/keywords/topics" && method === "POST") return outcome(store.keywordTopics(idsOf(body.ids)));
  if (rest === "/keywords/draft-articles" && method === "POST") return outcome(store.draftKeywordArticles(idsOf(body.ids), body.language, actor));
  if (rest === "/suggestions/bulk" && method === "POST") return outcome(store.bulkSuggestions(String(body.action ?? ""), idsOf(body.ids), body.language, actor));
  if (rest === "/drafts" && method === "POST") return outcome(store.createDrafts(body, actor));

  const suggestionRoute = /^\/suggestions\/([^/]+)(\/.*)?$/.exec(rest);
  if (suggestionRoute && suggestionRoute[1] !== "bulk") {
    const id = decodeURIComponent(suggestionRoute[1]);
    if (suggestionRoute[2] === "/dismiss" && method === "POST") return outcome(store.dismissSuggestion(id));
    if (suggestionRoute[2] === "/draft" && method === "POST") return outcome(store.draftSuggestion(id, body.language, actor));
  }

  if (rest === "/posts" && method === "GET") {
    const statuses = url.searchParams.get("status")?.split(",").filter(Boolean) ?? null;
    const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize")) || 25));
    const listed = store.listPosts(statuses, page, pageSize, url.searchParams.get("sort"));
    if (!listed.ok) return outcome(listed);
    const items = scenario === "drift" ? [...listed.data.items, DRIFTED_POST] : listed.data.items;
    return { status: 200, json: { ok: true, data: items, meta: listed.data.meta } };
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
    if (action === "/image/pick" && method === "POST") return outcome(store.pickPhoto(id, Number(body.pexelsId), optionalText(body.alt), actor));
    if (action === "/image" && method === "POST") {
      return outcome(store.uploadPhoto(id, uploadedFile(body.file), optionalText(body.alt), optionalText(body.credit), actor));
    }
    if (action === "/image" && method === "DELETE") return outcome(store.removePhoto(id, actor));
    const exportFormat = /^\/export\.([a-z]+)$/.exec(action);
    if (exportFormat && method === "GET") {
      const file = store.exportPost(id, exportFormat[1]);
      return file.ok ? { status: 200, file: file.data } : outcome(file);
    }
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
  if (reply.file) {
    const { body, contentType, filename } = reply.file;
    const ascii = filename.replace(/[^\x20-\x7e]|"/g, "_");
    return new Response(body, {
      status: reply.status,
      headers: { "Content-Type": contentType, "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}` },
    });
  }
  return Response.json(reply.json, { status: reply.status });
}

/** Multipart fields as plain values; a file becomes its name, type, size and a data URL (the mock keeps uploads in memory). */
async function readForm(form: FormData): Promise<Record<string, unknown>> {
  const fields: Record<string, unknown> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") {
      fields[key] = value;
    } else {
      const base64 = Buffer.from(await value.arrayBuffer()).toString("base64");
      fields[key] = { name: value.name, type: value.type, size: value.size, dataUrl: `data:${value.type || "application/octet-stream"};base64,${base64}` };
    }
  }
  return fields;
}

/** What a multipart request asked for, for the idempotency check: the fields, and each file by name, type and size. */
function describeForm(form: FormData): string {
  return [...form.entries()].map(([key, value]) => (typeof value === "string" ? `${key}=${value}` : `${key}=${value.name}:${value.type}:${value.size}`)).join("&");
}

function uploadedFile(value: unknown): UploadedFile | null {
  if (typeof value !== "object" || value === null) return null;
  const file = value as Partial<UploadedFile>;
  return typeof file.name === "string" && typeof file.type === "string" && typeof file.size === "number" && typeof file.dataUrl === "string"
    ? (file as UploadedFile)
    : null;
}

/** The site as an engine that changed its shape would send it: `counts` is gone. */
function driftedSite(): Record<string, unknown> {
  const site: Record<string, unknown> = { ...mockSite() };
  delete site.counts;
  return site;
}
