import type { Mailer } from "@/lib/notifications/mailer";
import { renderAccountEmail } from "@/lib/notifications/render";
import { hashPassword, passwordProblem, type PasswordProblem } from "./passwords";
import { startSession, type NewSession } from "./sign-in";
import type { Account, AccountStore, Invitation } from "./store";
import { hashToken, newId } from "./tokens";

export const INVITATION_DAYS = 7;
const NAME_MAX = 200;

export type AcceptProblem = "invalid" | "expired" | "taken" | "name" | PasswordProblem;
export type InvitationLookup = { state: "valid"; invitation: Invitation } | { state: "invalid" } | { state: "expired" };

/** An unknown or used link is "invalid"; from its expiry moment on, a link is "expired". */
export async function lookUpInvitation(store: AccountStore, token: string, now: Date): Promise<InvitationLookup> {
  const invitation = await store.invitationByToken(hashToken(token));
  if (!invitation) return { state: "invalid" };
  return invitation.expiresAt.getTime() <= now.getTime() ? { state: "expired" } : { state: "valid", invitation };
}

/** The invitation page: the account gets the invited role and signs in at once; the link is used up (spec M5c). */
export async function acceptInvitation(
  store: AccountStore,
  input: { token: string; name: string; password: string; now: Date },
): Promise<({ ok: true; account: Account } & NewSession) | { ok: false; problem: AcceptProblem }> {
  const found = await lookUpInvitation(store, input.token, input.now);
  if (found.state !== "valid") return { ok: false, problem: found.state };
  const { invitation } = found;
  const name = input.name.trim();
  if (!name || [...name].length > NAME_MAX) return { ok: false, problem: "name" };
  const problem = passwordProblem(input.password, invitation.email);
  if (problem) return { ok: false, problem };
  const account: Account = {
    id: newId("usr"),
    email: invitation.email,
    name,
    role: invitation.role,
    passwordHash: await hashPassword(input.password),
    createdAt: input.now,
    passwordChangedAt: input.now,
    lastSignInAt: input.now,
  };
  if (!(await store.acceptInvitation(invitation.id, account))) {
    // Still there: the email got an account meanwhile. Gone: the link was used at the same moment.
    return { ok: false, problem: (await store.invitation(invitation.id)) ? "taken" : "invalid" };
  }
  console.info(`Account created: ${account.email} (${account.role}) from an invitation`);
  return { ok: true, account, ...(await startSession(store, account.id, input.now)) };
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/** The invitation email (bilingual), to the invited address. A failure is the mailer's MailError, for the caller. */
export async function emailInvitation(mailer: Mailer, appUrl: string, invitation: Invitation, token: string): Promise<void> {
  await mailer.send({
    ...renderAccountEmail("invitation", { appUrl, token, role: invitation.role }),
    to: invitation.email,
    idempotencyKey: `invitation-${invitation.tokenHash.slice(0, 32)}`,
  });
}
