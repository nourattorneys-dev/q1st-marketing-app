"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/actions/result";
import { IdempotencyKey, INVALID, Locale } from "@/lib/actions/server";
import { requireSession } from "@/lib/auth/session";
import { getStore } from "@/lib/db";

/**
 * Design §4 preferences: each person turns their own notification emails on or off. Setting the same value twice changes
 * nothing, so the idempotency key from useEngineAction is checked and not used.
 */
export async function setEmailNotificationsAction(input: { locale: string; enabled: boolean; idempotencyKey: string }): Promise<ActionResult<{ enabled: boolean }>> {
  const parsed = z.object({ locale: Locale, enabled: z.boolean(), idempotencyKey: IdempotencyKey }).safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, enabled } = parsed.data;
  const session = await requireSession(locale);
  await getStore().setEmailOff(session.userId, !enabled, new Date());
  refresh();
  return { ok: true, data: { enabled } };
}
