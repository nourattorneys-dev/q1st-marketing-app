import type { AddressInfo } from "node:net";
import { simpleParser, type ParsedMail } from "mailparser";
import { SMTPServer } from "smtp-server";

export const FAKE_USER = "notifications@dashboard.example.com";
export const FAKE_PASSWORD = "Pa$$w0rd#1";

export type Received = { login: string; mailFrom: string; rcptTo: string[]; mail: ParsedMail };
export type FakeSmtp = { port: number; received: Received[]; close(): Promise<void> };

/**
 * A mail server inside the test run (M5b), on 127.0.0.1. It takes the login FAKE_USER / FAKE_PASSWORD, refuses
 * recipients at refused.example, and keeps what it receives. `starttls` offers STARTTLS with smtp-server's own
 * certificate, which no client can verify.
 */
export async function startFakeSmtp(options: { starttls?: boolean } = {}): Promise<FakeSmtp> {
  const received: Received[] = [];
  const server = new SMTPServer({
    logger: false,
    allowInsecureAuth: true,
    authMethods: ["PLAIN", "LOGIN"],
    disabledCommands: options.starttls ? [] : ["STARTTLS"],
    onAuth(auth, _session, done) {
      if (auth.username === FAKE_USER && auth.password === FAKE_PASSWORD) done(null, { user: auth.username });
      else done(Object.assign(new Error("Incorrect authentication data"), { responseCode: 535 }));
    },
    onRcptTo(address, _session, done) {
      if (address.address.endsWith("@refused.example")) done(Object.assign(new Error("Recipient address rejected"), { responseCode: 550 }));
      else done();
    },
    onData(stream, session, done) {
      simpleParser(stream).then(
        (mail) => {
          received.push({
            login: String(session.user),
            mailFrom: session.envelope.mailFrom ? session.envelope.mailFrom.address : "",
            rcptTo: session.envelope.rcptTo.map((rcpt) => rcpt.address),
            mail,
          });
          done();
        },
        (error: Error) => done(error),
      );
    },
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.server.address() as AddressInfo;
  return { port, received, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}
