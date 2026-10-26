import nodemailer from "nodemailer";
import { MailError, type MailErrorKind } from "./mail-error";

export type Email = { to: string; subject: string; html: string; text: string; idempotencyKey: string };
export interface Mailer {
  send(email: Email): Promise<void>;
}

const OUTBOX = Symbol.for("articles-ai.outbox");
const OUTBOX_SIZE = 100;

/** EMAIL_MODE=log: nothing leaves the server; the last 100 emails are kept for the dev outbox (test logins only). */
export function createLogMailer(): Mailer & { outbox(): Email[] } {
  const holder = globalThis as unknown as Record<symbol, Email[] | undefined>;
  const box = (holder[OUTBOX] ??= []);
  return {
    async send(email) {
      if (box.some((kept) => kept.idempotencyKey === email.idempotencyKey)) return;
      box.push({ ...email });
      if (box.length > OUTBOX_SIZE) box.splice(0, box.length - OUTBOX_SIZE);
    },
    outbox: () => box.map((email) => ({ ...email })),
  };
}

/** EMAIL_MODE=smtp (M5b): the client's own mail server. `from` is EMAIL_FROM as written; `fromAddress` is its address. */
export type SmtpSettings = { host: string; port: number; user: string; password: string; from: string; fromAddress: string };

/** The time limits for one send (spec M5b); the tests shorten them. */
export const SMTP_LIMITS = { connectMs: 10_000, greetingMs: 10_000, socketMs: 30_000 };

const THIS_MACHINE = new Set(["localhost", "127.0.0.1", "::1"]);

/**
 * How to reach the server. On this machine the connection never leaves the server, so TLS isn't used (cPanel's
 * certificate doesn't name localhost anyway). Any other host must use TLS with a valid certificate: implicit on 465,
 * required STARTTLS elsewhere.
 */
export function smtpTransportOptions(settings: SmtpSettings, limits = SMTP_LIMITS) {
  const local = THIS_MACHINE.has(settings.host.toLowerCase());
  return {
    host: settings.host,
    port: settings.port,
    secure: !local && settings.port === 465,
    requireTLS: !local && settings.port !== 465,
    ignoreTLS: local,
    auth: { user: settings.user, pass: settings.password },
    connectionTimeout: limits.connectMs,
    greetingTimeout: limits.greetingMs,
    socketTimeout: limits.socketMs,
  };
}

// Nodemailer's error codes. A failed certificate check arrives as ESOCKET, with Node's own code as originalCode
// (CERT_HAS_EXPIRED, DEPTH_ZERO_SELF_SIGNED_CERT, ERR_TLS_CERT_ALTNAME_INVALID, ERR_SSL_…).
const CONNECT_CODES = new Set(["ECONNECTION", "ETIMEDOUT", "ESOCKET", "EDNS", "EPROXY"]);
const TLS_FAILURE = /CERT|SSL|TLS|SIGN|ISSUER/;

function kindOf(code: string, originalCode: string, command: string): MailErrorKind {
  if (code === "EAUTH" || code === "ENOAUTH") return "login";
  if (code === "ETLS" || code === "EREQUIRETLS" || TLS_FAILURE.test(originalCode)) return "tls";
  if (code === "EENVELOPE") return "refused";
  if (CONNECT_CODES.has(code) || (code === "EPROTOCOL" && command === "CONN")) return "connect";
  return "other";
}

/** Only the code and the reply cross over: nodemailer's error object never leaves this file. */
function mailErrorFrom(error: unknown): MailError {
  const failure: Record<string, unknown> = typeof error === "object" && error !== null ? { ...error, message: (error as Error).message } : {};
  const text = (key: string) => (typeof failure[key] === "string" ? (failure[key] as string) : "");
  const said = (text("response") || text("message")).split(/\r?\n/)[0].trim();
  return new MailError(kindOf(text("code"), text("originalCode"), text("command")), said ? said.slice(0, 300) : null);
}

/** EMAIL_MODE=smtp (M5b): one connection per email, closed afterwards. A failure throws a MailError. */
export function createSmtpMailer(settings: SmtpSettings, limits = SMTP_LIMITS): Mailer {
  const transport = nodemailer.createTransport(smtpTransportOptions(settings, limits));
  const domain = settings.fromAddress.slice(settings.fromAddress.lastIndexOf("@") + 1);
  return {
    async send(email) {
      try {
        await transport.sendMail({
          from: settings.from,
          to: email.to,
          envelope: { from: settings.fromAddress, to: email.to },
          subject: email.subject,
          html: email.html,
          text: email.text,
          // The same email sent again carries the same id: unlike Resend, a mail server doesn't drop repeats.
          messageId: `<${email.idempotencyKey}@${domain}>`,
          // Out-of-office and other automatic replies aren't sent back to the dashboard's mailbox.
          headers: { "Auto-Submitted": "auto-generated" },
        });
      } catch (error) {
        throw mailErrorFrom(error);
      }
    },
  };
}

/** The mailer the settings ask for (M5b): the client's mail server for EMAIL_MODE=smtp, otherwise the log. */
export function mailerFor(env: { emailMode: "log" | "smtp"; smtp: SmtpSettings | null }): Mailer {
  return env.emailMode === "smtp" && env.smtp ? createSmtpMailer(env.smtp) : createLogMailer();
}
