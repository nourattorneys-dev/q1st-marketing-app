"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/actions/result";
import { IdempotencyKey, INVALID, Locale } from "@/lib/actions/server";
import { ROLES, type Role } from "@/lib/auth/roles";
import { requirePermission } from "@/lib/auth/session";
import { serverEnv } from "@/lib/env";
import { servicesEnv } from "@/lib/services-env";
import { getDirectory } from "@/lib/users/directory";
import { canChangeAccess } from "@/lib/users/rules";
import { tryDirectory, type DirectoryInvite, type DirectoryUser } from "@/lib/users/types";

// Ids go into database lookups: letters, digits, "_" and "-" only, like the ids the dashboard makes.
const DirectoryId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const RoleChoice = z.enum(ROLES);
const SELF = { ok: false as const, error: { status: 403, code: "self", message: "You can't change your own access." } };

/** An invitation plus whether its email stayed on this server (password mode with EMAIL_MODE=log, spec M5c). */
export type SentInvite = DirectoryInvite & { notSent: boolean };

function invitationsNotSent(): boolean {
  return serverEnv().authMode === "password" && servicesEnv().emailMode === "log";
}

// The idempotency key from useEngineAction is checked but not used: each change here is safe to repeat (a second
// invitation to the same email is refused as a duplicate; setting the same role twice changes nothing).

/** Design §5: the Admin invites someone by email with a role; the role reaches their account when they sign up. */
export async function inviteUserAction(input: { locale: string; email: string; role: Role; idempotencyKey: string }): Promise<ActionResult<SentInvite>> {
  const parsed = z.object({ locale: Locale, email: z.string().max(320), role: RoleChoice, idempotencyKey: IdempotencyKey }).safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, email, role } = parsed.data;
  const session = await requirePermission(locale, "users.manage");
  const result = await tryDirectory(async () => ({ ...(await (await getDirectory()).invite(email, role, session.userId)), notSent: invitationsNotSent() }));
  if (result.ok) refresh();
  return result;
}

export async function revokeInviteAction(input: { locale: string; inviteId: string; idempotencyKey: string }): Promise<ActionResult<{ revoked: true }>> {
  const parsed = z.object({ locale: Locale, inviteId: DirectoryId, idempotencyKey: IdempotencyKey }).safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, inviteId } = parsed.data;
  await requirePermission(locale, "users.manage");
  const result = await tryDirectory(async () => (await getDirectory()).revokeInvite(inviteId));
  if (result.ok) refresh();
  return result;
}

/** Spec M5c: a new link and a new 7-day expiry for a pending invitation; the old link stops working. */
export async function resendInviteAction(input: { locale: string; inviteId: string; idempotencyKey: string }): Promise<ActionResult<SentInvite>> {
  const parsed = z.object({ locale: Locale, inviteId: DirectoryId, idempotencyKey: IdempotencyKey }).safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, inviteId } = parsed.data;
  await requirePermission(locale, "users.manage");
  const result = await tryDirectory(async () => ({ ...(await (await getDirectory()).resendInvite(inviteId)), notSent: invitationsNotSent() }));
  if (result.ok) refresh();
  return result;
}

/** Admin, Reviewer, or no access (null). Nobody changes their own access (Review Focus 1). */
export async function setUserRoleAction(input: {
  locale: string;
  userId: string;
  role: Role | null;
  idempotencyKey: string;
}): Promise<ActionResult<DirectoryUser>> {
  const parsed = z.object({ locale: Locale, userId: DirectoryId, role: RoleChoice.nullable(), idempotencyKey: IdempotencyKey }).safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, userId, role } = parsed.data;
  const session = await requirePermission(locale, "users.manage");
  if (!canChangeAccess(session.userId, userId)) return SELF;
  const result = await tryDirectory(async () => (await getDirectory()).setRole(userId, role));
  if (result.ok) refresh();
  return result;
}
