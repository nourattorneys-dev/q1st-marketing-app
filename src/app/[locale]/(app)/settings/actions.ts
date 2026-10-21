"use server";

import { headers } from "next/headers";
import { z } from "zod";
import type { ActionResult } from "@/lib/actions/result";
import { ask, change, EngineId, engineFor, IdempotencyKey, INVALID, Locale } from "@/lib/actions/server";
import { tryEngine } from "@/lib/engine/result";
import {
  PublishingSettingsSchema,
  SeoUpdateSchema,
  WebsiteTargetInputSchema,
  WebsiteUpdateSchema,
  type JobStart,
  type PublishingSettings,
  type PublishTarget,
  type SeoSettings,
  type WebsiteTest,
} from "@/lib/engine/schemas";
import { originOf } from "@/lib/settings/addresses";

// Every settings page and action is the Admin's (design §5).
const MANAGE = "settings.manage" as const;
const Read = z.object({ locale: Locale });
const Change = z.object({ locale: Locale, idempotencyKey: IdempotencyKey });

export async function loadSeoAction(input: { locale: string }): Promise<ActionResult<SeoSettings>> {
  const parsed = Read.safeParse(input);
  if (!parsed.success) return INVALID;
  const { engine } = await engineFor(parsed.data.locale, MANAGE);
  return tryEngine(() => engine.seoSettings());
}

export async function saveSeoAction(input: { locale: string; update: z.infer<typeof SeoUpdateSchema>; idempotencyKey: string }): Promise<ActionResult<SeoSettings>> {
  const parsed = Change.extend({ update: SeoUpdateSchema }).safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, update, idempotencyKey } = parsed.data;
  return change(locale, idempotencyKey, ({ engine, ...ctx }) => engine.saveSeo(update, ctx), MANAGE);
}

/** AI suggestions for focus keywords and the call to action: a job; nothing on the page changes until it's done. */
export async function proposeSeoAction(input: { locale: string; idempotencyKey: string }): Promise<ActionResult<JobStart>> {
  const parsed = Change.safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, idempotencyKey } = parsed.data;
  return ask(locale, idempotencyKey, ({ engine, ...ctx }) => engine.proposeSeo(ctx), MANAGE);
}

const PictureUpload = z.object({ locale: Locale, idempotencyKey: IdempotencyKey, file: z.instanceof(File) });

/** The share picture: the browser sends FormData; the engine checks its type and size (spec v1.1 §10). */
export async function uploadSeoPictureAction(form: FormData): Promise<ActionResult<{ url: string }>> {
  const parsed = PictureUpload.safeParse({ locale: form.get("locale"), idempotencyKey: form.get("idempotencyKey"), file: form.get("file") });
  if (!parsed.success) return INVALID;
  const { locale, idempotencyKey, file } = parsed.data;
  return change(locale, idempotencyKey, ({ engine, ...ctx }) => engine.uploadSeoPicture(file, ctx), MANAGE);
}

export async function removeSeoPictureAction(input: { locale: string; idempotencyKey: string }): Promise<ActionResult<{ removed: true }>> {
  const parsed = Change.safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, idempotencyKey } = parsed.data;
  return change(locale, idempotencyKey, ({ engine, ...ctx }) => engine.removeSeoPicture(ctx), MANAGE);
}

export async function loadPublishingAction(input: { locale: string }): Promise<ActionResult<PublishingSettings>> {
  const parsed = Read.safeParse(input);
  if (!parsed.success) return INVALID;
  const { engine } = await engineFor(parsed.data.locale, MANAGE);
  return tryEngine(() => engine.publishingSettings());
}

export async function savePublishingAction(input: { locale: string; update: PublishingSettings; idempotencyKey: string }): Promise<ActionResult<PublishingSettings>> {
  const parsed = Change.extend({ update: PublishingSettingsSchema }).safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, update, idempotencyKey } = parsed.data;
  return change(locale, idempotencyKey, ({ engine, ...ctx }) => engine.savePublishing(update, ctx), MANAGE);
}

export async function loadWebsiteAction(input: { locale: string }): Promise<ActionResult<PublishTarget>> {
  const parsed = Read.safeParse(input);
  if (!parsed.success) return INVALID;
  const { engine } = await engineFor(parsed.data.locale, MANAGE);
  return tryEngine(() => engine.websiteSettings());
}

/** Test connection with the unsaved values (spec v1.1 §7). Nothing is saved, so the page isn't refreshed. */
export async function testWebsiteAction(input: {
  locale: string;
  target: z.infer<typeof WebsiteTargetInputSchema>;
  idempotencyKey: string;
}): Promise<ActionResult<WebsiteTest>> {
  const parsed = Change.extend({ target: WebsiteTargetInputSchema }).safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, target, idempotencyKey } = parsed.data;
  return ask(locale, idempotencyKey, ({ engine, ...ctx }) => engine.testWebsite(target, ctx), MANAGE);
}

export async function saveWebsiteAction(input: {
  locale: string;
  update: z.infer<typeof WebsiteUpdateSchema>;
  idempotencyKey: string;
}): Promise<ActionResult<PublishTarget>> {
  const parsed = Change.extend({ update: WebsiteUpdateSchema }).safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, update, idempotencyKey } = parsed.data;
  return change(locale, idempotencyKey, ({ engine, ...ctx }) => engine.saveWebsite(update, ctx), MANAGE);
}

/** Where the OAuth round trip comes back to: this portal's Social accounts page, in the person's language. */
async function returnUrlFor(locale: string): Promise<string | null> {
  const origin = originOf(await headers());
  return origin ? `${origin}/${locale}/settings/social` : null;
}

export async function connectSocialAction(input: { locale: string; platform: string }): Promise<ActionResult<{ authorizeUrl: string }>> {
  const parsed = Read.extend({ platform: EngineId }).safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, platform } = parsed.data;
  const { engine } = await engineFor(locale, MANAGE);
  const returnUrl = await returnUrlFor(locale);
  if (!returnUrl) return INVALID;
  return tryEngine(() => engine.connectSocial(platform, returnUrl));
}

export async function disconnectSocialAction(input: { locale: string; platform: string; idempotencyKey: string }): Promise<ActionResult<{ disconnected: true }>> {
  const parsed = Change.extend({ platform: EngineId }).safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, platform, idempotencyKey } = parsed.data;
  return change(locale, idempotencyKey, ({ engine, ...ctx }) => engine.disconnectSocial(platform, ctx), MANAGE);
}

export async function connectSearchConsoleAction(input: { locale: string }): Promise<ActionResult<{ authorizeUrl: string }>> {
  const parsed = Read.safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale } = parsed.data;
  const { engine } = await engineFor(locale, MANAGE);
  const returnUrl = await returnUrlFor(locale);
  if (!returnUrl) return INVALID;
  return tryEngine(() => engine.connectSearchConsole(returnUrl));
}

export async function disconnectSearchConsoleAction(input: { locale: string; idempotencyKey: string }): Promise<ActionResult<{ disconnected: true }>> {
  const parsed = Change.safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, idempotencyKey } = parsed.data;
  return change(locale, idempotencyKey, ({ engine, ...ctx }) => engine.disconnectSearchConsole(ctx), MANAGE);
}
