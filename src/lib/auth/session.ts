import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { sessionCookieName } from "@/lib/accounts/cookie";
import type { AccountStore } from "@/lib/accounts/store";
import { hashToken } from "@/lib/accounts/tokens";
import { clientNameOfHost, clientOrigin } from "@/lib/tenancy/address";
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
  const token = env.appUrl ? jar.get(sessionCookieName(env))?.value : undefined;
  if (!token) return null;
  // The expiry is checked against the clock, which a build or a prefetch render must not read (Cache Components).
  await connection();
  const store = getAccountStore();
  const tokenHash = hashToken(token);
  const person = await store.sessionAccount(tokenHash, new Date());
  if (!person) return null;
  const clientId = await currentClientId(store, person.id, tokenHash, (await headers()).get("host"));
  const member = clientId ? await store.member(person.id, clientId) : null;
  return { userId: person.id, clientId, email: person.email, name: person.name, role: member?.role ?? null, twoFactor: false };
});

/**
 * The client this request works on: the one whose address it came to (none when the person doesn't work for it, which
 * then shows No access); at APP_URL, the one this browser last worked on, else the person's first. Remembered per browser.
 */
async function currentClientId(store: AccountStore, userId: string, tokenHash: string, host: string | null): Promise<string | null> {
  const env = serverEnv();
  const named = clientNameOfHost(host, env);
  const places = await store.memberships(userId);
  if (named) {
    const client = await store.clientBySlug(named);
    if (!client || !places.some((place) => place.clientId === client.id)) return null;
    await store.setSessionClient(tokenHash, client.id);
    return client.id;
  }
  const saved = await store.sessionClient(tokenHash);
  if (saved && places.some((place) => place.clientId === saved)) return saved;
  const first = places[0]?.clientId ?? null;
  if (first) await store.setSessionClient(tokenHash, first);
  return first;
}

/**
 * At APP_URL, a client that has its own address is opened there (same page), so links and bookmarks keep working.
 * The proxy passes the page's path as x-request-path.
 */
async function toClientAddress(clientId: string | null): Promise<void> {
  const env = serverEnv();
  if (!env.clientDomain || !clientId) return;
  const head = await headers();
  if (clientNameOfHost(head.get("host"), env)) return;
  const client = await getAccountStore().client(clientId);
  const origin = clientOrigin(client, env);
  if (!origin || origin === env.appUrl) return;
  const path = head.get("x-request-path") ?? "/";
  redirect(`${origin}${path.startsWith("/") ? path : "/"}`);
}

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
  await toClientAddress(session.clientId);
  if (!session.role) redirect(`/${locale}/no-access?why=${session.clientId ? "role" : "client"}`);
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
