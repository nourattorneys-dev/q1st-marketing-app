import "server-only";
import { z } from "zod";
import type { TwoFactorPolicy } from "@/lib/auth/two-factor";

export const MOCK_ENGINE_BASE_URL = "https://mock.engine.local/api/v1";
const MOCK_ENGINE_DEFAULT_KEY = "mock-key";

const EnvSchema = z.object({
  ENGINE_MODE: z.enum(["mock", "live"]).default("mock"),
  ENGINE_BASE_URL: z.url().optional(),
  ENGINE_API_KEY: z.string().min(1).optional(),
  AUTH_MODE: z.enum(["mock", "password"]).default("mock"),
  APP_URL: z.string().optional(),
  ADMIN_EMAIL: z.string().optional(),
  VERCEL: z.string().optional(),
  NODE_ENV: z.string().optional(),
  ALLOW_TEST_LOGINS: z.string().optional(),
  TWO_FACTOR: z.enum(["required", "off"]).optional(),
});

export type ServerEnv = {
  engineMode: "mock" | "live";
  engineBaseUrl: string;
  engineApiKey: string;
  authMode: "mock" | "password";
  twoFactor: TwoFactorPolicy;
  /** The dashboard's own address (AUTH_MODE=password): every emailed link is built from it, never from a request. */
  appUrl: string | null;
  /** Spec M5c: while there's no Admin, this address gets the first Admin invitation. */
  adminEmail: string | null;
  /** A development build, or a production build with ALLOW_TEST_LOGINS=1: test logins, the in-memory store and the dev outbox may run. */
  testServer: boolean;
};

const THIS_MACHINE = new Set(["localhost", "127.0.0.1"]);
const OneEmail = z.email().max(254);

/** APP_URL as its origin: https, except on this machine (spec M5c). */
function appOrigin(value: string | undefined): string {
  if (!value || !URL.canParse(value)) {
    throw new Error("AUTH_MODE=password needs APP_URL, the dashboard's address, for example https://dashboard.example.com.");
  }
  const url = new URL(value);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && THIS_MACHINE.has(url.hostname))) {
    throw new Error("APP_URL must start with https:// (only http://localhost may use http).");
  }
  return url.origin;
}

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const cleaned = Object.fromEntries(Object.entries(source).map(([key, value]) => [key, value === "" ? undefined : value]));
  if (cleaned.AUTH_MODE === "clerk") {
    throw new Error("AUTH_MODE=clerk is no longer supported: the dashboard signs people in itself. Set AUTH_MODE=password, APP_URL and ADMIN_EMAIL.");
  }
  const env = EnvSchema.parse(cleaned);
  const testServer = env.NODE_ENV !== "production" || env.ALLOW_TEST_LOGINS === "1";

  if (env.AUTH_MODE === "mock") {
    if (env.VERCEL === "1") throw new Error("AUTH_MODE=mock is for local development only and is refused on Vercel. Set AUTH_MODE=password.");
    if (!testServer) {
      throw new Error("AUTH_MODE=mock is refused in production builds. Set AUTH_MODE=password, or ALLOW_TEST_LOGINS=1 for a local test build.");
    }
  }

  let appUrl: string | null = null;
  let adminEmail: string | null = null;
  let twoFactor: TwoFactorPolicy = env.TWO_FACTOR ?? "required";
  if (env.AUTH_MODE === "password") {
    appUrl = appOrigin(env.APP_URL);
    if (env.TWO_FACTOR === "required") throw new Error("Two-factor login arrives in M5d; set TWO_FACTOR=off.");
    twoFactor = "off";
    if (env.ADMIN_EMAIL) {
      const tidy = env.ADMIN_EMAIL.trim().toLowerCase();
      if (!OneEmail.safeParse(tidy).success) throw new Error("ADMIN_EMAIL must be one email address of at most 254 characters.");
      adminEmail = tidy;
    }
  }

  const auth = { authMode: env.AUTH_MODE, twoFactor, appUrl, adminEmail, testServer };
  if (env.ENGINE_MODE === "live") {
    // P1b: each site's engine key is kept (encrypted) with the site; ENGINE_API_KEY only makes the first client.
    if (!env.ENGINE_BASE_URL) {
      throw new Error("ENGINE_MODE=live needs ENGINE_BASE_URL.");
    }
    return { engineMode: "live", engineBaseUrl: env.ENGINE_BASE_URL, engineApiKey: env.ENGINE_API_KEY ?? "", ...auth };
  }
  return { engineMode: "mock", engineBaseUrl: MOCK_ENGINE_BASE_URL, engineApiKey: env.ENGINE_API_KEY ?? MOCK_ENGINE_DEFAULT_KEY, ...auth };
}

/** Parsed on every call (cheap), so tests and runtime always see the current environment. */
export function serverEnv(): ServerEnv {
  return parseServerEnv(process.env);
}

/** For pages and actions that only exist in password mode: the settings, with APP_URL. */
export function passwordEnv(): ServerEnv & { appUrl: string } {
  const env = serverEnv();
  if (env.authMode !== "password" || !env.appUrl) throw new Error("This page needs AUTH_MODE=password.");
  return { ...env, appUrl: env.appUrl };
}
