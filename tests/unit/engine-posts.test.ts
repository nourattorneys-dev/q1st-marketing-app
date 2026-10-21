import { beforeEach, describe, expect, it } from "vitest";
import { createEngineApi, type ChangeContext } from "@/lib/engine/api";
import { createEngineClient } from "@/lib/engine/client";
import { EngineError } from "@/lib/engine/errors";
import { mockStoreFor } from "@/lib/engine/mock/registry";
import { createMockFetch } from "@/lib/engine/mock/server";
import { createMockStore } from "@/lib/engine/mock/store";
import { MetaSchema, type PostUpdate } from "@/lib/engine/schemas";

const BASE = "https://mock.engine.local/api/v1";
let t = Date.parse("2026-10-22T08:00:00Z");

function setup() {
  const store = createMockStore({ now: () => t, jobDurationMs: 1000 });
  const client = createEngineClient({
    baseUrl: BASE,
    apiKey: "mock-key",
    retryDelaysMs: [0, 0],
    fetch: createMockFetch({ baseUrl: BASE, apiKey: "mock-key", store }),
  });
  return { client, engine: createEngineApi(client) };
}

let counter = 0;
const ctx = (actingUser = "reviewer@example.com"): ChangeContext => ({ actingUser, idempotencyKey: `key-${++counter}` });

async function failure(promise: Promise<unknown>): Promise<EngineError> {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(EngineError);
  return error as EngineError;
}

function updateFrom(post: { title: string; version: number } & Record<string, unknown>, changes: Partial<PostUpdate>): PostUpdate {
  return {
    title: post.title,
    subtitle: (post.subtitle as string | null | undefined) ?? null,
    slug: (post.slug as string | null | undefined) ?? null,
    metaTitle: (post.metaTitle as string | null | undefined) ?? null,
    metaDescription: (post.metaDescription as string | null | undefined) ?? null,
    keywords: (post.keywords as string[]) ?? [],
    content: (post.content as string | null | undefined) ?? "",
    hashtags: (post.hashtags as string[]) ?? [],
    section: (post.section as string | null | undefined) ?? null,
    version: post.version,
    ...changes,
  };
}

beforeEach(() => {
  t = Date.parse("2026-10-22T08:00:00Z");
});

describe("posts over the mock engine", () => {
  it("lists posts by status with paging meta", async () => {
    const { engine } = setup();
    const { posts, meta } = await engine.listPosts({ statuses: ["drafting"], pageSize: 10 });
    expect(posts.map((p) => p.id)).toEqual(["p_207"]);
    expect(meta).toEqual({ page: 1, pageSize: 10, total: 1 });
  });

  it("reads one post with its content and actions", async () => {
    const post = await setup().engine.post("p_201");
    expect(post.content).toContain("<table>");
    expect(post.actions).toContain("approve");
  });

  it("saves with the version and reports a conflict for a stale one", async () => {
    const { engine } = setup();
    const post = await engine.post("p_201");
    const saved = await engine.savePost("p_201", updateFrom(post, { title: "Updated" }), ctx());
    expect(saved).toMatchObject({ title: "Updated", version: post.version + 1 });
    const stale = await failure(engine.savePost("p_201", updateFrom(post, { title: "Late" }), ctx()));
    expect(stale).toMatchObject({ status: 409, code: "version_conflict" });
  });

  it("returns the blocking findings when approval is refused", async () => {
    const error = await failure(setup().engine.approvePost("p_203", undefined, ctx()));
    expect(error.code).toBe("framework_blocked");
    expect(error.details?.findings).toEqual([expect.objectContaining({ code: "meta_description_length" })]);
  });

  it("replays a repeated idempotency key instead of approving twice (Review Focus 3)", async () => {
    const { engine } = setup();
    const once = ctx();
    const first = await engine.approvePost("p_201", undefined, once);
    const replay = await engine.approvePost("p_201", undefined, once);
    expect(replay).toEqual(first);
    const misuse = await failure(engine.approvePost("p_204", undefined, once));
    expect(misuse).toMatchObject({ status: 422, code: "idempotency_mismatch" });
  });

  it("requires the acting user on changes", async () => {
    const { client } = setup();
    const error = await failure(
      client.request({ method: "POST", path: "/sites/site_fakher/posts/p_201/approve", schema: MetaSchema, body: {} }),
    );
    expect(error).toMatchObject({ status: 400, code: "invalid_input" });
  });

  it("starts a redraft job and reports it done when the time is up", async () => {
    const { engine } = setup();
    const start = await engine.requestChanges("p_201", "Shorter intro", ctx());
    expect(start.postIds).toEqual(["p_201"]);
    expect((await engine.job(start.jobId)).status).not.toBe("done");
    t += 1000;
    expect(await engine.job(start.jobId)).toMatchObject({ status: "done", progress: 1 });
    expect((await engine.post("p_201")).status).toBe("pending");
  });

  it("locks, reports the holder to others, and lets them take over", async () => {
    const { engine } = setup();
    await engine.lockPost("p_201", ctx("omar@example.com"));
    const locked = await failure(engine.lockPost("p_201", ctx()));
    expect(locked).toMatchObject({ status: 409, code: "locked", details: { lockedBy: "omar@example.com" } });
    const taken = await engine.takeoverPost("p_201", ctx());
    expect(taken.lock?.by).toBe("reviewer@example.com");
    expect(await engine.unlockPost("p_201", ctx())).toEqual({ released: true });
  });

  it("rejects, deletes and runs bulk actions", async () => {
    const { engine } = setup();
    expect((await engine.rejectPost("p_206", "Off-topic", ctx())).status).toBe("rejected");
    expect(await engine.deletePost("p_206", ctx())).toEqual({ deleted: true });
    const bulk = await engine.bulkPosts("approve", ["p_201", "p_203"], undefined, ctx());
    expect(bulk.done).toEqual(["p_201"]);
    expect(bulk.failed[0]).toMatchObject({ id: "p_203", code: "framework_blocked" });
  });

  it("lists the website's categories", async () => {
    expect((await setup().engine.categories()).map((c) => c.slug)).toContain("labour-law");
  });
});

