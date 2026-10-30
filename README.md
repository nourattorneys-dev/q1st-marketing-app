# Articles AI — Marketing Dashboard

Review, approve and schedule AI-drafted articles and social posts. One deployment per website; the AI engine is Quantum1st's (API contract: `docs/specs/Marketing Portal Build Spec v1.1.html`).

## Run locally

    pnpm install
    cp .env.example .env.local
    pnpm dev            # http://localhost:3000 → /en

- `AUTH_MODE=mock`: local test logins (Admin, Reviewer, a user with no role, and an Admin without two-factor login). Refused in production builds unless `ALLOW_TEST_LOGINS=1` (the e2e suite sets it). The real sign-in is `AUTH_MODE=password` (see "Sign-in").
- `ENGINE_MODE=mock`: built-in sample data. To simulate engine problems, set the browser cookie `mock_scenario` to `unauthorized`, `down` or `drift`.
- Mock scenario `signin_down` (the same `mock_scenario` cookie): the sign-in service can't be reached. The Users page shows a notice; the engine stays normal.
- `DB_MODE=memory` and `EMAIL_MODE=log` (the defaults): the dashboard's small database lives in the server's memory, and emails are only kept for the test outbox (`/api/dev/outbox`). Both are for local use; a server keeps its data in Postgres (see "Database, webhook and email").
- With test logins, `POST /api/dev/mock-webhook` with `{ "event": "post.drafted", "data": { "postId": "p_201", "status": "pending" } }` makes the mock engine deliver a signed webhook (set the webhook up first, in Settings → Webhook). `GET /api/cron/notifications` with `Authorization: Bearer $CRON_SECRET` sends what's due.

## Checks

    pnpm lint && pnpm typecheck && pnpm test && pnpm e2e && ALLOW_TEST_LOGINS=1 pnpm build

And the build exactly as the server image makes it (no settings at build time; a page that reads a setting before the request fails here):

    env -i PATH="$PATH" HOME="$HOME" NEXT_OUTPUT=standalone AUTH_MODE=password ENGINE_MODE=live TWO_FACTOR=off pnpm build

`pnpm test` and `pnpm e2e` need a local Postgres (`TEST_DATABASE_URL`, default `postgres://postgres@127.0.0.1:5432/articles_ai_test`). `pnpm e2e` runs two suites: test logins, then password mode on the database `articles_ai_test_e2e_password` (`pnpm e2e:password` alone, after `ALLOW_TEST_LOGINS=1 pnpm build`).

## Docs

- Design: `docs/specs/2026-10-21-marketing-dashboard-design.md`
- API contract: `docs/specs/Marketing Portal Build Spec v1.1.html`
- Plans: `docs/plans/`
- From Quantum1st: their original spec (`docs/quantum1st/Marketing Portal Build Spec v1.0 (from Quantum1st).html`), and our draft reply proposing v1.1 (`docs/quantum1st/message-to-quantum1st.md`, not sent yet)
- Design reference: `docs/design-reference/` (the portal prototype the look is based on; style only, its names are placeholders)

## Sign-in

The dashboard signs people in itself (M5c). Accounts, sessions, invitations and password resets live in its own database, and the links go out through its own email (see "Database, webhook and email").

- **Settings:**
  - `AUTH_MODE=password`
  - `APP_URL`: the dashboard's address, https, from which every emailed link is built
  - `ADMIN_EMAIL`
  - `TWO_FACTOR` stays off until two-factor login arrives (M5d).
- **The first Admin:**
  - While the dashboard has no Admin, opening its sign-in page emails `ADMIN_EMAIL` an invitation. It's sent once, and again only after that link expires (7 days).
  - Following it creates the Admin account.
  - If that address already has an account, the account becomes the Admin.
- **Everyone else:**
  - The Admin invites them on `/users`, with a role.
  - The emailed link (English and Arabic) works once, for 7 days. **Resend** makes a new one.
  - With `EMAIL_MODE=log` the invitation is kept but not sent, and the page says so.
- **Passwords:**
  - At least 10 characters, stored only as scrypt hashes.
  - "Forgot password?" emails a 1-hour link.
  - The Account page (`/security`) changes the password and signs the person out everywhere else.
