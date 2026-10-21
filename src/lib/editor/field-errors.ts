import type { EngineFailure } from "@/lib/engine/result";
import { FIELD_KEYS, type FieldKey } from "./changed-fields";

export type FieldErrors = { byField: Partial<Record<FieldKey, string>>; other: { field: string; message: string }[] };

const camel = (name: string) => name.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
const isFieldKey = (name: string): name is FieldKey => (FIELD_KEYS as readonly string[]).includes(name);

/** Spec v1.1 §9: a 400 invalid_input carries per-field messages to show next to each field. The engine may name them in snake_case. */
export function fieldErrors(error: EngineFailure | null): FieldErrors {
  const result: FieldErrors = { byField: {}, other: [] };
  for (const [field, message] of Object.entries(error?.fields ?? {})) {
    const key = camel(field);
    if (isFieldKey(key)) result.byField[key] = message;
    else result.other.push({ field, message });
  }
  return result;
}
