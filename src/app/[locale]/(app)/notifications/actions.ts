"use server";

import { randomUUID } from "node:crypto";
import { refresh } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/actions/result";
import { IdempotencyKey, INVALID, Locale } from "@/lib/actions/server";
import { requirePermission, requireSession } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { MailError } from "@/lib/notifications/mail-error";
import { mailerFor } from "@/lib/notifications/mailer";
import { renderTestEmail } from "@/lib/notifications/render";
import { servicesEnv } from "@/lib/services-env";

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

/**
 * M5b: an Admin emails themselves a test, at once, to check the mail server. It takes no address, so it can only reach
 * the signed-in Admin. Each press is a new email with its own id (the caller's key is checked and not used).
 */
export async function sendTestEmailAction(input: { locale: string; idempotencyKey: string }): Promise<ActionResult<{ to: string; sent: boolean }>> {
  const parsed = z.object({ locale: Locale, idempotencyKey: IdempotencyKey }).safeParse(input);
  if (!parsed.success) return INVALID;
  const session = await requirePermission(parsed.data.locale, "settings.manage");
  const env = servicesEnv();
  try {
    await mailerFor(env).send({ ...renderTestEmail(), to: session.email, idempotencyKey: `test-${randomUUID()}` });
  } catch (error) {
    if (!(error instanceof MailError)) throw error;
    return { ok: false, error: { status: 502, code: "mail_failed", message: error.message, details: { source: "dashboard", kind: error.kind, reply: error.reply } } };
  }
  // With EMAIL_MODE=log the email only went to the outbox (kept for the dev outbox with test logins).
  return { ok: true, data: { to: session.email, sent: env.emailMode === "smtp" } };
}
