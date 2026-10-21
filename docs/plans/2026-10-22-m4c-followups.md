# M4c follow-ups

Carry these into the M5 plan.

## Before go-live (M5)

- **Neon has never run:** the Neon store is checked only through the SQL it builds. With a real database:
  - `pnpm db:migrate` creates the four tables.
  - A webhook delivery is recorded, and the same delivery sent twice is recorded once.
  - The Webhook page shows the last delivery.
- **Resend has never sent:** with the domain verified (README, Database, webhook and email):
  - A drafts email reaches a Microsoft 365 inbox, not junk mail.
  - Both languages show correctly in Outlook (the Arabic part right to left).
  - The links open the production address.
- **The cron runs:** the Vercel dashboard lists the cron, its calls answer 200, and a call without `CRON_SECRET` answers 401.
- **A real delivery from Quantum1st verifies:** the Webhook page shows "Set up", and a delivery shows as the last one received.

## Known limits

- The in-memory store (`DB_MODE=memory`) is one per server process and is lost on restart; it's for local work and the e2e suite only.
- A batch whose email keeps failing for someone (for example an unverified sending domain) is retried every 15 minutes for a day, then stops waiting for them; the server log says so.
- Emails can't say whose action caused them: the events carry no acting user.
- **Next 16.4: a view that reads only cookies isn't redrawn by a server action's `refresh()`** once the page was reached by in-app navigation (the action's response carries the new state; a reload shows it). Every view that calls `getEngine()` is safe, because it runs `await connection()`. `NotificationsView` calls `connection()` itself; any new view that reads only the session must do the same. This was also the cause of M4b's `/security` redraw problem.

## Questions for Quantum1st (from M4c)

- **Deliveries:** how often, and for how long, is a failed delivery retried? What timeout does the engine allow for the dashboard's answer?
- **Redrafts:** does a finished redraft send `post.drafted` again (the dashboard then emails Reviewers), or only `job.finished`?
- **`connection.changed` status values:** are they `ok`, `expiring`, `error` and `missing`, as `/sites` uses? The dashboard emails for anything but `ok`.
- **Event filter:** does `PUT …/webhook` `events` filter the deliveries, and does a new event type need the list updated?
- **Replays:** the signature covers only the body, so a captured delivery could be sent again with a new `X-Event-Id`. Could the signature also cover the event id and a timestamp, with a freshness window?
- **`post.failed` `error`:** what shape is it (string, `{code, message}`), and can it be a whole HTML error page from WordPress? The dashboard now accepts any shape and keeps at most 500 characters of a message.

## Deferred minor findings (final review)

- **The receiver reads the body as text, not bytes:** a body with a byte-order mark or invalid UTF-8 is signed over different bytes than it checks, so it's refused (401). Read `arrayBuffer()` and sign the bytes.
- **The envelope requires `siteId` and `at`:** an authentic delivery without them (an account-wide quota or plan event, say) gets 400 and is retried forever. After the signature checks out, only `event` needs to be required.
- **One bad setting breaks unrelated routes:** `servicesEnv()` checks the database, email and cron settings together, so `EMAIL_MODE=resend` without `RESEND_API_KEY` also makes every webhook delivery answer 500. Check each where it's used, or at startup.
- **`EMAIL_MODE=log` is allowed on Vercel:** if it's forgotten in production, batches are marked sent and nobody gets mail (only the Email notifications page says so). Consider refusing it when `VERCEL_ENV=production`.
- **Setup rotates the secret before saving it:** if the save fails, the engine has the new secret while the page still says "Set up" with the old one; two Admins setting up at once can store the wrong one. The page shows the error and pressing it again fixes it.
- **No maximum wait:** a steady stream of events (a connection flapping, repeated quota warnings) can postpone an audience's email indefinitely. Send anyway once the oldest pending item is about 30 minutes old.
- **An Admin can get two emails in one run** when there are no Reviewers (the drafts email and the updates email). Merge them per person.
- **Recipients come from the newest 100 people** (the M4b directory limit): beyond that, the oldest accounts, likely the first Admins, silently get no email.
- **esbuild's install script is skipped, unlisted:** list `esbuild` under `ignoredBuiltDependencies` in `pnpm-workspace.yaml`, so the choice is written down and the install warning stops.

