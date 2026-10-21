import { z } from "zod";
import type { EngineClient } from "./client";
import { EngineError } from "./errors";
import { ENGINE_ID } from "./ids";
import {
  BulkResultSchema,
  CategoriesSchema,
  DeletedSchema,
  JobSchema,
  JobStartSchema,
  LockSchema,
  MetaSchema,
  parseItems,
  PhotosSchema,
  PlanSchema,
  PostImageSchema,
  PostSchema,
  ReleasedSchema,
  RemovedSchema,
  ScheduledSchema,
  SiteRefsSchema,
  SiteSchema,
  type PostUpdate,
} from "./schemas";

/** Memoises an argument-less read for the life of one API instance (one request). */
function once<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined;
  return () => (pending ??= load());
}

/** Who made a change (audit log) and the key that makes a retried change safe (spec v1.1 §3). */
export type ChangeContext = { actingUser: string; idempotencyKey: string };

/** Bulk actions on posts (spec v1.1 §3 Bulk actions, §7 POST …/posts/bulk). */
export const BULK_ACTIONS = ["approve", "reject", "delete", "publishNow", "hold", "resume"] as const;
export type BulkAction = (typeof BULK_ACTIONS)[number];

/** Ids become URL path segments; anything but an engine id (e.g. "..") would address a different endpoint. */
function idSegment(id: string): string {
  if (!ENGINE_ID.test(id)) throw new EngineError({ status: 404, code: "not_found", message: "No such item." });
  return id;
}

