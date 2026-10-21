"use server";

import { headers } from "next/headers";
import { z } from "zod";
import type { ActionResult } from "@/lib/actions/result";
import { change, IdempotencyKey, INVALID, Locale } from "@/lib/actions/server";
import { getStore } from "@/lib/db";
import { EngineError } from "@/lib/engine/errors";
import { servicesEnv } from "@/lib/services-env";
import { originOf } from "@/lib/settings/addresses";
import { WEBHOOK_EVENTS } from "@/lib/webhooks/events";
import { encryptSecret, secretKeyFor } from "@/lib/webhooks/secret";
import { hookUrlFor } from "@/lib/webhooks/status";

/**
 * Design §11, spec v1.1 §7–8: registers this portal's address for every event, and keeps the secret the engine returns,
 * encrypted. Every setup asks for a new secret, so the stored one matches the engine's even after another deployment
 * registered itself. The secret never leaves the server.
 */
export async function setUpWebhookAction(input: { locale: string; idempotencyKey: string }): Promise<ActionResult<{ connected: true }>> {
  const parsed = z.object({ locale: Locale, idempotencyKey: IdempotencyKey }).safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, idempotencyKey } = parsed.data;
  return change(
    locale,
    idempotencyKey,
    async ({ engine, ...ctx }) => {
      const origin = originOf(await headers());
      if (!origin) throw new EngineError({ status: 400, code: "invalid_input", message: "This dashboard's address couldn't be read from the request." });
      const key = secretKeyFor(servicesEnv());
      if (!key) throw new EngineError({ status: 503, code: "not_configured", message: "WEBHOOK_ENCRYPTION_KEY isn't set, so the secret can't be stored." });
      const url = hookUrlFor(origin);
      const saved = await engine.saveWebhook({ url, events: WEBHOOK_EVENTS, rotateSecret: true }, ctx);
      if (!saved.secret) throw new EngineError({ status: 200, code: "invalid_response", message: "The engine didn't return a webhook secret." });
      await getStore().saveWebhook({ url, secretCipher: encryptSecret(saved.secret, key), updatedAt: new Date() });
      return { connected: true as const };
    },
    "settings.manage",
  );
}
