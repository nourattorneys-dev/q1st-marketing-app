# M3b: Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the second half of design §13 M3, the Admin's settings pages:
- `/settings/seo`: the SEO profile the AI writes from, a share picture, and AI suggestions for focus keywords and the call to action
- `/settings/schedule`: auto-publish on or off, posts a day, days, hours and the gap between posts, with the next slot from the engine
- `/settings/website`: the website connection, drawn from `/meta.targetTypes`, with Test connection, field and block maps, and a save that's blocked until a changed connection passes its test
- `/settings/social`: Connect, Reconnect and Disconnect per social account (OAuth), token expiry, and Google Search Console when `/meta.features` lists `performance`

It also folds in the deferred items that need these pages:
- The dashboard's connection warnings link to the page that fixes them (M1 follow-up).
- A first-run site sends the Admin to the website connection, then to social accounts (spec v1.1 §6).
- A `422 not_connected` gives the Admin a link to the right settings page and tells a Reviewer to ask the admin (design §9; M2b follow-up).

**Architecture:**
- **Mock engine:** a new settings store holds the four models with versions, validation and field errors. It remembers which connection values passed a test and refuses a changed connection without one. The publishing settings drive the mock queue's slots. Site connections and `not_connected` come from what's set up.
- **Pages:** server-rendered under `<Suspense>` and guarded by `settings.manage`, with client forms. One shared hook gives every form its versioned draft:
  - a save sends the version the form started from
  - a newer version replaces the form only when nothing is unsaved
  - a 409 shows both values, with Keep my changes / Use the saved version
- **Pure modules:** the website form's rules (switch type, needs-test, prefill, the request it sends) live in a pure module with unit tests.

**Tech Stack:** Next.js 16.4 (App Router, Cache Components), React 19.3, TypeScript 5, next-intl 4.14, Zod 4.6, shadcn/ui, Vitest 5, Playwright 1.64. No new dependencies.

**Spec:**
- `docs/specs/2026-10-21-marketing-dashboard-design.md`:
  - §5 roles: settings are Admin only
  - §6 website connection
  - §7 screens: `/settings/seo`, `/settings/schedule`, `/settings/website`, `/settings/social`
  - §9 errors: 400 field messages, 409 both versions, 422 `not_connected` by role
- `docs/specs/Marketing Portal Build Spec v1.1.html`:
  - §2 ground rules: nothing hard-coded
  - §4 SeoSettings, PublishingSettings, PublishTarget, SocialConnection, Meta.targetTypes
  - §6 first-run setup and "/settings/seo · /publishing · /website · /social"
  - §7 settings endpoints
  - §9 errors
  - §10 acceptance: a wrong password blocks the save; the website form is drawn entirely from `/meta.targetTypes`
- Follow-ups: `docs/plans/2026-10-21-m1-followups.md`, `2026-10-22-m2b-followups.md` and `2026-10-22-m3a-followups.md`

## Global Constraints

- **Earlier constraints still hold:** all M1, M2a, M2b and M3a Global Constraints. In particular:
  - Cache Components: runtime data, including `searchParams`, only inside `<Suspense>`
  - the engine key stays server-only
  - Latin digits and logical CSS
  - never "law firm": Fakher & Co is a "legal consultancy", including in the mock SEO profile and the AI's proposals
  - changes go through server actions (role check, Zod, `X-Acting-User`, key, `ActionResult`, `refresh()` on success) via `useEngineAction` / `useEngineUpload`
  - lists are parsed leniently
  - every e2e test isolates the mock store
- **No new packages.**
- **Admin only (design §5):**
  - Every settings page calls `requirePermission(locale, "settings.manage")` inside its Suspense boundary.
  - Every settings action goes through `change(…, "settings.manage")`, `ask(…, "settings.manage")` or `engineFor(locale, "settings.manage")`.
  - The Settings menu item needs `settings.manage`.
- **Routes (design §7):** `/settings/seo`, `/settings/schedule`, `/settings/website` and `/settings/social`. The engine endpoint for the schedule stays `…/settings/publishing` (spec v1.1 §7).
- **Nothing hard-coded (spec §2, §10):**
  - From `/meta.targetTypes`: website types, each type's fields (key, label, kind, required), body formats and Arabic modes.
  - From the last passing connection test: the choices in the field and block maps. A map's rows are its saved keys plus the test's suggested ones.
  - From the engine: social rows (`GET …/settings/social`), languages (`/meta.languages`), photo types and size (`/meta.limits`), and the next publish slot (`GET …/scheduled`; never worked out in the browser).
  - **The only fixed lists:**
    - the seven weekday codes `sun…sat` (spec §4 PublishingSettings)
    - the rule "a block map goes with body format `blocks`"
- **Labels:** an engine-labelled field shows the engine's label in English. In Arabic it shows a translation when we have one for its key, and the engine's label otherwise.
- **The website secret is write-only:**
  - It's never rendered, logged or returned by an action.
  - An empty secret field means "keep the stored one": it's left out of the test and the save.
- **Versions (spec §3, design §9):**
  - SEO, schedule and website saves send the version the form started from.
  - A 409 shows both values; Keep my changes saves my changed fields on top of theirs.
- **Field errors (spec §9):** a 400's `error.fields` show next to their fields (engine snake_case → camelCase), and unknown names are listed under the form.
- **OAuth (spec §7):**
  - The return address is built on the server from the request's own host: `${origin}/${locale}/settings/social`.
  - The browser follows the engine's `authorizeUrl` only if it's `https:`, or `http:` on localhost.
- **Mock-only behaviour, checked at M5:**
  - The mock's OAuth completes at once: `authorizeUrl` is `returnUrl?connected=<platform>`.
  - A secret containing "wrong" fails the connection test.
  - The share-picture endpoints don't change the SEO profile's version, and `DELETE …/seo/picture` returns `{removed: true}`.
  - The SEO proposal job's `result` is `{focusKeywords, cta}`.
  - `422 not_connected` carries `details.connection` (`website`, `linkedin`, `instagram`).
  - **Scenarios:**
    - `firstrun`: a store created with no website or social connection
    - `performance`: `/meta.features` is `["performance"]` and the site reports `searchConsole`

## Review Focus

1. **A wrong WordPress application password or Strapi token fails the test with its message, and Save stays blocked** (spec §10). Changing a connection field after a passing test blocks Save again. A change to only the maps, format or Arabic mode saves without a test.
   - *Pinned by:* Task 3 store tests, Task 7 unit tests (`needsTest`, `connectionFingerprint`) and Task 7 e2e.
2. **Switching WordPress → Strapi works from `/meta` alone:**
   - Only Strapi's fields show, and a new secret is required.
   - The test pre-fills the field map and block map.
   - Body format becomes `blocks` and Arabic mode `locale`.
   - Published articles keep `published.target` "wordpress"; new ones go to Strapi.
   - *Pinned by:* Task 3 store tests, Task 7 unit tests (`switchType`, `prefillMap`) and Task 7 e2e.
3. **The secret never comes back:**
   - After saving, the field is empty with "Saved. Leave it empty to keep it."
   - A test or save without a typed secret uses the stored one.
   - The page never contains the stored secret.
   - *Pinned by:* Task 1 (the schema drops it), Task 3, Task 7 unit tests (`toWebsiteTarget`) and Task 7 e2e.
4. **Someone else saved first on a settings form:**
   - Both values show, and nothing is discarded silently.
   - Keep my changes keeps both people's edits.
   - *Pinned by:* Task 4 draft unit tests and Task 6's two-person e2e.
5. **Settings by role:**
   - A Reviewer has no Settings menu item, and the settings pages and actions refuse them.
   - On a `not_connected` publish, a Reviewer is told to ask the admin; an Admin gets a link to the right settings page.
   - A first-run Admin is sent to the website connection, then to social accounts.
   - *Pinned by:* Task 4 unit tests (permission), Task 5 e2e and Task 9 e2e.

## File map (new unless marked)

```
src/lib/engine/schemas.ts                       (modify) SeoSettings, PublishingSettings, PublishTarget, WebsiteTest, SocialConnection, inputs
src/lib/engine/api.ts                           (modify) settings methods
src/lib/engine/mock/outcome.ts                  MockOutcome, ok, fail (moved out of store.ts so the settings store can use them)
src/lib/engine/mock/settings-fixtures.ts        seeded SEO profile, schedule, website connection, social accounts, adapters
src/lib/engine/mock/settings-store.ts           the four settings models, connection tests, OAuth, connections
src/lib/engine/mock/schedule.ts                 (modify) slots follow the publishing settings
src/lib/engine/mock/store.ts                    (modify) uses the settings store: slots, SEO proposal job, not_connected, publish target
src/lib/engine/mock/server.ts                   (modify) settings routes, firstrun and performance scenarios, site connections
src/lib/engine/mock/registry.ts                 (modify) a store can be created for a first run
src/lib/engine/index.ts                         (modify) the firstrun scenario creates a first-run store
src/lib/actions/server.ts                       (modify) ask(): an engine request with no page refresh
src/lib/settings/draft.ts                       versioned settings drafts (pure)
src/lib/settings/addresses.ts                   originOf, safeRedirectUrl (pure)
src/lib/settings/field-errors.ts                settingsFieldErrors (pure)
src/lib/settings/schedule-form.ts               the schedule form ↔ PublishingSettings (pure)
src/lib/settings/seo-form.ts                    the SEO form ↔ SeoSettings, AI proposals (pure)
src/lib/settings/website-form.ts                the website form's rules (pure)
src/lib/settings/social.ts                      social rows, the ?connected= notice (pure)
src/app/[locale]/(app)/settings/actions.ts      every settings action (settings.manage)
src/app/[locale]/(app)/settings/{seo,schedule,website,social}/page.tsx
src/components/settings/settings-tabs.tsx       the four pages' tabs
src/components/settings/use-settings-draft.ts   the shared form hook
src/components/settings/settings-conflict.tsx   "Someone saved first" with both values
src/components/settings/form-parts.tsx          SaveBar, FieldMessage, OtherFieldErrors, SaveFailure
src/components/settings/schedule-view.tsx, schedule-form.tsx
src/components/settings/seo-view.tsx, seo-settings-form.tsx, share-picture.tsx
src/components/settings/website-view.tsx, website-settings-form.tsx, map-editor.tsx
src/components/settings/social-view.tsx, social-board.tsx
src/components/shell/nav.ts, nav-link.tsx, sidebar-nav.tsx            (modify) the Settings item
src/lib/dashboard/connections.ts                (modify) settingsPageFor
src/components/dashboard/connection-warnings.tsx (modify) links, first-run redirect
src/components/actions/action-error.tsx         (modify) not_connected by role
src/components/editor/confirm-dialog.tsx, action-bar.tsx, editor-footer.tsx, post-editor.tsx  (modify) canManageSettings
src/app/[locale]/(app)/review/[postId]/page.tsx (modify) canManageSettings
src/components/schedule/schedule-board.tsx, scheduled-queue.tsx      (modify) canManageSettings
src/components/history/history-board.tsx, history-list.tsx           (modify) canManageSettings
messages/en.json, messages/ar.json              (modify) Shell.nav.settings, Settings, NotConnected, Dashboard.connections.fix
tests/unit/engine-settings.test.ts, mock-settings.test.ts, settings-lib.test.ts, settings-actions.test.ts,
  schedule-form.test.ts, seo-form.test.ts, website-form.test.ts, social-rows.test.ts
tests/unit/mock-schedule.test.ts, nav.test.ts, dashboard.test.ts      (modify)
tests/e2e/helpers.ts                            (modify) firstrun and performance scenarios
tests/e2e/settings-schedule.spec.ts, settings-seo.spec.ts, settings-website.spec.ts, settings-social.spec.ts, settings-links.spec.ts
README.md, docs/plans/2026-10-22-m3b-followups.md
```

**Messages:** each task adds its keys to `messages/en.json` and `messages/ar.json` with the helper the earlier plans used:

```bash
python3 .superpowers/tools/merge_messages.py messages/en.json Settings.schedule /path/to/fragment.json
```

Keep the two files' keys identical (`tests/unit/messages.test.ts` checks it). Every task's messages are given in full, in both languages.

---

### Task 1: Engine contract for settings

**Files:**
- Modify: `src/lib/engine/schemas.ts`, `src/lib/engine/api.ts`
- Test: `tests/unit/engine-settings.test.ts` (create)

**Interfaces:**
- Consumes: M3a `fakeEngine(routes)` from `tests/unit/fake-engine.ts`; M2b `parseItems`, `idSegment`, `JobStartSchema`, `RemovedSchema`, `ChangeContext`, `SLOW_CHANGE_MS`
- Produces:
  - **Schemas and types:**
    - `SeoSettingsSchema` / `type SeoSettings`: list fields are always arrays.
    - `SeoUpdateSchema` / `type SeoUpdate`: the PUT body, without `ogImageUploaded`.
    - `PublishingSettingsSchema` / `type PublishingSettings`: also the PUT body.
    - `PublishTargetSchema` / `type PublishTarget`: `settings` and `fieldMap` are always objects; there's no `secret`.
    - `WebsiteTargetInputSchema` / `type WebsiteTargetInput`: the test body. It's `{type, settings, secret?, fieldMap, body: {format, blockMap?}, arabic: {mode}}`.
    - `WebsiteUpdateSchema` / `type WebsiteUpdate`: the input plus `version`.
    - `WebsiteTestSchema` / `type WebsiteTest`: `{ok, error?, categories, languages, fields, blockTypes, suggestedFieldMap, suggestedBlockMap}`; lists and maps are always present.
    - `SocialConnectionSchema` / `type SocialConnection`
    - `AuthorizeSchema`, `DisconnectedSchema`, `PictureSchema`
    - `type TargetType = Meta["targetTypes"][number]` and `type TargetField = TargetType["fields"][number]`
  - **API methods:**
    - SEO:
      - `seoSettings(): SeoSettings`
      - `saveSeo(update, ctx): SeoSettings`
      - `proposeSeo(ctx): JobStart`
      - `uploadSeoPicture(file, ctx): {url}`
      - `removeSeoPicture(ctx): {removed}`
    - Schedule:
      - `publishingSettings(): PublishingSettings`
      - `savePublishing(update, ctx)`
    - Website:
      - `websiteSettings(): PublishTarget`
      - `saveWebsite(update, ctx): PublishTarget`
      - `testWebsite(target, ctx): WebsiteTest`
    - Social:
      - `socialConnections(): { connections; skipped }`
      - `connectSocial(platform, returnUrl): {authorizeUrl}` (a GET; the platform must be an engine id)
      - `disconnectSocial(platform, ctx): {disconnected}`
    - Search Console:
      - `connectSearchConsole(returnUrl): {authorizeUrl}`
      - `disconnectSearchConsole(ctx)`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/engine-settings.test.ts
import { describe, expect, it } from "vitest";
import type { SeoUpdate } from "@/lib/engine/schemas";
import { fakeEngine, type FakeCall } from "./fake-engine";

const ctx = { actingUser: "admin@example.com", idempotencyKey: "key-12345678" };
const SEO = {
  siteName: "Fakher & Co",
  siteUrl: "https://fakhernco.com",
  blogPath: "/insights",
  defaultLang: "en",
  focusKeywords: ["legal consultancy dubai"],
  locations: ["Dubai"],
  author: "Fakher & Co",
  cta: "Book a consultation",
  tone: "clear",
  audience: "UAE businesses",
  avoid: [],
  version: 3,
};
const SEO_UPDATE: SeoUpdate = { ...SEO, linkedin: null, instagram: null, ogImage: null };
const PUBLISHING = { autoPublish: true, perDay: 2, days: ["sun", "mon"], from: "10:00", to: "17:00", gapMinutes: 180, version: 1 };
const TARGET = {
  type: "wordpress",
  settings: { url: "https://fakhernco.com", username: "articles-ai" },
  fieldMap: { title: "title" },
  body: { format: "html" },
  arabic: { mode: "translatepress" },
};
const WEBSITE = {
  ...TARGET,
  secret: "should-never-come-back",
  secretSet: true,
  languages: ["en", "ar"],
  status: "ok",
  lastCheckedAt: "2026-10-21T09:00:00+04:00",
  lastError: null,
  version: 1,
};
const changes = (calls: FakeCall[]) => calls.filter((call) => call.method !== "GET").map((call) => [call.method, call.path, call.body]);

describe("settings (spec v1.1 §4, §7)", () => {
  it("reads the SEO profile, the schedule and the website connection; the website secret never comes back (Review Focus 3)", async () => {
    const { engine } = fakeEngine({
      "GET /sites/site_1/settings/seo": SEO,
      "GET /sites/site_1/settings/publishing": PUBLISHING,
      "GET /sites/site_1/settings/website": WEBSITE,
    });
    expect(await engine.seoSettings()).toMatchObject({ siteName: "Fakher & Co", focusKeywords: ["legal consultancy dubai"], version: 3 });
    expect(await engine.publishingSettings()).toEqual(PUBLISHING);
    const website = await engine.websiteSettings();
    expect(website).not.toHaveProperty("secret");
    expect([website.secretSet, website.settings.url, website.body?.format, website.arabic?.mode]).toEqual([true, "https://fakhernco.com", "html", "translatepress"]);
  });

  it("lists social accounts, skipping one in an unexpected shape", async () => {
    const { engine } = fakeEngine({
      "GET /sites/site_1/settings/social": [{ platform: "linkedin", accountName: "Fakher & Co", status: "expiring", expiresAt: "2026-10-30T10:00:00+04:00" }, { platform: 7 }],
    });
    const social = await engine.socialConnections();
    expect([social.connections.map((connection) => connection.platform), social.skipped]).toEqual([["linkedin"], 1]);
  });

  it("saves each model with its version, tests unsaved website values, and asks for SEO proposals", async () => {
    const { engine, calls } = fakeEngine({
      "PUT /sites/site_1/settings/seo": SEO,
      "PUT /sites/site_1/settings/publishing": PUBLISHING,
      "PUT /sites/site_1/settings/website": WEBSITE,
      "POST /sites/site_1/settings/website/test": { ok: false, error: "WordPress refused the connection (401 Unauthorized)." },
      "POST /sites/site_1/settings/seo/propose": { jobId: "j_9" },
    });
    await engine.saveSeo(SEO_UPDATE, ctx);
    await engine.savePublishing(PUBLISHING, ctx);
    await engine.saveWebsite({ ...TARGET, secret: "new-password", version: 1 }, ctx);
    expect(await engine.testWebsite(TARGET, ctx)).toEqual({
      ok: false,
      error: "WordPress refused the connection (401 Unauthorized).",
      categories: [],
      languages: [],
      fields: [],
      blockTypes: [],
      suggestedFieldMap: {},
      suggestedBlockMap: {},
    });
    expect((await engine.proposeSeo(ctx)).jobId).toBe("j_9");
    expect(changes(calls)).toEqual([
      ["PUT", "/sites/site_1/settings/seo", SEO_UPDATE],
      ["PUT", "/sites/site_1/settings/publishing", PUBLISHING],
      ["PUT", "/sites/site_1/settings/website", { ...TARGET, secret: "new-password", version: 1 }],
      ["POST", "/sites/site_1/settings/website/test", TARGET],
      ["POST", "/sites/site_1/settings/seo/propose", {}],
    ]);
  });

  it("uploads and removes the share picture", async () => {
    const { engine, calls } = fakeEngine({
      "POST /sites/site_1/settings/seo/picture": { url: "https://cdn.example/share.png" },
      "DELETE /sites/site_1/settings/seo/picture": { removed: true },
    });
    expect(await engine.uploadSeoPicture(new File(["png"], "share.png", { type: "image/png" }), ctx)).toEqual({ url: "https://cdn.example/share.png" });
    expect(((calls.at(-1)?.body as FormData).get("file") as File).name).toBe("share.png");
    expect(await engine.removeSeoPicture(ctx)).toEqual({ removed: true });
  });

  it("asks for the OAuth address with the portal's return address, and refuses a platform that isn't an id", async () => {
    const { engine, calls } = fakeEngine({
      "GET /sites/site_1/settings/social/linkedin/connect": { authorizeUrl: "https://www.linkedin.com/oauth/v2/authorization?state=x" },
      "DELETE /sites/site_1/settings/social/instagram": { disconnected: true },
      "GET /sites/site_1/settings/search-console/connect": { authorizeUrl: "https://accounts.google.com/o/oauth2/auth?state=y" },
      "DELETE /sites/site_1/settings/search-console": { disconnected: true },
    });
    const back = "https://portal.example/en/settings/social";
    expect((await engine.connectSocial("linkedin", back)).authorizeUrl).toContain("linkedin.com");
    expect(new URLSearchParams(calls.at(-1)?.search).get("returnUrl")).toBe(back);
    expect(await engine.disconnectSocial("instagram", ctx)).toEqual({ disconnected: true });
    expect((await engine.connectSearchConsole(back)).authorizeUrl).toContain("google.com");
    expect(await engine.disconnectSearchConsole(ctx)).toEqual({ disconnected: true });
    const before = calls.length;
    await expect(engine.connectSocial("../account", back)).rejects.toMatchObject({ code: "not_found" });
    expect(calls.length).toBe(before);
  });
});
```

- [ ] **Step 2: Run the tests to make sure they fail**

Run: `pnpm test tests/unit/engine-settings.test.ts`
Expected: FAIL. All 5 tests fail with `TypeError: engine.seoSettings is not a function` (or the same error for the first new method each test calls).

- [ ] **Step 3: Add the schemas**

Append to `src/lib/engine/schemas.ts`:

```ts
// ── Settings (spec v1.1 §4 SeoSettings, PublishingSettings, PublishTarget, SocialConnection; §7 settings endpoints) ──
export type TargetType = Meta["targetTypes"][number];
export type TargetField = TargetType["fields"][number];

export const SeoSettingsSchema = z.object({
  siteName: z.string(),
  siteUrl: z.string(),
  blogPath: z.string().nullish(),
  defaultLang: z.string(),
  focusKeywords: list(z.string()),
  locations: list(z.string()),
  author: z.string().nullish(),
  linkedin: z.string().nullish(),
  instagram: z.string().nullish(),
  ogImage: z.string().nullish(),
  ogImageUploaded: z.object({ url: z.string(), key: z.string().nullish() }).nullish(),
  cta: z.string().nullish(),
  tone: z.string().nullish(),
  audience: z.string().nullish(),
  avoid: list(z.string()),
  version: z.number().int(),
});
export type SeoSettings = z.output<typeof SeoSettingsSchema>;

/** PUT …/settings/seo: the whole profile but the uploaded picture, which has its own endpoint. Limits are generous; the engine validates. */
export const SeoUpdateSchema = z.object({
  siteName: z.string().max(2000),
  siteUrl: z.string().max(2000),
  blogPath: z.string().max(2000).nullable(),
  defaultLang: z.string().max(20),
  focusKeywords: z.array(z.string().max(2000)).max(500),
  locations: z.array(z.string().max(2000)).max(500),
  author: z.string().max(2000).nullable(),
  linkedin: z.string().max(2000).nullable(),
  instagram: z.string().max(2000).nullable(),
  ogImage: z.string().max(2000).nullable(),
  cta: z.string().max(2000).nullable(),
  tone: z.string().max(2000).nullable(),
  audience: z.string().max(2000).nullable(),
  avoid: z.array(z.string().max(2000)).max(500),
  version: z.number().int(),
});
export type SeoUpdate = z.infer<typeof SeoUpdateSchema>;

/** Also the PUT body: the engine works out the slots from these (spec v1.1 §4: never in the browser). */
export const PublishingSettingsSchema = z.object({
  autoPublish: z.boolean(),
  perDay: z.number().int(),
  days: z.array(z.string()),
  from: z.string(),
  to: z.string(),
  gapMinutes: z.number().int(),
  version: z.number().int(),
});
export type PublishingSettings = z.infer<typeof PublishingSettingsSchema>;

const stringMap = z
  .record(z.string(), z.string())
  .nullish()
  .transform((value) => value ?? {});

/** The website connection. The secret is write-only: the engine never returns it, and this schema would drop it if it did. */
export const PublishTargetSchema = z.object({
  type: z.string().nullish(), // known: wordpress | strapi; empty before the first connection
  settings: z
    .record(z.string(), z.unknown())
    .nullish()
    .transform((value) => value ?? {}),
  secretSet: z.boolean(),
  fieldMap: stringMap,
  body: z.object({ format: z.string(), blockMap: z.record(z.string(), z.string()).nullish() }).nullish(),
  arabic: z.object({ mode: z.string() }).nullish(),
  languages: list(z.string()),
  status: z.string(), // known: ok | error | missing
  lastCheckedAt: isoDateTime.nullish(),
  lastError: z.string().nullish(),
  version: z.number().int(),
});
export type PublishTarget = z.output<typeof PublishTargetSchema>;

/** POST …/settings/website/test: the unsaved values; without `secret` the engine tests with the stored one. */
export const WebsiteTargetInputSchema = z.object({
  type: z.string().min(1).max(60),
  settings: z.record(z.string(), z.unknown()),
  secret: z.string().max(4000).optional(),
  fieldMap: z.record(z.string(), z.string()),
  body: z.object({ format: z.string().max(60), blockMap: z.record(z.string(), z.string()).optional() }),
  arabic: z.object({ mode: z.string().max(60) }),
});
export type WebsiteTargetInput = z.infer<typeof WebsiteTargetInputSchema>;
export const WebsiteUpdateSchema = WebsiteTargetInputSchema.extend({ version: z.number().int() });
export type WebsiteUpdate = z.infer<typeof WebsiteUpdateSchema>;

export const WebsiteTestSchema = z.object({
  ok: z.boolean(),
  error: z.string().nullish(),
  categories: list(z.object({ slug: z.string(), name: z.string() })),
  languages: list(z.string()),
  fields: list(z.string()),
  blockTypes: list(z.string()),
  suggestedFieldMap: stringMap,
  suggestedBlockMap: stringMap,
});
export type WebsiteTest = z.output<typeof WebsiteTestSchema>;

export const SocialConnectionSchema = z.object({
  platform: z.string(),
  accountName: z.string().nullish(),
  status: z.string(), // known: ok | expiring | error | missing
  expiresAt: isoDateTime.nullish(),
  lastError: z.string().nullish(),
});
export type SocialConnection = z.infer<typeof SocialConnectionSchema>;