- **Guessing:** 5 wrong passwords for an email, or 30 from one internet address, within 15 minutes lock them for 15 minutes. The address is the last `X-Forwarded-For` entry, which Passenger adds on the cPanel host. Keep the subdomain "DNS only" in Cloudflare, or every visitor would share Cloudflare's addresses.
- **Log:** every sign-in and refusal is in `app.log` (`Signed in: …`, `Sign-in refused (…): …`), with the email and address, never the password.

## Database, webhook and email

1. **Database:** the dashboard's own Postgres (16 or newer).
   - Settings: `DB_MODE=postgres`, `DATABASE_URL=postgres://user:password@host:5432/database` (URL-encode special characters in the password) and, optionally, `DB_POOL_MAX` (connections per server process, default 5).
   - **The app creates and updates its own tables** the first time it uses the database after a release, from `drizzle/`, under a Postgres advisory lock, so several processes starting together apply them once. Each migration runs in one transaction: an interrupted one leaves nothing half done. Locally, `pnpm db:migrate` does the same for the database in `DATABASE_URL`.
   - Set `WEBHOOK_ENCRYPTION_KEY` to `openssl rand -base64 32`. Keep it: changing it means getting a new webhook secret.
   - Set `APP_ENCRYPTION_KEY` the same way: it encrypts each site's engine key (unset, `WEBHOOK_ENCRYPTION_KEY` is used). Keep it: changing it makes the stored engine keys unreadable.
   - **Many clients (P1b):** one app serves several clients, each with one or more websites. On first start with no client, the app makes the first client and its site from `ENGINE_API_KEY` (the engine says which site the key opens); every existing person and the old webhook setup join it, and `ADMIN_EMAIL` is its first Admin. Anyone who may open more than one site picks it in the header; an Admin chooses a Reviewer's sites on the Users page.
   - **Backups:** the server's Postgres backups (`pg_dump` of the dashboard's database).
   - **Tests:** `pnpm test` needs a local Postgres, set by `TEST_DATABASE_URL` (default `postgres://postgres@127.0.0.1:5432/articles_ai_test`). Each test file uses its own `articles_ai_test_<name>` database.
2. **Email:** Microsoft 365 through Microsoft Graph (`EMAIL_MODE=graph`), or a mail server over SMTP (`EMAIL_MODE=smtp`, below).
   - **Microsoft 365 (graph):** an app registration with no Graph permissions of its own, given the right to send from one mailbox only through Exchange's role-based access for applications (role `Application Mail.Send`, scoped to that mailbox). Settings: `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET` (single quotes) and `EMAIL_FROM`, for example `Q1st <notifications@quantum1st.com>`. Emails are not kept in the mailbox's Sent Items. A failure is logged with Microsoft's reason, never the secret.
   - **SMTP:**
   - **On a cPanel host:**
     - cPanel → **Email Accounts**: create a mailbox on the dashboard's own subdomain (for Fakher & Co, `notifications@dashboard.fakhernco.com`).
     - cPanel → **Email Deliverability** → that subdomain: add the suggested **SPF** and **DKIM** records where the domain's DNS lives (Cloudflare for Fakher & Co).
       - The suggested values can also be read from the server's own DNS: `dig +short TXT default._domainkey.<subdomain> @<server IP>`. Paste the DKIM value as one line: a line break inside it breaks the record.
       - **Then open Email Deliverability again.** cPanel signs emails with DKIM only once its own check has seen the record as valid, so until then emails go out unsigned (SPF still passes). Found at go-live on 2026-10-26.
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
3. **Cron:** set `CRON_SECRET` (a long random string). The host calls `/api/cron/notifications` every 15 minutes: on cPanel, a cron job (see "Hosting on cPanel"). One run sends at a time: a run that starts while another is sending answers `{ "skipped": true }`.
4. **Webhook:** after a release, open **Settings → Webhook** on the live address and press **Set up webhook**. It registers `https://<address>/api/hooks/marketing` with Quantum1st, and keeps the signing secret encrypted.

## Hosting on the server (app.q1st.io)

The hosted app runs in Docker on Quantum1st's server (`deploy/docker/`), next to the engine. Host networking: it reaches the engine at `127.0.0.1:8140` and its own Postgres database at `127.0.0.1:5432`, and listens only on `127.0.0.1:3200` (`APP_PORT`); the Cloudflare tunnel publishes it as app.q1st.io.

