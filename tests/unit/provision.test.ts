import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), connection: async () => {} }));

import { createMemoryAccountStore } from "@/lib/accounts/memory-store";
import { createPostgresAccountStore } from "@/lib/accounts/postgres-store";
import { connectPostgres, type PostgresConnection } from "@/lib/db/postgres";
import { createPostgresStore } from "@/lib/db/postgres-store";
import { freshTestDatabase } from "./postgres-test-db";
import type { Account, AccountStore } from "@/lib/accounts/store";
import { createMemoryState, createMemoryStore, type MemoryState } from "@/lib/db/memory-store";
import type { AppStore } from "@/lib/db/store";
import type { Email, Mailer } from "@/lib/notifications/mailer";
import { sitesFor } from "@/lib/tenancy/access";
import { provision, type ProvisionRequest } from "@/lib/tenancy/provision";
import { decryptSiteKey, encryptSiteKey } from "@/lib/tenancy/site-key";
import { decryptSecret } from "@/lib/webhooks/secret";
import { signBody } from "@/lib/webhooks/signature";

const KEY = Buffer.alloc(32, 5);
const APP = "https://app.example.com";
const at = new Date("2026-10-31T08:00:00.000Z");
const ENGINE_KEY = "q1k_engine_key_for_the_new_site_0001";
const WH_SECRET = "whsec_secret_for_the_new_site_0001";

let accounts: AccountStore;
let storeFor: (siteId: string) => AppStore;
let sent: Email[];
let mailer: Mailer;
const run = (request: ProvisionRequest) => provision({ accounts, storeFor, mailer, appUrl: APP, key: KEY, now: () => at }, request);
const upsert = (extra: Partial<Extract<ProvisionRequest, { action: "site.upsert" }>> = {}): ProvisionRequest => ({
  action: "site.upsert",
  accountId: "acc_1",
  accountName: "Acme",
  siteId: "site_1",
  siteName: "Acme blog",
  engineKey: ENGINE_KEY,
  webhookSecret: WH_SECRET,
  ...extra,
});
const person = (email: string, clientId: string): Account => ({
  id: `usr_${email.split("@")[0]}`,
  email,
  name: email,
  role: "admin",
  clientId,
  passwordHash: "scrypt$x",
  createdAt: at,
  passwordChangedAt: at,
  lastSignInAt: null,
});

beforeEach(() => {
  sent = [];
  mailer = { send: async (email) => void sent.push(email) };
  vi.spyOn(console, "info").mockImplementation(() => {});
});

let pgc: PostgresConnection;
beforeAll(async () => {
  pgc = connectPostgres(await freshTestDatabase("provision"));
});
afterAll(async () => {
  await pgc?.close();
});

const BACKENDS: [string, () => Promise<void>][] = [
  [
    "in memory",
    async () => {
      accounts = createMemoryAccountStore();
      const state: MemoryState = createMemoryState();
      const stores = new Map<string, AppStore>();
      storeFor = (siteId) => stores.get(siteId) ?? stores.set(siteId, createMemoryStore(siteId, state)).get(siteId)!;
    },
  ],
  [
    "on Postgres",
    async () => {
      await pgc.ready();
      await pgc.pool.query("TRUNCATE clients, sites, users, invitations, user_sites, webhook_configs");
      accounts = createPostgresAccountStore(pgc);
      storeFor = (siteId) => createPostgresStore(pgc, siteId);
    },
  ],
];

