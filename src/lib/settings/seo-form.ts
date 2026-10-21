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
  linkedin: string;
  instagram: string;
  ogImage: string;
};

export const SEO_LISTS = ["focusKeywords", "locations", "avoid"] as const;

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
    version,
  };
}

const ProposalSchema = z.object({ focusKeywords: z.array(z.string()).optional(), cta: z.string().optional() });
export type SeoProposal = z.infer<typeof ProposalSchema>;

/** The proposal job's result (spec v1.1 §7: proposed values, not saved), or null when it's in a shape the portal can't read. */
export function readProposal(result: unknown): SeoProposal | null {
  const parsed = ProposalSchema.safeParse(result);
  return parsed.success && (parsed.data.focusKeywords !== undefined || parsed.data.cta !== undefined) ? parsed.data : null;
}

/** The proposal fills the form; nothing is saved until the Admin presses Save. */
export function withProposal(form: SeoForm, proposal: SeoProposal): SeoForm {
  return {
    ...form,
    ...(proposal.focusKeywords ? { focusKeywords: proposal.focusKeywords.join(", ") } : {}),
    ...(proposal.cta ? { cta: proposal.cta } : {}),
  };
}
