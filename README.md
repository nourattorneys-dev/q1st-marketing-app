# Articles AI — Marketing Dashboard

Review, approve and schedule AI-drafted articles and social posts. One deployment per website; the AI engine is Quantum1st's (API contract: `docs/specs/Marketing Portal Build Spec v1.1.html`).

## Run locally

    pnpm install
    cp .env.example .env.local
    pnpm dev            # http://localhost:3000 → /en

- `AUTH_MODE=mock`: local test logins (Admin, Reviewer, a user with no role, and an Admin without two-factor login). Refused on Vercel, and refused in production builds unless `ALLOW_TEST_LOGINS=1` (the e2e suite sets it).
- `ENGINE_MODE=mock`: built-in sample data. To simulate engine problems, set the browser cookie `mock_scenario` to `unauthorized`, `down` or `drift`.
- Mock scenario `signin_down` (the same `mock_scenario` cookie): the sign-in service can't be reached. The Users page shows a notice; the engine stays normal.
- `DB_MODE=memory` and `EMAIL_MODE=log` (the defaults): the dashboard's small database lives in the server's memory, and emails are only kept for the test outbox (`/api/dev/outbox`). Both are for local use; see "Database, webhook and email" for Vercel.
- With test logins, `POST /api/dev/mock-webhook` with `{ "event": "post.drafted", "data": { "postId": "p_201", "status": "pending" } }` makes the mock engine deliver a signed webhook (set the webhook up first, in Settings → Webhook). `GET /api/cron/notifications` with `Authorization: Bearer $CRON_SECRET` sends what's due.

## Checks

    pnpm lint && pnpm typecheck && pnpm test && pnpm e2e && ALLOW_TEST_LOGINS=1 pnpm build

## Docs

- Design: `docs/specs/2026-10-21-marketing-dashboard-design.md`
- API contract: `docs/specs/Marketing Portal Build Spec v1.1.html`
- Plans: `docs/plans/`

## Real sign-in (Clerk)

One Clerk application per website copy (design §5).

1. Create an application at https://dashboard.clerk.com and enable **Microsoft** and **Email code** sign-in.
2. **Restrictions → Sign-up mode: Restricted.** Only people the Admin invites from `/users` can create an account.
   - Also turn off **Allow users to delete their accounts**. Otherwise Clerk's account page on `/security` offers "Delete account", and the only Admin could delete themselves, which "nobody changes their own access" is meant to prevent.
   - Invitation emails link to Clerk's hosted sign-up page (the Account Portal), because the portal has no sign-up page of its own. Keep the Account Portal on, and point its after-sign-up and after-sign-in redirects (**Paths**) at the dashboard's URL.
