import { parseEnv } from "node:util";
import { describe, expect, it } from "vitest";
import { parseServicesEnv } from "@/lib/services-env";

const KEY = Buffer.alloc(32, 7).toString("base64");

const SMTP = {
  EMAIL_MODE: "smtp",
  SMTP_HOST: "localhost",
  SMTP_USER: "notifications@dashboard.fakhernco.com",
  SMTP_PASSWORD: "Secret#Pa$$=1",
  EMAIL_FROM: "Articles AI <notifications@dashboard.fakhernco.com>",
};

/** The message a settings check fails with ("" when it passes). */
function refusal(source: Record<string, string | undefined>): string {
  try {
    parseServicesEnv(source);
    return "";
  } catch (error) {
    return (error as Error).message;
  }
}

describe("parseServicesEnv (M4c)", () => {
  it("defaults to the in-memory store and logged emails, with a two-minute quiet period", () => {
    expect(parseServicesEnv({})).toEqual({
      dbMode: "memory",
      databaseUrl: null,
      encryptionKey: null,
      emailMode: "log",
      smtp: null,
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

  it("sends through the client's mail server: EMAIL_MODE=smtp with every value, port 587 by default (M5b)", () => {
    expect(parseServicesEnv(SMTP)).toMatchObject({
      emailMode: "smtp",
      smtp: {
        host: "localhost",
        port: 587,
        user: "notifications@dashboard.fakhernco.com",
        password: "Secret#Pa$$=1",
        from: "Articles AI <notifications@dashboard.fakhernco.com>",
        fromAddress: "notifications@dashboard.fakhernco.com",
      },
    });
    expect(parseServicesEnv({ ...SMTP, SMTP_PORT: "465" }).smtp?.port).toBe(465);
    expect(parseServicesEnv({ ...SMTP, EMAIL_MODE: "log" }).smtp).toBeNull();
  });

  it("names each missing SMTP value, and never repeats the password", () => {
    const message = refusal({ EMAIL_MODE: "smtp", SMTP_PASSWORD: SMTP.SMTP_PASSWORD });
    expect(message).toBe("EMAIL_MODE=smtp needs SMTP_HOST, SMTP_USER, EMAIL_FROM.");
    expect(message).not.toContain(SMTP.SMTP_PASSWORD);
    expect(refusal({ ...SMTP, SMTP_PASSWORD: "" })).toBe("EMAIL_MODE=smtp needs SMTP_PASSWORD.");
  });

  it("refuses a port that isn't a whole number from 1 to 65535", () => {
    for (const port of ["0", "65536", "abc", "58.7", "-25"]) {
      expect(refusal({ ...SMTP, SMTP_PORT: port })).toBe("SMTP_PORT must be a whole number from 1 to 65535.");
    }
  });

  it("refuses an EMAIL_FROM without exactly one address, and keeps names with Arabic, commas or quotes (Review Focus 2)", () => {
    for (const from of ["Articles AI", "a@example.com, b@example.com", "A <a@example.com>, B <b@example.com>", "Articles AI <>", "<a@example.com"]) {
      expect(refusal({ ...SMTP, EMAIL_FROM: from })).toMatch(/^EMAIL_FROM must be one address/);
    }
    expect(parseServicesEnv({ ...SMTP, EMAIL_FROM: '"Fakher & Co, فخر" <n@dashboard.fakhernco.com>' }).smtp?.fromAddress).toBe("n@dashboard.fakhernco.com");
    expect(parseServicesEnv({ ...SMTP, EMAIL_FROM: "n@dashboard.fakhernco.com" }).smtp).toMatchObject({
      from: "n@dashboard.fakhernco.com",
      fromAddress: "n@dashboard.fakhernco.com",
    });
  });

  it("refuses the retired Resend mode, naming smtp", () => {
    expect(refusal({ EMAIL_MODE: "resend", RESEND_API_KEY: "re_x" })).toMatch(/EMAIL_MODE=smtp/);
  });

  it("keeps a password with symbols intact when the settings file single-quotes it (Review Focus 1)", () => {
    // deploy/cpanel/app.cjs reads settings.env with Node's loadEnvFile, the same reader as parseEnv: unquoted, # starts a comment.
    expect(parseEnv("SMTP_PASSWORD=p#ss\n").SMTP_PASSWORD).toBe("p");
    const file = parseEnv(`SMTP_PASSWORD='Secret#Pa$$"=1'\n`);
    expect(parseServicesEnv({ ...SMTP, SMTP_PASSWORD: file.SMTP_PASSWORD }).smtp?.password).toBe('Secret#Pa$$"=1');
  });

  it("treats empty strings as unset and reads the quiet period in seconds", () => {
    expect(parseServicesEnv({ DB_MODE: "", CRON_SECRET: "", NOTIFY_QUIET_SECONDS: "0" })).toMatchObject({ dbMode: "memory", cronSecret: null, notifyQuietMs: 0 });
  });
});
