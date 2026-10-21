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
- A batch whose email keeps failing (for example an unverified sending domain) is retried every 5 minutes until it goes out.
- Emails can't say whose action caused them: the events carry no acting user.
- **Next 16.4: a view that reads only cookies isn't redrawn by a server action's `refresh()`** once the page was reached by in-app navigation (the action's response carries the new state; a reload shows it). Every view that calls `getEngine()` is safe, because it runs `await connection()`. `NotificationsView` calls `connection()` itself; any new view that reads only the session must do the same. This was also the cause of M4b's `/security` redraw problem.

## Questions for Quantum1st (from M4c)

- **Deliveries:** how often, and for how long, is a failed delivery retried? What timeout does the engine allow for the dashboard's answer?
- **Redrafts:** does a finished redraft send `post.drafted` again (the dashboard then emails Reviewers), or only `job.finished`?
- **`connection.changed` status values:** are they `ok`, `expiring`, `error` and `missing`, as `/sites` uses? The dashboard emails for anything but `ok`.
- **Event filter:** does `PUT …/webhook` `events` filter the deliveries, and does a new event type need the list updated?
