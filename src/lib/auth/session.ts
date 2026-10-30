import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
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
import { getClientStatus, getCurrentSite } from "@/lib/tenancy";

/** Reads the signed-in person once per request (React cache), so a page's many guards make one lookup. Call only under <Suspense>. */
export const getSession = cache(async (): Promise<Session | null> => {
  // The request first: while Next builds a page, cookies() stops it before the settings are read, so a build never
  // needs them (settings are read at request time only, M5a).
  const jar = await cookies();
  const env = serverEnv();
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
  // The expiry is checked against the clock, which a build or a prefetch render must not read (Cache Components).
  await connection();
  const account = await sessionAccount(getAccountStore(), token, new Date());
  return account ? { userId: account.id, clientId: account.clientId, email: account.email, name: account.name, role: account.role, twoFactor: false } : null;
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
  if (!session.role) redirect(`/${locale}/no-access?why=role`);
  // P1c: the client is paused or closed in the staff portal.
  const status = await getClientStatus();
  if (status === "suspended" || status === "closed") redirect(`/${locale}/no-access?why=${status}`);
  // P1b: a role but no site to open (none granted, removed, or the client has none yet).
  if (!(await getCurrentSite())) redirect(`/${locale}/no-access?why=site`);
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
