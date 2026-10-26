# M5b: the dashboard's own email (Resend → the client's mail server) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The dashboard sends its emails over SMTP through a mail server the client controls (for Fakher & Co, the cPanel server's own mail system with `notifications@dashboard.fakhernco.com`). Notification runs go one at a time, and an Admin can send a test email. Nothing is left that needs Resend.

**Architecture:**
- **Mailers:** `createSmtpMailer` (nodemailer) joins the log mailer behind the existing `Mailer` interface. A failed send throws `MailError { kind, reply }`. `MailError` lives in its own small module, so the browser can use its kinds without pulling in nodemailer.
- **Settings:** `EMAIL_MODE` becomes `log|smtp`, with five SMTP settings, and `mailerFor` picks the mailer. Resend goes.
- **One run at a time:** `AppStore.exclusive(name, run)` keeps the cron's flush to one run at a time: the MySQL `GET_LOCK` on a server, a flag in memory locally. An SMTP server doesn't drop a repeated email the way Resend's idempotency key did.
- **Test email:** `sendTestEmailAction` sends a bilingual test email to the signed-in Admin, from a button on the Email notifications page.

**Tech Stack:**
- Next.js 16.4 (standalone build for cPanel), React 19.3, TypeScript 5, Zod 4.6, next-intl 4.14
- **nodemailer 10.2.1** (new; ships its own types)
- **smtp-server 3.21.1 and mailparser 3.12.4** (new, dev only: a fake mail server inside the tests; both ship their own types)
- Drizzle ORM 0.45.4 over mysql2 3.24.6
- Vitest 5, Playwright 1.64, pnpm 10
- Local MySQL 8.4 (Homebrew) for the store tests

**Spec:** `docs/specs/2026-10-26-m5b-own-email-design.md`

**Checked before writing this plan (2026-10-26, scratch run, not committed):**
- nodemailer 10.2.1 against smtp-server 3.21.1 behaves as follows:
  - **wrong password:** `EAUTH` with `response` `535 …`
  - **refused recipient:** `EENVELOPE`
  - **no greeting:** `ETIMEDOUT` "Greeting never received"
  - **closed port:** `ESOCKET` with `originalCode` `ECONNREFUSED`
  - **missing STARTTLS:** `ETLS`
  - **certificate it can't verify:** `ESOCKET` with `originalCode` `CERT_HAS_EXPIRED`
  - **unknown host:** `EDNS`
  - **`421` greeting:** `EPROTOCOL` with `command` `CONN`
- The password appeared in none of these errors.
- `host: "localhost"` reaches a server listening on `127.0.0.1` or on `::1`.
- `host: "0.0.0.0"` reaches this Mac but isn't one of the three local names, so the tests use it as "another host".
- The plan's mailer and fake-server code type-checks under this repo's settings (`moduleResolution: bundler`, `esModuleInterop`, `strict`).
- Node's `loadEnvFile`/`parseEnv` cuts an unquoted `SMTP_PASSWORD=p#ss` to `p`. Single-quoted, `'p#ss$word"=1'` stays intact.
- MySQL 8.4 refuses a `GET_LOCK` name over 64 characters (`ERROR 4163`).

## Global Constraints

