import { z } from "zod";

// ISO 8601 date-time; seconds are optional ("2026-10-22T10:00+04:00" is valid ISO and must not break a page).
const isoDateTime = z.string().refine((value) => /\d{2}:\d{2}/.test(value) && !Number.isNaN(Date.parse(value)), {
  message: "Expected an ISO 8601 date-time",
});

// ── Envelope (spec §3) ───────────────────────────────────────────────────────
export const EngineErrorBodySchema = z.object({
  code: z.string(),
  message: z.string(),
  fields: z.record(z.string(), z.string()).nullish(),
  details: z.record(z.string(), z.unknown()).nullish(),
});

export const ListMetaSchema = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});
export type ListMeta = z.infer<typeof ListMetaSchema>;

export const EnvelopeSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), data: z.unknown(), meta: ListMetaSchema.nullish() }),
  z.object({ ok: z.literal(false), error: EngineErrorBodySchema }),
]);

// ── Meta (spec §4 "Meta") ────────────────────────────────────────────────────
const TargetFieldSchema = z.object({ key: z.string(), label: z.string(), kind: z.string(), required: z.boolean() });

export const TargetTypeSchema = z.object({
  type: z.string(),
  label: z.string(),
  fields: z.array(TargetFieldSchema),
  bodyFormats: z.array(z.string()),
  arabicModes: z.array(z.string()),
});

export const MetaSchema = z.object({
  languages: z.array(z.string()),
  platforms: z.array(z.string()),
  kinds: z.array(z.string()),
  metrics: z.array(z.string()),
  limits: z.object({
    metaTitle: z.number().int(),
    metaDescription: z.number().int(),
    photoMaxBytes: z.number().int(),
    photoTypes: z.array(z.string()),
    importMaxBytes: z.number().int().nullish(),
    importTypes: z.array(z.string()).nullish(),
    pageSizeDefault: z.number().int(),
    pageSizeMax: z.number().int(),
    lockMinutes: z.number().int(),
  }),
  pollSeconds: z.number().positive(),
  features: z.array(z.string()),
  targetTypes: z.array(TargetTypeSchema),
});
export type Meta = z.infer<typeof MetaSchema>;

// ── Site (spec §4 "Site") ────────────────────────────────────────────────────
// Statuses are open strings (known: ok | expiring | error | missing) so a new value never breaks the page.
const ConnectionStatusSchema = z.string();

export const SiteSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  name: z.string(),
  url: z.url(),
  category: z.string(),
  timezone: z.string(),
  languages: z.array(z.string()),
  defaultLanguage: z.string(),
  connections: z.object({
    website: z.object({ type: z.string().nullish(), status: ConnectionStatusSchema }),
    linkedin: ConnectionStatusSchema,
    instagram: ConnectionStatusSchema,
    searchConsole: ConnectionStatusSchema.nullish(),
  }),
  counts: z.object({
    suggestions: z.number().int(),
    pending: z.number().int(),
    approved: z.number().int(),
    scheduled: z.number().int(),
    published: z.number().int(),
    failed: z.number().int(),
    keywordsNew: z.number().int(),
  }),
  createdAt: isoDateTime,
});
export type Site = z.infer<typeof SiteSchema>;
export const SitesSchema = z.array(SiteSchema);
/** GET /sites read only for the site id, so a drift elsewhere in Site can't break every site-scoped call. */
export const SiteRefsSchema = z.array(z.object({ id: z.string() }));

// ── Plan & Quota (spec §4) ───────────────────────────────────────────────────
export const QuotaSchema = z.object({
  metric: z.string(),
  limit: z.number().nullable(),
  used: z.number(),
  scope: z.string().nullish(),
  mode: z.string().nullish(),
  warnAt: z.number().nullish(),
});
export type Quota = z.infer<typeof QuotaSchema>;

export const PlanSchema = z.object({
  plan: z.object({ id: z.string(), name: z.string() }),
  period: z.object({ start: isoDateTime, end: isoDateTime }),
  quotas: z.array(QuotaSchema),
  metrics: z.array(z.string()),
});
export type Plan = z.infer<typeof PlanSchema>;

// ── Scheduled (spec §7 GET …/scheduled) ──────────────────────────────────────
export const PostSummarySchema = z.object({
  id: z.string(),
  kind: z.string(),
  platform: z.string(),
  language: z.string(),
  status: z.string(),
  title: z.string(),
  schedule: z
    .object({ hold: z.boolean(), scheduledAt: isoDateTime.nullish(), position: z.number().int() })
    .nullish(),
  updatedAt: isoDateTime,
});
export type PostSummary = z.infer<typeof PostSummarySchema>;

