import { describe, expect, it } from "vitest";
import { MOCK_ENGINE_BASE_URL, parseServerEnv } from "@/lib/env";

describe("parseServerEnv", () => {
  it("defaults to the mock engine and test logins", () => {
    expect(parseServerEnv({})).toEqual({
      engineMode: "mock",
      engineBaseUrl: MOCK_ENGINE_BASE_URL,
      engineApiKey: "mock-key",
      authMode: "mock",
    });
  });

  it("treats empty strings as unset", () => {
    expect(parseServerEnv({ ENGINE_BASE_URL: "", ENGINE_API_KEY: "", AUTH_MODE: "" }).authMode).toBe("mock");
  });

  it("refuses test logins on Vercel", () => {
    expect(() => parseServerEnv({ AUTH_MODE: "mock", VERCEL: "1" })).toThrow(/refused on Vercel/);
    expect(() => parseServerEnv({ VERCEL: "1" })).toThrow(/refused on Vercel/);
  });

  it("allows Clerk on Vercel", () => {
    expect(parseServerEnv({ AUTH_MODE: "clerk", VERCEL: "1" }).authMode).toBe("clerk");
  });

  it("requires a base URL and key for the live engine", () => {
    expect(() => parseServerEnv({ ENGINE_MODE: "live" })).toThrow(/ENGINE_BASE_URL and ENGINE_API_KEY/);
    expect(
      parseServerEnv({ ENGINE_MODE: "live", ENGINE_BASE_URL: "https://api.example.com/api/v1", ENGINE_API_KEY: "k" }),
    ).toMatchObject({ engineMode: "live", engineBaseUrl: "https://api.example.com/api/v1", engineApiKey: "k" });
  });

  it("passes a provided key to the mock engine", () => {
    expect(parseServerEnv({ ENGINE_API_KEY: "e2e-key" }).engineApiKey).toBe("e2e-key");
  });
});
