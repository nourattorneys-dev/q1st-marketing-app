import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ar from "../../messages/ar.json";
import en from "../../messages/en.json";
import type { Email, Mailer } from "@/lib/notifications/mailer";

const sent: Email[] = [];
let failure: Error | null = null;
const fakeMailer: Mailer = {
  async send(email) {
    if (failure) throw failure;
    sent.push(email);
  },
};
vi.mock("@/lib/notifications/mailer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/notifications/mailer")>()),
  mailerFor: () => fakeMailer,
}));
const ADMIN = { userId: "dev_admin", email: "admin@example.com", name: "Admin", role: "admin", twoFactor: true };
const requirePermission = vi.fn(async () => ADMIN);
vi.mock("@/lib/auth/session", () => ({ requirePermission, requireSession: vi.fn() }));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));

const { sendTestEmailAction } = await import("@/app/[locale]/(app)/notifications/actions");
const { MAIL_ERROR_KINDS, MailError } = await import("@/lib/notifications/mail-error");
const { renderTestEmail } = await import("@/lib/notifications/render");

const SMTP = {
  EMAIL_MODE: "smtp",
  SMTP_HOST: "localhost",
  SMTP_USER: "notifications@dashboard.example.com",
  SMTP_PASSWORD: "unused",
  EMAIL_FROM: "notifications@dashboard.example.com",
};
const press = (input: Record<string, unknown> = {}) => sendTestEmailAction({ locale: "en", idempotencyKey: "key-12345678", ...input } as never);

beforeEach(() => {
  vi.clearAllMocks();
  sent.length = 0;
  failure = null;
  for (const [key, value] of Object.entries(SMTP)) vi.stubEnv(key, value);
});
afterEach(() => vi.unstubAllEnvs());

describe("sending a test email (M5b)", () => {
  it("goes at once to the signed-in Admin's own address, as a new email each press", async () => {
    expect(await press()).toEqual({ ok: true, data: { to: "admin@example.com", sent: true } });
    expect(await press()).toEqual({ ok: true, data: { to: "admin@example.com", sent: true } });
    expect(requirePermission).toHaveBeenCalledWith("en", "settings.manage");
    expect(sent.map((email) => email.to)).toEqual(["admin@example.com", "admin@example.com"]);
    expect(sent[0].idempotencyKey).toMatch(/^test-[0-9a-f-]{36}$/);
    expect(sent[1].idempotencyKey).not.toBe(sent[0].idempotencyKey);
    expect(sent[0]).toMatchObject(renderTestEmail());
  });

  it("takes no address: one slipped into the request is ignored", async () => {
    await press({ to: "someone@elsewhere.example" });
    expect(sent.map((email) => email.to)).toEqual(["admin@example.com"]);
  });

  it("turns anyone but an Admin away before anything is sent", async () => {
    requirePermission.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));
    await expect(press()).rejects.toThrow("NEXT_REDIRECT");
    expect(sent).toEqual([]);
  });

  it("refuses a malformed request without checking anything or sending", async () => {
    expect(await press({ locale: "fr" })).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(requirePermission).not.toHaveBeenCalled();
    expect(sent).toEqual([]);
  });

  it("returns each kind of mail failure with the server's reply", async () => {
    for (const kind of MAIL_ERROR_KINDS) {
      failure = new MailError(kind, "535 Incorrect authentication data");
      expect(await press()).toEqual({
        ok: false,
        error: { status: 502, code: "mail_failed", message: failure.message, details: { source: "dashboard", kind, reply: "535 Incorrect authentication data" } },
      });
    }
  });

  it("says nothing was sent while this server only logs emails (EMAIL_MODE=log)", async () => {
    vi.stubEnv("EMAIL_MODE", "log");
    expect(await press()).toEqual({ ok: true, data: { to: "admin@example.com", sent: false } });
  });
});

describe("the test email's words (M5b)", () => {
  it("uses the notification emails' format: English, then Arabic right to left, with no links", () => {
    const email = renderTestEmail();
    expect(email.subject).toBe("Articles AI test email · رسالة تجريبية من Articles AI");
    expect(email.html).toContain('<div dir="ltr" lang="en"');
    expect(email.html).toContain('<div dir="rtl" lang="ar"');
    expect(email.html).not.toContain("<a ");
    expect(email.text).toContain("This is a test from Articles AI. If you can read this, the dashboard's emails work.");
    expect(email.text).toContain("هذه رسالة تجريبية من Articles AI.");
  });

  it("has the spec's sentence for every kind of failure, and an Arabic one", () => {
    expect(en.Notifications.testEmail.failed).toEqual({
      login: "The mail server refused the login.",
      connect: "Couldn't reach the mail server.",
      tls: "The secure connection to the mail server failed.",
      refused: "The mail server refused the sender or the recipient.",
      other: "The email couldn't be sent.",
    });
    expect(Object.keys(ar.Notifications.testEmail.failed).sort()).toEqual([...MAIL_ERROR_KINDS].sort());
  });
});
