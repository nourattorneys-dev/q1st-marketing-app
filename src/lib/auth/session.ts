import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { MOCK_STORE_COOKIE } from "@/lib/engine/mock/registry";
import { MOCK_SCENARIO_COOKIE } from "@/lib/engine/mock/server";
import { serverEnv } from "@/lib/env";
import { createMockDirectory } from "@/lib/users/mock-directory";
import { roleFromClaims, sessionFromClerkUser } from "./clerk-session";
import { decodeMockSession, MOCK_SESSION_COOKIE } from "./mock-session";
import { can, type Permission, type Role } from "./roles";
import type { AuthedSession, Session } from "./types";

/** Reads the signed-in person once per request (React cache), so a page's many guards make one Clerk lookup. Call only under <Suspense>. */
export const getSession = cache(async (): Promise<Session | null> => {
  if (serverEnv().authMode === "mock") {
    // The cookie names a fixed test user; their current role and two-factor status come from the test directory,
    // so a change on /users takes effect on the person's next request, as it does with Clerk.
    const jar = await cookies();
    // Test logins only: the "auth_crash" scenario stands in for a sign-in service that fails while reading the session.
    if (jar.get(MOCK_SCENARIO_COOKIE)?.value === "auth_crash") throw new Error("Simulated sign-in outage (mock scenario auth_crash).");
    const user = decodeMockSession(jar.get(MOCK_SESSION_COOKIE)?.value);
    return user ? createMockDirectory(jar.get(MOCK_STORE_COOKIE)?.value).sessionOf(user.userId) : null;
  }
  const { currentUser } = await import("@clerk/nextjs/server");
  const user = await currentUser();
  return user ? sessionFromClerkUser(user) : null;
});

/** Signed in with a role, or redirected. An Admin without two-factor login is sent to set it up first (design §5, §11). */
export async function requireSession(locale: string): Promise<AuthedSession> {
  const session = await getSession();
  if (!session) redirect(`/${locale}/sign-in`);
  if (!session.role) redirect(`/${locale}/no-access`);
  if (session.role === "admin" && !session.twoFactor) redirect(`/${locale}/security`);
  return { ...session, role: session.role };
}

/** Like requireSession, and redirects to the dashboard when the role lacks the permission. */
export async function requirePermission(locale: string, permission: Permission): Promise<AuthedSession> {
  const session = await requireSession(locale);
  if (!can(session.role, permission)) redirect(`/${locale}`);
  return session;
}

/**
 * Just the role, for a route polled every few seconds (/api/jobs). In Clerk mode it's read from the session token when
 * the instance puts the metadata there, so a poll costs no Clerk Backend API call (M3a follow-up).
 */
export async function getRole(): Promise<Role | null> {
  if (serverEnv().authMode === "clerk") {
    const { auth } = await import("@clerk/nextjs/server");
    const { userId, sessionClaims } = await auth();
    if (!userId) return null;
    const role = roleFromClaims(sessionClaims);
    if (role !== undefined) return role;
  }
  return (await getSession())?.role ?? null;
}
