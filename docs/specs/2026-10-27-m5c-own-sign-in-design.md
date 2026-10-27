# M5c: the dashboard's own sign-in (Clerk → accounts in the dashboard's database)

Status: approved in conversation on 2026-10-27, written for review.

## Why

The dashboard will be reused for other clients, one copy per client, with as few outside services as possible (M5a spec, "Why"). M5a moved the data to the client's MySQL, and M5b moved email to the client's mail server. M5c removes the last outside service, Clerk, together with "Sign in with Microsoft", which came through Clerk.

The user split the work in two:
- **M5c (this spec):** accounts, signing in, invitations, password resets, the first Admin, and Clerk removed. Two-factor login stays off, as it is on the live site today (Clerk's free plan has none).
- **M5d (next):** two-factor login with an authenticator app and backup codes, required for Admins (design §5, §11).

## Goal

Every copy of the dashboard signs people in by itself, with email and password:
- accounts are stored in its own database (MySQL on a server, memory in tests)
- invitations and password resets go out through its own mailer (M5b)
- nothing in the dashboard depends on Clerk

**Not in scope:**
- two-factor login (M5d)
- signing in with Microsoft or any other outside account
- open sign-up: only invited people get accounts, as today
- copying accounts out of Clerk

## What exists today

- **Settings:** `src/lib/env.ts` parses `AUTH_MODE=mock|clerk` and `TWO_FACTOR=required|off`.
  - `mock` is the test logins (cookie `dev_session`, four test users). It's refused in production builds unless `ALLOW_TEST_LOGINS=1`.
  - The live site runs `AUTH_MODE=clerk` with `TWO_FACTOR=off`.
- **Session:** `src/lib/auth/session.ts` provides:
  - `getSession()` (once per request), `requireSession(locale)`, `requirePermission(locale, permission)`, and `getRole()` (for `/api/jobs`)
  - `type Session = { userId; email; name; role: Role | null; twoFactor }`
  - Roles and permissions (`roles.ts`) are Admin and Reviewer, and are unchanged by M5c.
- **Users:** `src/lib/users/` has `UserDirectory` with `list`, `invite`, `revokeInvite` and `setRole`. There are two implementations, Clerk and mock.
  - The Users page lists people with their role, two-factor status and last sign-in, and pending invitations.
  - Nobody can change their own access. "No access" removes the role and keeps the account.
- **Clerk shows up in:**
  - `ClerkProvider` in the root layout, and `clerkMiddleware` in `src/proxy.ts`
  - `<SignIn>` on `/sign-in`, and `<UserProfile>` on `/security`
  - the Clerk sign-out button, the Clerk directory and Clerk's Arabic texts
  - the packages `@clerk/nextjs` and `@clerk/localizations`
  - `scripts/cpanel-build.sh` and `cpanel-deploy.sh`, which accept `clerk|mock`
- **Elsewhere:**
  - The engine gets `X-Acting-User: <session email>`.
  - The notification cron gets its recipients from the directory.
  - `notification_prefs.user_id` holds Clerk user ids.
- **Vercel leftovers:** `vercel.json` (a cron) and `tests/unit/vercel-config.test.ts`. Nothing runs on Vercel any more.

## Design

### Settings

- **`AUTH_MODE=password|mock`**, default `mock`. `clerk` is refused with a message that names `password`, as `DB_MODE=neon` and `EMAIL_MODE=resend` are.
- **`APP_URL`:** the dashboard's address, for example `https://dashboard.fakhernco.com`.
  - Required with `password`; it must be `https://` except for `localhost`.
  - It's kept as its origin only (scheme, host, port).
  - Every link in an email is built from it, never from the request's `Host` header. Otherwise a forged request could make a reset email point to another site.
- **`ADMIN_EMAIL`** (optional): the first Admin's address (see "The first Admin"). When set, it must be one valid address of at most 254 characters.
- **`TWO_FACTOR`:** with `password`, an unset value means `off`. `required` is refused until M5d: "Two-factor login arrives in M5d; set TWO_FACTOR=off." Mock mode keeps today's behaviour, which the e2e tests use.
- **No longer read:** `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`.
- **`ALLOW_TEST_LOGINS=1`** keeps its meaning: "this production build is a test server". It allows the test logins, the in-memory store and the dev outbox. The dev outbox (`/api/dev/outbox`) is now open on any test server with `EMAIL_MODE=log`, in either sign-in mode, so the password-mode e2e server can read invitation links. A test server is a development build, or a production build with `ALLOW_TEST_LOGINS=1`. Before, the outbox was tied to `AUTH_MODE=mock`. It stays closed on a real production server.

### Accounts and their tables

There are five new tables in the dashboard's database, with the baseline's care:
- `ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`
- `CREATE TABLE IF NOT EXISTS`
- the M5a latin1 test lists them too

| Table | Columns | Notes |
|---|---|---|
| `users` | `id` varchar(191) (`usr_` + 22 random base64url characters), `email` varchar(255) unique, `name` varchar(200), `role` varchar(16) null, `password_hash` varchar(255), `created_at`, `password_changed_at`, `last_sign_in_at` null | Emails are stored trimmed and lowercased, at most 254 characters. |
| `sessions` | `token_hash` char(64) primary key, `user_id` (indexed), `created_at`, `expires_at` | |
| `invitations` | `id` varchar(191) (`inv_…`), `email` varchar(255) unique, `role`, `token_hash` char(64) unique, `invited_by` null, `created_at`, `expires_at` | At most one pending invitation per email. The row is deleted when accepted or revoked. |
| `password_resets` | `token_hash` char(64) primary key, `user_id`, `created_at`, `expires_at` | All of a person's resets are deleted when one is used. |
| `sign_in_limits` | `key` varchar(300) primary key, `count` int, `window_start` | Keys: `email:<address>`, `ip:<address>`, `reset:<address>`. |

Times are `datetime(3)`, in UTC.

**Storage:** `AccountStore` is a new store interface beside `AppStore`, with a memory and a MySQL implementation. The same contract tests run against both, as in M5a. Expired sessions, invitations, resets and limit rows are deleted by the notification cron's existing cleanup (`forgetBefore`).

### Passwords and links

**Passwords:**
- They're stored only as scrypt hashes (`node:crypto`, no package). Settings: N=2^15, r=8, p=1, a 64-byte key and a 16-byte random salt.
- The stored format names its settings, `scrypt$15$8$1$<salt>$<hash>`, so they can be raised later.
- Checks use `timingSafeEqual`.
- Rules: at least 10 and at most 200 characters, never trimmed, and different from the account's email. There are no composition rules.

**Tokens** (invitation links, reset links and session cookies):
- 32 random bytes, base64url.
- Only their sha256 is stored, so a stolen database copy holds no working link or session.

### Signing in

- **Pages:** our own sign-in page `/[locale]/sign-in`, in English and Arabic, with email, password and "Forgot password?". Test logins keep their buttons in mock mode.
- **Wrong details:** a wrong email and a wrong password get the same answer: "Email or password is incorrect." For an unknown email, the password is still checked against a fixed dummy hash, so the timing reveals nothing.
- **Guessing limits:**
  - 5 failures for an email within 15 minutes lock that email for 15 minutes.
  - 30 failures from one internet address within 15 minutes lock that address for 15 minutes.
  - The answer is then "Too many attempts. Try again in 15 minutes."
  - A successful sign-in clears that email's count.
- **The internet address:**
  - It's the client address as the server's own proxy (Passenger behind Apache) reports it, never a header the browser can set.
  - The plan finds out which header that is on the cPanel host.
  - If there's no trustworthy address, only the email limit applies.
- **On success:**
  - A new session is created; it's never reused, so a planted cookie can't be fixed in place.
  - `last_sign_in_at` is set.
  - The browser goes to the dashboard's home page. (Returning to the page that was asked for isn't built: server pages here can't see the address they were opened from without relying on Next.js internals.)
- **A person with no role** signs in and lands on the No access page, as today.
- **Log:** each sign-in is logged as `Signed in: <email> from <address>`. Each refusal is logged as `Sign-in refused (<wrong password|locked>): <email> from <address>`. Passwords and tokens are never logged. This replaces "Clerk logs sign-ins" (design §11).

### Staying signed in, and signing out

- **The cookie:**
  - `__Host-session` on HTTPS (`HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, 30 days).
  - On `http://localhost`, where `__Host-` needs `Secure`, it's `session` without `Secure`.
- **When a session ends:**
  - after 30 days
  - at sign-out, which deletes the row and the cookie
  - at a password change, which ends every other session of that person
  - at a password reset, which ends every session of that person
- **Each request:**
  - `getSession()` looks the session up once and reads the user's role from `users`, so "No access" takes effect on the next page.
  - `getRole()` (`/api/jobs`) does the same lookup.
  - `Session.twoFactor` is `false` until M5d.
- **Sign-out:** `/api/auth/sign-out` (POST) works in both modes.
  - In password mode it deletes the session.
  - It refuses a request whose `Origin` isn't `APP_URL`, so another site can't sign people out.
  - It keeps the full page load to the sign-in page.

### Invitations

- **On the Users page**, an Admin invites an email with a role, as today. The rules stay: at most 254 characters, compared trimmed and lowercased, and refused when the person already has an account or a pending invitation.
  - The dashboard saves the invitation (valid **7 days**) and emails a link: `<APP_URL>/<locale>/invitation?token=…`.
  - The email uses the notification format, English then Arabic, and each half links to that language's page (`/en/…` and `/ar/…`), as the notification emails do.
- **If sending fails** (`MailError`):
  - The invitation is deleted.
  - The Admin sees the same sentences as the test email ("The mail server refused the login." and the rest), with the server's reply.
- **With `EMAIL_MODE=log`:** the email goes to the outbox, and the Admin is told "Not sent: this server doesn't send emails yet." as with the test email.
- **Resend (new):**
  - It makes a new link, valid 7 days from now, and emails it.
  - The old link stops working once the new email is sent. If sending fails, nothing changes.
- **Revoke:** as today; the link stops working.
- **The invitation page** (outside the signed-in pages) shows the invited email and asks for a name and a password, entered twice.
  - Accepting creates the account with the invited role, deletes the invitation and signs the person in.
  - An unknown or used link shows "This invitation link isn't valid."
  - An expired link shows "This invitation has expired. Ask your Admin for a new one."
- **The Users page shows** each invitation's expiry ("Expires …" or "Expired").
- **The 100-user limit goes:** the list is read from our own table.

### Forgot password

- **Asking:** `/[locale]/forgot-password` asks for an email and always answers: "If this email has an account, we've sent a link to reset its password."
  - If it does, a reset link (valid **1 hour**) is emailed: `<APP_URL>/<locale>/reset-password?token=…`.
  - At most 3 reset emails go to one address per hour; further requests get the same answer and send nothing.
- **The reset page** asks for the new password twice.
  - It sets the password, deletes that person's resets and sessions, and signs them in.
  - An unknown, used or expired link shows "This link isn't valid any more. Ask for a new one." with a link to the forgot-password page.
- **Mail failures** are logged like notification failures and not shown, since the answer must not reveal whether the account exists.

### The first Admin

- **When the setup invitation is sent:** while the database has no Admin account, the sign-in page makes sure `ADMIN_EMAIL` has a valid Admin invitation.
  - If there's none, or it expired, it creates one and emails it.
  - This runs inside `exclusive("articles_ai_first_admin", …)` (M5b), so two visitors at once send one email.
- **Repeat visits** send nothing while the invitation is valid. The email can only ever go to `ADMIN_EMAIL`.
- **If `ADMIN_EMAIL` already has an account,** that account becomes Admin, without an email.
- **What the sign-in page shows while there's no Admin:**
  - "This dashboard has no Admin yet. An invitation was emailed to n•••@gmail.com." (the address partly hidden)
  - or, without `ADMIN_EMAIL`, "Set ADMIN_EMAIL in the server's settings to create the first Admin."
  - or, if sending failed, "The setup email couldn't be sent. See the server log." (logged with the kind and reply)
- **Once an Admin exists,** none of this happens. Nobody can change their own access, so the last Admin can't remove themselves.

### The Account page

`/[locale]/security` becomes **Account** in the menu ("الحساب"). It stays outside the signed-in shell, where M5d adds two-factor login.
- **In password mode** it shows the person's name, email and role, and **Change password**: the current password, then the new one twice. Changing it ends the person's other sessions and keeps this one.
- **In mock mode** it keeps today's test two-factor switch, which the e2e tests use.
- Clerk's `<UserProfile>` goes.

### Removing Clerk and the Vercel leftovers

- **Removed:**
  - the packages `@clerk/nextjs` and `@clerk/localizations`
  - `ClerkProvider`, `clerkMiddleware`, `clerk-sign-in.tsx`, `clerk-security.tsx` and `clerk-sign-out.tsx`
  - `clerk-session.ts` and `clerk-directory.ts`, with their tests
  - `clerk-localization.ts`
- **The proxy only handles languages.** It no longer runs on `/api`, which it did only for Clerk.
- **The password-mode directory:** `createAccountsDirectory` implements `UserDirectory` on `AccountStore` and the mailer, with `resendInvite(id)` added. The mock directory gets `resendInvite` too.
- **Build and deploy:** `scripts/cpanel-build.sh` and `cpanel-deploy.sh` accept `password|mock`.
  - `password` uses `deploy/cpanel/htaccess`; `mock` uses the password-locked preview, as today.
  - The build no longer needs a Clerk key.
- **Vercel:** `vercel.json` and `tests/unit/vercel-config.test.ts` go.
- **Texts:**
  - `SignIn.devNotice` loses its Vercel wording.
  - `Users.invite.hint` says the person gets an email with a link to set their password.
  - The README's "Real sign-in (Clerk)" becomes "Sign-in", and "Decisions in M5c" is added.

### Moving the live site

No Clerk account is copied:
- The user becomes the first Admin through `ADMIN_EMAIL`, then invites the others again.
- The dashboard's data and settings stay.
- Each person's notification switch starts at its default (on) once. Old rows keyed by Clerk ids are left; they match nobody and do nothing.

### Tests

- **Unit:**
  - **Passwords:** hashing and checking, the stored format, and the length and email rules.
  - **Tokens:** they're random, and only their hash is stored.
  - **Sessions:** creating one, expiry, sign-out, a password change ending the other sessions, a reset ending all of them, and the role read on each request.
  - **Guessing limits:** the email and address windows, clearing on success, and the 3-per-hour reset limit.
  - **Invitations:** dedupe, the 254-character limit, expiry, resend replacing the link, revoke, accepting once, a mail failure leaving nothing saved, and log mode.
  - **The first Admin:** the invitation is sent once; it's re-sent only after expiry; there's none once an Admin exists; an existing account is promoted; two visitors at once send one email.
  - **Settings:** `clerk` refused naming `password`; `APP_URL` required and `https` (except localhost); `TWO_FACTOR=required` refused in password mode; `ADMIN_EMAIL` validated.
  - **`AccountStore` contract:** on both stores, with MySQL on the local test database.
- **e2e:**
  - **Server:** a second Playwright server runs the same build in password mode, on the local MySQL test database with `EMAIL_MODE=log`.
  - **The first Admin:** the setup email is read from the outbox.
  - **Invitations:** the Admin invites a Reviewer, the link is read from the outbox, and the Reviewer sets a password and signs in.
  - **Accounts:** wrong password; lockout after 5; forgot password and reset; change password; sign-out; an expired or used link.
  - **Arabic:** the sign-in, invitation and reset pages.
  - The existing suite keeps the test logins on the mock-mode server.
- **Local trial:** a real cPanel-style build started through `deploy/cpanel/app.cjs`, with `AUTH_MODE=password`, the local MySQL and the fake mail server. With no accounts, the first-Admin email arrives, and the Admin signs in through it.

### Going live on Fakher & Co's server

1. **Me:**
   - In `.env.cpanel`: `AUTH_MODE=password`, `APP_URL=https://dashboard.fakhernco.com`, `ADMIN_EMAIL=<the user's address>`, and `TWO_FACTOR=off` (or the line removed).
   - Delete the Clerk keys.
   - Run `scripts/cpanel-build.sh`, then `scripts/cpanel-deploy.sh --settings`.
   - Refresh the encrypted settings backup.
2. **The user:**
   - opens the dashboard, gets the Admin invitation, sets a password and signs in
   - invites the colleagues
3. **Microsoft 365 check:** the colleagues' invitations are the first emails to Microsoft 365 inboxes (M5b). Check where they land. If one lands in Junk, a Microsoft 365 admin marks the sender as safe; nothing in DNS changes.
4. **With the user's OK,** delete the Clerk application from the user's Clerk account.

## Risks

- **Doing security ourselves:**
  - It's kept small and standard: scrypt, hashed random tokens, same-answer errors, guessing limits and server-side checks on every page.
  - The final review looks at this part first.
- **Locking the real Admin out:** sign-in limits are per email and per address and expire after 15 minutes, and "Forgot password" works throughout. If the mail server is down, the Admin waits, since the dashboard has no other way in. That's the trade-off of having no outside service.
- **Shared hosting:**
  - scrypt uses about 32 MB and roughly 0.1 s per check, which is fine for a handful of sign-ins.
  - Each page does one more small query (the session).
- **The client's address behind Apache/Passenger:** if no trustworthy header exists, only the per-email limit applies (see "Signing in").

## Done when

- `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm e2e` (both servers) pass, and a cPanel build succeeds.
- No file imports `@clerk/*`, and `vercel.json` is gone.
- `dashboard.fakhernco.com` runs `AUTH_MODE=password`, and the user has signed in as its first Admin.
- An invitation to a colleague has been sent, and where it landed is known.
