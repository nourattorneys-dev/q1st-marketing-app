import { createServer, type AddressInfo, type Socket } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MailError } from "@/lib/notifications/mail-error";
import { createLogMailer, createSmtpMailer, mailerFor, smtpTransportOptions, type Email, type SmtpSettings } from "@/lib/notifications/mailer";
import { FAKE_PASSWORD, FAKE_USER, startFakeSmtp, type FakeSmtp } from "./fake-smtp";

const SENDER = "notifications@dashboard.example.com";
const SHORT = { connectMs: 500, greetingMs: 500, socketMs: 500 };

/** A port nothing listens on: one that was free a moment ago. */
async function closedPort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const { port } = probe.address() as AddressInfo;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

const settings = (port: number, changes: Partial<SmtpSettings> = {}): SmtpSettings => ({
  host: "localhost",
  port,
  user: FAKE_USER,
  password: FAKE_PASSWORD,
  from: `Articles AI <${SENDER}>`,
  fromAddress: SENDER,
  ...changes,
});

const email = (changes: Partial<Email> = {}): Email => ({
  to: "admin@example.com",
  subject: "3 drafts ready for review · 3 مسودات جاهزة للمراجعة",
  html: '<div dir="ltr" lang="en">Drafts</div><div dir="rtl" lang="ar">مسودات 👋</div>',
  text: "Drafts\n\nمسودات 👋",
  idempotencyKey: "k".repeat(64),
  ...changes,
});

/** The MailError a send failed with. */
async function failureOf(sending: Promise<void>): Promise<MailError> {
  try {
    await sending;
  } catch (error) {
    expect(error).toBeInstanceOf(MailError);
    return error as MailError;
  }
  throw new Error("The send should have failed.");
}

