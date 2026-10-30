import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { cookieJar } = vi.hoisted(() => ({ cookieJar: new Map<string, string>() }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined),
  }),
}));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), connection: async () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));

import { createAccountsDirectory } from "@/lib/accounts/accounts-directory";
import { createMemoryAccountStore } from "@/lib/accounts/memory-store";
import { createPostgresAccountStore } from "@/lib/accounts/postgres-store";
import { startSession } from "@/lib/accounts/sign-in";
import type { Account, AccountStore } from "@/lib/accounts/store";
import { requireSession } from "@/lib/auth/session";
import { getAccountStore } from "@/lib/db";
import { createMemoryStore } from "@/lib/db/memory-store";
import { connectPostgres, type PostgresConnection } from "@/lib/db/postgres";
import { createPostgresStore } from "@/lib/db/postgres-store";
import { createLogMailer } from "@/lib/notifications/mailer";
import { getCurrentSite, selectSite, siteAudience } from "@/lib/tenancy";
import { chooseSite, grantedSites, sitesFor } from "@/lib/tenancy/access";
import { ensureFirstClient } from "@/lib/tenancy/bootstrap";
import { decryptSiteKey } from "@/lib/tenancy/site-key";
import { freshTestDatabase } from "./postgres-test-db";

const KEY = Buffer.alloc(32, 7);
const ENGINE_KEY = "mk_live_secret_engine_key_123";
const at = new Date("2026-10-30T08:00:00.000Z");
const A = { id: "site_a", name: "Site A" };
const B = { id: "site_b", name: "Site B" };
const C = { id: "site_c", name: "Other client's site" };

const person = (id: string, clientId: string | null, role: Account["role"] = "reviewer"): Account => ({
  id,
  email: `${id}@example.com`,
  name: id,
  role,
  clientId,
  passwordHash: "scrypt$x",
  createdAt: at,
  passwordChangedAt: at,
  lastSignInAt: null,
});

async function twoClients(store: AccountStore) {
  await store.createClient({ id: "cli_1", name: "One", createdAt: at });
  await store.createClient({ id: "cli_2", name: "Two", createdAt: at });
  for (const [site, clientId] of [
    [A, "cli_1"],
    [B, "cli_1"],
    [C, "cli_2"],
  ] as const) {
    await store.createSite({ ...site, clientId, keyCipher: `v1:cipher-of-${site.id}`, createdAt: at });
  }
}

describe("who may open which site (P1b)", () => {
  it("an Admin opens every site of the client; a Reviewer the granted ones, or all when none are granted; no role, none", () => {
    expect(sitesFor("admin", [A, B], ["site_a"])).toEqual([A, B]);
    expect(sitesFor("reviewer", [A, B], [])).toEqual([A, B]);
    expect(sitesFor("reviewer", [A, B], ["site_b"])).toEqual([B]);
    expect(sitesFor(null, [A, B], [])).toEqual([]);
  });

  it("keeps the saved site while it may be opened, else the first; none at all gives null", () => {
    expect(chooseSite([A, B], "site_b")).toEqual(B);
    expect(chooseSite([A, B], "site_c")).toEqual(A);
    expect(chooseSite([A], null)).toEqual(A);
    expect(chooseSite([], "site_a")).toBeNull();
  });

  it("keeps only the client's own sites from a choice; all or none of them means every site", () => {
    expect(grantedSites(["site_b", "site_c", "site_b"], [A, B])).toEqual(["site_b"]);
    expect(grantedSites(["site_a", "site_b"], [A, B])).toBeNull();
    expect(grantedSites(["site_c"], [A, B])).toBeNull();
    expect(grantedSites(null, [A, B])).toBeNull();
  });
});

describe("the first client from the settings file (P1b)", () => {
  it("makes the client and its site from the engine's answer, keeps the engine key encrypted, and adopts everyone already here", async () => {
    const accounts = createMemoryAccountStore();
    const app = createMemoryStore("site_12");
    await accounts.createAccount(person("usr_old", null, "admin"));
    const lookUpSite = vi.fn(async () => ({ id: "site_12", name: "Fakher & Co" }));
    vi.spyOn(console, "info").mockImplementation(() => {});
    const deps = { accounts, storeFor: () => app, exclusive: app.exclusive, engineApiKey: ENGINE_KEY, lookUpSite, key: KEY, now: at };

    expect(await ensureFirstClient(deps)).toBe("made");
    const [client] = await accounts.clients();
    expect(client).toMatchObject({ name: "Fakher & Co" });
    const site = await accounts.site("site_12");
    expect(site).toMatchObject({ clientId: client.id, name: "Fakher & Co" });
    expect(site?.keyCipher).not.toContain(ENGINE_KEY);
    expect(decryptSiteKey(site?.keyCipher ?? "", KEY)).toBe(ENGINE_KEY);
    expect(await accounts.account("usr_old")).toMatchObject({ clientId: client.id });

    // Once only: a second run finds the client and asks the engine nothing.
    expect(await ensureFirstClient(deps)).toBe("ready");
    expect(lookUpSite).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });

  it("without an engine key there is nothing to make; with one but no encryption key it says which setting is missing", async () => {
    const accounts = createMemoryAccountStore();
    const app = createMemoryStore("x");
    const deps = { accounts, storeFor: () => app, exclusive: app.exclusive, lookUpSite: vi.fn(), now: at };
    expect(await ensureFirstClient({ ...deps, engineApiKey: null, key: KEY })).toBe("no-key");
    await expect(ensureFirstClient({ ...deps, engineApiKey: ENGINE_KEY, key: null })).rejects.toThrow("APP_ENCRYPTION_KEY");
    expect(await accounts.clients()).toEqual([]);
  });
});

