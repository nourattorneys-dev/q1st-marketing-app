import type { Post } from "@/lib/engine/schemas";
import { changedFields, toEditable, type EditableFields, type FieldKey } from "./changed-fields";

/**
 * The reviewer's form, the saved version it started from, and the engine's own copy of that version (it may store
 * HTML in its own form). A save sends the version (spec v1.1 §3), so a newer save by someone else always comes back as
 * version_conflict instead of being overwritten.
 */
export type Draft = { base: EditableFields; server: EditableFields; version: number; form: EditableFields };

export function draftOf(post: Post): Draft {
  const fields = toEditable(post);
  return { base: fields, server: fields, version: post.version, form: fields };
}

export function edit<K extends FieldKey>(draft: Draft, key: K, value: EditableFields[K]): Draft {
  return { ...draft, form: { ...draft.form, [key]: value } };
}

export const unsavedFields = (draft: Draft): FieldKey[] => changedFields(draft.form, draft.base);

/** A save went through: what I sent is the new base, whatever form the engine stored it in. Edits typed meanwhile stay unsaved. */
export function afterSave(draft: Draft, sent: EditableFields, saved: Post): Draft {
  return { ...draft, base: sent, server: toEditable(saved), version: saved.version };
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
  return { base, server: base, version: theirs.version, form: { ...base, ...mine } };
}

/**
 * The photo changed on the server (picked, uploaded or removed; those endpoints may bump the version). The photo's
 * alt text and credit follow the server. The version is taken over only if nothing else changed there, so a save by
 * someone else in between still comes back as a conflict.
 */
export function withServerImage(draft: Draft, post: Post): Draft {
  const server = toEditable(post);
  const othersUnchanged = changedFields({ ...server, image: null }, { ...draft.server, image: null }).length === 0;
  return {
    version: othersUnchanged ? Math.max(draft.version, post.version) : draft.version,
    base: { ...draft.base, image: server.image },
    server: othersUnchanged ? server : { ...draft.server, image: server.image },
    form: { ...draft.form, image: server.image },
  };
}