**Microsoft 365 stays as it is (the user's rule)**
- Nothing in this plan, or in going live, changes any of these for `fakhernco.com`:
  - its MX, SPF, DKIM or DMARC records
  - its Microsoft 365 mailboxes
  - its cPanel Email Routing
- Only `dashboard.fakhernco.com` gets email settings.

**Packages**
- Add, pinned exactly:
  - `nodemailer` **10.2.1** (dependency)
  - `smtp-server` **3.21.1** and `mailparser` **3.12.4** (devDependencies)
- No `@types/*` packages: all three ship their own types.
- Remove `resend`. No other package changes.

**Settings**
- `EMAIL_MODE=log|smtp`, default `log`.
  - `resend` fails with a message naming `EMAIL_MODE=smtp`.
  - `smtp` needs `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD` and `EMAIL_FROM`.
- `SMTP_PORT` defaults to `587` and must be a whole number from 1 to 65535.
- `EMAIL_FROM` is `Name <address>` or a bare address, and holds exactly one address.
- No error message, log line or `MailError` ever contains `SMTP_PASSWORD`.
- `RESEND_API_KEY` is no longer read.
- In a settings file, `SMTP_PASSWORD` goes in single quotes. `deploy/cpanel/app.cjs` reads the file with Node's `loadEnvFile`, which treats an unquoted `#` as the start of a comment.

**Mailer**
- **TLS:**
  - On `localhost`, `127.0.0.1` or `::1`, no TLS is used (`ignoreTLS`).
  - Any other host uses implicit TLS on port 465 and required STARTTLS on other ports, with certificates verified.
- **Time limits:** 10 s to connect, 10 s for the greeting, 30 s without progress.
- **Headers:**
  - `Message-ID: <{idempotencyKey}@{the sender's domain}>`
  - `Auto-Submitted: auto-generated`
- **`MailError`:**
  - `kind` is one of `login | connect | tls | refused | other`.
  - `reply` is the server's reply line or, when the server sent none, the connection's own reason (for example `connect ECONNREFUSED 127.0.0.1:587`). It's cut at 300 characters.
- A failed notification send is logged exactly as `Notification email failed (<kind>): <reply>`, or with `no reply` when there's none.

**One run at a time**
- `exclusive(name, run)` returns `{ ran: true, value }`, or `{ ran: false }` at once. It never waits.
- **MySQL:**
  - `GET_LOCK('<name>:<database>', 0)` on its own pool connection, released afterwards, even after an error.
  - When `<name>:<database>` is over 64 characters, a sha256 hash of the database name replaces the name, cut to 64 characters in all.
- The cron's lock name is `articles_ai_flush`. A skipped run answers `{ ok: true, data: { skipped: true } }`.

**Test email**
- **Who and where:**
  - Admins only (permission `settings.manage`).
  - The action takes no address and sends at once to the session's email.
  - Each press gets a new `test-<uuid>` id.
- **The page's English sentences, word for word (spec):**
  - **Sent:** `Sent to {email}. It can take a minute to arrive. Check Junk too.`
  - **Log mode:** `Not sent: this server doesn't send emails yet.`
  - **`login`:** `The mail server refused the login.`
  - **`connect`:** `Couldn't reach the mail server.`
  - **`tls`:** `The secure connection to the mail server failed.`
  - **`refused`:** `The mail server refused the sender or the recipient.`
  - **`other`:** `The email couldn't be sent.`
- **The email's body:** `This is a test from Articles AI. If you can read this, the dashboard's emails work.`, English then Arabic.
- Every new message has an Arabic version.

**Copy and secrets**
- Fakher & Co is a "legal consultancy", never a "law firm".
- Secrets never go in git, the chat or a build. `.env*` files stay git-ignored.

**How to work**
- Commit only after lint passes: `RC=0; pnpm lint >/dev/null 2>&1 || RC=$?; if [ $RC -eq 0 ]; then git commit …; fi`. Never chain a commit after checks with `;`.
- **Next 16.4 gotcha:** `next build` type-checks test files. Any build or e2e run must happen while every test file's imports exist. That's why Task 4 runs its e2e RED before writing its unit test.
- `pnpm test` needs the local MySQL (`brew services start mysql@8.4`).

## Review Focus

1. **A mailbox password with `#`, `$`, `"` or `=`** (cPanel's generator uses symbols):
   - Node's settings-file reader cuts an unquoted value at `#`. Single-quoted, the password must reach the mailer intact.
   - Tests: Task 2, "keeps a password with symbols intact when the settings file single-quotes it". Task 5's smoke run also sends the password `sm#ke"pa$s=1` through the real `app.cjs`.
2. **An `EMAIL_FROM` whose name has Arabic, a comma or quotes:**
   - It's accepted, and the name arrives intact. Two addresses are refused.
   - Tests: Task 2, "refuses an EMAIL_FROM without exactly one address…", and Task 1, "keeps a sender name with Arabic, a comma or quotes intact".
3. **A long database name** (cPanel allows 64 characters):
   - `<name>:<database>` would pass MySQL's 64-character lock-name limit, and every flush would fail.
   - Test: Task 3, "takes the lock on a database whose name is 64 characters long".
4. **Nothing listening on the mail port** (the mail server stopped, or a wrong port):
   - It fails at once as `connect` and shows the reason, not a bare "no reply".
   - Test: Task 1, "a closed port gives connect at once, with the reason".
5. **A run that fails partway** (for example, the sign-in service is down):
   - The lock is freed, so the next cron run isn't skipped forever.
   - Tests: Task 3, the store contract case "…frees it when the job ends or throws", and the cron route case "a run that fails frees the lock".

---

## File map

| File | Task | Responsibility |
|---|---|---|
| `package.json`, `pnpm-lock.yaml` | 1, 2 | add nodemailer, smtp-server, mailparser (1); remove resend (2) |
| `src/lib/notifications/mail-error.ts` (new) | 1 | `MAIL_ERROR_KINDS`, `MailErrorKind`, `MailError` (no nodemailer, so the browser may import it) |
| `src/lib/notifications/mailer.ts` | 1, 2 | `SmtpSettings`, `SMTP_LIMITS`, `smtpTransportOptions`, `createSmtpMailer` (1); `mailerFor` on smtp, Resend removed (2) |
| `tests/unit/fake-smtp.ts` (new) | 1 | test helper: a mail server inside the test run |
| `tests/unit/smtp-mailer.test.ts` (new) | 1, 2 | the SMTP mailer against the fake server (1); `mailerFor` (2) |
| `src/lib/services-env.ts` | 2 | `EMAIL_MODE=log\|smtp` and the SMTP settings |
| `tests/unit/services-env.test.ts` | 2 | settings cases |
| `tests/unit/notifications.test.ts` | 2, 3 | Resend test removed (2); failure logging (3) |
| `.env.example` | 2 | email settings text |
| `src/lib/db/store.ts`, `memory-store.ts`, `mysql-store.ts` | 3 | `exclusive` |
| `tests/unit/store.test.ts`, `tests/unit/mysql-store.test.ts` | 3 | `exclusive` contract and MySQL cases |
| `src/lib/notifications/flush.ts` | 3 | logs failed sends; give-up comment reworded |
| `src/app/api/cron/notifications/route.ts` | 3 | the flush inside `exclusive` |
| `tests/unit/cron-route.test.ts` | 3 | one run at a time; the lock is freed after a failure |
| `src/lib/notifications/render.ts` | 4 | `renderTestEmail`; the layout shared with `renderBatch` |
| `messages/en.json`, `messages/ar.json` | 4 | `Email.test.*`, `Notifications.testEmail.*` |
| `src/app/[locale]/(app)/notifications/actions.ts` | 4 | `sendTestEmailAction` |
| `src/components/notifications/test-email-button.tsx` (new) | 4 | the button and its result |
| `src/components/notifications/notifications-view.tsx` | 4 | shows the button to Admins |
| `tests/unit/test-email.test.ts` (new) | 4 | the action, the email and the sentences |
| `tests/e2e/notifications.spec.ts` | 4 | an Admin presses the button; a Reviewer has none; Arabic |
| `README.md` | 5 | email section, cron line, preview line, "Decisions in M5b" |

---

### Task 1: The SMTP mailer

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`
- Create: `src/lib/notifications/mail-error.ts`
- Modify: `src/lib/notifications/mailer.ts` (additions only; Resend stays until Task 2)
- Create: `tests/unit/fake-smtp.ts`
- Test: `tests/unit/smtp-mailer.test.ts`

**Interfaces:**
- Consumes: `Email` and `Mailer` (existing, `mailer.ts`).
- Produces:
  - In `mail-error.ts`:
    - `MAIL_ERROR_KINDS = ["login", "connect", "tls", "refused", "other"] as const` and `type MailErrorKind`
    - `class MailError extends Error { readonly kind: MailErrorKind; readonly reply: string | null }`
  - In `mailer.ts`:
    - `type SmtpSettings = { host: string; port: number; user: string; password: string; from: string; fromAddress: string }`
    - `SMTP_LIMITS = { connectMs: 10_000, greetingMs: 10_000, socketMs: 30_000 }`
    - `smtpTransportOptions(settings: SmtpSettings, limits = SMTP_LIMITS)`, which returns nodemailer's options
    - `createSmtpMailer(settings: SmtpSettings, limits = SMTP_LIMITS): Mailer`
  - Test helpers in `tests/unit/fake-smtp.ts`:
    - `FAKE_USER` and `FAKE_PASSWORD`
    - `type Received = { login: string; mailFrom: string; rcptTo: string[]; mail: ParsedMail }`
    - `type FakeSmtp = { port: number; received: Received[]; close(): Promise<void> }`
    - `startFakeSmtp({ starttls? }): Promise<FakeSmtp>`

- [ ] **Step 1: Add the packages, pinned exactly**

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
pnpm add --save-exact nodemailer@10.2.1
pnpm add --save-exact -D smtp-server@3.21.1 mailparser@3.12.4
grep -n '"nodemailer"\|"smtp-server"\|"mailparser"' package.json
```

Expected: three lines, with no caret:
- `"nodemailer": "10.2.1"` under `dependencies`
- `"mailparser": "3.12.4"` and `"smtp-server": "3.21.1"` under `devDependencies`

- [ ] **Step 2: Write the fake mail server (test helper)**

Create `tests/unit/fake-smtp.ts`:

```ts
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
```

- [ ] **Step 3: Write the failing tests**

Create `tests/unit/smtp-mailer.test.ts`:

```ts
import { createServer, type AddressInfo, type Socket } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MailError } from "@/lib/notifications/mail-error";
import { createSmtpMailer, smtpTransportOptions, type Email, type SmtpSettings } from "@/lib/notifications/mailer";
import { FAKE_PASSWORD, FAKE_USER, startFakeSmtp, type FakeSmtp } from "./fake-smtp";

const SENDER = "notifications@dashboard.example.com";
const SHORT = { connectMs: 500, greetingMs: 500, socketMs: 500 };

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
      const error = await failureOf(createSmtpMailer(settings((silent.address() as AddressInfo).port), SHORT).send(email()));
      expect(error).toMatchObject({ kind: "connect", reply: "Greeting never received" });
      expect(Date.now() - started).toBeLessThan(3_000);
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => silent.close(() => resolve()));
    }
  });

  it("a closed port gives connect at once, with the reason (Review Focus 4)", async () => {
    const probe = createServer();
    await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
    const { port } = probe.address() as AddressInfo;
    await new Promise<void>((resolve) => probe.close(() => resolve()));
    const error = await failureOf(createSmtpMailer(settings(port, { host: "127.0.0.1" }), SHORT).send(email()));
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
});
```

- [ ] **Step 4: Run them and watch them fail**

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
pnpm vitest run tests/unit/smtp-mailer.test.ts 2>&1 | tail -15
```

Expected: FAIL. The suite can't load `@/lib/notifications/mail-error` (`Failed to resolve import` / `Cannot find module`), so no test runs.

- [ ] **Step 5: Write `MailError`**

Create `src/lib/notifications/mail-error.ts`:

```ts
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
```

- [ ] **Step 6: Write the SMTP mailer**

In `src/lib/notifications/mailer.ts`:

1. Add these imports below `import { Resend } from "resend";`:

```ts
import nodemailer from "nodemailer";
import { MailError, type MailErrorKind } from "./mail-error";
```

2. Add this block between `createLogMailer` and the `ResendLike` type:

```ts
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
```

- [ ] **Step 7: Run the tests and watch them pass**

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
pnpm vitest run tests/unit/smtp-mailer.test.ts tests/unit/notifications.test.ts 2>&1 | tail -8
```

Expected: PASS, with `smtp-mailer.test.ts` 9 passed and `notifications.test.ts` unchanged and all passing.

If the fake server's certificate stops failing the check, `TLS_FAILURE` didn't match the new `originalCode`. Print `error.reply` and the nodemailer error's `originalCode` (temporarily), and widen the pattern. Then ledger a ruling.

- [ ] **Step 8: Commit**

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
RC=0; pnpm lint >/dev/null 2>&1 || RC=$?
if [ $RC -eq 0 ]; then
  git add package.json pnpm-lock.yaml src/lib/notifications/mail-error.ts src/lib/notifications/mailer.ts tests/unit/fake-smtp.ts tests/unit/smtp-mailer.test.ts
  git commit -m "feat(email): an SMTP mailer for the client's own mail server, failing with a MailError kind (M5b)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
else echo "lint failed: RC=$RC"; fi
```

Task test command: `pnpm vitest run tests/unit/smtp-mailer.test.ts tests/unit/notifications.test.ts`

---

### Task 2: The settings, and Resend removed

**Files:**
- Modify: `src/lib/services-env.ts`
- Modify: `src/lib/notifications/mailer.ts` (`mailerFor`; Resend removed)
- Modify: `tests/unit/services-env.test.ts`, `tests/unit/smtp-mailer.test.ts`, `tests/unit/notifications.test.ts`
- Modify: `.env.example`, `package.json`, `pnpm-lock.yaml` (remove `resend`)

**Interfaces:**
- Consumes: Task 1's `SmtpSettings`, `createSmtpMailer` and `createLogMailer`.
- Produces:
  - `ServicesEnv.emailMode: "log" | "smtp"`
  - `ServicesEnv.smtp: SmtpSettings | null`, which replaces `resend`
  - `mailerFor(env: { emailMode: "log" | "smtp"; smtp: SmtpSettings | null }): Mailer`

- [ ] **Step 1: Write the failing settings tests**

In `tests/unit/services-env.test.ts`:

1. Add this import as the first line:

```ts
import { parseEnv } from "node:util";
```

2. Add these after the `KEY` constant:

```ts
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
```

3. In the defaults test, replace `resend: null,` with `smtp: null,`.

4. Replace the whole test `it("sends through Resend only with a key and a sender", …)` with:

```ts
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
```

- [ ] **Step 2: Write the failing `mailerFor` test**

In `tests/unit/smtp-mailer.test.ts`, change the mailer import to:

```ts
import { createLogMailer, createSmtpMailer, mailerFor, smtpTransportOptions, type Email, type SmtpSettings } from "@/lib/notifications/mailer";
```

Then add this case at the end of the `describe` block:

```ts
  it("mailerFor sends through the mail server for EMAIL_MODE=smtp, and only keeps emails for log", async () => {
    const before = plain.received.length;
    await mailerFor({ emailMode: "smtp", smtp: settings(plain.port) }).send(email({ idempotencyKey: "via-mailerFor" }));
    expect(plain.received).toHaveLength(before + 1);
    await mailerFor({ emailMode: "log", smtp: null }).send(email({ idempotencyKey: "kept-in-outbox" }));
    expect(createLogMailer().outbox().some((kept) => kept.idempotencyKey === "kept-in-outbox")).toBe(true);
    expect(plain.received).toHaveLength(before + 1);
  });
```

- [ ] **Step 3: Run them and watch them fail**

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
pnpm vitest run tests/unit/services-env.test.ts tests/unit/smtp-mailer.test.ts 2>&1 | tail -20
```

Expected: FAIL.
- **`services-env.test.ts`:** 7 cases fail.
  - The defaults test fails: it gets `resend: null` instead of `smtp: null`.
  - The five cases that use `EMAIL_MODE=smtp` fail: Zod refuses `smtp` with `Invalid option`, so the expected values and messages never come.
  - The Resend case fails: today's message (`EMAIL_MODE=resend needs RESEND_API_KEY and EMAIL_FROM.`) doesn't name `smtp`.
  - The database, key and quiet-period cases still pass.
- **`smtp-mailer.test.ts`:** the `mailerFor` case fails on `toHaveLength(before + 1)`, because `smtp` falls back to the log mailer today.

- [ ] **Step 4: Write the settings**

In `src/lib/services-env.ts`:

1. Add this import below `import { z } from "zod";`:

```ts
import type { SmtpSettings } from "@/lib/notifications/mailer";
```

2. In `ServicesSchema`, replace the three lines `EMAIL_MODE: …`, `RESEND_API_KEY: …` and `EMAIL_FROM: …` with:

```ts
  EMAIL_MODE: z.enum(["log", "smtp"]).default("log"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
```

3. In `ServicesEnv`, change the type's doc line to `/** The database, webhook secret, email and cron settings (M4c, M5a, M5b). Server-only: none of these may reach the browser. */`. Then replace the lines `emailMode: "log" | "resend";` and `resend: { apiKey: string; from: string } | null;` with:

```ts
  emailMode: "log" | "smtp";
  /** The client's mail server (EMAIL_MODE=smtp), or null while emails are only logged. */
  smtp: SmtpSettings | null;
```

4. Add this block right after the `ServicesEnv` type:

```ts
const ADDRESS = /^[^\s<>@,;"]+@[^\s<>@,;"]+$/;

/** The address in "Name <address>" or a bare address; null unless EMAIL_FROM holds exactly one. */
function senderAddress(from: string): string | null {
  const named = /^(.*)<([^<>]+)>$/.exec(from.trim());
  if (named && /[<>]/.test(named[1])) return null;
  const address = (named ? named[2] : from).trim();
  return ADDRESS.test(address) ? address : null;
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
  const fromAddress = senderAddress(from);
  if (!fromAddress) {
    throw new Error("EMAIL_FROM must be one address, like Articles AI <notifications@dashboard.example.com> or notifications@dashboard.example.com.");
  }
  return { host, port, user, password, from, fromAddress };
}
```

5. In `parseServicesEnv`, add this right after the `DB_MODE === "neon"` check:

```ts
  if (cleaned.EMAIL_MODE === "resend") {
    throw new Error(
      "EMAIL_MODE=resend is no longer supported: the dashboard sends email through the client's own mail server. Set EMAIL_MODE=smtp and the SMTP_ settings.",
    );
  }
```

6. Delete the block `if (env.EMAIL_MODE === "resend" && (!env.RESEND_API_KEY || !env.EMAIL_FROM)) { … }`.

7. In the returned object, replace the `resend: …` line with:

```ts
    smtp: env.EMAIL_MODE === "smtp" ? smtpSettings(env) : null,
```

- [ ] **Step 5: Point `mailerFor` at the SMTP mailer, and remove Resend**

In `src/lib/notifications/mailer.ts`:

1. Delete:
   - the line `import { Resend } from "resend";`
   - the `ResendLike` type with its comment
   - `createResendMailer` with its comment
2. Replace `mailerFor` with:

```ts
/** The mailer the settings ask for (M5b): the client's mail server for EMAIL_MODE=smtp, otherwise the log. */
export function mailerFor(env: { emailMode: "log" | "smtp"; smtp: SmtpSettings | null }): Mailer {
  return env.emailMode === "smtp" && env.smtp ? createSmtpMailer(env.smtp) : createLogMailer();
}
```

In `tests/unit/notifications.test.ts`:
1. Change the mailer import to `import { createLogMailer, type Email } from "@/lib/notifications/mailer";`.
2. Delete the whole test `it("sends through Resend with the sender, both bodies and the idempotency key; a refusal throws", …)`.

Then remove the package and check that nothing imports it:

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
pnpm remove resend
grep -rn '"resend"\|from "resend"\|RESEND_API_KEY' src tests package.json || echo "no resend left"
```

Expected: `no resend left`.

- [ ] **Step 6: Update `.env.example`**

Replace these lines:

```
# Notification emails (design §10): "log" sends nothing (local); "resend" sends through Resend.
EMAIL_MODE=log
RESEND_API_KEY=
# For example: Articles AI <notifications@fakhernco.com> (the domain needs Resend's DNS records in Cloudflare)
EMAIL_FROM=
# Vercel Cron sends it as "Authorization: Bearer …" to /api/cron/notifications (vercel.json, every 15 minutes).
CRON_SECRET=
```

with:

```
# Notification emails (design §10, M5b): "log" sends nothing (local); "smtp" sends through the client's own mail server.
EMAIL_MODE=log
# The mail server. On a cPanel host: localhost and 587 (on this machine no TLS is used; any other host must offer TLS).
SMTP_HOST=
SMTP_PORT=
# The mailbox's login. Put the password in single quotes ('…'): in this file an unquoted # starts a comment.
SMTP_USER=
SMTP_PASSWORD=
# The mailbox's own address, for example: Articles AI <notifications@dashboard.fakhernco.com>
EMAIL_FROM=
# The cron job sends it as "Authorization: Bearer …" to /api/cron/notifications, every 15 minutes (README).
CRON_SECRET=
```

- [ ] **Step 7: Run the tests and the type check, and watch them pass**

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
pnpm vitest run tests/unit/services-env.test.ts tests/unit/smtp-mailer.test.ts tests/unit/notifications.test.ts tests/unit/cron-route.test.ts 2>&1 | tail -8
pnpm typecheck 2>&1 | tail -5
```

Expected:
- PASS, all four files.
- `pnpm typecheck` prints no errors. The cron route's `mailerFor(env)` takes the new `ServicesEnv` unchanged.

- [ ] **Step 8: Commit**

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
RC=0; pnpm lint >/dev/null 2>&1 || RC=$?
if [ $RC -eq 0 ]; then
  git add package.json pnpm-lock.yaml .env.example src/lib/services-env.ts src/lib/notifications/mailer.ts tests/unit/services-env.test.ts tests/unit/smtp-mailer.test.ts tests/unit/notifications.test.ts
  git commit -m "feat(settings): EMAIL_MODE=smtp with the client's mail server; Resend removed (M5b)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
else echo "lint failed: RC=$RC"; fi
```

Task test command: `pnpm vitest run tests/unit/services-env.test.ts tests/unit/smtp-mailer.test.ts tests/unit/notifications.test.ts tests/unit/cron-route.test.ts`

---

### Task 3: One notification run at a time

**Files:**
- Modify: `src/lib/db/store.ts`, `src/lib/db/memory-store.ts`, `src/lib/db/mysql-store.ts`
- Modify: `src/lib/notifications/flush.ts`
- Modify: `src/app/api/cron/notifications/route.ts`
- Test: `tests/unit/store.test.ts`, `tests/unit/mysql-store.test.ts`, `tests/unit/notifications.test.ts`, `tests/unit/cron-route.test.ts`

**Interfaces:**
- Consumes:
  - Task 1: `MailError` (`mail-error.ts`)
  - Task 2: `mailerFor(env)`
- Produces:
  - `AppStore.exclusive<T>(name: string, run: () => Promise<T>): Promise<{ ran: true; value: T } | { ran: false }>`
  - `createMysqlStore(connection: Pick<MysqlConnection, "db" | "ready" | "pool">)`
  - The cron answers `{ ok: true, data: { skipped: true } }` when another run holds the lock.
  - The flush logs `Notification email failed (<kind>): <reply>`.

- [ ] **Step 1: Write the failing store contract case (both stores)**

In `tests/unit/store.test.ts`, add this case at the end of the `describe.each(…)` block:

```ts
  it("runs one job of a kind at a time, and frees it when the job ends or throws (M5b: one notification run at a time)", async () => {
    const store = await createStore();
    let inner: unknown;
    let other: unknown;
    const outer = await store.exclusive("articles_ai_flush", async () => {
      inner = await store.exclusive("articles_ai_flush", async () => "second");
      other = await store.exclusive("another_job", async () => "other");
      return "first";
    });
    expect(outer).toEqual({ ran: true, value: "first" });
    expect(inner).toEqual({ ran: false });
    expect(other).toEqual({ ran: true, value: "other" });
    await expect(
      store.exclusive("articles_ai_flush", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await store.exclusive("articles_ai_flush", async () => "again")).toEqual({ ran: true, value: "again" });
  });
```

- [ ] **Step 2: Write the failing MySQL cases (copies on one MySQL server)**

In `tests/unit/mysql-store.test.ts`, change the helper import to:

```ts
import { adminQuery, freshTestDatabase, testDatabaseName, testDatabaseUrl } from "./mysql-test-db";
```

Then add at the end of the file:

```ts
describe("one notification run at a time across server processes (M5b)", () => {
  const opened: MysqlConnection[] = [];
  /** A store with its own pool, as another server process would have. */
  const storeOn = (url: string) => {
    const connection = connectMysql(url);
    opened.push(connection);
    return createMysqlStore(connection);
  };

  afterAll(async () => {
    for (const connection of opened) await connection.close();
  });

  it("blocks a second copy on the same database, but not a copy on another database", async () => {
    const first = storeOn(await freshTestDatabase("exclusive_a"));
    const sameDatabase = storeOn(testDatabaseUrl("exclusive_a"));
    const otherDatabase = storeOn(await freshTestDatabase("exclusive_b"));
    const inside = await first.exclusive("articles_ai_flush", async () => ({
      same: await sameDatabase.exclusive("articles_ai_flush", async () => "ran"),
      other: await otherDatabase.exclusive("articles_ai_flush", async () => "ran"),
    }));
    expect(inside).toEqual({ ran: true, value: { same: { ran: false }, other: { ran: true, value: "ran" } } });
    expect(await sameDatabase.exclusive("articles_ai_flush", async () => "after")).toEqual({ ran: true, value: "after" });
  });

  it("takes the lock on a database whose name is 64 characters long (Review Focus 3: MySQL caps lock names at 64)", async () => {
    const name = "x".repeat(64 - testDatabaseName("").length);
    expect(testDatabaseName(name)).toHaveLength(64);
    const first = storeOn(await freshTestDatabase(name));
    const second = storeOn(testDatabaseUrl(name));
    expect(await first.exclusive("articles_ai_flush", () => second.exclusive("articles_ai_flush", async () => "ran"))).toEqual({
      ran: true,
      value: { ran: false },
    });
  });
});
```

- [ ] **Step 3: Write the failing flush case (failures are logged)**

In `tests/unit/notifications.test.ts`:

1. Change the vitest import to:

```ts
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
```

2. Add this import after the `flushNotifications` import:

```ts
import { MailError } from "@/lib/notifications/mail-error";
```

3. Add these lines at the start of the `describe("flushNotifications", …)` block, before `async function seeded()`:

```ts
  let logged: MockInstance<typeof console.error>;
  beforeEach(() => {
    // Failed sends are logged (M5b); this keeps the cases that fail on purpose quiet.
    logged = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    logged.mockRestore();
  });
```

4. Add this case at the end of that block:

```ts
  it("logs each failed send with its kind and the server's reply, never the email itself (M5b)", async () => {
    const store = await seeded();
    const refusing = {
      async send() {
        throw new MailError("login", "535 Incorrect authentication data");
      },
    };
    expect(await flushNotifications(options(store, refusing, 200))).toEqual({ batches: 2, emails: 0, failed: 3 });
    expect(logged.mock.calls).toEqual(Array.from({ length: 3 }, () => ["Notification email failed (login): 535 Incorrect authentication data"]));
  });
```

- [ ] **Step 4: Write the failing cron cases**

In `tests/unit/cron-route.test.ts`:

1. Add this import below the `createLogMailer` import:

```ts
import type { Mailer } from "@/lib/notifications/mailer";
```

2. Add this block right after the `vi.mock("@/lib/users/directory", …)` line:

```ts
let mailer: Mailer | null = null;
// A case can hold the sending up; the others get the settings' choice (the log mailer, EMAIL_MODE=log).
vi.mock("@/lib/notifications/mailer", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/notifications/mailer")>();
  return { ...original, mailerFor: (env: Parameters<typeof original.mailerFor>[0]) => mailer ?? original.mailerFor(env) };
});
```

3. In `beforeEach`, add `mailer = null;` as the first line.

4. Add these two cases at the end of the `describe` block:

```ts
  it("runs one flush at a time: a call while another is sending skips, so each email goes out once (M5b)", async () => {
    await queueDraft("evt_cron_once");
    let release = () => {};
    const holding = new Promise<void>((resolve) => (release = resolve));
    const sent: string[] = [];
    mailer = {
      async send(email) {
        sent.push(email.to);
        await holding;
      },
    };
    const first = call("Bearer cron-secret");
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    const second = call("Bearer cron-secret");
    await new Promise((resolve) => setTimeout(resolve, 50)); // time for a second run to reach the mail server, if it ran
    release();
    expect(await (await second).json()).toEqual({ ok: true, data: { skipped: true } });
    expect(await (await first).json()).toEqual({ ok: true, data: { batches: 1, emails: 1, failed: 0 } });
    expect(sent).toEqual(["reviewer@example.com"]);
  });

  it("a run that fails frees the lock: the next run sends (Review Focus 5)", async () => {
    directory.list.mockRejectedValueOnce(new DirectoryError("unavailable", "The sign-in service can't be reached right now. Try again shortly."));
    await queueDraft("evt_cron_retry");
    expect((await call("Bearer cron-secret")).status).toBe(503);
    expect(await (await call("Bearer cron-secret")).json()).toEqual({ ok: true, data: { batches: 1, emails: 1, failed: 0 } });
  });
```

- [ ] **Step 5: Run them and watch them fail**

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
pnpm vitest run tests/unit/store.test.ts tests/unit/mysql-store.test.ts tests/unit/notifications.test.ts tests/unit/cron-route.test.ts 2>&1 | grep -E "✓|×|FAIL|passed|failed" | tail -30
```

Expected: FAIL.
- **`store.test.ts`:** the new case fails for both stores (`store.exclusive is not a function`).
- **`mysql-store.test.ts`:** both new cases fail the same way.
- **`notifications.test.ts`:** the logging case fails, because nothing is logged today.
- **`cron-route.test.ts`:**
  - The one-at-a-time case fails: the second call sends too, so it gets `{ batches: 1, … }` instead of `{ skipped: true }`.
  - "a run that fails frees the lock" **passes already**, since there's no lock yet. It guards Step 6's lock.

- [ ] **Step 6: Write `exclusive`**

In `src/lib/db/store.ts`, add this as the last member of `AppStore`:

```ts
  /**
   * Runs `run` only if no job with this name is running, in this process or in another one using the same database;
   * otherwise answers { ran: false } at once, without waiting (M5b: one notification run at a time).
   */
  exclusive<T>(name: string, run: () => Promise<T>): Promise<{ ran: true; value: T } | { ran: false }>;
```

In `src/lib/db/memory-store.ts`:
1. Add `const running = new Set<string>();` below `let webhook: WebhookConfig | null = null;`.
2. Add this as the last method of the returned object:

```ts
    async exclusive<T>(name: string, run: () => Promise<T>): Promise<{ ran: true; value: T } | { ran: false }> {
      if (running.has(name)) return { ran: false };
      running.add(name);
      try {
        return { ran: true, value: await run() };
      } finally {
        running.delete(name);
      }
    },
```

In `src/lib/db/mysql-store.ts`:
1. Add these two imports at the top:

```ts
import { createHash } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
```

2. Add this block above `/** DB_MODE=mysql (spec M5a): …`:

```ts
// MySQL refuses a lock name over 64 characters (cPanel allows 64 for the database's name alone).
const LOCK_NAME_MAX = 64;

/** GET_LOCK names are shared by the whole MySQL server: the database's name in it keeps other copies' locks apart. */
function lockName(name: string, database: string): string {
  const full = `${name}:${database}`;
  return full.length <= LOCK_NAME_MAX ? full : `${name}:${createHash("sha256").update(database).digest("hex")}`.slice(0, LOCK_NAME_MAX);
}
```

3. Change the signature to:

```ts
export function createMysqlStore(connection: Pick<MysqlConnection, "db" | "ready" | "pool">): AppStore {
```

4. Add this as the last method of the returned object:

```ts
    async exclusive<T>(name: string, run: () => Promise<T>): Promise<{ ran: true; value: T } | { ran: false }> {
      // Its own connection: a MySQL lock belongs to the connection that took it, and goes with it if the process dies.
      const held = await connection.pool.getConnection();
      try {
        const [here] = await held.query<RowDataPacket[]>("SELECT DATABASE() AS name");
        const lock = lockName(name, String(here[0]?.name ?? ""));
        const [taken] = await held.query<RowDataPacket[]>("SELECT GET_LOCK(?, 0) AS got", [lock]);
        if (taken[0]?.got !== 1) return { ran: false };
        try {
          return { ran: true, value: await run() };
        } finally {
          await held.query("SELECT RELEASE_LOCK(?)", [lock]);
        }
      } finally {
        held.release();
      }
    },
```

- [ ] **Step 7: Log failed sends, and reword the give-up comment**

In `src/lib/notifications/flush.ts`:

1. Add this import after `import type { Mailer } from "./mailer";`:

```ts
import { MailError } from "./mail-error";
```

2. Replace the `GIVE_UP_MS` comment with:

```ts
/** A batch stops waiting for someone its email can't reach after a day, so one unreachable address can't hold it forever. */
```

3. In the `flushNotifications` doc comment, replace `The idempotency key is those items and the address, hashed.` with `The idempotency key (the email's Message-ID) is those items and the address, hashed.`.

4. Replace:

```ts
        } catch {
          failed += 1;
          continue;
        }
```

with:

```ts
        } catch (error) {
          // The kind and the server's reply only, never the email's content or the password (M5b).
          const { kind, reply } = error instanceof MailError ? error : { kind: "other", reply: error instanceof Error ? error.message : null };
          console.error(`Notification email failed (${kind}): ${reply ?? "no reply"}`);
          failed += 1;
          continue;
        }
```

- [ ] **Step 8: Run the cron's flush inside the lock**

In `src/app/api/cron/notifications/route.ts`:

1. Change the comment above `authorized` to `/** The cron job sends "Authorization: Bearer <CRON_SECRET>"; compared in constant time. No secret set: nobody gets in. */`.
2. Change the comment above `GET` to `/** GET /api/cron/notifications: every 15 minutes (the host's cron job, README), sends the notification emails that are due (design §10). */`.
3. Replace the `try { … }` block's body with:

```ts
    // One run at a time (M5b): a mail server, unlike Resend, would deliver an email that two runs both sent.
    const outcome = await store.exclusive("articles_ai_flush", () =>
      flushNotifications({
        store,
        mailer: mailerFor(env),
        users: async () => (await (await getDirectory()).list()).users,
        origin: config ? new URL(config.url).origin : null,
        now: new Date(),
        quietMs: env.notifyQuietMs,
      }),
    );
    return Response.json({ ok: true, data: outcome.ran ? outcome.value : { skipped: true } }, { headers: NO_STORE });
```

- [ ] **Step 9: Run the tests and the type check, and watch them pass**

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
pnpm vitest run tests/unit/store.test.ts tests/unit/mysql-store.test.ts tests/unit/notifications.test.ts tests/unit/cron-route.test.ts 2>&1 | tail -8
pnpm typecheck 2>&1 | tail -5
```

Expected:
- PASS, all four files.
- No type errors.
- No `Notification email failed` lines in the test output: the spy keeps them quiet.

- [ ] **Step 10: Commit**

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
RC=0; pnpm lint >/dev/null 2>&1 || RC=$?
if [ $RC -eq 0 ]; then
  git add src/lib/db/store.ts src/lib/db/memory-store.ts src/lib/db/mysql-store.ts src/lib/notifications/flush.ts src/app/api/cron/notifications/route.ts tests/unit/store.test.ts tests/unit/mysql-store.test.ts tests/unit/notifications.test.ts tests/unit/cron-route.test.ts
  git commit -m "feat(notifications): one flush at a time under a database lock; failed sends are logged with their kind (M5b)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
else echo "lint failed: RC=$RC"; fi
```

Task test command: `pnpm vitest run tests/unit/store.test.ts tests/unit/mysql-store.test.ts tests/unit/notifications.test.ts tests/unit/cron-route.test.ts`

---

### Task 4: The test email (Admins)

**Files:**
- Modify: `messages/en.json`, `messages/ar.json`
- Modify: `src/lib/notifications/render.ts`
- Modify: `src/app/[locale]/(app)/notifications/actions.ts`
- Create: `src/components/notifications/test-email-button.tsx`
- Modify: `src/components/notifications/notifications-view.tsx`
- Test: `tests/e2e/notifications.spec.ts` (RED first, before any unit test imports a missing module), `tests/unit/test-email.test.ts`

**Interfaces:**
- Consumes:
  - Task 1: `MailError` and `MAIL_ERROR_KINDS` (`mail-error.ts`)
  - Task 2: `mailerFor(env)` and `servicesEnv().emailMode`
- Produces:
  - `renderTestEmail(): { subject: string; html: string; text: string }`
  - `sendTestEmailAction(input: { locale: string; idempotencyKey: string }): Promise<ActionResult<{ to: string; sent: boolean }>>`
    - **on success:** `sent` is `true` for `EMAIL_MODE=smtp` and `false` for log mode
    - **on a send failure:** `{ ok: false, error: { status: 502, code: "mail_failed", message, details: { source: "dashboard", kind, reply } } }`
  - `<TestEmailButton locale />`, with these test ids:
    - `test-email-send` (the button)
    - `test-email-result`, with `data-state` set to `sent | log | failed` and `data-kind` set on failures
  - Messages: `Email.test.{subject,heading,body,footer}` and `Notifications.testEmail.{button,sending,sent,logMode,failed.<kind>}`

- [ ] **Step 1: Write the failing e2e tests**

In `tests/e2e/notifications.spec.ts`:

1. Add at the end of the test `"the Email notifications page in Arabic, for an Admin"`:

```ts
  await expect(page.getByTestId("test-email-send")).toHaveText("أرسل لي رسالة تجريبية");
  await page.getByTestId("test-email-send").click();
  await expect(page.getByTestId("test-email-result")).toHaveText("لم تُرسل: لا يرسل هذا الخادم رسائل بريد بعد.");
```

2. Add these tests at the end of the file:

```ts
test("an Admin sends themselves a test email; with EMAIL_MODE=log it's only kept (M5b)", async ({ page, context }) => {
  await signInWithCookie(context, "dev_admin");
  const before = await readOutbox(page);
  await page.goto("/en/notifications");
  await page.getByTestId("test-email-send").click();
  const result = page.getByTestId("test-email-result");
  await expect(result).toHaveAttribute("data-state", "log");
  await expect(result).toHaveText("Not sent: this server doesn't send emails yet.");
  await expect(page.getByTestId("test-email-send")).toHaveText("Send me a test email");

  const sent = newEmails(before, await readOutbox(page));
  expect(sent.map((email) => email.to)).toEqual(["admin@example.com"]);
  expect(sent[0].subject).toBe("Articles AI test email · رسالة تجريبية من Articles AI");
  expect(sent[0].text).toContain("This is a test from Articles AI. If you can read this, the dashboard's emails work.");
  expect(sent[0].html).toContain('<div dir="rtl" lang="ar"');

  await page.getByTestId("test-email-send").click(); // each press is a new email
  await expect.poll(async () => newEmails(before, await readOutbox(page)).length).toBe(2);
});

test("a Reviewer has no test-email button (M5b)", async ({ page, context }) => {
  await signInWithCookie(context, "dev_reviewer");
  await page.goto("/en/notifications");
  await expect(page.getByTestId("email-status")).toBeVisible();
  await expect(page.getByTestId("test-email-send")).toHaveCount(0);
});
```

- [ ] **Step 2: Run the e2e file and watch it fail**

The production build type-checks test files, so this runs before any unit test imports `renderTestEmail` or `sendTestEmailAction`.

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
pnpm e2e tests/e2e/notifications.spec.ts 2>&1 | tail -20
```

Expected: FAIL.
- The Arabic test and "an Admin sends themselves a test email…" fail: they time out waiting for `test-email-send`.
- "a Reviewer has no test-email button" **passes already**, since no one has the button yet. It guards Step 8's Admin check.
- The other three tests pass.

- [ ] **Step 3: Write the failing unit tests**

Create `tests/unit/test-email.test.ts`:

```ts
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
```

- [ ] **Step 4: Run them and watch them fail**

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
pnpm vitest run tests/unit/test-email.test.ts 2>&1 | tail -15
```

Expected: FAIL.
- The action cases fail with `sendTestEmailAction is not a function`.
- `renderTestEmail is not a function`.
- `Cannot read properties of undefined (reading 'failed')`.

- [ ] **Step 5: Add the messages**

Write this script and run it from the repo root. The message files are canonical `JSON.stringify(…, null, 2)` output (checked), so rewriting them changes only the added keys.

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
SCRATCH=$(mktemp -d)
cat > "$SCRATCH/m5b-messages.mjs" <<'EOF'
import fs from "node:fs";

const ADD = {
  en: {
    email: {
      subject: "Articles AI test email",
      heading: "Test email",
      body: "This is a test from Articles AI. If you can read this, the dashboard's emails work.",
      footer: "Sent because you pressed Send me a test email on the Email notifications page.",
    },
    notifications: {
      button: "Send me a test email",
      sending: "Sending…",
      sent: "Sent to {email}. It can take a minute to arrive. Check Junk too.",
      logMode: "Not sent: this server doesn't send emails yet.",
      failed: {
        login: "The mail server refused the login.",
        connect: "Couldn't reach the mail server.",
        tls: "The secure connection to the mail server failed.",
        refused: "The mail server refused the sender or the recipient.",
        other: "The email couldn't be sent.",
      },
    },
  },
  ar: {
    email: {
      subject: "رسالة تجريبية من Articles AI",
      heading: "رسالة تجريبية",
      body: "هذه رسالة تجريبية من Articles AI. إذا كنت تقرأ هذا، فرسائل لوحة التحكم تعمل.",
      footer: "أُرسلت لأنك ضغطت «أرسل لي رسالة تجريبية» في صفحة إشعارات البريد.",
    },
    notifications: {
      button: "أرسل لي رسالة تجريبية",
      sending: "جارٍ الإرسال…",
      sent: "أُرسلت إلى {email}. قد يستغرق وصولها دقيقة. تحقّق من مجلد الرسائل غير المرغوب فيها أيضًا.",
      logMode: "لم تُرسل: لا يرسل هذا الخادم رسائل بريد بعد.",
      failed: {
        login: "رفض خادم البريد تسجيل الدخول.",
        connect: "تعذّر الوصول إلى خادم البريد.",
        tls: "تعذّر الاتصال الآمن بخادم البريد.",
        refused: "رفض خادم البريد المرسِل أو المستلِم.",
        other: "تعذّر إرسال الرسالة.",
      },
    },
  },
};

for (const [locale, { email, notifications }] of Object.entries(ADD)) {
  const file = `messages/${locale}.json`;
  const messages = JSON.parse(fs.readFileSync(file, "utf8"));
  messages.Email.test = email;
  messages.Notifications.testEmail = notifications;
  fs.writeFileSync(file, `${JSON.stringify(messages, null, 2)}\n`);
}
EOF
node "$SCRATCH/m5b-messages.mjs" && git diff --stat messages/
```

Expected: `messages/ar.json` and `messages/en.json` each gain about 22 lines, with no other changes.

- [ ] **Step 6: Render the test email, sharing the notification emails' layout**

In `src/lib/notifications/render.ts`, replace everything from `/** Design §10: one email per batch, English then Arabic …` to the end of the file with:

```ts
/** One language's half of an email. */
type Part = {
  locale: Locale;
  subject: string;
  heading: string;
  lines: { text: string; href: string | null }[];
  footer: string;
  settings: string | null;
};

/** Design §10: one email, English then Arabic (right to left), as HTML and as plain text. */
function compose(parts: Part[]): { subject: string; html: string; text: string } {
  const link = (text: string, href: string | null, style = "") => (href ? `<a href="${escapeHtml(href)}"${style}>${escapeHtml(text)}</a>` : escapeHtml(text));
  const html = [
    '<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1f2937">',
    parts
      .map(
        (part) =>
          `<div dir="${part.locale === "ar" ? "rtl" : "ltr"}" lang="${part.locale}" style="margin-bottom:24px">` +
          `<p><strong>${escapeHtml(part.heading)}</strong></p>` +
          `<ul>${part.lines.map((line) => `<li>${link(line.text, line.href)}</li>`).join("")}</ul>` +
          `<p style="color:#6b7280;font-size:13px">${link(part.footer, part.settings, ' style="color:#6b7280"')}</p></div>`,
      )
      .join('<hr style="border:none;border-top:1px solid #e5e7eb">'),
    "</body></html>",
  ].join("");
  const text = parts
    .map((part) =>
      [part.heading, "", ...part.lines.map((line) => `- ${line.text}${line.href ? `: ${line.href}` : ""}`), "", `${part.footer}${part.settings ? ` ${part.settings}` : ""}`].join("\n"),
    )
    .join("\n\n———\n\n");
  return { subject: parts.map((part) => part.subject).join(" · "), html, text };
}

/** Design §10: one email per batch, linking to both languages of the dashboard. */
export function renderBatch(batch: Batch, origin: string | null): { subject: string; html: string; text: string } {
  return compose(
    LOCALES.map((locale) => {
      const t = translator(locale, "Email");
      const href = (path: string) => (origin ? `${origin}/${locale}${path}` : null);
      const lines = linesFor(batch, locale).map((line) => ({ text: line.text, href: href(line.path) }));
      const count = batch.audience === "reviewers" ? batch.items.length : lines.length;
      return {
        locale,
        subject: t(`subject.${batch.audience}`, { count, n: String(count) }),
        heading: t(`heading.${batch.audience}`),
        lines,
        footer: t("footer"),
        settings: href("/notifications"),
      };
    }),
  );
}

/** M5b: an Admin's test email, in the notification emails' format, so it shows how those arrive. */
export function renderTestEmail(): { subject: string; html: string; text: string } {
  return compose(
    LOCALES.map((locale) => {
      const t = translator(locale, "Email.test");
      return { locale, subject: t("subject"), heading: t("heading"), lines: [{ text: t("body"), href: null }], footer: t("footer"), settings: null };
    }),
  );
}
```

- [ ] **Step 7: Write the action**

In `src/app/[locale]/(app)/notifications/actions.ts`:

1. Add `import { randomUUID } from "node:crypto";` as the first import after `"use server";`.
2. Change the session import to `import { requirePermission, requireSession } from "@/lib/auth/session";`.
3. Add these imports after `import { getStore } from "@/lib/db";`:

```ts
import { MailError } from "@/lib/notifications/mail-error";
import { mailerFor } from "@/lib/notifications/mailer";
import { renderTestEmail } from "@/lib/notifications/render";
import { servicesEnv } from "@/lib/services-env";
```

4. Add at the end of the file:

```ts
/**
 * M5b: an Admin emails themselves a test, at once, to check the mail server. It takes no address, so it can only reach
 * the signed-in Admin. Each press is a new email with its own id (the caller's key is checked and not used).
 */
export async function sendTestEmailAction(input: { locale: string; idempotencyKey: string }): Promise<ActionResult<{ to: string; sent: boolean }>> {
  const parsed = z.object({ locale: Locale, idempotencyKey: IdempotencyKey }).safeParse(input);
  if (!parsed.success) return INVALID;
  const session = await requirePermission(parsed.data.locale, "settings.manage");
  const env = servicesEnv();
  try {
    await mailerFor(env).send({ ...renderTestEmail(), to: session.email, idempotencyKey: `test-${randomUUID()}` });
  } catch (error) {
    if (!(error instanceof MailError)) throw error;
    return { ok: false, error: { status: 502, code: "mail_failed", message: error.message, details: { source: "dashboard", kind: error.kind, reply: error.reply } } };
  }
  // With EMAIL_MODE=log the email only went to the outbox (kept for the dev outbox with test logins).
  return { ok: true, data: { to: session.email, sent: env.emailMode === "smtp" } };
}
```

- [ ] **Step 8: Write the button, and show it to Admins**

Create `src/components/notifications/test-email-button.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { sendTestEmailAction } from "@/app/[locale]/(app)/notifications/actions";
import { ActionError } from "@/components/actions/action-error";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/actions/result";
import { useEngineAction } from "@/lib/actions/use-engine-action";
import { MAIL_ERROR_KINDS } from "@/lib/notifications/mail-error";

type Outcome = ActionResult<{ to: string; sent: boolean }>;

/** M5b: an Admin emails themselves a test, to check that this server's emails work. */
export function TestEmailButton({ locale }: { locale: string }) {
  const t = useTranslations("Notifications.testEmail");
  const send = useEngineAction(sendTestEmailAction);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  async function press() {
    setOutcome(null);
    setOutcome(await send.run({ locale }));
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button variant="outline" data-testid="test-email-send" disabled={send.pending} onClick={() => void press()}>
          {send.pending ? t("sending") : t("button")}
        </Button>
      </div>
      {outcome && <TestEmailResult outcome={outcome} />}
    </div>
  );
}

function TestEmailResult({ outcome }: { outcome: Outcome }) {
  const t = useTranslations("Notifications.testEmail");
  if (outcome.ok) {
    return (
      <p role="status" data-testid="test-email-result" data-state={outcome.data.sent ? "sent" : "log"} className={outcome.data.sent ? "text-ok-fg" : "text-muted-foreground"}>
        {outcome.data.sent ? t("sent", { email: outcome.data.to }) : t("logMode")}
      </p>
    );
  }
  if (outcome.error.code !== "mail_failed") return <ActionError error={outcome.error} />;
  const kind = MAIL_ERROR_KINDS.find((each) => each === outcome.error.details?.kind) ?? "other";
  const reply = outcome.error.details?.reply;
  return (
    <p role="alert" data-testid="test-email-result" data-state="failed" data-kind={kind} className="rounded-md bg-bad-bg px-3 py-2 text-sm text-bad-fg">
      {t(`failed.${kind}`)}
      {typeof reply === "string" && reply ? (
        <>
          {" "}
          <bdi>({reply})</bdi>
        </>
      ) : null}
    </p>
  );
}
```

In `src/components/notifications/notifications-view.tsx`:

1. Add these imports:

```ts
import { can } from "@/lib/auth/roles";
import { TestEmailButton } from "./test-email-button";
```

2. Add this line right after the log-mode paragraph's closing `)}`, inside `CardContent`:

```tsx
        {can(session.role, "settings.manage") && <TestEmailButton locale={locale} />}