export const AuthorizeSchema = z.object({ authorizeUrl: z.string() });
export const DisconnectedSchema = z.object({ disconnected: z.literal(true) });
export const PictureSchema = z.object({ url: z.string() });
```

- [ ] **Step 4: Add the API methods**

In `src/lib/engine/api.ts`, add these names to the import from `./schemas` (keep the list alphabetical): `AuthorizeSchema`, `DisconnectedSchema`, `PictureSchema`, `PublishingSettingsSchema`, `PublishTargetSchema`, `SeoSettingsSchema`, `SocialConnectionSchema`, `WebsiteTestSchema`, `type PublishingSettings`, `type SeoUpdate`, `type WebsiteTargetInput`, `type WebsiteUpdate`.

Then, just before `const categories = once(`, add:

```ts
  const settingsPath = async (suffix: string) => `${await sitePath()}/settings${suffix}`;

  const seoSettings = async () => (await client.request({ method: "GET", path: await settingsPath("/seo"), schema: SeoSettingsSchema })).data;

  const saveSeo = async (update: SeoUpdate, ctx: ChangeContext) =>
    (await client.request({ method: "PUT", path: await settingsPath("/seo"), schema: SeoSettingsSchema, body: update, ...ctx })).data;

  /** AI suggestions for focus keywords and the call to action: a job whose result holds the proposed values, not saved. */
  const proposeSeo = async (ctx: ChangeContext) =>
    (await client.request({ method: "POST", path: await settingsPath("/seo/propose"), schema: JobStartSchema, body: {}, ...ctx })).data;

  async function uploadSeoPicture(file: File, ctx: ChangeContext) {
    const form = new FormData();
    form.set("file", file);
    return (await client.request({ method: "POST", path: await settingsPath("/seo/picture"), schema: PictureSchema, form, timeoutMs: SLOW_CHANGE_MS, ...ctx }))
      .data;
  }

  const removeSeoPicture = async (ctx: ChangeContext) =>
    (await client.request({ method: "DELETE", path: await settingsPath("/seo/picture"), schema: RemovedSchema, ...ctx })).data;

  const publishingSettings = async () =>
    (await client.request({ method: "GET", path: await settingsPath("/publishing"), schema: PublishingSettingsSchema })).data;

  const savePublishing = async (update: PublishingSettings, ctx: ChangeContext) =>
    (await client.request({ method: "PUT", path: await settingsPath("/publishing"), schema: PublishingSettingsSchema, body: update, ...ctx })).data;

  const websiteSettings = async () => (await client.request({ method: "GET", path: await settingsPath("/website"), schema: PublishTargetSchema })).data;

  // A save of a changed connection and a test both reach the website itself, so they get the slow-change limit.
  const saveWebsite = async (update: WebsiteUpdate, ctx: ChangeContext) =>
    (await client.request({ method: "PUT", path: await settingsPath("/website"), schema: PublishTargetSchema, body: update, timeoutMs: SLOW_CHANGE_MS, ...ctx }))
      .data;

  const testWebsite = async (target: WebsiteTargetInput, ctx: ChangeContext) =>
    (
      await client.request({
        method: "POST",
        path: await settingsPath("/website/test"),
        schema: WebsiteTestSchema,
        body: target,
        timeoutMs: SLOW_CHANGE_MS,
        ...ctx,
      })
    ).data;

  async function socialConnections() {
    const { data } = await client.request({ method: "GET", path: await settingsPath("/social"), schema: z.array(z.unknown()) });
    const { items, skipped } = parseItems(data, SocialConnectionSchema);
    return { connections: items, skipped };
  }

  /** Spec v1.1 §7: the provider's sign-in address; the person comes back to `returnUrl?connected=<platform>`. */
  const connectSocial = async (platform: string, returnUrl: string) => {
    const segment = idSegment(platform);
    return (
      await client.request({ method: "GET", path: await settingsPath(`/social/${segment}/connect`), schema: AuthorizeSchema, query: { returnUrl } })
    ).data;
  };

  const disconnectSocial = async (platform: string, ctx: ChangeContext) => {
    const segment = idSegment(platform);
    return (await client.request({ method: "DELETE", path: await settingsPath(`/social/${segment}`), schema: DisconnectedSchema, ...ctx })).data;
  };

  const connectSearchConsole = async (returnUrl: string) =>
    (await client.request({ method: "GET", path: await settingsPath("/search-console/connect"), schema: AuthorizeSchema, query: { returnUrl } })).data;

  const disconnectSearchConsole = async (ctx: ChangeContext) =>
    (await client.request({ method: "DELETE", path: await settingsPath("/search-console"), schema: DisconnectedSchema, ...ctx })).data;
```

In the returned object, after `categories,`, add:

```ts
    seoSettings,
    saveSeo,
    proposeSeo,
    uploadSeoPicture,
    removeSeoPicture,
    publishingSettings,
    savePublishing,
    websiteSettings,
    saveWebsite,
    testWebsite,
    socialConnections,
    connectSocial,
    disconnectSocial,
    connectSearchConsole,
    disconnectSearchConsole,
```

- [ ] **Step 5: Run the tests to make sure they pass**

Run: `pnpm test tests/unit/engine-settings.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Lint, typecheck and the whole unit suite**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected:
- lint and typecheck exit 0
- Vitest: every test passes (255 before this task + 5)

- [ ] **Step 7: Commit**

```bash
git add src/lib/engine/schemas.ts src/lib/engine/api.ts tests/unit/engine-settings.test.ts
git commit -m "feat: engine contract for the settings pages (SEO, schedule, website, social)"
```

---

### Task 2: Mock engine: the SEO profile and the publishing schedule

**Files:**
- Create: `src/lib/engine/mock/outcome.ts`, `src/lib/engine/mock/settings-fixtures.ts`, `src/lib/engine/mock/settings-store.ts`
- Modify: `src/lib/engine/mock/schedule.ts`, `src/lib/engine/mock/store.ts`, `src/lib/engine/mock/server.ts`
- Test: `tests/unit/mock-settings.test.ts` (create), `tests/unit/mock-schedule.test.ts` (modify)

**Interfaces:**
- Consumes: Task 1 schemas and API methods; M3a `startJob`, `tick`, `job`; M2b `slotTimes`, `toDubaiIso`
- Produces:
  - **`mock/outcome.ts`:** `MockOk`, `MockFail`, `MockOutcome`, `UploadedFile`, `ok()`, `fail()`. `store.ts` re-exports the types, so `server.ts`'s imports don't change.
  - **`mock/schedule.ts`:**
    - `DAY_CODES` (`sun…sat`)
    - `type SlotPlan = { days; from; to; perDay; gapMinutes }`
    - `slotTimes(count, plan = Fakher's default)`
  - **`createSettingsStore()` returns:**
    - SEO: `seo()`, `saveSeo(input)`, `seoProposal()`, `uploadSeoPicture(file)`, `removeSeoPicture()`
    - Schedule: `publishing()`, `savePublishing(input)`, `slotPlan()`, `autoPublish()`
  - **`createMockStore()` gains:**
    - `settings` (the settings store)
    - `proposeSeo()`: a job whose result is `{focusKeywords, cta}`
    - the queue's slots follow `settings.slotPlan()`
    - `scheduled(autoPublish, …)` is also off when the settings say so
  - **Mock routes:**
    - `GET/PUT …/settings/seo`
    - `POST …/settings/seo/propose`
    - `POST/DELETE …/settings/seo/picture`
    - `GET/PUT …/settings/publishing`

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/mock-schedule.test.ts`, inside the existing `describe`:

```ts
  it("follows a saved plan: one a day at 09:00 on Mondays", () => {
    expect(slotTimes(2, { days: ["mon"], from: "09:00", to: "17:00", perDay: 1, gapMinutes: 0 })).toEqual([
      "2026-10-26T09:00:00+04:00",
      "2026-11-02T09:00:00+04:00",
    ]);
  });

  it("gives no times for a plan with no day it knows, instead of looping forever", () => {
    expect(slotTimes(2, { days: ["someday"], from: "09:00", to: "17:00", perDay: 1, gapMinutes: 0 })).toEqual([]);
  });
```

Create `tests/unit/mock-settings.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { createEngineApi } from "@/lib/engine/api";
import { createEngineClient } from "@/lib/engine/client";
import { createMockFetch, type MockScenario } from "@/lib/engine/mock/server";
import { createMockStore, type MockStore } from "@/lib/engine/mock/store";
import type { SeoSettings, SeoUpdate } from "@/lib/engine/schemas";

const BASE = "https://mock.engine.local/api/v1";
const ME = "admin@example.com";
const PNG = { name: "share.png", type: "image/png", size: 68, dataUrl: "data:image/png;base64,AAAA" };
let t = Date.parse("2026-10-22T08:00:00Z");
let store: MockStore;

function data<T>(outcome: { ok: boolean; data?: T }): T {
  expect(outcome.ok).toBe(true);
  return (outcome as { data: T }).data;
}

/** The engine API over the mock server, as a page sees it. */
function httpEngine(scenario: MockScenario = "normal") {
  const fetch = createMockFetch({ baseUrl: BASE, apiKey: "mock-key", scenario });
  return createEngineApi(createEngineClient({ baseUrl: BASE, apiKey: "mock-key", fetch, retryDelaysMs: [0, 0] }));
}

const seoUpdate = (seo: SeoSettings): SeoUpdate => ({
  siteName: seo.siteName,
  siteUrl: seo.siteUrl,
  blogPath: seo.blogPath ?? null,
  defaultLang: seo.defaultLang,
  focusKeywords: seo.focusKeywords,
  locations: seo.locations,
  author: seo.author ?? null,
  linkedin: seo.linkedin ?? null,
  instagram: seo.instagram ?? null,
  ogImage: seo.ogImage ?? null,
  cta: seo.cta ?? null,
  tone: seo.tone ?? null,
  audience: seo.audience ?? null,
  avoid: seo.avoid,
  version: seo.version,
});
const seoInput = () => seoUpdate(data(store.settings.seo())) as Record<string, unknown>;
const schedule = () => data(store.settings.publishing()) as Record<string, unknown>;

beforeEach(() => {
  t = Date.parse("2026-10-22T08:00:00Z");
  store = createMockStore({ now: () => t, jobDurationMs: 1000 });
});

describe("SEO profile (spec v1.1 §4 SeoSettings)", () => {
  it("describes Fakher & Co as a legal consultancy, never a law firm", () => {
    const seo = data(store.settings.seo());
    expect([seo.siteName, seo.defaultLang, seo.version]).toEqual(["Fakher & Co", "en", 3]);
    expect(JSON.stringify([seo, store.settings.seoProposal()]).toLowerCase()).not.toContain("law firm");
  });

  it("saves with the version it started from; a save from an older version is a conflict", () => {
    const saved = data(store.settings.saveSeo({ ...seoInput(), cta: "Talk to us", focusKeywords: [" contract review uae ", ""] }));
    expect([saved.cta, saved.focusKeywords, saved.version]).toEqual(["Talk to us", ["contract review uae"], 4]);
    expect(store.settings.saveSeo({ ...seoInput(), version: 3 })).toMatchObject({ ok: false, status: 409, code: "version_conflict" });
  });

  it("names each field it can't accept (spec v1.1 §9: error.fields)", () => {
    expect(store.settings.saveSeo({ ...seoInput(), siteUrl: "fakhernco", defaultLang: "fr", linkedin: "our page" })).toMatchObject({
      ok: false,
      status: 400,
      code: "invalid_input",
      fields: { siteUrl: expect.any(String), defaultLang: expect.any(String), linkedin: expect.any(String) },
    });
  });

  it("keeps the share picture apart from the profile: uploading and removing it leave the version alone", () => {
    expect(data(store.settings.uploadSeoPicture(PNG))).toEqual({ url: PNG.dataUrl });
    expect(data(store.settings.seo())).toMatchObject({ ogImageUploaded: { url: PNG.dataUrl }, version: 3 });
    expect(store.settings.uploadSeoPicture({ ...PNG, name: "notes.txt", type: "text/plain" })).toMatchObject({
      ok: false,
      status: 400,
      fields: { file: expect.any(String) },
    });
    expect(data(store.settings.removeSeoPicture())).toEqual({ removed: true });
    expect(data(store.settings.seo()).ogImageUploaded).toBeNull();
  });

  it("proposes focus keywords and a call to action as a job, without saving them", () => {
    const { jobId } = data(store.proposeSeo());
    t += 1000;
    expect(data(store.job(jobId))).toMatchObject({
      status: "done",
      result: { focusKeywords: expect.arrayContaining(["uae labour law advice"]), cta: "Book a consultation with Fakher & Co" },
    });
    expect(data(store.settings.seo())).toMatchObject({ cta: "Book a consultation", version: 3 });
  });
});

describe("publishing schedule (spec v1.1 §4 PublishingSettings)", () => {
  it("starts at 2 a day, Sunday to Thursday, from 10:00, 3 hours apart", () => {
    expect(schedule()).toEqual({ autoPublish: true, perDay: 2, days: ["sun", "mon", "tue", "wed", "thu"], from: "10:00", to: "17:00", gapMinutes: 180, version: 1 });
  });

  it("the queue follows a saved schedule: one a day at 09:00", () => {
    expect(data(store.settings.savePublishing({ ...schedule(), perDay: 1, from: "09:00" })).version).toBe(2);
    const queue = data(store.scheduled(true, null));
    const times = queue.posts.map((post) => post.schedule?.scheduledAt).filter(Boolean);
    expect([queue.nextSlotAt, ...times.slice(0, 2)]).toEqual(["2026-10-22T09:00:00+04:00", "2026-10-22T09:00:00+04:00", "2026-10-25T09:00:00+04:00"]);
  });

  it("turning auto-publish off takes the times away, like the manual scenario", () => {
    data(store.settings.savePublishing({ ...schedule(), autoPublish: false }));
    expect(data(store.scheduled(true, null))).toMatchObject({ autoPublish: false, nextSlotAt: null });
  });

  it("refuses a schedule whose posts don't fit between the hours, naming the field", () => {
    expect(store.settings.savePublishing({ ...schedule(), perDay: 4 })).toMatchObject({
      ok: false,
      status: 400,
      fields: { perDay: expect.stringContaining("don't fit") },
    });
  });

  it("refuses no days, an end before the start, a number that isn't whole, and a stale version", () => {
    expect(store.settings.savePublishing({ ...schedule(), days: [], to: "09:00", gapMinutes: 1.5 })).toMatchObject({
      ok: false,
      fields: { days: expect.any(String), to: expect.any(String), gapMinutes: expect.any(String) },
    });
    expect(store.settings.savePublishing({ ...schedule(), version: 0 })).toMatchObject({ ok: false, status: 409, code: "version_conflict" });
  });
});

describe("settings over HTTP (mock server)", () => {
  it("serves and saves the SEO profile, the schedule and the share picture in the v1.1 shapes", async () => {
    const engine = httpEngine();
    const key = (n: number) => ({ actingUser: ME, idempotencyKey: `key-settings-${n}` });
    const seo = await engine.seoSettings();
    expect((await engine.saveSeo({ ...seoUpdate(seo), cta: "Talk to us" }, key(1))).version).toBe(4);
    const publishing = await engine.publishingSettings();
    expect((await engine.savePublishing({ ...publishing, perDay: 1 }, key(2))).perDay).toBe(1);
    expect((await engine.proposeSeo(key(3))).jobId).toMatch(/^j_/);
    const picture = await engine.uploadSeoPicture(new File([new Uint8Array(68)], "share.png", { type: "image/png" }), key(4));
    expect(picture.url).toMatch(/^data:image\/png;base64,/);
    expect(await engine.removeSeoPicture(key(5))).toEqual({ removed: true });
  });
});
```

- [ ] **Step 2: Run the tests to make sure they fail**

Run: `pnpm test tests/unit/mock-schedule.test.ts tests/unit/mock-settings.test.ts`
Expected: FAIL.
- `mock-schedule`: the first new test gets the default 10:00/13:00 times; the second gets two times instead of `[]`.
- `mock-settings`:
  - the store tests fail with `TypeError: Cannot read properties of undefined (reading 'seo')` (or `'publishing'`)
  - the HTTP test fails with the engine's `not_found` ("No mock route for GET /sites/site_fakher/settings/seo"), since Task 1 added the API method but the mock has no route yet

- [ ] **Step 3: Move the mock's outcome helpers into their own module**

Create `src/lib/engine/mock/outcome.ts`:

```ts
export type MockOk<T> = { ok: true; status: number; data: T };
export type MockFail = {
  ok: false;
  status: number;
  code: string;
  message: string;
  fields?: Record<string, string>;
  details?: Record<string, unknown>;
};
export type MockOutcome<T> = MockOk<T> | MockFail;
/** A file from a multipart upload, as the mock server hands it to the store. */
export type UploadedFile = { name: string; type: string; size: number; dataUrl: string };

export const ok = <T>(data: T, status = 200): MockOk<T> => ({ ok: true, status, data });

export const fail = (
  status: number,
  code: string,
  message: string,
  extra: { fields?: Record<string, string>; details?: Record<string, unknown> } = {},
): MockFail => ({ ok: false, status, code, message, ...extra });
```

In `src/lib/engine/mock/store.ts`:
- Replace the block from `export type MockOk<T> = …` through `export type UploadedFile = …;` with:

  ```ts
  import { fail, ok, type MockFail, type MockOutcome, type UploadedFile } from "./outcome";

  export type { MockFail, MockOk, MockOutcome, UploadedFile } from "./outcome";
  ```

  Move the `import` line up with the other imports at the top of the file.
- Delete the local `const ok = …` and `const fail = (…) => …` definitions.

- [ ] **Step 4: Let the slots follow a plan**

Replace `src/lib/engine/mock/schedule.ts` with:

```ts
/** The mock's publishing slots, from the publishing settings (Dubai is UTC+4 with no DST). */
const DUBAI_OFFSET_MS = 4 * 3_600_000;
const FIRST_DAY = Date.UTC(2026, 9, 22); // Thursday 22 Oct 2026, as a Dubai calendar date at UTC midnight

/** Weekday codes in `Date.getUTCDay()` order (spec v1.1 §4 PublishingSettings.days). */
export const DAY_CODES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export type SlotPlan = { days: string[]; from: string; to: string; perDay: number; gapMinutes: number };

/** Fakher & Co: 2 a day, Sunday to Thursday, from 10:00, 3 hours apart, so 10:00 and 13:00. */
const FAKHER_PLAN: SlotPlan = { days: ["sun", "mon", "tue", "wed", "thu"], from: "10:00", to: "17:00", perDay: 2, gapMinutes: 180 };

export function toDubaiIso(ms: number): string {
  return `${new Date(ms + DUBAI_OFFSET_MS).toISOString().slice(0, 19)}+04:00`;
}

const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/** A day's slot times, in minutes after midnight: from `from`, `gapMinutes` apart, at most `perDay`, none after `to`. */
function dayMinutes(plan: SlotPlan): number[] {
  const start = minutesOf(plan.from);
  const end = minutesOf(plan.to);
  const times: number[] = [];
  for (let i = 0; i < plan.perDay; i++) {
    const minute = start + i * plan.gapMinutes;
    if (minute > end) break;
    times.push(minute);
  }
  return times;
}

/** The first `count` publishing slots of the mock queue, as ISO times with Dubai's offset. */
export function slotTimes(count: number, plan: SlotPlan = FAKHER_PLAN): string[] {
  const minutes = dayMinutes(plan);
  const days = new Set(plan.days.map((day) => (DAY_CODES as readonly string[]).indexOf(day)).filter((index) => index >= 0));
  const slots: string[] = [];
  if (minutes.length === 0 || days.size === 0) return slots;
  for (let day = 0; slots.length < count; day++) {
    const date = FIRST_DAY + day * 86_400_000;
    if (!days.has(new Date(date).getUTCDay())) continue;
    for (const minute of minutes) {
      if (slots.length < count) slots.push(toDubaiIso(date + minute * 60_000 - DUBAI_OFFSET_MS));
    }
  }
  return slots;
}
```

- [ ] **Step 5: Seed the SEO profile and the schedule**

Create `src/lib/engine/mock/settings-fixtures.ts`:

```ts
import type { PublishingSettings, SeoSettings } from "../schemas";

/** Fakher & Co's SEO profile (spec v1.1 §4 SeoSettings): a legal consultancy, never called a law firm. */
export function seedSeo(): SeoSettings {
  return {
    siteName: "Fakher & Co",
    siteUrl: "https://fakhernco.com",
    blogPath: "/insights",
    defaultLang: "en",
    focusKeywords: ["legal consultancy dubai", "uae labour law"],
    locations: ["Dubai", "Abu Dhabi"],
    author: "Fakher & Co",
    linkedin: "https://www.linkedin.com/company/fakher-co",
    instagram: null,
    ogImage: "https://fakhernco.com/wp-content/uploads/share.jpg",
    ogImageUploaded: null,
    cta: "Book a consultation",
    tone: "clear, expert, plain English",
    audience: "business owners and employees in the UAE",
    avoid: ["promising case outcomes", "advice on a specific case"],
    version: 3,
  };
}

/** 2 a day, Sunday to Thursday, from 10:00, 3 hours apart: the 10:00 and 13:00 Dubai slots the mock queue has used since M2b. */
export function seedPublishing(): PublishingSettings {
  return { autoPublish: true, perDay: 2, days: ["sun", "mon", "tue", "wed", "thu"], from: "10:00", to: "17:00", gapMinutes: 180, version: 1 };
}
```

- [ ] **Step 6: Write the settings store (SEO profile and schedule)**

Create `src/lib/engine/mock/settings-store.ts`:

```ts
import type { PublishingSettings, SeoSettings } from "../schemas";
import { mockMeta } from "./fixtures";
import { fail, ok, type MockOutcome, type UploadedFile } from "./outcome";
import { DAY_CODES, type SlotPlan } from "./schedule";
import { seedPublishing, seedSeo } from "./settings-fixtures";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const ADDRESS = "Enter a full address, like https://example.com.";

function isWebAddress(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const optionalText = (value: unknown) => text(value) || null;
const textList = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean) : [];
const wholeNumber = (value: unknown) => (typeof value === "number" && Number.isInteger(value) ? value : Number.NaN);
const conflict = (what: string) => fail(409, "version_conflict", `Someone saved the ${what} first. Reload to see their version.`);
const invalid = (fields: Record<string, string>) => fail(400, "invalid_input", "Check the highlighted fields.", { fields });

/** The site's settings (spec v1.1 §4, §7): each model has a version, and a save from an older version is a conflict. */
export function createSettingsStore() {
  const meta = mockMeta();
  let seo = seedSeo();
  let publishing = seedPublishing();
  let pictureSequence = 0;

  const seoView = () => ok(structuredClone(seo));

  /** PUT …/settings/seo: the whole profile with the version it started from. */
  function saveSeo(input: Record<string, unknown>): MockOutcome<SeoSettings> {
    if (input.version !== seo.version) return conflict("SEO profile");
    const fields: Record<string, string> = {};
    const siteName = text(input.siteName);
    if (!siteName) fields.siteName = "Required.";
    const siteUrl = text(input.siteUrl);
    if (!isWebAddress(siteUrl)) fields.siteUrl = ADDRESS;
    const defaultLang = text(input.defaultLang);
    if (!meta.languages.includes(defaultLang)) fields.defaultLang = "Choose one of the site's languages.";
    for (const key of ["linkedin", "instagram", "ogImage"] as const) {
      const value = optionalText(input[key]);
      if (value && !isWebAddress(value)) fields[key] = ADDRESS;
    }
    const focusKeywords = textList(input.focusKeywords);
    if (focusKeywords.length > 20) fields.focusKeywords = "Up to 20 focus keywords.";
    if (Object.keys(fields).length > 0) return invalid(fields);
    seo = {
      ...seo,
      siteName,
      siteUrl,
      blogPath: optionalText(input.blogPath),
      defaultLang,
      focusKeywords,
      locations: textList(input.locations),
      author: optionalText(input.author),
      linkedin: optionalText(input.linkedin),
      instagram: optionalText(input.instagram),
      ogImage: optionalText(input.ogImage),
      cta: optionalText(input.cta),
      tone: optionalText(input.tone),
      audience: optionalText(input.audience),
      avoid: textList(input.avoid),
      version: seo.version + 1,
    };
    return seoView();
  }

  /** The mock "AI" behind …/settings/seo/propose: the job's result, never saved by the engine. */
  const seoProposal = () => ({
    focusKeywords: ["legal consultancy dubai", "uae labour law advice", "commercial contracts uae", "real estate disputes dubai"],
    cta: "Book a consultation with Fakher & Co",
  });

  /** POST …/settings/seo/picture. The picture isn't part of the PUT, so it leaves the profile's version alone (mock rule). */
  function uploadSeoPicture(file: UploadedFile | null): MockOutcome<{ url: string }> {
    if (!file) return invalid({ file: "Choose a picture to upload." });
    if (!meta.limits.photoTypes.includes(file.type)) {
      return fail(400, "invalid_input", "Only JPEG, PNG or WebP pictures can be uploaded.", { fields: { file: "Unsupported type" } });
    }
    if (file.size > meta.limits.photoMaxBytes) {
      return fail(400, "invalid_input", `The picture is larger than ${meta.limits.photoMaxBytes / 1_048_576} MB.`, { fields: { file: "Too large" } });
    }
    seo.ogImageUploaded = { url: file.dataUrl, key: `seo/share-${++pictureSequence}` };
    return ok({ url: file.dataUrl });
  }

  function removeSeoPicture(): MockOutcome<{ removed: true }> {
    seo.ogImageUploaded = null;
    return ok({ removed: true as const });
  }

  const publishingView = () => ok(structuredClone(publishing));

  /** PUT …/settings/publishing. The engine works out the slots, so it refuses a plan whose posts can't fit between from and to. */
  function savePublishing(input: Record<string, unknown>): MockOutcome<PublishingSettings> {
    if (input.version !== publishing.version) return conflict("publishing schedule");
    const fields: Record<string, string> = {};
    if (typeof input.autoPublish !== "boolean") fields.autoPublish = "Choose on or off.";
    const perDay = wholeNumber(input.perDay);
    if (!(perDay >= 1 && perDay <= 12)) fields.perDay = "Between 1 and 12 posts a day.";
    const days = textList(input.days);
    if (days.length === 0 || days.some((day) => !(DAY_CODES as readonly string[]).includes(day))) fields.days = "Choose at least one day.";
    const from = text(input.from);
    const to = text(input.to);
    if (!TIME.test(from)) fields.from = "Use a time like 10:00.";
    if (!TIME.test(to)) fields.to = "Use a time like 17:00.";
    else if (TIME.test(from) && minutesOf(to) <= minutesOf(from)) fields.to = "Must be later than the start time.";
    const gapMinutes = wholeNumber(input.gapMinutes);
    if (!(gapMinutes >= 0 && gapMinutes <= 720)) fields.gapMinutes = "Between 0 and 720 minutes.";
    if (Object.keys(fields).length === 0 && minutesOf(from) + (perDay - 1) * gapMinutes > minutesOf(to)) {
      fields.perDay = `${perDay} posts a day, ${gapMinutes} minutes apart, don't fit between ${from} and ${to}.`;
    }
    if (Object.keys(fields).length > 0) return invalid(fields);
    publishing = {
      autoPublish: input.autoPublish as boolean,
      perDay,
      days: DAY_CODES.filter((day) => days.includes(day)),
      from,
      to,
      gapMinutes,
      version: publishing.version + 1,
    };
    return publishingView();
  }

  const slotPlan = (): SlotPlan => ({
    days: publishing.days,
    from: publishing.from,
    to: publishing.to,
    perDay: publishing.perDay,
    gapMinutes: publishing.gapMinutes,
  });

  return {
    seo: seoView,
    saveSeo,
    seoProposal,
    uploadSeoPicture,
    removeSeoPicture,
    publishing: publishingView,
    savePublishing,
    slotPlan,
    autoPublish: () => publishing.autoPublish,
  };
}

export type SettingsStore = ReturnType<typeof createSettingsStore>;
```

- [ ] **Step 7: Use the settings in the mock store**

In `src/lib/engine/mock/store.ts`:

1. Add `import { createSettingsStore } from "./settings-store";` to the imports.
2. After `const iso = (ms: number) => new Date(ms).toISOString();`, add:

   ```ts
     const settings = createSettingsStore();
   ```

3. In `queueSchedule`, replace

   ```ts
       const times = autoPublish ? slotTimes(queued.filter((post) => !post.schedule?.hold).length) : [];
   ```

   with

   ```ts
       const times = autoPublish ? slotTimes(queued.filter((post) => !post.schedule?.hold).length, settings.slotPlan()) : [];
   ```

4. Replace the whole `scheduled` function with:

   ```ts
     /** GET …/scheduled: the queue with positions and times. With auto-publish off (settings or scenario), nothing has a time. */
     function scheduled(autoPublish: boolean, pageSize: number | null) {
       tick();
       const on = autoPublish && settings.autoPublish();
       const plan = queueSchedule(on);
       const items = [...plan].map(([id, schedule]) => {
         const item = view(posts.get(id) as Post);
         delete item.content;
         return { ...item, schedule };
       });
       const next = [...plan.values()].find((entry) => entry.scheduledAt)?.scheduledAt ?? null;
       return ok({
         autoPublish: on,
         nextSlotAt: next,
         waitingReason: on && !next ? "queue_empty" : null,
         posts: pageSize ? items.slice(0, pageSize) : items,
       });
     }
   ```

5. Just before `function job(id: string)`, add:

   ```ts
     /** POST …/settings/seo/propose: AI suggestions for focus keywords and the call to action, as a job (not saved). */
     function proposeSeo() {
       tick();
       return ok({ jobId: startJob(() => settings.seoProposal()), status: "queued", postIds: [] as string[] });
     }
   ```

6. In the returned object, after `idempotency,`, add `settings,` and `proposeSeo,`.

- [ ] **Step 8: Serve the routes**

In `src/lib/engine/mock/server.ts`, just before `  if (rest === "/keywords" && method === "GET") {`, add:

```ts
  if (rest === "/settings/seo" && method === "GET") return outcome(store.settings.seo());
  if (rest === "/settings/seo" && method === "PUT") return outcome(store.settings.saveSeo(body));
  if (rest === "/settings/seo/propose" && method === "POST") return outcome(store.proposeSeo());
  if (rest === "/settings/seo/picture" && method === "POST") return outcome(store.settings.uploadSeoPicture(uploadedFile(body.file)));
  if (rest === "/settings/seo/picture" && method === "DELETE") return outcome(store.settings.removeSeoPicture());
  if (rest === "/settings/publishing" && method === "GET") return outcome(store.settings.publishing());
  if (rest === "/settings/publishing" && method === "PUT") return outcome(store.settings.savePublishing(body));
```

- [ ] **Step 9: Run the tests to make sure they pass**

Run: `pnpm test tests/unit/mock-schedule.test.ts tests/unit/mock-settings.test.ts`
Expected: PASS (3 schedule tests, 11 settings tests).

- [ ] **Step 10: Lint, typecheck, the whole unit suite and the Scheduled e2e**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm e2e tests/e2e/scheduled.spec.ts tests/e2e/dashboard.spec.ts`
Expected:
- lint and typecheck exit 0
- every unit test passes
- the Scheduled and dashboard e2e still pass: the default plan gives the same 10:00 and 13:00 slots

- [ ] **Step 11: Commit**

```bash
git add src/lib/engine/mock tests/unit/mock-schedule.test.ts tests/unit/mock-settings.test.ts
git commit -m "feat: mock engine SEO profile and publishing schedule; the queue follows the schedule"
```

---

### Task 3: Mock engine: website connection, social accounts, connections and the two new scenarios

**Files:**
- Modify: `src/lib/engine/mock/settings-fixtures.ts`, `src/lib/engine/mock/settings-store.ts`, `src/lib/engine/mock/store.ts`, `src/lib/engine/mock/server.ts`, `src/lib/engine/mock/registry.ts`, `src/lib/engine/index.ts`, `tests/e2e/helpers.ts`
- Test: `tests/unit/mock-settings.test.ts` (append)

**Interfaces:**
- Consumes: Task 2 settings store, `outcome.ts`, `toDubaiIso`; Task 1 `PublishTarget`, `SocialConnection`
- Produces:
  - **`createSettingsStore({ now, firstRun? })` also returns:**
    - Website: `website()`, `testWebsite(input)`, `saveWebsite(input)`, `websiteType()`
    - Social: `socialList()`, `connectSocial(platform, returnUrl)`, `disconnectSocial(platform)`
    - Search Console: `connectSearchConsole(returnUrl)`, `disconnectSearchConsole()`
    - `connections(withSearchConsole): Site["connections"]`
    - `connectionStatus(platform)`
  - **`createMockStore({ firstRun? })`:**
    - publishing is refused with `422 not_connected` and `details.connection` when that connection is `missing` or `error`
    - a website post's `published.target` is the connection's current type
  - **`MockScenario` gains `firstrun` and `performance`.**
  - **`mockStoreFor(namespace, { firstRun })`:** in `getEngine`, the `firstrun` scenario creates a first-run store.
  - **Routes:**
    - `GET/PUT …/settings/website`
    - `POST …/settings/website/test`
    - `GET …/settings/social`
    - `GET …/settings/social/{platform}/connect?returnUrl`
    - `DELETE …/settings/social/{platform}`
    - `GET …/settings/search-console/connect?returnUrl` and `DELETE …/settings/search-console` (`performance` scenario only)
    - site connections come from the store

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/mock-settings.test.ts`:

```ts
const WORDPRESS = {
  type: "wordpress",
  settings: { url: "https://fakhernco.com", username: "articles-ai", postType: "post" },
  fieldMap: { title: "title" },
  body: { format: "html" },
  arabic: { mode: "translatepress" },
};
const STRAPI = {
  type: "strapi",
  settings: { url: "https://cms.fakhernco.com", collection: "posts" },
  secret: "strapi-api-token",
  fieldMap: {},
  body: { format: "blocks", blockMap: {} },
  arabic: { mode: "locale" },
};

describe("website connection (spec v1.1 §4 PublishTarget, §7, §10)", () => {
  it("never returns the secret, only whether one is stored (Review Focus 3)", () => {
    const website = data(store.settings.website());
    expect(website).toMatchObject({ type: "wordpress", secretSet: true, status: "ok", version: 1 });
    expect(JSON.stringify(website)).not.toContain("seeded-application-password");
  });

  it("a wrong application password fails the test with its message, and the changed connection is saved only after a test passes (Review Focus 1)", () => {
    expect(data(store.settings.testWebsite({ ...WORDPRESS, secret: "wrong-password" }))).toEqual({ ok: false, error: expect.stringContaining("401 Unauthorized") });
    expect(store.settings.saveWebsite({ ...WORDPRESS, secret: "wrong-password", version: 1 })).toMatchObject({ ok: false, status: 422, code: "not_connected" });
    expect(data(store.settings.testWebsite({ ...WORDPRESS, secret: "new-password" }))).toMatchObject({ ok: true, suggestedFieldMap: { metaTitle: "yoast.title" } });
    expect(data(store.settings.saveWebsite({ ...WORDPRESS, secret: "new-password", version: 1 }))).toMatchObject({ status: "ok", secretSet: true, version: 2 });
  });

  it("saves a change to the field map, the format or the Arabic mode without a new test", () => {
    expect(data(store.settings.saveWebsite({ ...WORDPRESS, fieldMap: { title: "title", slug: "slug" }, body: { format: "boldbuilder" }, version: 1 }))).toMatchObject({
      fieldMap: { title: "title", slug: "slug" },
      body: { format: "boldbuilder" },
      version: 2,
    });
  });

  it("tests with the stored secret when none is typed, but another type needs its own (Review Focus 3)", () => {
    expect(data(store.settings.testWebsite(WORDPRESS))).toMatchObject({ ok: true });
    expect(store.settings.testWebsite({ ...STRAPI, secret: undefined })).toMatchObject({ ok: false, status: 400, fields: { secret: "Required." } });
  });

  it("names missing fields, addresses that aren't web addresses, and a format the type doesn't offer", () => {
    expect(store.settings.testWebsite({ ...WORDPRESS, settings: { url: "fakhernco", username: "" } })).toMatchObject({
      ok: false,
      fields: { url: expect.any(String), username: "Required." },
    });
    expect(store.settings.saveWebsite({ ...WORDPRESS, body: { format: "blocks" }, version: 1 })).toMatchObject({ ok: false, fields: { "body.format": expect.any(String) } });
    expect(store.settings.saveWebsite({ ...WORDPRESS, version: 0 })).toMatchObject({ ok: false, status: 409, code: "version_conflict" });
  });

  it("switching to Strapi: the test suggests both maps; published posts keep WordPress and new ones go to Strapi (Review Focus 2)", () => {
    expect(data(store.settings.testWebsite(STRAPI))).toMatchObject({
      ok: true,
      blockTypes: expect.arrayContaining(["blocks.faq"]),
      suggestedBlockMap: { heading: "blocks.heading", table: "blocks.data-table" },
      suggestedFieldMap: { metaTitle: "seo.metaTitle" },
    });
    expect(data(store.settings.saveWebsite({ ...STRAPI, version: 1 }))).toMatchObject({ type: "strapi", body: { format: "blocks" }, arabic: { mode: "locale" } });
    expect(data(store.publish("p_101", ME)).published?.target).toBe("strapi");
    expect(data(store.getPost("p_301")).published?.target).toBe("wordpress");
  });
});

describe("first run, connections and social accounts (spec v1.1 §6, §7)", () => {
  it("a first-run site has no website or social connection, and publishing is refused with not_connected", () => {
    const fresh = createMockStore({ now: () => t, firstRun: true });
    expect(data(fresh.settings.website())).toMatchObject({ type: null, status: "missing", secretSet: false });
    expect(fresh.settings.connections(false)).toEqual({ website: { type: null, status: "missing" }, linkedin: "missing", instagram: "missing", searchConsole: null });
    expect(fresh.publish("p_101", ME)).toMatchObject({ ok: false, status: 422, code: "not_connected", details: { connection: "website" } });
  });

  it("connects a social account through an address that comes back to the portal, then disconnects it", () => {
    const back = "http://localhost:3100/en/settings/social";
    expect(data(store.settings.connectSocial("instagram", back))).toEqual({ authorizeUrl: `${back}?connected=instagram` });
    expect(store.settings.connections(false).instagram).toBe("ok");
    expect(data(store.settings.socialList()).find((account) => account.platform === "instagram")).toMatchObject({ status: "ok", accountName: "Fakher & Co" });
    expect(data(store.settings.disconnectSocial("instagram"))).toEqual({ disconnected: true });
    expect(store.settings.connections(false).instagram).toBe("missing");
  });

  it("refuses an unknown platform and a return address that isn't a web address", () => {
    expect(store.settings.connectSocial("tiktok", "http://localhost:3100/x")).toMatchObject({ ok: false, status: 404 });
    expect(store.settings.connectSocial("linkedin", "javascript:alert(1)")).toMatchObject({ ok: false, status: 400 });
  });

  it("over HTTP, the performance scenario lists the feature and offers Search Console; the normal one does neither", async () => {
    const performance = httpEngine("performance");
    expect((await performance.meta()).features).toEqual(["performance"]);
    expect((await performance.siteConnections()).connections.searchConsole).toBe("missing");
    expect((await performance.connectSearchConsole("http://localhost:3100/en/settings/social")).authorizeUrl).toContain("connected=searchConsole");
    const normal = httpEngine();
    expect((await normal.siteConnections()).connections.searchConsole).toBeNull();
    await expect(normal.connectSearchConsole("http://localhost:3100/en/settings/social")).rejects.toMatchObject({ code: "not_found" });
  });
});
```

- [ ] **Step 2: Run the tests to make sure they fail**

Run: `pnpm test tests/unit/mock-settings.test.ts`
Expected: FAIL. The new tests fail with `TypeError: store.settings.website is not a function` (and the like), and the HTTP test with an engine `not_found` for `…/search-console/connect`.

- [ ] **Step 3: Seed the website connection and social accounts**

In `src/lib/engine/mock/settings-fixtures.ts`:
- Change the import to `import type { Category, PublishingSettings, SeoSettings, SocialConnection } from "../schemas";`.
- Append:

```ts
/** The website categories (…/website/categories, and the connection test's `categories`). */
export const MOCK_CATEGORIES: Category[] = [
  { slug: "insights", name: "Insights" },
  { slug: "labour-law", name: "Labour law" },
  { slug: "corporate", name: "Corporate" },
  { slug: "real-estate", name: "Real estate" },
];

/** The website connection as the engine stores it, secret included (the API never returns the secret). */
export type StoredWebsite = {
  type: string | null;
  settings: Record<string, unknown>;
  secret: string | null;
  fieldMap: Record<string, string>;
  body: { format: string; blockMap?: Record<string, string> } | null;
  arabic: { mode: string } | null;
  languages: string[];
  status: string;
  lastCheckedAt: string | null;
  lastError: string | null;
  version: number;
};

/** WordPress on fakhernco.com through an Editor user's application password (design §6); nothing on a first run. */
export function seedWebsite(firstRun: boolean): StoredWebsite {
  if (firstRun) {
    return {
      type: null,
      settings: {},
      secret: null,
      fieldMap: {},
      body: null,
      arabic: null,
      languages: ["en", "ar"],
      status: "missing",
      lastCheckedAt: null,
      lastError: null,
      version: 0,
    };
  }
  return {
    type: "wordpress",
    settings: { url: "https://fakhernco.com", username: "articles-ai", postType: "post", ctaText: "Book a consultation", ctaUrl: "/contact" },
    secret: "seeded-application-password",
    fieldMap: {
      title: "title",
      slug: "slug",
      subtitle: "excerpt",
      metaTitle: "yoast.title",
      metaDescription: "yoast.description",
      image: "featuredImage",
      category: "categories",
      author: "author",
    },
    body: { format: "html" },
    arabic: { mode: "translatepress" },
    languages: ["en", "ar"],
    status: "ok",
    lastCheckedAt: "2026-10-21T09:00:00+04:00",
    lastError: null,
    version: 1,
  };
}

/** LinkedIn connected but expiring and Instagram missing, as the dashboard has shown since M1; both missing on a first run. */
export function seedSocial(firstRun: boolean): SocialConnection[] {
  return [
    firstRun
      ? { platform: "linkedin", accountName: null, status: "missing", expiresAt: null, lastError: null }
      : { platform: "linkedin", accountName: "Fakher & Co", status: "expiring", expiresAt: "2026-10-30T10:00:00+04:00", lastError: null },
    { platform: "instagram", accountName: null, status: "missing", expiresAt: null, lastError: null },
  ];
}

type Adapter = { fields: string[]; blockTypes: string[]; suggestedFieldMap: Record<string, string>; suggestedBlockMap: Record<string, string> };

/** What a passing connection test reports for each website type (spec v1.1 §7 …/settings/website/test, §11). */
export const ADAPTERS: Record<string, Adapter> = {
  wordpress: {
    fields: ["title", "slug", "excerpt", "content", "yoast.title", "yoast.description", "featuredImage", "categories", "tags", "author"],
    blockTypes: [],
    suggestedFieldMap: {
      title: "title",
      slug: "slug",
      subtitle: "excerpt",
      metaTitle: "yoast.title",
      metaDescription: "yoast.description",
      keywords: "tags",
      image: "featuredImage",
      category: "categories",
      author: "author",
    },
    suggestedBlockMap: {},
  },
  strapi: {
    fields: ["title", "slug", "subtitle", "seo.metaTitle", "seo.metaDescription", "seo.keywords", "cover", "category", "author"],
    blockTypes: [
      "blocks.heading",
      "blocks.paragraph",
      "blocks.list",
      "blocks.data-table",
      "blocks.faq",
      "blocks.cards",
      "blocks.image",
      "blocks.button",
      "blocks.quote",
      "blocks.gallery",
    ],
    suggestedFieldMap: {
      title: "title",
      slug: "slug",
      subtitle: "subtitle",
      metaTitle: "seo.metaTitle",
      metaDescription: "seo.metaDescription",
      keywords: "seo.keywords",
      image: "cover",
      category: "category",
      author: "author",
    },
    suggestedBlockMap: {
      heading: "blocks.heading",
      paragraph: "blocks.paragraph",
      list: "blocks.list",
      faq: "blocks.faq",
      image: "blocks.image",
      quote: "blocks.quote",
      table: "blocks.data-table",
    },
  },
};
```

In `src/lib/engine/mock/store.ts`, delete the local `const CATEGORIES: Category[] = [ … ];` block, import `MOCK_CATEGORIES` from `./settings-fixtures`, and change `const categories = () => ok(CATEGORIES);` to `const categories = () => ok(MOCK_CATEGORIES);`. Drop `Category` from the `../schemas` type import if nothing else in the file uses it (the linter will say).

- [ ] **Step 4: Add the website, social and connection parts to the settings store**

In `src/lib/engine/mock/settings-store.ts`:

1. Replace the imports with:

   ```ts
   import type { PublishingSettings, PublishTarget, SeoSettings, Site, SocialConnection, TargetType } from "../schemas";
   import { mockMeta } from "./fixtures";
   import { fail, ok, type MockFail, type MockOutcome, type UploadedFile } from "./outcome";
   import { DAY_CODES, toDubaiIso, type SlotPlan } from "./schedule";
   import { ADAPTERS, MOCK_CATEGORIES, seedPublishing, seedSeo, seedSocial, seedWebsite } from "./settings-fixtures";
   ```

2. Below `const invalid = …`, add:

   ```ts
   const object = (value: unknown) => (typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {});
   const stringMap = (value: unknown) =>
     Object.fromEntries(Object.entries(object(value)).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1] !== ""));

   /** A test or save request's connection, checked: its type, the settings it sent and the secret it will use. */
   type Resolved = { type: TargetType; settings: Record<string, unknown>; secret: string | null };
   ```

3. Change the signature to `export function createSettingsStore(options: { now: () => number; firstRun?: boolean }) {`.

4. After `let pictureSequence = 0;`, add:

   ```ts
     let website = seedWebsite(options.firstRun ?? false);
     const social = new Map(seedSocial(options.firstRun ?? false).map((account) => [account.platform, account]));
     let searchConsole = "missing";
     const passedTests = new Set<string>();
   ```

5. Before `return {`, add:

   ```ts
     function websiteView(): MockOutcome<PublishTarget> {
       const { secret, ...rest } = website;
       return ok(structuredClone({ ...rest, secretSet: secret !== null }));
     }

     /** A known type, its required fields (the stored secret counts for the same type) and web addresses where the type says url. */
     function resolve(input: Record<string, unknown>): Resolved | MockFail {
       const type = meta.targetTypes.find((candidate) => candidate.type === input.type);
       if (!type) return invalid({ type: "Choose a website type." });
       const given = object(input.settings);
       const secret = text(input.secret) || (website.type === type.type ? website.secret : null);
       const fields: Record<string, string> = {};
       for (const field of type.fields) {
         if (field.kind === "secret") {
           if (field.required && !secret) fields[field.key] = "Required.";
           continue;
         }
         const value = text(given[field.key]);
         if (field.required && !value) fields[field.key] = "Required.";
         else if (value && field.kind === "url" && !isWebAddress(value)) fields[field.key] = ADDRESS;
       }
       if (Object.keys(fields).length > 0) return invalid(fields);
       const settings = { ...given };
       for (const field of type.fields) if (field.kind === "secret") delete settings[field.key];
       return { type, settings, secret };
     }

     /** The connection a test proved: the type, its connection fields and the secret it used. */
     const fingerprintOf = (resolved: Resolved) =>
       JSON.stringify([resolved.type.type, resolved.type.fields.filter((field) => field.kind !== "secret").map((field) => text(resolved.settings[field.key])), resolved.secret]);

     /** POST …/settings/website/test with unsaved values. A secret containing "wrong" is refused, as a website would (mock rule). */
     function testWebsite(input: Record<string, unknown>): MockOutcome<Record<string, unknown>> {
       const resolved = resolve(input);
       if ("ok" in resolved) return resolved;
       if (resolved.secret?.includes("wrong")) {
         const secretLabel = resolved.type.fields.find((field) => field.kind === "secret")?.label ?? "secret";
         return ok({ ok: false, error: `${resolved.type.label} refused the connection (401 Unauthorized). Check the ${secretLabel}.` });
       }
       passedTests.add(fingerprintOf(resolved));
       const adapter = ADAPTERS[resolved.type.type] ?? { fields: [], blockTypes: [], suggestedFieldMap: {}, suggestedBlockMap: {} };
       return ok({ ok: true, categories: structuredClone(MOCK_CATEGORIES), languages: meta.languages, ...structuredClone(adapter) });
     }

     /** PUT …/settings/website. A changed type, connection field or secret is saved only after a passing test of exactly those values. */
     function saveWebsite(input: Record<string, unknown>): MockOutcome<PublishTarget> {
       if (input.version !== website.version) return conflict("website connection");
       const resolved = resolve(input);
       if ("ok" in resolved) return resolved;
       const connectionKeys = resolved.type.fields.filter((field) => field.kind !== "secret").map((field) => field.key);
       const changed =
         website.status === "missing" ||
         resolved.type.type !== website.type ||
         resolved.secret !== website.secret ||
         connectionKeys.some((key) => text(resolved.settings[key]) !== text(website.settings[key]));
       if (changed && !passedTests.has(fingerprintOf(resolved))) {
         return fail(422, "not_connected", "Test the connection first: a changed connection is saved only after its test passes.");
       }
       const body = object(input.body);
       const format = text(body.format);
       const mode = text(object(input.arabic).mode);
       const fields: Record<string, string> = {};
       if (!resolved.type.bodyFormats.includes(format)) fields["body.format"] = `Choose one of: ${resolved.type.bodyFormats.join(", ")}.`;
       if (!resolved.type.arabicModes.includes(mode)) fields["arabic.mode"] = `Choose one of: ${resolved.type.arabicModes.join(", ")}.`;
       if (Object.keys(fields).length > 0) return invalid(fields);
       website = {
         type: resolved.type.type,
         settings: resolved.settings,
         secret: resolved.secret,
         fieldMap: stringMap(input.fieldMap),
         body: format === "blocks" ? { format, blockMap: stringMap(body.blockMap) } : { format },
         arabic: { mode },
         languages: meta.languages,
         status: "ok",
         lastCheckedAt: changed ? toDubaiIso(options.now()) : website.lastCheckedAt,
         lastError: null,
         version: website.version + 1,
       };
       return websiteView();
     }

     /** Spec v1.1 §4 Site.connections, from what's set up here. Search Console is reported only with the performance feature. */
     function connections(withSearchConsole: boolean): Site["connections"] {
       return {
         website: { type: website.type, status: website.status },
         linkedin: social.get("linkedin")?.status ?? "missing",
         instagram: social.get("instagram")?.status ?? "missing",
         searchConsole: withSearchConsole ? searchConsole : null,
       };
     }

     /** Whether a post for this platform can go out: the website connection for articles, the account for social posts. */
     const connectionStatus = (platform: string) => (platform === "website" ? website.status : (social.get(platform)?.status ?? "ok"));

     /** The mock's authorize step completes at once: the browser is sent straight back with ?connected=… (mock rule). */
     function authorize(returnUrl: string, connected: string): MockOutcome<{ authorizeUrl: string }> {
       if (!isWebAddress(returnUrl)) return invalid({ returnUrl: "Must be a web address." });
       const url = new URL(returnUrl);
       url.searchParams.set("connected", connected);
       return ok({ authorizeUrl: url.href });
     }

     function connectSocial(platform: string, returnUrl: string): MockOutcome<{ authorizeUrl: string }> {
       if (!social.has(platform)) return fail(404, "not_found", `No social platform called ${platform}.`);
       const result = authorize(returnUrl, platform);
       if (result.ok) {
         social.set(platform, { platform, accountName: "Fakher & Co", status: "ok", expiresAt: toDubaiIso(options.now() + 60 * 86_400_000), lastError: null });
       }
       return result;
     }

     function disconnectSocial(platform: string): MockOutcome<{ disconnected: true }> {
       if (!social.has(platform)) return fail(404, "not_found", `No social platform called ${platform}.`);
       social.set(platform, { platform, accountName: null, status: "missing", expiresAt: null, lastError: null });
       return ok({ disconnected: true as const });
     }

     function connectSearchConsole(returnUrl: string): MockOutcome<{ authorizeUrl: string }> {
       const result = authorize(returnUrl, "searchConsole");
       if (result.ok) searchConsole = "ok";
       return result;
     }

     function disconnectSearchConsole(): MockOutcome<{ disconnected: true }> {
       searchConsole = "missing";
       return ok({ disconnected: true as const });
     }

     const socialList = (): MockOutcome<SocialConnection[]> => ok(structuredClone([...social.values()]));
   ```

6. In the returned object, after `autoPublish: () => publishing.autoPublish,`, add:

   ```ts
       website: websiteView,
       testWebsite,
       saveWebsite,
       websiteType: () => website.type,
       connections,
       connectionStatus,
       socialList,
       connectSocial,
       disconnectSocial,
       connectSearchConsole,
       disconnectSearchConsole,
   ```

- [ ] **Step 5: Use the connections in the mock store**

In `src/lib/engine/mock/store.ts`:

1. Change the signature to `export function createMockStore(options: { now?: () => number; jobDurationMs?: number; firstRun?: boolean } = {}) {`, and `const settings = createSettingsStore();` to `const settings = createSettingsStore({ now, firstRun: options.firstRun });`.
2. In `publication`, replace `return { target: "wordpress", url: \`https://fakhernco.com${path}\`, externalId: String(9000 + n), at };` with:

   ```ts
         return { target: settings.websiteType() ?? "wordpress", url: `https://fakhernco.com${path}`, externalId: String(9000 + n), at };
   ```

3. In `publish`, replace

   ```ts
       if (post.platform === "instagram") return fail(422, "not_connected", "Instagram isn't connected. An admin can connect it in Settings.");
   ```

   with

   ```ts
       // The post's connection must be set up and working (spec v1.1 §9 not_connected); details say which one (mock-only name).
       const connection = settings.connectionStatus(post.platform);
       if (connection === "missing" || connection === "error") {
         const name = post.platform === "website" ? "The website" : post.platform === "linkedin" ? "LinkedIn" : post.platform === "instagram" ? "Instagram" : post.platform;
         return fail(422, "not_connected", `${name} isn't connected. An admin can connect it in Settings.`, { details: { connection: post.platform } });
       }
   ```

- [ ] **Step 6: Serve the routes, scenarios and connections**

In `src/lib/engine/mock/server.ts`:

1. Replace the scenario block with:

   ```ts
   /**
    * normal · unauthorized (revoked key) · down (unreachable) · drift (changed shapes) · manual (auto-publish off)
    * · crash (a non-engine error) · quota (the monthly article limit is reached)
    * · firstrun (a store created with no website or social connection) · performance (the feature, with Search Console).
    */
   export type MockScenario = "normal" | "unauthorized" | "down" | "drift" | "manual" | "crash" | "quota" | "firstrun" | "performance";
   const MOCK_SCENARIOS: readonly MockScenario[] = ["normal", "unauthorized", "down", "drift", "manual", "crash", "quota", "firstrun", "performance"];
   ```

2. Below `function planAtLimit() { … }`, add:

   ```ts
   /** The site, with the connections the settings store has (spec v1.1 §4 Site.connections). */
   function siteOf(store: MockStore, scenario: MockScenario) {
     return { ...mockSite(), connections: store.settings.connections(scenario === "performance") };
   }
   ```

3. Replace `if (method === "GET" && path === "/meta") return ok(mockMeta());` with:

   ```ts
     if (method === "GET" && path === "/meta") return ok(scenario === "performance" ? { ...mockMeta(), features: ["performance"] } : mockMeta());
   ```

4. Replace `if (method === "GET" && path === "/sites") return ok([scenario === "drift" ? driftedSite() : mockSite()]);` with:

   ```ts
     if (method === "GET" && path === "/sites") return ok([scenario === "drift" ? driftedSite() : siteOf(store, scenario)]);
   ```

5. Replace `if (method === "GET" && rest === "") return ok(scenario === "drift" ? driftedSite() : mockSite());` with:

   ```ts
     if (method === "GET" && rest === "") return ok(scenario === "drift" ? driftedSite() : siteOf(store, scenario));
   ```

6. After the `/settings/publishing` PUT route from Task 2, add:

   ```ts
     if (rest === "/settings/website" && method === "GET") return outcome(store.settings.website());
     if (rest === "/settings/website" && method === "PUT") return outcome(store.settings.saveWebsite(body));
     if (rest === "/settings/website/test" && method === "POST") return outcome(store.settings.testWebsite(body));
     if (rest === "/settings/social" && method === "GET") return outcome(store.settings.socialList());
     if (rest.startsWith("/settings/search-console") && scenario !== "performance") return fail(404, "not_found", "Search Console needs the performance feature.");
     if (rest === "/settings/search-console/connect" && method === "GET") {
       return outcome(store.settings.connectSearchConsole(url.searchParams.get("returnUrl") ?? ""));
     }
     if (rest === "/settings/search-console" && method === "DELETE") return outcome(store.settings.disconnectSearchConsole());
     const socialRoute = /^\/settings\/social\/([^/]+)(\/connect)?$/.exec(rest);
     if (socialRoute?.[2] && method === "GET") {
       return outcome(store.settings.connectSocial(decodeURIComponent(socialRoute[1]), url.searchParams.get("returnUrl") ?? ""));
     }
     if (socialRoute && !socialRoute[2] && method === "DELETE") return outcome(store.settings.disconnectSocial(decodeURIComponent(socialRoute[1])));
   ```

In `src/lib/engine/mock/registry.ts`, replace the function with:

```ts
/**
 * One stateful mock per namespace (e2e tests use a fresh namespace each). Survives dev hot reloads via globalThis.
 * `firstRun` matters only when the namespace's store is created (the "firstrun" scenario: no connections set up yet).
 */
export function mockStoreFor(namespace?: string, options: { firstRun?: boolean } = {}): MockStore {
  const holder = globalThis as unknown as Record<symbol, Map<string, MockStore> | undefined>;
  const stores = (holder[REGISTRY] ??= new Map<string, MockStore>());
  const key = namespace && /^[A-Za-z0-9_-]{1,64}$/.test(namespace) ? namespace : "default";
  let store = stores.get(key);
  if (!store) {
    store = createMockStore({ firstRun: options.firstRun });
    stores.set(key, store);
  }
  return store;
}
```

In `src/lib/engine/index.ts`, change `store: mockStoreFor(jar.get(MOCK_STORE_COOKIE)?.value),` to:

```ts
      store: mockStoreFor(jar.get(MOCK_STORE_COOKIE)?.value, { firstRun: scenario === "firstrun" }),
```

In `tests/e2e/helpers.ts`, add `| "firstrun" | "performance"` to `setMockScenario`'s scenario union.

- [ ] **Step 7: Run the tests to make sure they pass**

Run: `pnpm test tests/unit/mock-settings.test.ts`
Expected: PASS (21 tests).

- [ ] **Step 8: Lint, typecheck, the whole unit suite and the publishing e2e**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm e2e tests/e2e/publish.spec.ts tests/e2e/history.spec.ts tests/e2e/dashboard.spec.ts`
Expected:
- lint and typecheck exit 0
- every unit test passes
- these e2e still pass:
  - the publish flows (website posts are connected)
  - History's targets
  - the dashboard's connection warnings (LinkedIn expiring, Instagram missing, the website fine)

- [ ] **Step 9: Commit**

```bash
git add src/lib/engine tests/unit/mock-settings.test.ts tests/e2e/helpers.ts
git commit -m "feat: mock website connection with tests, social accounts, connections, firstrun and performance scenarios"
```

---

### Task 4: Settings actions and the shared pieces

**Files:**
- Modify: `src/lib/actions/server.ts`
- Create:
  - `src/lib/settings/draft.ts`, `src/lib/settings/addresses.ts`, `src/lib/settings/field-errors.ts`
  - `src/app/[locale]/(app)/settings/actions.ts`
- Test: `tests/unit/settings-lib.test.ts`, `tests/unit/settings-actions.test.ts` (create)

**Interfaces:**
- Consumes: Task 1 API methods and input schemas; M2a `change`, `engineFor`, `INVALID`, `Locale`, `EngineId`, `IdempotencyKey`
- Produces:
  - **`ask(locale, key, run, permission)`** in `src/lib/actions/server.ts`: `change()` without the refresh.
  - **`src/lib/settings/draft.ts`:**
    - `type SettingsDraft<F> = { base: F; version: number; form: F }`
    - `draftOf(form, version)`, `edit(draft, key, value)`, `changedKeys(a, b)`, `unsavedKeys(draft)`
    - `afterSave(draft, sent, saved, version)`, `rebase(draft, form, version)`, `withMyChanges(draft, theirs, version)`
  - **`src/lib/settings/addresses.ts`:**
    - `originOf(headers): string | null`
    - `safeRedirectUrl(url): string | null`
  - **`src/lib/settings/field-errors.ts`:** `settingsFieldErrors(error, shown): { byField; other }`
  - **Server actions in `src/app/[locale]/(app)/settings/actions.ts`, all `settings.manage`:**
    - SEO:
      - `loadSeoAction({locale})`
      - `saveSeoAction({locale, update, idempotencyKey})`
      - `proposeSeoAction({locale, idempotencyKey})`
      - `uploadSeoPictureAction(form)`
      - `removeSeoPictureAction({locale, idempotencyKey})`
    - Schedule:
      - `loadPublishingAction({locale})`
      - `savePublishingAction({locale, update, idempotencyKey})`
    - Website:
      - `loadWebsiteAction({locale})`
      - `testWebsiteAction({locale, target, idempotencyKey})`
      - `saveWebsiteAction({locale, update, idempotencyKey})`
    - Social:
      - `connectSocialAction({locale, platform})`
      - `disconnectSocialAction({locale, platform, idempotencyKey})`
    - Search Console:
      - `connectSearchConsoleAction({locale})`
      - `disconnectSearchConsoleAction({locale, idempotencyKey})`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/settings-lib.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { originOf, safeRedirectUrl } from "@/lib/settings/addresses";
import { afterSave, changedKeys, draftOf, edit, rebase, unsavedKeys, withMyChanges } from "@/lib/settings/draft";
import { settingsFieldErrors } from "@/lib/settings/field-errors";

type Form = { cta: string; tone: string; map: Record<string, string> };
const BASE: Form = { cta: "Book", tone: "clear", map: { title: "title", slug: "slug" } };

describe("settings drafts (design §9: someone saved first, nothing is discarded)", () => {
  it("counts only real edits; a map with the same entries in another order is unchanged", () => {
    const draft = draftOf(BASE, 3);
    expect(unsavedKeys(edit(draft, "map", { slug: "slug", title: "title" }))).toEqual([]);
    expect(unsavedKeys(edit(draft, "cta", "Call us"))).toEqual(["cta"]);
  });

  it("after a save, the engine's copy is the base and anything typed since the save was sent stays unsaved", () => {
    const sending = edit(draftOf(BASE, 3), "cta", "Call us ");
    const typedSince = edit(sending, "tone", "warm");
    const after = afterSave(typedSince, sending.form, { ...BASE, cta: "Call us" }, 4);
    expect([after.version, after.form.cta, after.form.tone, unsavedKeys(after)]).toEqual([4, "Call us", "warm", ["tone"]]);
  });

  it("a newer version replaces the form only when nothing is unsaved", () => {
    const theirs = { ...BASE, tone: "formal" };
    expect(rebase(draftOf(BASE, 3), theirs, 4).form.tone).toBe("formal");
    const editing = edit(draftOf(BASE, 3), "cta", "Call us");
    expect(rebase(editing, theirs, 4)).toBe(editing);
    expect(rebase(draftOf(BASE, 3), theirs, 3).form.tone).toBe("clear");
  });

  it("keep mine: their values with only my changed fields on top, at their version (Review Focus 4)", () => {
    const mine = edit(draftOf(BASE, 3), "cta", "Call us");
    expect(withMyChanges(mine, { ...BASE, tone: "formal" }, 4)).toEqual({
      base: { ...BASE, tone: "formal" },
      version: 4,
      form: { ...BASE, tone: "formal", cta: "Call us" },
    });
  });

  it("lists the fields where two versions differ, for the conflict panel", () => {
    expect(changedKeys({ ...BASE, cta: "Call us" }, { ...BASE, tone: "formal" })).toEqual(["cta", "tone"]);
  });
});

describe("settingsFieldErrors (spec v1.1 §9)", () => {
  it("puts each message by its field, in camelCase, and lists the ones the form doesn't show", () => {
    const error = { status: 400, code: "invalid_input", message: "x", fields: { site_url: "Bad", "body.format": "Pick one", mystery: "?" } };
    expect(settingsFieldErrors(error, ["siteUrl", "body.format"])).toEqual({
      byField: { siteUrl: "Bad", "body.format": "Pick one" },
      other: [{ field: "mystery", message: "?" }],
    });
    expect(settingsFieldErrors(null, ["siteUrl"])).toEqual({ byField: {}, other: [] });
  });
});

describe("originOf", () => {
  it("uses the forwarded host and protocol (Vercel), or plain http on this machine", () => {
    expect(originOf(new Headers({ "x-forwarded-host": "portal.fakhernco.com", "x-forwarded-proto": "https", host: "internal:3000" }))).toBe(
      "https://portal.fakhernco.com",
    );
    expect(originOf(new Headers({ host: "localhost:3100" }))).toBe("http://localhost:3100");
    expect(originOf(new Headers({ host: "portal.example" }))).toBe("https://portal.example");
  });

  it("gives up on a host that isn't a plain host name", () => {
    expect([originOf(new Headers({ host: "a.example/evil" })), originOf(new Headers())]).toEqual([null, null]);
  });
});

describe("safeRedirectUrl", () => {
  it("follows https, and plain http only on this machine", () => {
    expect(safeRedirectUrl("https://www.linkedin.com/oauth?x=1")).toBe("https://www.linkedin.com/oauth?x=1");
    expect(safeRedirectUrl("http://localhost:3100/en/settings/social?connected=instagram")).toBe("http://localhost:3100/en/settings/social?connected=instagram");
  });

  it("never follows another scheme, plain http elsewhere, or something that isn't an address", () => {
    expect([safeRedirectUrl("javascript:alert(1)"), safeRedirectUrl("data:text/html,x"), safeRedirectUrl("http://evil.example/"), safeRedirectUrl("not a url")]).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });
});
```

Create `tests/unit/settings-actions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const engine = {
  seoSettings: vi.fn(),
  saveSeo: vi.fn(),
  proposeSeo: vi.fn(),
  uploadSeoPicture: vi.fn(),
  removeSeoPicture: vi.fn(),
  publishingSettings: vi.fn(),
  savePublishing: vi.fn(),
  websiteSettings: vi.fn(),
  saveWebsite: vi.fn(),
  testWebsite: vi.fn(),
  connectSocial: vi.fn(),
  disconnectSocial: vi.fn(),
  connectSearchConsole: vi.fn(),
  disconnectSearchConsole: vi.fn(),
};
const refresh = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh }));
const requirePermission = vi.fn(async () => ({ email: "admin@example.com" }));
vi.mock("@/lib/auth/session", () => ({ requirePermission }));
vi.mock("@/lib/engine", () => ({ getEngine: async () => engine }));
let requestHeaders = new Headers();
vi.mock("next/headers", () => ({ headers: async () => requestHeaders }));

const actions = await import("@/app/[locale]/(app)/settings/actions");

const key = "key-12345678";
const SEO_UPDATE = {
  siteName: "Fakher & Co",
  siteUrl: "https://fakhernco.com",
  blogPath: null,
  defaultLang: "en",
  focusKeywords: [],
  locations: [],
  author: null,
  linkedin: null,
  instagram: null,
  ogImage: null,
  cta: null,
  tone: null,
  audience: null,
  avoid: [],
  version: 3,
};
const PUBLISHING = { autoPublish: true, perDay: 2, days: ["sun"], from: "10:00", to: "17:00", gapMinutes: 180, version: 1 };
const TARGET = { type: "wordpress", settings: { url: "https://fakhernco.com" }, fieldMap: {}, body: { format: "html" }, arabic: { mode: "translatepress" } };

beforeEach(() => {
  vi.clearAllMocks();
  requestHeaders = new Headers({ host: "portal.example", "x-forwarded-proto": "https" });
  for (const method of Object.values(engine)) method.mockResolvedValue({ version: 2 });
});

describe("settings actions are for admins (design §5: settings.manage; Review Focus 5)", () => {
  it("checks settings.manage before every read and change", async () => {
    const picture = new FormData();
    picture.set("locale", "en");
    picture.set("idempotencyKey", key);
    picture.set("file", new File(["png"], "share.png", { type: "image/png" }));
    await actions.loadSeoAction({ locale: "en" });
    await actions.saveSeoAction({ locale: "en", update: SEO_UPDATE, idempotencyKey: key });
    await actions.proposeSeoAction({ locale: "en", idempotencyKey: key });
    await actions.uploadSeoPictureAction(picture);
    await actions.removeSeoPictureAction({ locale: "en", idempotencyKey: key });
    await actions.loadPublishingAction({ locale: "en" });
    await actions.savePublishingAction({ locale: "en", update: PUBLISHING, idempotencyKey: key });
    await actions.loadWebsiteAction({ locale: "en" });
    await actions.testWebsiteAction({ locale: "en", target: TARGET, idempotencyKey: key });
    await actions.saveWebsiteAction({ locale: "en", update: { ...TARGET, version: 1 }, idempotencyKey: key });
    await actions.connectSocialAction({ locale: "en", platform: "linkedin" });
    await actions.disconnectSocialAction({ locale: "en", platform: "linkedin", idempotencyKey: key });
    await actions.connectSearchConsoleAction({ locale: "en" });
    await actions.disconnectSearchConsoleAction({ locale: "en", idempotencyKey: key });
    expect(requirePermission.mock.calls).toEqual(Array.from({ length: 14 }, () => ["en", "settings.manage"]));
  });

  it("refuses a malformed platform or a schedule number that isn't whole, without calling the engine", async () => {
    expect(await actions.disconnectSocialAction({ locale: "en", platform: "../x", idempotencyKey: key })).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(await actions.savePublishingAction({ locale: "en", update: { ...PUBLISHING, perDay: 1.5 }, idempotencyKey: key })).toMatchObject({ ok: false });
    expect(engine.disconnectSocial).not.toHaveBeenCalled();
    expect(engine.savePublishing).not.toHaveBeenCalled();
  });

  it("connects a social account with this portal's own return address", async () => {
    engine.connectSocial.mockResolvedValue({ authorizeUrl: "https://www.linkedin.com/oauth/v2/authorization?x=1" });
    expect(await actions.connectSocialAction({ locale: "ar", platform: "linkedin" })).toEqual({
      ok: true,
      data: { authorizeUrl: "https://www.linkedin.com/oauth/v2/authorization?x=1" },
    });
    expect(engine.connectSocial).toHaveBeenCalledWith("linkedin", "https://portal.example/ar/settings/social");
  });

  it("won't connect when the request's own address can't be worked out", async () => {
    requestHeaders = new Headers({ host: "evil.example/path" });
    expect(await actions.connectSocialAction({ locale: "en", platform: "linkedin" })).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(engine.connectSocial).not.toHaveBeenCalled();
  });

  it("a connection test and an AI proposal don't refresh the page; a save does", async () => {
    await actions.testWebsiteAction({ locale: "en", target: TARGET, idempotencyKey: key });
    await actions.proposeSeoAction({ locale: "en", idempotencyKey: key });
    expect(refresh).not.toHaveBeenCalled();
    await actions.saveWebsiteAction({ locale: "en", update: { ...TARGET, version: 1 }, idempotencyKey: key });
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the tests to make sure they fail**

Run: `pnpm test tests/unit/settings-lib.test.ts tests/unit/settings-actions.test.ts`
Expected: FAIL. Both files fail to load: "Failed to resolve import "@/lib/settings/addresses"" and "…"@/app/[locale]/(app)/settings/actions"".

- [ ] **Step 3: Add `ask()`**

Append to `src/lib/actions/server.ts`:

```ts
/** A request that changes nothing on screen (a connection test, an AI proposal): change()'s checks, acting user and key, no refresh. */
export async function ask<T>(
  locale: string,
  idempotencyKey: string,
  run: (ctx: ChangeContext & { engine: EngineApi }) => Promise<T>,
  permission: Permission = "content.work",
): Promise<ActionResult<T>> {
  const { engine, actingUser } = await engineFor(locale, permission);
  return tryEngine(() => run({ engine, actingUser, idempotencyKey }));
}
```

- [ ] **Step 4: Write the pure modules**

Create `src/lib/settings/draft.ts`:

```ts
/**
 * A settings form (spec v1.1 §4: each settings model has a version): the values it started from, that version, and
 * the edits. A save sends the version, so a newer save by someone else comes back as version_conflict (design §9).
 */
export type SettingsDraft<F> = { base: F; version: number; form: F };

/** Compares by value; object keys are sorted, so a map with the same entries in another order is the same. */
function stable(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : item,
  );
}

export const draftOf = <F>(form: F, version: number): SettingsDraft<F> => ({ base: form, version, form });

export const edit = <F, K extends keyof F>(draft: SettingsDraft<F>, key: K, value: F[K]): SettingsDraft<F> => ({
  ...draft,
  form: { ...draft.form, [key]: value },
});

/** The top-level fields whose values differ. */
export function changedKeys<F extends object>(a: F, b: F): (keyof F & string)[] {
  return (Object.keys(a) as (keyof F & string)[]).filter((key) => stable(a[key]) !== stable(b[key]));
}

export const unsavedKeys = <F extends object>(draft: SettingsDraft<F>) => changedKeys(draft.form, draft.base);

/** Saved: the engine's copy is the new base and form, at its version; anything typed since the save was sent stays on top. */
export function afterSave<F extends object>(draft: SettingsDraft<F>, sent: F, saved: F, version: number): SettingsDraft<F> {
  const typedSince = Object.fromEntries(changedKeys(draft.form, sent).map((key) => [key, draft.form[key]]));
  return { base: saved, version, form: { ...saved, ...typedSince } };
}

/** A newer version arrived: it's shown when nothing is unsaved; otherwise the edits stay on their version, so saving them conflicts. */
export function rebase<F extends object>(draft: SettingsDraft<F>, form: F, version: number): SettingsDraft<F> {
  if (version <= draft.version || unsavedKeys(draft).length > 0) return draft;
  return draftOf(form, version);
}

/** Keep my changes after a conflict: their values, with only the fields I changed on top, at their version. */
export function withMyChanges<F extends object>(draft: SettingsDraft<F>, theirs: F, version: number): SettingsDraft<F> {
  const mine = Object.fromEntries(unsavedKeys(draft).map((key) => [key, draft.form[key]]));
  return { base: theirs, version, form: { ...theirs, ...mine } };
}
```

Create `src/lib/settings/addresses.ts`:

```ts
const HOST = /^[A-Za-z0-9.-]+(:\d+)?$/;
const isLocal = (hostname: string) => hostname === "localhost" || hostname === "127.0.0.1";

/** This portal's own address, from the request (Vercel sets x-forwarded-host and x-forwarded-proto); null if it isn't a plain host. */
export function originOf(headers: Headers): string | null {
  const host = (headers.get("x-forwarded-host") ?? headers.get("host") ?? "").split(",")[0].trim();
  if (!HOST.test(host)) return null;
  const forwarded = (headers.get("x-forwarded-proto") ?? "").split(",")[0].trim();
  const protocol = forwarded === "http" || forwarded === "https" ? forwarded : isLocal(host.split(":")[0]) ? "http" : "https";
  return `${protocol}://${host}`;
}

/** The engine's sign-in address is followed only if it's https (or http on this machine), so nothing like `javascript:` runs here. */
export function safeRedirectUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol === "https:" || (url.protocol === "http:" && isLocal(url.hostname))) return url.href;
    return null;
  } catch {
    return null;
  }
}
```

Create `src/lib/settings/field-errors.ts`:

```ts
import type { EngineFailure } from "@/lib/engine/result";

export type SettingsFieldErrors = { byField: Record<string, string>; other: { field: string; message: string }[] };

const camel = (name: string) => name.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());

