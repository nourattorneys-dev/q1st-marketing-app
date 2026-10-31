import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { cookieJar } = vi.hoisted(() => ({ cookieJar: new Map<string, string>() }));

vi.mock("next/headers", () => ({
  headers: async () => {
    const test = globalThis as { testHost?: string; testPath?: string };
    return new Headers({ host: test.testHost ?? "localhost:3300", "x-request-path": test.testPath ?? "/" });
  },
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined),
  }),
}));
// getSession waits for the request (connection()) before reading the clock; here every call is a request.
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), connection: async () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));

import { getRole, getSession, getTwoFactorPolicy, requirePermission, requireSession } from "@/lib/auth/session";
import { endSession, startSession } from "@/lib/accounts/sign-in";
import { newId } from "@/lib/accounts/tokens";
import { getAccountStore } from "@/lib/db";
import { enableMockTwoFactor } from "@/lib/auth/mock-actions";

describe("session guards (test logins)", () => {
  beforeEach(() => {
    cookieJar.clear();
    vi.stubEnv("AUTH_MODE", "mock");
    vi.stubEnv("ENGINE_MODE", "mock");
    vi.stubEnv("VERCEL", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("sends signed-out visitors to sign-in", async () => {
    await expect(requireSession("en")).rejects.toThrow("REDIRECT:/en/sign-in");
  });

  it("sends people without a role to the no-access page", async () => {
    cookieJar.set("dev_session", "dev_norole");
    await expect(requireSession("ar")).rejects.toThrow("REDIRECT:/ar/no-access?why=role");
  });

  it("returns the signed-in reviewer", async () => {
    cookieJar.set("dev_session", "dev_reviewer");
    await expect(requireSession("en")).resolves.toMatchObject({ userId: "dev_reviewer", role: "reviewer" });
  });

  it("sends a reviewer away from admin-only screens", async () => {
    cookieJar.set("dev_session", "dev_reviewer");
    await expect(requirePermission("en", "settings.manage")).rejects.toThrow("REDIRECT:/en");
  });

  it("lets an admin into admin-only screens", async () => {
    cookieJar.set("dev_session", "dev_admin");
    await expect(requirePermission("en", "settings.manage")).resolves.toMatchObject({ role: "admin" });
  });

  it("refuses test logins on Vercel", async () => {
    vi.stubEnv("VERCEL", "1");
    await expect(getSession()).rejects.toThrow(/refused on Vercel/);
  });

  it("sends an admin without two-factor login to set it up first (design §5; Review Focus 2)", async () => {
    cookieJar.set("dev_session", "dev_admin_no2fa");
    await expect(requireSession("en")).rejects.toThrow("REDIRECT:/en/security");
    await expect(requirePermission("ar", "settings.manage")).rejects.toThrow("REDIRECT:/ar/security");
  });

  it("only reminds a reviewer: one without two-factor login may continue", async () => {
    cookieJar.set("dev_session", "dev_reviewer");
    await expect(requireSession("en")).resolves.toMatchObject({ role: "reviewer", twoFactor: false });
  });

  it("lets the admin in once two-factor login is on, in that test store only (design §5)", async () => {
    cookieJar.set("mock_store", `twofactor${Date.now().toString(36)}`);
    cookieJar.set("dev_session", "dev_admin_no2fa");
    const form = new FormData();
    form.set("locale", "ar");
    await expect(enableMockTwoFactor(form)).rejects.toThrow("REDIRECT:/ar");
    await expect(requireSession("ar")).resolves.toMatchObject({ userId: "dev_admin_no2fa", role: "admin", twoFactor: true });
    cookieJar.set("mock_store", `other${Date.now().toString(36)}`);
    await expect(requireSession("ar")).rejects.toThrow("REDIRECT:/ar/security");
  });

  it("lets an admin without two-factor login straight in when it's switched off (TWO_FACTOR=off)", async () => {
    vi.stubEnv("TWO_FACTOR", "off");
    cookieJar.set("dev_session", "dev_admin_no2fa");
    await expect(requireSession("en")).resolves.toMatchObject({ userId: "dev_admin_no2fa", role: "admin", twoFactor: false });
    await expect(requirePermission("ar", "settings.manage")).resolves.toMatchObject({ role: "admin" });
  });

  it("lets test logins try the switched-off mode through the twofactor_off scenario", async () => {
    cookieJar.set("dev_session", "dev_admin_no2fa");
    cookieJar.set("mock_scenario", "twofactor_off");
    await expect(requireSession("en")).resolves.toMatchObject({ role: "admin", twoFactor: false });
    await expect(getTwoFactorPolicy()).resolves.toBe("off");
    cookieJar.delete("mock_scenario");
    await expect(getTwoFactorPolicy()).resolves.toBe("required");
  });
});

describe("password sessions (AUTH_MODE=password, spec M5c)", () => {
  beforeEach(() => {
    cookieJar.clear();
    vi.stubEnv("AUTH_MODE", "password");
    vi.stubEnv("APP_URL", "http://localhost:3000");
    vi.stubEnv("DB_MODE", "memory");
    vi.stubEnv("ENGINE_MODE", "mock");
  });
  afterEach(() => vi.unstubAllEnvs());

  async function signedIn(role: "admin" | "reviewer" | null): Promise<string> {
    const store = getAccountStore();
    const id = newId("usr");
    const now = new Date();
    // P1b: the person's client and its one site.
    if (!(await store.client("cli_test"))) {
      await store.createClient({ id: "cli_test", name: "Test", createdAt: now });
      await store.createSite({ id: "site_test", clientId: "cli_test", name: "Test site", keyCipher: "v1:x", createdAt: now });
    }
    await store.createAccount({ id, email: `${id}@example.com`.toLowerCase(), name: "Omar", role, clientId: "cli_test", passwordHash: "scrypt$x", createdAt: now, passwordChangedAt: now, lastSignInAt: null });
    cookieJar.set("session", (await startSession(store, id, now)).token);
    return id;
  }

  it("reads the person from the session cookie, with the role from their account on each request (Review Focus 1)", async () => {
    const id = await signedIn("reviewer");
    await expect(requireSession("en")).resolves.toMatchObject({ userId: id, role: "reviewer", twoFactor: false });
    await getAccountStore().setRole(id, "cli_test", null);
    await expect(requireSession("en")).rejects.toThrow("REDIRECT:/en/no-access?why=role");
    await expect(getRole()).resolves.toBeNull();
  });

  it("treats a missing, unknown or ended session as signed out", async () => {
    await expect(requireSession("ar")).rejects.toThrow("REDIRECT:/ar/sign-in");
    cookieJar.set("session", "not-a-token");
    await expect(getSession()).resolves.toBeNull();
    await signedIn("admin");
    await endSession(getAccountStore(), cookieJar.get("session") ?? "");
    await expect(getSession()).resolves.toBeNull();
  });

  it("never asks for two-factor login, whatever the test-login scenario cookie says", async () => {
    await signedIn("admin");
    cookieJar.set("mock_scenario", "twofactor_off");
    await expect(getTwoFactorPolicy()).resolves.toBe("off");
    await expect(requireSession("en")).resolves.toMatchObject({ role: "admin" });
  });
});

describe("one sign-in, each client at its own address (CLIENT_DOMAIN)", () => {
  const test = globalThis as { testHost?: string; testPath?: string };
  beforeEach(() => {
    cookieJar.clear();
    vi.stubEnv("AUTH_MODE", "password");
    vi.stubEnv("APP_URL", "https://app.q1st.io");
    vi.stubEnv("CLIENT_DOMAIN", "q1st.io");
    vi.stubEnv("DB_MODE", "memory");
    vi.stubEnv("ENGINE_MODE", "mock");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    test.testHost = undefined;
    test.testPath = undefined;
  });

  async function twoClientPerson(): Promise<string> {
    const store = getAccountStore();
    const now = new Date();
    for (const [id, slug] of [["cli_acme", "acme"], ["cli_beta", "beta"], ["cli_gamma", "gamma"]]) {
      if (await store.client(id)) continue;
      await store.createClient({ id, name: slug, slug, createdAt: now });
      await store.createSite({ id: `site_${slug}`, clientId: id, name: slug, keyCipher: "v1:x", createdAt: now });
    }
    const id = newId("usr");
    await store.createAccount({ id, email: `${id}@example.com`.toLowerCase(), name: "Omar", role: "admin", clientId: "cli_acme", passwordHash: "scrypt$x", createdAt: now, passwordChangedAt: now, lastSignInAt: null });
    await store.addMember(id, "cli_beta", "reviewer", null, now);
    cookieJar.set("__Secure-session", (await startSession(store, id, now)).token);
    return id;
  }

  it("each address opens that client, with the person's role there", async () => {
    const id = await twoClientPerson();
    test.testHost = "acme.q1st.io";
    await expect(getSession()).resolves.toMatchObject({ userId: id, clientId: "cli_acme", role: "admin" });
  });

  it("the same browser on the other client's address: the other role, no new sign-in", async () => {
    const id = await twoClientPerson();
    test.testHost = "beta.q1st.io";
    await expect(getSession()).resolves.toMatchObject({ userId: id, clientId: "cli_beta", role: "reviewer" });
  });

  it("a client they don't work for, or an unknown name: no client, so no access", async () => {
    await twoClientPerson();
    test.testHost = "gamma.q1st.io";
    await expect(getSession()).resolves.toMatchObject({ clientId: null, role: null });
    await expect(requireSession("en")).rejects.toThrow("REDIRECT:/en/no-access?why=client");
    test.testHost = "nobody.q1st.io";
    await expect(requireSession("en")).rejects.toThrow("REDIRECT:/en/no-access?why=client");
  });

  it("at APP_URL, a page moves to the client's own address unchanged", async () => {
    await twoClientPerson();
    test.testHost = "app.q1st.io";
    test.testPath = "/en/review?tab=x";
    await expect(requireSession("en")).rejects.toThrow("REDIRECT:https://acme.q1st.io/en/review?tab=x");
  });
});