```

- [ ] **Step 9: Run the unit tests and watch them pass**

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
pnpm vitest run tests/unit/test-email.test.ts tests/unit/notifications.test.ts tests/unit/messages.test.ts tests/unit/notification-prefs.test.ts 2>&1 | tail -8
pnpm typecheck 2>&1 | tail -5
```

Expected:
- PASS, all four files. `notifications.test.ts`'s rendering cases still pass, which shows `renderBatch` is unchanged.
- No type errors.

- [ ] **Step 10: Run the e2e file and watch it pass**

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
pnpm e2e tests/e2e/notifications.spec.ts 2>&1 | tail -12
```

Expected: PASS, 6 tests.

- [ ] **Step 11: Commit**

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
RC=0; pnpm lint >/dev/null 2>&1 || RC=$?
if [ $RC -eq 0 ]; then
  git add messages/en.json messages/ar.json src/lib/notifications/render.ts "src/app/[locale]/(app)/notifications/actions.ts" src/components/notifications/test-email-button.tsx src/components/notifications/notifications-view.tsx tests/unit/test-email.test.ts tests/e2e/notifications.spec.ts
  git commit -m "feat(notifications): Admins can send themselves a test email from the Email notifications page (M5b)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
else echo "lint failed: RC=$RC"; fi
```

