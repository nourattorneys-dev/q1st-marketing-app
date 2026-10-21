"use server";

import { z } from "zod";
import type { ActionResult } from "@/lib/actions/result";
import { change, EngineId, IdempotencyKey, INVALID, Locale } from "@/lib/actions/server";
import { SUGGESTION_BULK_ACTIONS, type DraftRequest, type SuggestionBulkAction } from "@/lib/engine/api";
import type { BulkResult, JobStart, Suggestion } from "@/lib/engine/schemas";

const Language = z.string().regex(/^[a-z]{2,3}$/);
const DraftLanguage = z.union([Language, z.literal("both")]);

const DraftRequestSchema = z.object({
  topic: z.string().trim().min(1).max(200),
  kind: z.string().min(1).max(20),
  platform: z.string().min(1).max(20),
  language: DraftLanguage,
  tone: z.string().trim().max(200).optional(),
  keywords: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
});

export async function draftSuggestionAction(input: {
  locale: string;
  suggestionId: string;
  language: string;
  idempotencyKey: string;
}): Promise<ActionResult<JobStart>> {
  const parsed = z.object({ locale: Locale, suggestionId: EngineId, language: DraftLanguage, idempotencyKey: IdempotencyKey }).safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, suggestionId, language, idempotencyKey } = parsed.data;
  return change(locale, idempotencyKey, ({ engine, ...ctx }) => engine.draftSuggestion(suggestionId, language, ctx));
}

export async function dismissSuggestionAction(input: { locale: string; suggestionId: string; idempotencyKey: string }): Promise<ActionResult<Suggestion>> {
  const parsed = z.object({ locale: Locale, suggestionId: EngineId, idempotencyKey: IdempotencyKey }).safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, suggestionId, idempotencyKey } = parsed.data;
  return change(locale, idempotencyKey, ({ engine, ...ctx }) => engine.dismissSuggestion(suggestionId, ctx));
}

export async function bulkSuggestionsAction(input: {
  locale: string;
  action: SuggestionBulkAction;
  ids: string[];
  language?: string;
  idempotencyKey: string;
}): Promise<ActionResult<BulkResult>> {
  const parsed = z
    .object({
      locale: Locale,
      action: z.enum(SUGGESTION_BULK_ACTIONS),
      ids: z.array(EngineId).min(1).max(100),
      language: DraftLanguage.optional(),
      idempotencyKey: IdempotencyKey,
    })
    .safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, action, ids, language, idempotencyKey } = parsed.data;
  return change(locale, idempotencyKey, ({ engine, ...ctx }) => engine.bulkSuggestions(action, ids, language, ctx));
}

export async function createDraftsAction(input: { locale: string; request: DraftRequest; idempotencyKey: string }): Promise<ActionResult<JobStart>> {
  const parsed = z.object({ locale: Locale, request: DraftRequestSchema, idempotencyKey: IdempotencyKey }).safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, request, idempotencyKey } = parsed.data;
  return change(locale, idempotencyKey, ({ engine, ...ctx }) => engine.createDrafts(request, ctx));
}