describe("mock store registry", () => {
  it("keeps one store per namespace and falls back to default for odd names", () => {
    expect(mockStoreFor("test-a")).toBe(mockStoreFor("test-a"));
    expect(mockStoreFor("test-a")).not.toBe(mockStoreFor("test-b"));
    expect(mockStoreFor("../etc")).toBe(mockStoreFor(undefined));
  });
});

describe("ids in engine URLs (final review: path traversal)", () => {
  it("refuses an id that would address another endpoint, before any request", async () => {
    const requested: string[] = [];
    const store = createMockStore({ now: () => t, jobDurationMs: 1000 });
    const mock = createMockFetch({ baseUrl: BASE, apiKey: "mock-key", store });
    const client = createEngineClient({
      baseUrl: BASE,
      apiKey: "mock-key",
      retryDelaysMs: [0, 0],
      fetch: (input, init) => {
        requested.push(String(input));
        return mock(input, init);
      },
    });
    const engine = createEngineApi(client);
    for (const id of ["..", ".", "a/b"]) {
      expect((await failure(engine.post(id))).code).toBe("not_found");
      expect((await failure(engine.deletePost(id, ctx()))).code).toBe("not_found");
    }
    expect((await failure(engine.job(".."))).code).toBe("not_found");
    expect(requested).toEqual([]);
  });
});

describe("publishing over the mock engine (spec v1.1 §10: one publication per key)", () => {
  it("publishing again with the same key returns the first result instead of publishing twice", async () => {
    const { engine } = setup();
    const key = { actingUser: "reviewer@example.com", idempotencyKey: "publish-p_101-once" };
    const first = await engine.publishPost("p_101", key);
    const again = await engine.publishPost("p_101", key);
    expect(again).toEqual(first);
    expect((await engine.post("p_101")).version).toBe(first.version);
    const published = await engine.listPosts({ statuses: ["published"] });
    expect(published.posts.filter((post) => post.id === "p_101")).toHaveLength(1);
  });

  it("after publish_failed the same key replays the failure; a new key tries again (design §9)", async () => {
    const { engine } = setup();
    const key = ctx();
    expect((await failure(engine.publishPost("p_303", key))).code).toBe("publish_failed");
    expect((await failure(engine.publishPost("p_303", key))).code).toBe("publish_failed");
    expect((await engine.publishPost("p_303", ctx())).status).toBe("published");
  });

  it("serves the queue from the store, with hold", async () => {
    const { engine } = setup();
    await engine.holdPost("p_101", true, ctx());
    const queue = await engine.scheduled();
    expect(queue.posts.map((post) => [post.id, post.schedule?.hold, post.schedule?.scheduledAt])).toEqual([
      ["p_101", true, null],
      ["p_102", false, "2026-10-22T10:00:00+04:00"],
      ["p_103", true, null],
    ]);
    expect(queue.skipped).toBe(0);
  });
});

// A 1×1 transparent PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

describe("photos and export over the mock engine", () => {
  it("uploads a photo as multipart; a wrong type comes back with the engine's message", async () => {
    const { engine } = setup();
    const refused = await failure(engine.uploadPhoto("p_201", { file: new File(["hello"], "notes.txt", { type: "text/plain" }) }, ctx()));
    expect(refused).toMatchObject({ status: 400, code: "invalid_input", message: "Only JPEG, PNG or WebP photos can be uploaded." });
    const image = await engine.uploadPhoto("p_201", { file: new File([PNG], "pixel.png", { type: "image/png" }), alt: "A pixel" }, ctx());
    expect(image).toMatchObject({ source: "upload", alt: "A pixel" });
    expect(image.url.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("exports Markdown as a file with the post's name", async () => {
    const { engine } = setup();
    const file = await engine.exportPost("p_201", "md");
    expect(file.filename).toBe("commission-payable-uae-labour-law.md");
    expect(file.body).toContain("## When the commission is earned");
  });
});