Task test command: `pnpm vitest run tests/unit/test-email.test.ts tests/unit/notifications.test.ts tests/unit/messages.test.ts tests/unit/notification-prefs.test.ts`

---

### Task 5: The README, a real server build against a fake mail server, and the full checks

**Files:**
- Modify: `README.md`
- Test:
  - a standalone smoke run: a preview build started through `deploy/cpanel/app.cjs` with `EMAIL_MODE=smtp`, against a fake mail server on this Mac
  - the real cPanel build
  - the full suites

**Interfaces:**
- Consumes: everything above. The smoke run presses the real button (`test-email-send`, `test-email-result`) and calls the real cron route.
- Produces: the README for a new client's email setup. The smoke run proves the bundled nodemailer works in the standalone server.

- [ ] **Step 1: Update the README**

In `README.md`:

1. Replace the whole item `2. **Email:** in Resend, add the sending domain …` (its three sub-bullets included) with:

```markdown
2. **Email:** the client's own mail server, over SMTP.
   - **On a cPanel host:**
     - cPanel → **Email Accounts**: create a mailbox on the dashboard's own subdomain (for Fakher & Co, `notifications@dashboard.fakhernco.com`).
     - cPanel → **Email Deliverability** → that subdomain: add the suggested **SPF** and **DKIM** records where the domain's DNS lives (Cloudflare for Fakher & Co).
     - Change nothing for the main domain: its email (Microsoft 365 for Fakher & Co) stays as it is.
   - **Settings:**
     - `EMAIL_MODE=smtp`
     - `SMTP_HOST`: `localhost` on cPanel
     - `SMTP_PORT`: default 587
     - `SMTP_USER`: the mailbox's address
     - `SMTP_PASSWORD`, in single quotes (`'…'`): in the settings file an unquoted `#` starts a comment
     - `EMAIL_FROM`, for example `Articles AI <notifications@dashboard.fakhernco.com>`
   - **TLS:** on the same machine (`localhost`) the connection doesn't use TLS, since it never leaves the server. Any other host must offer TLS with a valid certificate.
   - **Check it:** an Admin presses **Send me a test email** on the Email notifications page.
