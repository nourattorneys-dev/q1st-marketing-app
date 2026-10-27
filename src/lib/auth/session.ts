import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { sessionCookieName } from "@/lib/accounts/cookie";
import { sessionAccount } from "@/lib/accounts/sign-in";
import { getAccountStore } from "@/lib/db";
import { MOCK_STORE_COOKIE } from "@/lib/engine/mock/registry";
import { MOCK_SCENARIO_COOKIE } from "@/lib/engine/mock/server";
import { serverEnv } from "@/lib/env";
import { createMockDirectory } from "@/lib/users/mock-directory";
import { decodeMockSession, MOCK_SESSION_COOKIE } from "./mock-session";
import { can, type Permission, type Role } from "./roles";
import { twoFactorStatus, type TwoFactorPolicy } from "./two-factor";
import type { AuthedSession, Session } from "./types";

/** Reads the signed-in person once per request (React cache), so a page's many guards make one lookup. Call only under <Suspense>. */
export const getSession = cache(async (): Promise<Session | null> => {
  const env = serverEnv();
  const jar = await cookies();
  if (env.authMode === "mock") {
    // The cookie names a fixed test user; their current role and two-factor status come from the test directory,
    // so a change on /users takes effect on the person's next request.
    // Test logins only: the "auth_crash" scenario stands in for a sign-in that fails while reading the session.
    if (jar.get(MOCK_SCENARIO_COOKIE)?.value === "auth_crash") throw new Error("Simulated sign-in outage (mock scenario auth_crash).");
    const user = decodeMockSession(jar.get(MOCK_SESSION_COOKIE)?.value);
    return user ? createMockDirectory(jar.get(MOCK_STORE_COOKIE)?.value).sessionOf(user.userId) : null;
  }
  // Spec M5c: the cookie names a session in the database, and the account's current role comes with it, so a change on
  // /users takes effect on the next request.
  const token = env.appUrl ? jar.get(sessionCookieName(env.appUrl))?.value : undefined;
  if (!token) return null;
  const account = await sessionAccount(getAccountStore(), token, new Date());
  return account ? { userId: account.id, email: account.email, name: account.name, role: account.role, twoFactor: false } : null;
});

/**
 * TWO_FACTOR, which test logins can also switch off through the `twofactor_off` scenario cookie, so the e2e suite sees
 * both modes on one server. Call only under <Suspense>.
 */
export async function getTwoFactorPolicy(): Promise<TwoFactorPolicy> {
  const env = serverEnv();
  if (env.authMode === "mock" && (await cookies()).get(MOCK_SCENARIO_COOKIE)?.value === "twofactor_off") return "off";
  return env.twoFactor;
}

/**
 * Signed in with a role, or redirected. While two-factor login is required, an Admin without it is sent to set it up
 * first (design §5, §11).
 */
export async function requireSession(locale: string): Promise<AuthedSession> {
  const session = await getSession();
  if (!session) redirect(`/${locale}/sign-in`);
  if (!session.role) redirect(`/${locale}/no-access`);
  if (twoFactorStatus(await getTwoFactorPolicy(), session) === "required") redirect(`/${locale}/security`);
  return { ...session, role: session.role };
}

/** Like requireSession, and redirects to the dashboard when the role lacks the permission. */
export async function requirePermission(locale: string, permission: Permission): Promise<AuthedSession> {
  const session = await requireSession(locale);
  if (!can(session.role, permission)) redirect(`/${locale}`);
  return session;
}

/** Just the role, for a route polled every few seconds (/api/jobs): the same one-query session lookup. */
export async function getRole(): Promise<Role | null> {
  return (await getSession())?.role ?? null;
}