/** Spec v1.1 §9: a 400 carries a message per field. They go next to the fields the form shows (the engine may use snake_case); the rest are listed. */
export function settingsFieldErrors(error: EngineFailure | null, shown: readonly string[]): SettingsFieldErrors {
  const result: SettingsFieldErrors = { byField: {}, other: [] };
  for (const [field, message] of Object.entries(error?.fields ?? {})) {
    const key = camel(field);
    if (shown.includes(key)) result.byField[key] = message;
    else result.other.push({ field, message });
  }
  return result;
}
```

- [ ] **Step 5: Write the server actions**

Create `src/app/[locale]/(app)/settings/actions.ts`:

```ts
"use server";

import { headers } from "next/headers";
import { z } from "zod";
import type { ActionResult } from "@/lib/actions/result";
import { ask, change, EngineId, engineFor, IdempotencyKey, INVALID, Locale } from "@/lib/actions/server";
import { tryEngine } from "@/lib/engine/result";
import {
  PublishingSettingsSchema,
  SeoUpdateSchema,
  WebsiteTargetInputSchema,
  WebsiteUpdateSchema,
  type JobStart,
  type PublishingSettings,
  type PublishTarget,
  type SeoSettings,
  type WebsiteTest,
} from "@/lib/engine/schemas";
import { originOf } from "@/lib/settings/addresses";

