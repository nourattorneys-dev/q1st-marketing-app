import { afterEach, describe, expect, it, vi } from "vitest";

// While Next builds or prerenders a page, the first request-only call stops it there; these stand in for that stop.
const state = vi.hoisted(() => ({ cookie: null as string | null }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: (globalThis as { testHost?: string }).testHost ?? "localhost:3300" }),
  cookies: async () => {
    if (state.cookie === null) throw new Error("DYNAMIC_REQUEST");
    return { get: (name: string) => (name === "session" && state.cookie ? { name, value: state.cookie } : undefined) };
  },
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => {
    throw new Error("DYNAMIC_CONNECTION");
  },
}));

const { getSession } = await import("@/lib/auth/session");

afterEach(() => {
  state.cookie = null;
  vi.unstubAllEnvs();
});

describe("building or prerendering a page never reads the sign-in settings or the clock (M5c smoke run)", () => {
  it("reads the request before the settings, so a build without APP_URL still builds", async () => {
    vi.stubEnv("AUTH_MODE", "password");
    vi.stubEnv("APP_URL", "");
    await expect(getSession()).rejects.toThrow("DYNAMIC_REQUEST");
  });

  it("waits for the request before checking the session's expiry against the clock", async () => {
    vi.stubEnv("AUTH_MODE", "password");
    vi.stubEnv("APP_URL", "http://localhost:3000");
    vi.stubEnv("DB_MODE", "memory");
    state.cookie = "a-session-token";
    await expect(getSession()).rejects.toThrow("DYNAMIC_CONNECTION");
  });
});
