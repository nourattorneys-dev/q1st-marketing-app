import { describe, expect, it } from "vitest";
import { MOCK_ENGINE_BASE_URL, parseServerEnv } from "@/lib/env";

const PASSWORD_MODE = { AUTH_MODE: "password", APP_URL: "https://dashboard.example.com/some/path" };

describe("parseServerEnv", () => {
  it("defaults to the mock engine and test logins, on a test server", () => {
    expect(parseServerEnv({})).toEqual({
      engineMode: "mock",
      engineBaseUrl: MOCK_ENGINE_BASE_URL,
      engineApiKey: "mock-key",
      authMode: "mock",
      twoFactor: "required",
      appUrl: null,
      adminEmail: null,
      testServer: true,
    });
  });

  it("signs people in itself with AUTH_MODE=password, keeping APP_URL's origin and a tidy ADMIN_EMAIL (spec M5c)", () => {
    expect(parseServerEnv({ ...PASSWORD_MODE, ADMIN_EMAIL: " Owner@Example.com " })).toMatchObject({
      authMode: "password",
      appUrl: "https://dashboard.example.com",
      adminEmail: "owner@example.com",
      twoFactor: "off",
    });
    expect(parseServerEnv({ AUTH_MODE: "password", APP_URL: "http://localhost:3101" }).appUrl).toBe("http://localhost:3101");
  });

  it("refuses the retired Clerk mode, naming password", () => {
    expect(() => parseServerEnv({ AUTH_MODE: "clerk" })).toThrow(/AUTH_MODE=password, APP_URL and ADMIN_EMAIL/);
  });

  it("needs an https APP_URL in password mode, except on this machine", () => {
    expect(() => parseServerEnv({ AUTH_MODE: "password" })).toThrow(/needs APP_URL/);
    expect(() => parseServerEnv({ AUTH_MODE: "password", APP_URL: "dashboard.example.com" })).toThrow(/needs APP_URL/);
    expect(() => parseServerEnv({ AUTH_MODE: "password", APP_URL: "http://dashboard.example.com" })).toThrow(/https/);
  });

  it("refuses an ADMIN_EMAIL that isn't one address", () => {
    for (const email of ["owner", "a@example.com, b@example.com", `${"a".repeat(250)}@example.com`]) {
      expect(() => parseServerEnv({ ...PASSWORD_MODE, ADMIN_EMAIL: email })).toThrow(/ADMIN_EMAIL/);
    }
  });

  it("keeps two-factor login off in password mode until M5d, refusing a request for it", () => {
    expect(parseServerEnv({ ...PASSWORD_MODE, TWO_FACTOR: "off" }).twoFactor).toBe("off");
    expect(() => parseServerEnv({ ...PASSWORD_MODE, TWO_FACTOR: "required" })).toThrow("Two-factor login arrives in M5d; set TWO_FACTOR=off.");
  });

  it("lets test logins switch two-factor login off, and treats empty strings as unset", () => {
    expect(parseServerEnv({ TWO_FACTOR: "off" }).twoFactor).toBe("off");
    expect(parseServerEnv({ TWO_FACTOR: "" }).twoFactor).toBe("required");
    expect(parseServerEnv({ ENGINE_BASE_URL: "", ENGINE_API_KEY: "", AUTH_MODE: "" }).authMode).toBe("mock");
    expect(() => parseServerEnv({ TWO_FACTOR: "optional" })).toThrow();
  });

  it("refuses test logins on Vercel and in a production build unless explicitly allowed", () => {
    expect(() => parseServerEnv({ VERCEL: "1" })).toThrow(/refused on Vercel/);
    expect(() => parseServerEnv({ NODE_ENV: "production" })).toThrow(/refused in production builds/);
    expect(parseServerEnv({ NODE_ENV: "production", ALLOW_TEST_LOGINS: "1" })).toMatchObject({ authMode: "mock", testServer: true });
    expect(parseServerEnv({ NODE_ENV: "production", ...PASSWORD_MODE })).toMatchObject({ authMode: "password", testServer: false });
  });

  it("requires a base URL and key for the live engine, and passes a provided key to the mock engine", () => {
    expect(() => parseServerEnv({ ENGINE_MODE: "live" })).toThrow(/ENGINE_MODE=live needs ENGINE_BASE_URL\./);
    expect(parseServerEnv({ ENGINE_MODE: "live", ENGINE_BASE_URL: "https://api.example.com/api/v1", ENGINE_API_KEY: "k" })).toMatchObject({
      engineMode: "live",
      engineBaseUrl: "https://api.example.com/api/v1",
      engineApiKey: "k",
    });
    expect(parseServerEnv({ ENGINE_API_KEY: "e2e-key" }).engineApiKey).toBe("e2e-key");
  });
});
