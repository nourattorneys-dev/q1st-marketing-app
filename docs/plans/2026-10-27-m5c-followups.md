# M5c follow-ups (own sign-in)

## Going live on dashboard.fakhernco.com

The steps are in the plan's "Going live" section. Checks added by the final review:

- **HTTPS:** after the deploy (which uploads the new `.htaccess`), check:
  - `curl -sI http://dashboard.fakhernco.com/en/sign-in` answers `301` with `Location: https://…`
  - the https address answers `200` with `Strict-Transport-Security: max-age=31536000`, and doesn't loop
  - `http://dashboard.fakhernco.com/.well-known/` isn't redirected (AutoSSL's checks)
  - If a page answers 500 or loops, put the previous release's `.htaccess` back, then look at it.
- **The visitor's address:** the host has nginx in front of Apache. The live access log already shows real visitor addresses (verified on 2026-10-27; this Mac showed as 156.197.89.143), so Passenger's `X-Forwarded-For`, which the app reads, should carry them too.
  - Go-live step 4 confirms this in `app.log`.
  - **If `app.log` shows the server's own address (158.220.82.191) or `127.0.0.1` for everyone**, the per-address limit would lock everyone out after 30 failures from anyone. Before inviting colleagues, change `clientAddress` (`src/lib/accounts/request.ts`) to treat loopback, private ranges and the host's own address as unknown.
- **A typo in `ADMIN_EMAIL`:** correcting it and reloading the sign-in page now withdraws the invitation sent to the earlier address. `app.log` records this as "withdrew the invitation".

## Deferred minor findings (final review)

- **Address limit, IPv6:** IPv6 visitors are counted per address, not per /64, so one network can spread its attempts. The email limit still applies (`request.ts`).
- **Reset links outlive a password change:** `changePassword` doesn't call `deleteResetsOf`, so a reset link emailed in the last hour still works after the password is changed on the Account page.
- **Signing in again leaves the old session valid:** the sign-in, invitation and reset actions replace the cookie but don't delete the session it held. The old token lives in the database until its 30 days end.
- **Forgot-password timing:** `requestReset` writes the reset row in-band for existing accounts only (`resets.ts`). Moving the insert into `later` would make the "same time for unknown emails" claim fully true.
- **Password length is counted before NFKC** (`passwords.ts`): 10 "e + combining accent" pairs pass the rule but hash as 5 characters. Measure the normalised string instead.
- **Log cleaning:** `printable()` leaves U+2028, U+2029 and U+0085, which some editors show as line breaks (`sign-in.ts`).
- **`ensureFirstAdmin` ignores `addInvitation`'s result** (`first-admin.ts`): if it returns false, the emailed link is dead. It runs under the lock after deleting any pending invitation for that email, so this needs an Admin inviting that same address at the same moment.
- **The first-Admin notice holds up the sign-in form:** `FirstAdminNotice` has no Suspense boundary of its own, so while there's no Admin the form waits for the SMTP send. This happens once, until the first Admin exists.
- **The lock message says "Try again in 15 minutes":** the window starts at the first attempt, so the lock lasts up to 15 minutes, never longer.
- **The preview asks for its password before redirecting to HTTPS:** Apache checks passwords before `.htaccess` rewrites, so `http://` on a preview (`AUTH_MODE=mock`) still gets the password prompt over plain HTTP, as before this change. Use the https address for previews.
- **README "Going back":** a pre-M5c release refuses `AUTH_MODE=password`, so rolling back needs the Clerk settings restored. After go-live step 7 (deleting the Clerk application), rolling back to Clerk isn't possible.

## Carry into later milestones

- **M5d (two-factor login):** sign-in counts attempts before checking the password (`signIn`), so parallel requests can't get past the limit. A code check must count the same way. Changing the password uses the same `email:` limit.
- **Another client:** `next.config.ts` sends HSTS from the app on every host. The `.htaccess` redirect is cPanel-specific; another host needs its own HTTP→HTTPS redirect.
