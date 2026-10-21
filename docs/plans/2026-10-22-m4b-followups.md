# M4b follow-ups

Carry these into the M4c and M5 plans.

## Before go-live (M5)

- **Clerk mode has never run:** it's unit-tested over a fake client only. With real keys, check end to end:
  - An invitation email arrives, and the role reaches the new account.
  - An Admin without two-factor login is sent to `/security`. After setting it up in Clerk's account page, "I've turned it on: continue" lets them in.
  - Removing someone's access sends them to "No access" on their next page.
  - The session token carries `metadata.role` (README, Real sign-in step 4).
  - Sign out ends on the sign-in page.
  - "Delete account" isn't shown on `/security` (README, Real sign-in step 2).
  - An invitee who signs up through the Account Portal lands on the dashboard.
  - After an Admin sets up an authenticator, the next **Microsoft** sign-in asks for the code too.
  - Inviting an existing account's email shows "already has an account or an invitation" (this confirms Clerk's real duplicate error code).
  - Clerk's account page fits the `/security` card without scrolling sideways.
- **Clerk's own enforcement:** check whether the Clerk plan can require multi-factor at every sign-in. The portal enforces it for Admins either way. If that setting is turned on, check that someone who hasn't set up two-factor yet (a pending Clerk session) is shown Clerk's setup step rather than sent back to sign-in.
- **Clerk's widgets are in English on `/ar`** (sign-in, and now the account page on `/security`). Translating them needs `@clerk/localizations`, a new package.

## Known limits

- The Users page lists the first 100 people and 100 pending invitations (no paging).
- Inviting checks for duplicates against those lists. Beyond them, Clerk refuses a duplicate itself, and the page shows the same message.
- A pending invitation can't be resent: revoke it and invite again.
- **Next 16.4: a refresh doesn't redraw a page outside the app shell.** On `/security`, neither `refresh()` nor a redirect back to the same URL from a server action redrew the page, although the action's response carried the new state (a reload showed it). The test switch goes on to the dashboard instead. Check again on a newer Next before adding actions to `/security`, `/no-access` or `/sign-in`. — M4c found the cause: a view whose only request-time input is cookies isn't redrawn after in-app navigation; `await connection()` in the view fixes it (see the M4c follow-ups).

## Deferred minor findings (final review)

- **Every Clerk refusal except a duplicate or a 404 reads "can't be reached right now. Try again shortly."** A 400/422 (an email Clerk rejects, a blocklisted address, revoking an invitation that was accepted meanwhile) tells the Admin to retry something that won't work. Map Clerk 4xx to its own "the sign-in service refused this" message.
- **`/api/jobs` doesn't send an Admin without two-factor login to `/security`:** `getRole()` skips that check. They can only read the status of jobs they couldn't start anyway.
- **English "Invalid request." on `/ar/users`:** `Users.errors` has no `invalid_input` key, so an action's own input check (for example an email over 320 characters) shows the English text.
- **Screen readers can't tell the rows apart:** every role dropdown is labelled "Access" and every button says "Apply". Put the person's name in their `aria-label`s.
- **Test realism:** the Clerk adapter's "unreachable" test throws a `TypeError`, where the real client throws `ClerkAPIResponseError` with code `unexpected_error`; `form_identifier_exists` is mapped but not tested. Both map correctly today.