// Every settings page and action is the Admin's (design §5).
const MANAGE = "settings.manage" as const;
const Read = z.object({ locale: Locale });
const Change = z.object({ locale: Locale, idempotencyKey: IdempotencyKey });

export async function loadSeoAction(input: { locale: string }): Promise<ActionResult<SeoSettings>> {
  const parsed = Read.safeParse(input);
  if (!parsed.success) return INVALID;
  const { engine } = await engineFor(parsed.data.locale, MANAGE);
  return tryEngine(() => engine.seoSettings());
}

export async function saveSeoAction(input: { locale: string; update: z.infer<typeof SeoUpdateSchema>; idempotencyKey: string }): Promise<ActionResult<SeoSettings>> {
  const parsed = Change.extend({ update: SeoUpdateSchema }).safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, update, idempotencyKey } = parsed.data;
  return change(locale, idempotencyKey, ({ engine, ...ctx }) => engine.saveSeo(update, ctx), MANAGE);
}

/** AI suggestions for focus keywords and the call to action: a job; nothing on the page changes until it's done. */
export async function proposeSeoAction(input: { locale: string; idempotencyKey: string }): Promise<ActionResult<JobStart>> {
  const parsed = Change.safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, idempotencyKey } = parsed.data;
  return ask(locale, idempotencyKey, ({ engine, ...ctx }) => engine.proposeSeo(ctx), MANAGE);
}

const PictureUpload = z.object({ locale: Locale, idempotencyKey: IdempotencyKey, file: z.instanceof(File) });

/** The share picture: the browser sends FormData; the engine checks its type and size (spec v1.1 §10). */
export async function uploadSeoPictureAction(form: FormData): Promise<ActionResult<{ url: string }>> {
  const parsed = PictureUpload.safeParse({ locale: form.get("locale"), idempotencyKey: form.get("idempotencyKey"), file: form.get("file") });
  if (!parsed.success) return INVALID;
  const { locale, idempotencyKey, file } = parsed.data;
  return change(locale, idempotencyKey, ({ engine, ...ctx }) => engine.uploadSeoPicture(file, ctx), MANAGE);
}

export async function removeSeoPictureAction(input: { locale: string; idempotencyKey: string }): Promise<ActionResult<{ removed: true }>> {
  const parsed = Change.safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, idempotencyKey } = parsed.data;
  return change(locale, idempotencyKey, ({ engine, ...ctx }) => engine.removeSeoPicture(ctx), MANAGE);
}

export async function loadPublishingAction(input: { locale: string }): Promise<ActionResult<PublishingSettings>> {
  const parsed = Read.safeParse(input);
  if (!parsed.success) return INVALID;
  const { engine } = await engineFor(parsed.data.locale, MANAGE);
  return tryEngine(() => engine.publishingSettings());
}

export async function savePublishingAction(input: { locale: string; update: PublishingSettings; idempotencyKey: string }): Promise<ActionResult<PublishingSettings>> {
  const parsed = Change.extend({ update: PublishingSettingsSchema }).safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, update, idempotencyKey } = parsed.data;
  return change(locale, idempotencyKey, ({ engine, ...ctx }) => engine.savePublishing(update, ctx), MANAGE);
}

export async function loadWebsiteAction(input: { locale: string }): Promise<ActionResult<PublishTarget>> {
  const parsed = Read.safeParse(input);
  if (!parsed.success) return INVALID;
  const { engine } = await engineFor(parsed.data.locale, MANAGE);
  return tryEngine(() => engine.websiteSettings());
}

/** Test connection with the unsaved values (spec v1.1 §7). Nothing is saved, so the page isn't refreshed. */
export async function testWebsiteAction(input: {
  locale: string;
  target: z.infer<typeof WebsiteTargetInputSchema>;
  idempotencyKey: string;
}): Promise<ActionResult<WebsiteTest>> {
  const parsed = Change.extend({ target: WebsiteTargetInputSchema }).safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, target, idempotencyKey } = parsed.data;
  return ask(locale, idempotencyKey, ({ engine, ...ctx }) => engine.testWebsite(target, ctx), MANAGE);
}

export async function saveWebsiteAction(input: {
  locale: string;
  update: z.infer<typeof WebsiteUpdateSchema>;
  idempotencyKey: string;
}): Promise<ActionResult<PublishTarget>> {
  const parsed = Change.extend({ update: WebsiteUpdateSchema }).safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, update, idempotencyKey } = parsed.data;
  return change(locale, idempotencyKey, ({ engine, ...ctx }) => engine.saveWebsite(update, ctx), MANAGE);
}

/** Where the OAuth round trip comes back to: this portal's Social accounts page, in the person's language. */
async function returnUrlFor(locale: string): Promise<string | null> {
  const origin = originOf(await headers());
  return origin ? `${origin}/${locale}/settings/social` : null;
}

export async function connectSocialAction(input: { locale: string; platform: string }): Promise<ActionResult<{ authorizeUrl: string }>> {
  const parsed = Read.extend({ platform: EngineId }).safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, platform } = parsed.data;
  const { engine } = await engineFor(locale, MANAGE);
  const returnUrl = await returnUrlFor(locale);
  if (!returnUrl) return INVALID;
  return tryEngine(() => engine.connectSocial(platform, returnUrl));
}

export async function disconnectSocialAction(input: { locale: string; platform: string; idempotencyKey: string }): Promise<ActionResult<{ disconnected: true }>> {
  const parsed = Change.extend({ platform: EngineId }).safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, platform, idempotencyKey } = parsed.data;
  return change(locale, idempotencyKey, ({ engine, ...ctx }) => engine.disconnectSocial(platform, ctx), MANAGE);
}

export async function connectSearchConsoleAction(input: { locale: string }): Promise<ActionResult<{ authorizeUrl: string }>> {
  const parsed = Read.safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale } = parsed.data;
  const { engine } = await engineFor(locale, MANAGE);
  const returnUrl = await returnUrlFor(locale);
  if (!returnUrl) return INVALID;
  return tryEngine(() => engine.connectSearchConsole(returnUrl));
}

export async function disconnectSearchConsoleAction(input: { locale: string; idempotencyKey: string }): Promise<ActionResult<{ disconnected: true }>> {
  const parsed = Change.safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, idempotencyKey } = parsed.data;
  return change(locale, idempotencyKey, ({ engine, ...ctx }) => engine.disconnectSearchConsole(ctx), MANAGE);
}
```

- [ ] **Step 6: Run the tests to make sure they pass**

Run: `pnpm test tests/unit/settings-lib.test.ts tests/unit/settings-actions.test.ts`
Expected: PASS (10 and 5 tests).

- [ ] **Step 7: Lint, typecheck and the whole unit suite**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: lint and typecheck exit 0; every unit test passes.

- [ ] **Step 8: Commit**

```bash
git add src/lib/actions/server.ts src/lib/settings "src/app/[locale]/(app)/settings/actions.ts" tests/unit/settings-lib.test.ts tests/unit/settings-actions.test.ts
git commit -m "feat: settings actions (settings.manage), versioned drafts, safe OAuth addresses, field errors"
```

---

### Task 5: The settings shell and the Publishing schedule page

**Files:**
- Modify: `src/components/shell/nav.ts`, `src/components/shell/nav-link.tsx`, `src/components/shell/sidebar-nav.tsx`, `tests/unit/nav.test.ts`, `messages/en.json`, `messages/ar.json`
- Create:
  - lib: `src/lib/settings/schedule-form.ts`
  - shared components:
    - `src/components/settings/settings-tabs.tsx`
    - `src/components/settings/use-settings-draft.ts`
    - `src/components/settings/settings-conflict.tsx`
    - `src/components/settings/form-parts.tsx`
  - page components: `src/components/settings/schedule-view.tsx`, `src/components/settings/schedule-form.tsx`
  - page: `src/app/[locale]/(app)/settings/schedule/page.tsx`
- Test: `tests/unit/schedule-form.test.ts`, `tests/e2e/settings-schedule.spec.ts` (create)

**Interfaces:**
- Consumes: Task 4 actions, `settingsFieldErrors` and `src/lib/settings/draft.ts`; M2b `nextSlotView`, `formatDateTime`, `EngineNotice`, `SectionSkeleton`
- Produces:
  - **Navigation:**
    - `NavItem.match?: string`; `NavLink` takes `match`.
    - The Settings item is `{ key: "settings", href: "/settings/seo", match: "/settings", permission: "settings.manage" }`.
  - **`SettingsTabs({ current })`** with `SETTINGS_PAGES = ["seo", "schedule", "website", "social"]`.
  - **`useSettingsDraft({ saved, toForm, save, load })`** returns:
    - `{ form, base, unsaved, update, save, pending, savedNow, error, conflict, loadTheirs, keepMine }`
    - `save()` resolves to whether it saved
    - `conflict` is `{ theirs, keys }` or null
  - **`SettingsConflict({ rows, pending, onLoadTheirs, onKeepMine })`**, where rows are `{ key, label, theirs, mine }`.
  - **`form-parts.tsx`:** `FieldMessage`, `OtherFieldErrors`, `SaveFailure`, `SaveBar`.
  - **`schedule-form.ts`:**
    - `WEEK`, `type ScheduleForm`
    - `toScheduleForm`, `orderedDays`, `withDay`
    - `toPublishingUpdate(form, version)`, which returns `{ ok: true; update }` or `{ ok: false; invalid }`
  - **Test ids:**
    - Navigation: `nav-settings`, `settings-tab-{page}`.
    - Save bar: `settings-save`, `settings-saved`, `settings-unsaved`, `settings-check-fields`.
    - Field messages: `field-error-{field}`.
    - Conflict panel: `settings-conflict`, `settings-conflict-{key}`, `settings-conflict-load-theirs`, `settings-conflict-keep-mine`.
    - Schedule form:
      - `schedule-auto-publish`, `schedule-per-day`, `schedule-from`, `schedule-to`, `schedule-gap`
      - `schedule-day-{code}`, `schedule-day-label-{code}`
      - `schedule-next-slot`

- [ ] **Step 1: Write the failing tests**

In `tests/unit/nav.test.ts`, replace the test `it("gives both roles the M1 dashboard", …)` with:

```ts
  it("gives reviewers every content screen, and admins the settings too (design §5)", () => {
    expect(visibleNavItems("reviewer").map((item) => item.key)).not.toContain("settings");
    expect(visibleNavItems("admin")).toEqual(NAV_ITEMS);
    expect(NAV_ITEMS.find((item) => item.key === "settings")).toEqual({ key: "settings", href: "/settings/seo", match: "/settings", permission: "settings.manage" });
  });
```

Create `tests/unit/schedule-form.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { toPublishingUpdate, toScheduleForm, withDay } from "@/lib/settings/schedule-form";

const SETTINGS = { autoPublish: true, perDay: 2, days: ["sun", "mon", "tue", "wed", "thu"], from: "10:00", to: "17:00", gapMinutes: 180, version: 4 };

describe("the schedule form (spec v1.1 §4 PublishingSettings)", () => {
  it("turns the settings into a form and back", () => {
    expect(toPublishingUpdate(toScheduleForm(SETTINGS), 4)).toEqual({ ok: true, update: SETTINGS });
  });

  it("keeps days in week order, and keeps a code it doesn't know", () => {
    const form = toScheduleForm({ ...SETTINGS, days: ["thu", "sun", "holiday"] });
    expect(form.days).toEqual(["sun", "thu", "holiday"]);
    expect(withDay(form, "mon", true).days).toEqual(["sun", "mon", "thu", "holiday"]);
    expect(withDay(form, "thu", false).days).toEqual(["sun", "holiday"]);
  });

  it("catches a number that isn't whole before saving", () => {
    const form = toScheduleForm(SETTINGS);
    expect(toPublishingUpdate({ ...form, perDay: "1.5", gapMinutes: "" }, 4)).toEqual({ ok: false, invalid: ["perDay", "gapMinutes"] });
    expect(toPublishingUpdate({ ...form, perDay: " 3 " }, 4)).toMatchObject({ ok: true, update: { perDay: 3 } });
  });
});
```

Create `tests/e2e/settings-schedule.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { isolateMockStore, normalizeSpaces, signInWithCookie } from "./helpers";

const OFF = "Auto-publish is off. Nothing goes out until someone presses Publish now.";

test.beforeEach(async ({ context }) => {
  await isolateMockStore(context);
});

test("an admin finds Settings in the menu; a reviewer neither sees it nor can open it (Review Focus 5)", async ({ page, context }) => {
  await signInWithCookie(context, "dev_admin");
  await page.goto("/en/settings/schedule");
  await expect(page.getByTestId("nav-settings")).toHaveAttribute("href", "/en/settings/seo");
  await expect(page.getByTestId("nav-settings")).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("settings-tab-schedule")).toHaveAttribute("aria-current", "page");
  await signInWithCookie(context, "dev_reviewer");
  await page.goto("/en/settings/schedule");
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.getByTestId("nav-settings")).toHaveCount(0);
});

test("turning auto-publish off shows on this page and on Scheduled", async ({ page, context }) => {
  await signInWithCookie(context, "dev_admin");
  await page.goto("/en/settings/schedule");
  await page.getByTestId("schedule-auto-publish").uncheck();
  await expect(page.getByTestId("settings-unsaved")).toBeVisible();
  await page.getByTestId("settings-save").click();
  await expect(page.getByTestId("settings-saved")).toBeVisible();
  await expect(page.getByTestId("schedule-next-slot")).toHaveText(OFF);
  await page.goto("/en/scheduled");
  await expect(page.getByTestId("schedule-banner")).toHaveText(OFF);
});

test("one a day from 09:00: the next slot comes from the engine", async ({ page, context }) => {
  await signInWithCookie(context, "dev_admin");
  await page.goto("/en/settings/schedule");
  await expect.poll(async () => normalizeSpaces(await page.getByTestId("schedule-next-slot").innerText())).toContain("10:00 AM");
  await page.getByTestId("schedule-per-day").fill("1");
  await page.getByTestId("schedule-from").fill("09:00");
  await page.getByTestId("settings-save").click();
  await expect(page.getByTestId("settings-saved")).toBeVisible();
  await expect.poll(async () => normalizeSpaces(await page.getByTestId("schedule-next-slot").innerText())).toContain("9:00 AM");
});

test("a schedule that doesn't fit shows the engine's message next to the field", async ({ page, context }) => {
  await signInWithCookie(context, "dev_admin");
  await page.goto("/en/settings/schedule");
  await page.getByTestId("schedule-per-day").fill("4");
  await page.getByTestId("settings-save").click();
  await expect(page.getByTestId("settings-check-fields")).toBeVisible();
  await expect(page.getByTestId("field-error-perDay")).toContainText("don't fit");
});

test("a number that isn't whole is caught before saving; a day can be taken out", async ({ page, context }) => {
  await signInWithCookie(context, "dev_admin");
  await page.goto("/en/settings/schedule");
  await page.getByTestId("schedule-gap").fill("1.5");
  await page.getByTestId("settings-save").click();
  await expect(page.getByTestId("field-error-gapMinutes")).toHaveText("Enter a whole number.");
  await page.getByTestId("schedule-gap").fill("180");
  await page.getByTestId("schedule-day-thu").uncheck();
  await page.getByTestId("settings-save").click();
  await expect(page.getByTestId("settings-saved")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("schedule-day-thu")).not.toBeChecked();
});

