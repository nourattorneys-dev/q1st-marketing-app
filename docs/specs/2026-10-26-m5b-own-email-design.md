# M5b: the dashboard's own email (Resend → the client's mail server)

Status: approved in conversation on 2026-10-26, written for review.

## Why

The dashboard will be reused for other clients, one copy per client, with as few outside services as possible (M5a spec, "Why"). M5b removes Resend: the dashboard's emails go out through the client's own mail server. M5c (own sign-in) then sends invitations and password resets through the same mailer.

## Goal

Every copy of the dashboard sends its emails over SMTP to a mail server the client controls. For Fakher & Co that's the cPanel server's own mail system (Exim), with the mailbox `notifications@dashboard.fakhernco.com`. An Admin can send themselves a test email from the dashboard at any time. Nothing in the dashboard depends on Resend afterwards.

**Not in scope:** sign-in (M5c), and any change to Fakher & Co's company email (see "Microsoft 365 stays as it is").

## What exists today

- `src/lib/notifications/mailer.ts`:
  - `Email` (`to`, `subject`, `html`, `text`, `idempotencyKey`) and `Mailer.send(email)`
  - `createLogMailer()` (`EMAIL_MODE=log`: kept for the dev outbox, last 100)
  - `createResendMailer()` (`EMAIL_MODE=resend`; Resend's idempotency key drops a repeated send)
  - `mailerFor(env)`
- `src/lib/notifications/flush.ts` sends due batches (design §10): one email per person per batch, with only the items that person hasn't had. Each send is recorded (`recordDelivery`) right after it succeeds. A batch is given up on after a day of failing for someone.
- `src/lib/notifications/render.ts` renders a batch as one email, English then Arabic (right to left).
- `src/lib/services-env.ts`: `EMAIL_MODE=log|resend`, `RESEND_API_KEY`, `EMAIL_FROM`.
- `/api/cron/notifications` runs the flush. On cPanel it's meant to be called by a cron job every 15 minutes (README), not set up yet.
- The live site runs `EMAIL_MODE=log`: it has never sent an email, so there is nothing to move.

**Found on the server on 2026-10-26:**
- Exim 4.100 answers on `localhost:587`. It offers `AUTH PLAIN LOGIN` and STARTTLS. Its certificate names `*.qserver.quantum1st.com` hosts, not `localhost`.
- Connecting from the server to `smtp.office365.com:587` got no answer, so the client's mail must go through the server's own mail system.
- `fakhernco.com` mail is Microsoft 365. Its MX points to `outlook.com`, and its SPF allows only Microsoft (`-all`). It has no DMARC record, and DNS is on Cloudflare.

## Design

### Microsoft 365 stays as it is (the user's rule)

The dashboard's email lives only on the subdomain `dashboard.fakhernco.com`. Nothing about `fakhernco.com`'s email changes:
- its MX, SPF, DKIM and DMARC records in Cloudflare
- the mailboxes in Microsoft 365
- cPanel's **Email Routing** for `fakhernco.com`, which must stay on Microsoft (remote). The go-live checks it and changes nothing.
- On cPanel's **Email Deliverability** page, nothing is pressed for `fakhernco.com`, only for `dashboard.fakhernco.com`.

### Settings

- `EMAIL_MODE=log|smtp`, default `log`.
- `resend` is no longer accepted. It fails with a message that names `smtp`, as `DB_MODE=neon` does since M5a.
- `EMAIL_MODE=smtp` needs:
  - `SMTP_HOST`
  - `SMTP_PORT` (default 587)
  - `SMTP_USER` and `SMTP_PASSWORD`, kept as separate lines so a password with symbols needs no encoding
  - `EMAIL_FROM`, in the form `Articles AI <notifications@dashboard.fakhernco.com>` or a bare address
- A missing value, a port outside 1–65535, or an `EMAIL_FROM` without exactly one address is refused with a clear message.
- No message ever repeats `SMTP_PASSWORD`.
- `RESEND_API_KEY` is no longer read.

For Fakher & Co: `SMTP_HOST=localhost`, `SMTP_PORT=587`, `SMTP_USER=notifications@dashboard.fakhernco.com`, `SMTP_PASSWORD` (the mailbox's password) and `EMAIL_FROM=Articles AI <notifications@dashboard.fakhernco.com>`.

### The SMTP mailer

`createSmtpMailer(settings)` in `mailer.ts`, on `nodemailer` (the one new runtime package):
- **Encryption:**
  - On the same machine (`SMTP_HOST` is `localhost`, `127.0.0.1` or `::1`), the connection never leaves the server, so TLS isn't used. The server's certificate doesn't name `localhost` anyway.
  - Any other host must use TLS with a valid certificate, or nothing is sent: implicit TLS on port 465, required STARTTLS on any other port.
- **Sender:**
  - the `From` header is `EMAIL_FROM`
  - the envelope sender is its address
  - the login is `SMTP_USER` / `SMTP_PASSWORD`
- **Headers:**
  - `Message-ID: <{idempotencyKey}@{the sender's domain}>`, so a repeated send of the same email carries the same id
  - `Auto-Submitted: auto-generated`, so auto-replies and out-of-office messages aren't sent back
- **Body:** both the HTML and the plain-text versions, as today. Subjects and bodies with Arabic are encoded so they arrive intact.
- **Time limits:**
  - 10 seconds to connect
  - 10 seconds for the server's greeting
  - 30 seconds without progress during a send
  
  Then the send fails.
- **Failures:** a failed send throws a `MailError`:
  - **`kind`** is one of:
    - `login` (the server refused the login)
    - `connect` (couldn't reach the server, including timeouts)
    - `tls`
    - `refused` (sender or recipient refused)
    - `other`
  - **`reply`** is the server's reply line when it sent one, for example `535 Incorrect authentication data`.
  
  Neither carries the password.
- One connection per email, closed afterwards. The volume is a handful of emails per run.

`mailerFor(env)` returns the SMTP mailer for `EMAIL_MODE=smtp`, the log mailer otherwise.

### Never sending twice

Resend dropped a repeated idempotency key; an SMTP server doesn't. Two things keep each person to one email per item:
- **As today:** each delivery is recorded right after its send succeeds. A retried batch sends each person only the items they haven't had.
- **New: one notification run at a time.** `AppStore` gains `exclusive<T>(name, run): Promise<{ ran: true; value: T } | { ran: false }>`.
  - **MySQL:** `GET_LOCK(<name>:<database>, 0)` on a dedicated pool connection, released afterwards, even after an error. The lock name includes the database, so two copies on one MySQL server don't block each other.
  - **Memory store:** a flag inside the process.
  - **If another run holds the lock,** this run sends nothing and returns `{ skipped: true }`. The running one does the work.
  - `/api/cron/notifications` wraps the flush in `exclusive("articles_ai_flush", …)`.

A failed send is logged as `Notification email failed (<kind>): <reply>`, never with the password or the email's content. It's retried on the next run. The give-up after a day stays: a batch can't wait forever for one unreachable address. Its comment no longer refers to Resend.

### The test email (Admins)

- **Where:** the **Notifications** page gains a **Send me a test email** button. Only Admins see it.
- **What it does:**
  - A server action checks that the person is an Admin, then sends one email right away to the signed-in Admin's own address, not through the 15-minute schedule.
  - The action takes no address, so it can't email anyone else.
  - The email is short and uses the notification emails' format, English then Arabic (right to left): "This is a test from Articles AI. If you can read this, the dashboard's emails work."
  - Each press is a new email with a new random id.
- **What the Admin sees:**
  - **While sending:** the button shows "Sending…" and can't be pressed again.
  - **Sent:** "Sent to {email}. It can take a minute to arrive. Check Junk too."
  - **Failed:** a sentence for the `kind`, plus the server's reply in parentheses when there is one:

    | `kind` | Sentence |
    |---|---|
    | `login` | "The mail server refused the login." |
    | `connect` | "Couldn't reach the mail server." |
    | `tls` | "The secure connection to the mail server failed." |
    | `refused` | "The mail server refused the sender or the recipient." |
    | `other` | "The email couldn't be sent." |

  - **`EMAIL_MODE=log`:** "Not sent: this server doesn't send emails yet." With test logins the email still goes to the dev outbox, so e2e tests can read it.
- **Arabic:** every new message has an Arabic version.

### Removing Resend

- `createResendMailer`, the `resend` package and `RESEND_API_KEY` go.
- `.env.example` and the README describe the SMTP settings and the cPanel mailbox instead.
- **README corrections:**
  - The preview line "The preview stores the test users' data in the same MySQL database" is corrected: since 2026-10-26 the preview uses `DB_MODE=memory`.
  - The cron line no longer asks for the secret to be typed into cPanel. The cron job reads it from the settings file on the server:

    ```
    curl -fsS -H "Authorization: Bearer $(sed -n 's/^CRON_SECRET=//p' ~/dashboard-shared/settings.env)" https://dashboard.fakhernco.com/api/cron/notifications > /dev/null
    ```

### Tests

- **SMTP mailer (unit, no real email):** tests start a fake SMTP server inside the test run, using the dev-only packages `smtp-server` and `mailparser`. Cases:
  - **A sent email** carries:
    - the login
    - `From` / envelope sender
    - `To`
    - the subject and both bodies, with Arabic intact
    - the `Message-ID` from the idempotency key
    - `Auto-Submitted`
  - **A wrong password** gives `MailError` `login` with the server's reply, and the password appears nowhere in the error.
  - **A server that accepts the connection but never greets** gives `connect` within the time limit. The test shortens the limits.
  - **A recipient refused** by the server gives `refused`.
  - **A non-local host without STARTTLS** sends nothing (`tls`).
  - **On `localhost`,** the email is sent without TLS.
- **Settings:**
  - `smtp` needs every value, and the messages name the missing one, never the password.
  - `resend` is refused, naming `smtp`.
  - The port defaults to 587.
  - A bad `EMAIL_FROM` is refused.
- **One run at a time:** contract cases for `exclusive` on both stores (MySQL on the local test database):
  - a second run while the first holds the lock returns `{ ran: false }`
  - the lock is free again after the first finishes, and after it throws
  - two copies of the dashboard on different databases don't block each other
- **Flush:**
  - two cron runs at once send each email once
  - a failed send is logged with its `kind`
- **The test-email action (unit):**
  - Admins only, with no address input
  - sends to the session's address
  - maps each `kind` to its message
  - the log mode gives the "doesn't send emails yet" result
- **e2e (test logins, `EMAIL_MODE=log`):**
  - an Admin presses the button and the email appears in the dev outbox, addressed to them, with the success message
  - a Reviewer doesn't see the button
  - the Arabic page shows the Arabic messages

### Going live on Fakher & Co's server

**The user:**
1. cPanel → **Email Accounts** → Create: domain `dashboard.fakhernco.com`, username `notifications`, a strong password.
2. cPanel → **Email Deliverability** → `dashboard.fakhernco.com` → the suggested **SPF** and **DKIM** records. Add both in **Cloudflare** DNS:
   - TXT on `dashboard`
   - TXT on `default._domainkey.dashboard`
   
   I give the exact fields. Press nothing on `fakhernco.com`'s row.
3. cPanel → **Cron Jobs**: every 15 minutes, the command in the README (it reads the secret from the server's settings file).
4. The mailbox password goes into `.env.cpanel` through the hidden password box, never the chat.

**Me:**
1. **Read-only checks before the release:**
   - Does the SPF record cover every address the server sends from (its IPv4, and its IPv6 if it has one)?
   - Does the server pass emails for `@fakhernco.com` to Microsoft 365? An SMTP session with `RCPT TO` and no `DATA` answers this without sending anything.
2. **Settings:** `.env.cpanel` gets `EMAIL_MODE=smtp` and the SMTP lines. Then `scripts/cpanel-build.sh` and `scripts/cpanel-deploy.sh --settings`.
3. **The user presses Send me a test email.** It arrives at the Admin's sign-in address, a Gmail account. "Show original" there shows SPF and DKIM as PASS.
4. **The cron job:** the next run appears in `app.log` with no errors.
5. Refresh the encrypted settings backup.
6. Delivery to Microsoft 365 inboxes is checked when the first Fakher colleague has an account (M5c invitations). If Microsoft files it as Junk, a Microsoft 365 admin marks the sender as safe. That changes nothing in DNS.

### Other clients

Any SMTP server works through the same five settings. A client with a cPanel server repeats the four user steps on their own `dashboard.<domain>`.

## Risks

- **New server, unknown reputation:** Gmail or Microsoft may file the first emails as Junk. SPF and DKIM on the subdomain, the server's reverse DNS (`qserver.quantum1st.com`), and a low volume all help. The test email shows where it lands before any real notification goes out.
- **Shared server limits:** cPanel caps emails per hour per domain. The dashboard sends a handful per run.
- **Exim on the server is Quantum1st's:** if they change its settings (for example, turning off login on `localhost:587`), the test email shows the server's reply.
- **IPv6:** if the server sends over IPv6 and SPF lists only the IPv4 address, SPF fails. The go-live check covers it.

## Done when

- `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm e2e` pass, and a cPanel build succeeds.
- No file in the repo imports `resend`.
- `dashboard.fakhernco.com` runs `EMAIL_MODE=smtp`, and the go-live steps above are done: the test email reaches the Admin's inbox with SPF and DKIM passing, and the cron job runs.
- `fakhernco.com`'s DNS records and email routing are unchanged.
