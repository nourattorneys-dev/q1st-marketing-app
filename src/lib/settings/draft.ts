/**
 * A settings form (spec v1.1 §4: each settings model has a version): the values it started from, that version, and
 * the edits. A save sends the version, so a newer save by someone else comes back as version_conflict (design §9).
 */
export type SettingsDraft<F> = { base: F; version: number; form: F };

/** Compares by value; object keys are sorted, so a map with the same entries in another order is the same. */
function stable(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : item,
  );
}

export const draftOf = <F>(form: F, version: number): SettingsDraft<F> => ({ base: form, version, form });

export const edit = <F, K extends keyof F>(draft: SettingsDraft<F>, key: K, value: F[K]): SettingsDraft<F> => ({
  ...draft,
  form: { ...draft.form, [key]: value },
});

/** The top-level fields whose values differ. */
export function changedKeys<F extends object>(a: F, b: F): (keyof F & string)[] {
  return (Object.keys(a) as (keyof F & string)[]).filter((key) => stable(a[key]) !== stable(b[key]));
}

export const unsavedKeys = <F extends object>(draft: SettingsDraft<F>) => changedKeys(draft.form, draft.base);

/** Saved: the engine's copy is the new base and form, at its version; anything typed since the save was sent stays on top. */
export function afterSave<F extends object>(draft: SettingsDraft<F>, sent: F, saved: F, version: number): SettingsDraft<F> {
  const typedSince = Object.fromEntries(changedKeys(draft.form, sent).map((key) => [key, draft.form[key]]));
  return { base: saved, version, form: { ...saved, ...typedSince } };
}

/** A newer version arrived: it's shown when nothing is unsaved; otherwise the edits stay on their version, so saving them conflicts. */
export function rebase<F extends object>(draft: SettingsDraft<F>, form: F, version: number): SettingsDraft<F> {
  if (version <= draft.version || unsavedKeys(draft).length > 0) return draft;
  return draftOf(form, version);
}

/** Keep my changes after a conflict: their values, with only the fields I changed on top, at their version. */
export function withMyChanges<F extends object>(draft: SettingsDraft<F>, theirs: F, version: number): SettingsDraft<F> {
  const mine = Object.fromEntries(unsavedKeys(draft).map((key) => [key, draft.form[key]]));
  return { base: theirs, version, form: { ...theirs, ...mine } };
}
