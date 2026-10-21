import { z } from "zod";
import type { EngineClient } from "./client";
import { EngineError } from "./errors";
import { ENGINE_ID } from "./ids";
import {
  AuthorizeSchema,
  BulkResultSchema,
  CategoriesSchema,
  DeletedSchema,
  DisconnectedSchema,
  JobSchema,
  JobStartSchema,
  KeywordSchema,
  LockSchema,
  MetaSchema,
  parseItems,
  PhotosSchema,
  PictureSchema,
  PlanSchema,
  PostImageSchema,
  PostSchema,
  PublishingSettingsSchema,
  PublishTargetSchema,
  ReleasedSchema,
  RemovedSchema,
  ScheduledSchema,
  SeoSettingsSchema,
  SiteFindingSchema,
  SiteRefsSchema,
  SiteSchema,
  SocialConnectionSchema,
  SuggestionSchema,
  UpgradeRequestedSchema,
  UsageSchema,
  WebsiteTestSchema,
  type PostUpdate,
  type PublishingSettings,
  type SeoUpdate,
  type WebsiteTargetInput,
  type WebsiteUpdate,
} from "./schemas";

/** Memoises an argument-less read for the life of one API instance (one request). */
function once<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined;
  return () => (pending ??= load());
}

/** Who made a change (audit log) and the key that makes a retried change safe (spec v1.1 §3). */
export type ChangeContext = { actingUser: string; idempotencyKey: string };

/**
 * A publish converts the article and uploads its media to the website, and a bulk action does that for every post, so
 * they (and photo uploads) get far more than the default 10 s per attempt before the client gives up waiting.
 */
const SLOW_CHANGE_MS = 120_000;

/** Bulk actions on posts (spec v1.1 §3 Bulk actions, §7 POST …/posts/bulk). */
export const BULK_ACTIONS = ["approve", "reject", "delete", "publishNow", "hold", "resume"] as const;
export type BulkAction = (typeof BULK_ACTIONS)[number];

/** Keyword bulk actions (spec v1.1 §7 POST …/keywords/bulk). */
export const KEYWORD_BULK_ACTIONS = ["approve", "dismiss", "restore"] as const;
export type KeywordBulkAction = (typeof KEYWORD_BULK_ACTIONS)[number];

/** Suggestion bulk actions (spec v1.1 §7 POST …/suggestions/bulk). */
export const SUGGESTION_BULK_ACTIONS = ["draft", "dismiss"] as const;
export type SuggestionBulkAction = (typeof SUGGESTION_BULK_ACTIONS)[number];

/** Site-health bulk actions (spec v1.1 §7 POST …/site/findings/bulk). */
export const FINDING_BULK_ACTIONS = ["apply", "dismiss"] as const;
export type FindingBulkAction = (typeof FINDING_BULK_ACTIONS)[number];

