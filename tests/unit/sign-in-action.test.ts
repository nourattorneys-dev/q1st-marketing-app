import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword } from "@/lib/accounts/passwords";
import { getAccountStore } from "@/lib/db";

const state = vi.hoisted(() => ({ set: [] as Array<[string, string, Record<string, unknown>]>, forwardedFor: null as string | null }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: (name: string, value: string, options: Record<string, unknown>) => void state.set.push([name, value, options]) }),
  headers: async () => ({ get: (name: string) => (name === "x-forwarded-for" ? state.forwardedFor : null) }),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));

const { signInAction } = await import("@/app/[locale]/sign-in/actions");

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
};

beforeAll(async () => {
  vi.stubEnv("DB_MODE", "memory");
  const now = new Date();
  await getAccountStore().createAccount({
    id: "usr_action",
    email: "action@example.com",
    name: "Action",
    clientId: "cli_test",
    role: "admin",
    passwordHash: await hashPassword("correct horse battery"),
    createdAt: now,
    passwordChangedAt: now,
    lastSignInAt: null,
  });
});

beforeEach(() => {
  state.set = [];
  state.forwardedFor = "198.51.100.1, 203.0.113.9";
  vi.stubEnv("AUTH_MODE", "password");
  vi.stubEnv("APP_URL", "https://dashboard.example.com");
  vi.stubEnv("DB_MODE", "memory");
  vi.stubEnv("ENGINE_MODE", "mock");
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("the sign-in action (spec M5c)", () => {
  it("sets the __Host-session cookie, logs the trusted address, and opens the dashboard in the form's language", async () => {
    await expect(signInAction(null, form({ locale: "ar", email: "Action@example.com", password: "correct horse battery" }))).rejects.toThrow("REDIRECT:/ar");
    expect(state.set).toHaveLength(1);
    const [name, value, options] = state.set[0];
    expect(name).toBe("__Host-session");
    expect(value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(options).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/" });
    expect(console.info).toHaveBeenCalledWith("Signed in: action@example.com from 203.0.113.9");
  });

  it("answers a wrong password on the form, keeping the email, and sets no cookie", async () => {
    expect(await signInAction(null, form({ locale: "en", email: "action@example.com", password: "not the password" }))).toEqual({ error: "wrong", email: "action@example.com" });
    expect(state.set).toEqual([]);
  });

  it("asks for both fields", async () => {
    expect(await signInAction(null, form({ locale: "en", email: " ", password: "" }))).toEqual({ error: "invalid", email: " " });
  });

  it("refuses to run with test logins", async () => {
    vi.stubEnv("AUTH_MODE", "mock");
    await expect(signInAction(null, form({ locale: "en", email: "action@example.com", password: "x" }))).rejects.toThrow("This page needs AUTH_MODE=password.");
  });
});
