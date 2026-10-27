import { describeMailFailure } from "@/lib/notifications/mail-error";
import type { Mailer } from "@/lib/notifications/mailer";
import { renderAccountEmail } from "@/lib/notifications/render";
import { normalizeEmail } from "@/lib/users/rules";
import { hashPassword, passwordProblem, type PasswordProblem } from "./passwords";
import { printable, startSession, type NewSession } from "./sign-in";
import type { Account, AccountStore } from "./store";
import { hashToken, newToken } from "./tokens";

export const RESET_MINUTES = 60;
export const RESETS_PER_HOUR = 3;
const HOUR_MS = 3_600_000;

export type ResetProblem = "invalid" | PasswordProblem;

/**
 * "Forgot password" (spec M5c): the visitor always gets the same answer, so it never says whether an account exists.
 * The email goes out through `later` (Next's after(): once the answer has been sent), so the time taken says nothing
 * either. At most 3 per address per hour; a failed send is logged, not shown.
 */
export async function requestReset(
  deps: { store: AccountStore; mailer: Mailer; appUrl: string; later: (task: () => Promise<void>) => void },
  input: { email: string; now: Date },
): Promise<void> {
  const { store } = deps;
  const { now } = input;
  const email = normalizeEmail(input.email).slice(0, 255);
  if ((await store.hit(`reset:${email}`, now, HOUR_MS)) > RESETS_PER_HOUR) return;
  const account = await store.accountByEmail(email);
  if (!account) return;
  const token = newToken();
  await store.createReset({ tokenHash: hashToken(token), userId: account.id, createdAt: now, expiresAt: new Date(now.getTime() + RESET_MINUTES * 60_000) });
  deps.later(async () => {
    try {
      await deps.mailer.send({ ...renderAccountEmail("reset", { appUrl: deps.appUrl, token }), to: account.email, idempotencyKey: `reset-${hashToken(token).slice(0, 32)}` });
      console.info(`Password reset email sent: ${printable(email)}`);
    } catch (error) {
      const { kind, reply } = describeMailFailure(error);
      console.error(`Password reset email failed (${kind}): ${reply}`);
    }
  });
}

/** Whether the reset page should show its form for this link. */
export async function resetLinkValid(store: AccountStore, token: string, now: Date): Promise<boolean> {
  const reset = await store.resetByToken(hashToken(token));
  return Boolean(reset && reset.expiresAt.getTime() > now.getTime());
}

/** Sets the new password, ends every session of that person, uses up their reset links, and signs them in here. */
export async function completeReset(
  store: AccountStore,
  input: { token: string; password: string; now: Date },
): Promise<({ ok: true; account: Account } & NewSession) | { ok: false; problem: ResetProblem }> {
  const reset = await store.resetByToken(hashToken(input.token));
  if (!reset || reset.expiresAt.getTime() <= input.now.getTime()) return { ok: false, problem: "invalid" };
  const account = await store.account(reset.userId);
  if (!account) return { ok: false, problem: "invalid" };
  const problem = passwordProblem(input.password, account.email);
  if (problem) return { ok: false, problem };
  await store.setPassword(account.id, await hashPassword(input.password), input.now);
  await store.deleteResetsOf(account.id);
  await store.deleteSessionsOf(account.id);
  // The link proved the email is theirs: the sign-in lock on it ends with the old password.
  await store.clearHits(`email:${account.email}`);
  await store.recordSignIn(account.id, input.now);
  console.info(`Password reset: ${account.email}`);
  return { ok: true, account: { ...account, lastSignInAt: input.now }, ...(await startSession(store, account.id, input.now)) };
}
