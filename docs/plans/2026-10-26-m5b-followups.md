# M5b follow-ups (own email)

## Going live on dashboard.fakhernco.com

The steps are in the plan's "Going live" section. Notes from the final review:

- **The mailbox password's quotes:** Node's settings reader keeps a single-quoted value as written, except that a `'` ends it. When writing `SMTP_PASSWORD` into `.env.cpanel`:
  - use single quotes when the password has no `'`
  - otherwise use backticks (`` SMTP_PASSWORD=`…` ``), which keep `'`, `"` and `#`
  - if it has both `'` and a backtick, ask for a new password
- **IPv6:** check whether the server has a global IPv6 address (`dig +short AAAA qserver.quantum1st.com`). It decides whether the SPF record needs the IPv6 address. Since the final-review fix, a refused connection on `localhost` shows its reason either way.
- **The cron command** reads `CRON_SECRET` from the settings file as written. Keep that line unquoted (for example `openssl rand -hex 32`), and keep it in the file once.

## Deferred minor findings (final review)

- **A password containing `'`:** the README and `.env.example` say "single quotes" only. Add: "if it contains a `'`, use backticks".
- **Releasing the MySQL lock** (`src/lib/db/mysql-store.ts`, `exclusive`):
  - If `RELEASE_LOCK` throws, its error replaces the run's own result.
  - The pooled session, if still alive, keeps the lock until MySQL's `wait_timeout` (8 hours by default), so cron runs are skipped until then.
  - Fix: destroy the connection after a failed release (closing it frees the lock), and log the failure instead of throwing it.
- **The README's cron command** sends a quoted or duplicated `CRON_SECRET` as it is, so every run would get 401, silently. Add the "keep it unquoted" note to the README.

## Carry into later milestones

- **M5c (own sign-in):** invitations and password resets go through `mailerFor(servicesEnv())` like the test email. A send failure is a `MailError` with a `kind` and a `reply`, and the test email's messages show how to present it.
- **Another client:** any SMTP server works through `EMAIL_MODE=smtp` and the five settings. A host other than `localhost` must offer TLS with a valid certificate (implicit on 465, STARTTLS elsewhere).