describe("on Postgres: the first client takes over the records made before sites existed", () => {
  let pgc: PostgresConnection;
  beforeAll(async () => {
    pgc = connectPostgres(await freshTestDatabase("tenancy"));
  });
  afterAll(async () => {
    await pgc?.close();
  });

  it("moves the one webhook registration to the site, and gives it the earlier events, notifications, people and invitations", async () => {
    await pgc.ready();
    await pgc.pool.query(`INSERT INTO webhook_config (id, url, secret_cipher, updated_at) VALUES (1, 'https://p.example/api/hooks/marketing', 'v1:old', now())`);
    await pgc.pool.query(`INSERT INTO webhook_events (id, event, received_at) VALUES ('evt_old', 'post.drafted', now())`);
    await pgc.pool.query(
      `INSERT INTO notifications (event_id, kind, audience, data, created_at) VALUES ('evt_old', 'drafted', 'reviewers', '{}'::jsonb, now())`,
    );
    const accounts = createPostgresAccountStore(pgc);
    await accounts.createAccount(person("usr_pg", null, "admin"));
    await accounts.addInvitation({ id: "inv_pg", email: "inv@example.com", role: "reviewer", clientId: null, siteIds: null, tokenHash: "a".repeat(64), invitedBy: null, createdAt: at, expiresAt: at });
    vi.spyOn(console, "info").mockImplementation(() => {});
    const storeFor = (siteId: string) => createPostgresStore(pgc, siteId);
    const outcome = await ensureFirstClient({
      accounts,
      storeFor,
      exclusive: storeFor("_app").exclusive,
      engineApiKey: ENGINE_KEY,
      lookUpSite: async () => ({ id: "site_pg", name: "PG site" }),
      key: KEY,
      now: at,
    });
    vi.restoreAllMocks();
    expect(outcome).toBe("made");
    const site = storeFor("site_pg");
    expect(await site.webhook()).toMatchObject({ url: "https://p.example/api/hooks/marketing", secretCipher: "v1:old" });
    expect((await pgc.pool.query("SELECT count(*)::int AS n FROM webhook_config")).rows[0].n).toBe(0);
    expect(await site.lastEventAt()).not.toBeNull();
    expect((await site.pendingNotifications()).map((item) => item.eventId)).toEqual(["evt_old"]);
    expect(await storeFor("site_other").pendingNotifications()).toEqual([]);
    const [client] = await accounts.clients();
    expect(await accounts.account("usr_pg")).toMatchObject({ clientId: client.id });
    expect(await accounts.invitation("inv_pg")).toMatchObject({ clientId: client.id });
  });
});

describe("one client never sees another's (P1b isolation)", () => {
  it("a site's store keeps its own webhook, events and notifications", async () => {
    const shared = createMemoryStore("site_a");
    const { createMemoryState } = await import("@/lib/db/memory-store");
    const state = createMemoryState();
    const a = createMemoryStore("site_a", state);
    const b = createMemoryStore("site_b", state);
    await a.saveWebhook({ url: "https://a.example/api/hooks/marketing", secretCipher: "v1:a", updatedAt: at });
    await a.recordEvent({ id: "evt_a", event: "post.drafted", receivedAt: at }, { eventId: "evt_a", kind: "drafted", audience: "reviewers", data: {}, createdAt: at });
    expect(await b.webhook()).toBeNull();
    expect(await b.lastEventAt()).toBeNull();
    expect(await b.pendingNotifications()).toEqual([]);
    expect((await a.pendingNotifications()).map((item) => item.eventId)).toEqual(["evt_a"]);
    expect(shared.siteId).toBe("site_a");
  });

  it("the Users page lists, changes and withdraws only the client's own people and invitations; others are not found", async () => {
    const store = createMemoryAccountStore();
    await twoClients(store);
    await store.createAccount(person("usr_mine", "cli_1"));
    await store.createAccount(person("usr_theirs", "cli_2"));
    await store.addInvitation({ id: "inv_theirs", email: "x@example.com", role: "reviewer", clientId: "cli_2", siteIds: null, tokenHash: "b".repeat(64), invitedBy: null, createdAt: at, expiresAt: at });
    vi.spyOn(console, "info").mockImplementation(() => {});
    const directory = createAccountsDirectory({ store, mailer: createLogMailer(), appUrl: "https://app.example", clientId: "cli_1", sites: [A, B] });

    const listed = await directory.list();
    expect(listed.users.map((user) => user.id)).toEqual(["usr_mine"]);
    expect(listed.invites).toEqual([]);
    await expect(directory.setRole("usr_theirs", "admin")).rejects.toMatchObject({ code: "not_found" });
    await expect(directory.setSites("usr_theirs", ["site_a"])).rejects.toMatchObject({ code: "not_found" });
    await expect(directory.revokeInvite("inv_theirs")).rejects.toMatchObject({ code: "not_found" });
    await expect(directory.resendInvite("inv_theirs")).rejects.toMatchObject({ code: "not_found" });
    expect(await store.account("usr_theirs")).toMatchObject({ role: "reviewer" });
    expect(await store.invitation("inv_theirs")).not.toBeNull();

    // A Reviewer's sites: another client's site is dropped; the invitation carries the choice to the new account.
    expect(await directory.setSites("usr_mine", ["site_b", "site_c"])).toMatchObject({ siteIds: ["site_b"] });
    const invite = await directory.invite("new@example.com", "reviewer", null, ["site_a"]);
    expect(invite).toMatchObject({ siteIds: ["site_a"] });
    expect(await store.invitation(invite.id)).toMatchObject({ clientId: "cli_1", siteIds: ["site_a"] });
    vi.restoreAllMocks();
  });
});