test("works in Arabic: right to left, with Arabic day names", async ({ page, context }) => {
  await signInWithCookie(context, "dev_admin");
  await page.goto("/ar/settings/schedule");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("الإعدادات");
  await expect(page.getByTestId("schedule-day-label-sun")).toHaveText("الأحد");
});
```

- [ ] **Step 2: Run the unit tests to make sure they fail**

Run: `pnpm test tests/unit/nav.test.ts tests/unit/schedule-form.test.ts`
Expected: FAIL.
- `nav.test.ts`: `NAV_ITEMS` has no settings item, so the `toEqual` gets `undefined`.
- `schedule-form.test.ts`: fails to resolve `@/lib/settings/schedule-form`.

- [ ] **Step 3: Add the messages**

Merge into `messages/en.json`:
- at `Shell.nav`: `{ "settings": "Settings" }`
- at the top level:

```json
{
  "Settings": {
    "title": "Settings",
    "tabs": { "label": "Settings pages", "seo": "SEO profile", "schedule": "Publishing schedule", "website": "Website connection", "social": "Social accounts" },
    "save": "Save",
    "saving": "Saving…",
    "saved": "Saved.",
    "unsaved": "You have unsaved changes.",
    "checkFields": "Some fields need attention. See the messages under them.",
    "otherFields": "The content engine also said:",
    "testFirst": "Test the connection first: a changed connection is saved only after its test passes.",
    "on": "On",
    "off": "Off",
    "conflict": {
      "title": "Someone saved first",
      "body": "These settings changed while you were editing. Nothing is lost: compare the two versions and choose.",
      "theirs": "Saved version",
      "mine": "Your version",
      "loadTheirs": "Use the saved version",
      "keepMine": "Keep my changes"
    },
    "schedule": {
      "title": "Publishing schedule",
      "hint": "When approved posts go out. The content engine works out the exact times.",
      "autoPublish": "Publish automatically",
      "autoPublishHint": "When this is off, nothing goes out until someone presses Publish now.",
      "perDay": "Posts a day",
      "days": "Days",
      "from": "From",
      "to": "Until",
      "gapMinutes": "Minutes between posts",
      "wholeNumber": "Enter a whole number.",
      "nextSlot": "Next publish slot: {time}",
      "dayNames": { "sun": "Sunday", "mon": "Monday", "tue": "Tuesday", "wed": "Wednesday", "thu": "Thursday", "fri": "Friday", "sat": "Saturday" }
    }
  }
}
```

Merge into `messages/ar.json`:
- at `Shell.nav`: `{ "settings": "الإعدادات" }`
- at the top level:

```json
{
  "Settings": {
    "title": "الإعدادات",
    "tabs": { "label": "صفحات الإعدادات", "seo": "ملف تحسين محركات البحث", "schedule": "جدول النشر", "website": "اتصال الموقع", "social": "حسابات التواصل الاجتماعي" },
    "save": "حفظ",
    "saving": "جارٍ الحفظ…",
    "saved": "تم الحفظ.",
    "unsaved": "لديك تغييرات غير محفوظة.",
    "checkFields": "بعض الحقول تحتاج إلى مراجعة. اطّلع على الرسائل تحتها.",
    "otherFields": "قال محرك المحتوى أيضاً:",
    "testFirst": "اختبر الاتصال أولاً: لا يُحفظ اتصال مُعدَّل إلا بعد نجاح اختباره.",
    "on": "مفعّل",
    "off": "متوقف",
    "conflict": {
      "title": "حفظ شخص آخر أولاً",
      "body": "تغيّرت هذه الإعدادات أثناء تعديلك. لم يضِع شيء: قارن بين النسختين واختر.",
      "theirs": "النسخة المحفوظة",
      "mine": "نسختك",
      "loadTheirs": "استخدام النسخة المحفوظة",
      "keepMine": "الاحتفاظ بتغييراتي"
    },
    "schedule": {
      "title": "جدول النشر",
      "hint": "متى تُنشر المنشورات المعتمدة. يحدد محرك المحتوى الأوقات بدقة.",
      "autoPublish": "النشر التلقائي",
      "autoPublishHint": "عند إيقافه، لن يُنشر شيء حتى يضغط أحدهم «انشر الآن».",
      "perDay": "عدد المنشورات يومياً",
      "days": "الأيام",
      "from": "من",
      "to": "حتى",
      "gapMinutes": "الدقائق بين المنشورات",
      "wholeNumber": "أدخل عدداً صحيحاً.",
      "nextSlot": "موعد النشر التالي: {time}",
      "dayNames": { "sun": "الأحد", "mon": "الاثنين", "tue": "الثلاثاء", "wed": "الأربعاء", "thu": "الخميس", "fri": "الجمعة", "sat": "السبت" }
    }
  }
}
```

- [ ] **Step 4: Add the Settings menu item**

In `src/components/shell/nav.ts`:
- Change the type to `export type NavItem = { key: string; href: string; permission: Permission; match?: string };`.
- Append to `NAV_ITEMS`:

  ```ts
    // The four settings pages share one item; it's highlighted on any of them.
    { key: "settings", href: "/settings/seo", match: "/settings", permission: "settings.manage" },
  ```

In `src/components/shell/nav-link.tsx`, replace the function with:

```tsx
export function NavLink({ href, match, testId, children }: { href: string; match?: string; testId: string; children: ReactNode }) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname.startsWith(match ?? href);
  return (
    <Link
      href={href}
      data-testid={testId}
      aria-current={active ? "page" : undefined}
      className={cn(
        "block rounded-md px-3 py-2 text-sm hover:bg-sidebar-accent",
        active && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
      )}
    >
      {children}
    </Link>
  );
}
```

In `src/components/shell/sidebar-nav.tsx`, change `<NavLink href={item.href} testId={`nav-${item.key}`}>` to `<NavLink href={item.href} match={item.match} testId={`nav-${item.key}`}>`.

- [ ] **Step 5: Write the schedule form module**

Create `src/lib/settings/schedule-form.ts`:

```ts
import type { PublishingSettings } from "@/lib/engine/schemas";

/** Weekday codes (spec v1.1 §4 PublishingSettings.days), Sunday first as the spec's example lists them. */
export const WEEK = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/** The form keeps numbers as typed text until saving, so a half-typed number isn't rewritten under the cursor. */
export type ScheduleForm = { autoPublish: boolean; perDay: string; days: string[]; from: string; to: string; gapMinutes: string };

const isWeekday = (day: string) => (WEEK as readonly string[]).includes(day);

/** Days in week order; a code this form doesn't know is kept at the end and sent back unchanged. */
export function orderedDays(days: string[]): string[] {
  return [...WEEK.filter((day) => days.includes(day)), ...days.filter((day) => !isWeekday(day))];
}

export function toScheduleForm(settings: PublishingSettings): ScheduleForm {
  return {
    autoPublish: settings.autoPublish,
    perDay: String(settings.perDay),
    days: orderedDays(settings.days),
    from: settings.from,
    to: settings.to,
    gapMinutes: String(settings.gapMinutes),
  };
}

export function withDay(form: ScheduleForm, day: string, on: boolean): ScheduleForm {
  const days = on ? [...form.days, day] : form.days.filter((item) => item !== day);
  return { ...form, days: orderedDays([...new Set(days)]) };
}

const WHOLE = /^\s*\d+\s*$/;

/** The PUT body, or the number fields that aren't whole numbers (caught here, before any request). */
export function toPublishingUpdate(
  form: ScheduleForm,
  version: number,
): { ok: true; update: PublishingSettings } | { ok: false; invalid: ("perDay" | "gapMinutes")[] } {
  const invalid = (["perDay", "gapMinutes"] as const).filter((key) => !WHOLE.test(form[key]));
  if (invalid.length > 0) return { ok: false, invalid };
  return {
    ok: true,
    update: {
      autoPublish: form.autoPublish,
      perDay: Number.parseInt(form.perDay, 10),
      days: form.days,
      from: form.from,
      to: form.to,
      gapMinutes: Number.parseInt(form.gapMinutes, 10),
      version,
    },
  };
}
```

- [ ] **Step 6: Run the unit tests to make sure they pass**

Run: `pnpm test tests/unit/nav.test.ts tests/unit/schedule-form.test.ts`
Expected: PASS (3 and 3 tests).

- [ ] **Step 7: Write the shared settings components**

Create `src/components/settings/settings-tabs.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export const SETTINGS_PAGES = ["seo", "schedule", "website", "social"] as const;
export type SettingsPage = (typeof SETTINGS_PAGES)[number];

/** Design §7: one page per settings model. Each page says which one it is, so nothing here reads the pathname. */
export async function SettingsTabs({ current }: { current: SettingsPage }) {
  const t = await getTranslations("Settings.tabs");
  return (
    <nav aria-label={t("label")} className="flex flex-wrap gap-2 border-b border-border pb-2">
      {SETTINGS_PAGES.map((page) => (
        <Link
          key={page}
          href={`/settings/${page}`}
          data-testid={`settings-tab-${page}`}
          aria-current={page === current ? "page" : undefined}
          className={cn("rounded-md px-3 py-1.5 text-sm hover:bg-muted", page === current && "bg-muted font-medium")}
        >
          {t(page)}
        </Link>
      ))}
    </nav>
  );
}
```

Create `src/components/settings/use-settings-draft.ts`:

```ts
"use client";

import { useState } from "react";
import type { ActionResult } from "@/lib/actions/result";
import type { EngineFailure } from "@/lib/engine/result";
import { afterSave, changedKeys, draftOf, rebase, unsavedKeys, withMyChanges, type SettingsDraft } from "@/lib/settings/draft";

type Options<M extends { version: number }, F extends object> = {
  /** The model as the server last rendered it; a refresh after a save (or someone else's) brings a newer one. */
  saved: M;
  toForm: (model: M) => F;
  save: (form: F, version: number) => Promise<ActionResult<M>>;
  load: () => Promise<ActionResult<M>>;
};

/**
 * A settings form over a versioned model (spec v1.1 §4). A save sends the version the form started from. A newer
 * version replaces the form only when nothing is unsaved, and a 409 shows both versions with Keep my changes / Use the
 * saved version (design §9).
 */
export function useSettingsDraft<M extends { version: number }, F extends object>({ saved, toForm, save, load }: Options<M, F>) {
  const [draft, setDraft] = useState<SettingsDraft<F>>(() => draftOf(toForm(saved), saved.version));
  const [seen, setSeen] = useState(saved);
  const [theirs, setTheirs] = useState<M | null>(null);
  const [error, setError] = useState<EngineFailure | null>(null);
  const [savedNow, setSavedNow] = useState(false);
  const [pending, setPending] = useState(false);

  if (saved !== seen) {
    setSeen(saved);
    const next = rebase(draft, toForm(saved), saved.version);
    if (next !== draft) setDraft(next);
  }

  function update(change: (form: F) => F) {
    setSavedNow(false);
    setDraft((current) => ({ ...current, form: change(current.form) }));
  }

  async function persist(toSave: SettingsDraft<F>): Promise<boolean> {
    setError(null);
    setSavedNow(false);
    setPending(true);
    try {
      const sent = toSave.form;
      const result = await save(sent, toSave.version);
      if (result.ok) {
        setDraft((latest) => afterSave(latest, sent, toForm(result.data), result.data.version));
        setSavedNow(true);
        return true;
      }
      if (result.error.code === "version_conflict") {
        const latest = await load();
        if (latest.ok) setTheirs(latest.data);
        else setError(latest.error);
        return false;
      }
      setError(result.error);
      return false;
    } finally {
      setPending(false);
    }
  }

  function loadTheirs() {
    if (!theirs) return;
    setDraft(draftOf(toForm(theirs), theirs.version));
    setTheirs(null);
  }

  async function keepMine() {
    if (!theirs) return;
    const next = withMyChanges(draft, toForm(theirs), theirs.version);
    setTheirs(null);
    setDraft(next);
    await persist(next);
  }

  const theirForm = theirs ? toForm(theirs) : null;
  return {
    form: draft.form,
    base: draft.base,
    unsaved: unsavedKeys(draft),
    update,
    save: () => persist(draft),
    pending,
    savedNow,
    error,
    conflict: theirForm ? { theirs: theirForm, keys: changedKeys(draft.form, theirForm) } : null,
    loadTheirs,
    keepMine,
  };
}
```

Create `src/components/settings/settings-conflict.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

type Row = { key: string; label: string; theirs: unknown; mine: unknown };
type Props = { rows: Row[]; pending: boolean; onLoadTheirs: () => void; onKeepMine: () => void };

