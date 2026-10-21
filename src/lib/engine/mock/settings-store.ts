import type { PublishingSettings, PublishTarget, SeoSettings, Site, SocialConnection, TargetType } from "../schemas";
import { mockMeta } from "./fixtures";
import { fail, ok, type MockFail, type MockOutcome, type UploadedFile } from "./outcome";
import { DAY_CODES, toDubaiIso, type SlotPlan } from "./schedule";
import { ADAPTERS, MOCK_CATEGORIES, seedPublishing, seedSeo, seedSocial, seedWebsite } from "./settings-fixtures";

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

const object = (value: unknown) => (typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {});
const stringMap = (value: unknown) =>
  Object.fromEntries(Object.entries(object(value)).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1] !== ""));

/** A test or save request's connection, checked: its type, the settings it sent and the secret it will use. */
type Resolved = { type: TargetType; settings: Record<string, unknown>; secret: string | null };

/** The site's settings (spec v1.1 §4, §7): each model has a version, and a save from an older version is a conflict. */
export function createSettingsStore(options: { now: () => number; firstRun?: boolean }) {
  const meta = mockMeta();
  let seo = seedSeo();
  let publishing = seedPublishing();
  let pictureSequence = 0;
  let website = seedWebsite(options.firstRun ?? false);
  const social = new Map(seedSocial(options.firstRun ?? false).map((account) => [account.platform, account]));
  let searchConsole = "missing";
  const passedTests = new Set<string>();

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

  function websiteView(): MockOutcome<PublishTarget> {
    const { secret, ...rest } = website;
    return ok(structuredClone({ ...rest, secretSet: secret !== null }));
  }

  /** A known type, its required fields (the stored secret counts for the same type) and web addresses where the type says url. */
  function resolve(input: Record<string, unknown>): Resolved | MockFail {
    const type = meta.targetTypes.find((candidate) => candidate.type === input.type);
    if (!type) return invalid({ type: "Choose a website type." });
    const given = object(input.settings);
    const secret = text(input.secret) || (website.type === type.type ? website.secret : null);
    const fields: Record<string, string> = {};
    for (const field of type.fields) {
      if (field.kind === "secret") {
        if (field.required && !secret) fields[field.key] = "Required.";
        continue;
      }
      const value = text(given[field.key]);
      if (field.required && !value) fields[field.key] = "Required.";
      else if (value && field.kind === "url" && !isWebAddress(value)) fields[field.key] = ADDRESS;
    }
    if (Object.keys(fields).length > 0) return invalid(fields);
    const settings = { ...given };
    for (const field of type.fields) if (field.kind === "secret") delete settings[field.key];
    return { type, settings, secret };
  }

  /** The connection a test proved: the type, its connection fields and the secret it used. */
  const fingerprintOf = (resolved: Resolved) =>
    JSON.stringify([resolved.type.type, resolved.type.fields.filter((field) => field.kind !== "secret").map((field) => text(resolved.settings[field.key])), resolved.secret]);

  /** POST …/settings/website/test with unsaved values. A secret containing "wrong" is refused, as a website would (mock rule). */
  function testWebsite(input: Record<string, unknown>): MockOutcome<Record<string, unknown>> {
    const resolved = resolve(input);
    if ("ok" in resolved) return resolved;
    const secretLabel = resolved.type.fields.find((field) => field.kind === "secret")?.label ?? "secret";
    if (resolved.secret?.includes("wrong")) {
      return ok({ ok: false, error: `${resolved.type.label} refused the connection (401 Unauthorized). Check the ${secretLabel}.` });
    }
    // Spec v1.1 §9: not_connected also means "its test failed"; an engine may answer a failed test this way (mock rule: "disabled").
    if (resolved.secret?.includes("disabled")) {
      return fail(422, "not_connected", `${resolved.type.label} won't accept this ${secretLabel}: it's turned off on the site.`);
    }
    passedTests.add(fingerprintOf(resolved));
    const adapter = ADAPTERS[resolved.type.type] ?? { fields: [], blockTypes: [], suggestedFieldMap: {}, suggestedBlockMap: {} };
    return ok({ ok: true, categories: structuredClone(MOCK_CATEGORIES), languages: meta.languages, ...structuredClone(adapter) });
  }

  /** PUT …/settings/website. A changed type, connection field or secret is saved only after a passing test of exactly those values. */
  function saveWebsite(input: Record<string, unknown>): MockOutcome<PublishTarget> {
    if (input.version !== website.version) return conflict("website connection");
    const resolved = resolve(input);
    if ("ok" in resolved) return resolved;
    const connectionKeys = resolved.type.fields.filter((field) => field.kind !== "secret").map((field) => field.key);
    const changed =
      website.status === "missing" ||
      resolved.type.type !== website.type ||
      resolved.secret !== website.secret ||
      connectionKeys.some((key) => text(resolved.settings[key]) !== text(website.settings[key]));
    if (changed && !passedTests.has(fingerprintOf(resolved))) {
      return fail(422, "not_connected", "Test the connection first: a changed connection is saved only after its test passes.");
    }
    const body = object(input.body);
    const format = text(body.format);
    const mode = text(object(input.arabic).mode);
    const fields: Record<string, string> = {};
    if (!resolved.type.bodyFormats.includes(format)) fields["body.format"] = `Choose one of: ${resolved.type.bodyFormats.join(", ")}.`;
    if (!resolved.type.arabicModes.includes(mode)) fields["arabic.mode"] = `Choose one of: ${resolved.type.arabicModes.join(", ")}.`;
    if (Object.keys(fields).length > 0) return invalid(fields);
    website = {
      type: resolved.type.type,
      settings: resolved.settings,
      secret: resolved.secret,
      fieldMap: stringMap(input.fieldMap),
      body: format === "blocks" ? { format, blockMap: stringMap(body.blockMap) } : { format },
      arabic: { mode },
      languages: meta.languages,
      status: "ok",
      lastCheckedAt: changed ? toDubaiIso(options.now()) : website.lastCheckedAt,
      lastError: null,
      version: website.version + 1,
    };
    return websiteView();
  }

  /** Spec v1.1 §4 Site.connections, from what's set up here. Search Console is reported only with the performance feature. */
  function connections(withSearchConsole: boolean): Site["connections"] {
    return {
      website: { type: website.type, status: website.status },
      linkedin: social.get("linkedin")?.status ?? "missing",
      instagram: social.get("instagram")?.status ?? "missing",
      searchConsole: withSearchConsole ? searchConsole : null,
    };
  }

  /** Whether a post for this platform can go out: the website connection for articles, the account for social posts. */
  const connectionStatus = (platform: string) => (platform === "website" ? website.status : (social.get(platform)?.status ?? "ok"));

  /** The mock's authorize step completes at once: the browser is sent straight back with ?connected=… (mock rule). */
  function authorize(returnUrl: string, connected: string): MockOutcome<{ authorizeUrl: string }> {
    if (!isWebAddress(returnUrl)) return invalid({ returnUrl: "Must be a web address." });
    const url = new URL(returnUrl);
    url.searchParams.set("connected", connected);
    return ok({ authorizeUrl: url.href });
  }

  function connectSocial(platform: string, returnUrl: string): MockOutcome<{ authorizeUrl: string }> {
    if (!social.has(platform)) return fail(404, "not_found", `No social platform called ${platform}.`);
    const result = authorize(returnUrl, platform);
    if (result.ok) {
      social.set(platform, { platform, accountName: "Fakher & Co", status: "ok", expiresAt: toDubaiIso(options.now() + 60 * 86_400_000), lastError: null });
    }
    return result;
  }

  function disconnectSocial(platform: string): MockOutcome<{ disconnected: true }> {
    if (!social.has(platform)) return fail(404, "not_found", `No social platform called ${platform}.`);
    social.set(platform, { platform, accountName: null, status: "missing", expiresAt: null, lastError: null });
    return ok({ disconnected: true as const });
  }

  function connectSearchConsole(returnUrl: string): MockOutcome<{ authorizeUrl: string }> {
    const result = authorize(returnUrl, "searchConsole");
    if (result.ok) searchConsole = "ok";
    return result;
  }

  function disconnectSearchConsole(): MockOutcome<{ disconnected: true }> {
    searchConsole = "missing";
    return ok({ disconnected: true as const });
  }

  const socialList = (): MockOutcome<SocialConnection[]> => ok(structuredClone([...social.values()]));

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
    website: websiteView,
    testWebsite,
    saveWebsite,
    websiteType: () => website.type,
    connections,
    connectionStatus,
    socialList,
    connectSocial,
    disconnectSocial,
    connectSearchConsole,
    disconnectSearchConsole,
  };
}

export type SettingsStore = ReturnType<typeof createSettingsStore>;