/** A new draft (spec v1.1 §6 "New request", §7 POST …/drafts). `language` is a site language or "both". */
export type DraftRequest = { topic: string; kind: string; platform: string; language: string; tone?: string; keywords?: string[] };

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
        timeoutMs: SLOW_CHANGE_MS,
        ...ctx,
      })
    ).data;

  const publishPost = async (id: string, ctx: ChangeContext) =>
    (await client.request({ method: "POST", path: await postPath(id, "/publish"), schema: PostSchema, body: {}, timeoutMs: SLOW_CHANGE_MS, ...ctx }))
      .data;

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
    return (await client.request({ method: "POST", path: await postPath(id, "/image"), schema: PostImageSchema, form, timeoutMs: SLOW_CHANGE_MS, ...ctx }))
      .data;
  }

  const removePhoto = async (id: string, ctx: ChangeContext) =>
    (await client.request({ method: "DELETE", path: await postPath(id, "/image"), schema: RemovedSchema, ...ctx })).data;

  const exportPost = async (id: string, format: "html" | "md") => client.requestFile({ path: await postPath(id, `/export.${format}`) });

  const job = async (id: string) =>
    (await client.request({ method: "GET", path: `/jobs/${idSegment(id)}`, schema: JobSchema })).data;

  async function listKeywords(options: { statuses: string[]; page?: number; pageSize?: number }) {
    const { data, meta } = await client.request({
      method: "GET",
      path: `${await sitePath()}/keywords`,
      schema: z.array(z.unknown()),
      query: { status: options.statuses.join(","), page: options.page, pageSize: options.pageSize },
    });
    const { items, skipped } = parseItems(data, KeywordSchema);
    return { keywords: items, skipped, meta };
  }

  const addKeywords = async (phrases: string[], language: string, ctx: ChangeContext) =>
    (await client.request({ method: "POST", path: `${await sitePath()}/keywords`, schema: z.array(KeywordSchema), body: { phrases, language }, ...ctx }))
      .data;

  const bulkKeywords = async (action: KeywordBulkAction, ids: string[], ctx: ChangeContext) =>
    (await client.request({ method: "POST", path: `${await sitePath()}/keywords/bulk`, schema: BulkResultSchema, body: { action, ids }, ...ctx })).data;

  const proposeKeywords = async (language: string | undefined, ctx: ChangeContext) =>
    (await client.request({ method: "POST", path: `${await sitePath()}/keywords/propose`, schema: JobStartSchema, body: { language }, ...ctx })).data;

  const keywordTopics = async (ids: string[], ctx: ChangeContext) =>
    (await client.request({ method: "POST", path: `${await sitePath()}/keywords/topics`, schema: JobStartSchema, body: { ids }, ...ctx })).data;

  const draftKeywordArticles = async (ids: string[], language: string, ctx: ChangeContext) =>
    (
      await client.request({
        method: "POST",
        path: `${await sitePath()}/keywords/draft-articles`,
        schema: JobStartSchema,
        body: { ids, language },
        ...ctx,
      })
    ).data;

  async function listSuggestions(options: { statuses: string[]; page?: number; pageSize?: number }) {
    const { data, meta } = await client.request({
      method: "GET",
      path: `${await sitePath()}/suggestions`,
      schema: z.array(z.unknown()),
      query: { status: options.statuses.join(","), page: options.page, pageSize: options.pageSize },
    });
    const { items, skipped } = parseItems(data, SuggestionSchema);
    return { suggestions: items, skipped, meta };
  }

  const suggestionPath = async (id: string, suffix: string) => {
    const segment = idSegment(id);
    return `${await sitePath()}/suggestions/${segment}${suffix}`;
  };

  const draftSuggestion = async (id: string, language: string, ctx: ChangeContext) =>
    (await client.request({ method: "POST", path: await suggestionPath(id, "/draft"), schema: JobStartSchema, body: { language }, ...ctx })).data;

  const dismissSuggestion = async (id: string, ctx: ChangeContext) =>
    (await client.request({ method: "POST", path: await suggestionPath(id, "/dismiss"), schema: SuggestionSchema, body: {}, ...ctx })).data;

  const bulkSuggestions = async (action: SuggestionBulkAction, ids: string[], language: string | undefined, ctx: ChangeContext) =>
    (
      await client.request({
        method: "POST",
        path: `${await sitePath()}/suggestions/bulk`,
        schema: BulkResultSchema,
        body: { action, ids, language },
        ...ctx,
      })
    ).data;

  const createDrafts = async (request: DraftRequest, ctx: ChangeContext) =>
    (await client.request({ method: "POST", path: `${await sitePath()}/drafts`, schema: JobStartSchema, body: request, ...ctx })).data;

  const requestUpgrade = async (metric: string | undefined, note: string | undefined, ctx: ChangeContext) =>
    (await client.request({ method: "POST", path: "/account/upgrade-request", schema: UpgradeRequestedSchema, body: { metric, note }, ...ctx })).data;

  async function listFindings(options: { statuses: string[]; levels?: string[]; page?: number; pageSize?: number }) {
    const { data, meta } = await client.request({
      method: "GET",
      path: `${await sitePath()}/site/findings`,
      schema: z.array(z.unknown()),
      query: {
        status: options.statuses.join(","),
        level: options.levels?.length ? options.levels.join(",") : undefined,
        page: options.page,
        pageSize: options.pageSize,
      },
    });
    const { items, skipped } = parseItems(data, SiteFindingSchema);
    return { findings: items, skipped, meta };
  }

  const scanSite = async (ctx: ChangeContext) =>
    (await client.request({ method: "POST", path: `${await sitePath()}/site/scan`, schema: JobStartSchema, body: {}, ...ctx })).data;

  const prepareFixes = async (ids: string[], ctx: ChangeContext) =>
    (await client.request({ method: "POST", path: `${await sitePath()}/site/fixes`, schema: JobStartSchema, body: { ids }, ...ctx })).data;

  // Apply changes the live website, so it gets the slow-change limit.
  const bulkFindings = async (action: FindingBulkAction, ids: string[], ctx: ChangeContext) =>
    (
      await client.request({
        method: "POST",
        path: `${await sitePath()}/site/findings/bulk`,
        schema: BulkResultSchema,
        body: { action, ids },
        timeoutMs: SLOW_CHANGE_MS,
        ...ctx,
      })
    ).data;

  /** Spec v1.1 §7: this key's site only; months are YYYY-MM. Quota totals in /account/plan stay account-wide. */
  const usage = async (range: { from: string; to: string }) =>
    (await client.request({ method: "GET", path: "/account/usage", schema: UsageSchema, query: range })).data;

  const settingsPath = async (suffix: string) => `${await sitePath()}/settings${suffix}`;

  const seoSettings = async () => (await client.request({ method: "GET", path: await settingsPath("/seo"), schema: SeoSettingsSchema })).data;

  const saveSeo = async (update: SeoUpdate, ctx: ChangeContext) =>
    (await client.request({ method: "PUT", path: await settingsPath("/seo"), schema: SeoSettingsSchema, body: update, ...ctx })).data;

  /** AI suggestions for focus keywords and the call to action: a job whose result holds the proposed values, not saved. */
  const proposeSeo = async (ctx: ChangeContext) =>
    (await client.request({ method: "POST", path: await settingsPath("/seo/propose"), schema: JobStartSchema, body: {}, ...ctx })).data;

  async function uploadSeoPicture(file: File, ctx: ChangeContext) {
    const form = new FormData();
    form.set("file", file);
    return (await client.request({ method: "POST", path: await settingsPath("/seo/picture"), schema: PictureSchema, form, timeoutMs: SLOW_CHANGE_MS, ...ctx }))
      .data;
  }

  const removeSeoPicture = async (ctx: ChangeContext) =>
    (await client.request({ method: "DELETE", path: await settingsPath("/seo/picture"), schema: RemovedSchema, ...ctx })).data;

  const publishingSettings = async () =>
    (await client.request({ method: "GET", path: await settingsPath("/publishing"), schema: PublishingSettingsSchema })).data;

  const savePublishing = async (update: PublishingSettings, ctx: ChangeContext) =>
    (await client.request({ method: "PUT", path: await settingsPath("/publishing"), schema: PublishingSettingsSchema, body: update, ...ctx })).data;

  const websiteSettings = async () => (await client.request({ method: "GET", path: await settingsPath("/website"), schema: PublishTargetSchema })).data;

  // A save of a changed connection and a test both reach the website itself, so they get the slow-change limit.
  const saveWebsite = async (update: WebsiteUpdate, ctx: ChangeContext) =>
    (await client.request({ method: "PUT", path: await settingsPath("/website"), schema: PublishTargetSchema, body: update, timeoutMs: SLOW_CHANGE_MS, ...ctx }))
      .data;

  const testWebsite = async (target: WebsiteTargetInput, ctx: ChangeContext) =>
    (
      await client.request({
        method: "POST",
        path: await settingsPath("/website/test"),
        schema: WebsiteTestSchema,
        body: target,
        timeoutMs: SLOW_CHANGE_MS,
        ...ctx,
      })
    ).data;

  async function socialConnections() {
    const { data } = await client.request({ method: "GET", path: await settingsPath("/social"), schema: z.array(z.unknown()) });
    const { items, skipped } = parseItems(data, SocialConnectionSchema);
    return { connections: items, skipped };
  }

  /** Spec v1.1 §7: the provider's sign-in address; the person comes back to `returnUrl?connected=<platform>`. */
  const connectSocial = async (platform: string, returnUrl: string) => {
    const segment = idSegment(platform);
    return (
      await client.request({ method: "GET", path: await settingsPath(`/social/${segment}/connect`), schema: AuthorizeSchema, query: { returnUrl } })
    ).data;
  };

  const disconnectSocial = async (platform: string, ctx: ChangeContext) => {
    const segment = idSegment(platform);
    return (await client.request({ method: "DELETE", path: await settingsPath(`/social/${segment}`), schema: DisconnectedSchema, ...ctx })).data;
  };

  const connectSearchConsole = async (returnUrl: string) =>
    (await client.request({ method: "GET", path: await settingsPath("/search-console/connect"), schema: AuthorizeSchema, query: { returnUrl } })).data;

  const disconnectSearchConsole = async (ctx: ChangeContext) =>
    (await client.request({ method: "DELETE", path: await settingsPath("/search-console"), schema: DisconnectedSchema, ...ctx })).data;

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
    listKeywords,
    addKeywords,
    bulkKeywords,
    proposeKeywords,
    keywordTopics,
    draftKeywordArticles,
    listSuggestions,
    draftSuggestion,
    dismissSuggestion,
    bulkSuggestions,
    createDrafts,
    requestUpgrade,
    job,
    categories,
    seoSettings,
    saveSeo,
    proposeSeo,
    uploadSeoPicture,
    removeSeoPicture,
    publishingSettings,
    savePublishing,
    websiteSettings,
    saveWebsite,
    testWebsite,
    socialConnections,
    connectSocial,
    disconnectSocial,
    connectSearchConsole,
    disconnectSearchConsole,
    listFindings,
    scanSite,
    prepareFixes,
    bulkFindings,
    usage,
  };
}

export type EngineApi = ReturnType<typeof createEngineApi>;
