import "server-only";
import { z } from "zod";

export const MOCK_ENGINE_BASE_URL = "https://mock.engine.local/api/v1";
const MOCK_ENGINE_DEFAULT_KEY = "mock-key";

const EnvSchema = z.object({
  ENGINE_MODE: z.enum(["mock", "live"]).default("mock"),
  ENGINE_BASE_URL: z.url().optional(),
  ENGINE_API_KEY: z.string().min(1).optional(),
  AUTH_MODE: z.enum(["mock", "clerk"]).default("mock"),
  VERCEL: z.string().optional(),
});

export type ServerEnv = {
  engineMode: "mock" | "live";
  engineBaseUrl: string;
  engineApiKey: string;
  authMode: "mock" | "clerk";
};

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const cleaned = Object.fromEntries(
    Object.entries(source).map(([key, value]) => [key, value === "" ? undefined : value]),
  );
  const env = EnvSchema.parse(cleaned);

  if (env.AUTH_MODE === "mock" && env.VERCEL === "1") {
    throw new Error("AUTH_MODE=mock is for local development only and is refused on Vercel. Set AUTH_MODE=clerk.");
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
    };
  }

  return {
    engineMode: "mock",
    engineBaseUrl: MOCK_ENGINE_BASE_URL,
    engineApiKey: env.ENGINE_API_KEY ?? MOCK_ENGINE_DEFAULT_KEY,
    authMode: env.AUTH_MODE,
  };
}

/** Parsed on every call (cheap), so tests and runtime always see the current environment. */
export function serverEnv(): ServerEnv {
  return parseServerEnv(process.env);
}
