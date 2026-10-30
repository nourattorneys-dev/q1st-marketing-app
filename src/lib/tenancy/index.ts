import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { sessionCookieName } from "@/lib/accounts/cookie";
import type { Site } from "@/lib/accounts/store";
import { hashToken } from "@/lib/accounts/tokens";
import { getSession } from "@/lib/auth/session";
import { getAccountStore, getExclusive, getStore } from "@/lib/db";
import { createEngineClient } from "@/lib/engine/client";
import { MOCK_SITE_ID } from "@/lib/engine/mock/fixtures";
import { createMockStore } from "@/lib/engine/mock/store";
import { createMockFetch } from "@/lib/engine/mock/server";
import { SiteRefsSchema } from "@/lib/engine/schemas";
import { serverEnv } from "@/lib/env";
import { servicesEnv } from "@/lib/services-env";
import { MOCK_CLIENT_ID } from "@/lib/auth/mock-session";
import type { DirectoryUser } from "@/lib/users/types";
import { chooseSite, sitesFor, type SiteRef } from "./access";
import { ensureFirstClient, type EngineSite } from "./bootstrap";
import { decryptSiteKey, siteKeyFor } from "./site-key";

export type { SiteRef } from "./access";

/** Test logins (AUTH_MODE=mock) keep one built-in client and site. */
export const MOCK_CLIENT = { id: MOCK_CLIENT_ID, name: "Fakher & Co" } as const;
const MOCK_SITE: SiteRef = { id: MOCK_SITE_ID, name: "Fakher & Co" };

export type CurrentSite = { client: { id: string; name: string }; site: SiteRef; sites: SiteRef[] };

const ref = (site: SiteRef): SiteRef => ({ id: site.id, name: site.name });
const READY = Symbol.for("articles-ai.tenancy-ready");

/** The engine's site for a key (GET /sites): its id and name. */
async function lookUpSite(engineKey: string): Promise<EngineSite> {
  const env = serverEnv();
  const fetchImpl =
    env.engineMode === "mock"
      ? createMockFetch({ baseUrl: env.engineBaseUrl, apiKey: env.engineApiKey, store: createMockStore() })
      : (input: string | URL, init: RequestInit) => fetch(input, init);
  const client = createEngineClient({ baseUrl: env.engineBaseUrl, apiKey: engineKey, fetch: fetchImpl });
  const { data } = await client.request({ method: "GET", path: "/sites", schema: SiteRefsSchema });
  const first = data[0];
  if (!first) throw new Error("The engine key in the settings file opens no site.");
  return { id: first.id, name: first.name ?? first.id };
}

/** Once per process (P1b): the first client from the settings file, when there is none yet. Test logins need none. */
export async function ensureTenancy(): Promise<void> {
  if (serverEnv().authMode === "mock") return;
  const holder = globalThis as unknown as Record<symbol, Promise<void> | undefined>;
  holder[READY] ??= (async () => {
    const services = servicesEnv();
    const env = serverEnv();
    for (let attempt = 0; attempt < 20; attempt++) {
      const outcome = await ensureFirstClient({
        accounts: getAccountStore(),
        storeFor: getStore,
        exclusive: getExclusive(),
        engineApiKey: env.engineApiKey || null,
        lookUpSite,
        key: siteKeyFor(services),
        now: new Date(),
      });
      if (outcome !== "busy") return;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  })().catch((error: unknown) => {
    holder[READY] = undefined;
    throw error;
  });
  await holder[READY];
}

/** The full record of the site this request works on (with its encrypted key); server code only. */
const currentSiteRecord = cache(async (): Promise<{ client: { id: string; name: string }; site: Site; sites: Site[] } | null> => {
  const session = await getSession();
  if (!session?.role || !session.clientId) return null;
  await ensureTenancy();
  const accounts = getAccountStore();
  const client = await accounts.client(session.clientId);
  if (!client) return null;
  const granted = session.role === "admin" ? [] : await accounts.userSites(session.userId);
  const allowed = sitesFor(session.role, await accounts.sites(client.id), granted);
  const env = serverEnv();
  const token = env.appUrl ? (await cookies()).get(sessionCookieName(env.appUrl))?.value : undefined;
  const tokenHash = token ? hashToken(token) : null;
  const saved = tokenHash ? await accounts.sessionSite(tokenHash) : null;
  const site = chooseSite(allowed, saved);
  if (!site) return null;
  // Removed, or access taken away: the first site they may open is used and saved.
  if (tokenHash && site.id !== saved) await accounts.setSessionSite(tokenHash, site.id);
  return { client: { id: client.id, name: client.name }, site, sites: allowed };
});

/** The site this request works on, and the others the person may open (P1b). Null: signed out, or no site to open. */
export const getCurrentSite = cache(async (): Promise<CurrentSite | null> => {
  if (serverEnv().authMode === "mock") {
    const session = await getSession();
    return session?.role ? { client: { ...MOCK_CLIENT }, site: MOCK_SITE, sites: [MOCK_SITE] } : null;
  }
  const record = await currentSiteRecord();
  return record && { client: record.client, site: ref(record.site), sites: record.sites.map(ref) };
});

/** The current site's engine key, decrypted on the server for this request; null when there is no site or it can't be read. */
export async function currentEngineKey(): Promise<string | null> {
  const record = await currentSiteRecord();
  if (!record) return null;
  const key = siteKeyFor(servicesEnv());
  return key ? decryptSiteKey(record.site.keyCipher, key) : null;
}

/** Saves the site this browser works on, when the person may open it. False otherwise (answered as "not found"). */
export async function selectSite(siteId: string): Promise<boolean> {
  const current = await getCurrentSite();
  if (!current?.sites.some((site) => site.id === siteId)) return false;
  if (serverEnv().authMode === "mock") return true;
  const env = serverEnv();
  const token = env.appUrl ? (await cookies()).get(sessionCookieName(env.appUrl))?.value : undefined;
  if (!token) return false;
  await getAccountStore().setSessionSite(hashToken(token), siteId);
  return true;
}

/** Every site the app serves, for the webhook and cron routes. */
export async function allSiteIds(): Promise<string[]> {
  if (serverEnv().authMode === "mock") return [MOCK_SITE.id];
  await ensureTenancy();
  return (await getAccountStore().sites()).map((site) => site.id);
}

/** Whether the app serves this site (an engine site id from an untrusted delivery). */
export async function knownSite(siteId: string): Promise<boolean> {
  return (await allSiteIds()).includes(siteId);
}

/** The people who may open a site (its client's Admins, and Reviewers with access), for its notification emails. */
export async function siteAudience(siteId: string, everyone: () => Promise<DirectoryUser[]>): Promise<DirectoryUser[]> {
  if (serverEnv().authMode === "mock") return everyone();
  const accounts = getAccountStore();
  const site = await accounts.site(siteId);
  if (!site) return [];
  const people: DirectoryUser[] = [];
  for (const account of await accounts.accounts(site.clientId)) {
    const granted = account.role === "admin" ? [] : await accounts.userSites(account.id);
    if (sitesFor(account.role, [site], granted).length === 0) continue;
    people.push({ id: account.id, name: account.name, email: account.email, role: account.role, twoFactor: false, siteIds: granted.length ? granted : null, lastSignInAt: null });
  }
  return people;
}
