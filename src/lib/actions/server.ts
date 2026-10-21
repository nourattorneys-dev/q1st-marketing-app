import "server-only";
import { refresh } from "next/cache";
import { z } from "zod";
import { LOCALES } from "@/i18n/locales";
import type { ActionResult } from "@/lib/actions/result";
import { requirePermission } from "@/lib/auth/session";
import { getEngine } from "@/lib/engine";
import type { ChangeContext, EngineApi } from "@/lib/engine/api";
import { ENGINE_ID } from "@/lib/engine/ids";
import { tryEngine } from "@/lib/engine/result";

export const Locale = z.enum(LOCALES);
// Ids go into engine URL paths: only the engine's opaque id characters, so "." or ".." can't reach another endpoint.
export const EngineId = z.string().regex(ENGINE_ID);
export const IdempotencyKey = z.string().min(8);
export const INVALID = { ok: false as const, error: { status: 400, code: "invalid_input", message: "Invalid request." } };

/** Role check + engine + who is acting. Every action goes through it. */
export async function engineFor(locale: string) {
  const session = await requirePermission(locale, "content.work");
  return { engine: await getEngine(), actingUser: session.email };
}

/** A change (design §8): role check, X-Acting-User and the caller's key, then a refresh of the page if it succeeded. */
export async function change<T>(
  locale: string,
  idempotencyKey: string,
  run: (ctx: ChangeContext & { engine: EngineApi }) => Promise<T>,
): Promise<ActionResult<T>> {
  const { engine, actingUser } = await engineFor(locale);
  const result = await tryEngine(() => run({ engine, actingUser, idempotencyKey }));
  if (result.ok) refresh();
  return result;
}