describe.each(BACKENDS)("provision (P1c: clients and sites from the staff portal) %s", (_name, setUp) => {
  beforeEach(setUp);
  it("a new account makes the client, its site with the key encrypted, the webhook secret, and invites the first Admin", async () => {
    const result = await run(upsert({ admin: { email: " Owner@Acme.com " } }));
    expect(result).toMatchObject({ ok: true, data: { siteId: "site_1", hookUrl: `${APP}/api/hooks/marketing`, admin: "invited" } });
    const [client] = await accounts.clients();
    expect(client).toMatchObject({ name: "Acme", engineAccountId: "acc_1" });
    const site = await accounts.site("site_1");
    expect(site).toMatchObject({ clientId: client.id, name: "Acme blog" });
    expect(site!.keyCipher).not.toContain(ENGINE_KEY);
    expect(decryptSiteKey(site!.keyCipher, KEY)).toBe(ENGINE_KEY);
    const hook = await storeFor("site_1").webhook();
    expect(hook?.url).toBe(`${APP}/api/hooks/marketing`);
    expect(decryptSecret(hook!.secretCipher, KEY)).toBe(WH_SECRET);
    const [invitation] = await accounts.invitations(client.id);
    expect(invitation).toMatchObject({ email: "owner@acme.com", role: "admin", siteIds: null, clientId: client.id });
    expect(sent.map((email) => email.to)).toEqual(["owner@acme.com"]);
  });

  it("the same request again makes nothing twice: one client, one site, one invitation (sent again with a new link)", async () => {
    await run(upsert({ admin: { email: "owner@acme.com" } }));
    const again = await run(upsert({ admin: { email: "owner@acme.com" } }));
    expect(again).toMatchObject({ ok: true, data: { admin: "reinvited" } });
    expect(await accounts.clients()).toHaveLength(1);
    expect(await accounts.sites()).toHaveLength(1);
    const client = (await accounts.clients())[0];
    expect(await accounts.invitations(client.id)).toHaveLength(1);
    expect(sent).toHaveLength(2);
  });

  it("a second site of the same account joins the same client; a new key replaces the old one", async () => {
    await run(upsert());
    await run(upsert({ siteId: "site_2", siteName: "Acme shop" }));
    const [client] = await accounts.clients();
    expect((await accounts.sites(client.id)).map((site) => site.id)).toEqual(["site_1", "site_2"]);
    await run(upsert({ engineKey: "q1k_rotated_engine_key_000000000002" }));
    expect(decryptSiteKey((await accounts.site("site_1"))!.keyCipher, KEY)).toBe("q1k_rotated_engine_key_000000000002");
  });

  it("names follow the portal: a site rename needs no key, a client rename has its own action", async () => {
    await run(upsert());
    const keyBefore = (await accounts.site("site_1"))!.keyCipher;
    expect(await run(upsert({ siteName: "Acme news", engineKey: undefined, webhookSecret: undefined }))).toMatchObject({ ok: true });
    expect(await accounts.site("site_1")).toMatchObject({ name: "Acme news", keyCipher: keyBefore });
    expect(await run({ action: "client.rename", accountId: "acc_1", accountName: "Acme Group" })).toMatchObject({ ok: true });
    expect((await accounts.clients())[0].name).toBe("Acme Group");
    expect(await run({ action: "client.rename", accountId: "acc_unknown", accountName: "X" })).toMatchObject({ ok: false, status: 404 });
  });

  it("a new site without its key or webhook secret is refused and nothing is made", async () => {
    expect(await run(upsert({ engineKey: undefined }))).toMatchObject({ ok: false, status: 400 });
    expect(await run(upsert({ webhookSecret: undefined }))).toMatchObject({ ok: false, status: 400 });
    expect(await accounts.clients()).toHaveLength(0);
  });

  it("the client made from the settings file is linked by its site, not duplicated", async () => {
    await accounts.createClient({ id: "cli_boot", name: "Contract test", createdAt: at });
    await accounts.createSite({ id: "site_1", clientId: "cli_boot", name: "Contract test", keyCipher: encryptSiteKey(ENGINE_KEY, KEY), createdAt: at });
    const result = await run(upsert({ engineKey: undefined, webhookSecret: undefined }));
    expect(result).toMatchObject({ ok: true, data: { clientId: "cli_boot" } });
    expect(await accounts.clients()).toEqual([expect.objectContaining({ id: "cli_boot", name: "Acme", engineAccountId: "acc_1" })]);
    expect((await accounts.site("site_1"))!.name).toBe("Acme blog");
  });

  it("another client's site or person is refused, and stays as it was", async () => {
    await run(upsert());
    expect(await run(upsert({ accountId: "acc_2", accountName: "Other" }))).toMatchObject({ ok: false, status: 409 });
    expect((await accounts.site("site_1"))!.name).toBe("Acme blog");
    const acme = (await accounts.clients())[0];
    await accounts.createAccount(person("boss@other.com", "cli_other"));
    expect(await run(upsert({ admin: { email: "boss@other.com" } }))).toMatchObject({ ok: false, status: 409 });
    await accounts.createAccount(person("me@acme.com", acme.id));
    expect(await run(upsert({ admin: { email: "me@acme.com" } }))).toMatchObject({ ok: true, data: { admin: "member" } });
  });

  it("an invitation that can't be sent is not kept, and the answer says the email failed", async () => {
    mailer = { send: async () => Promise.reject(Object.assign(new (await import("@/lib/notifications/mail-error")).MailError("refused", "550 not allowed"), {})) };
    const result = await run(upsert({ admin: { email: "owner@acme.com" } }));
    expect(result).toMatchObject({ ok: false, status: 502, code: "mail_failed" });
    expect(await accounts.invitations((await accounts.clients())[0].id)).toHaveLength(0);
  });

  it("status follows the portal: suspended keeps sessions, closed signs everyone out; unknown account is a 404", async () => {
    await run(upsert({ admin: { email: "owner@acme.com" } }));
    const acme = (await accounts.clients())[0];
    await accounts.createAccount(person("me@acme.com", acme.id));
    const session = { tokenHash: "h".repeat(64), userId: "usr_me", createdAt: at, expiresAt: new Date(at.getTime() + 86_400_000) };
    await accounts.createSession(session);
    expect(await run({ action: "client.status", accountId: "acc_1", status: "suspended" })).toMatchObject({ ok: true, data: { status: "suspended" } });
    expect((await accounts.client(acme.id))!.status).toBe("suspended");
    expect(await accounts.sessionAccount(session.tokenHash, at)).not.toBeNull();
    expect(await run({ action: "client.status", accountId: "acc_1", status: "closed" })).toMatchObject({ ok: true });
    expect(await accounts.sessionAccount(session.tokenHash, at)).toBeNull();
    expect(await run({ action: "client.status", accountId: "acc_x", status: "closed" })).toMatchObject({ ok: false, status: 404 });
  });

  it("deleting a client: refused unless closed; then its people, invitations, sites and webhooks are gone, other clients untouched", async () => {
    await run(upsert({ admin: { email: "owner@acme.com" } }));
    await run(upsert({ accountId: "acc_2", accountName: "Other", siteId: "site_9", siteName: "Other site" }));
    const acme = (await accounts.clients()).find((client) => client.engineAccountId === "acc_1")!;
    await accounts.createAccount(person("me@acme.com", acme.id));
    expect(await run({ action: "client.remove", accountId: "acc_1" })).toMatchObject({ ok: false, status: 409, code: "not_closed" });
    await run({ action: "client.status", accountId: "acc_1", status: "closed" });
    expect(await run({ action: "client.remove", accountId: "acc_1" })).toMatchObject({ ok: true, data: { removed: true } });
    expect(await accounts.client(acme.id)).toBeNull();
    expect(await accounts.accountByEmail("me@acme.com")).toBeNull();
    expect(await accounts.invitationByEmail("owner@acme.com")).toBeNull();
    expect(await accounts.site("site_1")).toBeNull();
    expect(await storeFor("site_1").webhook()).toBeNull();
    expect(await accounts.site("site_9")).toMatchObject({ name: "Other site" });
    expect(await storeFor("site_9").webhook()).not.toBeNull();
    expect(await run({ action: "client.remove", accountId: "acc_1" })).toMatchObject({ ok: false, status: 404 });
  });

  it("removing a site: gone from the app; a Reviewer limited to it opens nothing (never every site)", async () => {
    await run(upsert());
    await run(upsert({ siteId: "site_2", siteName: "Acme shop" }));
    const acme = (await accounts.clients())[0];
    const reviewer = { ...person("rev@acme.com", acme.id), role: "reviewer" as const };
    await accounts.createAccount(reviewer);
    await accounts.setUserSites(reviewer.id, ["site_2"]);
    expect(await run({ action: "site.remove", accountId: "acc_1", siteId: "site_2" })).toMatchObject({ ok: true, data: { removed: true } });
    expect(await accounts.site("site_2")).toBeNull();
    expect(await storeFor("site_2").webhook()).toBeNull();
    expect(sitesFor("reviewer", await accounts.sites(acme.id), await accounts.userSites(reviewer.id))).toEqual([]);
    expect(await run({ action: "site.remove", accountId: "acc_1", siteId: "site_2" })).toMatchObject({ ok: false, status: 404 });
    expect(await run({ action: "site.remove", accountId: "acc_2", siteId: "site_1" })).toMatchObject({ ok: false, status: 409 });
  });
});

