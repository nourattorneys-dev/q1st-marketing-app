"use server";

import { z } from "zod";
import type { ActionResult } from "@/lib/actions/result";
import { INVALID, Locale } from "@/lib/actions/server";
import { requireSession } from "@/lib/auth/session";
import { selectSite } from "./index";

const NOT_FOUND = { ok: false as const, error: { status: 404, code: "not_found", message: "No such website." } };

/** P1b header switcher: saves the site this browser works on. Another client's site is answered as not found. */
export async function selectSiteAction(input: { locale: string; siteId: string }): Promise<ActionResult<{ siteId: string }>> {
  const parsed = z.object({ locale: Locale, siteId: z.string().regex(/^[A-Za-z0-9_-]{1,191}$/) }).safeParse(input);
  if (!parsed.success) return INVALID;
  await requireSession(parsed.data.locale);
  return (await selectSite(parsed.data.siteId)) ? { ok: true, data: { siteId: parsed.data.siteId } } : NOT_FOUND;
}