- **Settings:** `/opt/q1st-app/app.env` (mode 600), from `deploy/docker/app.env.example`. Nothing secret is in the image.
- **Each release:** on the Mac, `git archive` the commit and copy it to the server; on the server, `deploy/docker/release.sh <archive>` builds the image, starts it and waits for `/api/health`. It prints the command that rolls back to the previous image.
- **Restarts:** the container restarts by itself (`restart: unless-stopped`), also after the server reboots.
- **Notifications:** systemd timer `q1st-app-notify` every 15 minutes (`deploy/docker/notify.sh`).
- **Backups:** systemd timer `q1st-app-backup` daily, `pg_dump` into `/opt/q1st-app/backups`, kept `BACKUP_KEEP_DAYS` days.
- **Logs:** `docker compose -f /opt/q1st-app/release/compose.yml logs -f`.
- **New clients (P1c):** only from the staff portal (Marketing clients → a client → Client dashboard). The engine issues the site's key and webhook secret and sends them to `POST /api/provision`, signed with `PROVISION_SECRET` over `<X-Timestamp>.<body>`; a request older or newer than `PROVISION_MAX_SKEW_SECONDS` is refused. The app keeps both encrypted and emails the first Admin's invitation. A client is one engine account: renaming or removing there is followed here. Removing a site keeps the access rows that named it, so a Reviewer limited to it opens nothing rather than every site.

## Hosting on cPanel (dashboard.fakhernco.com)

> The single-client copy on cPanel. The hosted, many-client app moves to Docker on Quantum1st's server (P1e); this section is kept until then. With Postgres, `DATABASE_URL` points to a Postgres the host provides.

The dashboard runs as a Node app under Passenger on the fakhernco cPanel account. The account has no shell (SFTP only) and 2 GB of memory, shared with the WordPress site, so everything is built on a Mac and uploaded ready to run.

**One-time setup**

