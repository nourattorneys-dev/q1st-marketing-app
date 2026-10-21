# Articles AI — Marketing Dashboard

Review, approve and schedule AI-drafted articles and social posts. One deployment per website; the AI engine is Quantum1st's (API contract: `docs/specs/Marketing Portal Build Spec v1.1.html`).

## Run locally

    pnpm install
    cp .env.example .env.local
    pnpm dev            # http://localhost:3000 → /en

- `AUTH_MODE=mock`: local test logins (Admin, Reviewer, and a user with no role). Refused on Vercel, and refused in production builds unless `ALLOW_TEST_LOGINS=1` (the e2e suite sets it).
- `ENGINE_MODE=mock`: built-in sample data. To simulate engine problems, set the browser cookie `mock_scenario` to `unauthorized`, `down` or `drift`.

## Checks

    pnpm lint && pnpm typecheck && pnpm test && pnpm e2e && ALLOW_TEST_LOGINS=1 pnpm build

## Docs

- Design: `docs/specs/2026-10-21-marketing-dashboard-design.md`
- API contract: `docs/specs/Marketing Portal Build Spec v1.1.html`
- Plans: `docs/plans/`

## Real sign-in (Clerk)

1. Create an application at https://dashboard.clerk.com and enable **Microsoft** and **Email code** sign-in.
2. Put its keys in `.env.local` (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`) and set `AUTH_MODE=clerk`.
3. Rebuild (`pnpm build`). `AUTH_MODE` is read at build time.
4. Give the first person the Admin role: Clerk dashboard → Users → the user → Metadata → **Public** → `{ "role": "admin" }`. Reviewers get `{ "role": "reviewer" }`. Anyone without a role sees "No access yet".

Clerk's keyless mode didn't activate in testing (2026-10-21), so keys are needed even locally. Use `AUTH_MODE=mock` until then.

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