/** Design §9: someone saved first. Both versions are shown; keeping mine saves my changed fields on top of theirs. */
export function SettingsConflict({ rows, pending, onLoadTheirs, onKeepMine }: Props) {
  const t = useTranslations("Settings");
  const show = (value: unknown): string => {
    if (typeof value === "boolean") return value ? t("on") : t("off");
    if (Array.isArray(value)) return value.join(", ");
    if (value && typeof value === "object") return Object.entries(value).map(([key, item]) => `${key}: ${String(item)}`).join(", ");
    return value === null || value === undefined ? "" : String(value);
  };
  return (
    <div role="alert" data-testid="settings-conflict" className="rounded-md border border-warn-fg/40 bg-warn-bg p-4 text-sm text-warn-fg">
      <p className="font-medium">{t("conflict.title")}</p>
      <p className="mt-1">{t("conflict.body")}</p>
      <dl className="mt-2 flex flex-col gap-2">
        {rows.map((row) => (
          <div key={row.key} data-testid={`settings-conflict-${row.key}`}>
            <dt className="font-medium">{row.label}</dt>
            <dd className="ps-3">
              {t("conflict.theirs")}: <span dir="auto">{show(row.theirs) || "—"}</span>
            </dd>
            <dd className="ps-3">
              {t("conflict.mine")}: <span dir="auto">{show(row.mine) || "—"}</span>
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" data-testid="settings-conflict-load-theirs" onClick={onLoadTheirs}>
          {t("conflict.loadTheirs")}
        </Button>
        <Button size="sm" data-testid="settings-conflict-keep-mine" disabled={pending} onClick={onKeepMine}>
          {t("conflict.keepMine")}
        </Button>
      </div>
    </div>
  );
}
```

Create `src/components/settings/form-parts.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { ActionError } from "@/components/actions/action-error";
import { Button } from "@/components/ui/button";
import type { EngineFailure } from "@/lib/engine/result";

/** Spec v1.1 §9: the engine's message for one field, under that field. */
export function FieldMessage({ field, message }: { field: string; message: string | undefined }) {
  if (!message) return null;
  return (
    <p data-testid={`field-error-${field}`} className="text-xs text-bad-fg">
      {message}
    </p>
  );
}

/** Messages for fields this form doesn't show, so none is lost. */
export function OtherFieldErrors({ items }: { items: { field: string; message: string }[] }) {
  const t = useTranslations("Settings");
  if (items.length === 0) return null;
  return (
    <div data-testid="field-errors-other" className="text-sm text-bad-fg">
      <p>{t("otherFields")}</p>
      <ul className="list-disc ps-5">
        {items.map((item) => (
          <li key={item.field}>
            {item.field}: {item.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A failed save. Field errors point at the fields; a refused connection asks for a test; anything else is the usual action error. */
export function SaveFailure({ error }: { error: EngineFailure | null }) {
  const t = useTranslations("Settings");
  if (!error) return null;
  if (error.fields && Object.keys(error.fields).length > 0) {
    return (
      <p role="alert" data-testid="settings-check-fields" className="rounded-md bg-bad-bg px-3 py-2 text-sm text-bad-fg">
        {t("checkFields")}
      </p>
    );
  }
  if (error.code === "not_connected") {
    return (
      <p role="alert" data-testid="settings-test-first" className="rounded-md bg-bad-bg px-3 py-2 text-sm text-bad-fg">
        {t("testFirst")}
      </p>
    );
  }
  return <ActionError error={error} />;
}

type SaveBarProps = { onSave: () => void; pending: boolean; disabled: boolean; unsaved: boolean; savedNow: boolean };

export function SaveBar({ onSave, pending, disabled, unsaved, savedNow }: SaveBarProps) {
  const t = useTranslations("Settings");
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button data-testid="settings-save" disabled={disabled || pending} onClick={onSave}>
        {pending ? t("saving") : t("save")}
      </Button>
      {unsaved && (
        <span data-testid="settings-unsaved" className="text-sm text-muted-foreground">
          {t("unsaved")}
        </span>
      )}
      {savedNow && !unsaved && (
        <span role="status" data-testid="settings-saved" className="text-sm text-ok-fg">
          {t("saved")}
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Write the Publishing schedule page**

Create `src/components/settings/schedule-form.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { loadPublishingAction, savePublishingAction } from "@/app/[locale]/(app)/settings/actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEngineAction } from "@/lib/actions/use-engine-action";
import type { PublishingSettings } from "@/lib/engine/schemas";
import { settingsFieldErrors } from "@/lib/settings/field-errors";
import { toPublishingUpdate, toScheduleForm, WEEK, withDay, type ScheduleForm } from "@/lib/settings/schedule-form";
import { FieldMessage, OtherFieldErrors, SaveBar, SaveFailure } from "./form-parts";
import { SettingsConflict } from "./settings-conflict";
import { useSettingsDraft } from "./use-settings-draft";

const FIELDS = ["autoPublish", "perDay", "days", "from", "to", "gapMinutes"] as const;

/** Spec v1.1 §6 Publishing: on or off, posts a day, days, from and until, and the gap. The engine works out the slots. */
export function ScheduleSettingsForm({ locale, settings }: { locale: string; settings: PublishingSettings }) {
  const t = useTranslations("Settings.schedule");
  const save = useEngineAction(savePublishingAction);
  const draft = useSettingsDraft({
    saved: settings,
    toForm: toScheduleForm,
    save: async (form, version) => {
      const update = toPublishingUpdate(form, version);
      if (!update.ok) {
        const fields = Object.fromEntries(update.invalid.map((key) => [key, t("wholeNumber")]));
        return { ok: false as const, error: { status: 400, code: "invalid_input", message: t("wholeNumber"), fields } };
      }
      return save.run({ locale, update: update.update });
    },
    load: () => loadPublishingAction({ locale }),
  });
  const form = draft.form;
  const conflict = draft.conflict;
  const errors = settingsFieldErrors(draft.error, FIELDS);
  const set = <K extends keyof ScheduleForm>(key: K, value: ScheduleForm[K]) => draft.update((current) => ({ ...current, [key]: value }));
  const dayNames = (days: string[]) => days.map((day) => (t.has(`dayNames.${day}`) ? t(`dayNames.${day}`) : day));

  const numberField = (key: "perDay" | "gapMinutes", testId: string, min: number) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={testId}>{t(key)}</Label>
      <Input id={testId} data-testid={testId} type="number" inputMode="numeric" min={min} step={1} dir="ltr" value={form[key]} onChange={(event) => set(key, event.target.value)} />
      <FieldMessage field={key} message={errors.byField[key]} />
    </div>
  );
  const timeField = (key: "from" | "to", testId: string) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={testId}>{t(key)}</Label>
      <Input id={testId} data-testid={testId} type="time" dir="ltr" value={form[key]} onChange={(event) => set(key, event.target.value)} />
      <FieldMessage field={key} message={errors.byField[key]} />
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("hint")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {conflict && (
          <SettingsConflict
            rows={conflict.keys.map((key) => ({
              key,
              label: t(key),
              theirs: key === "days" ? dayNames(conflict.theirs.days) : conflict.theirs[key],
              mine: key === "days" ? dayNames(form.days) : form[key],
            }))}
            pending={draft.pending}
            onLoadTheirs={draft.loadTheirs}
            onKeepMine={() => void draft.keepMine()}
          />
        )}
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-primary"
            data-testid="schedule-auto-publish"
            checked={form.autoPublish}
            onChange={(event) => set("autoPublish", event.target.checked)}
          />
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">{t("autoPublish")}</span>
            <span className="text-xs text-muted-foreground">{t("autoPublishHint")}</span>
          </span>
        </label>
        <FieldMessage field="autoPublish" message={errors.byField.autoPublish} />
        <div className="grid gap-4 sm:grid-cols-2">
          {numberField("perDay", "schedule-per-day", 1)}
          {numberField("gapMinutes", "schedule-gap", 0)}
          {timeField("from", "schedule-from")}
          {timeField("to", "schedule-to")}
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">{t("days")}</legend>
          <div className="flex flex-wrap gap-4">
            {WEEK.map((day) => (
              <label key={day} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  data-testid={`schedule-day-${day}`}
                  checked={form.days.includes(day)}
                  onChange={(event) => {
                    const on = event.target.checked;
                    draft.update((current) => withDay(current, day, on));
                  }}
                />
                <span data-testid={`schedule-day-label-${day}`}>{t(`dayNames.${day}`)}</span>
              </label>
            ))}
          </div>
          <FieldMessage field="days" message={errors.byField.days} />
        </fieldset>
        <OtherFieldErrors items={errors.other} />
        <SaveFailure error={draft.error} />
        <SaveBar
          onSave={() => void draft.save()}
          pending={draft.pending}
          disabled={draft.unsaved.length === 0}
          unsaved={draft.unsaved.length > 0}
          savedNow={draft.savedNow}
        />
      </CardContent>
    </Card>
  );
}
```

Create `src/components/settings/schedule-view.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import { EngineNotice } from "@/components/dashboard/engine-notice";
import type { AppLocale } from "@/i18n/locales";
import { requirePermission } from "@/lib/auth/session";
import { nextSlotView } from "@/lib/dashboard/next-slot";
import { getEngine } from "@/lib/engine";
import { tryEngine } from "@/lib/engine/result";
import { formatDateTime } from "@/lib/format/datetime";
import { ScheduleSettingsForm } from "./schedule-form";

/** The schedule form, with the next slot as the engine reports it (spec v1.1 §4: never worked out in the browser). */
export async function ScheduleView({ locale }: { locale: AppLocale }) {
  await requirePermission(locale, "settings.manage");
  const t = await getTranslations("Settings.schedule");
  const tSlot = await getTranslations("Dashboard.nextSlot");
  const engine = await getEngine();
  const [settings, scheduled, site] = await Promise.all([
    tryEngine(() => engine.publishingSettings()),
    tryEngine(() => engine.scheduled({ pageSize: 1 })),
    tryEngine(() => engine.siteTimezone()),
  ]);
  if (!settings.ok) return <EngineNotice error={settings.error} />;

  let nextSlot: string | null = null;
  if (scheduled.ok && site.ok) {
    const view = nextSlotView(scheduled.data);
    nextSlot =
      view.kind === "slot"
        ? t("nextSlot", { time: formatDateTime(view.at, { timeZone: site.data.timezone, locale }) })
        : view.kind === "off"
          ? tSlot("off")
          : tSlot("waiting", { reason: tSlot.has(`reasons.${view.reason}`) ? tSlot(`reasons.${view.reason}`) : view.reason });
  }

  return (
    <div className="flex flex-col gap-4">
      {nextSlot && (
        <p role="status" data-testid="schedule-next-slot" className="rounded-md bg-muted px-3 py-2 text-sm">
          {nextSlot}
        </p>
      )}
      <ScheduleSettingsForm locale={locale} settings={settings.data} />
    </div>
  );
}
```

Create `src/app/[locale]/(app)/settings/schedule/page.tsx`:

```tsx
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SectionSkeleton } from "@/components/dashboard/section-skeleton";
import { ScheduleView } from "@/components/settings/schedule-view";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { asAppLocale } from "@/i18n/locales";

export default async function ScheduleSettingsPage({ params }: PageProps<"/[locale]/settings/schedule">) {
  const locale = asAppLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("Settings");
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl">{t("title")}</h1>
      <SettingsTabs current="schedule" />
      <Suspense fallback={<SectionSkeleton />}>
        <ScheduleView locale={locale} />
      </Suspense>
    </div>
  );
}
```

- [ ] **Step 9: Run the e2e tests**

Run: `pnpm e2e tests/e2e/settings-schedule.spec.ts tests/e2e/shell.spec.ts tests/e2e/auth.spec.ts`
Expected: PASS. All 6 schedule tests pass, and the shell and auth tests still do.

- [ ] **Step 10: Lint, typecheck and the whole unit suite**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: lint and typecheck exit 0; every unit test passes, including `messages.test.ts` (same keys in both languages).

- [ ] **Step 11: Commit**

```bash
git add src/components/shell src/components/settings src/lib/settings/schedule-form.ts "src/app/[locale]/(app)/settings/schedule" messages tests/unit/nav.test.ts tests/unit/schedule-form.test.ts tests/e2e/settings-schedule.spec.ts
git commit -m "feat: settings menu and tabs, shared versioned settings forms, and the Publishing schedule page"
```

---

### Task 6: The SEO profile page

**Files:**
- Create:
  - lib: `src/lib/settings/seo-form.ts`
  - components: `src/components/settings/seo-view.tsx`, `src/components/settings/seo-settings-form.tsx`, `src/components/settings/share-picture.tsx`
  - page: `src/app/[locale]/(app)/settings/seo/page.tsx`
- Modify: `messages/en.json`, `messages/ar.json`
- Test: `tests/unit/seo-form.test.ts`, `tests/e2e/settings-seo.spec.ts` (create)

**Interfaces:**
- Consumes:
  - Task 4 SEO actions
  - Task 5 `useSettingsDraft`, `SettingsConflict`, `form-parts`, `SettingsTabs`
  - M3a `JobTracker` and `parsePhrases`
  - M2b `useEngineUpload`
- Produces:
  - **`seo-form.ts`:** `type SeoForm` (all text), `SEO_LISTS`, `toSeoForm`, `toSeoUpdate`, `readProposal`, `withProposal`
  - **Test ids:**
    - Fields: `seo-{field}` for every field, `seo-defaultLang` (select).
    - AI proposals: `seo-propose`, `seo-propose-job`, `seo-proposed`, `seo-proposal-unreadable`.
    - Share picture: `seo-picture-upload` (file input), `seo-picture-upload-button`, `seo-picture-preview`, `seo-picture-none`, `seo-picture-remove`, `seo-picture-error`.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/seo-form.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { seedSeo } from "@/lib/engine/mock/settings-fixtures";
import { readProposal, toSeoForm, toSeoUpdate, withProposal } from "@/lib/settings/seo-form";

describe("the SEO form (spec v1.1 §4 SeoSettings)", () => {
  it("turns the profile into a form and back, leaving out the uploaded picture", () => {
    const seed = seedSeo();
    const { ogImageUploaded, ...rest } = seed;
    expect(ogImageUploaded).toBeNull();
    expect(toSeoUpdate(toSeoForm(seed), seed.version)).toEqual(rest);
  });

  it("lists take commas, Arabic commas or new lines; empty text is sent as null", () => {
    const form = { ...toSeoForm(seedSeo()), focusKeywords: "استشارات قانونية دبي، uae labour law\ncontract review uae", tone: "   " };
    expect(toSeoUpdate(form, 3)).toMatchObject({ focusKeywords: ["استشارات قانونية دبي", "uae labour law", "contract review uae"], tone: null });
  });

  it("an AI proposal fills focus keywords and the call to action; a result it can't read changes nothing", () => {
    const form = toSeoForm(seedSeo());
    const proposal = readProposal({ focusKeywords: ["legal consultancy dubai", "uae labour law advice"], cta: "Book a consultation with Fakher & Co" });
    expect(proposal && withProposal(form, proposal)).toMatchObject({ focusKeywords: "legal consultancy dubai, uae labour law advice", cta: "Book a consultation with Fakher & Co" });
    expect([readProposal({ nothing: true }), readProposal("text"), readProposal({ cta: 5 })]).toEqual([null, null, null]);
  });
});
```

Create `tests/e2e/settings-seo.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { isolateMockStore, pageInSharedStore, signInWithCookie } from "./helpers";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

test.beforeEach(async ({ context }) => {
  await isolateMockStore(context);
  await signInWithCookie(context, "dev_admin");
});

test("edits and saves the profile; lists take commas, Arabic commas or new lines", async ({ page }) => {
  await page.goto("/en/settings/seo");
  await expect(page.getByTestId("seo-siteName")).toHaveValue("Fakher & Co");
  await page.getByTestId("seo-focusKeywords").fill("legal consultancy dubai، uae labour law\ncontract review uae");
  await page.getByTestId("seo-cta").fill("Talk to our consultants");
  await page.getByTestId("settings-save").click();
  await expect(page.getByTestId("settings-saved")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("seo-focusKeywords")).toHaveValue("legal consultancy dubai, uae labour law, contract review uae");
  await expect(page.getByTestId("seo-cta")).toHaveValue("Talk to our consultants");
});

test("an address the engine refuses shows its message next to the field", async ({ page }) => {
  await page.goto("/en/settings/seo");
  await page.getByTestId("seo-siteUrl").fill("fakhernco");
  await page.getByTestId("settings-save").click();
  await expect(page.getByTestId("field-error-siteUrl")).toHaveText("Enter a full address, like https://example.com.");
});

test("AI suggestions fill focus keywords and the call to action, unsaved until Save", async ({ page }) => {
  await page.goto("/en/settings/seo");
  await page.getByTestId("seo-propose").click();
  await expect(page.getByTestId("seo-proposed")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("seo-focusKeywords")).toHaveValue(/uae labour law advice/);
  await expect(page.getByTestId("seo-cta")).toHaveValue("Book a consultation with Fakher & Co");
  await expect(page.getByTestId("settings-unsaved")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("seo-cta")).toHaveValue("Book a consultation");
});

test("uploads and removes the share picture; a file of the wrong type shows the engine's message", async ({ page }) => {
  await page.goto("/en/settings/seo");
  await expect(page.getByTestId("seo-picture-none")).toBeVisible();
  await page.getByTestId("seo-picture-upload").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  await expect(page.getByTestId("seo-picture-error")).toContainText("Only JPEG, PNG or WebP pictures can be uploaded.");
  await page.getByTestId("seo-picture-upload").setInputFiles({ name: "share.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByTestId("seo-picture-preview")).toBeVisible();
  await page.getByTestId("seo-picture-remove").click();
  await expect(page.getByTestId("seo-picture-preview")).toHaveCount(0);
});

test("someone saved first: both values show, and Keep my changes keeps both people's edits (Review Focus 4)", async ({ browser }) => {
  const store = `seo${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const first = await pageInSharedStore(browser, store, "dev_admin");
  const second = await pageInSharedStore(browser, store, "dev_admin");
  await first.goto("/en/settings/seo");
  await second.goto("/en/settings/seo");
  await first.getByTestId("seo-cta").fill("Call Fakher & Co");
  await first.getByTestId("settings-save").click();
  await expect(first.getByTestId("settings-saved")).toBeVisible();
  await second.getByTestId("seo-tone").fill("warm and plain");
  await second.getByTestId("settings-save").click();
  await expect(second.getByTestId("settings-conflict")).toBeVisible();
  await expect(second.getByTestId("settings-conflict-cta")).toContainText("Call Fakher & Co");
  await expect(second.getByTestId("settings-conflict-tone")).toContainText("warm and plain");
  await second.getByTestId("settings-conflict-keep-mine").click();
  await expect(second.getByTestId("settings-saved")).toBeVisible();
  await first.reload();
  await expect(first.getByTestId("seo-cta")).toHaveValue("Call Fakher & Co");
  await expect(first.getByTestId("seo-tone")).toHaveValue("warm and plain");
});
```

- [ ] **Step 2: Run the unit test to make sure it fails**

Run: `pnpm test tests/unit/seo-form.test.ts`
Expected: FAIL to resolve `@/lib/settings/seo-form`.

- [ ] **Step 3: Write the SEO form module**

Create `src/lib/settings/seo-form.ts`:

```ts
import { z } from "zod";
import type { SeoSettings, SeoUpdate } from "@/lib/engine/schemas";
import { parsePhrases } from "@/lib/keywords/phrases";

/** The SEO form: every field as text; the three lists are separated by commas (the Arabic one too) or new lines. */
export type SeoForm = {
  siteName: string;
  siteUrl: string;
  blogPath: string;
  defaultLang: string;
  author: string;
  focusKeywords: string;
  locations: string;
  cta: string;
  tone: string;
  audience: string;
  avoid: string;
  linkedin: string;
  instagram: string;
  ogImage: string;
};

export const SEO_LISTS = ["focusKeywords", "locations", "avoid"] as const;

export function toSeoForm(settings: SeoSettings): SeoForm {
  return {
    siteName: settings.siteName,
    siteUrl: settings.siteUrl,
    blogPath: settings.blogPath ?? "",
    defaultLang: settings.defaultLang,
    author: settings.author ?? "",
    focusKeywords: settings.focusKeywords.join(", "),
    locations: settings.locations.join(", "),
    cta: settings.cta ?? "",
    tone: settings.tone ?? "",
    audience: settings.audience ?? "",
    avoid: settings.avoid.join(", "),
    linkedin: settings.linkedin ?? "",
    instagram: settings.instagram ?? "",
    ogImage: settings.ogImage ?? "",
  };
}

const orNull = (text: string) => text.trim() || null;

/** PUT …/settings/seo: empty text is sent as null; lists are split, tidied and de-duplicated. */
export function toSeoUpdate(form: SeoForm, version: number): SeoUpdate {
  return {
    siteName: form.siteName.trim(),
    siteUrl: form.siteUrl.trim(),
    blogPath: orNull(form.blogPath),
    defaultLang: form.defaultLang,
    focusKeywords: parsePhrases(form.focusKeywords),
    locations: parsePhrases(form.locations),
    author: orNull(form.author),
    linkedin: orNull(form.linkedin),
    instagram: orNull(form.instagram),
    ogImage: orNull(form.ogImage),
    cta: orNull(form.cta),
    tone: orNull(form.tone),
    audience: orNull(form.audience),
    avoid: parsePhrases(form.avoid),
    version,
  };
}

const ProposalSchema = z.object({ focusKeywords: z.array(z.string()).optional(), cta: z.string().optional() });
export type SeoProposal = z.infer<typeof ProposalSchema>;

/** The proposal job's result (spec v1.1 §7: proposed values, not saved), or null when it's in a shape the portal can't read. */
export function readProposal(result: unknown): SeoProposal | null {
  const parsed = ProposalSchema.safeParse(result);
  return parsed.success && (parsed.data.focusKeywords !== undefined || parsed.data.cta !== undefined) ? parsed.data : null;
}

/** The proposal fills the form; nothing is saved until the Admin presses Save. */
export function withProposal(form: SeoForm, proposal: SeoProposal): SeoForm {
  return {
    ...form,
    ...(proposal.focusKeywords ? { focusKeywords: proposal.focusKeywords.join(", ") } : {}),
    ...(proposal.cta ? { cta: proposal.cta } : {}),
  };
}
```

- [ ] **Step 4: Run the unit test to make sure it passes**

Run: `pnpm test tests/unit/seo-form.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Add the messages**

Merge into `messages/en.json` at `Settings`:

```json
{
  "seo": {
    "title": "SEO profile",
    "hint": "How the site presents itself, and the profile the AI writes from.",
    "groups": { "site": "Site", "profile": "AI profile", "links": "Links and sharing" },
    "profileHint": "The AI follows this profile whenever it writes for the site.",
    "fields": {
      "siteName": "Site name",
      "siteUrl": "Site address",
      "blogPath": "Articles path",
      "defaultLang": "Default language",
      "author": "Author",
      "focusKeywords": "Focus keywords",
      "locations": "Locations",
      "cta": "Call to action",
      "tone": "Tone",
      "audience": "Audience",
      "avoid": "Avoid",
      "linkedin": "LinkedIn page",
      "instagram": "Instagram page",
      "ogImage": "Share image address"
    },
    "listHint": "Separate with commas or new lines.",
    "propose": "Suggest focus keywords and a call to action",
    "proposing": "Suggesting…",
    "proposed": "Suggestions filled in. Check them, then save.",
    "proposalUnreadable": "The suggestions came back in a form the portal can't read. Nothing was changed.",
    "picture": {
      "title": "Share picture",
      "hint": "Shown when an article is shared without its own photo. {types}, up to {size} MB.",
      "preview": "Share picture",
      "none": "No picture uploaded yet.",
      "upload": "Upload a picture",
      "remove": "Remove",
      "tooLarge": "This file is {size} MB; the limit is {limit} MB."
    }
  }
}
```

Merge into `messages/ar.json` at `Settings`:

```json
{
  "seo": {
    "title": "ملف تحسين محركات البحث",
    "hint": "كيف يقدّم الموقع نفسه، والملف الذي يكتب الذكاء الاصطناعي بناءً عليه.",
    "groups": { "site": "الموقع", "profile": "ملف الذكاء الاصطناعي", "links": "الروابط والمشاركة" },
    "profileHint": "يتبع الذكاء الاصطناعي هذا الملف كلما كتب للموقع.",
    "fields": {
      "siteName": "اسم الموقع",
      "siteUrl": "عنوان الموقع",
      "blogPath": "مسار المقالات",
      "defaultLang": "اللغة الافتراضية",
      "author": "الكاتب",
      "focusKeywords": "الكلمات المفتاحية الأساسية",
      "locations": "المناطق",
      "cta": "الدعوة إلى الإجراء",
      "tone": "الأسلوب",
      "audience": "الجمهور",
      "avoid": "ما يجب تجنّبه",
      "linkedin": "صفحة لينكدإن",
      "instagram": "صفحة إنستغرام",
      "ogImage": "عنوان صورة المشاركة"
    },
    "listHint": "افصل بينها بفواصل أو بأسطر جديدة.",
    "propose": "اقترح كلمات مفتاحية أساسية ودعوة إلى الإجراء",
    "proposing": "جارٍ الاقتراح…",
    "proposed": "أُضيفت الاقتراحات. راجعها ثم احفظ.",
    "proposalUnreadable": "وصلت الاقتراحات بصيغة لا تستطيع البوابة قراءتها. لم يتغيّر شيء.",
    "picture": {
      "title": "صورة المشاركة",
      "hint": "تظهر عند مشاركة مقال ليست له صورة خاصة. {types}، بحد أقصى {size} ميغابايت.",
      "preview": "صورة المشاركة",
      "none": "لم تُرفع صورة بعد.",
      "upload": "رفع صورة",
      "remove": "إزالة",
      "tooLarge": "حجم هذا الملف {size} ميغابايت، والحد الأقصى {limit} ميغابايت."
    }
  }
}
```

- [ ] **Step 6: Write the SEO page**

Create `src/components/settings/seo-settings-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { loadSeoAction, proposeSeoAction, saveSeoAction } from "@/app/[locale]/(app)/settings/actions";
import { ActionError } from "@/components/actions/action-error";
import { JobTracker } from "@/components/jobs/job-tracker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useEngineAction } from "@/lib/actions/use-engine-action";
import type { EngineFailure } from "@/lib/engine/result";
import type { SeoSettings } from "@/lib/engine/schemas";
import { settingsFieldErrors } from "@/lib/settings/field-errors";
import { readProposal, SEO_LISTS, toSeoForm, toSeoUpdate, withProposal, type SeoForm } from "@/lib/settings/seo-form";
import { FieldMessage, OtherFieldErrors, SaveBar, SaveFailure } from "./form-parts";
import { SettingsConflict } from "./settings-conflict";
import { useSettingsDraft } from "./use-settings-draft";

const SELECT = "h-9 rounded-md border border-input bg-card px-3 text-sm";
const GROUPS = [
  { key: "site", fields: ["siteName", "siteUrl", "blogPath", "defaultLang", "author"] },
  { key: "profile", fields: ["focusKeywords", "locations", "cta", "tone", "audience", "avoid"] },
  { key: "links", fields: ["linkedin", "instagram", "ogImage"] },
] as const satisfies readonly { key: string; fields: readonly (keyof SeoForm)[] }[];
const FIELDS: readonly string[] = GROUPS.flatMap((group) => group.fields);
const LISTS = new Set<keyof SeoForm>(SEO_LISTS);
const ADDRESSES = new Set<keyof SeoForm>(["siteUrl", "linkedin", "instagram", "ogImage"]);

type Props = { locale: string; settings: SeoSettings; languages: string[]; pollSeconds: number };

/** Spec v1.1 §6 SEO: the site's profile, which the AI writes from, with AI suggestions for focus keywords and the call to action. */
export function SeoSettingsForm({ locale, settings, languages, pollSeconds }: Props) {
  const t = useTranslations("Settings.seo");
  const tReview = useTranslations("Review");
  const save = useEngineAction(saveSeoAction);
  const propose = useEngineAction(proposeSeoAction);
  const [proposalJob, setProposalJob] = useState<string | null>(null);
  const [proposal, setProposal] = useState<"filled" | "unreadable" | null>(null);
  const [proposeError, setProposeError] = useState<EngineFailure | null>(null);
  const draft = useSettingsDraft({
    saved: settings,
    toForm: toSeoForm,
    save: (form, version) => save.run({ locale, update: toSeoUpdate(form, version) }),
    load: () => loadSeoAction({ locale }),
  });
  const form = draft.form;
  const conflict = draft.conflict;
  const errors = settingsFieldErrors(draft.error, FIELDS);
  const set = (key: keyof SeoForm, value: string) => draft.update((current) => ({ ...current, [key]: value }));

  async function startProposal() {
    setProposal(null);
    setProposeError(null);
    const result = await propose.run({ locale });
    if (result.ok) setProposalJob(result.data.jobId);
    else setProposeError(result.error);
  }

  function proposalDone(result: unknown) {
    const read = readProposal(result);
    setProposal(read ? "filled" : "unreadable");
    if (read) draft.update((current) => withProposal(current, read));
  }

  function field(key: keyof SeoForm) {
    const id = `seo-${key}`;
    return (
      <div key={key} className="flex flex-col gap-1.5">
        <Label htmlFor={id}>{t(`fields.${key}`)}</Label>
        {key === "defaultLang" ? (
          <select id={id} data-testid={id} className={SELECT} value={form.defaultLang} onChange={(event) => set("defaultLang", event.target.value)}>
            {languages.map((code) => (
              <option key={code} value={code}>
                {tReview.has(`languages.${code}`) ? tReview(`languages.${code}`) : code}
              </option>
            ))}
          </select>
        ) : LISTS.has(key) ? (
          <Textarea id={id} data-testid={id} dir="auto" rows={2} value={form[key]} onChange={(event) => set(key, event.target.value)} />
        ) : (
          <Input
            id={id}
            data-testid={id}
            type={ADDRESSES.has(key) ? "url" : "text"}
            dir={ADDRESSES.has(key) ? "ltr" : "auto"}
            value={form[key]}
            onChange={(event) => set(key, event.target.value)}
          />
        )}
        {LISTS.has(key) && <p className="text-xs text-muted-foreground">{t("listHint")}</p>}
        <FieldMessage field={key} message={errors.byField[key]} />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("hint")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {conflict && (
          <SettingsConflict
            rows={conflict.keys.map((key) => ({ key, label: t(`fields.${key}`), theirs: conflict.theirs[key], mine: form[key] }))}
            pending={draft.pending}
            onLoadTheirs={draft.loadTheirs}
            onKeepMine={() => void draft.keepMine()}
          />
        )}
        {GROUPS.map((group) => (
          <fieldset key={group.key} className="flex flex-col gap-3">
            <legend className="mb-1 text-sm font-medium">{t(`groups.${group.key}`)}</legend>
            {group.key === "profile" && <p className="text-xs text-muted-foreground">{t("profileHint")}</p>}
            <div className="grid gap-4 sm:grid-cols-2">{group.fields.map((key) => field(key))}</div>
            {group.key === "profile" && (
              <div className="flex flex-col gap-2">
                <div>
                  <Button type="button" variant="outline" size="sm" data-testid="seo-propose" disabled={propose.pending} onClick={() => void startProposal()}>
                    {t("propose")}
                  </Button>
                </div>
                {proposalJob && (
                  <JobTracker key={proposalJob} jobId={proposalJob} pollSeconds={pollSeconds} label={t("proposing")} testId="seo-propose-job" onDone={proposalDone} />
                )}
                {proposal === "filled" && (
                  <p role="status" data-testid="seo-proposed" className="text-sm text-ok-fg">
                    {t("proposed")}
                  </p>
                )}
                {proposal === "unreadable" && (
                  <p role="alert" data-testid="seo-proposal-unreadable" className="text-sm text-bad-fg">
                    {t("proposalUnreadable")}
                  </p>
                )}
                {proposeError && <ActionError error={proposeError} />}
              </div>
            )}
          </fieldset>
        ))}
        <OtherFieldErrors items={errors.other} />
        <SaveFailure error={draft.error} />
        <SaveBar
          onSave={() => void draft.save()}
          pending={draft.pending}
          disabled={draft.unsaved.length === 0}
          unsaved={draft.unsaved.length > 0}
          savedNow={draft.savedNow}
        />
      </CardContent>
    </Card>
  );
}
```

Create `src/components/settings/share-picture.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { removeSeoPictureAction, uploadSeoPictureAction } from "@/app/[locale]/(app)/settings/actions";
import { ActionError } from "@/components/actions/action-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useEngineAction, useEngineUpload } from "@/lib/actions/use-engine-action";
import type { EngineFailure } from "@/lib/engine/result";

type Props = { locale: string; picture: string | null; photoTypes: string[]; photoMaxBytes: number };

const megabytes = (bytes: number) => String(Math.round((bytes / 1_048_576) * 10) / 10);

/** Spec v1.1 §6 SEO "share image upload" (POST/DELETE …/settings/seo/picture). The engine checks the type; the size is checked here first. */
export function SharePicture({ locale, picture, photoTypes, photoMaxBytes }: Props) {
  const t = useTranslations("Settings.seo.picture");
  const upload = useEngineUpload(uploadSeoPictureAction);
  const remove = useEngineAction(removeSeoPictureAction);
  const [failure, setFailure] = useState<EngineFailure | null>(null);
  const [tooLarge, setTooLarge] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const busy = upload.pending || remove.pending;
  const types = photoTypes.map((type) => type.replace("image/", "").toUpperCase()).join(", ");

  async function send(file: File) {
    setFailure(null);
    setTooLarge(null);
    if (file.size > photoMaxBytes) {
      setTooLarge(t("tooLarge", { size: megabytes(file.size), limit: megabytes(photoMaxBytes) }));
    } else {
      const result = await upload.run({ locale }, file);
      if (!result.ok) setFailure(result.error);
    }
    if (input.current) input.current.value = "";
  }

  async function removePicture() {
    setFailure(null);
    const result = await remove.run({ locale });
    if (!result.ok) setFailure(result.error);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("hint", { types, size: megabytes(photoMaxBytes) })}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {picture ? (
          // eslint-disable-next-line @next/next/no-img-element -- the engine's media URL (a data: URL in the mock)
          <img src={picture} alt={t("preview")} data-testid="seo-picture-preview" className="max-h-40 w-auto self-start rounded-md border border-border" />
        ) : (
          <p data-testid="seo-picture-none" className="text-sm text-muted-foreground">
            {t("none")}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={busy} data-testid="seo-picture-upload-button" onClick={() => input.current?.click()}>
            {t("upload")}
          </Button>
          {picture && (
            <Button type="button" variant="outline" size="sm" disabled={busy} data-testid="seo-picture-remove" onClick={() => void removePicture()}>
              {t("remove")}
            </Button>
          )}
        </div>
        <input
          ref={input}
          type="file"
          className="sr-only"
          accept={photoTypes.join(",")}
          aria-label={t("upload")}
          data-testid="seo-picture-upload"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void send(file);
          }}
        />
        {(failure || tooLarge) && (
          <div data-testid="seo-picture-error">
            {tooLarge && <p className="rounded-md bg-bad-bg px-3 py-2 text-sm text-bad-fg">{tooLarge}</p>}
            {failure && <ActionError error={failure} />}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

Create `src/components/settings/seo-view.tsx`:

```tsx
import { EngineNotice } from "@/components/dashboard/engine-notice";
import type { AppLocale } from "@/i18n/locales";
import { requirePermission } from "@/lib/auth/session";
import { getEngine } from "@/lib/engine";
import { tryEngine } from "@/lib/engine/result";
import { SeoSettingsForm } from "./seo-settings-form";
import { SharePicture } from "./share-picture";

export async function SeoView({ locale }: { locale: AppLocale }) {
  await requirePermission(locale, "settings.manage");
  const engine = await getEngine();
  const [seo, meta] = await Promise.all([tryEngine(() => engine.seoSettings()), tryEngine(() => engine.meta())]);
  if (!seo.ok) return <EngineNotice error={seo.error} />;
  if (!meta.ok) return <EngineNotice error={meta.error} />;
  return (
    <div className="flex flex-col gap-6">
      <SeoSettingsForm locale={locale} settings={seo.data} languages={meta.data.languages} pollSeconds={meta.data.pollSeconds} />
      <SharePicture
        locale={locale}
        picture={seo.data.ogImageUploaded?.url ?? null}
        photoTypes={meta.data.limits.photoTypes}
        photoMaxBytes={meta.data.limits.photoMaxBytes}
      />
    </div>
  );
}
```

Create `src/app/[locale]/(app)/settings/seo/page.tsx`:

```tsx
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SectionSkeleton } from "@/components/dashboard/section-skeleton";
import { SeoView } from "@/components/settings/seo-view";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { asAppLocale } from "@/i18n/locales";

export default async function SeoSettingsPage({ params }: PageProps<"/[locale]/settings/seo">) {
  const locale = asAppLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("Settings");
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl">{t("title")}</h1>
      <SettingsTabs current="seo" />
      <Suspense fallback={<SectionSkeleton />}>
        <SeoView locale={locale} />
      </Suspense>
    </div>
  );
}
```

- [ ] **Step 7: Run the e2e tests**

Run: `pnpm e2e tests/e2e/settings-seo.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 8: Lint, typecheck and the whole unit suite**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: lint and typecheck exit 0; every unit test passes.

- [ ] **Step 9: Commit**

```bash
git add src/lib/settings/seo-form.ts src/components/settings "src/app/[locale]/(app)/settings/seo" messages tests/unit/seo-form.test.ts tests/e2e/settings-seo.spec.ts
git commit -m "feat: the SEO profile page with AI suggestions, the share picture, field errors and conflicts"
```

---

### Task 7: The Website connection page

**Files:**
- Create:
  - lib: `src/lib/settings/website-form.ts`
  - components: `src/components/settings/website-view.tsx`, `src/components/settings/website-settings-form.tsx`, `src/components/settings/map-editor.tsx`
  - page: `src/app/[locale]/(app)/settings/website/page.tsx`
- Modify: `messages/en.json`, `messages/ar.json`
- Test: `tests/unit/website-form.test.ts`, `tests/e2e/settings-website.spec.ts` (create)

**Interfaces:**
- Consumes: Task 1 `PublishTarget`, `TargetType`, `TargetField`, `WebsiteTest`, `WebsiteTargetInput`, `WebsiteUpdate`; Task 4 website actions; Task 5 `useSettingsDraft`, `SettingsConflict`, `form-parts`, `SettingsTabs`
- Produces:
  - **`website-form.ts`:**
    - `type WebsiteForm = { type; settings; secret; fieldMap; bodyFormat; blockMap; arabicMode }`
    - helpers: `typeOf`, `textOf`
    - building the form: `toWebsiteForm(target, types)`, `switchType(form, type, types)`
    - test rules: `connectionFingerprint(form, types)`, `needsTest(form, saved, types)`, `missingRequired(form, saved, types)`
    - maps: `prefillMap(current, suggested, choices)`, `mapKeys(current, suggested)`
    - requests: `toWebsiteTarget(form, types)`, `toWebsiteUpdate(form, types, version)`
  - **After the first save of a first-run connection, the form goes on to `/settings/social`** (spec v1.1 §6). Task 9's e2e pins it.
  - **Test ids:**
    - Connection fields: `website-type`, `website-field-{key}` (the secret field too), `website-secret-kept`.
    - Testing: `website-test`, `website-test-result` (with `data-ok`), `website-needs-test`.
    - Format: `website-body-format`, `website-arabic-mode`.
    - Maps: `field-map-{key}`, `block-map-{key}`.
    - Status: `website-status` (with `data-status`), `website-last-checked`.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/website-form.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mockMeta } from "@/lib/engine/mock/fixtures";
import type { PublishTarget } from "@/lib/engine/schemas";
import {
  connectionFingerprint,
  mapKeys,
  missingRequired,
  needsTest,
  prefillMap,
  switchType,
  toWebsiteForm,
  toWebsiteTarget,
  toWebsiteUpdate,
} from "@/lib/settings/website-form";

const TYPES = mockMeta().targetTypes;
const SAVED: PublishTarget = {
  type: "wordpress",
  settings: { url: "https://fakhernco.com", username: "articles-ai", postType: "post", ctaText: "Book a consultation" },
  secretSet: true,
  fieldMap: { title: "title", subtitle: "excerpt" },
  body: { format: "html", blockMap: null },
  arabic: { mode: "translatepress" },
  languages: ["en", "ar"],
  status: "ok",
  lastCheckedAt: "2026-10-21T09:00:00+04:00",
  lastError: null,
  version: 1,
};

describe("the website form (spec v1.1 §4 PublishTarget, §6, §10)", () => {
  it("starts from the saved connection with an empty secret, and sends back settings it doesn't show (Review Focus 3)", () => {
    const form = toWebsiteForm(SAVED, TYPES);
    expect(form).toMatchObject({ type: "wordpress", secret: "", bodyFormat: "html", arabicMode: "translatepress" });
    expect(toWebsiteTarget(form, TYPES)).toEqual({
      type: "wordpress",
      settings: { url: "https://fakhernco.com", username: "articles-ai", postType: "post", ctaText: "Book a consultation" },
      fieldMap: { title: "title", subtitle: "excerpt" },
      body: { format: "html" },
      arabic: { mode: "translatepress" },
    });
    expect(toWebsiteUpdate({ ...form, secret: "new-password" }, TYPES, 1)).toMatchObject({ secret: "new-password", version: 1 });
  });

  it("a first connection starts on the first type /meta lists", () => {
    const missing = { ...SAVED, type: null, settings: {}, secretSet: false, fieldMap: {}, body: null, arabic: null, status: "missing", version: 0 };
    expect(toWebsiteForm(missing, TYPES)).toEqual({
      type: "wordpress",
      settings: {},
      secret: "",
      fieldMap: {},
      bodyFormat: "html",
      blockMap: {},
      arabicMode: "translatepress",
    });
  });

  it("switching type drops the old type's fields and maps, and takes the new type's first format and Arabic mode (Review Focus 2)", () => {
    expect(switchType({ ...toWebsiteForm(SAVED, TYPES), secret: "typed" }, "strapi", TYPES)).toEqual({
      type: "strapi",
      settings: { ctaText: "Book a consultation" },
      secret: "",
      fieldMap: {},
      bodyFormat: "blocks",
      blockMap: {},
      arabicMode: "locale",
    });
  });

  it("needs a test for a changed type, connection field or typed secret, but not for the maps, format or Arabic mode (Review Focus 1)", () => {
    const form = toWebsiteForm(SAVED, TYPES);
    expect(needsTest(form, SAVED, TYPES)).toBe(false);
    expect(needsTest({ ...form, fieldMap: { title: "title" }, bodyFormat: "boldbuilder", arabicMode: "separate" }, SAVED, TYPES)).toBe(false);
    expect(needsTest({ ...form, settings: { ...form.settings, url: "https://www.fakhernco.com" } }, SAVED, TYPES)).toBe(true);
    expect(needsTest({ ...form, secret: "new-password" }, SAVED, TYPES)).toBe(true);
    expect(needsTest(switchType(form, "strapi", TYPES), SAVED, TYPES)).toBe(true);
    expect(needsTest(form, { ...SAVED, status: "missing" }, TYPES)).toBe(true);
  });

  it("a passing test proves only the connection values it tested", () => {
    const form = toWebsiteForm(SAVED, TYPES);
    const tested = connectionFingerprint(form, TYPES);
    expect(connectionFingerprint({ ...form, fieldMap: {}, bodyFormat: "boldbuilder" }, TYPES)).toBe(tested);
    expect(connectionFingerprint({ ...form, settings: { ...form.settings, username: "other" } }, TYPES)).not.toBe(tested);
    expect(connectionFingerprint({ ...form, secret: "x" }, TYPES)).not.toBe(tested);
  });

  it("names the required fields left empty; the stored secret counts only for the same type", () => {
    const form = toWebsiteForm(SAVED, TYPES);
    expect(missingRequired(form, SAVED, TYPES)).toEqual([]);
    expect(missingRequired({ ...form, settings: { ...form.settings, username: " " } }, SAVED, TYPES)).toEqual(["username"]);
    expect(missingRequired(switchType(form, "strapi", TYPES), SAVED, TYPES)).toEqual(["url", "secret", "collection"]);
  });

  it("a test's suggestions fill empty rows and rows the website doesn't have; a valid choice stays", () => {
    const choices = ["title", "post_title", "excerpt", "slug", "tags"];
    expect(prefillMap({ title: "title", subtitle: "summary", slug: "" }, { title: "post_title", subtitle: "excerpt", slug: "slug", keywords: "tags" }, choices)).toEqual({
      title: "title",
      subtitle: "excerpt",
      slug: "slug",
      keywords: "tags",
    });
    expect(mapKeys({ title: "title" }, { slug: "slug", title: "title" })).toEqual(["title", "slug"]);
  });

  it("sends a block map only with the blocks format, without empty rows", () => {
    const strapi = { ...switchType(toWebsiteForm(SAVED, TYPES), "strapi", TYPES), blockMap: { heading: "blocks.heading", quote: "" } };
    expect(toWebsiteTarget(strapi, TYPES).body).toEqual({ format: "blocks", blockMap: { heading: "blocks.heading" } });
  });
});
```

Create `tests/e2e/settings-website.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { isolateMockStore, signInWithCookie } from "./helpers";

test.beforeEach(async ({ context }) => {
  await isolateMockStore(context);
  await signInWithCookie(context, "dev_admin");
});

test("shows the saved WordPress connection drawn from /meta; the password is never shown (Review Focus 3)", async ({ page }) => {
  await page.goto("/en/settings/website");
  await expect(page.getByTestId("website-type")).toHaveValue("wordpress");
  await expect(page.getByTestId("website-field-url")).toHaveValue("https://fakhernco.com");
  await expect(page.getByTestId("website-field-username")).toHaveValue("articles-ai");
  await expect(page.getByTestId("website-field-collection")).toHaveCount(0);
  await expect(page.getByTestId("website-field-secret")).toHaveValue("");
  await expect(page.getByTestId("website-secret-kept")).toBeVisible();
  await expect(page.getByTestId("website-status")).toHaveAttribute("data-status", "ok");
  await expect(page.getByText("Publishing user")).toBeVisible();
  expect(await page.content()).not.toContain("seeded-application-password");
});

test("a wrong application password fails the test with its message, and Save stays blocked (spec v1.1 §10, Review Focus 1)", async ({ page }) => {
  await page.goto("/en/settings/website");
  await page.getByTestId("website-field-secret").fill("wrong-password");
  await expect(page.getByTestId("website-needs-test")).toBeVisible();
  await expect(page.getByTestId("settings-save")).toBeDisabled();
  await page.getByTestId("website-test").click();
  await expect(page.getByTestId("website-test-result")).toHaveAttribute("data-ok", "false");
  await expect(page.getByTestId("website-test-result")).toContainText("401 Unauthorized");
  await expect(page.getByTestId("settings-save")).toBeDisabled();
  await page.getByTestId("website-field-secret").fill("new-application-password");
  await page.getByTestId("website-test").click();
  await expect(page.getByTestId("website-test-result")).toHaveAttribute("data-ok", "true");
  await page.getByTestId("settings-save").click();
  await expect(page.getByTestId("settings-saved")).toBeVisible();
  await expect(page.getByTestId("website-field-secret")).toHaveValue("");
});

test("changing the address after a passing test blocks Save until it's tested again", async ({ page }) => {
  await page.goto("/en/settings/website");
  await page.getByTestId("website-test").click();
  await expect(page.getByTestId("website-test-result")).toHaveAttribute("data-ok", "true");
  await expect(page.getByTestId("field-map-keywords")).toHaveValue("tags");
  await expect(page.getByTestId("settings-save")).toBeEnabled();
  await page.getByTestId("website-field-url").fill("https://www.fakhernco.com");
  await expect(page.getByTestId("settings-save")).toBeDisabled();
  await expect(page.getByTestId("website-needs-test")).toBeVisible();
});

test("a change to the field map saves without a new test", async ({ page }) => {
  await page.goto("/en/settings/website");
  await page.getByTestId("field-map-subtitle").selectOption("");
  await page.getByTestId("settings-save").click();
  await expect(page.getByTestId("settings-saved")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("field-map-title")).toHaveValue("title");
  await expect(page.getByTestId("field-map-subtitle")).toHaveCount(0);
});

test("switching to Strapi shows its own fields, fills both maps from the test, and new articles publish there (Review Focus 2)", async ({ page }) => {
  await page.goto("/en/settings/website");
  await page.getByTestId("website-type").selectOption("strapi");
  await expect(page.getByTestId("website-field-username")).toHaveCount(0);
  await expect(page.getByTestId("website-secret-kept")).toHaveCount(0);
  await expect(page.getByTestId("website-body-format")).toHaveValue("blocks");
  await expect(page.getByTestId("website-arabic-mode")).toHaveValue("locale");
  await page.getByTestId("website-field-url").fill("https://cms.fakhernco.com");
  await page.getByTestId("website-field-collection").fill("posts");
  await page.getByTestId("website-field-secret").fill("strapi-api-token");
  await page.getByTestId("website-test").click();
  await expect(page.getByTestId("website-test-result")).toHaveAttribute("data-ok", "true");
  await expect(page.getByTestId("block-map-heading")).toHaveValue("blocks.heading");
  await expect(page.getByTestId("field-map-metaTitle")).toHaveValue("seo.metaTitle");
  await page.getByTestId("settings-save").click();
  await expect(page.getByTestId("settings-saved")).toBeVisible();
  await page.goto("/en/scheduled");
  await page.getByTestId("publish-p_101").click();
  await page.getByTestId("publish-p_101-confirm").click();
  await expect(page.getByTestId("scheduled-row-p_101")).toHaveCount(0);
  await page.goto("/en/history");
  await expect(page.getByTestId("history-target-p_101")).toHaveText("Strapi");
  await expect(page.getByTestId("history-target-p_301")).toHaveText("WordPress");
});

test("in Arabic, fields the portal knows get Arabic labels", async ({ page }) => {
  await page.goto("/ar/settings/website");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByText("مستخدم النشر")).toBeVisible();
});
```

- [ ] **Step 2: Run the unit test to make sure it fails**

Run: `pnpm test tests/unit/website-form.test.ts`
Expected: FAIL to resolve `@/lib/settings/website-form`.

- [ ] **Step 3: Write the website form module**

Create `src/lib/settings/website-form.ts`:

```ts
import type { PublishTarget, TargetType, WebsiteTargetInput, WebsiteUpdate } from "@/lib/engine/schemas";

/**
 * The website form. Connection settings are kept as the engine saved them, so keys the form doesn't show go back
 * unchanged. The secret is typed here only: an empty secret keeps the stored one (spec v1.1 §7).
 */
export type WebsiteForm = {
  type: string;
  settings: Record<string, unknown>;
  secret: string;
  fieldMap: Record<string, string>;
  bodyFormat: string;
  blockMap: Record<string, string>;
  arabicMode: string;
};

export const typeOf = (types: TargetType[], type: string) => types.find((candidate) => candidate.type === type);

export const textOf = (value: unknown) => (typeof value === "string" ? value : value === null || value === undefined ? "" : String(value));

/** The fields a person types for the connection itself (everything but the secret). */
const connectionKeys = (type: TargetType | undefined) => (type?.fields ?? []).filter((field) => field.kind !== "secret").map((field) => field.key);

export function toWebsiteForm(target: PublishTarget, types: TargetType[]): WebsiteForm {
  const known = target.type && typeOf(types, target.type) ? target.type : null;
  const type = known ?? types[0]?.type ?? "";
  const chosen = typeOf(types, type);
  return {
    type,
    settings: known ? { ...target.settings } : {},
    secret: "",
    fieldMap: known ? { ...target.fieldMap } : {},
    bodyFormat: (known && target.body?.format) || (chosen?.bodyFormats[0] ?? ""),
    blockMap: known ? { ...(target.body?.blockMap ?? {}) } : {},
    arabicMode: (known && target.arabic?.mode) || (chosen?.arabicModes[0] ?? ""),
  };
}

/** Another website type: its fields start empty and so do the maps; format and Arabic mode take its first choice; other settings stay. */
export function switchType(form: WebsiteForm, type: string, types: TargetType[]): WebsiteForm {
  const settings = { ...form.settings };
  for (const field of typeOf(types, form.type)?.fields ?? []) delete settings[field.key];
  const next = typeOf(types, type);
  return { type, settings, secret: "", fieldMap: {}, bodyFormat: next?.bodyFormats[0] ?? "", blockMap: {}, arabicMode: next?.arabicModes[0] ?? "" };
}

/** What a connection test proves: the type, its connection fields and the secret typed. */
export function connectionFingerprint(form: WebsiteForm, types: TargetType[]): string {
  return JSON.stringify([form.type, connectionKeys(typeOf(types, form.type)).map((key) => textOf(form.settings[key]).trim()), form.secret]);
}

/** Spec v1.1 §7: a new connection, another type, a changed connection field or a typed secret must pass a test before saving. */
export function needsTest(form: WebsiteForm, saved: PublishTarget, types: TargetType[]): boolean {
  if (saved.status === "missing" || form.type !== saved.type || form.secret !== "") return true;
  return connectionKeys(typeOf(types, form.type)).some((key) => textOf(form.settings[key]).trim() !== textOf(saved.settings[key]).trim());
}

/** Required fields left empty. The secret counts as filled when one is stored for this same type. */
export function missingRequired(form: WebsiteForm, saved: PublishTarget, types: TargetType[]): string[] {
  const secretStored = saved.secretSet && saved.type === form.type;
  return (typeOf(types, form.type)?.fields ?? [])
    .filter((field) => field.required)
    .filter((field) => (field.kind === "secret" ? !form.secret && !secretStored : !textOf(form.settings[field.key]).trim()))
    .map((field) => field.key);
}

/** After a passing test: a suggestion fills a row that's empty or names a field the website doesn't have; a valid choice stays. */
export function prefillMap(current: Record<string, string>, suggested: Record<string, string>, choices: string[]): Record<string, string> {
  const next = { ...current };
  for (const [key, value] of Object.entries(suggested)) {
    if (!next[key] || (choices.length > 0 && !choices.includes(next[key]))) next[key] = value;
  }
  return next;
}

/** A map editor's rows: the saved keys, then any the last test suggested. */
export const mapKeys = (current: Record<string, string>, suggested: Record<string, string>) => [...new Set([...Object.keys(current), ...Object.keys(suggested)])];

const filled = (map: Record<string, string>) => Object.fromEntries(Object.entries(map).filter(([, value]) => value));

/** The test request: the unsaved values, the secret only if typed. A block map goes with the blocks format (spec v1.1 §4: Strapi only). */
export function toWebsiteTarget(form: WebsiteForm, types: TargetType[]): WebsiteTargetInput {
  const settings: Record<string, unknown> = { ...form.settings };
  for (const field of typeOf(types, form.type)?.fields ?? []) {
    if (field.kind === "secret") delete settings[field.key];
    else settings[field.key] = textOf(form.settings[field.key]).trim();
  }
  return {
    type: form.type,
    settings,
    ...(form.secret ? { secret: form.secret } : {}),
    fieldMap: filled(form.fieldMap),
    body: form.bodyFormat === "blocks" ? { format: form.bodyFormat, blockMap: filled(form.blockMap) } : { format: form.bodyFormat },
    arabic: { mode: form.arabicMode },
  };
}

export const toWebsiteUpdate = (form: WebsiteForm, types: TargetType[], version: number): WebsiteUpdate => ({ ...toWebsiteTarget(form, types), version });
```

- [ ] **Step 4: Run the unit test to make sure it passes**

Run: `pnpm test tests/unit/website-form.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Add the messages**

Merge into `messages/en.json` at `Settings`. `fieldLabels` is used only in other languages (English shows the engine's own labels), but both files keep the same keys:

```json
{
  "website": {
    "title": "Website connection",
    "hint": "Where approved articles are published. The fields come from the content engine.",
    "statuses": { "ok": "Connected", "error": "Not working", "missing": "Not connected" },
    "lastChecked": "Last checked {time}",
    "lastError": "Last error: {error}",
    "type": "Website type",
    "secretKept": "Saved. Leave it empty to keep it.",
    "test": "Test connection",
    "testing": "Testing…",
    "testOk": "The connection works.",
    "testFailed": "The connection failed: {error}",
    "needsTest": "Test the connection before saving: its type, address, user or password changed.",
    "fieldMap": "Field mapping",
    "fieldMapHint": "Which website field receives each part of the article. Test the connection to see the website's fields.",
    "blockMap": "Block mapping",
    "blockMapHint": "Which block receives each part of the article's body.",
    "mapEmpty": "Nothing to map yet. Test the connection to get suggestions.",
    "notMapped": "Not sent",
    "bodyFormat": "Article format",
    "arabicMode": "Arabic version",
    "bodyFormats": { "html": "HTML", "boldbuilder": "Bold Builder", "blocks": "Blocks" },
    "arabicModes": {
      "translatepress": "TranslatePress translation of the English post",
      "separate": "A separate post",
      "locale": "Arabic locale of the same entry"
    },
    "mapKeys": {
      "title": "Title",
      "slug": "Slug",
      "subtitle": "Subtitle",
      "excerpt": "Excerpt",
      "metaTitle": "Meta title",
      "metaDescription": "Meta description",
      "keywords": "Keywords",
      "image": "Photo",
      "category": "Category",
      "author": "Author",
      "heading": "Heading",
      "paragraph": "Paragraph",
      "list": "List",
      "faq": "FAQ",
      "quote": "Quote",
      "table": "Table"
    },
    "fieldLabels": { "url": "Site address", "username": "Publishing user", "secret": "Password or token", "postType": "Post type", "collection": "Collection" },
    "formKeys": {
      "type": "Website type",
      "settings": "Connection details",
      "secret": "Password or token",
      "fieldMap": "Field mapping",
      "bodyFormat": "Article format",
      "blockMap": "Block mapping",
      "arabicMode": "Arabic version"
    }
  }
}
```

Merge into `messages/ar.json` at `Settings`:

```json
{
  "website": {
    "title": "اتصال الموقع",
    "hint": "المكان الذي تُنشر فيه المقالات المعتمدة. تأتي الحقول من محرك المحتوى.",
    "statuses": { "ok": "متصل", "error": "لا يعمل", "missing": "غير متصل" },
    "lastChecked": "آخر فحص {time}",
    "lastError": "آخر خطأ: {error}",
    "type": "نوع الموقع",
    "secretKept": "محفوظة. اتركها فارغة للإبقاء عليها.",
    "test": "اختبار الاتصال",
    "testing": "جارٍ الاختبار…",
    "testOk": "الاتصال يعمل.",
    "testFailed": "فشل الاتصال: {error}",
    "needsTest": "اختبر الاتصال قبل الحفظ: تغيّر النوع أو العنوان أو المستخدم أو كلمة المرور.",
    "fieldMap": "ربط الحقول",
    "fieldMapHint": "حقل الموقع الذي يستقبل كل جزء من المقال. اختبر الاتصال لرؤية حقول الموقع.",
    "blockMap": "ربط الكتل",
    "blockMapHint": "الكتلة التي تستقبل كل جزء من نص المقال.",
    "mapEmpty": "لا شيء للربط بعد. اختبر الاتصال للحصول على اقتراحات.",
    "notMapped": "لا يُرسل",
    "bodyFormat": "صيغة المقال",
    "arabicMode": "النسخة العربية",
    "bodyFormats": { "html": "HTML", "boldbuilder": "Bold Builder", "blocks": "كتل" },
    "arabicModes": {
      "translatepress": "ترجمة TranslatePress للمقال الإنجليزي",
      "separate": "مقال منفصل",
      "locale": "اللغة العربية للمُدخل نفسه"
    },
    "mapKeys": {
      "title": "العنوان",
      "slug": "الرابط المختصر",
      "subtitle": "العنوان الفرعي",
      "excerpt": "المقتطف",
      "metaTitle": "عنوان الميتا",
      "metaDescription": "وصف الميتا",
      "keywords": "الكلمات المفتاحية",
      "image": "الصورة",
      "category": "التصنيف",
      "author": "الكاتب",
      "heading": "عنوان فرعي",
      "paragraph": "فقرة",
      "list": "قائمة",
      "faq": "الأسئلة الشائعة",
      "quote": "اقتباس",
      "table": "جدول"
    },
    "fieldLabels": { "url": "عنوان الموقع", "username": "مستخدم النشر", "secret": "كلمة المرور أو الرمز", "postType": "نوع المقال", "collection": "المجموعة" },
    "formKeys": {
      "type": "نوع الموقع",
      "settings": "بيانات الاتصال",
      "secret": "كلمة المرور أو الرمز",
      "fieldMap": "ربط الحقول",
      "bodyFormat": "صيغة المقال",
      "blockMap": "ربط الكتل",
      "arabicMode": "النسخة العربية"
    }
  }
}
```

- [ ] **Step 6: Write the Website connection page**

Create `src/components/settings/map-editor.tsx`:

```tsx
"use client";

import { Label } from "@/components/ui/label";
import { mapKeys } from "@/lib/settings/website-form";

const SELECT = "h-9 min-w-0 rounded-md border border-input bg-card px-3 text-sm";

type Props = {
  testId: string;
  title: string;
  hint: string;
  empty: string;
  notMapped: string;
  current: Record<string, string>;
  suggested: Record<string, string>;
  choices: string[];
  labelOf: (key: string) => string;
  onChange: (key: string, value: string) => void;
};

/** One row per part of the article: the saved keys, then any the last test suggested. The choices are the website's own fields from that test. */
export function MapEditor({ testId, title, hint, empty, notMapped, current, suggested, choices, labelOf, onChange }: Props) {
  const keys = mapKeys(current, suggested);
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">{title}</legend>
      <p className="text-xs text-muted-foreground">{hint}</p>
      {keys.length === 0 && (
        <p data-testid={`${testId}-empty`} className="text-sm text-muted-foreground">
          {empty}
        </p>
      )}
      {keys.map((key) => {
        const value = current[key] ?? "";
        const options = [...new Set([...choices, ...(value ? [value] : [])])];
        return (
          <div key={key} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] items-center gap-3">
            <Label htmlFor={`${testId}-${key}`}>{labelOf(key)}</Label>
            <select id={`${testId}-${key}`} data-testid={`${testId}-${key}`} dir="ltr" className={SELECT} value={value} onChange={(event) => onChange(key, event.target.value)}>
              <option value="">{notMapped}</option>
              {options.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        );
      })}
    </fieldset>
  );
}
```

Create `src/components/settings/website-settings-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { loadWebsiteAction, saveWebsiteAction, testWebsiteAction } from "@/app/[locale]/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/navigation";
import { useEngineAction } from "@/lib/actions/use-engine-action";
import type { EngineFailure } from "@/lib/engine/result";
import type { PublishTarget, TargetField, TargetType, WebsiteTest } from "@/lib/engine/schemas";
import { settingsFieldErrors } from "@/lib/settings/field-errors";
import {
  connectionFingerprint,
  missingRequired,
  needsTest,
  prefillMap,
  switchType,
  textOf,
  toWebsiteForm,
  toWebsiteTarget,
  toWebsiteUpdate,
  typeOf,
  type WebsiteForm,
} from "@/lib/settings/website-form";
import { FieldMessage, OtherFieldErrors, SaveBar, SaveFailure } from "./form-parts";
import { MapEditor } from "./map-editor";
import { SettingsConflict } from "./settings-conflict";
import { useSettingsDraft } from "./use-settings-draft";

const SELECT = "h-9 rounded-md border border-input bg-card px-3 text-sm";

type Props = { locale: string; saved: PublishTarget; types: TargetType[]; lastChecked: string | null };
type TestRun = { fingerprint: string; type: string; result: WebsiteTest };

/** Spec v1.1 §6 Website, drawn entirely from /meta.targetTypes. A changed connection is saved only after its test passes (§10). */
export function WebsiteSettingsForm({ locale, saved, types, lastChecked }: Props) {
  const t = useTranslations("Settings.website");
  const router = useRouter();
  const save = useEngineAction(saveWebsiteAction);
  const test = useEngineAction(testWebsiteAction);
  const [firstRun] = useState(saved.status === "missing");
  const [run, setRun] = useState<TestRun | null>(null);
  const [testError, setTestError] = useState<EngineFailure | null>(null);
  const draft = useSettingsDraft({
    saved,
    toForm: (target: PublishTarget) => toWebsiteForm(target, types),
    save: (form, version) => save.run({ locale, update: toWebsiteUpdate(form, types, version) }),
    load: () => loadWebsiteAction({ locale }),
  });
  const form = draft.form;
  const conflict = draft.conflict;
  const type = typeOf(types, form.type);
  const fingerprint = connectionFingerprint(form, types);
  const lastTest = run?.fingerprint === fingerprint ? run.result : null;
  // The last passing test of this type gives the website's own fields and blocks as the maps' choices.
  const adapter = run && run.type === form.type && run.result.ok ? run.result : null;
  const testNeeded = needsTest(form, saved, types);
  const missing = missingRequired(form, saved, types);
  const secretKept = saved.secretSet && saved.type === form.type;
  const canSave = draft.unsaved.length > 0 && missing.length === 0 && (!testNeeded || lastTest?.ok === true);
  const errors = settingsFieldErrors(draft.error ?? testError, [...(type?.fields.map((field) => field.key) ?? []), "type", "body.format", "arabic.mode"]);

  // English shows the engine's own labels; another language shows ours for the keys we know (Global Constraints).
  const fieldLabel = (field: TargetField) => (locale !== "en" && t.has(`fieldLabels.${field.key}`) ? t(`fieldLabels.${field.key}`) : field.label);
  const choiceLabel = (group: "bodyFormats" | "arabicModes" | "mapKeys", code: string) => (t.has(`${group}.${code}`) ? t(`${group}.${code}`) : code);
  const change = (next: (current: WebsiteForm) => WebsiteForm) => draft.update(next);
  const setMap = (map: "fieldMap" | "blockMap") => (key: string, value: string) => change((current) => ({ ...current, [map]: { ...current[map], [key]: value } }));

  async function runTest() {
    setTestError(null);
    const tested = { fingerprint, type: form.type };
    const result = await test.run({ locale, target: toWebsiteTarget(form, types) });
    if (!result.ok) {
      setTestError(result.error);
      return;
    }
    const outcome = result.data;
    setRun({ ...tested, result: outcome });
    if (outcome.ok) {
      change((current) => ({
        ...current,
        fieldMap: prefillMap(current.fieldMap, outcome.suggestedFieldMap, outcome.fields),
        blockMap: prefillMap(current.blockMap, outcome.suggestedBlockMap, outcome.blockTypes),
      }));
    }
  }

  async function saveNow() {
    setTestError(null);
    const done = await draft.save();
    // Spec v1.1 §6 first-run setup: the website connection first, then the social accounts.
    if (done && firstRun) router.push("/settings/social");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("hint")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div data-testid="website-status" data-status={saved.status} className="flex flex-col gap-1 rounded-md bg-muted px-3 py-2 text-sm">
          <span className="font-medium">{t.has(`statuses.${saved.status}`) ? t(`statuses.${saved.status}`) : saved.status}</span>
          {lastChecked && (
            <span data-testid="website-last-checked" className="text-muted-foreground">
              {t("lastChecked", { time: lastChecked })}
            </span>
          )}
          {saved.lastError && <span className="text-bad-fg">{t("lastError", { error: saved.lastError })}</span>}
        </div>
        {conflict && (
          <SettingsConflict
            rows={conflict.keys
              .filter((key) => key !== "secret")
              .map((key) => ({ key, label: t(`formKeys.${key}`), theirs: conflict.theirs[key], mine: form[key] }))}
            pending={draft.pending}
            onLoadTheirs={draft.loadTheirs}
            onKeepMine={() => void draft.keepMine()}
          />
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="website-type">{t("type")}</Label>
          <select
            id="website-type"
            data-testid="website-type"
            className={SELECT}
            value={form.type}
            onChange={(event) => {
              const next = event.target.value;
              change((current) => switchType(current, next, types));
            }}
          >
            {types.map((option) => (
              <option key={option.type} value={option.type}>
                {option.label}
              </option>
            ))}
          </select>
          <FieldMessage field="type" message={errors.byField.type} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {type?.fields.map((field) => {
            const id = `website-field-${field.key}`;
            const isSecret = field.kind === "secret";
            return (
              <div key={field.key} className="flex flex-col gap-1.5">
                <Label htmlFor={id}>
                  {fieldLabel(field)}
                  {field.required ? " *" : ""}
                </Label>
                <Input
                  id={id}
                  data-testid={id}
                  dir="ltr"
                  type={isSecret ? "password" : field.kind === "url" ? "url" : "text"}
                  autoComplete={isSecret ? "new-password" : "off"}
                  value={isSecret ? form.secret : textOf(form.settings[field.key])}
                  onChange={(event) => {
                    const value = event.target.value;
                    change((current) => (isSecret ? { ...current, secret: value } : { ...current, settings: { ...current.settings, [field.key]: value } }));
                  }}
                />
                {isSecret && secretKept && (
                  <p data-testid="website-secret-kept" className="text-xs text-muted-foreground">
                    {t("secretKept")}
                  </p>
                )}
                <FieldMessage field={field.key} message={errors.byField[field.key]} />
              </div>
            );
          })}
        </div>
        <div className="flex flex-col gap-2">
          <div>
            <Button type="button" variant="outline" data-testid="website-test" disabled={test.pending || missing.length > 0} onClick={() => void runTest()}>
              {test.pending ? t("testing") : t("test")}
            </Button>
          </div>
          {lastTest &&
            (lastTest.ok ? (
              <p role="status" data-testid="website-test-result" data-ok="true" className="rounded-md bg-ok-bg px-3 py-2 text-sm text-ok-fg">
                {t("testOk")}
              </p>
            ) : (
              <p role="alert" data-testid="website-test-result" data-ok="false" className="rounded-md bg-bad-bg px-3 py-2 text-sm text-bad-fg">
                {t("testFailed", { error: lastTest.error ?? "" })}
              </p>
            ))}
          {testNeeded && lastTest?.ok !== true && (
            <p data-testid="website-needs-test" className="text-sm text-muted-foreground">
              {t("needsTest")}
            </p>
          )}
          <SaveFailure error={testError} />
        </div>
        <MapEditor
          testId="field-map"
          title={t("fieldMap")}
          hint={t("fieldMapHint")}
          empty={t("mapEmpty")}
          notMapped={t("notMapped")}
          current={form.fieldMap}
          suggested={adapter?.suggestedFieldMap ?? {}}
          choices={adapter?.fields ?? []}
          labelOf={(key) => choiceLabel("mapKeys", key)}
          onChange={setMap("fieldMap")}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="website-body-format">{t("bodyFormat")}</Label>
            <select
              id="website-body-format"
              data-testid="website-body-format"
              className={SELECT}
              value={form.bodyFormat}
              onChange={(event) => {
                const value = event.target.value;
                change((current) => ({ ...current, bodyFormat: value }));
              }}
            >
              {(type?.bodyFormats ?? []).map((code) => (
                <option key={code} value={code}>
                  {choiceLabel("bodyFormats", code)}
                </option>
              ))}
            </select>
            <FieldMessage field="body.format" message={errors.byField["body.format"]} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="website-arabic-mode">{t("arabicMode")}</Label>
            <select
              id="website-arabic-mode"
              data-testid="website-arabic-mode"
              className={SELECT}
              value={form.arabicMode}
              onChange={(event) => {
                const value = event.target.value;
                change((current) => ({ ...current, arabicMode: value }));
              }}
            >
              {(type?.arabicModes ?? []).map((code) => (
                <option key={code} value={code}>
                  {choiceLabel("arabicModes", code)}
                </option>
              ))}
            </select>
            <FieldMessage field="arabic.mode" message={errors.byField["arabic.mode"]} />
          </div>
        </div>
        {form.bodyFormat === "blocks" && (
          <MapEditor
            testId="block-map"
            title={t("blockMap")}
            hint={t("blockMapHint")}
            empty={t("mapEmpty")}
            notMapped={t("notMapped")}
            current={form.blockMap}
            suggested={adapter?.suggestedBlockMap ?? {}}
            choices={adapter?.blockTypes ?? []}
            labelOf={(key) => choiceLabel("mapKeys", key)}
            onChange={setMap("blockMap")}
          />
        )}
        <OtherFieldErrors items={errors.other} />
        <SaveFailure error={draft.error} />
        <SaveBar onSave={() => void saveNow()} pending={draft.pending} disabled={!canSave} unsaved={draft.unsaved.length > 0} savedNow={draft.savedNow} />
      </CardContent>
    </Card>
  );
}
```

Create `src/components/settings/website-view.tsx`:

```tsx
import { EngineNotice } from "@/components/dashboard/engine-notice";
import type { AppLocale } from "@/i18n/locales";
import { requirePermission } from "@/lib/auth/session";
import { getEngine } from "@/lib/engine";
import { tryEngine } from "@/lib/engine/result";
import { formatDateTime } from "@/lib/format/datetime";
import { WebsiteSettingsForm } from "./website-settings-form";

export async function WebsiteView({ locale }: { locale: AppLocale }) {
  await requirePermission(locale, "settings.manage");
  const engine = await getEngine();
  const [meta, website, site] = await Promise.all([
    tryEngine(() => engine.meta()),
    tryEngine(() => engine.websiteSettings()),
    tryEngine(() => engine.siteTimezone()),
  ]);
  if (!meta.ok) return <EngineNotice error={meta.error} />;
  if (!website.ok) return <EngineNotice error={website.error} />;
  const checkedAt = website.data.lastCheckedAt;
  const lastChecked = checkedAt ? formatDateTime(checkedAt, { timeZone: site.ok ? site.data.timezone : "UTC", locale }) : null;
  return <WebsiteSettingsForm locale={locale} saved={website.data} types={meta.data.targetTypes} lastChecked={lastChecked} />;
}
```

Create `src/app/[locale]/(app)/settings/website/page.tsx`:

```tsx
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SectionSkeleton } from "@/components/dashboard/section-skeleton";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { WebsiteView } from "@/components/settings/website-view";
import { asAppLocale } from "@/i18n/locales";

export default async function WebsiteSettingsPage({ params }: PageProps<"/[locale]/settings/website">) {
  const locale = asAppLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("Settings");
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl">{t("title")}</h1>
      <SettingsTabs current="website" />
      <Suspense fallback={<SectionSkeleton />}>
        <WebsiteView locale={locale} />
      </Suspense>
    </div>
  );
}
```

- [ ] **Step 7: Run the e2e tests**

Run: `pnpm e2e tests/e2e/settings-website.spec.ts`
Expected: PASS (6 tests).

- [ ] **Step 8: Lint, typecheck and the whole unit suite**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: lint and typecheck exit 0; every unit test passes.

- [ ] **Step 9: Commit**

```bash
git add src/lib/settings/website-form.ts src/components/settings "src/app/[locale]/(app)/settings/website" messages tests/unit/website-form.test.ts tests/e2e/settings-website.spec.ts
git commit -m "feat: the Website connection page, drawn from /meta, with connection tests, maps and a test-gated save"
```

---

### Task 8: The Social accounts page

**Files:**
- Create:
  - lib: `src/lib/settings/social.ts`
  - components: `src/components/settings/social-view.tsx`, `src/components/settings/social-board.tsx`
  - page: `src/app/[locale]/(app)/settings/social/page.tsx`
- Modify: `messages/en.json`, `messages/ar.json`
- Test: `tests/unit/social-rows.test.ts`, `tests/e2e/settings-social.spec.ts` (create)

**Interfaces:**
- Consumes:
  - Task 1 `SocialConnection`
  - Task 4 social and Search Console actions, `safeRedirectUrl`
  - Task 5 `SettingsTabs`
  - M2a `ConfirmDialog`
  - M2b `SkippedNote`, `formatDateTime`
- Produces:
  - **`social.ts`:**
    - `type SocialRow = { key; status; accountName; expiresAt; lastError; searchConsole }`
    - `socialRows(connections, features, searchConsole)`
    - `connectedRow(value, rows)`
  - **Test ids:**
    - Rows: `social-row-{key}`, `social-status-{key}` (with `data-status`), `social-expires-{key}`.
    - Buttons: `social-connect-{key}`, `social-disconnect-{key}` (and `-confirm`).
    - Notices: `social-connected`, `social-unsafe-address`.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/social-rows.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { connectedRow, socialRows } from "@/lib/settings/social";

const ACCOUNTS = [
  { platform: "linkedin", accountName: "Fakher & Co", status: "expiring", expiresAt: "2026-10-30T10:00:00+04:00", lastError: null },
  { platform: "instagram", accountName: null, status: "missing", expiresAt: null, lastError: null },
];

describe("the Social accounts rows (spec v1.1 §6 Social)", () => {
  it("lists the engine's accounts, and Google Search Console only with the performance feature", () => {
    expect(socialRows(ACCOUNTS, [], null).map((row) => row.key)).toEqual(["linkedin", "instagram"]);
    expect(socialRows(ACCOUNTS, ["performance"], undefined).at(-1)).toEqual({
      key: "searchConsole",
      status: "missing",
      accountName: null,
      expiresAt: null,
      lastError: null,
      searchConsole: true,
    });
  });

  it("gives an account the engine adds later its own row", () => {
    expect(socialRows([{ platform: "tiktok", status: "ok" }], [], null)).toMatchObject([{ key: "tiktok", status: "ok", searchConsole: false }]);
  });

  it("names the account that just connected only when it's a row on the page", () => {
    const rows = socialRows(ACCOUNTS, ["performance"], "ok");
    expect([connectedRow("instagram", rows), connectedRow(["searchConsole"], rows), connectedRow("<script>", rows), connectedRow(undefined, rows)]).toEqual([
      "instagram",
      "searchConsole",
      null,
      null,
    ]);
  });
});
```

Create `tests/e2e/settings-social.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { isolateMockStore, normalizeSpaces, setMockScenario, signInWithCookie } from "./helpers";

test.beforeEach(async ({ context }) => {
  await isolateMockStore(context);
  await signInWithCookie(context, "dev_admin");
});

test("lists LinkedIn, expiring with when its access ends, and Instagram not connected; no Search Console without the feature", async ({ page }) => {
  await page.goto("/en/settings/social");
  await expect(page.getByTestId("social-status-linkedin")).toHaveAttribute("data-status", "expiring");
  await expect.poll(async () => normalizeSpaces(await page.getByTestId("social-expires-linkedin").innerText())).toContain("Oct 30");
  await expect(page.getByTestId("social-connect-linkedin")).toHaveText("Reconnect");
  await expect(page.getByTestId("social-status-instagram")).toHaveAttribute("data-status", "missing");
  await expect(page.getByTestId("social-connect-instagram")).toHaveText("Connect");
  await expect(page.getByTestId("social-row-searchConsole")).toHaveCount(0);
});

test("connecting Instagram goes through the engine's address and comes back connected; the dashboard stops warning", async ({ page }) => {
  await page.goto("/en/settings/social");
  await page.getByTestId("social-connect-instagram").click();
  await page.waitForURL(/\/en\/settings\/social\?connected=instagram$/);
  await expect(page.getByTestId("social-connected")).toHaveText("Instagram connected.");
  await expect(page.getByTestId("social-status-instagram")).toHaveAttribute("data-status", "ok");
  await page.goto("/en");
  await expect(page.getByTestId("connection-linkedin")).toBeVisible();
  await expect(page.getByTestId("connection-instagram")).toHaveCount(0);
});

test("disconnecting asks first, then the account shows as not connected", async ({ page }) => {
  await page.goto("/en/settings/social");
  await page.getByTestId("social-disconnect-linkedin").click();
  await page.getByTestId("social-disconnect-linkedin-confirm").click();
  await expect(page.getByTestId("social-status-linkedin")).toHaveAttribute("data-status", "missing");
  await expect(page.getByTestId("social-disconnect-linkedin")).toHaveCount(0);
});

test("Google Search Console is offered with the performance feature, through the same round trip", async ({ page, context }) => {
  await setMockScenario(context, "performance");
  await page.goto("/en/settings/social");
  await expect(page.getByTestId("social-status-searchConsole")).toHaveAttribute("data-status", "missing");
  await page.getByTestId("social-connect-searchConsole").click();
  await page.waitForURL(/\?connected=searchConsole$/);
  await expect(page.getByTestId("social-connected")).toHaveText("Google Search Console connected.");
  await expect(page.getByTestId("social-status-searchConsole")).toHaveAttribute("data-status", "ok");
});
```

- [ ] **Step 2: Run the unit test to make sure it fails**

Run: `pnpm test tests/unit/social-rows.test.ts`
Expected: FAIL to resolve `@/lib/settings/social`.

- [ ] **Step 3: Write the social rows module**

Create `src/lib/settings/social.ts`:

```ts
import type { SocialConnection } from "@/lib/engine/schemas";

export type SocialRow = {
  key: string;
  status: string;
  accountName: string | null;
  expiresAt: string | null;
  lastError: string | null;
  searchConsole: boolean;
};

/** One row per account GET …/settings/social lists, then Google Search Console when /meta.features has "performance" (spec v1.1 §6, §12). */
export function socialRows(connections: SocialConnection[], features: string[], searchConsole: string | null | undefined): SocialRow[] {
  const rows: SocialRow[] = connections.map((connection) => ({
    key: connection.platform,
    status: connection.status,
    accountName: connection.accountName ?? null,
    expiresAt: connection.expiresAt ?? null,
    lastError: connection.lastError ?? null,
    searchConsole: false,
  }));
  if (features.includes("performance")) {
    rows.push({ key: "searchConsole", status: searchConsole ?? "missing", accountName: null, expiresAt: null, lastError: null, searchConsole: true });
  }
  return rows;
}

/** `?connected=…` after the OAuth round trip (spec v1.1 §7): a row on this page, or null for anything else. */
export function connectedRow(value: string | string[] | undefined, rows: SocialRow[]): string | null {
  const key = Array.isArray(value) ? value[0] : value;
  return key && rows.some((row) => row.key === key) ? key : null;
}
```

- [ ] **Step 4: Run the unit test to make sure it passes**

Run: `pnpm test tests/unit/social-rows.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Add the messages**

Merge into `messages/en.json` at `Settings`:

```json
{
  "social": {
    "title": "Social accounts",
    "hint": "The accounts social posts are published to. Connecting opens the platform's own sign-in.",
    "platforms": { "linkedin": "LinkedIn", "instagram": "Instagram", "searchConsole": "Google Search Console" },
    "statuses": { "ok": "Connected", "expiring": "Expiring soon", "error": "Not working", "missing": "Not connected" },
    "searchConsoleHint": "Search performance for published articles.",
    "account": "Account: {name}",
    "expires": "Access ends {time}",
    "lastError": "Last error: {error}",
    "connect": "Connect",
    "reconnect": "Reconnect",
    "disconnect": "Disconnect",
    "disconnectTitle": "Disconnect {platform}?",
    "disconnectBody": "Posts for {platform} can't be published until it's connected again.",
    "connected": "{platform} connected.",
    "unsafeAddress": "The content engine sent a sign-in address the portal won't open. Contact Quantum1st."
  }
}
```

Merge into `messages/ar.json` at `Settings`:

```json
{
  "social": {
    "title": "حسابات التواصل الاجتماعي",
    "hint": "الحسابات التي تُنشر عليها منشورات التواصل الاجتماعي. يفتح الربط صفحة تسجيل الدخول الخاصة بالمنصة.",
    "platforms": { "linkedin": "لينكدإن", "instagram": "إنستغرام", "searchConsole": "Google Search Console" },
    "statuses": { "ok": "متصل", "expiring": "تنتهي صلاحيته قريباً", "error": "لا يعمل", "missing": "غير متصل" },
    "searchConsoleHint": "أداء البحث للمقالات المنشورة.",
    "account": "الحساب: {name}",
    "expires": "ينتهي الوصول {time}",
    "lastError": "آخر خطأ: {error}",
    "connect": "ربط",
    "reconnect": "إعادة الربط",
    "disconnect": "فصل",
    "disconnectTitle": "فصل {platform}؟",
    "disconnectBody": "لا يمكن نشر منشورات {platform} حتى يُربط من جديد.",
    "connected": "تم ربط {platform}.",
    "unsafeAddress": "أرسل محرك المحتوى عنوان تسجيل دخول لن تفتحه البوابة. تواصل مع Quantum1st."
  }
}
```

- [ ] **Step 6: Write the Social accounts page**

Create `src/components/settings/social-board.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  connectSearchConsoleAction,
  connectSocialAction,
  disconnectSearchConsoleAction,
  disconnectSocialAction,
} from "@/app/[locale]/(app)/settings/actions";
import { ActionError } from "@/components/actions/action-error";
import { ConfirmDialog } from "@/components/editor/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NETWORK_FAILURE } from "@/lib/actions/result";
import { useEngineAction } from "@/lib/actions/use-engine-action";
import type { EngineFailure } from "@/lib/engine/result";
import { safeRedirectUrl } from "@/lib/settings/addresses";
import type { SocialRow } from "@/lib/settings/social";
import { cn } from "@/lib/utils";

export type SocialBoardRow = SocialRow & { expires: string | null };
type Props = { locale: string; rows: SocialBoardRow[]; connected: string | null };

const TONE: Record<string, string> = { ok: "bg-ok-bg text-ok-fg", expiring: "bg-warn-bg text-warn-fg", missing: "bg-muted text-muted-foreground" };

/** Spec v1.1 §6 Social: Connect or Reconnect per account (an OAuth round trip through the engine), the token's expiry, and Disconnect. */
export function SocialBoard({ locale, rows, connected }: Props) {
  const t = useTranslations("Settings.social");
  const disconnectSocial = useEngineAction(disconnectSocialAction);
  const disconnectSearch = useEngineAction(disconnectSearchConsoleAction);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<EngineFailure | null>(null);
  const [unsafe, setUnsafe] = useState(false);
  const name = (key: string) => (t.has(`platforms.${key}`) ? t(`platforms.${key}`) : key);
  const statusLabel = (status: string) => (t.has(`statuses.${status}`) ? t(`statuses.${status}`) : status);

  async function connect(row: SocialBoardRow) {
    setError(null);
    setUnsafe(false);
    setBusy(row.key);
    const result = await (row.searchConsole ? connectSearchConsoleAction({ locale }) : connectSocialAction({ locale, platform: row.key })).catch(
      () => ({ ok: false as const, error: NETWORK_FAILURE }),
    );
    if (!result.ok) {
      setError(result.error);
      setBusy(null);
      return;
    }
    const target = safeRedirectUrl(result.data.authorizeUrl);
    if (!target) {
      setUnsafe(true);
      setBusy(null);
      return;
    }
    window.location.assign(target);
  }

  const disconnect = (row: SocialBoardRow) => async (): Promise<EngineFailure | null> => {
    const result = row.searchConsole ? await disconnectSearch.run({ locale }) : await disconnectSocial.run({ locale, platform: row.key });
    return result.ok ? null : result.error;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("hint")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {connected && (
          <p role="status" data-testid="social-connected" className="rounded-md bg-ok-bg px-3 py-2 text-sm text-ok-fg">
            {t("connected", { platform: name(connected) })}
          </p>
        )}
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li key={row.key} data-testid={`social-row-${row.key}`} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="font-medium">{name(row.key)}</span>
                {row.searchConsole && <span className="text-xs text-muted-foreground">{t("searchConsoleHint")}</span>}
                <span
                  data-testid={`social-status-${row.key}`}
                  data-status={row.status}
                  className={cn("w-fit rounded px-2 py-0.5 text-xs", TONE[row.status] ?? "bg-bad-bg text-bad-fg")}
                >
                  {statusLabel(row.status)}
                </span>
                {row.accountName && <span className="text-sm text-muted-foreground">{t("account", { name: row.accountName })}</span>}
                {row.expires && (
                  <span data-testid={`social-expires-${row.key}`} className="text-sm text-muted-foreground">
                    {t("expires", { time: row.expires })}
                  </span>
                )}
                {row.lastError && <span className="text-sm text-bad-fg">{t("lastError", { error: row.lastError })}</span>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" data-testid={`social-connect-${row.key}`} disabled={busy !== null} onClick={() => void connect(row)}>
                  {row.status === "missing" ? t("connect") : t("reconnect")}
                </Button>
                {row.status !== "missing" && (
                  <ConfirmDialog
                    testId={`social-disconnect-${row.key}`}
                    triggerLabel={t("disconnect")}
                    title={t("disconnectTitle", { platform: name(row.key) })}
                    description={t("disconnectBody", { platform: name(row.key) })}
                    confirmLabel={t("disconnect")}
                    pending={disconnectSocial.pending || disconnectSearch.pending}
                    onConfirm={disconnect(row)}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
        {unsafe && (
          <p role="alert" data-testid="social-unsafe-address" className="rounded-md bg-bad-bg px-3 py-2 text-sm text-bad-fg">
            {t("unsafeAddress")}
          </p>
        )}
        {error && <ActionError error={error} />}
      </CardContent>
    </Card>
  );
}
```

Create `src/components/settings/social-view.tsx`:

```tsx
import { EngineNotice } from "@/components/dashboard/engine-notice";
import { SkippedNote } from "@/components/lists/skipped-note";
import type { AppLocale } from "@/i18n/locales";
import { requirePermission } from "@/lib/auth/session";
import { getEngine } from "@/lib/engine";
import { tryEngine } from "@/lib/engine/result";
import { formatDateTime } from "@/lib/format/datetime";
import { connectedRow, socialRows } from "@/lib/settings/social";
import { SocialBoard } from "./social-board";

type Props = { locale: AppLocale; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Social accounts from GET …/settings/social; Search Console's status comes from the site's connections (spec v1.1 §4). */
export async function SocialView({ locale, searchParams }: Props) {
  await requirePermission(locale, "settings.manage");
  const query = await searchParams;
  const engine = await getEngine();
  const [meta, social, connections, site] = await Promise.all([
    tryEngine(() => engine.meta()),
    tryEngine(() => engine.socialConnections()),
    tryEngine(() => engine.siteConnections()),
    tryEngine(() => engine.siteTimezone()),
  ]);
  if (!meta.ok) return <EngineNotice error={meta.error} />;
  if (!social.ok) return <EngineNotice error={social.error} />;
  const timeZone = site.ok ? site.data.timezone : "UTC";
  const rows = socialRows(social.data.connections, meta.data.features, connections.ok ? connections.data.connections.searchConsole : null).map((row) => ({
    ...row,
    expires: row.expiresAt ? formatDateTime(row.expiresAt, { timeZone, locale }) : null,
  }));
  return (
    <div className="flex flex-col gap-4">
      <SkippedNote count={social.data.skipped} />
      <SocialBoard locale={locale} rows={rows} connected={connectedRow(query.connected, rows)} />
    </div>
  );
}
```

Create `src/app/[locale]/(app)/settings/social/page.tsx`:

```tsx
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SectionSkeleton } from "@/components/dashboard/section-skeleton";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { SocialView } from "@/components/settings/social-view";
import { asAppLocale } from "@/i18n/locales";

// searchParams (?connected=… after the OAuth round trip) is request data: awaited inside the Suspense boundary (Cache Components).
export default async function SocialSettingsPage({ params, searchParams }: PageProps<"/[locale]/settings/social">) {
  const locale = asAppLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("Settings");
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl">{t("title")}</h1>
      <SettingsTabs current="social" />
      <Suspense fallback={<SectionSkeleton />}>
        <SocialView locale={locale} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
```

- [ ] **Step 7: Run the e2e tests**

Run: `pnpm e2e tests/e2e/settings-social.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 8: Lint, typecheck and the whole unit suite**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: lint and typecheck exit 0; every unit test passes.

- [ ] **Step 9: Commit**

```bash
git add src/lib/settings/social.ts src/components/settings "src/app/[locale]/(app)/settings/social" messages tests/unit/social-rows.test.ts tests/e2e/settings-social.spec.ts
git commit -m "feat: the Social accounts page with OAuth connect, expiry, disconnect and Search Console behind its flag"
```

---

### Task 9: Links to the settings: connection warnings, first run and not_connected

**Files:**
- Modify:
  - `src/lib/dashboard/connections.ts`, `src/components/dashboard/connection-warnings.tsx`
  - `src/components/actions/action-error.tsx`, `src/components/editor/confirm-dialog.tsx`
  - `src/components/schedule/schedule-board.tsx`, `src/components/schedule/scheduled-queue.tsx`
  - `src/components/history/history-board.tsx`, `src/components/history/history-list.tsx`
  - `src/components/editor/action-bar.tsx`, `src/components/editor/editor-footer.tsx`, `src/components/editor/post-editor.tsx`, `src/app/[locale]/(app)/review/[postId]/page.tsx`
  - `messages/en.json`, `messages/ar.json`
- Test: `tests/unit/dashboard.test.ts` (append), `tests/e2e/settings-links.spec.ts` (create)

**Interfaces:**
- Consumes: Task 3 `firstrun` scenario and `details.connection`; Task 7's first-run move to `/settings/social`
- Produces:
  - **`settingsPageFor(connection)`:** `"/settings/website"` for `website`, and `"/settings/social"` for every other connection.
  - **Dashboard:**
    - An Admin's connection warnings each link to the page that fixes them (`connection-fix-{key}`).
    - With `connections.website.status === "missing"`, the dashboard sends the Admin to `/settings/website` (spec v1.1 §6).
  - **`ActionError({ error, canManageSettings? })`:** a `not_connected` shows the connection's name, then:
    - Admin: a link to the right settings page (`not-connected-fix`)
    - otherwise: "Ask your admin to connect it." (`not-connected-ask-admin`)
  - **`canManageSettings` reaches every place a publish can fail:**
    - `ConfirmDialog` takes it as an optional prop.
    - `ScheduleBoard`, `HistoryBoard`, `PostEditor`, `EditorFooter` and `ActionBar` require it.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/dashboard.test.ts` (and add `settingsPageFor` to its import from `@/lib/dashboard/connections`):

```ts
describe("settingsPageFor (design §9 not_connected, M1 follow-up)", () => {
  it("sends the website connection to its own page and every account to Social accounts", () => {
    expect(["website", "linkedin", "instagram", "searchConsole", "tiktok"].map(settingsPageFor)).toEqual([
      "/settings/website",
      "/settings/social",
      "/settings/social",
      "/settings/social",
      "/settings/social",
    ]);
  });
});
```

Create `tests/e2e/settings-links.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { isolateMockStore, setMockScenario, signInWithCookie } from "./helpers";

test.beforeEach(async ({ context }) => {
  await isolateMockStore(context);
});

test("an admin's connection warnings link to the page that fixes them; a reviewer gets no links", async ({ page, context }) => {
  await signInWithCookie(context, "dev_admin");
  await page.goto("/en");
  await expect(page.getByTestId("connection-fix-linkedin")).toHaveAttribute("href", "/en/settings/social");
  await expect(page.getByTestId("connection-fix-instagram")).toHaveAttribute("href", "/en/settings/social");
  await signInWithCookie(context, "dev_reviewer");
  await page.goto("/en");
  await expect(page.getByTestId("connection-linkedin")).toBeVisible();
  await expect(page.getByTestId("connection-fix-linkedin")).toHaveCount(0);
});

test("first run: the dashboard sends an admin to the website connection, and saving it moves on to social accounts (spec v1.1 §6, Review Focus 5)", async ({ page, context }) => {
  await setMockScenario(context, "firstrun");
  await signInWithCookie(context, "dev_admin");
  await page.goto("/en");
  await expect(page).toHaveURL(/\/en\/settings\/website$/);
  await expect(page.getByTestId("website-status")).toHaveAttribute("data-status", "missing");
  await page.getByTestId("website-field-url").fill("https://fakhernco.com");
  await page.getByTestId("website-field-username").fill("articles-ai");
  await page.getByTestId("website-field-secret").fill("first-application-password");
  await page.getByTestId("website-test").click();
  await expect(page.getByTestId("website-test-result")).toHaveAttribute("data-ok", "true");
  await page.getByTestId("settings-save").click();
  await expect(page).toHaveURL(/\/en\/settings\/social$/);
  await page.goto("/en");
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.getByTestId("connection-website")).toHaveCount(0);
});

test("first run: a reviewer stays on the dashboard and is told to ask the admin", async ({ page, context }) => {
  await setMockScenario(context, "firstrun");
  await signInWithCookie(context, "dev_reviewer");
  await page.goto("/en");
  await expect(page.getByTestId("connection-website")).toHaveAttribute("data-status", "missing");
  await expect(page.getByTestId("connections-help")).toHaveText("Ask your admin to fix this.");
  await expect(page).toHaveURL(/\/en$/);
});

test("publishing with no website connection: a reviewer is told to ask the admin, an admin gets a link (design §9, Review Focus 5)", async ({ page, context }) => {
  await setMockScenario(context, "firstrun");
  await signInWithCookie(context, "dev_reviewer");
  await page.goto("/en/scheduled");
  await page.getByTestId("publish-p_101").click();
  await page.getByTestId("publish-p_101-confirm").click();
  await expect(page.getByTestId("not-connected")).toContainText("The website isn't connected, so this can't be published.");
  await expect(page.getByTestId("not-connected-ask-admin")).toBeVisible();
  await signInWithCookie(context, "dev_admin");
  await page.goto("/en/scheduled");
  await page.getByTestId("publish-p_101").click();
  await page.getByTestId("publish-p_101-confirm").click();
  await expect(page.getByTestId("not-connected-fix")).toHaveAttribute("href", "/en/settings/website");
});
```

- [ ] **Step 2: Run the unit test to make sure it fails**

Run: `pnpm test tests/unit/dashboard.test.ts`
Expected: FAIL with `TypeError: settingsPageFor is not a function`, since the module has no such export yet.

- [ ] **Step 3: Add `settingsPageFor` and the messages**

Append to `src/lib/dashboard/connections.ts`:

```ts
/** The settings page that fixes a connection (design §9 not_connected; M1 follow-up: warnings link to Settings). */
export const settingsPageFor = (connection: string) => (connection === "website" ? "/settings/website" : "/settings/social");
```

Merge into `messages/en.json`:
- at `Dashboard.connections`: `{ "fix": "Fix" }`
- at the top level:

```json
{
  "NotConnected": {
    "message": "{name} isn't connected, so this can't be published.",
    "names": { "website": "The website", "linkedin": "LinkedIn", "instagram": "Instagram", "searchConsole": "Google Search Console" },
    "fix": "Fix the connection in Settings",
    "askAdmin": "Ask your admin to connect it."
  }
}
```

Merge into `messages/ar.json`:
- at `Dashboard.connections`: `{ "fix": "إصلاح" }`
- at the top level:

```json
{
  "NotConnected": {
    "message": "{name} غير متصل، لذا لا يمكن نشر هذا.",
    "names": { "website": "الموقع", "linkedin": "لينكدإن", "instagram": "إنستغرام", "searchConsole": "Google Search Console" },
    "fix": "أصلح الاتصال من الإعدادات",
    "askAdmin": "اطلب من المسؤول ربطه."
  }
}
```

- [ ] **Step 4: Run the unit test to make sure it passes**

Run: `pnpm test tests/unit/dashboard.test.ts tests/unit/messages.test.ts`
Expected: PASS.

- [ ] **Step 5: Link the connection warnings, and send a first-run admin to setup**

In `src/components/dashboard/connection-warnings.tsx`:

1. Add the imports `import { redirect } from "next/navigation";` and `import { Link } from "@/i18n/navigation";`, and change the connections import to `import { connectionWarnings, settingsPageFor } from "@/lib/dashboard/connections";`.
2. Replace the first lines of the function body, from `const session = await requireSession(locale);` through `const site = await tryEngine(() => engine.siteConnections());`, with:

   ```tsx
     const session = await requireSession(locale);
     const admin = can(session.role, "settings.manage");
     const t = await getTranslations("Dashboard.connections");
     const engine = await getEngine();
     const site = await tryEngine(() => engine.siteConnections());
     // Spec v1.1 §6 first-run setup: with no website connection yet, the admin is sent to set it up (then on to social accounts).
     if (admin && site.ok && site.data.connections.website.status === "missing") redirect(`/${locale}/settings/website`);
   ```

3. Replace the row's status span

   ```tsx
                   <span>{t.has(`statuses.${status}`) ? t(`statuses.${status}`) : status}</span>
   ```

   with

   ```tsx
                   <span className="flex items-center gap-3">
                     <span>{t.has(`statuses.${status}`) ? t(`statuses.${status}`) : status}</span>
                     {admin && (
                       <Link href={settingsPageFor(key)} data-testid={`connection-fix-${key}`} className="font-medium underline">
                         {t("fix")}
                       </Link>
                     )}
                   </span>
   ```

4. Change `{can(session.role, "settings.manage") ? t("fixInSettings") : t("askAdmin")}` to `{admin ? t("fixInSettings") : t("askAdmin")}`.

- [ ] **Step 6: Give `not_connected` its role-specific next step**

Replace `src/components/actions/action-error.tsx` with:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { settingsPageFor } from "@/lib/dashboard/connections";
import { engineNoticeKey } from "@/lib/engine/notice";
import type { EngineFailure } from "@/lib/engine/result";

type Props = { error: EngineFailure; canManageSettings?: boolean };

export function ActionError({ error, canManageSettings = false }: Props) {
  const t = useTranslations("Errors");
  if (error.code === "not_connected") return <NotConnected error={error} canManageSettings={canManageSettings} />;
  const key = engineNoticeKey(error.code);
  return (
    <p role="alert" data-testid="action-error" data-code={error.code} className="rounded-md bg-bad-bg px-3 py-2 text-sm text-bad-fg">
      {key ? t(key) : error.message}
    </p>
  );
}

/** Design §9 422 not_connected: the Admin gets a link to the settings page that fixes it; anyone else is told to ask the admin. */
function NotConnected({ error, canManageSettings }: { error: EngineFailure; canManageSettings: boolean }) {
  const t = useTranslations("NotConnected");
  const connection = typeof error.details?.connection === "string" ? error.details.connection : null;
  return (
    <div role="alert" data-testid="not-connected" data-connection={connection ?? ""} className="flex flex-col gap-1 rounded-md bg-bad-bg px-3 py-2 text-sm text-bad-fg">
      <p>{connection && t.has(`names.${connection}`) ? t("message", { name: t(`names.${connection}`) }) : error.message}</p>
      {canManageSettings ? (
        <Link href={settingsPageFor(connection ?? "website")} data-testid="not-connected-fix" className="font-medium underline">
          {t("fix")}
        </Link>
      ) : (
        <p data-testid="not-connected-ask-admin">{t("askAdmin")}</p>
      )}
    </div>
  );
}
```

In `src/components/editor/confirm-dialog.tsx`:
- Add to `Props`, after `onConfirm`:

  ```ts
    /** A not_connected refusal links an admin to Settings (design §9). */
    canManageSettings?: boolean;
  ```

- Add `canManageSettings` to the destructured props.
- Change `{error && <ActionError error={error} />}` to `{error && <ActionError error={error} canManageSettings={canManageSettings} />}`.

- [ ] **Step 7: Pass `canManageSettings` to where publishing can fail**

**Scheduled:**
- In `src/components/schedule/schedule-board.tsx`, change the signature to:

  ```tsx
  export function ScheduleBoard({ locale, items, canManageSettings }: { locale: string; items: QueueItem[]; canManageSettings: boolean }) {
  ```

- Add `canManageSettings={canManageSettings}` to both `ConfirmDialog`s (`publish-selected` and `publish-${item.id}`).
- Change `{error && <ActionError error={error} />}` to `{error && <ActionError error={error} canManageSettings={canManageSettings} />}`.
- In `src/components/schedule/scheduled-queue.tsx`:
  - import `can` from `@/lib/auth/roles`
  - change `await requirePermission(locale, "content.work");` to `const session = await requirePermission(locale, "content.work");`
  - change `<ScheduleBoard locale={locale} items={items} />` to `<ScheduleBoard locale={locale} items={items} canManageSettings={can(session.role, "settings.manage")} />`

**History:**
- In `src/components/history/history-board.tsx`, change the signature to:

  ```tsx
  export function HistoryBoard({ locale, entries, canManageSettings }: { locale: string; entries: HistoryEntry[]; canManageSettings: boolean }) {
  ```

- Change `<ActionError error={errors[entry.id]} />` to `<ActionError error={errors[entry.id]} canManageSettings={canManageSettings} />`.
- In `src/components/history/history-list.tsx`:
  - import `can` from `@/lib/auth/roles`
  - change `await requirePermission(locale, "content.work");` to `const session = await requirePermission(locale, "content.work");`
  - change `<HistoryBoard locale={locale} entries={entries} />` to `<HistoryBoard locale={locale} entries={entries} canManageSettings={can(session.role, "settings.manage")} />`

**Editor:**
- `src/components/editor/action-bar.tsx`:
  - add `canManageSettings: boolean;` to `Props`, and `canManageSettings` to the destructured props
  - add `canManageSettings={canManageSettings}` to the `ConfirmDialog` with `testId="publish"`
  - change `{error && <ActionError error={error} />}` to `{error && <ActionError error={error} canManageSettings={canManageSettings} />}`
- `src/components/editor/editor-footer.tsx`:
  - add `canManageSettings: boolean;` to `EditorFooterProps`, and `canManageSettings` to the destructured props
  - add `canManageSettings={canManageSettings}` to `<ActionBar … />`
- `src/components/editor/post-editor.tsx`:
  - add `canManageSettings: boolean;` to `Props`, and `canManageSettings` to the destructured props
  - add `canManageSettings={canManageSettings}` to `<EditorFooter … />`
- `src/app/[locale]/(app)/review/[postId]/page.tsx`:
  - import `can` from `@/lib/auth/roles`
  - change `await requirePermission(locale, "content.work");` to `const session = await requirePermission(locale, "content.work");`
  - add `canManageSettings={can(session.role, "settings.manage")}` to `<PostEditor … />`

If `pnpm typecheck` names another caller of these components, pass the prop there the same way.

- [ ] **Step 8: Run the e2e tests**

Run: `pnpm e2e tests/e2e/settings-links.spec.ts tests/e2e/dashboard.spec.ts tests/e2e/scheduled.spec.ts tests/e2e/history.spec.ts tests/e2e/editor-actions.spec.ts`
Expected: PASS. The 4 new tests pass. The dashboard, Scheduled, History and editor tests still pass, including "an admin is told to fix connections in Settings".

- [ ] **Step 9: Lint, typecheck and the whole unit suite**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: lint and typecheck exit 0; every unit test passes.

- [ ] **Step 10: Commit**

```bash
git add src messages tests/unit/dashboard.test.ts tests/e2e/settings-links.spec.ts
git commit -m "feat: connection warnings link to Settings, first run sends the admin to setup, not_connected by role"
```

---

### Task 10: M3b wrap-up and full verification

**Files:**
- Create: `docs/plans/2026-10-22-m3b-followups.md`
- Modify: `README.md`, `docs/plans/2026-10-21-m1-followups.md`, `docs/plans/2026-10-22-m2b-followups.md`

**Interfaces:**
- Consumes: everything above
- Produces: a documented, fully green M3b

- [ ] **Step 1: Document M3b in `README.md`**

Append:

```markdown
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
```

- [ ] **Step 2: Update the follow-up docs**

- In `docs/plans/2026-10-21-m1-followups.md`, append ` — handled in M3b (warnings link to Settings; first-run redirect)` to the ruling about connection warnings not linking to Settings.
- In `docs/plans/2026-10-22-m2b-followups.md`, append ` — not_connected handled in M3b` to the declined item about role-specific `not_connected` / quota hints.

Create `docs/plans/2026-10-22-m3b-followups.md`:

```markdown
# M3b follow-ups

## Questions for Quantum1st (from M3b)

- **SEO profile:**
  - Do `POST/DELETE …/settings/seo/picture` change `SeoSettings.version`? The portal assumes not. What does `DELETE` return? The portal expects `{removed: true}`.
  - What does the `…/settings/seo/propose` job return in `result`? The portal reads `{focusKeywords, cta}`.
- **Publishing schedule:**
  - Which limits apply to `perDay` and `gapMinutes`?
  - Is a plan whose posts don't fit between `from` and `to` refused?
  - Are the day codes `sun…sat`?
- **Website connection:**
  - Is a failed test always `200 {ok: false, error}`? Does it change `PublishTarget.status` and `lastError`?
  - What is `type` before the first connection? The mock sends `null`.
  - Which portal-side `fieldMap` keys does the engine accept? The v1.1 example uses `subtitle`; the design draft said `excerpt`. The portal shows whatever keys the engine sends.
  - The labels in `/meta.targetTypes` are English. Could the engine send them per language?
  - The test returns `categories`, but `/meta.targetTypes` lists no default-category field, so the portal doesn't offer one. Should it?
- **OAuth:**
  - What does `returnUrl` receive when a sign-in fails or is cancelled (for example `?error=`)?
  - Does `GET …/connect` change anything before the provider answers?
- **`422 not_connected`:** does `error.details` say which connection? The portal reads `details.connection`.
- **Search Console:** its status is read from `site.connections.searchConsole`, as there's no `GET …/settings/search-console`. Please confirm.
```

- [ ] **Step 3: Run every check from a clean build**

```bash
rm -rf .next
pnpm lint && pnpm typecheck && pnpm test && pnpm e2e && ALLOW_TEST_LOGINS=1 pnpm build
```

Expected:
- lint and typecheck exit 0
- Vitest: about 316 passed (255 + the 61 added by Tasks 1–9; the exact number is whatever the run reports, with none failing)
- Playwright: about 120 passed (95 + 25)
- the build lists `◐ /en/settings/seo`, `/schedule`, `/website` and `/social` (and their `/ar` twins)

- [ ] **Step 4: Manual smoke test**

Run `pnpm dev`, sign in as **Admin**, and check:
- (a) **Menu:**
  - Settings is in the menu and opens the SEO profile.
  - As **Reviewer**, there's no Settings item, and `/en/settings/seo` goes back to the dashboard.
- (b) **SEO profile:**
  - Add a focus keyword and save.
  - Use Suggest, then save.
  - Upload and remove a share picture.
- (c) **Publishing schedule:** set 1 a day from 09:00. The next slot shows 9:00 AM, and Scheduled agrees.
- (d) **Website connection:**
  - A password with "wrong" in it fails the test with its message, and Save stays disabled.
  - Switching to Strapi shows Strapi's fields. After a passing test, the block map is filled.
  - Switch back to WordPress before leaving: the dev store is shared.
- (e) **Social accounts:**
  - Connect Instagram: it comes back connected, and the dashboard no longer warns about Instagram.
  - Disconnect LinkedIn after confirming.
- (f) **Arabic:** `/ar/settings/…` is right to left, and the website fields have Arabic labels.
- (g) **Dev console:** no console errors, no dev overlay, and no errors in the `pnpm dev` log.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: M3b decisions and questions for Quantum1st; settings complete"
git log --oneline | head -12
```

## Decisions in M3b (settings)

These come from the plan, ahead of execution. Each is a ruling the executor can rely on:

- **Routes and menu:**
  - The design's `/settings/schedule` route is kept; the engine endpoint stays `…/settings/publishing`.
  - One Settings menu item opens the SEO profile and stays highlighted on all four pages.
- **Forms:**
  - Numbers stay as typed text until saving. A number that isn't whole is caught in the browser, with a translated message.
  - `afterSave` takes the engine's copy as the new form, so values it tidied (trimmed, split lists) show at once.
- **Mock:**
  - The share-picture endpoints don't change the SEO profile's version, so an upload never conflicts with the Admin's own unsaved edits.
  - The mock's OAuth completes immediately, so the round trip can be tested end to end. Real providers ask the person first.
- **First run:** the dashboard alone redirects (other pages stay reachable), and only the Admin. A Reviewer can't fix a connection.
- **`not_connected` hints:** they reach the single-post publish surfaces (Scheduled, History Retry, the editor). Bulk publish failures still list the engine's message per post.
```
