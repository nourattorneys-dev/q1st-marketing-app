import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryAccountStore } from "@/lib/accounts/memory-store";
import { startSession } from "@/lib/accounts/sign-in";

const state = vi.hoisted(() => ({ memo: new Map<unknown, unknown>(), cookie: "" }));

// React's cache memoises per request on the server; here, per test.
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache:
    (fn: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) => {
      if (!state.memo.has(fn)) state.memo.set(fn, fn(...args));
      return state.memo.get(fn);
    },
}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "session" && state.cookie ? { name, value: state.cookie } : undefined) }),
}));
// getSession waits for the request (connection()) before reading the clock; here every call is a request.
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), connection: async () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));
const accounts = createMemoryAccountStore();
const lookup = vi.spyOn(accounts, "sessionAccount");
vi.mock("@/lib/db", () => ({ getAccountStore: () => accounts }));

const { getRole, getSession, requirePermission, requireSession } = await import("@/lib/auth/session");

beforeEach(() => {
  state.memo.clear();
  state.cookie = "";
  lookup.mockClear();
  vi.stubEnv("AUTH_MODE", "password");
  vi.stubEnv("APP_URL", "http://localhost:3000");
  vi.stubEnv("ENGINE_MODE", "mock");
});

describe("password sessions are read once per request (spec M5c)", () => {
  it("every guard on a page, and a job poll's role, share one session lookup", async () => {
    const now = new Date();
    await accounts.createAccount({ id: "usr_admin", email: "admin@example.com", name: "Admin", role: "admin", passwordHash: "x", createdAt: now, passwordChangedAt: now, lastSignInAt: null });
    state.cookie = (await startSession(accounts, "usr_admin", now)).token;
    await requireSession("en");
    await requirePermission("en", "settings.manage");
    await getSession();
    expect(await getRole()).toBe("admin");
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it("a signed-out request makes no lookup", async () => {
    expect(await getRole()).toBeNull();
    expect(lookup).not.toHaveBeenCalled();
  });
});
