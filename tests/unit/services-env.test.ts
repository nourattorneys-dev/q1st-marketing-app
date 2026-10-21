import { describe, expect, it } from "vitest";
import { parseServicesEnv } from "@/lib/services-env";

const KEY = Buffer.alloc(32, 7).toString("base64");

describe("parseServicesEnv (M4c)", () => {
  it("defaults to the in-memory store and logged emails, with a two-minute quiet period", () => {
    expect(parseServicesEnv({})).toEqual({
      dbMode: "memory",
      databaseUrl: null,
      encryptionKey: null,
      emailMode: "log",
      resend: null,
      cronSecret: null,
      notifyQuietMs: 120_000,
    });
  });

  it("refuses the in-memory store on Vercel, and Neon without its address", () => {
    expect(() => parseServicesEnv({ VERCEL: "1" })).toThrow(/refused on Vercel/);
    expect(() => parseServicesEnv({ DB_MODE: "neon" })).toThrow(/needs DATABASE_URL/);
    expect(parseServicesEnv({ DB_MODE: "neon", DATABASE_URL: "postgres://u:p@host/db", VERCEL: "1" }).dbMode).toBe("neon");
  });

  it("takes a 32-byte encryption key and refuses any other length", () => {
    expect(parseServicesEnv({ WEBHOOK_ENCRYPTION_KEY: KEY }).encryptionKey?.length).toBe(32);
    expect(() => parseServicesEnv({ WEBHOOK_ENCRYPTION_KEY: Buffer.alloc(16).toString("base64") })).toThrow(/32 bytes/);
  });

  it("sends through Resend only with a key and a sender", () => {
    expect(() => parseServicesEnv({ EMAIL_MODE: "resend", RESEND_API_KEY: "re_x" })).toThrow(/EMAIL_FROM/);
    expect(parseServicesEnv({ EMAIL_MODE: "resend", RESEND_API_KEY: "re_x", EMAIL_FROM: "Articles AI <notifications@fakhernco.com>" }).resend).toEqual({
      apiKey: "re_x",
      from: "Articles AI <notifications@fakhernco.com>",
    });
  });

  it("treats empty strings as unset and reads the quiet period in seconds", () => {
    expect(parseServicesEnv({ DB_MODE: "", CRON_SECRET: "", NOTIFY_QUIET_SECONDS: "0" })).toMatchObject({ dbMode: "memory", cronSecret: null, notifyQuietMs: 0 });
  });
});
