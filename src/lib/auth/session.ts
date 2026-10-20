import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { serverEnv } from "@/lib/env";
import { sessionFromClerkUser } from "./clerk-session";
import { decodeMockSession, MOCK_SESSION_COOKIE } from "./mock-session";
import { can, type Permission } from "./roles";
import type { AuthedSession, Session } from "./types";

/** Reads the signed-in person. Call only inside a component rendered under <Suspense>. */
export async function getSession(): Promise<Session | null> {
  if (serverEnv().authMode === "mock") {
    return decodeMockSession((await cookies()).get(MOCK_SESSION_COOKIE)?.value);
  }
  const { currentUser } = await import("@clerk/nextjs/server");
  const user = await currentUser();
  return user ? sessionFromClerkUser(user) : null;
}

/** Signed in with a role, or redirected to sign-in / no-access. */
export async function requireSession(locale: string): Promise<AuthedSession> {
  const session = await getSession();
  if (!session) redirect(`/${locale}/sign-in`);
  if (!session.role) redirect(`/${locale}/no-access`);
  return { ...session, role: session.role };
}

/** Like requireSession, and redirects to the dashboard when the role lacks the permission. */
export async function requirePermission(locale: string, permission: Permission): Promise<AuthedSession> {
  const session = await requireSession(locale);
  if (!can(session.role, permission)) redirect(`/${locale}`);
  return session;
}
