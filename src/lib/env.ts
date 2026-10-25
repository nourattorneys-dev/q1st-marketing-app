import "server-only";
import { z } from "zod";
import type { TwoFactorPolicy } from "@/lib/auth/two-factor";

export const MOCK_ENGINE_BASE_URL = "https://mock.engine.local/api/v1";
const MOCK_ENGINE_DEFAULT_KEY = "mock-key";

const EnvSchema = z.object({
  ENGINE_MODE: z.enum(["mock", "live"]).default("mock"),
  ENGINE_BASE_URL: z.url().optional(),
  ENGINE_API_KEY: z.string().min(1).optional(),
  AUTH_MODE: z.enum(["mock", "clerk"]).default("mock"),
  VERCEL: z.string().optional(),
  NODE_ENV: z.string().optional(),
  ALLOW_TEST_LOGINS: z.string().optional(),
  TWO_FACTOR: z.enum(["required", "off"]).default("required"),
});

export type ServerEnv = {
  engineMode: "mock" | "live";
  engineBaseUrl: string;
  engineApiKey: string;
  authMode: "mock" | "clerk";
  twoFactor: TwoFactorPolicy;
};

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const cleaned = Object.fromEntries(
    Object.entries(source).map(([key, value]) => [key, value === "" ? undefined : value]),
  );
  const env = EnvSchema.parse(cleaned);

  if (env.AUTH_MODE === "mock") {
    if (env.VERCEL === "1") {
      throw new Error("AUTH_MODE=mock is for local development only and is refused on Vercel. Set AUTH_MODE=clerk.");
    }
    if (env.NODE_ENV === "production" && env.ALLOW_TEST_LOGINS !== "1") {
      throw new Error(
        "AUTH_MODE=mock is refused in production builds. Set AUTH_MODE=clerk, or ALLOW_TEST_LOGINS=1 for a local test build.",
      );
    }
  }

  if (env.ENGINE_MODE === "live") {
    if (!env.ENGINE_BASE_URL || !env.ENGINE_API_KEY) {
      throw new Error("ENGINE_MODE=live needs ENGINE_BASE_URL and ENGINE_API_KEY.");
    }
    return {
      engineMode: "live",
      engineBaseUrl: env.ENGINE_BASE_URL,
      engineApiKey: env.ENGINE_API_KEY,
      authMode: env.AUTH_MODE,
      twoFactor: env.TWO_FACTOR,
    };
  }

  return {
    engineMode: "mock",
    engineBaseUrl: MOCK_ENGINE_BASE_URL,
    engineApiKey: env.ENGINE_API_KEY ?? MOCK_ENGINE_DEFAULT_KEY,
    authMode: env.AUTH_MODE,
    twoFactor: env.TWO_FACTOR,
  };
}

/** Parsed on every call (cheap), so tests and runtime always see the current environment. */
export function serverEnv(): ServerEnv {
  return parseServerEnv(process.env);
}
