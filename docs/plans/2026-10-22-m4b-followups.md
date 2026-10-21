# M4b follow-ups

Carry these into the M4c and M5 plans.

## Before go-live (M5)

- **Clerk mode has never run:** it's unit-tested over a fake client only. With real keys, check end to end:
  - An invitation email arrives, and the role reaches the new account.
  - An Admin without two-factor login is sent to `/security`. After setting it up in Clerk's account page, "I've turned it on: continue" lets them in.
  - Removing someone's access sends them to "No access" on their next page.
  - The session token carries `metadata.role` (README, Real sign-in step 4).
  - Sign out ends on the sign-in page.
- **Clerk's own enforcement:** check whether the Clerk plan can require multi-factor at every sign-in. The portal enforces it for Admins either way.

## Known limits

- The Users page lists the first 100 people and 100 pending invitations (no paging).
- Inviting checks for duplicates against those lists. Beyond them, Clerk refuses a duplicate itself, and the page shows the same message.
- A pending invitation can't be resent: revoke it and invite again.
- **Next 16.4: a refresh doesn't redraw a page outside the app shell.** On `/security`, neither `refresh()` nor a redirect back to the same URL from a server action redrew the page, although the action's response carried the new state (a reload showed it). The test switch goes on to the dashboard instead. Check again on a newer Next before adding actions to `/security`, `/no-access` or `/sign-in`.
