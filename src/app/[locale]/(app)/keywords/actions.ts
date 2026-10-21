"use server";

import { z } from "zod";
import type { ActionResult } from "@/lib/actions/result";
import { change, EngineId, IdempotencyKey, INVALID, Locale } from "@/lib/actions/server";
import { KEYWORD_BULK_ACTIONS, type KeywordBulkAction } from "@/lib/engine/api";
import type { BulkResult, JobStart, Keyword } from "@/lib/engine/schemas";
import { skippedPhrases } from "@/lib/keywords/phrases";

// Languages are checked by the engine against /meta; here only their shape ("en", "ar") and "both" for drafts.
const Language = z.string().regex(/^[a-z]{2,3}$/);
const DraftLanguage = z.union([Language, z.literal("both")]);
const Ids = z.array(EngineId).min(1).max(100);

export type AddedKeywords = { created: Keyword[]; skipped: string[] };

export async function addKeywordsAction(input: {
  locale: string;
  phrases: string[];
  language: string;
  idempotencyKey: string;
}): Promise<ActionResult<AddedKeywords>> {
  const parsed = z
    .object({ locale: Locale, phrases: z.array(z.string().trim().min(1).max(100)).min(1).max(50), language: Language, idempotencyKey: IdempotencyKey })
    .safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, phrases, language, idempotencyKey } = parsed.data;
  const result = await change(locale, idempotencyKey, ({ engine, ...ctx }) => engine.addKeywords(phrases, language, ctx));
  return result.ok ? { ok: true, data: { created: result.data, skipped: skippedPhrases(phrases, result.data) } } : result;
}

export async function bulkKeywordsAction(input: {
  locale: string;
  action: KeywordBulkAction;
  ids: string[];
  idempotencyKey: string;
}): Promise<ActionResult<BulkResult>> {
  const parsed = z.object({ locale: Locale, action: z.enum(KEYWORD_BULK_ACTIONS), ids: Ids, idempotencyKey: IdempotencyKey }).safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, action, ids, idempotencyKey } = parsed.data;
  return change(locale, idempotencyKey, ({ engine, ...ctx }) => engine.bulkKeywords(action, ids, ctx));
}

export async function proposeKeywordsAction(input: { locale: string; language?: string; idempotencyKey: string }): Promise<ActionResult<JobStart>> {
  const parsed = z.object({ locale: Locale, language: Language.optional(), idempotencyKey: IdempotencyKey }).safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, language, idempotencyKey } = parsed.data;
  return change(locale, idempotencyKey, ({ engine, ...ctx }) => engine.proposeKeywords(language, ctx));
}

export async function keywordTopicsAction(input: { locale: string; ids: string[]; idempotencyKey: string }): Promise<ActionResult<JobStart>> {
  const parsed = z.object({ locale: Locale, ids: Ids, idempotencyKey: IdempotencyKey }).safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, ids, idempotencyKey } = parsed.data;
  return change(locale, idempotencyKey, ({ engine, ...ctx }) => engine.keywordTopics(ids, ctx));
}

export async function draftKeywordArticlesAction(input: {
  locale: string;
  ids: string[];
  language: string;
  idempotencyKey: string;
}): Promise<ActionResult<JobStart>> {
  const parsed = z.object({ locale: Locale, ids: Ids, language: DraftLanguage, idempotencyKey: IdempotencyKey }).safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, ids, language, idempotencyKey } = parsed.data;
  return change(locale, idempotencyKey, ({ engine, ...ctx }) => engine.draftKeywordArticles(ids, language, ctx));
}
