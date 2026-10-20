# Articles AI — Marketing Dashboard: Design

**Status:** Draft for review. Planning phase, no code until this document and the implementation plan are approved.
**Date:** 2026-10-21
**Source:** `Articles AI/Marketing Portal Build Spec.html` (v1), the design prototype in `Articles AI/Design from Nour Attorneys portal/`, and the planning decisions taken on 2026-10-20/21.

---

## 1. Purpose

A dashboard where Quantum1st's AI engine:
- proposes keywords and article topics
- drafts English and Arabic articles and social posts

People then review, edit and approve each item, and approved items publish to the website and social accounts on a schedule. The first website is **fakhernco.com**. The same dashboard must be reusable for other websites later.

**Stated by the owner:**
- Quantum1st runs the AI engine.
- Websites may run on **WordPress or Strapi** and may move between them.
- The dashboard will be reused for other websites.
- Nothing is coded until the plan is clear.

**Assumed (correct if wrong):**
- Quantum1st's engine is not live yet: the API address in the v1 spec is the placeholder `api.<our-domain>`.
- English and Arabic are both needed from day one.

**Success:**
- Fakher & Co staff can take an article from idea → draft → review → approval → scheduled publication on fakhernco.com, in English and Arabic.
- Nothing publishes without a person's approval, unless auto-publish is on, and even then only articles that were already approved.
- Moving a site between WordPress and Strapi, or adding a new website, needs configuration only, not code.

## 2. Decisions

| # | Decision | Why |
|---|---|---|
| D1 | **Quantum1st** builds and runs the AI engine; we use its API | Owner's choice; matches the v1 spec |
| D2 | **We build the dashboard** (Next.js App Router) | Owner's choice |
| D3 | **One deployed copy per website**, no site switcher | Matches the spec's one-key-per-site model and keeps each client's data apart |
| D4 | Two roles: **Admin** and **Reviewer** | Risky settings stay with the Admin; staff sign off content |
| D5 | Hosted on **Vercel**, one project per website copy | Native Next.js hosting, reliable HTTPS for webhooks, server-only secrets. The cPanel server's CloudLinux limits previously crash-looped Strapi |
| D6 | Sign-in through **Clerk** | Microsoft 365 or emailed-code sign-in, invitations, two-factor login and user management built in; works for future clients on any email provider |
| D7 | Version 1 = **the full v1 spec** (core flow, keywords/topics, social, site health, plan & usage) | Owner's choice; built in milestones |
| D8 | Four **AI extras** requested from Quantum1st (§12): import own article, article → social, search performance loop, legal accuracy & linking | Owner's choice |
| D9 | **WordPress and Strapi** through one generic "website connection"; Quantum1st builds one adapter per CMS | A site can switch CMS or be added by configuration |
| D10 | Arabic on WordPress = **TranslatePress `/ar/`** translation of the English post | Matches how the rest of fakhernco.com is translated |
| D11 | Sequence: **agree the API first, then build against a mock engine** in parallel with Quantum1st | Neither side codes against a spec that's about to change |
| D12 | Interface in **English and Arabic** (full right-to-left), like the prototype | Owner's choice |
| D13 | Notifications by **email** (Resend), plus badges in the dashboard | Owner's choice |
| D14 | Dashboard storage: one **Neon Postgres** per copy (Vercel Marketplace), holding operational data only | Articles stay in Quantum1st's engine (§4) |

## 3. Scope

**In version 1 (dashboard):**
- sign-in and roles
- dashboard
- keywords and topic ideas
- review list and editor
- scheduled queue and history
- site health
- settings: SEO profile, publishing schedule, website connection, social
- plan & usage
- users
- email notifications and the webhook receiver
- screens for the four extras, shown only once Quantum1st reports the feature as available (§7)

**Not in scope:**
- Building the AI engine, the CMS adapters, the Pexels search, quota metering: Quantum1st's side.
- Moving already-published articles from one CMS to another when a site switches.
- A single dashboard covering several websites (D3).
- Storing article content in the dashboard (§4).

## 4. Architecture

