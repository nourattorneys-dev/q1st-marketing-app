import type { Post, PostUpdate } from "@/lib/engine/schemas";

export const FIELD_KEYS = ["title", "subtitle", "slug", "metaTitle", "metaDescription", "keywords", "content", "hashtags", "section", "image"] as const;
export type FieldKey = (typeof FIELD_KEYS)[number];

/** The photo's alt text and credit, edited in the photo panel and saved with the other fields. */
export type ImageText = { alt: string | null; credit: string | null };

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
  image: ImageText | null;
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
    image: post.image ? { alt: post.image.alt ?? null, credit: post.image.credit ?? null } : null,
  };
}

const normalize = (value: unknown) => (value === null || value === undefined ? "" : value);

/** Fields where my unsaved edit and the newer saved version differ (shown in the conflict panel). */
export function changedFields(mine: EditableFields, theirs: EditableFields): FieldKey[] {
  return FIELD_KEYS.filter((key) => JSON.stringify(normalize(mine[key])) !== JSON.stringify(normalize(theirs[key])));
}

/** The PUT body (spec v1.1 §7): the editable fields, the photo's alt text and credit when there is a photo, and the version. */
export function toUpdate(fields: EditableFields, version: number): PostUpdate {
  const { image, ...rest } = fields;
  return { ...rest, ...(image ? { image } : {}), version };
}
