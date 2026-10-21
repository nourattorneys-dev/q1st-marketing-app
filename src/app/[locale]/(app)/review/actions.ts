"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { LOCALES } from "@/i18n/locales";
import type { ActionResult } from "@/lib/actions/result";
import { requirePermission } from "@/lib/auth/session";
import { getEngine } from "@/lib/engine";
import { ENGINE_ID } from "@/lib/engine/ids";
import type { ChangeContext } from "@/lib/engine/api";
import { tryEngine } from "@/lib/engine/result";
import { PostUpdateSchema, type BulkResult, type Job, type JobStart, type Post } from "@/lib/engine/schemas";

// Ids go into engine URL paths: only the engine's opaque id characters, so "." or ".." can't reach another endpoint.
const Locale = z.enum(LOCALES);
const Id = z.string().regex(ENGINE_ID);
const Base = z.object({ locale: Locale, postId: Id });
const Change = Base.extend({ idempotencyKey: z.string().min(8) });

const INVALID = { ok: false as const, error: { status: 400, code: "invalid_input", message: "Invalid request." } };

/** Role check + engine + who is acting. Every change in this file goes through it. */
async function engineFor(locale: string) {
  const session = await requirePermission(locale, "content.work");
  return { engine: await getEngine(), actingUser: session.email };
}

async function change<T>(locale: string, idempotencyKey: string, run: (ctx: ChangeContext & { engine: Awaited<ReturnType<typeof getEngine>> }) => Promise<T>): Promise<ActionResult<T>> {
  const { engine, actingUser } = await engineFor(locale);
  const result = await tryEngine(() => run({ engine, actingUser, idempotencyKey }));
  if (result.ok) refresh();
  return result;
}

export async function loadPostAction(input: { locale: string; postId: string }): Promise<ActionResult<Post>> {
  const parsed = Base.safeParse(input);
  if (!parsed.success) return INVALID;
  const { engine } = await engineFor(parsed.data.locale);
  return tryEngine(() => engine.post(parsed.data.postId));
}

export async function savePostAction(input: {
  locale: string;
  postId: string;
  update: z.infer<typeof PostUpdateSchema>;
  idempotencyKey: string;
}): Promise<ActionResult<Post>> {
  const parsed = Change.extend({ update: PostUpdateSchema }).safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, postId, update, idempotencyKey } = parsed.data;
  return change(locale, idempotencyKey, ({ engine, ...ctx }) => engine.savePost(postId, update, ctx));
}

export async function approvePostAction(input: {
  locale: string;
  postId: string;
  overrideReason?: string;
  idempotencyKey: string;
}): Promise<ActionResult<Post>> {
  const parsed = Change.extend({ overrideReason: z.string().max(2000).optional() }).safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, postId, overrideReason, idempotencyKey } = parsed.data;
  return change(locale, idempotencyKey, ({ engine, ...ctx }) => engine.approvePost(postId, overrideReason, ctx));
}

export async function requestChangesAction(input: {
  locale: string;
  postId: string;
  note: string;
  idempotencyKey: string;
}): Promise<ActionResult<JobStart>> {
  const parsed = Change.extend({ note: z.string().max(4000) }).safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, postId, note, idempotencyKey } = parsed.data;
  return change(locale, idempotencyKey, ({ engine, ...ctx }) => engine.requestChanges(postId, note, ctx));
}

export async function rejectPostAction(input: {
  locale: string;
  postId: string;
  note?: string;
  idempotencyKey: string;
}): Promise<ActionResult<Post>> {
  const parsed = Change.extend({ note: z.string().max(4000).optional() }).safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, postId, note, idempotencyKey } = parsed.data;
  return change(locale, idempotencyKey, ({ engine, ...ctx }) => engine.rejectPost(postId, note, ctx));
}

export async function deletePostAction(input: { locale: string; postId: string; idempotencyKey: string }): Promise<ActionResult<{ deleted: true }>> {
  const parsed = Change.safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, postId, idempotencyKey } = parsed.data;
  return change(locale, idempotencyKey, ({ engine, ...ctx }) => engine.deletePost(postId, ctx));
}

export async function lockPostAction(input: { locale: string; postId: string; idempotencyKey: string }) {
  const parsed = Change.safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, postId, idempotencyKey } = parsed.data;
  const { engine, actingUser } = await engineFor(locale); // no refresh(): taking a lock changes nothing on screen
  return tryEngine(() => engine.lockPost(postId, { actingUser, idempotencyKey }));
}

export async function unlockPostAction(input: { locale: string; postId: string; idempotencyKey: string }) {
  const parsed = Change.safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, postId, idempotencyKey } = parsed.data;
  const { engine, actingUser } = await engineFor(locale);
  return tryEngine(() => engine.unlockPost(postId, { actingUser, idempotencyKey }));
}

export async function takeoverPostAction(input: { locale: string; postId: string; idempotencyKey: string }): Promise<ActionResult<Post>> {
  const parsed = Change.safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, postId, idempotencyKey } = parsed.data;
  return change(locale, idempotencyKey, ({ engine, ...ctx }) => engine.takeoverPost(postId, ctx));
}

export async function bulkPostsAction(input: {
  locale: string;
  action: "approve" | "reject" | "delete";
  ids: string[];
  idempotencyKey: string;
}): Promise<ActionResult<BulkResult>> {
  const parsed = z
    .object({ locale: Locale, action: z.enum(["approve", "reject", "delete"]), ids: z.array(Id).min(1).max(100), idempotencyKey: z.string().min(8) })
    .safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, action, ids, idempotencyKey } = parsed.data;
  return change(locale, idempotencyKey, ({ engine, ...ctx }) => engine.bulkPosts(action, ids, undefined, ctx));
}

export async function jobAction(input: { locale: string; jobId: string }): Promise<ActionResult<Job>> {
  const parsed = z.object({ locale: Locale, jobId: Id }).safeParse(input);
  if (!parsed.success) return INVALID;
  const { engine } = await engineFor(parsed.data.locale);
  return tryEngine(() => engine.job(parsed.data.jobId));
}