describe("the current site and the switcher (AUTH_MODE=password)", () => {
  beforeEach(() => {
    cookieJar.clear();
    vi.stubEnv("AUTH_MODE", "password");
    vi.stubEnv("APP_URL", "http://localhost:3000");
    vi.stubEnv("DB_MODE", "memory");
    vi.stubEnv("ENGINE_MODE", "mock");
  });
  afterEach(() => vi.unstubAllEnvs());

  let sequence = 0;
  async function signedIn(role: Account["role"], clientId: string, granted: string[] = []): Promise<string> {
    const store = getAccountStore();
    if (!(await store.client("cli_1"))) await twoClients(store);
    const id = `usr_switch${++sequence}`;
    await store.createAccount(person(id, clientId, role));
    if (granted.length) await store.setUserSites(id, granted);
    cookieJar.set("session", (await startSession(store, id, at)).token);
    return id;
  }

  it("shows the client's sites by name, never an engine key, and switches between them", async () => {
    await signedIn("admin", "cli_1");
    const current = await getCurrentSite();
    expect(current).toEqual({ client: { id: "cli_1", name: "One" }, site: A, sites: [A, B] });
    expect(JSON.stringify(current)).not.toContain("cipher");
    expect(await selectSite("site_b")).toBe(true);
    expect((await getCurrentSite())?.site).toEqual(B);
  });

  it("refuses another client's site, and a site the Reviewer wasn't given", async () => {
    await signedIn("reviewer", "cli_1", ["site_b"]);
    expect(await getCurrentSite()).toMatchObject({ site: B, sites: [B] });
    expect(await selectSite("site_c")).toBe(false);
    expect(await selectSite("site_a")).toBe(false);
    expect((await getCurrentSite())?.site).toEqual(B);
  });

  it("a person whose client has no site is sent to the no-access page", async () => {
    const store = getAccountStore();
    await store.createClient({ id: "cli_empty", name: "Empty", createdAt: at });
    await signedIn("admin", "cli_empty");
    await expect(requireSession("en")).rejects.toThrow("REDIRECT:/en/no-access?why=site");
  });

  it("a paused or closed client's people see why on the no-access page; active again opens the app with nothing lost", async () => {
    const store = getAccountStore();
    await signedIn("admin", "cli_1");
    await expect(requireSession("en")).resolves.toMatchObject({ role: "admin" });
    await store.updateClient("cli_1", { status: "suspended" });
    await expect(requireSession("en")).rejects.toThrow("REDIRECT:/en/no-access?why=suspended");
    expect(await getCurrentSite()).toBeNull();
    await store.updateClient("cli_1", { status: "closed" });
    await expect(requireSession("en")).rejects.toThrow("REDIRECT:/en/no-access?why=closed");
    await store.updateClient("cli_1", { status: "active" });
    await expect(requireSession("en")).resolves.toMatchObject({ role: "admin" });
  });

  it("a site's emails go to the client's Admins and the Reviewers who may open it", async () => {
    const store = getAccountStore();
    if (!(await store.client("cli_1"))) await twoClients(store);
    await store.createAccount(person("usr_aud_admin", "cli_1", "admin"));
    await store.createAccount(person("usr_aud_a", "cli_1", "reviewer"));
    await store.setUserSites("usr_aud_a", ["site_a"]);
    await store.createAccount(person("usr_aud_other", "cli_2", "admin"));
    const audience = (await siteAudience("site_b", async () => [])).map((user) => user.id);
    expect(audience).toContain("usr_aud_admin");
    expect(audience).not.toContain("usr_aud_a");
    expect(audience).not.toContain("usr_aud_other");
    expect((await siteAudience("site_a", async () => [])).map((user) => user.id)).toContain("usr_aud_a");
  });
});
