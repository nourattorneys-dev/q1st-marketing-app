import type { EngineFailure } from "@/lib/engine/result";

export type SettingsFieldErrors = { byField: Record<string, string>; other: { field: string; message: string }[] };

const camel = (name: string) => name.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());

/** Spec v1.1 §9: a 400 carries a message per field. They go next to the fields the form shows (the engine may use snake_case); the rest are listed. */
export function settingsFieldErrors(error: EngineFailure | null, shown: readonly string[]): SettingsFieldErrors {
  const result: SettingsFieldErrors = { byField: {}, other: [] };
  for (const [field, message] of Object.entries(error?.fields ?? {})) {
    const key = camel(field);
    if (shown.includes(key)) result.byField[key] = message;
    else result.other.push({ field, message });
  }
  return result;
}
