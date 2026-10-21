import { Resend } from "resend";

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

/** The part of Resend's client this uses; `new Resend(key)` satisfies it. */
type ResendLike = {
  emails: {
    send(
      payload: { from: string; to: string; subject: string; html: string; text: string },
      options: { idempotencyKey: string },
    ): Promise<{ error: { message: string } | null }>;
  };
};

/** EMAIL_MODE=resend (design §10). The idempotency key stops a retried batch from emailing anyone twice. */
export function createResendMailer(options: { apiKey: string; from: string }, client: ResendLike = new Resend(options.apiKey)): Mailer {
  return {
    async send(email) {
      const { error } = await client.emails.send(
        { from: options.from, to: email.to, subject: email.subject, html: email.html, text: email.text },
        { idempotencyKey: email.idempotencyKey },
      );
      if (error) throw new Error(`Resend refused the email: ${error.message}`);
    },
  };
}

export function mailerFor(env: { emailMode: "log" | "resend"; resend: { apiKey: string; from: string } | null }): Mailer {
  return env.emailMode === "resend" && env.resend ? createResendMailer(env.resend) : createLogMailer();
}
