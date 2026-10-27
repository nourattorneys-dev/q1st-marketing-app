import { normalizeEmail } from "@/lib/users/rules";
import { dummyHash, hashPassword, passwordProblem, verifyPassword, type PasswordProblem } from "./passwords";
import type { Account, AccountStore } from "./store";
import { hashToken, newToken } from "./tokens";

export const SESSION_DAYS = 30;
export const SIGN_IN_WINDOW_MS = 15 * 60_000;
export const EMAIL_ATTEMPTS = 5;
export const ADDRESS_ATTEMPTS = 30;
// No account's email is longer (validated at invitation); cutting here keeps the limit keys within their column.
const MAX_EMAIL = 254;

export type NewSession = { token: string; expiresAt: Date };
export type SignInResult = ({ ok: true; account: Account } & NewSession) | { ok: false; reason: "wrong" | "locked" };
export type ChangeResult = { ok: true } | { ok: false; problem: "current" | PasswordProblem };

/** For log lines: a line break in a typed email can't start a forged line of its own. */
export const printable = (text: string): string => text.replace(/[\u0000-\u001f\u007f]/g, "?");

export async function startSession(store: AccountStore, userId: string, now: Date): Promise<NewSession> {
  const token = newToken();
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 86_400_000);
  await store.createSession({ tokenHash: hashToken(token), userId, createdAt: now, expiresAt });
  return { token, expiresAt };
}

export const sessionAccount = (store: AccountStore, token: string, now: Date): Promise<Account | null> => store.sessionAccount(hashToken(token), now);

export const endSession = (store: AccountStore, token: string): Promise<void> => store.deleteSession(hashToken(token));

/**
 * Spec M5c "Signing in": the same answer for a wrong password and an unknown email (checked against a dummy hash, so
 * the time taken says nothing either); 5 failures per email and 30 per address in 15 minutes lock them; each sign-in
 * and refusal is logged with the email and address, never the password.
 */
export async function signIn(store: AccountStore, attempt: { email: string; password: string; address: string | null; now: Date }): Promise<SignInResult> {
  const { address, now } = attempt;
  const email = normalizeEmail(attempt.email).slice(0, MAX_EMAIL + 1);
  const where = address ?? "unknown address";
  const emailKey = `email:${email}`;
  const addressKey = address ? `ip:${address}` : null;

  const locked =
    (await store.hits(emailKey, now, SIGN_IN_WINDOW_MS)) >= EMAIL_ATTEMPTS ||
    (addressKey !== null && (await store.hits(addressKey, now, SIGN_IN_WINDOW_MS)) >= ADDRESS_ATTEMPTS);
  if (locked) {
    console.warn(`Sign-in refused (locked): ${printable(email)} from ${where}`);
    return { ok: false, reason: "locked" };
  }

  const account = await store.accountByEmail(email);
  const matches = await verifyPassword(attempt.password, account?.passwordHash ?? (await dummyHash()));
  if (!account || !matches) {
    await store.hit(emailKey, now, SIGN_IN_WINDOW_MS);
    if (addressKey) await store.hit(addressKey, now, SIGN_IN_WINDOW_MS);
    console.warn(`Sign-in refused (wrong password): ${printable(email)} from ${where}`);
    return { ok: false, reason: "wrong" };
  }

  await store.clearHits(emailKey);
  await store.recordSignIn(account.id, now);
  const session = await startSession(store, account.id, now);
  console.info(`Signed in: ${email} from ${where}`);
  return { ok: true, account: { ...account, lastSignInAt: now }, ...session };
}

/** The Account page: the current password first, the rules, then every other session of this person ends. */
export async function changePassword(
  store: AccountStore,
  change: { account: Account; current: string; next: string; keepToken: string; now: Date },
): Promise<ChangeResult> {
  const { account } = change;
  if (!(await verifyPassword(change.current, account.passwordHash))) return { ok: false, problem: "current" };
  const problem = passwordProblem(change.next, account.email);
  if (problem) return { ok: false, problem };
  await store.setPassword(account.id, await hashPassword(change.next), change.now);
  await store.deleteSessionsOf(account.id, hashToken(change.keepToken));
  console.info(`Password changed: ${account.email}`);
  return { ok: true };
}
