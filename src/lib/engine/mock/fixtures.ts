import type { Meta, Plan, PostSummary, Scheduled, Site } from "../schemas";

export const MOCK_SITE_ID = "site_fakher";

export function mockMeta(): Meta {
  return {
    languages: ["en", "ar"],
    platforms: ["website", "linkedin", "instagram"],
    kinds: ["blog", "social"],
    metrics: ["articles", "socialPosts", "photos", "publishes", "siteScans", "aiTokens"],
    limits: {
      metaTitle: 60,
      metaDescription: 155,
      photoMaxBytes: 5_242_880,
      photoTypes: ["image/jpeg", "image/png", "image/webp"],
      importMaxBytes: 10_485_760,
      importTypes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/html"],
      pageSizeDefault: 25,
      pageSizeMax: 100,
      lockMinutes: 15,
    },
    pollSeconds: 3,
    features: [],
    targetTypes: [
      {
        type: "wordpress",
        label: "WordPress",
        fields: [
          { key: "url", label: "Site address", kind: "url", required: true },
          { key: "username", label: "Publishing user", kind: "text", required: true },
          { key: "secret", label: "Application password", kind: "secret", required: true },
          { key: "postType", label: "Post type", kind: "text", required: false },
        ],
        bodyFormats: ["html", "boldbuilder"],
        arabicModes: ["translatepress", "separate"],
      },
      {
        type: "strapi",
        label: "Strapi",
        fields: [
          { key: "url", label: "Strapi address", kind: "url", required: true },
          { key: "secret", label: "API token", kind: "secret", required: true },
          { key: "collection", label: "Collection", kind: "text", required: true },
        ],
        bodyFormats: ["blocks"],
        arabicModes: ["locale"],
      },
    ],
  };
}

export function mockSite(): Site {
  return {
    id: MOCK_SITE_ID,
    accountId: "acc_fakher",
    name: "Fakher & Co",
    url: "https://fakhernco.com",
    category: "legal consultancy",
    timezone: "Asia/Dubai",
    languages: ["en", "ar"],
    defaultLanguage: "en",
    connections: {
      website: { type: "wordpress", status: "ok" },
      linkedin: "expiring",
      instagram: "missing",
      searchConsole: null,
    },
    counts: { suggestions: 8, pending: 3, approved: 5, scheduled: 5, published: 41, failed: 1, keywordsNew: 12 },
    createdAt: "2026-10-20T18:29:00+04:00",
  };
}

const SCHEDULED_POSTS: readonly PostSummary[] = [
  {
    id: "p_101",
    kind: "blog",
    platform: "website",
    language: "en",
    status: "approved",
    title: "When does a commission become payable under UAE Labour Law?",
    schedule: { hold: false, scheduledAt: "2026-10-22T10:00:00+04:00", position: 1 },
    updatedAt: "2026-10-21T09:12:00+04:00",
    actions: [],
  },
  {
    id: "p_102",
    kind: "blog",
    platform: "website",
    language: "ar",
    status: "approved",
    title: "متى تستحق العمولة وفق قانون العمل الإماراتي؟",
    schedule: { hold: false, scheduledAt: "2026-10-22T13:00:00+04:00", position: 2 },
    updatedAt: "2026-10-21T09:12:00+04:00",
    actions: [],
  },
  {
    id: "p_103",
    kind: "social",
    platform: "linkedin",
    language: "en",
    status: "approved",
    title: "Commission rights after resignation",
    schedule: { hold: true, scheduledAt: null, position: 3 },
    updatedAt: "2026-10-21T08:40:00+04:00",
    actions: [],
  },
];

export function mockScheduled(): Scheduled {
  return {
    autoPublish: true,
    nextSlotAt: "2026-10-22T10:00:00+04:00",
    waitingReason: null,
    posts: SCHEDULED_POSTS.map((post) => ({ ...post, schedule: post.schedule ? { ...post.schedule } : post.schedule })),
    skipped: 0,
  };
}

export function mockPlan(): Plan {
  return {
    plan: { id: "plan_pro", name: "Pro" },
    period: { start: "2026-10-01T00:00:00+04:00", end: "2026-10-31T23:59:59+04:00" },
    quotas: [
      { metric: "articles", limit: 40, used: 31, scope: "account", mode: "hard", warnAt: 0.8 },
      { metric: "socialPosts", limit: 120, used: 110, scope: "account", mode: "soft", warnAt: 0.8 },
      { metric: "photos", limit: null, used: 60 },
      // A metric the interface has no label for: it must still show, using its raw name (Review Focus 5).
      { metric: "videoMinutes", limit: 10, used: 2, scope: "account", mode: "soft", warnAt: 0.8 },
    ],
    metrics: ["articles", "socialPosts", "photos", "publishes", "siteScans", "aiTokens", "sites", "videoMinutes"],
  };
}