export const ScheduledSchema = z.object({
  autoPublish: z.boolean(),
  nextSlotAt: isoDateTime.nullish(),
  waitingReason: z.string().nullish(),
  posts: z.array(PostSummarySchema),
});
export type Scheduled = z.infer<typeof ScheduledSchema>;

// ── Posts (spec v1.1 §4 Post, Finding; §7 posts endpoints) ───────────────────
/** A list that may be missing or null in the response; always an array after parsing. */
const list = <T extends z.ZodType>(item: T) => z.array(item).nullish().transform((value) => value ?? []);

export const FindingSchema = z.object({
  level: z.string(), // known: critical | warn | human
  code: z.string().nullish(),
  ref: z.string().nullish(),
  overridable: z.boolean().nullish(),
  message: z.string(),
});
export type Finding = z.infer<typeof FindingSchema>;

export const LockSchema = z.object({ by: z.string(), at: isoDateTime, expiresAt: isoDateTime });

export const PostSchema = z.object({
  id: z.string(),
  kind: z.string(),
  platform: z.string(),
  origin: z.string().nullish(),
  sourcePostId: z.string().nullish(),
  language: z.string(),
  pairId: z.string().nullish(),
  twin: z.object({ id: z.string(), language: z.string(), status: z.string() }).nullish(),
  status: z.string(),
  topic: z.string().nullish(),
  tone: z.string().nullish(),
  title: z.string(),
  subtitle: z.string().nullish(),
  slug: z.string().nullish(),
  metaTitle: z.string().nullish(),
  metaDescription: z.string().nullish(),
  keywords: list(z.string()),
  content: z.string().nullish(), // lists (GET …/posts) omit it
  hashtags: list(z.string()),
  section: z.string().nullish(),
  image: z
    .object({
      url: z.string(),
      alt: z.string().nullish(),
      credit: z.string().nullish(),
      source: z.string().nullish(),
      pexelsId: z.number().nullish(),
    })
    .nullish(),
  photoIdea: z.string().nullish(),
  sources: list(z.object({ title: z.string(), url: z.string() })),
  linkSuggestions: list(z.object({ anchor: z.string(), url: z.string(), title: z.string().nullish() })),
  findings: list(FindingSchema),
  seo: z.object({ score: z.number(), checks: list(FindingSchema) }).nullish(),
  reviewNote: z.string().nullish(),
  error: z.string().nullish(),
  overrideReason: z.string().nullish(),
  schedule: z
    .object({ hold: z.boolean(), scheduledAt: isoDateTime.nullish(), position: z.number().int().nullish() })
    .nullish(),
  published: z
    .object({ target: z.string(), url: z.string(), externalId: z.string().nullish(), at: isoDateTime })
    .nullish(),
  lock: LockSchema.nullish(),
  requestedBy: z.string().nullish(),
  reviewedBy: z.string().nullish(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  version: z.number().int(),
  actions: list(z.string()), // GET …/posts/{id} returns the allowed actions
});
export type Post = z.output<typeof PostSchema>;
export const PostsSchema = z.array(PostSchema);

export const PostUpdateSchema = z.object({
  title: z.string(),
  subtitle: z.string().nullable(),
  slug: z.string().nullable(),
  metaTitle: z.string().nullable(),
  metaDescription: z.string().nullable(),
  keywords: z.array(z.string()),
  content: z.string(),
  hashtags: z.array(z.string()),
  section: z.string().nullable(),
  version: z.number().int(),
});
export type PostUpdate = z.infer<typeof PostUpdateSchema>;

export const JobSchema = z.object({
  id: z.string(),
  status: z.string(), // known: queued | running | done | failed
  progress: z.number().nullish(),
  result: z.unknown().nullish(),
  error: z.unknown().nullish(),
});
export type Job = z.infer<typeof JobSchema>;
export const JobStartSchema = z.object({ jobId: z.string(), status: z.string().nullish(), postIds: list(z.string()) });
export type JobStart = z.output<typeof JobStartSchema>;

export const BulkResultSchema = z.object({
  done: z.array(z.string()),
  failed: z.array(z.object({ id: z.string(), code: z.string(), message: z.string() })),
});
export type BulkResult = z.infer<typeof BulkResultSchema>;

export const CategoriesSchema = z.array(z.object({ slug: z.string(), name: z.string() }));
export type Category = z.infer<typeof CategoriesSchema>[number];

export const DeletedSchema = z.object({ deleted: z.literal(true) });
export const ReleasedSchema = z.object({ released: z.literal(true) });
