import { z } from "zod";

const isoDateTime = z.iso.datetime({ offset: true });

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
