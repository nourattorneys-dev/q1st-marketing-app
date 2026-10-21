import { describe, expect, it } from "vitest";
import { createEngineApi } from "@/lib/engine/api";
import { createEngineClient, type FetchLike } from "@/lib/engine/client";

const BASE = "https://api.example.com/api/v1";
const POST = {
  id: "p_1",
  kind: "blog",
  platform: "website",
  language: "en",
  status: "published",
  title: "One",
  createdAt: "2026-10-21T09:00:00+04:00",
  updatedAt: "2026-10-21T09:00:00+04:00",
  version: 1,
};
const ctx = { actingUser: "sara@example.com", idempotencyKey: "key-12345678" };

type Call = { method: string; path: string; search: string; body: unknown };

/** A fake engine that answers by "METHOD /path" and records what was sent. */
function fakeEngine(routes: Record<string, unknown>) {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init) => {
    const { pathname, search } = new URL(url);
    const path = pathname.replace("/api/v1", "");
    const method = init.method ?? "GET";
    const body = init.body instanceof FormData ? init.body : typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ method, path, search, body });
    const key = `${method} ${path}`;
    if (key === "GET /sites") return Response.json({ ok: true, data: [{ id: "site_1" }] });
    if (!(key in routes)) return Response.json({ ok: false, error: { code: "not_found", message: key } }, { status: 404 });
    return Response.json({ ok: true, data: routes[key], meta: { page: 1, pageSize: 25, total: 3 } });
  };
  const engine = createEngineApi(createEngineClient({ baseUrl: BASE, apiKey: "k", fetch, retryDelaysMs: [0, 0] }));
  return { engine, calls };
}

describe("lists keep the items they can read (Review Focus 4)", () => {
  it("skips a malformed post and counts it", async () => {
    const { engine } = fakeEngine({ "GET /sites/site_1/posts": [POST, { id: 5 }, { ...POST, id: "p_2" }] });
    const list = await engine.listPosts({ statuses: ["published"] });
    expect(list.posts.map((post) => post.id)).toEqual(["p_1", "p_2"]);
    expect(list.skipped).toBe(1);
    expect(list.meta?.total).toBe(3);
  });

  it("asks for the page and the sort order", async () => {
    const { engine, calls } = fakeEngine({ "GET /sites/site_1/posts": [] });
    await engine.listPosts({ statuses: ["published", "failed"], page: 2, pageSize: 25, sort: "-updated_at" });
    const query = new URLSearchParams(calls.at(-1)?.search);
    expect([query.get("status"), query.get("page"), query.get("pageSize"), query.get("sort")]).toEqual(["published,failed", "2", "25", "-updated_at"]);
  });

  it("skips a malformed post in the publishing queue", async () => {
    const queued = { ...POST, status: "approved", schedule: { hold: false, scheduledAt: null, position: 1 }, actions: ["hold", "publishNow"] };
    const { engine } = fakeEngine({
      "GET /sites/site_1/scheduled": { autoPublish: true, nextSlotAt: null, waitingReason: "queue_empty", posts: [queued, { title: 7 }] },
    });
    const scheduled = await engine.scheduled();
    expect(scheduled.posts.map((post) => [post.id, post.actions])).toEqual([["p_1", ["hold", "publishNow"]]]);
    expect(scheduled.skipped).toBe(1);
  });
});

describe("publishing, photo and export calls (spec v1.1 §7)", () => {
  it("publishes, holds and bulk-publishes", async () => {
    const { engine, calls } = fakeEngine({
      "POST /sites/site_1/posts/p_1/publish": POST,
      "POST /sites/site_1/posts/p_1/hold": POST,
      "POST /sites/site_1/posts/bulk": { done: ["p_1"], failed: [] },
    });
    await engine.publishPost("p_1", ctx);
    await engine.holdPost("p_1", true, ctx);
    await engine.bulkPosts("publishNow", ["p_1"], undefined, ctx);
    expect(calls.filter((call) => call.method === "POST").map((call) => [call.path, call.body])).toEqual([
      ["/sites/site_1/posts/p_1/publish", {}],
      ["/sites/site_1/posts/p_1/hold", { hold: true }],
      ["/sites/site_1/posts/bulk", { action: "publishNow", ids: ["p_1"] }],
    ]);
  });

  it("searches, picks, uploads and removes photos", async () => {
    const image = { url: "https://images.example/1.jpg", alt: "Court", credit: "Photo by A on Pexels", source: "pexels", pexelsId: 12 };
    const { engine, calls } = fakeEngine({
      "GET /sites/site_1/photos/search": [
        { pexelsId: 12, thumb: "t", full: "f", width: 4000, height: 2667, photographer: "A", photographerUrl: "u", alt: "Court" },
      ],
      "POST /sites/site_1/posts/p_1/image/pick": image,
      "POST /sites/site_1/posts/p_1/image": { ...image, source: "upload", pexelsId: null },
      "DELETE /sites/site_1/posts/p_1/image": { removed: true },
    });

    expect((await engine.searchPhotos("court building", 2))[0].pexelsId).toBe(12);
    const query = new URLSearchParams(calls.at(-1)?.search);
    expect([query.get("q"), query.get("page")]).toEqual(["court building", "2"]);

    await engine.pickPhoto("p_1", 12, "Court", ctx);
    expect(calls.at(-1)?.body).toEqual({ pexelsId: 12, alt: "Court" });

    const uploaded = await engine.uploadPhoto("p_1", { file: new File(["x"], "a.png", { type: "image/png" }), alt: "Court" }, ctx);
    expect(uploaded.source).toBe("upload");
    const form = calls.at(-1)?.body as FormData;
    expect((form.get("file") as File).name).toBe("a.png");
    expect(form.get("alt")).toBe("Court");

    await expect(engine.removePhoto("p_1", ctx)).resolves.toEqual({ removed: true });
  });

  it("exports a post as a file", async () => {
    const fetch: FetchLike = async (url) =>
      new URL(url).pathname.endsWith("/sites")
        ? Response.json({ ok: true, data: [{ id: "site_1" }] })
        : new Response("<h1>One</h1>", { headers: { "Content-Type": "text/html; charset=utf-8", "Content-Disposition": 'attachment; filename="one.html"' } });
    const engine = createEngineApi(createEngineClient({ baseUrl: BASE, apiKey: "k", fetch, retryDelaysMs: [0, 0] }));
    await expect(engine.exportPost("p_1", "html")).resolves.toEqual({ body: "<h1>One</h1>", contentType: "text/html; charset=utf-8", filename: "one.html" });
  });
});
