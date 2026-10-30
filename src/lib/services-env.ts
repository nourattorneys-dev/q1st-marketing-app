import "server-only";
import { z } from "zod";
import type { SmtpSettings } from "@/lib/notifications/mailer";

const ServicesSchema = z.object({
  DB_MODE: z.enum(["memory", "postgres"]).default("memory"),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(5),
  DATABASE_URL: z.string().optional(),
  WEBHOOK_ENCRYPTION_KEY: z.string().optional(),
  EMAIL_MODE: z.enum(["log", "smtp"]).default("log"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  NOTIFY_QUIET_SECONDS: z.coerce.number().int().min(0).max(3600).default(120),
  NODE_ENV: z.string().optional(),
  ALLOW_TEST_LOGINS: z.string().optional(),
});

/** The database, webhook secret, email and cron settings (M4c, M5a, M5b). Server-only: none of these may reach the browser. */
export type ServicesEnv = {
  dbMode: "memory" | "postgres";
  databaseUrl: string | null;
  /** Most connections one server process opens (DB_POOL_MAX). */
  dbPoolMax: number;
  /** 32 bytes for AES-256-GCM, or null when unset (the in-memory store then uses a key that lives as long as the process). */
  encryptionKey: Buffer | null;
  emailMode: "log" | "smtp";
  /** The client's mail server (EMAIL_MODE=smtp), or null while emails are only logged. */
  smtp: SmtpSettings | null;
  cronSecret: string | null;
  notifyQuietMs: number;
};

const ADDRESS = /^[^\s<>@,;"]+@[^\s<>@,;"]+$/;

/** The name and address in "Name <address>", or a bare address; null unless EMAIL_FROM holds exactly one. */
function sender(from: string): { name: string | null; address: string } | null {
  const named = /^(.*)<([^<>]+)>$/.exec(from.trim());
  if (named && /[<>]/.test(named[1])) return null;
  const address = (named ? named[2] : from).trim();
  if (!ADDRESS.test(address)) return null;
  return { name: named ? displayName(named[1]) : null, address };
}

/** A display name as written, without the quotes around a quoted one ("Fakher & Co, Legal"). */
function displayName(written: string): string | null {
  const name = written.trim();
  const quoted = /^"(.*)"$/.exec(name);
  return (quoted ? quoted[1].replace(/\\(.)/g, "$1") : name) || null;
}

/** EMAIL_MODE=smtp (M5b). No message repeats SMTP_PASSWORD. */
function smtpSettings(env: z.infer<typeof ServicesSchema>): SmtpSettings {
  const { SMTP_HOST: host, SMTP_USER: user, SMTP_PASSWORD: password, EMAIL_FROM: from } = env;
  if (!host || !user || !password || !from) {
    const missing = Object.entries({ SMTP_HOST: host, SMTP_USER: user, SMTP_PASSWORD: password, EMAIL_FROM: from })
      .filter(([, value]) => !value)
      .map(([key]) => key);
    throw new Error(`EMAIL_MODE=smtp needs ${missing.join(", ")}.`);
  }
  const port = env.SMTP_PORT === undefined ? 587 : Number(env.SMTP_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("SMTP_PORT must be a whole number from 1 to 65535.");
  const parsed = sender(from);
  if (!parsed) {
    throw new Error("EMAIL_FROM must be one address, like Articles AI <notifications@dashboard.example.com> or notifications@dashboard.example.com.");
  }
  return { host, port, user, password, fromName: parsed.name, fromAddress: parsed.address };
}

export function parseServicesEnv(source: Record<string, string | undefined>): ServicesEnv {
  const cleaned = Object.fromEntries(Object.entries(source).map(([key, value]) => [key, value === "" ? undefined : value]));
  if (cleaned.DB_MODE === "neon" || cleaned.DB_MODE === "mysql") {
    throw new Error(`DB_MODE=${cleaned.DB_MODE} is no longer supported: the dashboard keeps its data in its own Postgres. Set DB_MODE=postgres and DATABASE_URL.`);
  }
  if (cleaned.EMAIL_MODE === "resend") {
    throw new Error(
      "EMAIL_MODE=resend is no longer supported: the dashboard sends email through the client's own mail server. Set EMAIL_MODE=smtp and the SMTP_ settings.",
    );
  }
  const env = ServicesSchema.parse(cleaned);

  if (env.DB_MODE === "memory" && env.NODE_ENV === "production" && env.ALLOW_TEST_LOGINS !== "1") {
    throw new Error(
      "DB_MODE=memory keeps data in one server process's memory and loses it on every restart, so it's refused in production. Set DB_MODE=postgres and DATABASE_URL.",
    );
  }
  if (env.DB_MODE === "postgres") {
    if (!env.DATABASE_URL) throw new Error("DB_MODE=postgres needs DATABASE_URL=postgres://user:password@host:5432/database.");
    if (!/^postgres(ql)?:\/\//.test(env.DATABASE_URL)) throw new Error("DATABASE_URL must start with postgres:// (DB_MODE=postgres).");
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

  return {
    dbMode: env.DB_MODE,
    databaseUrl: env.DATABASE_URL ?? null,
    dbPoolMax: env.DB_POOL_MAX,
    encryptionKey,
    emailMode: env.EMAIL_MODE,
    smtp: env.EMAIL_MODE === "smtp" ? smtpSettings(env) : null,
    cronSecret: env.CRON_SECRET ?? null,
    notifyQuietMs: env.NOTIFY_QUIET_SECONDS * 1000,
  };
}

/** Parsed on every call, like serverEnv(), so tests and runtime always see the current environment. */
export function servicesEnv(): ServicesEnv {
  return parseServicesEnv(process.env);
}
