import type { PublishingSettings, SeoSettings } from "../schemas";

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
    version: 3,
  };
}

/** 2 a day, Sunday to Thursday, from 10:00, 3 hours apart: the 10:00 and 13:00 Dubai slots the mock queue has used since M2b. */
export function seedPublishing(): PublishingSettings {
  return { autoPublish: true, perDay: 2, days: ["sun", "mon", "tue", "wed", "thu"], from: "10:00", to: "17:00", gapMinutes: 180, version: 1 };
}
