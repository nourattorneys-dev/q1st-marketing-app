"use server";

import { z } from "zod";
import type { ActionResult } from "@/lib/actions/result";
import { change, IdempotencyKey, INVALID, Locale } from "@/lib/actions/server";

/** Request upgrade (design §9 429 and the Plan page: Admin only; spec v1.1 §7 POST /account/upgrade-request {metric?, note?}). */
export async function requestUpgradeAction(input: {
  locale: string;
  metric?: string;
  note?: string;
  idempotencyKey: string;
}): Promise<ActionResult<{ requested: true }>> {
  const parsed = z
    .object({ locale: Locale, metric: z.string().max(60).optional(), note: z.string().max(2000).optional(), idempotencyKey: IdempotencyKey })
    .safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, metric, note, idempotencyKey } = parsed.data;
  return change(locale, idempotencyKey, ({ engine, ...ctx }) => engine.requestUpgrade(metric, note, ctx), "plan.manage");
}