describe("POST /api/provision (signed server-to-server)", () => {
  const SECRET = "provision_secret_that_is_at_least_32_chars";
  let POST: (request: Request) => Promise<Response>;

  const call = (body: string, opts: { secret?: string; stamp?: number; signature?: string } = {}) => {
    const stamp = String(opts.stamp ?? Math.floor(Date.now() / 1000));
    return POST(
      new Request("http://localhost/api/provision", {
        method: "POST",
        body,
        headers: { "X-Timestamp": stamp, "X-Signature": opts.signature ?? signBody(`${stamp}.${body}`, opts.secret ?? SECRET) },
      }),
    );
  };

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv("DB_MODE", "memory");
    vi.stubEnv("AUTH_MODE", "password");
    vi.stubEnv("APP_URL", APP);
    vi.stubEnv("ENGINE_MODE", "mock");
    vi.stubEnv("ENGINE_API_KEY", "");
    vi.stubEnv("APP_ENCRYPTION_KEY", KEY.toString("base64"));
    vi.stubEnv("PROVISION_SECRET", SECRET);
    vi.stubEnv("PROVISION_MAX_SKEW_SECONDS", "300");
    for (const name of ["articles-ai.tenancy-ready", "articles-ai.memory-accounts", "articles-ai.memory-store"]) {
      delete (globalThis as Record<symbol, unknown>)[Symbol.for(name)];
    }
    ({ POST } = await import("@/app/api/provision/route"));
  });
  afterEach(() => vi.unstubAllEnvs());

  const body = JSON.stringify(upsert());

  it("a correctly signed request is carried out", async () => {
    const response = await call(body);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, data: { siteId: "site_1", hookUrl: `${APP}/api/hooks/marketing` } });
    const { getAccountStore } = await import("@/lib/db");
    expect(await getAccountStore().site("site_1")).toMatchObject({ name: "Acme blog" });
  });

  it("a wrong secret, a changed body, no signature, an old or future time, or no secret set: all refused alike, nothing made", async () => {
    const now = Math.floor(Date.now() / 1000);
    const refusals = [
      await call(body, { secret: "another_secret_that_is_at_least_32_chars" }),
      await call(body.replace("Acme blog", "Evil blog"), { signature: signBody(`${now}.${body}`, SECRET), stamp: now }),
      await call(body, { signature: "" }),
      await call(body, { stamp: now - 301 }),
      await call(body, { stamp: now + 301 }),
    ];
    vi.stubEnv("PROVISION_SECRET", "");
    refusals.push(await call(body));
    for (const response of refusals) {
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ ok: false, error: { code: "invalid_signature" } });
    }
    const { getAccountStore } = await import("@/lib/db");
    expect(await getAccountStore().clients()).toHaveLength(0);
  });

  it("a signed body that isn't a valid request is a 400, not a crash", async () => {
    expect((await call("not json")).status).toBe(400);
    expect((await call(JSON.stringify({ action: "site.upsert", accountId: "acc 1" }))).status).toBe(400);
  });
});
