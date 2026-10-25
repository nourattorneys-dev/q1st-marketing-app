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

  it("keeps data in MySQL: DB_MODE=mysql needs a mysql:// address, and the retired Neon mode says what to use", () => {
    expect(() => parseServicesEnv({ DB_MODE: "mysql" })).toThrow(/needs DATABASE_URL/);
    expect(() => parseServicesEnv({ DB_MODE: "mysql", DATABASE_URL: "postgres://u:p@host/db" })).toThrow(/must start with mysql:\/\//);
    expect(parseServicesEnv({ DB_MODE: "mysql", DATABASE_URL: "mysql://u:p@localhost:3306/db" })).toMatchObject({
      dbMode: "mysql",
      databaseUrl: "mysql://u:p@localhost:3306/db",
    });
    expect(() => parseServicesEnv({ DB_MODE: "neon", DATABASE_URL: "postgres://u:p@host/db" })).toThrow(/DB_MODE=mysql/);
  });

  it("refuses a DATABASE_URL that isn't a valid address, without repeating it (final review: a password with # / ? not encoded)", () => {
    // What the settings file holds when a password's #, / or ? isn't URL-encoded (a # even starts a comment there).
    for (const url of ["mysql://dash:Secret", "mysql://dash:pa/ss9@localhost:3306/db", "mysql://dash:pa?ss9@localhost:3306/db"]) {
      let message = "";
      try {
        parseServicesEnv({ DB_MODE: "mysql", DATABASE_URL: url });
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toMatch(/URL-encode/);
      expect(message).not.toMatch(/Secret|pa\/ss9|pa\?ss9/);
    }
    expect(parseServicesEnv({ DB_MODE: "mysql", DATABASE_URL: `mysql://dash:${encodeURIComponent("pa/ss?9#")}@localhost:3306/db` }).dbMode).toBe("mysql");
  });

  it("refuses the in-memory store on a production server, which would lose its data on every restart", () => {
    expect(() => parseServicesEnv({ NODE_ENV: "production" })).toThrow(/refused in production/);
    expect(parseServicesEnv({ NODE_ENV: "production", ALLOW_TEST_LOGINS: "1" }).dbMode).toBe("memory");
    expect(parseServicesEnv({ NODE_ENV: "production", DB_MODE: "mysql", DATABASE_URL: "mysql://u:p@localhost:3306/db" }).dbMode).toBe("mysql");
    expect(parseServicesEnv({ NODE_ENV: "development" }).dbMode).toBe("memory");
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
