"use server";

import { z } from "zod";
import type { ActionResult } from "@/lib/actions/result";
import { change, IdempotencyKey, INVALID, Locale } from "@/lib/actions/server";

/** Request upgrade (design §9 429: Admin only; spec v1.1 §7 POST /account/upgrade-request). */
export async function requestUpgradeAction(input: { locale: string; metric?: string; idempotencyKey: string }): Promise<ActionResult<{ requested: true }>> {
  const parsed = z.object({ locale: Locale, metric: z.string().max(60).optional(), idempotencyKey: IdempotencyKey }).safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, metric, idempotencyKey } = parsed.data;
  return change(locale, idempotencyKey, ({ engine, ...ctx }) => engine.requestUpgrade(metric, undefined, ctx), "plan.manage");
}
