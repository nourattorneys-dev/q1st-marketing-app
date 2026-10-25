import "server-only";
import { z } from "zod";

const ServicesSchema = z.object({
  DB_MODE: z.enum(["memory", "mysql"]).default("memory"),
  DATABASE_URL: z.string().optional(),
  WEBHOOK_ENCRYPTION_KEY: z.string().optional(),
  EMAIL_MODE: z.enum(["log", "resend"]).default("log"),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  NOTIFY_QUIET_SECONDS: z.coerce.number().int().min(0).max(3600).default(120),
  NODE_ENV: z.string().optional(),
  ALLOW_TEST_LOGINS: z.string().optional(),
});

/** The database, webhook secret, email and cron settings (M4c, M5a). Server-only: none of these may reach the browser. */
export type ServicesEnv = {
  dbMode: "memory" | "mysql";
  databaseUrl: string | null;
  /** 32 bytes for AES-256-GCM, or null when unset (the in-memory store then uses a key that lives as long as the process). */
  encryptionKey: Buffer | null;
  emailMode: "log" | "resend";
  resend: { apiKey: string; from: string } | null;
  cronSecret: string | null;
  notifyQuietMs: number;
};

export function parseServicesEnv(source: Record<string, string | undefined>): ServicesEnv {
  const cleaned = Object.fromEntries(Object.entries(source).map(([key, value]) => [key, value === "" ? undefined : value]));
  if (cleaned.DB_MODE === "neon") {
    throw new Error("DB_MODE=neon is no longer supported: the dashboard keeps its data in the client's MySQL. Set DB_MODE=mysql and DATABASE_URL.");
  }
  const env = ServicesSchema.parse(cleaned);

  if (env.DB_MODE === "memory" && env.NODE_ENV === "production" && env.ALLOW_TEST_LOGINS !== "1") {
    throw new Error(
      "DB_MODE=memory keeps data in one server process's memory and loses it on every restart, so it's refused in production. Set DB_MODE=mysql and DATABASE_URL.",
    );
  }
  if (env.DB_MODE === "mysql") {
    if (!env.DATABASE_URL) throw new Error("DB_MODE=mysql needs DATABASE_URL=mysql://user:password@host:3306/database.");
    if (!env.DATABASE_URL.startsWith("mysql://")) throw new Error("DATABASE_URL must start with mysql:// (DB_MODE=mysql).");
    // The message never repeats the address: it holds the database password (M5a final review).
    if (!URL.canParse(env.DATABASE_URL)) {
      throw new Error("DATABASE_URL isn't a valid address. URL-encode special characters in the password (for example # as %23, / as %2F, ? as %3F).");
    }
  }

  let encryptionKey: Buffer | null = null;
  if (env.WEBHOOK_ENCRYPTION_KEY) {
    encryptionKey = Buffer.from(env.WEBHOOK_ENCRYPTION_KEY, "base64");
    if (encryptionKey.length !== 32) throw new Error("WEBHOOK_ENCRYPTION_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32).");
  }

  if (env.EMAIL_MODE === "resend" && (!env.RESEND_API_KEY || !env.EMAIL_FROM)) {
    throw new Error("EMAIL_MODE=resend needs RESEND_API_KEY and EMAIL_FROM.");
  }

  return {
    dbMode: env.DB_MODE,
    databaseUrl: env.DATABASE_URL ?? null,
    encryptionKey,
    emailMode: env.EMAIL_MODE,
    resend: env.EMAIL_MODE === "resend" && env.RESEND_API_KEY && env.EMAIL_FROM ? { apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM } : null,
    cronSecret: env.CRON_SECRET ?? null,
    notifyQuietMs: env.NOTIFY_QUIET_SECONDS * 1000,
  };
}

/** Parsed on every call, like serverEnv(), so tests and runtime always see the current environment. */
export function servicesEnv(): ServicesEnv {
  return parseServicesEnv(process.env);
}
