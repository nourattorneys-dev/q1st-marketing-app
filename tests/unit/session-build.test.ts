import { afterEach, describe, expect, it, vi } from "vitest";

// While Next builds a page, the first request-only call (cookies()) stops it there; this stands in for that stop.
vi.mock("next/headers", () => ({
  cookies: async () => {
    throw new Error("DYNAMIC_REQUEST");
  },
}));

const { getSession } = await import("@/lib/auth/session");

afterEach(() => vi.unstubAllEnvs());

describe("building a page never reads the sign-in settings (M5c smoke run)", () => {
  it("reads the request before the settings, so a build without APP_URL still builds", async () => {
    vi.stubEnv("AUTH_MODE", "password");
    vi.stubEnv("APP_URL", "");
    await expect(getSession()).rejects.toThrow("DYNAMIC_REQUEST");
  });
});
