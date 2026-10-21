import type { Post } from "@/lib/engine/schemas";
import { changedFields, toEditable, type EditableFields, type FieldKey } from "./changed-fields";

/**
 * The reviewer's form and the saved version it started from. A save sends that version (spec v1.1 §3), so a newer
 * save by someone else always comes back as version_conflict instead of being overwritten.
 */
export type Draft = { base: EditableFields; version: number; form: EditableFields };

export function draftOf(post: Post): Draft {
  const fields = toEditable(post);
  return { base: fields, version: post.version, form: fields };
}

export function edit<K extends FieldKey>(draft: Draft, key: K, value: EditableFields[K]): Draft {
  return { ...draft, form: { ...draft.form, [key]: value } };
}

export const unsavedFields = (draft: Draft): FieldKey[] => changedFields(draft.form, draft.base);

/** A save went through: what I sent is the new base, whatever form the engine stored it in. Edits typed meanwhile stay unsaved. */
export function afterSave(draft: Draft, sent: EditableFields, version: number): Draft {
  return { ...draft, base: sent, version };
}

/** A newer version arrived. With nothing unsaved, show it; otherwise keep the edits on their old version, so saving them conflicts. */
export function rebase(draft: Draft, post: Post): Draft {
  if (post.version <= draft.version || unsavedFields(draft).length > 0) return draft;
  return draftOf(post);
}

/** Keep mine after a conflict: their version with only the fields I changed on top (design §9: nothing is discarded). */
export function withMyChanges(draft: Draft, theirs: Post): Draft {
  const base = toEditable(theirs);
  const mine = Object.fromEntries(unsavedFields(draft).map((key) => [key, draft.form[key]]));
  return { base, version: theirs.version, form: { ...base, ...mine } };
}