1. cPanel → **Domains**: create `dashboard.fakhernco.com` with the document root `/home/fakhernco/dashboard.fakhernco.com`. Upload `deploy/cpanel/htaccess` as that folder's `.htaccess`: it points Passenger at `~/dashboard-app` and Node 22, and redirects plain HTTP to HTTPS (except AutoSSL's `/.well-known/` checks). Each deploy uploads it again. Nothing else in the web root belongs to the app.
2. **Cloudflare DNS:** add an `A` record `dashboard` pointing to the server's IP (the one fakhernco.com uses), set to **DNS only**. cPanel's AutoSSL then issues the certificate; cPanel → SSL/TLS Status → **Run AutoSSL** hurries it.
3. **MySQL:** cPanel → **MySQL Databases**: create a database (for example `fakhernco_dashboard`; cPanel adds the account prefix) and a user, and give the user **All Privileges** on it, since the app creates its own tables. Then `DATABASE_URL=mysql://<user>:<password>@localhost:3306/<database>`.
4. **`.env.cpanel`** in the repo root (never committed). Start from `.env.example` and set:
   - `AUTH_MODE=password`, `APP_URL=https://dashboard.fakhernco.com` and `ADMIN_EMAIL` (the first Admin's address)
   - `DB_MODE=mysql` with `DATABASE_URL`
   - `WEBHOOK_ENCRYPTION_KEY` and `CRON_SECRET`
   - `EMAIL_MODE=smtp`, the `SMTP_` settings and `EMAIL_FROM` (see "Database, webhook and email")
5. **SFTP:** an entry `fakher` in `~/.ssh/config` (host, port, user `fakhernco`, and a key authorized in cPanel → SSH Access).

**Each release**

    scripts/cpanel-build.sh                # committed code → dist/cpanel/<commit>
    scripts/cpanel-deploy.sh               # uploads it, switches to it, restarts the app
    scripts/cpanel-deploy.sh --settings    # the same, and uploads .env.cpanel as ~/dashboard-shared/settings.env

- **Uploads take about 9 minutes,** because SFTP sends the roughly 2,000 files one at a time. The site keeps serving the previous release until the switch.
- **Going back:** `scripts/cpanel-deploy.sh <older commit>`. Older releases stay in `~/dashboard-releases`; delete old ones with File Manager.
- **Log:** `~/dashboard-shared/app.log` (download it over SFTP). Settings live in `~/dashboard-shared/settings.env`, readable only by the account.
- **Preview with test logins:** a settings file with `AUTH_MODE=mock` and `ALLOW_TEST_LOGINS=1` (kept locally as `.env.cpanel-preview`) builds a `<commit>-preview` release with test logins.
  - `scripts/cpanel-deploy.sh` always puts it behind `deploy/cpanel/htaccess-preview`: the browser asks for a password, kept as a bcrypt hash in `~/.htpasswds/dashboard.fakhernco.com/passwd`.
  - A password-mode build takes the browser password off again, but only once it is live.
  - The preview keeps its data in memory (`DB_MODE=memory`), so it never touches the live database.
- **Email schedule:** cPanel → **Cron Jobs**, every 15 minutes (`*/15 * * * *`). The command reads the secret from the settings file, so it's never typed into cPanel:

      curl -fsS -H "Authorization: Bearer $(sed -n 's/^CRON_SECRET=//p' ~/dashboard-shared/settings.env)" https://dashboard.fakhernco.com/api/cron/notifications > /dev/null


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

## Decisions in P1a (Postgres)

- **Postgres instead of MySQL,** the same database technology as Quantum1st's engine on the same server: one kind of database to run and back up. The 10 tables and their queries are unchanged in meaning.
- **Advisory locks instead of `GET_LOCK`:** the migration lock and the one-notification-run-at-a-time lock. They belong to one database, so other databases on the server never clash, and they go with the connection if a process dies.
- **A closed connection never stops the app:** the pool reports it and opens a new one on the next query (a Postgres restart or idle timeout).
- **Connections per process are a setting** (`DB_POOL_MAX`, default 5).

## Decisions in M5a (own database)

> Superseded by P1a for the database itself; kept for the history.

- **The client's MySQL instead of Neon,** so a copy depends on no outside database service. Any host with MySQL 8 works; the settings file is the only difference.
- **The app creates its own tables** on first use after a release, under the MySQL lock `articles_ai_migrations`, because the cPanel account has no shell. A failed attempt is retried on the next request, and its error names the migrations folder.
- **utf8mb4 tables whatever the database's default,** so Arabic and emoji are safe on hosts that default to latin1.
- **At most 3 connections,** leaving room for WordPress on the same account.
- **Ids are capped at 191 characters and emails at 255.** A longer one is refused with an error rather than cut, since `INSERT IGNORE` would cut it silently. The engine's event names are `text`.
- **Settings are read at request time only:** the cron route waits for a request (`await connection()`) before reading them, so the production build, which tries to prerender it, never does.
- **The in-memory store is refused on production servers,** where it would lose its data on every restart. The exception is `ALLOW_TEST_LOGINS=1`, which the e2e suite sets.

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

## Decisions in M5c (own sign-in)

- **Our own accounts instead of Clerk** (and the Microsoft sign-in that came through it), so a copy needs no sign-in service. Accounts, sessions, invitations, resets and guessing limits are five tables in the dashboard's MySQL.
- **Email and password:**
  - Passwords are scrypt hashes from Node's own crypto: no package, and nothing native for the cPanel host.
  - Links and session cookies are random 256-bit tokens, and the database keeps only their sha256.
- **Sessions in the database, for 30 days,** in a `__Host-session` cookie:
  - The role is read on every request, so "No access" takes effect on the next page.
  - A password change or reset ends the other sessions.
- **The same answer for a wrong password and an unknown email,** and for "Forgot password" whether or not the account exists. Its email goes out after the answer.
- **Links come from `APP_URL` only,** never from the request, so a forged Host header can't redirect a reset email.
- **The first Admin comes from `ADMIN_EMAIL`,** because the cPanel host has no shell to create one.
- **After signing in, the home page,** not the page first asked for: server pages here can't see their own address without Next.js internals.
- **Two-factor login comes next (M5d):** an authenticator app and backup codes, required for Admins.
- **Two e2e suites:** test logins (port 3100), and password mode on the local MySQL (port 3101), from one build. The sign-in mode is read at request time only.
