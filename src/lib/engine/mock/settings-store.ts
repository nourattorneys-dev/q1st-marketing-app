import type { PublishingSettings, SeoSettings } from "../schemas";
import { mockMeta } from "./fixtures";
import { fail, ok, type MockOutcome, type UploadedFile } from "./outcome";
import { DAY_CODES, type SlotPlan } from "./schedule";
import { seedPublishing, seedSeo } from "./settings-fixtures";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const ADDRESS = "Enter a full address, like https://example.com.";

function isWebAddress(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const optionalText = (value: unknown) => text(value) || null;
const textList = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean) : [];
const wholeNumber = (value: unknown) => (typeof value === "number" && Number.isInteger(value) ? value : Number.NaN);
const conflict = (what: string) => fail(409, "version_conflict", `Someone saved the ${what} first. Reload to see their version.`);
const invalid = (fields: Record<string, string>) => fail(400, "invalid_input", "Check the highlighted fields.", { fields });

/** The site's settings (spec v1.1 §4, §7): each model has a version, and a save from an older version is a conflict. */
export function createSettingsStore() {
  const meta = mockMeta();
  let seo = seedSeo();
  let publishing = seedPublishing();
  let pictureSequence = 0;

  const seoView = () => ok(structuredClone(seo));

  /** PUT …/settings/seo: the whole profile with the version it started from. */
  function saveSeo(input: Record<string, unknown>): MockOutcome<SeoSettings> {
    if (input.version !== seo.version) return conflict("SEO profile");
    const fields: Record<string, string> = {};
    const siteName = text(input.siteName);
    if (!siteName) fields.siteName = "Required.";
    const siteUrl = text(input.siteUrl);
    if (!isWebAddress(siteUrl)) fields.siteUrl = ADDRESS;
    const defaultLang = text(input.defaultLang);
    if (!meta.languages.includes(defaultLang)) fields.defaultLang = "Choose one of the site's languages.";
    for (const key of ["linkedin", "instagram", "ogImage"] as const) {
      const value = optionalText(input[key]);
      if (value && !isWebAddress(value)) fields[key] = ADDRESS;
    }
    const focusKeywords = textList(input.focusKeywords);
    if (focusKeywords.length > 20) fields.focusKeywords = "Up to 20 focus keywords.";
    if (Object.keys(fields).length > 0) return invalid(fields);
    seo = {
      ...seo,
      siteName,
      siteUrl,
      blogPath: optionalText(input.blogPath),
      defaultLang,
      focusKeywords,
      locations: textList(input.locations),
      author: optionalText(input.author),
      linkedin: optionalText(input.linkedin),
      instagram: optionalText(input.instagram),
      ogImage: optionalText(input.ogImage),
      cta: optionalText(input.cta),
      tone: optionalText(input.tone),
      audience: optionalText(input.audience),
      avoid: textList(input.avoid),
      version: seo.version + 1,
    };
    return seoView();
  }

  /** The mock "AI" behind …/settings/seo/propose: the job's result, never saved by the engine. */
  const seoProposal = () => ({
    focusKeywords: ["legal consultancy dubai", "uae labour law advice", "commercial contracts uae", "real estate disputes dubai"],
    cta: "Book a consultation with Fakher & Co",
  });

  /** POST …/settings/seo/picture. The picture isn't part of the PUT, so it leaves the profile's version alone (mock rule). */
  function uploadSeoPicture(file: UploadedFile | null): MockOutcome<{ url: string }> {
    if (!file) return invalid({ file: "Choose a picture to upload." });
    if (!meta.limits.photoTypes.includes(file.type)) {
      return fail(400, "invalid_input", "Only JPEG, PNG or WebP pictures can be uploaded.", { fields: { file: "Unsupported type" } });
    }
    if (file.size > meta.limits.photoMaxBytes) {
      return fail(400, "invalid_input", `The picture is larger than ${meta.limits.photoMaxBytes / 1_048_576} MB.`, { fields: { file: "Too large" } });
    }
    seo.ogImageUploaded = { url: file.dataUrl, key: `seo/share-${++pictureSequence}` };
    return ok({ url: file.dataUrl });
  }

  function removeSeoPicture(): MockOutcome<{ removed: true }> {
    seo.ogImageUploaded = null;
    return ok({ removed: true as const });
  }

  const publishingView = () => ok(structuredClone(publishing));

  /** PUT …/settings/publishing. The engine works out the slots, so it refuses a plan whose posts can't fit between from and to. */
  function savePublishing(input: Record<string, unknown>): MockOutcome<PublishingSettings> {
    if (input.version !== publishing.version) return conflict("publishing schedule");
    const fields: Record<string, string> = {};
    if (typeof input.autoPublish !== "boolean") fields.autoPublish = "Choose on or off.";
    const perDay = wholeNumber(input.perDay);
    if (!(perDay >= 1 && perDay <= 12)) fields.perDay = "Between 1 and 12 posts a day.";
    const days = textList(input.days);
    if (days.length === 0 || days.some((day) => !(DAY_CODES as readonly string[]).includes(day))) fields.days = "Choose at least one day.";
    const from = text(input.from);
    const to = text(input.to);
    if (!TIME.test(from)) fields.from = "Use a time like 10:00.";
    if (!TIME.test(to)) fields.to = "Use a time like 17:00.";
    else if (TIME.test(from) && minutesOf(to) <= minutesOf(from)) fields.to = "Must be later than the start time.";
    const gapMinutes = wholeNumber(input.gapMinutes);
    if (!(gapMinutes >= 0 && gapMinutes <= 720)) fields.gapMinutes = "Between 0 and 720 minutes.";
    if (Object.keys(fields).length === 0 && minutesOf(from) + (perDay - 1) * gapMinutes > minutesOf(to)) {
      fields.perDay = `${perDay} posts a day, ${gapMinutes} minutes apart, don't fit between ${from} and ${to}.`;
    }
    if (Object.keys(fields).length > 0) return invalid(fields);
    publishing = {
      autoPublish: input.autoPublish as boolean,
      perDay,
      days: DAY_CODES.filter((day) => days.includes(day)),
      from,
      to,
      gapMinutes,
      version: publishing.version + 1,
    };
    return publishingView();
  }

  const slotPlan = (): SlotPlan => ({
    days: publishing.days,
    from: publishing.from,
    to: publishing.to,
    perDay: publishing.perDay,
    gapMinutes: publishing.gapMinutes,
  });

  return {
    seo: seoView,
    saveSeo,
    seoProposal,
    uploadSeoPicture,
    removeSeoPicture,
    publishing: publishingView,
    savePublishing,
    slotPlan,
    autoPublish: () => publishing.autoPublish,
  };
}

export type SettingsStore = ReturnType<typeof createSettingsStore>;
