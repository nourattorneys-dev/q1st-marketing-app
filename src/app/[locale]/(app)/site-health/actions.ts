"use server";

import { z } from "zod";
import type { ActionResult } from "@/lib/actions/result";
import { ask, change, EngineId, IdempotencyKey, INVALID, Locale } from "@/lib/actions/server";
import { FINDING_BULK_ACTIONS } from "@/lib/engine/api";
import type { BulkResult, JobStart } from "@/lib/engine/schemas";

const Change = z.object({ locale: Locale, idempotencyKey: IdempotencyKey });
const Ids = z.array(EngineId).min(1).max(100);

/** Scan site (spec v1.1 §6): a job. Both roles can start one (design §5: site health view). */
export async function scanSiteAction(input: { locale: string; idempotencyKey: string }): Promise<ActionResult<JobStart>> {
  const parsed = Change.safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, idempotencyKey } = parsed.data;
  return ask(locale, idempotencyKey, ({ engine, ...ctx }) => engine.scanSite(ctx), "siteHealth.view");
}

/** Prepare fixes for the selected findings: a job; nothing changes on the website yet. */
export async function prepareFixesAction(input: { locale: string; ids: string[]; idempotencyKey: string }): Promise<ActionResult<JobStart>> {
  const parsed = Change.extend({ ids: Ids }).safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, ids, idempotencyKey } = parsed.data;
  return ask(locale, idempotencyKey, ({ engine, ...ctx }) => engine.prepareFixes(ids, ctx), "siteHealth.view");
}

/** Apply changes the live website, so it's the Admin's (design §5 siteHealth.apply); dismiss is open to both roles. */
export async function findingsAction(input: { locale: string; action: string; ids: string[]; idempotencyKey: string }): Promise<ActionResult<BulkResult>> {
  const parsed = Change.extend({ action: z.enum(FINDING_BULK_ACTIONS), ids: Ids }).safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, action, ids, idempotencyKey } = parsed.data;
  return change(locale, idempotencyKey, ({ engine, ...ctx }) => engine.bulkFindings(action, ids, ctx), action === "apply" ? "siteHealth.apply" : "siteHealth.view");
}
