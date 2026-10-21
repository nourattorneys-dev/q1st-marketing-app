import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ memo: new Map<unknown, unknown>(), currentUser: vi.fn(), auth: vi.fn() }));

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
vi.mock("@clerk/nextjs/server", () => ({ currentUser: state.currentUser, auth: state.auth }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));

const { getRole, getSession, requirePermission, requireSession } = await import("@/lib/auth/session");

const ADMIN = { id: "user_1", fullName: "Sara Ali", primaryEmailAddress: { emailAddress: "sara@example.com" }, publicMetadata: { role: "admin" }, twoFactorEnabled: true };

beforeEach(() => {
  state.memo.clear();
  state.currentUser.mockReset();
  state.auth.mockReset();
  vi.stubEnv("AUTH_MODE", "clerk");
  vi.stubEnv("ENGINE_MODE", "mock");
  vi.stubEnv("VERCEL", "");
});

describe("Clerk sessions (M1 and M3a follow-ups)", () => {
  it("every guard on a page shares one Clerk user lookup", async () => {
    state.currentUser.mockResolvedValue(ADMIN);
    await requireSession("en");
    await requirePermission("en", "settings.manage");
    await getSession();
    expect(state.currentUser).toHaveBeenCalledTimes(1);
  });

  it("a job poll reads the role from the session token, without a Clerk user lookup", async () => {
    state.auth.mockResolvedValue({ userId: "user_2", sessionClaims: { metadata: { role: "reviewer" } } });
    expect(await getRole()).toBe("reviewer");
    expect(state.currentUser).not.toHaveBeenCalled();
  });

  it("falls back to the Clerk user when the token carries no metadata", async () => {
    state.auth.mockResolvedValue({ userId: "user_1", sessionClaims: {} });
    state.currentUser.mockResolvedValue(ADMIN);
    expect(await getRole()).toBe("admin");
  });

  it("has no role for someone signed out", async () => {
    state.auth.mockResolvedValue({ userId: null, sessionClaims: null });
    expect(await getRole()).toBeNull();
  });
});
