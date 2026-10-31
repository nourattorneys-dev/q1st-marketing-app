import type { PublishTarget, TargetType, WebsiteTargetInput, WebsiteUpdate } from "@/lib/engine/schemas";

/**
 * The website form. Connection settings are kept as the engine saved them, so keys the form doesn't show go back
 * unchanged. The secret is typed here only: an empty secret keeps the stored one (spec v1.1 §7).
 */
export type WebsiteForm = {
  type: string;
  settings: Record<string, unknown>;
  secret: string;
  fieldMap: Record<string, string>;
  bodyFormat: string;
  blockMap: Record<string, string>;
  arabicMode: string;
};

export const typeOf = (types: TargetType[], type: string) => types.find((candidate) => candidate.type === type);

export const textOf = (value: unknown) => (typeof value === "string" ? value : value === null || value === undefined ? "" : String(value));

/** The fields a person types for the connection itself (not the secret, and not a choice of how articles are kept, which needs no test). */
const connectionKeys = (type: TargetType | undefined) =>
  (type?.fields ?? []).filter((field) => field.kind !== "secret" && field.kind !== "choice").map((field) => field.key);

/** The target without settings whose field is a secret (or named "secret"), so no password or token reaches the browser even if the engine sends one. */
export function withoutSecrets(target: PublishTarget, types: TargetType[]): PublishTarget {
  const secret = new Set(["secret", ...(typeOf(types, target.type ?? "")?.fields ?? []).filter((field) => field.kind === "secret").map((field) => field.key)]);
  return { ...target, settings: Object.fromEntries(Object.entries(target.settings).filter(([key]) => !secret.has(key))) };
}

export function toWebsiteForm(target: PublishTarget, types: TargetType[]): WebsiteForm {
  const known = target.type && typeOf(types, target.type) ? target.type : null;
  const type = known ?? types[0]?.type ?? "";
  const chosen = typeOf(types, type);
  return {
    type,
    settings: known ? { ...target.settings } : {},
    secret: "",
    fieldMap: known ? { ...target.fieldMap } : {},
    bodyFormat: (known && target.body?.format) || (chosen?.bodyFormats[0] ?? ""),
    blockMap: known ? { ...(target.body?.blockMap ?? {}) } : {},
    arabicMode: (known && target.arabic?.mode) || (chosen?.arabicModes[0] ?? ""),
  };
}

/** Another website type: its fields start empty and so do the maps; format and Arabic mode take its first choice; other settings stay. */
export function switchType(form: WebsiteForm, type: string, types: TargetType[]): WebsiteForm {
  const settings = { ...form.settings };
  for (const field of typeOf(types, form.type)?.fields ?? []) delete settings[field.key];
  const next = typeOf(types, type);
  return { type, settings, secret: "", fieldMap: {}, bodyFormat: next?.bodyFormats[0] ?? "", blockMap: {}, arabicMode: next?.arabicModes[0] ?? "" };
}

/** What a connection test proves: the type, its connection fields and the secret typed. */
export function connectionFingerprint(form: WebsiteForm, types: TargetType[]): string {
  return JSON.stringify([form.type, connectionKeys(typeOf(types, form.type)).map((key) => textOf(form.settings[key]).trim()), form.secret]);
}

/** Spec v1.1 §7: a new connection, another type, a changed connection field or a typed secret must pass a test before saving. */
export function needsTest(form: WebsiteForm, saved: PublishTarget, types: TargetType[]): boolean {
  if (saved.status === "missing" || form.type !== saved.type || form.secret !== "") return true;
  return connectionKeys(typeOf(types, form.type)).some((key) => textOf(form.settings[key]).trim() !== textOf(saved.settings[key]).trim());
}

/** Required fields left empty. The secret counts as filled when one is stored for this same type. */
export function missingRequired(form: WebsiteForm, saved: PublishTarget, types: TargetType[]): string[] {
  const secretStored = saved.secretSet && saved.type === form.type;
  return (typeOf(types, form.type)?.fields ?? [])
    .filter((field) => field.required)
    .filter((field) => (field.kind === "secret" ? !form.secret && !secretStored : !textOf(form.settings[field.key]).trim()))
    .map((field) => field.key);
}

/** After a passing test: a suggestion fills a row that's empty or names a field the website doesn't have; a valid choice stays. */
export function prefillMap(current: Record<string, string>, suggested: Record<string, string>, choices: string[]): Record<string, string> {
  const next = { ...current };
  for (const [key, value] of Object.entries(suggested)) {
    if (!next[key] || (choices.length > 0 && !choices.includes(next[key]))) next[key] = value;
  }
  return next;
}

/** A map editor's rows: the saved keys, then any the last test suggested. */
export const mapKeys = (current: Record<string, string>, suggested: Record<string, string>) => [...new Set([...Object.keys(current), ...Object.keys(suggested)])];

const filled = (map: Record<string, string>) => Object.fromEntries(Object.entries(map).filter(([, value]) => value));

/** The test request: the unsaved values, the secret only if typed. A block map goes with the blocks format (spec v1.1 §4: Strapi only). */
export function toWebsiteTarget(form: WebsiteForm, types: TargetType[]): WebsiteTargetInput {
  const settings: Record<string, unknown> = { ...form.settings };
  for (const field of typeOf(types, form.type)?.fields ?? []) {
    if (field.kind === "secret") delete settings[field.key];
    else if (field.kind === "choice") settings[field.key] = textOf(form.settings[field.key]).trim() || (field.options?.[0]?.value ?? "");
    else settings[field.key] = textOf(form.settings[field.key]).trim();
  }
  return {
    type: form.type,
    settings,
    ...(form.secret ? { secret: form.secret } : {}),
    fieldMap: filled(form.fieldMap),
    body: form.bodyFormat === "blocks" ? { format: form.bodyFormat, blockMap: filled(form.blockMap) } : { format: form.bodyFormat },
    arabic: { mode: form.arabicMode },
  };
}

export const toWebsiteUpdate = (form: WebsiteForm, types: TargetType[], version: number): WebsiteUpdate => ({ ...toWebsiteTarget(form, types), version });
