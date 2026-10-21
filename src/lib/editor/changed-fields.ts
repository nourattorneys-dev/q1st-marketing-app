import type { Post } from "@/lib/engine/schemas";

export const FIELD_KEYS = ["title", "subtitle", "slug", "metaTitle", "metaDescription", "keywords", "content", "hashtags", "section"] as const;
export type FieldKey = (typeof FIELD_KEYS)[number];

export type EditableFields = {
  title: string;
  subtitle: string | null;
  slug: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  keywords: string[];
  content: string;
  hashtags: string[];
  section: string | null;
};

export function toEditable(post: Post): EditableFields {
  return {
    title: post.title,
    subtitle: post.subtitle ?? null,
    slug: post.slug ?? null,
    metaTitle: post.metaTitle ?? null,
    metaDescription: post.metaDescription ?? null,
    keywords: [...post.keywords],
    content: post.content ?? "",
    hashtags: [...post.hashtags],
    section: post.section ?? null,
  };
}

const normalize = (value: unknown) => (value === null || value === undefined ? "" : value);

/** Fields where my unsaved edit and the newer saved version differ (shown in the conflict panel). */
export function changedFields(mine: EditableFields, theirs: EditableFields): FieldKey[] {
  return FIELD_KEYS.filter((key) => JSON.stringify(normalize(mine[key])) !== JSON.stringify(normalize(theirs[key])));
}
