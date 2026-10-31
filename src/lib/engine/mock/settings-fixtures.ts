import type { Category, PublishingSettings, SeoSettings, SocialConnection } from "../schemas";

/** Fakher & Co's SEO profile (spec v1.1 §4 SeoSettings): a legal consultancy, never called a law firm. */
export function seedSeo(): SeoSettings {
  return {
    siteName: "Fakher & Co",
    siteUrl: "https://fakhernco.com",
    blogPath: "/insights",
    defaultLang: "en",
    focusKeywords: ["legal consultancy dubai", "uae labour law"],
    locations: ["Dubai", "Abu Dhabi"],
    author: "Fakher & Co",
    linkedin: "https://www.linkedin.com/company/fakher-co",
    instagram: null,
    ogImage: "https://fakhernco.com/wp-content/uploads/share.jpg",
    ogImageUploaded: null,
    cta: "Book a consultation",
    tone: "clear, expert, plain English",
    audience: "business owners and employees in the UAE",
    avoid: ["promising case outcomes", "advice on a specific case"],
    services: ["Employment law", "Company law", "Real estate disputes"],
    version: 3,
  };
}

/** 2 a day, Sunday to Thursday, from 10:00, 3 hours apart: the 10:00 and 13:00 Dubai slots the mock queue has used since M2b. */
export function seedPublishing(): PublishingSettings {
  return { overrideReasonRequired: false, autoPublish: true, perDay: 2, days: ["sun", "mon", "tue", "wed", "thu"], from: "10:00", to: "17:00", gapMinutes: 180, version: 1 };
}

/** The website categories (…/website/categories, and the connection test's `categories`). */
export const MOCK_CATEGORIES: Category[] = [
  { slug: "insights", name: "Insights" },
  { slug: "labour-law", name: "Labour law" },
  { slug: "corporate", name: "Corporate" },
  { slug: "real-estate", name: "Real estate" },
];

/** The website connection as the engine stores it, secret included (the API never returns the secret). */
export type StoredWebsite = {
  type: string | null;
  settings: Record<string, unknown>;
  secret: string | null;
  fieldMap: Record<string, string>;
  body: { format: string; blockMap?: Record<string, string> } | null;
  arabic: { mode: string } | null;
  languages: string[];
  status: string;
  lastCheckedAt: string | null;
  lastError: string | null;
  version: number;
};

/** WordPress on fakhernco.com through an Editor user's application password (design §6); nothing on a first run. */
export function seedWebsite(firstRun: boolean): StoredWebsite {
  if (firstRun) {
    return {
      type: null,
      settings: {},
      secret: null,
      fieldMap: {},
      body: null,
      arabic: null,
      languages: ["en", "ar"],
      status: "missing",
      lastCheckedAt: null,
      lastError: null,
      version: 0,
    };
  }
  return {
    type: "wordpress",
    settings: { url: "https://fakhernco.com", username: "articles-ai", postType: "post", ctaText: "Book a consultation", ctaUrl: "/contact" },
    secret: "seeded-application-password",
    fieldMap: {
      title: "title",
      slug: "slug",
      subtitle: "excerpt",
      metaTitle: "yoast.title",
      metaDescription: "yoast.description",
      image: "featuredImage",
      category: "categories",
      author: "author",
    },
    body: { format: "html" },
    arabic: { mode: "translatepress" },
    languages: ["en", "ar"],
    status: "ok",
    lastCheckedAt: "2026-10-21T09:00:00+04:00",
    lastError: null,
    version: 1,
  };
}

/** LinkedIn connected but expiring and Instagram missing, as the dashboard has shown since M1; both missing on a first run. */
export function seedSocial(firstRun: boolean): SocialConnection[] {
  return [
    firstRun
      ? { platform: "linkedin", accountName: null, status: "missing", expiresAt: null, lastError: null }
      : { platform: "linkedin", accountName: "Fakher & Co", status: "expiring", expiresAt: "2026-10-30T10:00:00+04:00", lastError: null },
    { platform: "instagram", accountName: null, status: "missing", expiresAt: null, lastError: null },
  ];
}

type Adapter = { fields: string[]; blockTypes: string[]; suggestedFieldMap: Record<string, string>; suggestedBlockMap: Record<string, string> };

/** What a passing connection test reports for each website type (spec v1.1 §7 …/settings/website/test, §11). */
export const ADAPTERS: Record<string, Adapter> = {
  wordpress: {
    fields: ["title", "slug", "excerpt", "content", "yoast.title", "yoast.description", "featuredImage", "categories", "tags", "author"],
    blockTypes: [],
    suggestedFieldMap: {
      title: "title",
      slug: "slug",
      subtitle: "excerpt",
      metaTitle: "yoast.title",
      metaDescription: "yoast.description",
      keywords: "tags",
      image: "featuredImage",
      category: "categories",
      author: "author",
    },
    suggestedBlockMap: {},
  },
  strapi: {
    fields: ["title", "slug", "subtitle", "seo.metaTitle", "seo.metaDescription", "seo.keywords", "cover", "category", "author"],
    blockTypes: [
      "blocks.heading",
      "blocks.paragraph",
      "blocks.list",
      "blocks.data-table",
      "blocks.faq",
      "blocks.cards",
      "blocks.image",
      "blocks.button",
      "blocks.quote",
      "blocks.gallery",
    ],
    suggestedFieldMap: {
      title: "title",
      slug: "slug",
      subtitle: "subtitle",
      metaTitle: "seo.metaTitle",
      metaDescription: "seo.metaDescription",
      keywords: "seo.keywords",
      image: "cover",
      category: "category",
      author: "author",
    },
    suggestedBlockMap: {
      heading: "blocks.heading",
      paragraph: "blocks.paragraph",
      list: "blocks.list",
      faq: "blocks.faq",
      image: "blocks.image",
      quote: "blocks.quote",
      table: "blocks.data-table",
    },
  },
};