```
Browser ──► Dashboard (Vercel, Next.js) ──► Quantum1st API ──► AI engine ──► WordPress / Strapi / LinkedIn / Instagram
                  ▲                                               │
                  └──────── webhook (signed) ◄────────────────────┘
                  └──► email to reviewers / admin
```

Each website copy has six parts:

1. **Screens:** server-rendered pages. The browser only talks to the dashboard, never to Quantum1st.
2. **Engine client:** a server-only module, and the single place that calls Quantum1st.
   - It adds `X-Api-Key` (a server-only Vercel setting) and `X-Acting-User` (the signed-in person's email).
   - It unpacks the `{ok, data, error}` responses and maps error codes (§9).
   - It sends an idempotency key with every action (§9).
3. **Mock engine:** the same interface as the engine client, returning data in the v1.1 shapes.
   - It simulates slow jobs, version conflicts, locks, critical findings, quota limits and publish failures.
   - The setting `ENGINE_MODE = mock | live` switches between mock and real.
4. **Webhook receiver:** `POST /api/hooks/marketing`.
   - It verifies the HMAC signature against the raw body using a constant-time comparison, and ignores a repeated `X-Event-Id`.
   - It then refreshes cached screens and queues emails.
5. **Login & roles:** Clerk (§5).
6. **Small database:** one **Neon Postgres** per copy, added through the Vercel Marketplace. It holds only:
   - seen webhook event IDs (kept 30 days)
   - the webhook secret, encrypted
   - the notification log and preferences

**Not stored in the dashboard:** articles, keywords, photos, schedules. They live in Quantum1st's engine, so switching a site's CMS never touches the dashboard and there's almost nothing to back up.

## 5. Login & roles

- **Sign-in:** Clerk, one Clerk application per website copy.
  - Fakher & Co sign in with Microsoft 365 accounts or an emailed code.
  - The Admin invites users and sets their role, which is stored in the user's Clerk metadata.
- **Two-factor login:** required for the Admin, recommended for Reviewers.
- **Enforcement:** every server action and page checks the role on the server. A button appears only if **both** the engine's `post.actions` allows the action **and** the role allows it.

| Area | Admin | Reviewer |
|---|:-:|:-:|
| Keywords, topic ideas, drafting, importing articles | ✅ | ✅ |
| Review, edit, approve, ask for changes, reject, delete | ✅ | ✅ |
| Override a critical finding (reason required, shown in History) | ✅ | ✅ |
| Schedule: hold, resume, publish now; History: retry | ✅ | ✅ |
| Site health: view | ✅ | ✅ |
| Site health: apply a fix (changes the live site) | ✅ | ❌ |
| Settings: SEO profile, publishing schedule, website connection, social, webhook | ✅ | ❌ |
| Users; plan & upgrade requests | ✅ | ❌ |

## 6. Website connection (WordPress + Strapi)

This replaces the v1 spec's Strapi-only model. It's a contract change requested from Quantum1st (§12); the dashboard side is generic.

**Model:**
```
PublishTarget {
  type: "wordpress" | "strapi"            // allowed types and their form fields come from GET /meta → targetTypes
  settings: { ... }                        // type-specific (site URL, post type/collection, default category, author…)
  secretSet: boolean                       // WordPress app password / Strapi token; write-only, never returned
  fieldMap: { title, slug, excerpt, metaTitle, metaDescription, category, author }   // simple fields only
  body: { format: "html" | "boldbuilder" | "blocks", blockMap?: { heading: "...", paragraph: "...", ... } }
  arabic: { mode: "translatepress" | "separate" | "locale" }
  status: "ok" | "error" | "missing", lastCheckedAt, lastError, version
}
```

**Dashboard behaviour:**
- The "Website connection" settings form is drawn from `/meta.targetTypes`.
- **Test connection** returns categories, languages, available fields and block types, plus a suggested `fieldMap`/`blockMap`. The form is pre-filled from these.
- **Switching type:** the new connection must pass its test before it can be saved. Published articles keep `published.{target, url, externalId}`; new articles go to the new target.

**Renames across the spec:**

| v1 | v1.1 |
|---|---|
| `StrapiSettings` | `PublishTarget` |
| `GET/PUT …/settings/strapi` | `GET/PUT …/settings/website` |
| `POST …/settings/strapi/test` | `POST …/settings/website/test` |
| `GET …/strapi/categories` | `GET …/website/categories` |
| `site.connections.strapi` | `site.connections.website` |
| webhook `connection.changed` type `strapi` | type `website` |

`Post.published` gains `target` and `externalId`.

**Quantum1st's WordPress adapter must:**
- **Log in** with an **Application Password** for a dedicated Editor user, never an admin. On fakhernco.com this means unticking Wordfence → Login Security → "Disable WordPress application passwords" (live check on 2026-10-20 returned `501 application_passwords_disabled`).
- **Publish** through `/wp/v2/posts`, upload images through `/wp/v2/media`, and read categories from `/wp/v2/categories`.
- **Ship a small helper plugin** for WordPress that writes Yoast's SEO title and description, and writes the Arabic text as the **TranslatePress** translation of the English post. Neither has a write API by default.
- **Body format:** `html` by default, as in post 9082. `boldbuilder` is available per site, because older fakhernco.com posts use Bold Builder shortcodes.

**Quantum1st's Strapi adapter must:**
- Convert the article body into the site's **dynamic-zone blocks**. On fakhernco's Strapi those are `blocks.heading`, `paragraph`, `list`, `data-table`, `faq`, `cards`, `image`, `button`, `quote` and `gallery`. Block names differ per site, so the test suggests the `blockMap`.
- Fill the `shared.seo` component, upload images to the media library, and publish Arabic as the `ar` locale of the same entry.

**Matching structure (required for TranslatePress):**
- The engine keeps an Arabic version **structurally identical** to its English version: the same headings, paragraphs and list items, in the same order.
- If they don't match, the Arabic post gets a **critical** finding, `structure_mismatch`. On TranslatePress sites it **can't be overridden** (publishing it would scramble the translation); on other sites it's a warning.
- The editor shows both versions side by side (§7).

## 7. Screens

There's no `/sites/[siteId]` prefix (D3). The site ID comes from `GET /sites` once on the server and is cached.

| Route | Who | Notes |
|---|---|---|
| `/sign-in` | all | Clerk |
| `/` (dashboard) | all | counts, next publish slot, connection warnings, quota bars |
| `/keywords` | all | tabs: New / In use / Covered / Dismissed; add, approve, dismiss, restore; AI propose; topics for selected; draft for selected |
| `/ideas` | all | topic cards, draft (en / ar / both), dismiss, bulk, new request form |
| `/review` | all | drafting/pending cards: spinner, language-pair badge, finding counts, photo; bulk approve/publish |
| `/review/[postId]` | all | the editor (fields, photo panel, checks, sources, actions) plus the **side-by-side English/Arabic view** |
| `/scheduled` | all | queue, expected times, hold/resume, publish now; banner with auto-publish state and next slot or why nothing is going out |
| `/history` | all | published, failed and rejected items; live URL, error, retry; override reasons |
| `/site-health` | all; Admin applies fixes | scan, prepare fixes, apply/dismiss |
| `/settings/seo`, `/settings/schedule`, `/settings/website`, `/settings/social` | Admin | one form per model; the website form comes from `/meta` (§6) |
| `/plan` | Admin | quota bars, usage chart, results, request upgrade |
| `/users` | Admin | Clerk user management plus role |
| `/import`, `/performance` | all | the extras; **hidden until `/meta.features` lists them**, then shown without a redeploy |

The other two extras don't get their own screens:
- **Article → social** is a "Create social posts" button on an approved or published article (editor and History).
- **Legal accuracy & linking** shows up as findings in the editor's Checks panel, with internal-link suggestions listed under Sources.

Both appear only when `/meta.features` lists `repurpose` / `legalChecks`.

**Display rules:**
- **Language:** the interface switches between English and Arabic (fully right to left). Arabic content always renders right to left: editor, preview, cards.
- **Times** show in 12-hour AM/PM in the site's timezone (fakhernco: Asia/Dubai).
- **Nothing hard-coded:** languages, platforms, limits, metrics, page sizes and poll interval all come from `/meta`, `/account/plan` or settings.
- **Look:** taken from the prototype's design tokens (colours, IBM Plex Sans / IBM Plex Sans Arabic / Newsreader / Noto Naskh Arabic, light and dark). The prototype's placeholder brand ("Meridian", "ميريديان للمحاماة") is not reused, and no copy calls a client a "law firm".

## 8. Data flow

- **Reads:** server components call the engine client per request; the browser never receives the key.
- **Actions:** server actions run these steps in order:
  1. check the role
  2. send `X-Acting-User` and an idempotency key
  3. send `version` for edits, so a `409 version_conflict` is caught
  4. refresh the affected screens
- **Slow AI jobs** (drafts, keyword or topic proposals, scans, fix preparation):
  - The screen shows progress, and the browser polls **our** route `/api/jobs/[id]` at `/meta.pollSeconds`.
  - Webhooks (`job.finished`, `post.drafted`, …) also refresh screens and trigger emails, so a lost webhook only delays an update; nothing gets stuck.

## 9. Errors and retries

| Code | Screen behaviour |
|---|---|
| 400 `invalid_input` | the message next to each field (`error.fields`) |
| 401 `unauthorized` | site-wide banner "Service unavailable, contact Quantum1st" |
| 404 `not_found` | back to the list with a message |
| 409 `version_conflict` | "Someone saved first", showing both versions; nothing is discarded |
| 409 `locked` | "Being edited by X" with **Take over** |
| 422 `framework_blocked` | the critical findings plus the override box (reason required) |
| 422 `not_connected` | Admin: link to the settings page. Reviewer: "Ask your admin" |
| 429 `quota_exceeded` | "Monthly limit reached for {metric}". Admin: **Request upgrade**. Reviewer: "Ask your admin" |
| 502 `publish_failed` | message plus **Retry** |
| 503 `engine_busy` | "Queued, try again shortly" |

- **Read requests** retry automatically, with growing waits, after network errors.
- **Actions are never retried automatically.** For a manual retry:
  - **If no response arrived** (network error, timeout), the retry **reuses the same idempotency key**. If the first attempt actually went through, Quantum1st returns its original result instead of publishing twice.
  - **After a definite error response** (e.g. `502 publish_failed`), **Retry** sends a **new** key, because it's a genuinely new attempt.

## 10. Notifications

Emails go through **Resend**, chosen for its simple API and Vercel integration; switching providers only affects one module. Sending from `@fakhernco.com` needs its DNS records (DKIM, plus the provider's sending subdomain) added in **Cloudflare**; the Microsoft 365 mail setup is unaffected. Emails are grouped per batch, not sent once per item.

| Event | Recipients |
|---|---|
| `post.drafted` (grouped: "3 drafts ready"), redraft finished | Reviewers |
| `post.failed`, `connection.changed` (broken or expiring), `quota.warning` / `quota.exceeded`, `site.scan_finished` | Admin |

The same events also show as badges and banners in the dashboard.

## 11. Security

- **Quantum1st API key:** a server-only Vercel environment variable, never prefixed `NEXT_PUBLIC_`. An automated test confirms it never appears in browser traffic.
- **Webhook secret:** returned once by Quantum1st, stored encrypted in the database; the encryption key is a Vercel environment variable.
- **Webhooks:** HMAC over the raw body with a constant-time comparison, rejecting failures; repeated `X-Event-Id` values are ignored.
- **Roles:** checked on the server for every page and action. Two-factor login is required for the Admin.
- **Secrets:** none in the repository; `.env*` files are git-ignored. This follows the 2026-10-12 incident, when Strapi's `.env` was publicly downloadable.
- **Audit:** Quantum1st logs `X-Acting-User` on every change; Clerk logs sign-ins.

## 12. Requests to Quantum1st (spec v1.1)

These go to Quantum1st as one change request, alongside spec v1.1:

1. **Status:** is the engine live? We need the real API base URL, a test (sandbox) key, and an estimated timeline.
2. **Website connection:** the generic `PublishTarget` and the renames in §6.
3. **WordPress adapter:**
   - Application Password authentication
   - posts, media and categories
   - the helper plugin (Yoast fields, TranslatePress writes)
   - body format `html | boldbuilder`
4. **Strapi adapter:** conversion to dynamic-zone blocks with a suggested `blockMap`, the `seo` component, media, and the `ar` locale.
5. **Matching structure:** Arabic twins must mirror the English structure; a mismatch is a critical finding.
6. **Feature flags:** `/meta.features` (e.g. `import`, `repurpose`, `performance`, `legalChecks`) and `/meta.targetTypes`.
7. **Idempotency:** accept an `Idempotency-Key` header on every POST/PUT/DELETE action. A repeated key returns the original result for at least 24 hours.
8. **Extra: import own article.** Upload `.docx` or paste HTML → checks, slug, meta title/description, photo, Arabic version → normal review flow.
9. **Extra: article → social.** Create LinkedIn and Instagram drafts from an approved article, linking back to it.
10. **Extra: search performance loop.** A Search Console connection (OAuth, in the social-connection style); clicks and impressions per published article; keyword ideas from real queries (source `search_console`); refresh suggestions when an article loses traffic or a cited law changes.
11. **Extra: legal accuracy & linking:**
    - check that cited laws link to official sources (e.g. uaelegislation.gov.ae)
    - "human" findings for claims needing professional sign-off
    - internal-link suggestions to existing service pages and articles
    - FAQ structured data (JSON-LD)
    - updating `llms.txt` on publish
12. **The article-checks rulebook:** findings cite references like `§4.6.1`, but the rulebook isn't included. Please send it.
13. **Corrections to the v1 text:**
    - **Post model:** `createdAt`, `updatedAt` and `version` sit inside a `//` comment; move them out.
    - **429 error:** it refers to `error.details`, but the envelope only has `code`, `message` and `fields`. Add `details` to the envelope.
    - **Checklist wizard:** the item "wrong Strapi token blocks the wizard" contradicts "first-run setup has no page". Reword it as "the website connection test blocks saving".
    - **Site switcher:** remove it from the page layout (one key = one site; D3).
    - **`PUT /sites/{id}` `profile`:** this field doesn't exist on Site. Remove it, or say it means the SEO settings profile.
    - **Locking:** specify how a lock is taken and released, and show `lockedBy` and `lockedAt` on Post.
    - **Small gaps:**
      - a button for the keyword `restore` action
      - a suggestion status after drafting finishes (e.g. `drafted`)
      - state that Instagram posts require an image
      - the real base URL

## 13. Milestones

| # | Delivers | Depends on |
|---|---|---|
| M0 | Spec v1.1 and the §12 request sent; Quantum1st sign-off and a test key | Quantum1st |
| M1 | Foundation: Clerk sign-in and roles, bilingual right-to-left layout and design tokens, engine client and mock engine, database, Vercel preview | M0 sign-off |
| M2 | Core flow: dashboard, review list, editor (with side-by-side view), approve/override/changes/reject/delete/publish, scheduled, history | M1 |
| M3 | Keywords and topic ideas; settings (SEO profile, schedule, website connection, social) | M2 |
| M4 | Social post editing, site health, plan & usage, users, webhook receiver, email notifications | M3 |
| M5 | Switch to the live API, with drift checks against the sandbox; WordPress preparation on fakhernco.com (Editor user, app password, helper plugin); fakhernco go-live | engine live |
| M6 | Extras (`/import`, article→social, `/performance`, legal checks), each as Quantum1st ships it | Quantum1st |

At each milestone you review the screens live on the Vercel preview, loaded with sample data.

## 14. Testing

- **Drift checks:** one set of schemas describes the v1.1 shapes. The mock engine is validated against it, and at M5 the same checks run against Quantum1st's sandbox to report any drift.
- **Unit tests:**
  - **Engine client:** response unpacking, the error-code mapping, idempotency keys.
  - **Webhook:** a wrong signature is rejected; a repeated event ID is ignored.
  - **Role guards:** a Reviewer calling a settings action on the server gets 403.
  - **Time formatting:** Dubai time, 12-hour.
- **Browser tests** (each v1.1 acceptance item):
  - an approval with a critical finding is refused, and goes through with an override reason
  - an English/Arabic pair is approved separately
  - nothing publishes from Scheduled while auto-publish is off
  - the API key is absent from the browser network log
  - a hard quota shows the 429 message and the upgrade path
  - Arabic renders right to left in the editor, preview and cards
  - times show in 12-hour Dubai time
  - every change sends `X-Acting-User`

## 15. Facts verified during planning (2026-10-20)

- **No engine exists yet:** no AI engine, AI SDK usage, AI/Pexels API key, or implementation of `/api/v1` exists in any project under `~/Documents/GitHub`.
- **The WordPress REST API on fakhernco.com is public**, but Application Passwords are disabled by Wordfence (`501`).
- **Post formats differ:** 2025 posts use Bold Builder markup; post 9082 (commission article) is plain HTML with its Yoast description set.
- **The `/ar/` copy is English text:** `fakhernco.com/ar/commission-payable-uae-labour-law/` is served as Arabic right-to-left by TranslatePress, but the article text is still English. The Arabic article isn't published.
- **The Strapi `post` body is a dynamic zone** (10 block types) with `shared.seo` and i18n. `cms.fakhernco.com` is deactivated, and its secrets must be rotated before reuse.
- **The prototype is a different product:** a legal practice-management admin (Matters, Clients, Billing). It's a style reference only.

## 16. Open items (settle during M0–M1; none blocks this design)

1. **Body format on fakhernco.com:** plain HTML vs Bold Builder. Decide after a visual comparison of post 9082 against a 2025 post.
2. **Pricing:** confirm current prices for Vercel Pro (a client dashboard is commercial use), Clerk, Neon/Postgres and the email service.
3. **Dashboard address:** e.g. `portal.fakhernco.com`, which needs a Cloudflare DNS record pointing to Vercel.
4. **Timing of the Wordfence change:** turn on Application Passwords only at M5, for the dedicated Editor user.
5. **Arabic commission article:** add it as the TranslatePress translation of post 9082 rather than a separate post (independent of this project).

## 17. Tech stack (approved 2026-10-21)

**One codebase** in a new git repository (`~/Documents/GitHub/articles-ai-dashboard`). Every website copy is the same code deployed as its own Vercel project with its own environment variables (D3).

| Layer | Choice (latest stable on 2026-10-21) | Purpose |
|---|---|---|
| Language | TypeScript (7.0.2; fall back to the latest 5.x if Next.js 16 compatibility isn't solid) | Type-checks against the v1.1 API shapes |
| Framework | Next.js 16.4 (App Router) + React 19.3 | Required by the spec; server components and server actions keep the key server-side |
| API shapes | Zod 4.6 | One schema set: validates live responses, generates mock data, runs the drift checks (§14) |
| Auth | Clerk (`@clerk/nextjs` 7.9) | D6 |
| Interface in two languages | next-intl 4.14 + Radix `DirectionProvider` | English/Arabic, right-to-left switching, Dubai 12-hour time formatting |
| Styling | Tailwind CSS 4.3, prototype design tokens as CSS variables | Light/dark mode, logical (left/right-neutral) properties for right-to-left |
| Components | shadcn/ui (Radix) | Accessible dialogs, menus, tabs; owned and restyled in the repo |
| Editor | TipTap 3.32 | HTML output (spec §4 `content`), right-to-left paragraphs |
| Forms | React Hook Form 7.90 + Zod | Settings forms, including the `/meta`-driven website-connection form |
| Tables | TanStack Table 9.3 | Keyword and review tables with selection and bulk actions |
| Chart | Recharts 3.10 | Plan & usage monthly chart |
| Database | Neon Postgres (`@neondatabase/serverless` 1.2) + Drizzle ORM 0.45 | D14; typed schema with migrations |
| Email | Resend 6.34 + React Email | D13; bilingual templates |
| Tests | Vitest 5 (unit) + Playwright 1.64 (browser) | §14 |
| Hosting | Vercel, one project per website | D5 |

**Deliberately not used:**
- a client data-fetching library: server components load data, and a small hook polls `/api/jobs/[id]`
- a separate backend service: the engine is Quantum1st's

Exact versions are pinned in the implementation plan after a compatibility check.
