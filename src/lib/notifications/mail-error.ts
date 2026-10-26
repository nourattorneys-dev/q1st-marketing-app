/** How a send failed (M5b). Kept apart from the mailer so the browser can use the kinds without loading nodemailer. */
export const MAIL_ERROR_KINDS = ["login", "connect", "tls", "refused", "other"] as const;
export type MailErrorKind = (typeof MAIL_ERROR_KINDS)[number];

/**
 * A send that failed. `reply` is the mail server's reply line, or when it sent none, the connection's own reason (for
 * example "connect ECONNREFUSED 127.0.0.1:587"). Neither ever holds the password.
 */
export class MailError extends Error {
  readonly kind: MailErrorKind;
  readonly reply: string | null;

  constructor(kind: MailErrorKind, reply: string | null) {
    super(`The email couldn't be sent (${kind})${reply ? `: ${reply}` : "."}`);
    this.name = "MailError";
    this.kind = kind;
    this.reply = reply;
  }
}