```

2. In item `3. **Cron:**`, replace its text with:

```markdown
3. **Cron:** set `CRON_SECRET` (a long random string). The host calls `/api/cron/notifications` every 15 minutes: on cPanel, a cron job (see "Hosting on cPanel"). One run sends at a time: a run that starts while another is sending answers `{ "skipped": true }`. `vercel.json` holds the same schedule for Vercel, which is no longer the hosting path.
```

3. In "Hosting on cPanel" → One-time setup → item 4, replace the sub-bullet that names `WEBHOOK_ENCRYPTION_KEY`, `EMAIL_MODE` and `CRON_SECRET` with:

```markdown
   - `WEBHOOK_ENCRYPTION_KEY` and `CRON_SECRET`
   - `EMAIL_MODE=smtp`, the `SMTP_` settings and `EMAIL_FROM` (see "Database, webhook and email")
```

4. Replace the preview bullet line `  - The preview stores the test users' data in the same MySQL database.` with:

```markdown
  - The preview keeps its data in memory (`DB_MODE=memory`), so it never touches the live database.
```

5. Replace the whole "Email schedule" bullet (its three lines, ending with the sentence about `vercel.json`'s cron) with:

```markdown
- **Email schedule:** cPanel → **Cron Jobs**, every 15 minutes (`*/15 * * * *`). The command reads the secret from the settings file, so it's never typed into cPanel:

      curl -fsS -H "Authorization: Bearer $(sed -n 's/^CRON_SECRET=//p' ~/dashboard-shared/settings.env)" https://dashboard.fakhernco.com/api/cron/notifications > /dev/null

  `vercel.json`'s cron applies only on Vercel.
```

6. Add at the end of the file:

```markdown
## Decisions in M5b (own email)

- **The client's own mail server over SMTP instead of Resend,** so a copy depends on no outside email service. Any SMTP server works through five settings. On cPanel it's the server's own mail system, with a mailbox on the dashboard's subdomain.
- **Only the dashboard's subdomain gets email settings.** The main domain's mail (Microsoft 365 for Fakher & Co) and its DNS records stay as they are.
- **No TLS on the same machine, TLS required elsewhere.** cPanel's certificate doesn't name `localhost`, and a connection to `localhost` never leaves the server. Any other host must offer TLS with a valid certificate, or nothing is sent.
- **One notification run at a time:**
  - Resend dropped a repeated email by its idempotency key; a mail server delivers it. So the cron's flush takes the MySQL lock `articles_ai_flush:<database>`, and a run that finds it taken sends nothing.
  - As before, each delivery is recorded right after it's sent.
- **Failed sends are logged with their kind and the server's reply,** never with the email or the password: `Notification email failed (login): 535 …`. They're retried on the next run. A batch still stops waiting for someone after a day.
- **The test email** goes only to the Admin who presses the button, at once, in the notification emails' format (English then Arabic).
- **Headers:** each email's `Message-ID` comes from its idempotency key, and `Auto-Submitted: auto-generated` keeps out-of-office replies away.
```

- [ ] **Step 2: Commit the README**

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
grep -n -i "resend" README.md
RC=0; pnpm lint >/dev/null 2>&1 || RC=$?
if [ $RC -eq 0 ]; then
  git add README.md
  git commit -m "docs: README — email through the client's own mail server, the cron job reads its secret, preview on memory (M5b)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
else echo "lint failed: RC=$RC"; fi
```

Expected: `grep` lists only the M4c decisions' historical lines and the new M5b decision lines, all mentioning Resend as the past. No setup instruction names Resend.

- [ ] **Step 3: Set up the smoke run (a preview build with test logins, sending to a fake mail server)**

The build uses committed code, so everything above must be committed. `dist/` is git-ignored.

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
SMOKE=dist/m5b-smoke; rm -rf "$SMOKE"; mkdir -p "$SMOKE/wrong"
cat > "$SMOKE/settings.env" <<'EOF'
ENGINE_MODE=mock
AUTH_MODE=mock
ALLOW_TEST_LOGINS=1
TWO_FACTOR=off
DB_MODE=memory
EMAIL_MODE=smtp
SMTP_HOST=localhost
SMTP_PORT=2525
SMTP_USER=notifications@dashboard.example.com
SMTP_PASSWORD='sm#ke"pa$s=1'
EMAIL_FROM=Articles AI <notifications@dashboard.example.com>
CRON_SECRET=smoke
EOF
sed "s/^SMTP_PASSWORD=.*/SMTP_PASSWORD='nope#1'/" "$SMOKE/settings.env" > "$SMOKE/wrong/settings.env"
cat > "$SMOKE/fake-smtp.cjs" <<'EOF'
// The smoke run's mail server: the login from settings.env, and one JSON line per email received.
const fs = require("node:fs");
const path = require("node:path");
const { SMTPServer } = require("smtp-server");
const { simpleParser } = require("mailparser");
const out = path.join(__dirname, "received.jsonl");
new SMTPServer({
  logger: false,
  allowInsecureAuth: true,
  disabledCommands: ["STARTTLS"],
  onAuth(auth, _session, done) {
    if (auth.username === "notifications@dashboard.example.com" && auth.password === 'sm#ke"pa$s=1') done(null, { user: auth.username });
    else done(Object.assign(new Error("Incorrect authentication data"), { responseCode: 535 }));
  },
  onData(stream, session, done) {
    simpleParser(stream).then((mail) => {
      const line = { login: session.user, to: mail.to && mail.to.text, subject: mail.subject, messageId: mail.messageId, autoSubmitted: mail.headers.get("auto-submitted") };
      fs.appendFileSync(out, JSON.stringify(line) + "\n");
      done();
    }, done);
  },
}).listen(2525, "127.0.0.1", () => console.log("fake SMTP on 2525"));
EOF
cat > "$SMOKE/press.cjs" <<'EOF'
// Signs in as the test Admin, presses Send me a test email, and prints the result's state and text.
const { chromium } = require("@playwright/test");
(async () => {
  const base = "http://127.0.0.1:3300";
  const browser = await chromium.launch();
  const context = await browser.newContext();
  await context.addCookies([{ name: "dev_session", value: "dev_admin", url: base }]);
  const page = await context.newPage();
  await page.goto(`${base}/en/notifications`);
  await page.getByTestId("test-email-send").click();
  const result = page.getByTestId("test-email-result");
  await result.waitFor({ timeout: 30_000 });
  console.log(`${await result.getAttribute("data-state")} | ${await result.innerText()}`);
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
EOF
ls "$SMOKE" "$SMOKE/wrong"
```

Expected: `fake-smtp.cjs press.cjs settings.env wrong`, then `settings.env`.

- [ ] **Step 4: Build the preview, send a test email, and run the cron**

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
SMOKE=$PWD/dist/m5b-smoke; SHA=$(git rev-parse --short HEAD)
CPANEL_SETTINGS="$SMOKE/settings.env" scripts/cpanel-build.sh > "$SMOKE/build.log" 2>&1; tail -1 "$SMOKE/build.log"
(NODE_PATH=$PWD/node_modules node "$SMOKE/fake-smtp.cjs" > "$SMOKE/smtp.log" 2>&1 &)
(cd "dist/cpanel/$SHA-preview" && DASHBOARD_SHARED="$SMOKE" PORT=3300 node app.cjs > /dev/null 2>&1 &)
for i in $(seq 1 30); do curl -s -o /dev/null http://127.0.0.1:3300/en/sign-in && break; sleep 1; done
NODE_PATH=$PWD/node_modules node "$SMOKE/press.cjs"
cat "$SMOKE/received.jsonl"
curl -s -H "Authorization: Bearer smoke" http://127.0.0.1:3300/api/cron/notifications; echo
grep -c 'sm#ke\|Error' "$SMOKE/app.log"
kill $(lsof -ti tcp:3300)
```

Expected:
- **Build:** `Built …/dist/cpanel/<sha>-preview (…)`.
- **Press:** `sent | Sent to admin@example.com. It can take a minute to arrive. Check Junk too.`
- **`received.jsonl`:** one line with:
  - `"login":"notifications@dashboard.example.com"`
  - `"to":"admin@example.com"`
  - `"subject":"Articles AI test email · رسالة تجريبية من Articles AI"`
  - a `messageId` of `<test-…@dashboard.example.com>`
  - `"autoSubmitted":"auto-generated"`
- **Cron:** `{"ok":true,"data":{"batches":0,"emails":0,"failed":0}}`.
- **Log check:** `0`. The password is never logged, and there are no errors.

These two checks prove that the password, quoted, survived `app.cjs`'s `loadEnvFile` (Review Focus 1), and that the bundled nodemailer runs in the standalone server.

If the press fails and `app.log` shows a module error from nodemailer, Next's bundling broke it:
1. Add `serverExternalPackages: ["nodemailer"],` after the `output:` line in `next.config.ts`.
2. Commit it.
3. Build and run again.
4. Ledger a ruling.

- [ ] **Step 5: The same build with a wrong password: the failure message**

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
SMOKE=$PWD/dist/m5b-smoke; SHA=$(git rev-parse --short HEAD)
(cd "dist/cpanel/$SHA-preview" && DASHBOARD_SHARED="$SMOKE/wrong" PORT=3300 node app.cjs > /dev/null 2>&1 &)
for i in $(seq 1 30); do curl -s -o /dev/null http://127.0.0.1:3300/en/sign-in && break; sleep 1; done
NODE_PATH=$PWD/node_modules node "$SMOKE/press.cjs"
grep -c 'nope#1' "$SMOKE/wrong/app.log"
kill $(lsof -ti tcp:3300) $(lsof -ti tcp:2525)
wc -l < "$SMOKE/received.jsonl"
```

Expected:
- **Press:** `failed | The mail server refused the login. (535 Incorrect authentication data)`.
- **Password check:** `0`.
- **Received count:** still `1`.

- [ ] **Step 6: The real (Clerk) cPanel build still builds**

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
scripts/cpanel-build.sh > dist/m5b-smoke/clerk-build.log 2>&1; echo "exit $?"; tail -1 dist/m5b-smoke/clerk-build.log
```

Expected: `exit 0`, then `Built …/dist/cpanel/<sha> (…)`. The live `.env.cpanel` still says `EMAIL_MODE=log` until going live, and the build reads no email settings.

- [ ] **Step 7: The full checks**

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
pnpm lint 2>&1 | tail -3
pnpm typecheck 2>&1 | tail -3
pnpm test > dist/m5b-smoke/unit.log 2>&1; echo "unit exit $?"; tail -6 dist/m5b-smoke/unit.log
pnpm e2e > dist/m5b-smoke/e2e.log 2>&1; echo "e2e exit $?"; tail -6 dist/m5b-smoke/e2e.log
grep -rln 'from "resend"\|require("resend")' src tests || echo "no resend imports"
```

Expected:
- lint and typecheck print no errors.
- `unit exit 0` and `e2e exit 0`, with every test passing.
- `no resend imports`.

Task test command: `pnpm test`

---

## Going live (with the user, after the final review and the merge)

From the spec's "Going live on Fakher & Co's server". Nothing here touches `fakhernco.com`'s mail.

**The user:**
1. cPanel → **Email Accounts** → **Create**:
   - domain `dashboard.fakhernco.com`
   - username `notifications`
   - a strong password, generated, without a `'` (it goes in single quotes)
2. cPanel → **Email Deliverability** → `dashboard.fakhernco.com` → the suggested **SPF** and **DKIM** records. Add both in **Cloudflare** DNS, as TXT records set to **DNS only**:
   - on `dashboard`
   - on `default._domainkey.dashboard`

   I give the exact fields from the cPanel page. Press nothing on `fakhernco.com`'s row.
3. cPanel → **Cron Jobs**: every 15 minutes, the command from the README.
4. Enter the mailbox password in the hidden password box. My script writes it as `SMTP_PASSWORD='…'` into `.env.cpanel` and never prints it.

**Me:**
1. **Read-only checks before the release:**
   - **SPF:** the published record (`dig +short TXT dashboard.fakhernco.com`) covers the server's IPv4 address `158.220.82.191`. If the server has an IPv6 address (`dig +short AAAA qserver.quantum1st.com`), it must cover that too.
   - **Routing:** through the SSH tunnel to `localhost:587`, an SMTP session logs in as the new mailbox and sends `MAIL FROM` and `RCPT TO:<someone@fakhernco.com>`, then `QUIT`, with no `DATA`. A `250` means the server passes `@fakhernco.com` mail on to Microsoft 365. A `550 No such user` would mean it treats the domain as local; then stop and tell the user, changing nothing.
   - **DNS unchanged:** `fakhernco.com`'s MX and SPF answers match the ones recorded on 2026-10-26.
2. **Settings and release:**
   - `.env.cpanel`: `EMAIL_MODE=smtp`, `SMTP_HOST=localhost`, `SMTP_PORT=587`, `SMTP_USER=notifications@dashboard.fakhernco.com`, the quoted password, and `EMAIL_FROM=Articles AI <notifications@dashboard.fakhernco.com>`.
   - Delete any `RESEND_API_KEY` line.
   - Run `scripts/cpanel-build.sh`, then `scripts/cpanel-deploy.sh --settings`.
3. **The user presses Send me a test email.** It arrives at the Admin's Gmail. There, "Show original" must show SPF **PASS** and DKIM **PASS**.
4. **The cron job:** after its next run, `app.log` shows no `Notification email failed` lines.
5. **Backup:** refresh the encrypted settings backup in iCloud Drive with the new `.env.cpanel`.
6. **Later (M5c):** delivery to Microsoft 365 inboxes is checked when the first Fakher colleague has an account. If Microsoft files it as Junk, a Microsoft 365 admin marks the sender as safe. Nothing in DNS changes.
