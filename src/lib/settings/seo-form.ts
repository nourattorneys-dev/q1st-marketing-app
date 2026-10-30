import { z } from "zod";
import type { SeoSettings, SeoUpdate } from "@/lib/engine/schemas";
import { parsePhrases } from "@/lib/keywords/phrases";

/** The SEO form: every field as text; the three lists are separated by commas (the Arabic one too) or new lines. */
export type SeoForm = {
  siteName: string;
  siteUrl: string;
  blogPath: string;
  defaultLang: string;
  author: string;
  focusKeywords: string;
  locations: string;
  cta: string;
  tone: string;
  audience: string;
  avoid: string;
  services: string;
  linkedin: string;
  instagram: string;
  ogImage: string;
};

export const SEO_LISTS = ["focusKeywords", "locations", "avoid", "services"] as const;

export function toSeoForm(settings: SeoSettings): SeoForm {
  return {
    siteName: settings.siteName,
    siteUrl: settings.siteUrl,
    blogPath: settings.blogPath ?? "",
    defaultLang: settings.defaultLang,
    author: settings.author ?? "",
    focusKeywords: settings.focusKeywords.join(", "),
    locations: settings.locations.join(", "),
    cta: settings.cta ?? "",
    tone: settings.tone ?? "",
    audience: settings.audience ?? "",
    avoid: settings.avoid.join(", "),
    services: settings.services.join(", "),
    linkedin: settings.linkedin ?? "",
    instagram: settings.instagram ?? "",
    ogImage: settings.ogImage ?? "",
  };
}

const orNull = (text: string) => text.trim() || null;

/** PUT …/settings/seo: empty text is sent as null; lists are split, tidied and de-duplicated. */
export function toSeoUpdate(form: SeoForm, version: number): SeoUpdate {
  return {
    siteName: form.siteName.trim(),
    siteUrl: form.siteUrl.trim(),
    blogPath: orNull(form.blogPath),
    defaultLang: form.defaultLang,
    focusKeywords: parsePhrases(form.focusKeywords),
    locations: parsePhrases(form.locations),
    author: orNull(form.author),
    linkedin: orNull(form.linkedin),
    instagram: orNull(form.instagram),
    ogImage: orNull(form.ogImage),
    cta: orNull(form.cta),
    tone: orNull(form.tone),
    audience: orNull(form.audience),
    avoid: parsePhrases(form.avoid),
    services: parsePhrases(form.services),
    version,
  };
}

/** "Fill from my website" (P2b): the whole profile as the engine proposed it from the site's own pages; any part may be missing. */
const text = z.string().min(1).optional();
const items = z.array(z.string()).optional();
const ProposalSchema = z.object({
  siteName: text,
  author: text,
  cta: text,
  tone: text,
  audience: text,
  linkedin: text,
  instagram: text,
  defaultLang: text,
  focusKeywords: items,
  locations: items,
  avoid: items,
  services: items,
});
export type SeoProposal = z.infer<typeof ProposalSchema>;
const PROPOSED = ["siteName", "author", "cta", "tone", "audience", "linkedin", "instagram", "defaultLang", "focusKeywords", "locations", "avoid", "services"] as const;

/** The proposal job's result (proposed values, not saved), or null when it holds nothing the form can use. */
export function readProposal(result: unknown): SeoProposal | null {
  const parsed = ProposalSchema.safeParse(result);
  return parsed.success && PROPOSED.some((key) => parsed.data[key] !== undefined) ? parsed.data : null;
}

/**
 * The proposal fills only the fields that are still empty: what a person typed is never replaced. Nothing is saved until
 * the Admin presses Save. Returns the new form and which fields it filled.
 */
export function withProposal(form: SeoForm, proposal: SeoProposal): { form: SeoForm; filled: (keyof SeoForm)[] } {
  const next = { ...form };
  const filled: (keyof SeoForm)[] = [];
  for (const key of PROPOSED) {
    const value = proposal[key];
    if (value === undefined || form[key].trim() !== "") continue;
    const asText = Array.isArray(value) ? value.join(", ") : value;
    if (!asText) continue;
    next[key] = asText;
    filled.push(key);
  }
  return { form: next, filled };
}