describe("the SMTP mailer (M5b)", () => {
  let plain: FakeSmtp; // no STARTTLS
  let offering: FakeSmtp; // offers STARTTLS, with a certificate no client can verify

  beforeAll(async () => {
    plain = await startFakeSmtp();
    offering = await startFakeSmtp({ starttls: true });
  });

  afterAll(async () => {
    await plain?.close();
    await offering?.close();
  });

  it("sends on this machine without TLS, even when the server offers it, with the login, the sender, both bodies and its headers", async () => {
    // cPanel's certificate doesn't name localhost, so trying STARTTLS here would fail the check.
    const before = offering.received.length;
    await createSmtpMailer(settings(offering.port)).send(email());
    expect(offering.received).toHaveLength(before + 1);
    const { login, mailFrom, rcptTo, mail } = offering.received[before];
    expect(login).toBe(FAKE_USER);
    expect(mailFrom).toBe(SENDER);
    expect(rcptTo).toEqual(["admin@example.com"]);
    expect(mail.from?.value).toMatchObject([{ name: "Articles AI", address: SENDER }]);
    expect(mail.to).toMatchObject({ value: [{ address: "admin@example.com" }] });
    expect(mail.subject).toBe("3 drafts ready for review · 3 مسودات جاهزة للمراجعة");
    expect(mail.html).toContain('<div dir="rtl" lang="ar">مسودات 👋</div>');
    expect(mail.text?.trim()).toBe("Drafts\n\nمسودات 👋");
    expect(mail.messageId).toBe(`<${"k".repeat(64)}@dashboard.example.com>`);
    expect(mail.headers.get("auto-submitted")).toBe("auto-generated");
  });

  it("keeps a sender name with Arabic, a comma or quotes intact (Review Focus 2)", async () => {
    await createSmtpMailer(settings(plain.port, { from: `"Articles AI, فخر & Co" <${SENDER}>` })).send(email({ idempotencyKey: "named" }));
    expect(plain.received.at(-1)?.mail.from?.value).toMatchObject([{ name: "Articles AI, فخر & Co", address: SENDER }]);
  });

  it("a wrong password gives login, with the server's reply and never the password", async () => {
    const wrong = "Wr0ng#Secret";
    const error = await failureOf(createSmtpMailer(settings(plain.port, { password: wrong })).send(email()));
    expect(error).toMatchObject({ kind: "login", reply: "535 Incorrect authentication data" });
    const everything = [error.message, error.stack, JSON.stringify(error), String(error.cause)].join("\n");
    expect(everything).not.toContain(wrong);
    expect(everything).not.toContain(Buffer.from(`\u0000${FAKE_USER}\u0000${wrong}`).toString("base64"));
  });

  it("a recipient the server refuses gives refused, with its reply", async () => {
    const error = await failureOf(createSmtpMailer(settings(plain.port)).send(email({ to: "someone@refused.example" })));
    expect(error).toMatchObject({ kind: "refused", reply: "550 Recipient address rejected" });
  });

  it("gives up on a server that never greets, within the time limit, as connect", async () => {
    const sockets: Socket[] = [];
    const silent = createServer((socket) => void sockets.push(socket));
    await new Promise<void>((resolve) => silent.listen(0, "127.0.0.1", resolve));
    try {
      const started = Date.now();
      // The greeting's limit is the shortest here, so it's the one that ends the wait.
      const limits = { connectMs: 500, greetingMs: 300, socketMs: 2_000 };
      const error = await failureOf(createSmtpMailer(settings((silent.address() as AddressInfo).port), limits).send(email()));
      expect(error).toMatchObject({ kind: "connect", reply: "Greeting never received" });
      expect(Date.now() - started).toBeLessThan(3_000);
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => silent.close(() => resolve()));
    }
  });

  it("a closed port gives connect at once, with the reason (Review Focus 4)", async () => {
    const error = await failureOf(createSmtpMailer(settings(await closedPort(), { host: "127.0.0.1" }), SHORT).send(email()));
    expect(error.kind).toBe("connect");
    expect(error.reply).toMatch(/ECONNREFUSED/);
  });

  it("a closed port on localhost, which has two addresses, still gives the reason (final review: Review Focus 4 as on the server)", async () => {
    // Node tries ::1 and 127.0.0.1; both refusing is one AggregateError whose own message is empty.
    const error = await failureOf(createSmtpMailer(settings(await closedPort()), SHORT).send(email()));
    expect(error.kind).toBe("connect");
    expect(error.reply).toMatch(/ECONNREFUSED/);
  });

  // 0.0.0.0 reaches this machine but isn't one of its three local names, so the mailer treats it as another host.
  it("another host without STARTTLS gets nothing: tls", async () => {
    const before = plain.received.length;
    const error = await failureOf(createSmtpMailer(settings(plain.port, { host: "0.0.0.0" }), SHORT).send(email()));
    expect(error.kind).toBe("tls");
    expect(plain.received).toHaveLength(before);
  });

  it("another host whose certificate can't be verified gets nothing: tls", async () => {
    const before = offering.received.length;
    const error = await failureOf(createSmtpMailer(settings(offering.port, { host: "0.0.0.0" }), SHORT).send(email()));
    expect(error.kind).toBe("tls");
    expect(offering.received).toHaveLength(before);
  });

  it("uses implicit TLS on port 465 and required STARTTLS elsewhere, for any host but this machine, within the spec's time limits", () => {
    const tls = (host: string, port: number) => {
      const { secure, requireTLS, ignoreTLS } = smtpTransportOptions(settings(port, { host }));
      return { secure, requireTLS, ignoreTLS };
    };
    expect(tls("mail.example.com", 465)).toEqual({ secure: true, requireTLS: false, ignoreTLS: false });
    expect(tls("mail.example.com", 587)).toEqual({ secure: false, requireTLS: true, ignoreTLS: false });
    for (const host of ["localhost", "LOCALHOST", "127.0.0.1", "::1"]) {
      expect(tls(host, 587)).toEqual({ secure: false, requireTLS: false, ignoreTLS: true });
    }
    expect(smtpTransportOptions(settings(587))).toMatchObject({ connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 30_000 });
  });

  it("mailerFor sends through the mail server for EMAIL_MODE=smtp, and only keeps emails for log", async () => {
    const before = plain.received.length;
    await mailerFor({ emailMode: "smtp", smtp: settings(plain.port) }).send(email({ idempotencyKey: "via-mailerFor" }));
    expect(plain.received).toHaveLength(before + 1);
    await mailerFor({ emailMode: "log", smtp: null }).send(email({ idempotencyKey: "kept-in-outbox" }));
    expect(createLogMailer().outbox().some((kept) => kept.idempotencyKey === "kept-in-outbox")).toBe(true);
    expect(plain.received).toHaveLength(before + 1);
  });
});