3. **Multi-factor:** turn on **Authenticator application** and **Backup codes**. The portal sends an Admin without two-factor login to `/security` (Clerk's account page) until it's on.
   - Clerk's free plan has no two-factor login. On it, set `TWO_FACTOR=off`: nothing asks for two-factor login, and Users has no two-factor column. Switch back to the default (`required`) after moving to Clerk Pro.
4. **Sessions → Customize session token:** `{ "metadata": "{{user.public_metadata}}" }`. `/api/jobs` then reads the role from the token instead of asking Clerk on every poll. Without it the portal still works, with one Clerk call per poll.
5. Put the keys in `.env.local` (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`) and set `AUTH_MODE=clerk`.
6. Rebuild (`pnpm build`). `AUTH_MODE` is read at build time.
7. Create the first Admin in the Clerk Dashboard, because sign-up is restricted and nobody can sign up on their own: Users → **Create user** (or **Invite**). Then open the user → Metadata → **Public** → `{ "role": "admin" }`. From then on the Admin invites people and sets roles on `/users`. Anyone without a role sees "No access yet".

Clerk's keyless mode didn't activate in testing (2026-10-21), so keys are needed even locally. Use `AUTH_MODE=mock` until then. Clerk mode is unit-tested against a fake client only: check these steps end to end with real keys before go-live (`docs/plans/2026-10-22-m4b-followups.md`).

## Database, webhook and email (Vercel)

1. **Database:** add Neon from the Vercel Marketplace (it sets `DATABASE_URL`), and set `DB_MODE=neon`.
   - Set `WEBHOOK_ENCRYPTION_KEY` to `openssl rand -base64 32`. Keep it: changing it means getting a new webhook secret.
   - Apply the migrations once, and after every schema change: `DATABASE_URL=… pnpm db:migrate`.
   - Pull `DATABASE_URL` from the Neon dashboard, not with `vercel env pull`, which can also write `VERCEL="1"` locally.
2. **Email:** in Resend, add the sending domain (for example `notifications.fakhernco.com`). Add the DNS records Resend lists (DKIM, and its SPF/MX for the sending subdomain) in **Cloudflare**; the Microsoft 365 mail setup is unaffected. Then set:
   - `EMAIL_MODE=resend`
   - `RESEND_API_KEY`
   - `EMAIL_FROM` (for example `Articles AI <notifications@notifications.fakhernco.com>`)
3. **Cron:** set `CRON_SECRET` (a long random string). `vercel.json` calls `/api/cron/notifications` every 15 minutes. That needs Vercel Pro: on Hobby a cron that runs more than once a day makes the deployment fail. Every 15 minutes lets Neon's database sleep between runs, so the Free plan's monthly compute lasts the month; every 5 minutes would keep it awake and use it up by mid-month.
4. **Webhook:** after deploying, open **Settings → Webhook** on the production address and press **Set up webhook**. It registers `https://<address>/api/hooks/marketing` with Quantum1st, and keeps the signing secret encrypted. A preview deployment that does the same takes the webhook over (one webhook per site): set it up again on production afterwards.

## Hosting on cPanel (dashboard.fakhernco.com)

The dashboard runs as a Node app under Passenger on the fakhernco cPanel account. The account has no shell (SFTP only) and 2 GB of memory, shared with the WordPress site, so everything is built on a Mac and uploaded ready to run.

**One-time setup**

1. cPanel → **Domains**: create `dashboard.fakhernco.com` with the document root `/home/fakhernco/dashboard.fakhernco.com`. Upload `deploy/cpanel/htaccess` as that folder's `.htaccess`: it points Passenger at `~/dashboard-app` and Node 22. Nothing else in the web root belongs to the app.
2. **Cloudflare DNS:** add an `A` record `dashboard` pointing to the server's IP (the one fakhernco.com uses), set to **DNS only**. cPanel's AutoSSL then issues the certificate; cPanel → SSL/TLS Status → **Run AutoSSL** hurries it.
3. **`.env.cpanel`** in the repo root (never committed). Start from `.env.example` and set:
   - `AUTH_MODE=clerk`, with the Clerk keys
   - `TWO_FACTOR=off` on Clerk's free plan
   - `DB_MODE=neon` with `DATABASE_URL`
   - `WEBHOOK_ENCRYPTION_KEY`, `EMAIL_MODE` and `CRON_SECRET`
4. **SFTP:** an entry `fakher` in `~/.ssh/config` (host, port, user `fakhernco`, and a key authorized in cPanel → SSH Access).

**Each release**

    scripts/cpanel-build.sh                # committed code → dist/cpanel/<commit>
    scripts/cpanel-deploy.sh               # uploads it, switches to it, restarts the app
    scripts/cpanel-deploy.sh --settings    # the same, and uploads .env.cpanel as ~/dashboard-shared/settings.env

- **Uploads take about 9 minutes,** because SFTP sends the roughly 2,000 files one at a time. The site keeps serving the previous release until the switch.
- **Going back:** `scripts/cpanel-deploy.sh <older commit>`. Older releases stay in `~/dashboard-releases`; delete old ones with File Manager.
- **Log:** `~/dashboard-shared/app.log` (download it over SFTP). Settings live in `~/dashboard-shared/settings.env`, readable only by the account.
- **Preview before Clerk:** a settings file with `AUTH_MODE=mock` and `ALLOW_TEST_LOGINS=1` (kept locally as `.env.cpanel-preview`) builds a `<commit>-preview` release with test logins.
  - `scripts/cpanel-deploy.sh` always puts it behind `deploy/cpanel/htaccess-preview`: the browser asks for a password, kept as a bcrypt hash in `~/.htpasswds/dashboard.fakhernco.com/passwd`.
  - The Clerk build takes the password off again, but only once it is live.
  - The preview stores the test users' data in the same Neon database.
- **Email schedule:** when `EMAIL_MODE=resend`, add a cPanel cron job every 15 minutes:
  `curl -fsS -H "Authorization: Bearer <CRON_SECRET>" https://dashboard.fakhernco.com/api/cron/notifications > /dev/null`.
  `vercel.json`'s cron applies only on Vercel.

## Decisions in M1

- **Language in the URL** (`/en`, `/ar`). Next 16 Cache Components forbids reading cookies in the root layout, so the URL drives `<html lang dir>`. The last choice is remembered in the `NEXT_LOCALE` cookie.
- **Theme in `localStorage`**, applied by an inline script before first paint.
- **Digits are Latin** in both languages, and **times are 12-hour in the site's timezone**.
- **No database yet**; it arrives with webhooks in M4. Requiring two-factor login for the Admin also lands in M4, with real Clerk sign-in.
- **TypeScript 5**, as pinned by the Next.js 16.4 template.
- **Browser tests build from an empty `.next`.** One incremental build shipped stale compiled CSS (2026-10-21); it could not be reproduced later, so normal builds keep Next's default build cache (`experimental.turbopackFileSystemCacheForBuild` can turn it off if it recurs).
- **Engine requests time out after 10 s per attempt.** Reads retry twice, then show "can't be reached".
- **Each dashboard section validates only the site fields it uses**, and `GET /sites` is read only for the site id, so one changed field can't blank the whole app.
- **Browser tests match only visible elements after in-app navigation.** Next 16 keeps up to 3 previous pages in the page, hidden (React `<Activity>`).

## Decisions in M2a (review and editing)

- **The mock engine keeps state per `mock_store` cookie.** Each browser test sets its own namespace, so tests can't affect each other. Without the cookie, everything shares the "default" store until the server restarts.
- **Every change carries an `Idempotency-Key`.** It's created by `useEngineAction`, reused only after a network error, and the mock replays repeated keys exactly as the engine will.
- **Edit locks:** taken on opening the editor, renewed every half of `lockMinutes`, released on leaving, and taken over on request. An abandoned lock expires on its own.
- **Approval follows the findings:**
  - **Direct:** no critical findings.
  - **Override:** critical findings that can be overridden, with a required reason recorded in History.
  - **Blocked:** a non-overridable finding such as `structure_mismatch`.
- **The side-by-side view aligns sections** with a longest-common-subsequence match on block tags, so one missing paragraph shows as one gap.
- **The editor only counts real edits.** TipTap rewrites engine HTML into its own form (`<li>text</li>` becomes `<li><p>text</p></li>`), so "unsaved changes" is measured against the editor's form of what it loaded. StarterKit's trailing node is off because it adds an empty paragraph on the first click.
- **In mock mode, engine reads opt out of prerendering** (`await connection()` in `getEngine`), as a real network call would. Otherwise the mock store's clock trips Next's prerender check.

## Decisions in M2b (photos, publishing, Scheduled, History)

- **The mock owns the publishing queue.**
  - Slots are 10:00 and 13:00 Dubai time, Sunday to Thursday, from 22 Oct 2026, so times in tests never move.
  - `mock_scenario=manual` turns auto-publish off; `crash` shows the error page; `drift` adds a malformed post to the lists.
- **Buttons follow the engine's `post.actions`:** `publishNow`, `hold`, `resume`, `retry` (our names where the spec gives none; checked at M5).
- **A list never goes blank because of one bad item.** Items the engine sends in an unknown shape are skipped, with a note saying how many.
- **Idempotency keys:**
  - A key is reused only for the same request after no answer.
  - A Retry after a refusal is a new attempt, with a new key.
  - Lock renewals always use a fresh key.
- **Photos:**
  - The engine checks the file type (its message is shown). The browser checks the size against `/meta.limits.photoMaxBytes`.
  - Uploads pass through a server action limited to 6 MB. Note: Vercel caps a request at 4.5 MB.
  - The alt text and credit are saved with Save.
  - After a photo change, the editor reloads the post. It takes the new version only if nothing else changed on the server, so a save by someone else still shows as a conflict.
- **Export** goes through a server action and is saved in the browser, so the engine key never leaves the server.
- **Errors:** a 401 shows one site-wide banner; an unexpected error shows a translated error page with Try again.

## Decisions in M3a (keywords and topic ideas)

- **Slow AI jobs** (keyword proposals, topics, drafts, redrafts) are followed through our own `GET /api/jobs/[id]`.
  - It checks the session and keeps the engine key on the server, at `/meta.pollSeconds` (design §8).
  - A short network blip keeps polling.
  - A failed or unknown job, or an ended session, stops with a message.
- **Keyword tabs:**
  - The tabs are New, In use, Covered and Dismissed.
  - The AI's off-strategy keywords sit with the dismissed ones, and Restore moves both back to New.
- **Adding keywords:** the portal names the phrases that weren't added because they already existed, compared ignoring case and spacing.
- **Drafting:**
  - It always asks for the language (the site's languages plus "both").
  - "both" makes a linked English–Arabic pair.
  - In the new-request form, an article goes to the website and a social post to a social platform; the engine still checks.
- **A 429 `quota_exceeded`** shows "Monthly limit reached for {metric}". Admins get Request upgrade; reviewers are told to ask their admin.
- **Mock scenario `quota`:** every drafting request answers 429, so this path can be tried locally.

## Decisions in M3b (settings)

- **Settings are the Admin's** (`settings.manage`): the menu item, the four pages (`/settings/seo`, `/schedule`, `/website`, `/social`) and every settings action check it on the server.
- **Every settings form is versioned:**
  - A save sends the version the form started from.
  - If someone saved first, both versions show; Keep my changes saves my fields on top of theirs.
  - The engine's field messages show under their fields.
- **Website connection:**
  - The form is drawn entirely from `/meta.targetTypes` (types, fields, body formats, Arabic modes).
  - Test connection fills the field and block maps from the website's own fields.
  - A changed type, connection field or password is saved only after its test passes.
  - The password or token is write-only: never shown or sent back, and an empty field keeps the stored one.
- **Social accounts:**
  - Connect goes to the engine's sign-in address, followed only if it's https (http on localhost), and comes back to `/{locale}/settings/social?connected=…`.
  - Google Search Console shows only with the `performance` feature.
- **First run:** with no website connection, the dashboard sends the Admin to the website connection, then to social accounts. A Reviewer is told to ask the admin.
- **`422 not_connected`:** an Admin gets a link to the right settings page; a Reviewer is told to ask the admin.
- **Mock scenarios:**
  - `firstrun`: a fresh mock store starts with nothing connected. Use it with a new `mock_store` cookie.
  - `performance`: turns on that feature and Search Console.

## Decisions in M4a (site health, plan & usage, social posts)

- **Site health:**
  - Findings are in three tabs: To do (open and prepared), Applied and Dismissed.
  - Scan site and Prepare fixes are jobs, followed through `/api/jobs/[id]`.
  - Both roles can scan, prepare and dismiss. Only the Admin can apply a fix, because it changes the live website; it asks for confirmation first.
- **Plan & usage** (Admin):
  - The plan and its period, and the quota bars from `/account/plan`, with this site's share this month.
  - A 6-month chart of this site's usage for every metric the plan lists. The months end with the plan period's month, never the browser's clock.
  - This site's results, and Request upgrade with an optional note.
- **Quotas:** the dashboard shows this site's share too. A limit of 0 counts as reached. A 429 from an AI proposal or a scan shows the quota message, with Request upgrade (Admin) or "Ask your admin".
- **Social posts:**
  - Hashtags are chips. Typed words get a `#`, punctuation is dropped, and each tag is kept once.
  - A preview shows the caption (text, then hashtags) with a character count.
  - An Instagram post can't be approved or published until it has a photo.
- **Mock scenario `quota`:** also refuses scans (`siteScans`) and AI proposals (`aiTokens`).

## Decisions in M4b (users and security)

- **Users** (Admin, `/users`):
  - Everyone who can sign in, with their role, two-factor status and last sign-in (in the site's timezone).
  - Roles live in Clerk's public metadata: Admin, Reviewer or No access. No access removes the role and keeps the account, so access can be given back.
  - Nobody can change their own access, so the site can't lose its last Admin.
  - Invitations go by email with a role, which reaches the account when the person signs up. Emails are compared trimmed and in lower case; one that already has an account or a pending invitation is refused. A pending invitation can be revoked.
  - The page lists the first 100 people and 100 pending invitations.
  - When Clerk can't be reached, the page and its actions say so instead of failing.
- **Two-factor login** (design §5, §11):
  - Required for the Admin: an Admin without it reaches only `/security`; every page and server action sends them there.
  - Recommended for Reviewers: the user menu says "Turn on two-factor login" until it's on.
  - `/security` sits outside the app shell, like "No access". With Clerk it shows Clerk's account page.
- **Sessions:**
  - The signed-in person is read once per request (React `cache`), not once per check.
  - `/api/jobs` reads the role from the session token when the token carries it (step 4 above). Clerk renews the token every minute, so a role change reaches job polls within a minute; pages and actions see it on the next request.
- **Sign-out** loads the sign-in page afresh in both modes, so nothing of the previous person's pages stays hidden in the page. With Clerk, a Sign out button replaces Clerk's user button; the account page is `/security`.
- **Test logins:**
  - A fourth test user: "Admin without two-factor (test)".
  - Roles and two-factor status come from a test directory per `mock_store` namespace, so a change on `/users` takes effect on the person's next request, as with Clerk.
  - Invitations are listed, but no email is sent and they can't be accepted.
  - A switch on `/security` stands in for setting up an authenticator app, then goes on to the dashboard.

## Decisions in M4c (database, webhooks, email)

- **The dashboard's database** holds only:
  - webhook event ids (30 days)
  - the webhook registration, with its secret encrypted (AES-256-GCM)
  - the notification log
  - each person's email setting

  Locally it lives in memory (`DB_MODE=memory`, refused on Vercel); on Vercel it's Neon through Drizzle.
- **The webhook receiver** (`/api/hooks/marketing`):
  - It checks `X-Signature` against the raw body in constant time, before parsing anything.
  - A delivery it can't verify gets 401 and changes nothing.
  - A repeated `X-Event-Id` is acknowledged and ignored.
  - An event it doesn't know is acknowledged, so the engine stops retrying.
  - Screens aren't cached, so deliveries don't refresh anything; jobs are still followed by polling.
- **Webhook setup** (Settings → Webhook):
  - Every setup asks the engine for a new secret, so the stored one always matches.
  - The page says when the webhook points at another address, or when this server can't read its secret (a changed `WEBHOOK_ENCRYPTION_KEY`).
- **Emails** (design §10):
  - **Who gets what:** drafts go to Reviewers (to the Admins when there are no Reviewers). Failed posts, connections that stop working or are about to expire, quota warnings and finished site scans go to the Admins.
  - **Batching:** a batch goes out as one email per person, English then Arabic, once nothing new has arrived for 2 minutes. The cron runs every 15 minutes (Neon's Free plan).
  - **Retries:** each person gets only the items they haven't had yet, so a failed send is retried on the next run without emailing anyone twice. After a day of failing for someone, the batch stops waiting for them (logged).
  - **Each person's setting:** everyone can turn their emails off on the Email notifications page.
- **Not built:**
  - **Badges from webhooks:** every list and the dashboard read the engine when they open, so their counts are current.
  - **React Email:** the templates are plain HTML and text from the message files.

## Decisions in M4d (polish before go-live)

- **Errors** anywhere in the app, the app frame and the session read included, show the dashboard's error page in the reader's language. A failure in the root layout shows a short page in both languages.
- **Unsaved edits in the editor:**
  - Any link inside the dashboard (Back, the sidebar, the user menu), closing or reloading the tab, and switching language ask first. The browser's own Back and Forward buttons don't yet (M4e).
  - Ask for changes and Reject wait for a save, like Approve.
- **First-run settings:**
  - A website connection the engine hasn't created yet opens an empty form.
  - SEO fields not set yet read as empty.
  - No secret-type setting is sent to the browser: the engine API strips them from every read and save.
- **Arabic:**
  - Clerk's sign-in and account screens are in Arabic on `/ar` (`@clerk/localizations`, plus Arabic for what it leaves in English: placeholders, the wrong-password and wrong-code errors, the sign-in title, dates).
  - The dashboard's own refusals, the plural counts, the keyword limits and the dialog's Close label are translated.
- **Photos** are limited to 4 MB, under Vercel's 4.5 MB request limit, whatever the engine allows.
