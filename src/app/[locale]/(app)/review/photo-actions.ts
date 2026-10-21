"use server";

import { z } from "zod";
import type { ActionResult } from "@/lib/actions/result";
import { change, EngineId, engineFor, IdempotencyKey, INVALID, Locale } from "@/lib/actions/server";
import { tryEngine } from "@/lib/engine/result";
import type { Photo, PostImage } from "@/lib/engine/schemas";

export async function searchPhotosAction(input: { locale: string; query: string; page: number }): Promise<ActionResult<Photo[]>> {
  const parsed = z.object({ locale: Locale, query: z.string().trim().min(1).max(200), page: z.number().int().min(1).max(50) }).safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, query, page } = parsed.data;
  const { engine } = await engineFor(locale);
  return tryEngine(() => engine.searchPhotos(query, page));
}

export async function pickPhotoAction(input: {
  locale: string;
  postId: string;
  pexelsId: number;
  alt?: string;
  idempotencyKey: string;
}): Promise<ActionResult<PostImage>> {
  const parsed = z
    .object({ locale: Locale, postId: EngineId, pexelsId: z.number().int().positive(), alt: z.string().max(300).optional(), idempotencyKey: IdempotencyKey })
    .safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, postId, pexelsId, alt, idempotencyKey } = parsed.data;
  return change(locale, idempotencyKey, ({ engine, ...ctx }) => engine.pickPhoto(postId, pexelsId, alt, ctx));
}

const UploadSchema = z.object({
  locale: Locale,
  postId: EngineId,
  idempotencyKey: IdempotencyKey,
  alt: z.string().max(300).optional(),
  credit: z.string().max(300).optional(),
  file: z.instanceof(File),
});

/** A photo upload: the browser sends FormData; its type and size are checked by the engine (spec v1.1 §10). */
export async function uploadPhotoAction(form: FormData): Promise<ActionResult<PostImage>> {
  const parsed = UploadSchema.safeParse({
    locale: form.get("locale"),
    postId: form.get("postId"),
    idempotencyKey: form.get("idempotencyKey"),
    alt: form.get("alt") ?? undefined,
    credit: form.get("credit") ?? undefined,
    file: form.get("file"),
  });
  if (!parsed.success) return INVALID;
  const { locale, postId, idempotencyKey, alt, credit, file } = parsed.data;
  return change(locale, idempotencyKey, ({ engine, ...ctx }) => engine.uploadPhoto(postId, { file, alt, credit }, ctx));
}

export async function removePhotoAction(input: { locale: string; postId: string; idempotencyKey: string }): Promise<ActionResult<{ removed: true }>> {
  const parsed = z.object({ locale: Locale, postId: EngineId, idempotencyKey: IdempotencyKey }).safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, postId, idempotencyKey } = parsed.data;
  return change(locale, idempotencyKey, ({ engine, ...ctx }) => engine.removePhoto(postId, ctx));
}
