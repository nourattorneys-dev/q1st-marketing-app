import "server-only";
import { refresh } from "next/cache";
import { z } from "zod";
import { LOCALES } from "@/i18n/locales";
import { INVALID, type ActionResult } from "@/lib/actions/result";

export { INVALID };
import type { Permission } from "@/lib/auth/roles";
import { requirePermission } from "@/lib/auth/session";
import { getEngine } from "@/lib/engine";
import type { ChangeContext, EngineApi } from "@/lib/engine/api";
import { ENGINE_ID } from "@/lib/engine/ids";
import { tryEngine } from "@/lib/engine/result";

export const Locale = z.enum(LOCALES);
// Ids go into engine URL paths: only the engine's opaque id characters, so "." or ".." can't reach another endpoint.
export const EngineId = z.string().regex(ENGINE_ID);
export const IdempotencyKey = z.string().min(8);

/** Role check + engine + who is acting. Every action goes through it; most need content.work (design §5). */
export async function engineFor(locale: string, permission: Permission = "content.work") {
  const session = await requirePermission(locale, permission);
  return { engine: await getEngine(), actingUser: session.email };
}

/** A change (design §8): role check, X-Acting-User and the caller's key, then a refresh of the page if it succeeded. */
export async function change<T>(
  locale: string,
  idempotencyKey: string,
  run: (ctx: ChangeContext & { engine: EngineApi }) => Promise<T>,
  permission: Permission = "content.work",
): Promise<ActionResult<T>> {
  const { engine, actingUser } = await engineFor(locale, permission);
  const result = await tryEngine(() => run({ engine, actingUser, idempotencyKey }));
  if (result.ok) refresh();
  return result;
}

/** A request that changes nothing on screen (a connection test, an AI proposal): change()'s checks, acting user and key, no refresh. */
export async function ask<T>(
  locale: string,
  idempotencyKey: string,
  run: (ctx: ChangeContext & { engine: EngineApi }) => Promise<T>,
  permission: Permission = "content.work",
): Promise<ActionResult<T>> {
  const { engine, actingUser } = await engineFor(locale, permission);
  return tryEngine(() => run({ engine, actingUser, idempotencyKey }));
}