export function createEngineApi(client: EngineClient) {
  const siteId = once(async () => {
    const { data } = await client.request({ method: "GET", path: "/sites", schema: SiteRefsSchema });
    const first = data[0];
    if (!first) throw new EngineError({ status: 404, code: "not_found", message: "This API key has no site." });
    return first.id;
  });

  const sitePath = async () => `/sites/${encodeURIComponent(await siteId())}`;

  /** One raw read of the site per request; each section validates only the fields it uses. */
  const siteRaw = once(async () => (await client.request({ method: "GET", path: await sitePath(), schema: z.unknown() })).data);

  async function sitePart<S extends z.ZodType>(schema: S): Promise<z.infer<S>> {
    const parsed = schema.safeParse(await siteRaw());
    if (!parsed.success) {
      throw new EngineError({
        status: 200,
        code: "invalid_response",
        message: "The content engine sent data in an unexpected format.",
        details: { issues: z.prettifyError(parsed.error) },
      });
    }
    return parsed.data;
  }

  const site = once(() => sitePart(SiteSchema));
  const siteCounts = once(() => sitePart(SiteSchema.pick({ counts: true })));
  const siteTimezone = once(() => sitePart(SiteSchema.pick({ timezone: true })));
  const siteConnections = once(() => sitePart(SiteSchema.pick({ connections: true })));

  const meta = once(async () => (await client.request({ method: "GET", path: "/meta", schema: MetaSchema })).data);
  const plan = once(async () => (await client.request({ method: "GET", path: "/account/plan", schema: PlanSchema })).data);

  async function scheduled(options: { pageSize?: number } = {}) {
    const { data } = await client.request({
      method: "GET",
      path: `${await sitePath()}/scheduled`,
      schema: ScheduledSchema,
      query: { pageSize: options.pageSize },
    });
    return data;
  }

  const postPath = async (id: string, suffix = "") => {
    const segment = idSegment(id);
    return `${await sitePath()}/posts/${segment}${suffix}`;
  };

  async function listPosts(options: { statuses: string[]; page?: number; pageSize?: number; sort?: string }) {
    const { data, meta } = await client.request({
      method: "GET",
      path: `${await sitePath()}/posts`,
      schema: z.array(z.unknown()),
      query: { status: options.statuses.join(","), page: options.page, pageSize: options.pageSize, sort: options.sort },
    });
    const { items, skipped } = parseItems(data, PostSchema);
    return { posts: items, skipped, meta };
  }

  const post = async (id: string) => (await client.request({ method: "GET", path: await postPath(id), schema: PostSchema })).data;

  const savePost = async (id: string, update: PostUpdate, ctx: ChangeContext) =>
    (await client.request({ method: "PUT", path: await postPath(id), schema: PostSchema, body: update, ...ctx })).data;

  const approvePost = async (id: string, overrideReason: string | undefined, ctx: ChangeContext) =>
    (await client.request({ method: "POST", path: await postPath(id, "/approve"), schema: PostSchema, body: { overrideReason }, ...ctx }))
      .data;

  const requestChanges = async (id: string, note: string, ctx: ChangeContext) =>
    (await client.request({ method: "POST", path: await postPath(id, "/changes"), schema: JobStartSchema, body: { note }, ...ctx })).data;

  const rejectPost = async (id: string, note: string | undefined, ctx: ChangeContext) =>
    (await client.request({ method: "POST", path: await postPath(id, "/reject"), schema: PostSchema, body: { note }, ...ctx })).data;

  const deletePost = async (id: string, ctx: ChangeContext) =>
    (await client.request({ method: "DELETE", path: await postPath(id), schema: DeletedSchema, ...ctx })).data;

  const lockPost = async (id: string, ctx: ChangeContext) =>
    (await client.request({ method: "POST", path: await postPath(id, "/lock"), schema: LockSchema, body: {}, ...ctx })).data;

  const unlockPost = async (id: string, ctx: ChangeContext) =>
    (await client.request({ method: "DELETE", path: await postPath(id, "/lock"), schema: ReleasedSchema, ...ctx })).data;

  const takeoverPost = async (id: string, ctx: ChangeContext) =>
    (await client.request({ method: "POST", path: await postPath(id, "/takeover"), schema: PostSchema, body: {}, ...ctx })).data;

  const bulkPosts = async (action: BulkAction, ids: string[], note: string | undefined, ctx: ChangeContext) =>
    (
      await client.request({
        method: "POST",
        path: `${await sitePath()}/posts/bulk`,
        schema: BulkResultSchema,
        body: { action, ids, note },
        ...ctx,
      })
    ).data;

  const publishPost = async (id: string, ctx: ChangeContext) =>
    (await client.request({ method: "POST", path: await postPath(id, "/publish"), schema: PostSchema, body: {}, ...ctx })).data;

  const holdPost = async (id: string, hold: boolean, ctx: ChangeContext) =>
    (await client.request({ method: "POST", path: await postPath(id, "/hold"), schema: PostSchema, body: { hold }, ...ctx })).data;

  const searchPhotos = async (query: string, page = 1) =>
    (await client.request({ method: "GET", path: `${await sitePath()}/photos/search`, schema: PhotosSchema, query: { q: query, page } })).data;

  const pickPhoto = async (id: string, pexelsId: number, alt: string | undefined, ctx: ChangeContext) =>
    (await client.request({ method: "POST", path: await postPath(id, "/image/pick"), schema: PostImageSchema, body: { pexelsId, alt }, ...ctx }))
      .data;

  async function uploadPhoto(id: string, upload: { file: File; alt?: string; credit?: string }, ctx: ChangeContext) {
    const form = new FormData();
    form.set("file", upload.file);
    if (upload.alt) form.set("alt", upload.alt);
    if (upload.credit) form.set("credit", upload.credit);
    return (await client.request({ method: "POST", path: await postPath(id, "/image"), schema: PostImageSchema, form, ...ctx })).data;
  }

  const removePhoto = async (id: string, ctx: ChangeContext) =>
    (await client.request({ method: "DELETE", path: await postPath(id, "/image"), schema: RemovedSchema, ...ctx })).data;

  const exportPost = async (id: string, format: "html" | "md") => client.requestFile({ path: await postPath(id, `/export.${format}`) });

  const job = async (id: string) =>
    (await client.request({ method: "GET", path: `/jobs/${idSegment(id)}`, schema: JobSchema })).data;

  const categories = once(
    async () => (await client.request({ method: "GET", path: `${await sitePath()}/website/categories`, schema: CategoriesSchema })).data,
  );

  return {
    siteId,
    meta,
    site,
    siteCounts,
    siteTimezone,
    siteConnections,
    plan,
    scheduled,
    listPosts,
    post,
    savePost,
    approvePost,
    requestChanges,
    rejectPost,
    deletePost,
    lockPost,
    unlockPost,
    takeoverPost,
    bulkPosts,
    publishPost,
    holdPost,
    searchPhotos,
    pickPhoto,
    uploadPhoto,
    removePhoto,
    exportPost,
    job,
    categories,
  };
}

export type EngineApi = ReturnType<typeof createEngineApi>;
