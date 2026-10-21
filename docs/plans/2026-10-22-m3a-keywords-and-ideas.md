# M3a: Keywords and Topic Ideas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first half of design §13 M3:
- `/keywords`: tabs New / In use / Covered / Dismissed; add, approve, dismiss, restore; AI proposals; topics for selected; draft articles for selected, with a confirmation
- `/ideas` (spec `/suggestions`): topic cards; draft in en, ar or both; dismiss; bulk; a new-request form

These come with slow-AI-job progress through our own `/api/jobs/[id]` route, and the 429 `quota_exceeded` path with Request upgrade.

**Architecture:**
- **Mock engine:** the stateful mock store gains keywords and suggestions. A general job runner lets AI jobs (proposals, topics, drafts, redrafts) finish lazily after a delay. Drafts create `drafting` posts that become `pending` when their job is done.
- **Job progress:** the browser polls our own route `/api/jobs/[id]`. It's a server route that checks the session and keeps the engine key on the server; a small pure reducer turns each answer into progress, success or failure.
- **Pages:** server-rendered under `<Suspense>`, with client boards for the buttons. Every change goes through server actions with idempotency keys.

**Tech Stack:** Next.js 16.4 (App Router, Cache Components), React 19.3, TypeScript 5, next-intl 4.14, Zod 4.6, shadcn/ui, Vitest 5, Playwright 1.64. No new dependencies.

**Spec:**
- `docs/specs/2026-10-21-marketing-dashboard-design.md`: §5 roles, §7 screens (`/keywords`, `/ideas`), §8 data flow (slow AI jobs poll `/api/jobs/[id]`), §9 errors (429), §14 testing
- `docs/specs/Marketing Portal Build Spec v1.1.html`:
  - §2 ground rules, §3 conventions (async jobs, bulk results)
  - §4 Keyword, Suggestion, Plan & Quota
  - §5 Keyword and Suggestion status flows
  - §6 `/keywords` and `/suggestions`
  - §7 keyword, suggestion, drafts, jobs and upgrade-request endpoints
  - §9 errors; §10 acceptance (hard quota)
- `docs/plans/2026-10-22-m2a-followups.md` and `docs/plans/2026-10-22-m2b-followups.md`

## Global Constraints

- **Earlier constraints still hold:** all M1, M2a and M2b Global Constraints. In particular:
  - Cache Components (runtime data, including `searchParams`, only inside `<Suspense>`)
  - the engine key stays server-only
  - Latin digits and logical CSS
  - never "law firm"
  - changes go through server actions (role check, Zod, `X-Acting-User`, key, `ActionResult`, `refresh()` on success) via `useEngineAction`
  - lists are parsed leniently, with `SkippedNote`
  - every e2e test isolates the mock store
- **No new packages.**
- **Nothing hard-coded (spec §2):**
  - Language choices come from `/meta.languages`, plus "both" when the site has more than one language.
  - Kinds come from `/meta.kinds`; platforms from `/meta.platforms`.
  - The page size comes from `/meta.limits.pageSizeDefault`, and the poll interval from `/meta.pollSeconds`.
  - The only rule the browser applies itself: in the new-request form, an article (`blog`) goes to `website`, and a social post to any other platform. The engine still validates.
- **Keyword tabs (spec §6):**

  | Tab | Statuses |
  |---|---|
  | New | `new` |
  | In use | `approved` |
  | Covered | `covered` |
  | Dismissed | `dismissed` and `off_strategy` (the AI's "outside the site's strategy") |

  Restore moves dismissed and off-strategy keywords back to New (spec §5).
- **Slow AI jobs:**
  - Starting a job returns `{jobId, postIds?}`.
  - The browser polls **our** `GET /api/jobs/[id]` every `/meta.pollSeconds` (design §8), never the engine directly.
  - The route needs a signed-in person with `content.work`. Its answer is `ActionResult<Job>` JSON with `Cache-Control: no-store`.
- **429 `quota_exceeded` (design §9, spec §10):**
  - Show "Monthly limit reached for {metric}".
  - The metric label comes from `Dashboard.quota.metrics`, with the raw name as fallback.
  - **Admin:** a Request upgrade button (`POST /account/upgrade-request`, permission `plan.manage`).
  - **Reviewer:** "Ask your admin".
- **Mock-only names, checked at M5:**
  - Keywords added through the portal have `source: "person"`.
  - Suggestion drafts use the suggestion's kind, with platform `website` for articles and `linkedin` for social posts (spec §7 makes `platform` optional).
  - Duplicates on `POST …/keywords` are worked out by the portal: phrases it sent, minus the ones the engine returned, compared ignoring case and spacing (spec §7, "duplicates skipped and listed"). This is listed as a question for Quantum1st.

## Review Focus

1. **A hard quota refuses drafting with the 429 message, and the next step depends on the role.** Admin: Request upgrade, then "requested". Reviewer: "Ask your admin". Every drafting entry point behaves the same: Draft articles on Keywords, Draft on a card, bulk Draft, and the new-request form.
   - *Pinned by:* Task 6 and Task 7 e2e, with the `quota` mock scenario.
2. **A job that fails, a job id the engine no longer knows, or a session that ends during polling stops the spinner with a message.** A short network blip doesn't fail the job.
   - *Pinned by:* Task 4's reducer and route unit tests.
3. **Adding keywords that already exist, differing only in case or spacing, adds nothing twice and lists what was skipped.**
   - *Pinned by:* Task 2 store tests, Task 5 phrase tests and the Task 6 e2e.
4. **A bulk action on keywords or ideas acts only on the selected items it applies to.** Refusals are listed by phrase or title (spec §3 bulk result).
   - *Pinned by:* Task 2 and Task 3 store tests and Task 6 e2e.
5. **Arabic keywords, suggestions and drafts render right to left, and a both-languages draft creates a linked pair whose structures match** (spec §10: "Drafting in 'both' languages creates two linked posts").
   - *Pinned by:* Task 3 store tests and Task 6 and Task 7 e2e.

## File map (new unless marked)

```
src/lib/engine/schemas.ts                    (modify) Keyword, Suggestion, UpgradeRequested
src/lib/engine/api.ts                        (modify) keyword, suggestion, drafts and upgrade methods
src/lib/keywords/phrases.ts                  parsePhrases, normalizePhrase, skippedPhrases
src/lib/keywords/tabs.ts                     keyword tabs ↔ statuses, actions per tab
src/lib/engine/mock/keyword-fixtures.ts      seeded keywords and suggestions
src/lib/engine/mock/drafting.ts              the mock "AI": draft text, topic titles, proposals
src/lib/engine/mock/store.ts                 (modify) keywords, suggestions, general job runner, drafts
src/lib/engine/mock/server.ts                (modify) routes, "quota" scenario, upgrade request
src/lib/jobs/poll.ts                         pure job-poll reducer
src/app/api/jobs/[id]/route.ts               GET our job status (session-checked)
src/components/jobs/use-job.ts               polling hook
src/components/jobs/job-tracker.tsx          progress bar + failure
src/components/editor/job-progress.tsx       (modify) uses the job route
src/lib/actions/server.ts                    (modify) permission parameter
src/app/[locale]/(app)/keywords/actions.ts   keyword actions
src/app/[locale]/(app)/ideas/actions.ts      suggestion and new-draft actions
src/app/[locale]/(app)/plan/actions.ts       request upgrade (Admin)
src/components/actions/action-failure.tsx    quota-aware error (Request upgrade / Ask your admin)
src/components/drafting/draft-language-dialog.tsx  language choice + confirm
src/app/[locale]/(app)/keywords/page.tsx     Keywords page
src/components/keywords/*                    tabs, list (server), board, add form, propose
src/app/[locale]/(app)/ideas/page.tsx        Topic ideas page
src/components/ideas/*                       list (server), board, card, new-request form
src/components/shell/nav.ts                  (modify) keywords, ideas
messages/en.json, messages/ar.json           (modify)
tests/unit/*.test.ts, tests/e2e/*.spec.ts
```

---

### Task 1: Engine contract for keywords, suggestions, drafts and upgrade requests

**Files:**
- Modify: `src/lib/engine/schemas.ts`, `src/lib/engine/api.ts`
- Create: `tests/unit/fake-engine.ts`
- Test: `tests/unit/engine-ideas.test.ts` (create)

**Interfaces:**
- Consumes: M2b `parseItems`, `idSegment`, `JobStartSchema`, `BulkResultSchema`, `ChangeContext`
- Produces:
  - **Schemas:**
    - `KeywordSchema` / `type Keyword` (spec §4)
    - `SuggestionSchema` / `type Suggestion` (with `keywords` and `postIds` always arrays)
    - `UpgradeRequestedSchema`
  - **Constants and types:**
    - `KEYWORD_BULK_ACTIONS` / `type KeywordBulkAction` (`approve | dismiss | restore`)
    - `SUGGESTION_BULK_ACTIONS` / `type SuggestionBulkAction` (`draft | dismiss`)
    - `type DraftRequest = { topic; kind; platform; language; tone?; keywords? }`
  - **API methods:**
    - `listKeywords({ statuses, page?, pageSize? }): { keywords; skipped; meta }`
    - `addKeywords(phrases, language, ctx): Keyword[]`
    - `bulkKeywords(action, ids, ctx)`
    - `proposeKeywords(language | undefined, ctx)`, `keywordTopics(ids, ctx)`, `draftKeywordArticles(ids, language, ctx)`
    - `listSuggestions({ statuses }): { suggestions; skipped }`
    - `draftSuggestion(id, language, ctx)`, `dismissSuggestion(id, ctx)`, `bulkSuggestions(action, ids, language | undefined, ctx)`
    - `createDrafts(request, ctx)`
    - `requestUpgrade(metric | undefined, note | undefined, ctx)`
  - **Test helper:** `tests/unit/fake-engine.ts` exports `fakeEngine(routes)`, which records `{ method, path, search, body }`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/fake-engine.ts
import { createEngineApi } from "@/lib/engine/api";
import { createEngineClient, type FetchLike } from "@/lib/engine/client";

export type FakeCall = { method: string; path: string; search: string; body: unknown };

/** A fake engine for API tests: answers by "METHOD /path" (site "site_1"), records what was sent, 404s anything else. */
export function fakeEngine(routes: Record<string, unknown>) {
  const calls: FakeCall[] = [];
  const fetch: FetchLike = async (url, init) => {
    const { pathname, search } = new URL(url);
    const path = pathname.replace("/api/v1", "");
    const method = init.method ?? "GET";
    const body = init.body instanceof FormData ? init.body : typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ method, path, search, body });
    const key = `${method} ${path}`;
    if (key === "GET /sites") return Response.json({ ok: true, data: [{ id: "site_1" }] });
    if (!(key in routes)) return Response.json({ ok: false, error: { code: "not_found", message: key } }, { status: 404 });
    return Response.json({ ok: true, data: routes[key], meta: { page: 1, pageSize: 25, total: 3 } });
  };
  const engine = createEngineApi(createEngineClient({ baseUrl: "https://api.example.com/api/v1", apiKey: "k", fetch, retryDelaysMs: [0, 0] }));
  return { engine, calls };
}
```

```ts
// tests/unit/engine-ideas.test.ts
import { describe, expect, it } from "vitest";
import { fakeEngine } from "./fake-engine";

const ctx = { actingUser: "sara@example.com", idempotencyKey: "key-12345678" };
const KEYWORD = { id: "kw_1", phrase: "commission uae", language: "en", source: "ai", status: "new", createdAt: "2026-10-20T10:00:00+04:00" };
const SUGGESTION = { id: "sg_1", title: "Commission after resignation", kind: "blog", language: "en", status: "new", createdAt: "2026-10-20T10:00:00+04:00" };
const JOB = { jobId: "j_1", status: "queued", postIds: ["p_1"] };
const posts = (calls: { method: string; path: string; body: unknown }[]) => calls.filter((call) => call.method === "POST").map((call) => [call.path, call.body]);

describe("keywords and suggestions (spec v1.1 §7)", () => {
  it("lists keywords and suggestions, skipping items in an unexpected shape", async () => {
    const { engine, calls } = fakeEngine({
      "GET /sites/site_1/keywords": [KEYWORD, { id: 3 }],
      "GET /sites/site_1/suggestions": [SUGGESTION, { title: null }],
    });
    const keywords = await engine.listKeywords({ statuses: ["dismissed", "off_strategy"], page: 2, pageSize: 25 });
    expect([keywords.keywords.map((k) => k.id), keywords.skipped, keywords.meta?.total]).toEqual([["kw_1"], 1, 3]);
    const query = new URLSearchParams(calls.at(-1)?.search);
    expect([query.get("status"), query.get("page"), query.get("pageSize")]).toEqual(["dismissed,off_strategy", "2", "25"]);

    const suggestions = await engine.listSuggestions({ statuses: ["new", "drafting", "drafted"] });
    expect(suggestions.suggestions).toEqual([{ ...SUGGESTION, keywords: [], postIds: [] }]);
    expect(suggestions.skipped).toBe(1);
  });

  it("sends keyword changes and AI jobs", async () => {
    const { engine, calls } = fakeEngine({
      "POST /sites/site_1/keywords": [KEYWORD],
      "POST /sites/site_1/keywords/bulk": { done: ["kw_1"], failed: [] },
      "POST /sites/site_1/keywords/propose": { jobId: "j_2" },
      "POST /sites/site_1/keywords/topics": { jobId: "j_3" },
      "POST /sites/site_1/keywords/draft-articles": JOB,
    });
    expect(await engine.addKeywords(["commission uae"], "en", ctx)).toHaveLength(1);
    await engine.bulkKeywords("approve", ["kw_1"], ctx);
    expect((await engine.proposeKeywords("ar", ctx)).jobId).toBe("j_2");
    await engine.keywordTopics(["kw_1"], ctx);
    expect((await engine.draftKeywordArticles(["kw_1"], "both", ctx)).postIds).toEqual(["p_1"]);
    expect(posts(calls)).toEqual([
      ["/sites/site_1/keywords", { phrases: ["commission uae"], language: "en" }],
      ["/sites/site_1/keywords/bulk", { action: "approve", ids: ["kw_1"] }],
      ["/sites/site_1/keywords/propose", { language: "ar" }],
      ["/sites/site_1/keywords/topics", { ids: ["kw_1"] }],
      ["/sites/site_1/keywords/draft-articles", { ids: ["kw_1"], language: "both" }],
    ]);
  });

  it("sends suggestion changes, new drafts and upgrade requests", async () => {
    const { engine, calls } = fakeEngine({
      "POST /sites/site_1/suggestions/sg_1/draft": JOB,
      "POST /sites/site_1/suggestions/sg_1/dismiss": { ...SUGGESTION, status: "dismissed" },
      "POST /sites/site_1/suggestions/bulk": { done: ["sg_1"], failed: [] },
      "POST /sites/site_1/drafts": JOB,
      "POST /account/upgrade-request": { requested: true },
    });
    await engine.draftSuggestion("sg_1", "ar", ctx);
    expect((await engine.dismissSuggestion("sg_1", ctx)).status).toBe("dismissed");
    await engine.bulkSuggestions("draft", ["sg_1"], "en", ctx);
    await engine.createDrafts({ topic: "Gratuity", kind: "blog", platform: "website", language: "both", keywords: ["gratuity uae"] }, ctx);
    expect(await engine.requestUpgrade("articles", undefined, ctx)).toEqual({ requested: true });
    expect(posts(calls)).toEqual([
      ["/sites/site_1/suggestions/sg_1/draft", { language: "ar" }],
      ["/sites/site_1/suggestions/sg_1/dismiss", {}],
      ["/sites/site_1/suggestions/bulk", { action: "draft", ids: ["sg_1"], language: "en" }],
      ["/sites/site_1/drafts", { topic: "Gratuity", kind: "blog", platform: "website", language: "both", keywords: ["gratuity uae"] }],
      ["/account/upgrade-request", { metric: "articles" }],
    ]);
  });

  it("refuses a suggestion id that would address another endpoint, before any request", async () => {
    const { engine, calls } = fakeEngine({});
    await expect(engine.dismissSuggestion("..", ctx)).rejects.toMatchObject({ code: "not_found" });
    expect(calls).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test tests/unit/engine-ideas.test.ts`

Expected: FAIL. `engine.listKeywords is not a function`.

- [ ] **Step 3: Add the schemas**

In `src/lib/engine/schemas.ts`, after the `DeletedSchema` / `ReleasedSchema` lines at the end, add:

```ts
// ── Keywords and suggestions (spec v1.1 §4 Keyword, Suggestion; §5 status flows) ───
export const KeywordSchema = z.object({
  id: z.string(),
  phrase: z.string(),
  language: z.string(),
  source: z.string(), // known: ai | person | search_console
  status: z.string(), // known: new | approved | covered | dismissed | off_strategy
  rationale: z.string().nullish(),
  uses: z.number().int().nullish(),
  addedBy: z.object({ id: z.string(), name: z.string() }).nullish(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime.nullish(),
});
export type Keyword = z.infer<typeof KeywordSchema>;

export const SuggestionSchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: z.string(),
  language: z.string(),
  keywords: list(z.string()),
  why: z.string().nullish(),
  status: z.string(), // known: new | drafting | drafted | dismissed
  postIds: list(z.string()),
  createdAt: isoDateTime,
});
export type Suggestion = z.output<typeof SuggestionSchema>;

export const UpgradeRequestedSchema = z.object({ requested: z.literal(true) });
```

- [ ] **Step 4: Add the API methods**

In `src/lib/engine/api.ts`:

(a) Add `KeywordSchema`, `SuggestionSchema` and `UpgradeRequestedSchema` to the schema import.

(b) After the `BULK_ACTIONS` / `BulkAction` lines, add:

```ts
/** Keyword bulk actions (spec v1.1 §7 POST …/keywords/bulk). */
export const KEYWORD_BULK_ACTIONS = ["approve", "dismiss", "restore"] as const;
export type KeywordBulkAction = (typeof KEYWORD_BULK_ACTIONS)[number];

/** Suggestion bulk actions (spec v1.1 §7 POST …/suggestions/bulk). */
export const SUGGESTION_BULK_ACTIONS = ["draft", "dismiss"] as const;
export type SuggestionBulkAction = (typeof SUGGESTION_BULK_ACTIONS)[number];

/** A new draft (spec v1.1 §6 "New request", §7 POST …/drafts). `language` is a site language or "both". */
export type DraftRequest = { topic: string; kind: string; platform: string; language: string; tone?: string; keywords?: string[] };
```

(c) Before `const categories = once(`, add:

```ts
  async function listKeywords(options: { statuses: string[]; page?: number; pageSize?: number }) {
    const { data, meta } = await client.request({
      method: "GET",
      path: `${await sitePath()}/keywords`,
      schema: z.array(z.unknown()),
      query: { status: options.statuses.join(","), page: options.page, pageSize: options.pageSize },
    });
    const { items, skipped } = parseItems(data, KeywordSchema);
    return { keywords: items, skipped, meta };
  }

  const addKeywords = async (phrases: string[], language: string, ctx: ChangeContext) =>
    (await client.request({ method: "POST", path: `${await sitePath()}/keywords`, schema: z.array(KeywordSchema), body: { phrases, language }, ...ctx }))
      .data;

  const bulkKeywords = async (action: KeywordBulkAction, ids: string[], ctx: ChangeContext) =>
    (await client.request({ method: "POST", path: `${await sitePath()}/keywords/bulk`, schema: BulkResultSchema, body: { action, ids }, ...ctx })).data;

  const proposeKeywords = async (language: string | undefined, ctx: ChangeContext) =>
    (await client.request({ method: "POST", path: `${await sitePath()}/keywords/propose`, schema: JobStartSchema, body: { language }, ...ctx })).data;

  const keywordTopics = async (ids: string[], ctx: ChangeContext) =>
    (await client.request({ method: "POST", path: `${await sitePath()}/keywords/topics`, schema: JobStartSchema, body: { ids }, ...ctx })).data;

  const draftKeywordArticles = async (ids: string[], language: string, ctx: ChangeContext) =>
    (
      await client.request({
        method: "POST",
        path: `${await sitePath()}/keywords/draft-articles`,
        schema: JobStartSchema,
        body: { ids, language },
        ...ctx,
      })
    ).data;

  async function listSuggestions(options: { statuses: string[] }) {
    const { data } = await client.request({
      method: "GET",
      path: `${await sitePath()}/suggestions`,
      schema: z.array(z.unknown()),
      query: { status: options.statuses.join(",") },
    });
    const { items, skipped } = parseItems(data, SuggestionSchema);
    return { suggestions: items, skipped };
  }

  const suggestionPath = async (id: string, suffix: string) => {
    const segment = idSegment(id);
    return `${await sitePath()}/suggestions/${segment}${suffix}`;
  };

  const draftSuggestion = async (id: string, language: string, ctx: ChangeContext) =>
    (await client.request({ method: "POST", path: await suggestionPath(id, "/draft"), schema: JobStartSchema, body: { language }, ...ctx })).data;

  const dismissSuggestion = async (id: string, ctx: ChangeContext) =>
    (await client.request({ method: "POST", path: await suggestionPath(id, "/dismiss"), schema: SuggestionSchema, body: {}, ...ctx })).data;

  const bulkSuggestions = async (action: SuggestionBulkAction, ids: string[], language: string | undefined, ctx: ChangeContext) =>
    (
      await client.request({
        method: "POST",
        path: `${await sitePath()}/suggestions/bulk`,
        schema: BulkResultSchema,
        body: { action, ids, language },
        ...ctx,
      })
    ).data;

  const createDrafts = async (request: DraftRequest, ctx: ChangeContext) =>
    (await client.request({ method: "POST", path: `${await sitePath()}/drafts`, schema: JobStartSchema, body: request, ...ctx })).data;

  const requestUpgrade = async (metric: string | undefined, note: string | undefined, ctx: ChangeContext) =>
    (await client.request({ method: "POST", path: "/account/upgrade-request", schema: UpgradeRequestedSchema, body: { metric, note }, ...ctx })).data;
```

(d) Add to the returned object, after `exportPost,`:

```ts
    listKeywords,
    addKeywords,
    bulkKeywords,
    proposeKeywords,
    keywordTopics,
    draftKeywordArticles,
    listSuggestions,
    draftSuggestion,
    dismissSuggestion,
    bulkSuggestions,
    createDrafts,
    requestUpgrade,
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test && pnpm typecheck`

Expected: unit PASS (214 + 4 = 218); typecheck exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/engine tests/unit/fake-engine.ts tests/unit/engine-ideas.test.ts
git commit -m "feat: engine contract for keywords, suggestions, new drafts and upgrade requests"
```

---

### Task 2: Mock engine: keywords and topic ideas

**Files:**
- Create: `src/lib/keywords/phrases.ts`, `src/lib/engine/mock/keyword-fixtures.ts`
- Modify: `src/lib/engine/mock/store.ts`, `src/lib/engine/mock/server.ts`
- Test: `tests/unit/mock-ideas.test.ts` (create), `tests/unit/phrases.test.ts` (create)

**Interfaces:**
- Consumes: Task 1 `Keyword`, `Suggestion`; M2 `createMockStore`, `MockOutcome`, `BulkResult`
- Produces:
  - **Phrases:**
    - `normalizePhrase(phrase)`: trimmed, single spaces, lower case
    - `parsePhrases(text): string[]`: comma or line separated; repeats ignoring case are dropped
    - `skippedPhrases(sent, created): string[]`
  - **Seeds:**
    - keywords: `kw_1` … `kw_11`. Statuses: new kw_3, kw_5, kw_6, kw_7 (Arabic); approved kw_1, kw_2, kw_10, kw_11 (Arabic); covered kw_4; dismissed kw_8; off_strategy kw_9.
    - suggestions: `sg_1` … `sg_6`. New sg_1, sg_2, sg_3 (social), sg_4 (Arabic); drafted sg_5 (postIds p_201, p_202); dismissed sg_6.
  - **Store:**
    - `store.listKeywords(statuses, page, pageSize)`
    - `store.addKeywords(phrases, language, actor)` returns only the created keywords, skipping duplicates
    - `store.bulkKeywords(action, ids)`:
      - approve: new → approved
      - dismiss: new or approved → dismissed
      - restore: dismissed or off_strategy → new
    - `store.listSuggestions(statuses)`
    - `store.dismissSuggestion(id)` (new → dismissed)
  - **Mock routes:** `GET|POST …/keywords`, `POST …/keywords/bulk`, `GET …/suggestions`, `POST …/suggestions/{id}/dismiss`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/phrases.test.ts
import { describe, expect, it } from "vitest";
import { normalizePhrase, parsePhrases, skippedPhrases } from "@/lib/keywords/phrases";

describe("keyword phrases (spec v1.1 §6: comma or line separated)", () => {
  it("splits on commas and new lines, tidies spaces and drops repeats ignoring case", () => {
    expect(parsePhrases(" labour court dubai,\nLabour  Court Dubai , مكافأة نهاية الخدمة\n\n,")).toEqual(["labour court dubai", "مكافأة نهاية الخدمة"]);
  });

  it("compares phrases ignoring case and spacing", () => {
    expect(normalizePhrase("  Commission   UAE Labour Law ")).toBe("commission uae labour law");
  });

  it("lists the phrases the engine didn't add (Review Focus 3)", () => {
    expect(skippedPhrases(["laser hair removal", "Commission UAE labour law"], [{ phrase: "laser hair removal" }])).toEqual(["Commission UAE labour law"]);
  });
});
```

```ts
// tests/unit/mock-ideas.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { createMockStore, type MockStore } from "@/lib/engine/mock/store";

const ME = "reviewer@example.com";
let t = Date.parse("2026-10-22T08:00:00Z");
let store: MockStore;

function data<T>(outcome: { ok: boolean; data?: T }): T {
  expect(outcome.ok).toBe(true);
  return (outcome as { data: T }).data;
}

const tab = (statuses: string[]) => data(store.listKeywords(statuses, 1, 25)).items.map((keyword) => keyword.id);

beforeEach(() => {
  t = Date.parse("2026-10-22T08:00:00Z");
  store = createMockStore({ now: () => t, jobDurationMs: 1000 });
});

describe("keywords (spec v1.1 §6 /keywords)", () => {
  it("lists each tab's keywords; off-strategy keywords sit with the dismissed ones", () => {
    expect(tab(["new"])).toEqual(["kw_3", "kw_5", "kw_6", "kw_7"]);
    expect(tab(["approved"])).toEqual(["kw_1", "kw_2", "kw_10", "kw_11"]);
    expect(tab(["covered"])).toEqual(["kw_4"]);
    expect(tab(["dismissed", "off_strategy"])).toEqual(["kw_8", "kw_9"]);
    expect(data(store.listKeywords(["new"], 1, 2)).meta).toEqual({ page: 1, pageSize: 2, total: 4 });
  });

  it("adds new phrases as person-added keywords and skips ones that already exist, ignoring case and spacing (Review Focus 3)", () => {
    const created = data(store.addKeywords(["Laser hair removal dubai", "Commission  UAE labour law", "laser hair removal dubai"], "en", ME));
    expect(created.map((keyword) => [keyword.phrase, keyword.source, keyword.status])).toEqual([["Laser hair removal dubai", "person", "new"]]);
    expect(tab(["new"])).toContain(created[0].id);
  });

  it("refuses a language the site doesn't have", () => {
    expect(store.addKeywords(["x"], "fr", ME)).toMatchObject({ ok: false, status: 400, code: "invalid_input", fields: { language: expect.any(String) } });
  });

  it("approves, dismisses and restores, and names what it couldn't do (Review Focus 4)", () => {
    expect(data(store.bulkKeywords("approve", ["kw_3", "kw_4"]))).toEqual({
      done: ["kw_3"],
      failed: [{ id: "kw_4", code: "invalid_input", message: "Only new keywords can be approved." }],
    });
    expect(data(store.bulkKeywords("dismiss", ["kw_3"])).done).toEqual(["kw_3"]);
    expect(data(store.bulkKeywords("restore", ["kw_3", "kw_9"])).done).toEqual(["kw_3", "kw_9"]);
    expect(tab(["new"])).toEqual(expect.arrayContaining(["kw_3", "kw_9"]));
    expect(store.bulkKeywords("archive", ["kw_3"])).toMatchObject({ ok: false, status: 400 });
  });
});

describe("topic ideas (spec v1.1 §6 /suggestions)", () => {
  it("lists suggestions by status and dismisses a new one", () => {
    const shown = () => data(store.listSuggestions(["new", "drafting", "drafted"])).map((suggestion) => suggestion.id);
    expect(shown()).toEqual(["sg_1", "sg_2", "sg_3", "sg_4", "sg_5"]);
    expect(data(store.dismissSuggestion("sg_2")).status).toBe("dismissed");
    expect(shown()).toEqual(["sg_1", "sg_3", "sg_4", "sg_5"]);
    expect(store.dismissSuggestion("sg_5")).toMatchObject({ ok: false, status: 422 });
  });

  it("links a drafted suggestion to its drafts", () => {
    expect(data(store.listSuggestions(["drafted"]))[0]).toMatchObject({ id: "sg_5", postIds: ["p_201", "p_202"] });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test tests/unit/phrases.test.ts tests/unit/mock-ideas.test.ts`

Expected: FAIL. `@/lib/keywords/phrases` can't be resolved, and `store.listKeywords is not a function`.

- [ ] **Step 3: Add the phrase helpers and the seeds**

```ts
// src/lib/keywords/phrases.ts
/** How two phrases are compared: trimmed, single spaces, lower case ("Labour  Court" is "labour court"). */
export const normalizePhrase = (phrase: string) => phrase.trim().replace(/\s+/g, " ").toLowerCase();

/** "a, b\nc" → ["a", "b", "c"] (spec v1.1 §6: comma or line separated); spaces tidied, empties and repeats dropped. */
export function parsePhrases(text: string): string[] {
  const seen = new Set<string>();
  const phrases: string[] = [];
  for (const part of text.split(/[,\n]/)) {
    const phrase = part.trim().replace(/\s+/g, " ");
    const key = normalizePhrase(phrase);
    if (!phrase || seen.has(key)) continue;
    seen.add(key);
    phrases.push(phrase);
  }
  return phrases;
}

/** The phrases the engine didn't add because they already existed (spec v1.1 §7: duplicates are skipped and listed). */
export function skippedPhrases(sent: string[], created: { phrase: string }[]): string[] {
  const added = new Set(created.map((keyword) => normalizePhrase(keyword.phrase)));
  return sent.filter((phrase) => !added.has(normalizePhrase(phrase)));
}
```

```ts
// src/lib/engine/mock/keyword-fixtures.ts
import type { Keyword, Suggestion } from "../schemas";

const AT = "2026-10-20T10:00:00+04:00";

function keyword(fields: Pick<Keyword, "id" | "phrase" | "language" | "source" | "status"> & Partial<Keyword>): Keyword {
  return { rationale: null, uses: 0, addedBy: null, createdAt: AT, updatedAt: AT, ...fields };
}

function suggestion(fields: Pick<Suggestion, "id" | "title" | "kind" | "language" | "status"> & Partial<Suggestion>): Suggestion {
  return { keywords: [], why: null, postIds: [], createdAt: AT, ...fields };
}

export function seedKeywords(): Keyword[] {
  return [
    keyword({ id: "kw_1", phrase: "commission uae labour law", language: "en", source: "person", status: "approved", uses: 2, addedBy: { id: "u_1", name: "Sara" } }),
    keyword({ id: "kw_2", phrase: "unpaid commission dubai", language: "en", source: "ai", status: "approved", uses: 1, rationale: "People ask how to claim commission after they leave" }),
    keyword({ id: "kw_3", phrase: "end of service gratuity calculator uae", language: "en", source: "ai", status: "new", rationale: "High intent, and no page covers it" }),
    keyword({ id: "kw_4", phrase: "probation period uae labour law", language: "en", source: "ai", status: "covered", uses: 1, rationale: "A published article carries it" }),
    keyword({ id: "kw_5", phrase: "shareholder deadlock uae", language: "en", source: "ai", status: "new", rationale: "Rising searches from SME owners" }),
    keyword({ id: "kw_6", phrase: "eviction notice dubai 12 months", language: "en", source: "ai", status: "new", rationale: "Tenants search this before a renewal" }),
    keyword({ id: "kw_7", phrase: "مكافأة نهاية الخدمة", language: "ar", source: "ai", status: "new", rationale: "The Arabic search for gratuity; no Arabic page covers it" }),
    keyword({ id: "kw_8", phrase: "free zone company liquidation", language: "en", source: "person", status: "dismissed", addedBy: { id: "u_1", name: "Sara" } }),
    keyword({ id: "kw_9", phrase: "crypto tax dubai", language: "en", source: "ai", status: "off_strategy", rationale: "Outside the site's practice areas" }),
    keyword({ id: "kw_10", phrase: "off-plan property escrow dubai", language: "en", source: "ai", status: "approved", rationale: "Buyers search this before they sign" }),
    keyword({ id: "kw_11", phrase: "عقد العمل محدد المدة", language: "ar", source: "person", status: "approved", uses: 1, addedBy: { id: "u_2", name: "Omar" } }),
  ];
}

export function seedSuggestions(): Suggestion[] {
  return [
    suggestion({
      id: "sg_1",
      title: "End-of-service gratuity: how to work out what you're owed",
      kind: "blog",
      language: "en",
      status: "new",
      keywords: ["end of service gratuity calculator uae"],
      why: "Keyword proposed, not covered yet",
    }),
    suggestion({
      id: "sg_2",
      title: "What a shareholders' agreement should say about deadlock",
      kind: "blog",
      language: "en",
      status: "new",
      keywords: ["shareholder deadlock uae"],
      why: "Rising searches, and no page covers it",
    }),
    suggestion({
      id: "sg_3",
      title: "Three checks before you renew a Dubai lease",
      kind: "social",
      language: "en",
      status: "new",
      keywords: ["eviction notice dubai 12 months"],
      why: "Short practical tips do well on LinkedIn",
    }),
    suggestion({
      id: "sg_4",
      title: "كيف تُحسب مكافأة نهاية الخدمة؟",
      kind: "blog",
      language: "ar",
      status: "new",
      keywords: ["مكافأة نهاية الخدمة"],
      why: "Arabic keyword, not covered yet",
    }),
    suggestion({
      id: "sg_5",
      title: "When does a commission become payable under UAE Labour Law?",
      kind: "blog",
      language: "en",
      status: "drafted",
      keywords: ["commission uae labour law"],
      why: "Keyword approved, not covered yet",
      postIds: ["p_201", "p_202"],
    }),
    suggestion({
      id: "sg_6",
      title: "Crypto tax in Dubai",
      kind: "blog",
      language: "en",
      status: "dismissed",
      keywords: ["crypto tax dubai"],
      why: "Outside the site's strategy",
    }),
  ];
}
```

- [ ] **Step 4: Add keywords and suggestions to the store**

In `src/lib/engine/mock/store.ts`:

(a) Add the imports:

```ts
import { normalizePhrase } from "@/lib/keywords/phrases";
import { seedKeywords, seedSuggestions } from "./keyword-fixtures";
```

and add `Keyword` and `Suggestion` to the `../schemas` type import.

(b) After `const photoCache = new Map<number, Photo>();`, add:

```ts
  const keywords = new Map<string, Keyword>();
  const suggestions = new Map<string, Suggestion>();
  const siteLanguages = mockMeta().languages;
  let keywordSequence = 100;
```

(c) Before `function bulk(`, add:

```ts
  function listKeywords(statuses: string[] | null, page: number, pageSize: number) {
    tick();
    const all = [...keywords.values()].filter((keyword) => !statuses || statuses.includes(keyword.status));
    const start = (page - 1) * pageSize;
    return ok({ items: structuredClone(all.slice(start, start + pageSize)), meta: { page, pageSize, total: all.length } });
  }

  /** POST …/keywords: adds each phrase that isn't already a keyword in that language; returns only what it added. */
  function addKeywords(phrases: unknown, language: unknown, actor: string): MockOutcome<Keyword[]> {
    if (!Array.isArray(phrases) || phrases.length === 0 || phrases.length > 50) {
      return fail(400, "invalid_input", "Add between 1 and 50 keywords at a time.", { fields: { phrases: "Required" } });
    }
    if (typeof language !== "string" || !siteLanguages.includes(language)) {
      return fail(400, "invalid_input", "Choose one of the site's languages.", { fields: { language: "Unknown language" } });
    }
    const existing = new Set([...keywords.values()].filter((keyword) => keyword.language === language).map((keyword) => normalizePhrase(keyword.phrase)));
    const created: Keyword[] = [];
    for (const raw of phrases) {
      if (typeof raw !== "string") continue;
      const phrase = raw.trim().replace(/\s+/g, " ");
      const key = normalizePhrase(phrase);
      if (!phrase || phrase.length > 100 || existing.has(key)) continue;
      existing.add(key);
      const at = iso(now());
      const keyword: Keyword = {
        id: `kw_${++keywordSequence}`,
        phrase,
        language,
        source: "person",
        status: "new",
        rationale: null,
        uses: 0,
        addedBy: { id: actor, name: actor },
        createdAt: at,
        updatedAt: at,
      };
      keywords.set(keyword.id, keyword);
      created.push(structuredClone(keyword));
    }
    return ok(created);
  }

  const KEYWORD_MOVES: Record<string, { from: string[]; to: string; refusal: string }> = {
    approve: { from: ["new"], to: "approved", refusal: "Only new keywords can be approved." },
    dismiss: { from: ["new", "approved"], to: "dismissed", refusal: "Only new or in-use keywords can be dismissed." },
    restore: { from: ["dismissed", "off_strategy"], to: "new", refusal: "Only dismissed keywords can be restored." },
  };

  /** POST …/keywords/bulk (spec v1.1 §5 Keyword flow). */
  function bulkKeywords(action: string, ids: string[]): MockOutcome<BulkResult> {
    const move = Object.hasOwn(KEYWORD_MOVES, action) ? KEYWORD_MOVES[action] : undefined;
    if (!move) return fail(400, "invalid_input", `Unknown keyword action: ${action}.`, { fields: { action: "Unknown" } });
    const result: BulkResult = { done: [], failed: [] };
    for (const id of ids) {
      const keyword = keywords.get(id);
      if (!keyword) {
        result.failed.push({ id, code: "not_found", message: "This keyword no longer exists." });
      } else if (!move.from.includes(keyword.status)) {
        result.failed.push({ id, code: "invalid_input", message: move.refusal });
      } else {
        keyword.status = move.to;
        keyword.updatedAt = iso(now());
        result.done.push(id);
      }
    }
    return ok(result);
  }

  function listSuggestions(statuses: string[] | null): MockOutcome<Suggestion[]> {
    tick();
    return ok(structuredClone([...suggestions.values()].filter((suggestion) => !statuses || statuses.includes(suggestion.status))));
  }

  function dismissSuggestion(id: string): MockOutcome<Suggestion> {
    const suggestion = suggestions.get(id);
    if (!suggestion) return fail(404, "not_found", "This topic idea no longer exists.");
    if (suggestion.status !== "new") return fail(422, "invalid_input", "Only new topic ideas can be dismissed.");
    suggestion.status = "dismissed";
    return ok(structuredClone(suggestion));
  }
```

(d) After `for (const id of SEED_FAILING_PUBLISH) failNextPublish.add(id);`, add:

```ts
  for (const seeded of seedKeywords()) keywords.set(seeded.id, seeded);
  for (const seeded of seedSuggestions()) suggestions.set(seeded.id, seeded);
```

(e) Add `listKeywords, addKeywords, bulkKeywords, listSuggestions, dismissSuggestion,` to the returned object.

- [ ] **Step 5: Route keywords and suggestions in the mock server**

In `src/lib/engine/mock/server.ts`, inside `route`, before the `if (rest === "/posts" && method === "GET") {` line, add:

```ts
  const statusesOf = () => url.searchParams.get("status")?.split(",").filter(Boolean) ?? null;
  const idsOf = (value: unknown) => (Array.isArray(value) ? value.map(String) : []);

  if (rest === "/keywords" && method === "GET") {
    const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize")) || 25));
    const listed = store.listKeywords(statusesOf(), page, pageSize);
    return listed.ok ? { status: 200, json: { ok: true, data: listed.data.items, meta: listed.data.meta } } : outcome(listed);
  }
  if (rest === "/keywords" && method === "POST") return outcome(store.addKeywords(body.phrases, body.language, actor));
  if (rest === "/keywords/bulk" && method === "POST") return outcome(store.bulkKeywords(String(body.action ?? ""), idsOf(body.ids)));
  if (rest === "/suggestions" && method === "GET") return outcome(store.listSuggestions(statusesOf()));

  const suggestionRoute = /^\/suggestions\/([^/]+)(\/.*)?$/.exec(rest);
  if (suggestionRoute && suggestionRoute[1] !== "bulk") {
    const id = decodeURIComponent(suggestionRoute[1]);
    if (suggestionRoute[2] === "/dismiss" && method === "POST") return outcome(store.dismissSuggestion(id));
  }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test && pnpm typecheck && pnpm lint`

Expected: unit PASS (218 + 3 + 6 = 227); typecheck and lint exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/lib tests/unit
git commit -m "feat: mock engine keywords and topic ideas with tabs, adding, bulk moves and dismissing"
```

---
### Task 3: Mock engine: AI jobs (proposals, topics, drafts), the quota scenario and upgrade requests

**Files:**
- Create: `src/lib/engine/mock/drafting.ts`
- Modify: `src/lib/engine/mock/store.ts`, `src/lib/engine/mock/server.ts`, `tests/e2e/helpers.ts`
- Test: `tests/unit/mock-ideas.test.ts` (append), `tests/unit/engine-posts.test.ts` (append)

**Interfaces:**
- Consumes: Task 2 keywords, suggestions and `normalizePhrase`; M2a `requestChanges` redraft; M2 `refreshFindings`, `touch`
- Produces:
  - **Job runner:** a general `startJob(complete)`. A job finishes lazily `jobDurationMs` after it starts; its `result` is what `complete()` returned. Redrafts use it too.
  - **AI jobs:**
    - `store.proposeKeywords(language?)` → `{jobId}`; when done, up to 3 new AI keywords per language (`PROPOSALS`)
    - `store.keywordTopics(ids)` → `{jobId}`; when done, one new suggestion per keyword: "What to know about {phrase}"
  - **Drafting** (all create `drafting` posts at once and make them `pending` when done):
    - `store.draftKeywordArticles(ids, language, actor)` → `{jobId, postIds}`: one article per keyword; "both" makes a linked pair whose structures match; each keyword's `uses` goes up by 1
    - `store.draftSuggestion(id, language, actor)`: the suggestion becomes `drafting` with `postIds`, then `drafted`
    - `store.bulkSuggestions(action, ids, language, actor)`, with action `draft` or `dismiss`
    - `store.createDrafts(body, actor)`: checks the request the way the engine would (`fields` for topic, kind, platform, language)
  - **Mock scenario `quota`:**
    - every drafting route answers 429 `quota_exceeded` with `details: {metric: "articles", used: 40, limit: 40}`
    - `/account/plan` shows articles at 40/40
  - **Upgrade:** `POST /account/upgrade-request` → `{requested: true}`

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/mock-ideas.test.ts`:

```ts
describe("AI jobs (spec v1.1 §2: drafting is async)", () => {
  const finish = () => {
    t += 1000;
  };

  it("proposes keywords that appear in the New tab once the job is done", () => {
    const { jobId } = data(store.proposeKeywords("en"));
    expect(data(store.job(jobId)).status).not.toBe("done");
    finish();
    expect(data(store.job(jobId)).status).toBe("done");
    expect(data(store.listKeywords(["new"], 1, 25)).items.map((keyword) => keyword.phrase)).toEqual(
      expect.arrayContaining(["labour court claims dubai", "non-compete clause uae"]),
    );
  });

  it("proposes a topic idea per keyword, but not for dismissed keywords", () => {
    const { jobId } = data(store.keywordTopics(["kw_5"]));
    finish();
    expect((data(store.job(jobId)).result as { suggestionIds: string[] }).suggestionIds).toHaveLength(1);
    expect(data(store.listSuggestions(["new"])).at(-1)).toMatchObject({
      title: "What to know about shareholder deadlock uae",
      keywords: ["shareholder deadlock uae"],
    });
    expect(store.keywordTopics(["kw_8"])).toMatchObject({ ok: false, status: 422 });
  });

  it("drafts one article per keyword; both languages make a linked pair whose structures match (Review Focus 5)", () => {
    const started = data(store.draftKeywordArticles(["kw_3"], "both", ME));
    expect(started.postIds).toHaveLength(2);
    const [en, ar] = started.postIds.map((id) => data(store.getPost(id)));
    expect([en.status, ar.status, en.pairId, ar.pairId, en.language, ar.language]).toEqual(["drafting", "drafting", ar.id, en.id, "en", "ar"]);
    finish();
    const done = started.postIds.map((id) => data(store.getPost(id)));
    expect(done.map((post) => post.status)).toEqual(["pending", "pending"]);
    expect(done[1].findings.some((finding) => finding.code === "structure_mismatch")).toBe(false);
    expect(data(store.listKeywords(["new"], 1, 25)).items.find((keyword) => keyword.id === "kw_3")?.uses).toBe(1);
  });

  it("drafts a topic idea: drafting with links to its drafts, then drafted", () => {
    const started = data(store.draftSuggestion("sg_1", "en", ME));
    expect(data(store.listSuggestions(["drafting"]))).toMatchObject([{ id: "sg_1", postIds: started.postIds }]);
    finish();
    expect(data(store.listSuggestions(["drafted"])).map((suggestion) => suggestion.id)).toContain("sg_1");
    expect(data(store.getPost(started.postIds[0]))).toMatchObject({
      status: "pending",
      title: "End-of-service gratuity: how to work out what you're owed",
    });
  });

  it("bulk drafts and dismisses topic ideas, naming what it couldn't do (Review Focus 4)", () => {
    expect(data(store.bulkSuggestions("draft", ["sg_2", "sg_5"], "en", ME))).toEqual({
      done: ["sg_2"],
      failed: [{ id: "sg_5", code: "invalid_input", message: "Only new topic ideas can be drafted." }],
    });
    expect(data(store.bulkSuggestions("dismiss", ["sg_3"], undefined, ME)).done).toEqual(["sg_3"]);
  });

  it("checks a new draft request the way the engine would", () => {
    expect(store.createDrafts({ topic: "", kind: "blog", platform: "linkedin", language: "fr" }, ME)).toMatchObject({
      ok: false,
      status: 400,
      fields: { topic: expect.any(String), platform: expect.any(String), language: expect.any(String) },
    });
    const started = data(store.createDrafts({ topic: "Gratuity for part-time staff", kind: "social", platform: "linkedin", language: "en" }, ME));
    expect(data(store.getPost(started.postIds[0]))).toMatchObject({ kind: "social", platform: "linkedin", status: "drafting" });
  });
});
```

Append to `tests/unit/engine-posts.test.ts`:

```ts
describe("the quota scenario over the mock engine (design §9 429)", () => {
  it("refuses drafting with 429 quota_exceeded, still lets dismissing through, and accepts an upgrade request", async () => {
    const quotaFetch = createMockFetch({ baseUrl: BASE, apiKey: "mock-key", scenario: "quota", store: createMockStore() });
    const engine = createEngineApi(createEngineClient({ baseUrl: BASE, apiKey: "mock-key", retryDelaysMs: [0, 0], fetch: quotaFetch }));
    expect(await failure(engine.draftKeywordArticles(["kw_3"], "en", ctx()))).toMatchObject({
      status: 429,
      code: "quota_exceeded",
      details: { metric: "articles", used: 40, limit: 40 },
    });
    expect((await failure(engine.createDrafts({ topic: "Gratuity", kind: "blog", platform: "website", language: "en" }, ctx()))).code).toBe("quota_exceeded");
    expect((await failure(engine.draftSuggestion("sg_1", "en", ctx()))).code).toBe("quota_exceeded");
    expect((await engine.bulkSuggestions("dismiss", ["sg_3"], undefined, ctx())).done).toEqual(["sg_3"]);
    expect((await engine.plan()).quotas.find((quota) => quota.metric === "articles")).toMatchObject({ used: 40, limit: 40 });
    await expect(engine.requestUpgrade("articles", undefined, ctx())).resolves.toEqual({ requested: true });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test tests/unit/mock-ideas.test.ts tests/unit/engine-posts.test.ts`

Expected: FAIL.
- `store.proposeKeywords is not a function`
- the quota test gets 404 "No mock route", because `"quota"` isn't a scenario yet

- [ ] **Step 3: Add the mock "AI" text**

```ts
// src/lib/engine/mock/drafting.ts
function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

/** A draft's title from a keyword: "Shareholder deadlock uae: what you need to know". */
export function topicFor(phrase: string, language: string): string {
  if (language === "ar") return `${phrase}: ما تحتاج إلى معرفته`;
  return `${phrase.charAt(0).toUpperCase()}${phrase.slice(1)}: what you need to know`;
}

/** A topic idea from a keyword (POST …/keywords/topics). */
export function ideaTitleFor(phrase: string, language: string): string {
  return language === "ar" ? `ما يجب معرفته عن ${phrase}` : `What to know about ${phrase}`;
}

/** Keywords the mock "AI" proposes, per language. */
export const PROPOSALS: Record<string, string[]> = {
  en: ["labour court claims dubai", "wrongful termination compensation uae", "non-compete clause uae"],
  ar: ["دعوى عمالية في دبي", "تعويض الفصل التعسفي", "شرط عدم المنافسة"],
};

/**
 * The mock "AI" text. English and Arabic articles have the same structure (h2, p, h2, p), so a pair drafted in
 * both languages always matches (spec v1.1 §11).
 */
export function draftedContent(topic: string, kind: string, language: string): string {
  const arabic = language === "ar";
  if (kind !== "blog") return arabic ? `${topic}: ثلاث نقاط للتحقق منها قبل أن تتصرف.` : `${topic}: three things to check before you act.`;
  const title = escapeHtml(topic);
  return arabic
    ? `<h2>${title}</h2><p>تشرح هذه المسودة الموضوع بلغة واضحة مع النصوص القانونية التي يستند إليها.</p><h2>الخطوات التالية</h2><p>تحدّث إلى مستشار قبل أن تتخذ أي إجراء.</p>`
    : `<h2>${title}</h2><p>This draft explains the topic in plain language, with the law it relies on.</p><h2>What to do next</h2><p>Speak to an adviser before you act on it.</p>`;
}
```

- [ ] **Step 4: Add the job runner and the AI jobs to the store**

In `src/lib/engine/mock/store.ts`:

(a) Add `import { draftedContent, ideaTitleFor, PROPOSALS, topicFor } from "./drafting";`.

(b) Replace the `MockJob` type with:

```ts
/** A slow AI job: it finishes lazily `durationMs` after it starts, and `complete()` applies its effect and gives its result. */
type MockJob = { id: string; startedAt: number; durationMs: number; done: boolean; result: unknown; complete: () => unknown };
type DraftInput = { topic: string; kind: string; platform: string; language: string; keywords: string[] };
```

(c) Replace `tick` with the runner and the redraft:

```ts
  /** Jobs finish lazily: every read or change first completes the jobs whose time is up. */
  function tick(): void {
    for (const job of jobs.values()) {
      if (job.done || now() - job.startedAt < job.durationMs) continue;
      job.done = true;
      job.result = job.complete();
    }
  }

  function startJob(complete: () => unknown): string {
    const id = `j_${++sequence}`;
    jobs.set(id, { id, startedAt: now(), durationMs: jobDurationMs, done: false, result: null, complete });
    return id;
  }

  /** "Ask for changes" finished: the note is answered in the text and the post comes back for review. */
  function redraft(postId: string, note: string): { postIds: string[] } {
    const post = posts.get(postId);
    if (post?.status === "drafting") {
      post.status = "pending";
      post.reviewNote = note;
      post.content = `${post.content ?? ""}<p>${escapeHtml(`Revised as requested: ${note}`)}</p>`;
      touch(post);
      refreshFindings(post);
      const twin = twinOf(post);
      if (twin) refreshFindings(twin);
    }
    return { postIds: [postId] };
  }
```

(d) In `requestChanges`, replace the two lines `const jobId = \`j_${++sequence}\`;` and `jobs.set(jobId, { … });` with:

```ts
    const jobId = startJob(() => redraft(id, note.trim()));
```

(e) In `job`, change `result: found.done ? { postIds: [found.postId] } : null,` to `result: found.done ? found.result : null,`.

(f) Replace the seeded drafting job (`jobs.set("j_seed", { … });`) with:

```ts
  jobs.set("j_seed", { id: "j_seed", startedAt: now(), durationMs: Number.POSITIVE_INFINITY, done: false, result: null, complete: () => null });
```

(g) After `let keywordSequence = 100;`, add `let suggestionSequence = 100;` and `let postSequence = 600;`.

(h) After `dismissSuggestion`, add:

```ts
  const isDraftLanguage = (value: unknown): value is string => typeof value === "string" && (value === "both" || siteLanguages.includes(value));

  function draftPost(input: DraftInput, actor: string): Post {
    const at = iso(now());
    return {
      id: `p_${++postSequence}`,
      kind: input.kind,
      platform: input.platform,
      origin: "ai",
      language: input.language,
      status: "drafting",
      topic: input.topic,
      title: input.topic,
      keywords: input.keywords,
      content: null,
      hashtags: input.kind === "social" ? ["#UAELaw"] : [],
      sources: [],
      linkSuggestions: [],
      findings: [],
      actions: [],
      requestedBy: actor,
      createdAt: at,
      updatedAt: at,
      version: 1,
    };
  }

  /**
   * New drafts are "drafting" posts at once and come back "pending" when their job is done (spec v1.1 §2, §5).
   * "both" drafts a linked English–Arabic pair (spec v1.1 §10).
   */
  function startDrafts(inputs: DraftInput[], actor: string, onDone: () => void = () => {}) {
    const created: Post[] = [];
    for (const input of inputs) {
      const group = (input.language === "both" ? siteLanguages : [input.language]).map((language) => draftPost({ ...input, language }, actor));
      if (group.length === 2) {
        group[0].pairId = group[1].id;
        group[1].pairId = group[0].id;
      }
      created.push(...group);
    }
    for (const post of created) posts.set(post.id, post);
    const postIds = created.map((post) => post.id);
    const jobId = startJob(() => {
      for (const id of postIds) {
        const post = posts.get(id);
        if (!post || post.status !== "drafting") continue;
        post.status = "pending";
        post.content = draftedContent(post.title, post.kind, post.language);
        touch(post);
      }
      for (const id of postIds) {
        const post = posts.get(id);
        if (post) refreshFindings(post);
      }
      onDone();
      return { postIds };
    });
    return ok({ jobId, status: "queued", postIds }, 202);
  }

  /** Checks a draft request the way the engine would (spec v1.1 §7 POST …/drafts). */
  function draftRefusal(input: Record<string, unknown>): MockFail | null {
    const meta = mockMeta();
    const fields: Record<string, string> = {};
    if (typeof input.topic !== "string" || !input.topic.trim() || input.topic.length > 200) fields.topic = "Write a topic of up to 200 characters.";
    if (typeof input.kind !== "string" || !meta.kinds.includes(input.kind)) fields.kind = "Choose a type.";
    if (typeof input.platform !== "string" || !meta.platforms.includes(input.platform)) fields.platform = "Choose a platform.";
    else if (input.kind === "blog" && input.platform !== "website") fields.platform = "Articles go to the website.";
    else if (input.kind === "social" && input.platform === "website") fields.platform = "Social posts go to a social platform.";
    if (!isDraftLanguage(input.language)) fields.language = "Choose a language, or both.";
    return Object.keys(fields).length > 0 ? fail(400, "invalid_input", "Some fields aren't valid.", { fields }) : null;
  }

  function createDrafts(body: Record<string, unknown>, actor: string) {
    const refusal = draftRefusal(body);
    if (refusal) return refusal;
    const given = Array.isArray(body.keywords) ? body.keywords.map(String).filter(Boolean) : [];
    // No keywords given: the engine proposes them (spec v1.1 §6); the mock takes the first keyword in use.
    const proposed = [...keywords.values()].filter((keyword) => keyword.status === "approved").slice(0, 1).map((keyword) => keyword.phrase);
    const input = { topic: String(body.topic).trim(), kind: String(body.kind), platform: String(body.platform), language: String(body.language) };
    return startDrafts([{ ...input, keywords: given.length > 0 ? given : proposed }], actor);
  }

  function proposeKeywords(language: unknown) {
    if (language !== undefined && (typeof language !== "string" || !siteLanguages.includes(language))) {
      return fail(400, "invalid_input", "Choose one of the site's languages.", { fields: { language: "Unknown language" } });
    }
    const languages = typeof language === "string" ? [language] : siteLanguages;
    const jobId = startJob(() => {
      const keywordIds: string[] = [];
      for (const lang of languages) {
        const known = new Set([...keywords.values()].filter((keyword) => keyword.language === lang).map((keyword) => normalizePhrase(keyword.phrase)));
        for (const phrase of PROPOSALS[lang] ?? []) {
          if (known.has(normalizePhrase(phrase))) continue;
          const at = iso(now());
          const keyword: Keyword = {
            id: `kw_${++keywordSequence}`,
            phrase,
            language: lang,
            source: "ai",
            status: "new",
            rationale: "Proposed from the site's profile and searches",
            uses: 0,
            addedBy: null,
            createdAt: at,
            updatedAt: at,
          };
          keywords.set(keyword.id, keyword);
          keywordIds.push(keyword.id);
        }
      }
      return { keywordIds };
    });
    return ok({ jobId, status: "queued", postIds: [] as string[] }, 202);
  }

  /** Keywords that can feed topics and drafts: anything not dismissed or off strategy, and not already covered for drafts. */
  function usableKeywords(ids: string[], statuses: string[]): Keyword[] | null {
    const chosen = ids.map((id) => keywords.get(id));
    return ids.length > 0 && chosen.every((keyword) => keyword && statuses.includes(keyword.status)) ? (chosen as Keyword[]) : null;
  }

  function keywordTopics(ids: string[]) {
    const chosen = usableKeywords(ids, ["new", "approved", "covered"]);
    if (!chosen) return fail(422, "invalid_input", "Topics can be proposed only for keywords that aren't dismissed.");
    const sources = chosen.map((keyword) => ({ phrase: keyword.phrase, language: keyword.language }));
    const jobId = startJob(() => {
      const suggestionIds = sources.map(({ phrase, language }) => {
        const suggestion: Suggestion = {
          id: `sg_${++suggestionSequence}`,
          title: ideaTitleFor(phrase, language),
          kind: "blog",
          language,
          keywords: [phrase],
          why: `Proposed from the keyword “${phrase}”`,
          status: "new",
          postIds: [],
          createdAt: iso(now()),
        };
        suggestions.set(suggestion.id, suggestion);
        return suggestion.id;
      });
      return { suggestionIds };
    });
    return ok({ jobId, status: "queued", postIds: [] as string[] }, 202);
  }

  function draftKeywordArticles(ids: string[], language: unknown, actor: string) {
    if (!isDraftLanguage(language)) return fail(400, "invalid_input", "Choose a language, or both.", { fields: { language: "Unknown language" } });
    const chosen = usableKeywords(ids, ["new", "approved"]);
    if (!chosen) return fail(422, "invalid_input", "Articles can be drafted only from new or in-use keywords.");
    const inputs = chosen.map((keyword) => {
      keyword.uses = (keyword.uses ?? 0) + 1;
      const topicLanguage = language === "both" ? keyword.language : language;
      return { topic: topicFor(keyword.phrase, topicLanguage), kind: "blog", platform: "website", language, keywords: [keyword.phrase] };
    });
    return startDrafts(inputs, actor);
  }

  function draftSuggestion(id: string, language: unknown, actor: string) {
    const suggestion = suggestions.get(id);
    if (!suggestion) return fail(404, "not_found", "This topic idea no longer exists.");
    if (suggestion.status !== "new") return fail(422, "invalid_input", "Only new topic ideas can be drafted.");
    if (!isDraftLanguage(language)) return fail(400, "invalid_input", "Choose a language, or both.", { fields: { language: "Unknown language" } });
    const platform = suggestion.kind === "blog" ? "website" : "linkedin";
    const started = startDrafts([{ topic: suggestion.title, kind: suggestion.kind, platform, language, keywords: suggestion.keywords }], actor, () => {
      suggestion.status = "drafted";
    });
    if (started.ok) {
      suggestion.status = "drafting";
      suggestion.postIds = started.data.postIds;
    }
    return started;
  }

  function bulkSuggestions(action: string, ids: string[], language: unknown, actor: string): MockOutcome<BulkResult> {
    const handlers: Record<string, (id: string) => MockOutcome<unknown>> = {
      draft: (id) => draftSuggestion(id, language, actor),
      dismiss: (id) => dismissSuggestion(id),
    };
    const apply = Object.hasOwn(handlers, action) ? handlers[action] : undefined;
    if (!apply) return fail(400, "invalid_input", `Unknown topic idea action: ${action}.`, { fields: { action: "Unknown" } });
    const result: BulkResult = { done: [], failed: [] };
    for (const id of ids) {
      const outcome = apply(id);
      if (outcome.ok) result.done.push(id);
      else result.failed.push({ id, code: outcome.code, message: outcome.message });
    }
    return ok(result);
  }
```

(i) Add `proposeKeywords, keywordTopics, draftKeywordArticles, draftSuggestion, bulkSuggestions, createDrafts,` to the returned object.

- [ ] **Step 5: Route the AI jobs, the quota scenario and upgrade requests**

In `src/lib/engine/mock/server.ts`:

(a) Extend the scenarios:

```ts
/**
 * normal · unauthorized (revoked key) · down (unreachable) · drift (changed shapes) · manual (auto-publish off)
 * · crash (a non-engine error) · quota (the monthly article limit is reached).
 */
export type MockScenario = "normal" | "unauthorized" | "down" | "drift" | "manual" | "crash" | "quota";
const MOCK_SCENARIOS: readonly MockScenario[] = ["normal", "unauthorized", "down", "drift", "manual", "crash", "quota"];
```

(b) Above `function route(`, add:

```ts
/** Requests that draft with AI, refused with 429 in the "quota" scenario (design §9). */
const DRAFTING_ROUTE = /^\/(keywords\/draft-articles|drafts|suggestions\/bulk|suggestions\/[^/]+\/draft)$/;

const QUOTA_EXCEEDED: Reply = {
  status: 429,
  json: { ok: false, error: { code: "quota_exceeded", message: "Monthly limit reached for articles.", details: { metric: "articles", used: 40, limit: 40 } } },
};

/** The plan as it looks when the article limit is reached. */
function planAtLimit() {
  const plan = mockPlan();
  return { ...plan, quotas: plan.quotas.map((quota) => (quota.metric === "articles" && quota.limit !== null ? { ...quota, used: quota.limit } : quota)) };
}
```

(c) In `route`, replace `if (method === "GET" && path === "/account/plan") return ok(mockPlan());` with:

```ts
  if (method === "GET" && path === "/account/plan") return ok(scenario === "quota" ? planAtLimit() : mockPlan());
  if (method === "POST" && path === "/account/upgrade-request") return ok({ requested: true });
```

(d) After the line `if (rest === "/suggestions" && method === "GET") return outcome(store.listSuggestions(statusesOf()));`, add:

```ts
  const draftingRequest = method === "POST" && DRAFTING_ROUTE.test(rest) && !(rest === "/suggestions/bulk" && body.action !== "draft");
  if (scenario === "quota" && draftingRequest) return QUOTA_EXCEEDED;
  if (rest === "/keywords/propose" && method === "POST") return outcome(store.proposeKeywords(body.language));
  if (rest === "/keywords/topics" && method === "POST") return outcome(store.keywordTopics(idsOf(body.ids)));
  if (rest === "/keywords/draft-articles" && method === "POST") return outcome(store.draftKeywordArticles(idsOf(body.ids), body.language, actor));
  if (rest === "/suggestions/bulk" && method === "POST") return outcome(store.bulkSuggestions(String(body.action ?? ""), idsOf(body.ids), body.language, actor));
  if (rest === "/drafts" && method === "POST") return outcome(store.createDrafts(body, actor));
```

(e) Inside the `suggestionRoute` block, add after the `/dismiss` line:

```ts
    if (suggestionRoute[2] === "/draft" && method === "POST") return outcome(store.draftSuggestion(id, body.language, actor));
```

(f) In `tests/e2e/helpers.ts`, add `| "quota"` to the `setMockScenario` scenario type.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm e2e`

Expected:
- **unit:** PASS, 227 + 7 = 234
- **typecheck and lint:** exit 0
- **e2e:** PASS (76). The redraft e2e still finishes through the new job runner.

- [ ] **Step 7: Commit**

```bash
git add src/lib/engine tests
git commit -m "feat: mock engine AI jobs for keyword proposals, topics and drafts, a quota scenario and upgrade requests"
```

---

### Task 4: Slow-job progress through our own `/api/jobs/[id]`

**Files:**
- Create:
  - `src/lib/jobs/poll.ts`, `src/app/api/jobs/[id]/route.ts`
  - `src/components/jobs/use-job.ts`, `src/components/jobs/job-tracker.tsx`
- Modify:
  - `src/components/editor/job-progress.tsx`, `src/components/editor/action-bar.tsx`
  - `messages/en.json`, `messages/ar.json`
- Test: `tests/unit/job-poll.test.ts` (create), `tests/unit/jobs-route.test.ts` (create)

**Interfaces:**
- Consumes: M1 `getSession`, `can`, `getEngine`, `tryEngine`, `ENGINE_ID`; Task 3 jobs with `result`
- Produces:
  - **Reducer:** `type JobPoll = { status: "running" | "done" | "failed"; progress; message: string | null; misses; result }`, with `JOB_STARTED`, `MISSES_BEFORE_WARNING` and `afterPoll(state, answer | null)`
  - **Route:** `GET /api/jobs/[id]` → `ActionResult<Job>` JSON with `Cache-Control: no-store`
    - 401 `signed_out` without a role allowed `content.work`
    - 404 for a malformed id
  - **Client:**
    - `useJob(jobId, pollSeconds, onDone?)`
    - `<JobTracker jobId pollSeconds label testId? onDone? />` (`data-state` = running | done | failed)
    - `<JobProgress jobId pollSeconds onDone />`: the editor's redraft progress, now on the route; test id `job-progress` unchanged

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/job-poll.test.ts
import { describe, expect, it } from "vitest";
import { afterPoll, JOB_STARTED, MISSES_BEFORE_WARNING } from "@/lib/jobs/poll";

const job = (status: string, extra: Record<string, unknown> = {}) => ({ ok: true as const, data: { id: "j_1", status, ...extra } });
const failure = (code: string, message = "x") => ({ ok: false as const, error: { status: 404, code, message } });

describe("following a slow AI job (design §8; Review Focus 2)", () => {
  it("shows progress, then done with the job's result", () => {
    const running = afterPoll(JOB_STARTED, job("running", { progress: 0.4 }));
    expect(running).toMatchObject({ status: "running", progress: 0.4 });
    expect(afterPoll(running, job("done", { progress: 1, result: { postIds: ["p_1"] } }))).toMatchObject({ status: "done", result: { postIds: ["p_1"] } });
  });

  it("stops on a failed job with the engine's words", () => {
    expect(afterPoll(JOB_STARTED, job("failed", { error: "The model timed out." }))).toMatchObject({ status: "failed", message: "The model timed out." });
    expect(afterPoll(JOB_STARTED, job("failed"))).toMatchObject({ status: "failed", message: "jobFailed" });
  });

  it("stops when the job is gone or the session has ended, since asking again can't help", () => {
    expect(afterPoll(JOB_STARTED, failure("not_found", "No such job."))).toMatchObject({ status: "failed", message: "No such job." });
    expect(afterPoll(JOB_STARTED, failure("signed_out"))).toMatchObject({ status: "failed", message: "signedOut" });
  });

  it("keeps going through network blips and says so only after a few in a row", () => {
    let state = JOB_STARTED;
    for (let miss = 1; miss < MISSES_BEFORE_WARNING; miss++) state = afterPoll(state, null);
    expect(state).toMatchObject({ status: "running", message: null });
    state = afterPoll(state, failure("engine_unavailable"));
    expect(state).toMatchObject({ status: "running", message: "unreachable" });
    expect(afterPoll(state, job("running", { progress: 0.5 }))).toMatchObject({ status: "running", message: null, misses: 0 });
  });
});
```

```ts
// tests/unit/jobs-route.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.fn();
const engine = { job: vi.fn() };
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ getSession: () => session() }));
vi.mock("@/lib/engine", () => ({ getEngine: async () => engine }));

const { GET } = await import("@/app/api/jobs/[id]/route");
const call = (id: string) => GET(new Request(`http://localhost/api/jobs/${id}`), { params: Promise.resolve({ id }) });

beforeEach(() => vi.clearAllMocks());

describe("GET /api/jobs/[id] (design §8)", () => {
  it("answers 401 signed_out when nobody with a role is signed in, without asking the engine", async () => {
    session.mockResolvedValue({ userId: "u", email: "x@example.com", name: "X", role: null });
    const response = await call("j_1");
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "signed_out" } });
    expect(engine.job).not.toHaveBeenCalled();
  });

  it("answers 404 for an id that isn't an engine id", async () => {
    session.mockResolvedValue({ userId: "u", email: "r@example.com", name: "R", role: "reviewer" });
    expect((await call("..")).status).toBe(404);
    expect(engine.job).not.toHaveBeenCalled();
  });

  it("returns the engine's job, never cached", async () => {
    session.mockResolvedValue({ userId: "u", email: "r@example.com", name: "R", role: "reviewer" });
    engine.job.mockResolvedValue({ id: "j_1", status: "running", progress: 0.5 });
    const response = await call("j_1");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true, data: { id: "j_1", status: "running", progress: 0.5 } });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test tests/unit/job-poll.test.ts tests/unit/jobs-route.test.ts`

Expected: FAIL. `@/lib/jobs/poll` and `@/app/api/jobs/[id]/route` can't be resolved.

- [ ] **Step 3: Add the reducer and the route**

```ts
// src/lib/jobs/poll.ts
import type { EngineResult } from "@/lib/engine/result";
import type { Job } from "@/lib/engine/schemas";

/**
 * What the browser shows while a slow AI job runs (design §8). `message` is a Jobs.* message key (unreachable,
 * signedOut, jobFailed) or the engine's own words.
 */
export type JobPoll = { status: "running" | "done" | "failed"; progress: number; message: string | null; misses: number; result: unknown };

export const JOB_STARTED: JobPoll = { status: "running", progress: 0, message: null, misses: 0, result: null };

/** After this many polls in a row without an answer, say we're still trying (the job carries on at the engine). */
export const MISSES_BEFORE_WARNING = 3;

/**
 * The state after one poll; `answer` is null when our route couldn't be reached.
 * - done or failed ends the job
 * - an unknown job (404) or an ended session (401) ends it with a message, since asking again can't help
 * - anything else is a blip: keep polling, and after a few in a row say so
 */
export function afterPoll(state: JobPoll, answer: EngineResult<Job> | null): JobPoll {
  if (state.status !== "running") return state;
  if (answer === null || (!answer.ok && answer.error.code !== "not_found" && answer.error.code !== "signed_out")) {
    const misses = state.misses + 1;
    return { ...state, misses, message: misses >= MISSES_BEFORE_WARNING ? "unreachable" : state.message };
  }
  if (!answer.ok) return { ...state, status: "failed", message: answer.error.code === "signed_out" ? "signedOut" : answer.error.message };
  const job = answer.data;
  if (job.status === "done") return { status: "done", progress: 1, message: null, misses: 0, result: job.result ?? null };
  if (job.status === "failed") return { ...state, status: "failed", message: typeof job.error === "string" ? job.error : "jobFailed" };
  return { ...state, progress: job.progress ?? state.progress, misses: 0, message: null };
}
```

```ts
// src/app/api/jobs/[id]/route.ts
import { can } from "@/lib/auth/roles";
import { getSession } from "@/lib/auth/session";
import { getEngine } from "@/lib/engine";
import { ENGINE_ID } from "@/lib/engine/ids";
import { tryEngine } from "@/lib/engine/result";

const NO_STORE = { "Cache-Control": "no-store" };

/** GET /api/jobs/[id]: the browser follows a slow AI job here (design §8); the engine's key stays on the server. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.role || !can(session.role, "content.work")) {
    return Response.json(
      { ok: false, error: { status: 401, code: "signed_out", message: "Your session has ended. Sign in again." } },
      { status: 401, headers: NO_STORE },
    );
  }
  const { id } = await params;
  if (!ENGINE_ID.test(id)) {
    return Response.json({ ok: false, error: { status: 404, code: "not_found", message: "No such job." } }, { status: 404, headers: NO_STORE });
  }
  const engine = await getEngine();
  const result = await tryEngine(() => engine.job(id));
  return Response.json(result, { status: result.ok ? 200 : result.error.status || 502, headers: NO_STORE });
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `pnpm test tests/unit/job-poll.test.ts tests/unit/jobs-route.test.ts`

Expected: PASS (7).

- [ ] **Step 5: Add the hook, the tracker and the messages; move the editor's redraft progress onto the route**

Add the `Jobs` messages at the top level of `messages/en.json`:

```json
  "Jobs": {
    "percent": "{percent}%",
    "done": "Done.",
    "unreachable": "Still waiting for the server…",
    "signedOut": "Your session has ended. Sign in again to follow this job.",
    "jobFailed": "The job failed."
  }
```

and of `messages/ar.json`:

```json
  "Jobs": {
    "percent": "{percent}٪",
    "done": "تمّ.",
    "unreachable": "لا نزال بانتظار الخادم…",
    "signedOut": "انتهت جلستك. سجّل الدخول مجدداً لمتابعة هذه المهمة.",
    "jobFailed": "فشلت المهمة."
  }
```

Inside `Editor` in both files, replace the keys `"redrafting"` and `"jobFailed"` with `"redraftingLabel": "Redrafting…"` (en) and `"redraftingLabel": "جارٍ إعادة الصياغة…"` (ar).

```ts
// src/components/jobs/use-job.ts
"use client";

import { useEffect, useRef, useState } from "react";
import type { EngineResult } from "@/lib/engine/result";
import type { Job } from "@/lib/engine/schemas";
import { afterPoll, JOB_STARTED, type JobPoll } from "@/lib/jobs/poll";

async function fetchJob(jobId: string): Promise<EngineResult<Job> | null> {
  try {
    const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, { cache: "no-store" });
    return (await response.json()) as EngineResult<Job>;
  } catch {
    return null;
  }
}

/** Polls our /api/jobs/[id] every `pollSeconds` until the job is done or failed; calls onDone once, with the job's result. */
export function useJob(jobId: string, pollSeconds: number, onDone?: (result: unknown) => void): JobPoll {
  const [state, setState] = useState<JobPoll>(JOB_STARTED);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);

  useEffect(() => {
    let current = JOB_STARTED;
    let active = true;
    async function poll() {
      const answer = await fetchJob(jobId);
      if (!active || current.status !== "running") return;
      current = afterPoll(current, answer);
      setState(current);
      if (current.status !== "running") clearInterval(timer);
      if (current.status === "done") done.current?.(current.result);
    }
    const timer = setInterval(() => void poll(), pollSeconds * 1000);
    void poll();
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [jobId, pollSeconds]);

  return state;
}
```

```tsx
// src/components/jobs/job-tracker.tsx
"use client";

import { useTranslations } from "next-intl";
import { useJob } from "./use-job";

const MESSAGE_KEYS = new Set(["unreachable", "signedOut", "jobFailed"]);

type Props = { jobId: string; pollSeconds: number; label: string; testId?: string; onDone?: (result: unknown) => void };

/** A slow AI job's progress (design §8). It stops with a message if the job fails or can't be followed any more. */
export function JobTracker({ jobId, pollSeconds, label, testId = "job-tracker", onDone }: Props) {
  const t = useTranslations("Jobs");
  const state = useJob(jobId, pollSeconds, onDone);
  const percent = Math.round(state.progress * 100);
  const message = state.message && (MESSAGE_KEYS.has(state.message) ? t(state.message) : state.message);
  return (
    <div role="status" data-testid={testId} data-state={state.status} className="flex flex-col gap-1 text-sm">
      <span>{state.status === "done" ? t("done") : `${label} ${t("percent", { percent: String(percent) })}`}</span>
      {state.status === "running" && (
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
        </div>
      )}
      {message && <p className={state.status === "failed" ? "text-bad-fg" : "text-muted-foreground"}>{message}</p>}
    </div>
  );
}
```

Replace `src/components/editor/job-progress.tsx` with:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { JobTracker } from "@/components/jobs/job-tracker";

type Props = { jobId: string; pollSeconds: number; onDone: () => void };

/** The redraft after "Ask for changes", followed through our /api/jobs route (design §8). */
export function JobProgress({ jobId, pollSeconds, onDone }: Props) {
  const t = useTranslations("Editor");
  return <JobTracker jobId={jobId} pollSeconds={pollSeconds} label={t("redraftingLabel")} testId="job-progress" onDone={onDone} />;
}
```

In `src/components/editor/action-bar.tsx`, change `<JobProgress locale={locale} jobId={jobId} pollSeconds={pollSeconds} onDone={finishJob} />` to `<JobProgress jobId={jobId} pollSeconds={pollSeconds} onDone={finishJob} />`. Then run `grep -rn 't("redrafting"\|t("jobFailed"' src/components/editor` and confirm it prints nothing.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm e2e`

Expected:
- **lint and typecheck:** exit 0
- **unit:** PASS, 234 + 7 = 241
- **e2e:** PASS (76). The redraft test ("asking for changes redrafts the post…") now follows the job through `/api/jobs`.

- [ ] **Step 7: Commit**

```bash
git add src messages tests/unit
git commit -m "feat: follow slow AI jobs through our own /api/jobs route with a job tracker; the editor's redraft uses it"
```

---

### Task 5: Server actions for keywords, ideas and upgrade requests; the quota-aware error

**Files:**
- Create:
  - `src/app/[locale]/(app)/keywords/actions.ts`, `src/app/[locale]/(app)/ideas/actions.ts`, `src/app/[locale]/(app)/plan/actions.ts`
  - `src/components/actions/action-failure.tsx`
- Modify: `src/lib/actions/server.ts`, `messages/en.json`, `messages/ar.json`, `tests/unit/action-inputs.test.ts`
- Test: `tests/unit/action-inputs.test.ts` (append)

**Interfaces:**
- Consumes: Task 1 API methods; Task 2 `skippedPhrases`; M2b `change`, `engineFor`, `Locale`, `EngineId`, `IdempotencyKey`, `INVALID`, `useEngineAction`, `ActionError`
- Produces:
  - **Shared helpers:** `engineFor(locale, permission = "content.work")` and `change(locale, key, run, permission = "content.work")`
  - **Keyword actions:**
    - `addKeywordsAction({ locale, phrases, language, idempotencyKey })` → `AddedKeywords = { created: Keyword[]; skipped: string[] }`
    - `bulkKeywordsAction({ locale, action: KeywordBulkAction, ids, idempotencyKey })` → `BulkResult`
    - `proposeKeywordsAction({ locale, language?, idempotencyKey })` → `JobStart`
    - `keywordTopicsAction({ locale, ids, idempotencyKey })` → `JobStart`
    - `draftKeywordArticlesAction({ locale, ids, language, idempotencyKey })` → `JobStart`
  - **Idea actions:**
    - `draftSuggestionAction({ locale, suggestionId, language, idempotencyKey })` → `JobStart`
    - `dismissSuggestionAction({ locale, suggestionId, idempotencyKey })` → `Suggestion`
    - `bulkSuggestionsAction({ locale, action, ids, language?, idempotencyKey })` → `BulkResult`
    - `createDraftsAction({ locale, request: DraftRequest, idempotencyKey })` → `JobStart`
  - **Plan action:** `requestUpgradeAction({ locale, metric?, idempotencyKey })` → `{ requested: true }` (permission `plan.manage`)
  - **Component:** `<ActionFailure error locale canRequestUpgrade />`
    - `quota_exceeded` → "Monthly limit reached for {metric}", then Request upgrade (Admin) or "Ask your admin" (Reviewer)
    - anything else → `ActionError`
    - test ids: `quota-exceeded`, `request-upgrade`, `upgrade-requested`, `ask-admin`

- [ ] **Step 1: Write the failing tests**

In `tests/unit/action-inputs.test.ts`:

(a) Add these methods to the `engine` object: `addKeywords: vi.fn(), bulkKeywords: vi.fn(), draftKeywordArticles: vi.fn(), createDrafts: vi.fn(), draftSuggestion: vi.fn(), requestUpgrade: vi.fn(),`.

(b) Change the session mock to keep a handle on it:

```ts
const requirePermission = vi.fn(async () => ({ email: "reviewer@example.com" }));
vi.mock("@/lib/auth/session", () => ({ requirePermission }));
```

(c) Add after the existing dynamic imports:

```ts
const { addKeywordsAction, draftKeywordArticlesAction } = await import("@/app/[locale]/(app)/keywords/actions");
const { createDraftsAction, draftSuggestionAction } = await import("@/app/[locale]/(app)/ideas/actions");
const { requestUpgradeAction } = await import("@/app/[locale]/(app)/plan/actions");
```

(d) Append:

```ts
describe("M3a actions validate their input too", () => {
  const key = "key-12345678";

  it("adds keywords and lists the ones the engine skipped as already there (Review Focus 3)", async () => {
    engine.addKeywords.mockResolvedValue([{ id: "kw_1", phrase: "labour court", language: "en", source: "person", status: "new", createdAt: "2026-10-22T10:00:00+04:00" }]);
    const result = await addKeywordsAction({ locale: "en", phrases: ["labour court", "Commission UAE"], language: "en", idempotencyKey: key });
    expect(result).toMatchObject({ ok: true, data: { skipped: ["Commission UAE"] } });
    expect(await addKeywordsAction({ locale: "en", phrases: [], language: "en", idempotencyKey: key })).toMatchObject({ ok: false });
  });

  it("refuses malformed ids and languages before calling the engine", async () => {
    expect(await draftKeywordArticlesAction({ locale: "en", ids: [".."], language: "en", idempotencyKey: key })).toMatchObject({ ok: false });
    expect(await draftKeywordArticlesAction({ locale: "en", ids: ["kw_1"], language: "english", idempotencyKey: key })).toMatchObject({ ok: false });
    expect(await draftSuggestionAction({ locale: "en", suggestionId: "a/b", language: "both", idempotencyKey: key })).toMatchObject({ ok: false });
    expect(engine.draftKeywordArticles).not.toHaveBeenCalled();
    expect(engine.draftSuggestion).not.toHaveBeenCalled();
  });

  it("refuses a new draft request without a topic", async () => {
    const request = { topic: "  ", kind: "blog", platform: "website", language: "en" };
    expect(await createDraftsAction({ locale: "en", request, idempotencyKey: key })).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(engine.createDrafts).not.toHaveBeenCalled();
  });

  it("asks for the plan permission before requesting an upgrade", async () => {
    engine.requestUpgrade.mockResolvedValue({ requested: true });
    expect(await requestUpgradeAction({ locale: "en", metric: "articles", idempotencyKey: key })).toEqual({ ok: true, data: { requested: true } });
    expect(requirePermission).toHaveBeenCalledWith("en", "plan.manage");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test tests/unit/action-inputs.test.ts`

Expected: FAIL. `keywords/actions`, `ideas/actions` and `plan/actions` can't be resolved.

- [ ] **Step 3: Give the shared helpers a permission**

In `src/lib/actions/server.ts`:
- add `import type { Permission } from "@/lib/auth/roles";`
- replace `engineFor` and `change` with:

```ts
/** Role check + engine + who is acting. Every action goes through it; most need content.work (design §5). */
export async function engineFor(locale: string, permission: Permission = "content.work") {
  const session = await requirePermission(locale, permission);
  return { engine: await getEngine(), actingUser: session.email };
}

/** A change (design §8): role check, X-Acting-User and the caller's key, then a refresh of the page if it succeeded. */
export async function change<T>(
  locale: string,
  idempotencyKey: string,
  run: (ctx: ChangeContext & { engine: EngineApi }) => Promise<T>,
  permission: Permission = "content.work",
): Promise<ActionResult<T>> {
  const { engine, actingUser } = await engineFor(locale, permission);
  const result = await tryEngine(() => run({ engine, actingUser, idempotencyKey }));
  if (result.ok) refresh();
  return result;
}
```

- [ ] **Step 4: Add the actions**

```ts
// src/app/[locale]/(app)/keywords/actions.ts
"use server";

import { z } from "zod";
import type { ActionResult } from "@/lib/actions/result";
import { change, EngineId, IdempotencyKey, INVALID, Locale } from "@/lib/actions/server";
import { KEYWORD_BULK_ACTIONS, type KeywordBulkAction } from "@/lib/engine/api";
import type { BulkResult, JobStart, Keyword } from "@/lib/engine/schemas";
import { skippedPhrases } from "@/lib/keywords/phrases";

// Languages are checked by the engine against /meta; here only their shape ("en", "ar") and "both" for drafts.
const Language = z.string().regex(/^[a-z]{2,3}$/);
const DraftLanguage = z.union([Language, z.literal("both")]);
const Ids = z.array(EngineId).min(1).max(100);

export type AddedKeywords = { created: Keyword[]; skipped: string[] };

export async function addKeywordsAction(input: {
  locale: string;
  phrases: string[];
  language: string;
  idempotencyKey: string;
}): Promise<ActionResult<AddedKeywords>> {
  const parsed = z
    .object({ locale: Locale, phrases: z.array(z.string().trim().min(1).max(100)).min(1).max(50), language: Language, idempotencyKey: IdempotencyKey })
    .safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, phrases, language, idempotencyKey } = parsed.data;
  const result = await change(locale, idempotencyKey, ({ engine, ...ctx }) => engine.addKeywords(phrases, language, ctx));
  return result.ok ? { ok: true, data: { created: result.data, skipped: skippedPhrases(phrases, result.data) } } : result;
}

export async function bulkKeywordsAction(input: {
  locale: string;
  action: KeywordBulkAction;
  ids: string[];
  idempotencyKey: string;
}): Promise<ActionResult<BulkResult>> {
  const parsed = z.object({ locale: Locale, action: z.enum(KEYWORD_BULK_ACTIONS), ids: Ids, idempotencyKey: IdempotencyKey }).safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, action, ids, idempotencyKey } = parsed.data;
  return change(locale, idempotencyKey, ({ engine, ...ctx }) => engine.bulkKeywords(action, ids, ctx));
}

export async function proposeKeywordsAction(input: { locale: string; language?: string; idempotencyKey: string }): Promise<ActionResult<JobStart>> {
  const parsed = z.object({ locale: Locale, language: Language.optional(), idempotencyKey: IdempotencyKey }).safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, language, idempotencyKey } = parsed.data;
  return change(locale, idempotencyKey, ({ engine, ...ctx }) => engine.proposeKeywords(language, ctx));
}

export async function keywordTopicsAction(input: { locale: string; ids: string[]; idempotencyKey: string }): Promise<ActionResult<JobStart>> {
  const parsed = z.object({ locale: Locale, ids: Ids, idempotencyKey: IdempotencyKey }).safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, ids, idempotencyKey } = parsed.data;
  return change(locale, idempotencyKey, ({ engine, ...ctx }) => engine.keywordTopics(ids, ctx));
}

export async function draftKeywordArticlesAction(input: {
  locale: string;
  ids: string[];
  language: string;
  idempotencyKey: string;
}): Promise<ActionResult<JobStart>> {
  const parsed = z.object({ locale: Locale, ids: Ids, language: DraftLanguage, idempotencyKey: IdempotencyKey }).safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, ids, language, idempotencyKey } = parsed.data;
  return change(locale, idempotencyKey, ({ engine, ...ctx }) => engine.draftKeywordArticles(ids, language, ctx));
}
```

```ts
// src/app/[locale]/(app)/ideas/actions.ts
"use server";

import { z } from "zod";
import type { ActionResult } from "@/lib/actions/result";
import { change, EngineId, IdempotencyKey, INVALID, Locale } from "@/lib/actions/server";
import { SUGGESTION_BULK_ACTIONS, type DraftRequest, type SuggestionBulkAction } from "@/lib/engine/api";
import type { BulkResult, JobStart, Suggestion } from "@/lib/engine/schemas";

const Language = z.string().regex(/^[a-z]{2,3}$/);
const DraftLanguage = z.union([Language, z.literal("both")]);

const DraftRequestSchema = z.object({
  topic: z.string().trim().min(1).max(200),
  kind: z.string().min(1).max(20),
  platform: z.string().min(1).max(20),
  language: DraftLanguage,
  tone: z.string().trim().max(200).optional(),
  keywords: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
});

export async function draftSuggestionAction(input: {
  locale: string;
  suggestionId: string;
  language: string;
  idempotencyKey: string;
}): Promise<ActionResult<JobStart>> {
  const parsed = z.object({ locale: Locale, suggestionId: EngineId, language: DraftLanguage, idempotencyKey: IdempotencyKey }).safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, suggestionId, language, idempotencyKey } = parsed.data;
  return change(locale, idempotencyKey, ({ engine, ...ctx }) => engine.draftSuggestion(suggestionId, language, ctx));
}

export async function dismissSuggestionAction(input: { locale: string; suggestionId: string; idempotencyKey: string }): Promise<ActionResult<Suggestion>> {
  const parsed = z.object({ locale: Locale, suggestionId: EngineId, idempotencyKey: IdempotencyKey }).safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, suggestionId, idempotencyKey } = parsed.data;
  return change(locale, idempotencyKey, ({ engine, ...ctx }) => engine.dismissSuggestion(suggestionId, ctx));
}

export async function bulkSuggestionsAction(input: {
  locale: string;
  action: SuggestionBulkAction;
  ids: string[];
  language?: string;
  idempotencyKey: string;
}): Promise<ActionResult<BulkResult>> {
  const parsed = z
    .object({
      locale: Locale,
      action: z.enum(SUGGESTION_BULK_ACTIONS),
      ids: z.array(EngineId).min(1).max(100),
      language: DraftLanguage.optional(),
      idempotencyKey: IdempotencyKey,
    })
    .safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, action, ids, language, idempotencyKey } = parsed.data;
  return change(locale, idempotencyKey, ({ engine, ...ctx }) => engine.bulkSuggestions(action, ids, language, ctx));
}

export async function createDraftsAction(input: { locale: string; request: DraftRequest; idempotencyKey: string }): Promise<ActionResult<JobStart>> {
  const parsed = z.object({ locale: Locale, request: DraftRequestSchema, idempotencyKey: IdempotencyKey }).safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, request, idempotencyKey } = parsed.data;
  return change(locale, idempotencyKey, ({ engine, ...ctx }) => engine.createDrafts(request, ctx));
}
```

```ts
// src/app/[locale]/(app)/plan/actions.ts
"use server";

import { z } from "zod";
import type { ActionResult } from "@/lib/actions/result";
import { change, IdempotencyKey, INVALID, Locale } from "@/lib/actions/server";

/** Request upgrade (design §9 429: Admin only; spec v1.1 §7 POST /account/upgrade-request). */
export async function requestUpgradeAction(input: { locale: string; metric?: string; idempotencyKey: string }): Promise<ActionResult<{ requested: true }>> {
  const parsed = z.object({ locale: Locale, metric: z.string().max(60).optional(), idempotencyKey: IdempotencyKey }).safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, metric, idempotencyKey } = parsed.data;
  return change(locale, idempotencyKey, ({ engine, ...ctx }) => engine.requestUpgrade(metric, undefined, ctx), "plan.manage");
}
```

- [ ] **Step 5: Add the quota-aware error and its messages**

Add the `Quota` messages at the top level of `messages/en.json`:

```json
  "Quota": {
    "limitReached": "Monthly limit reached for {metric}.",
    "askAdmin": "Ask your admin to raise the limit.",
    "request": "Request upgrade",
    "requested": "Upgrade requested. Quantum1st will be in touch."
  }
```

and of `messages/ar.json`:

```json
  "Quota": {
    "limitReached": "تم بلوغ الحد الشهري لـ{metric}.",
    "askAdmin": "اطلب من المسؤول رفع الحد.",
    "request": "طلب ترقية",
    "requested": "أُرسل طلب الترقية، وسيتواصل معكم فريق Quantum1st."
  }
```

```tsx
// src/components/actions/action-failure.tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { requestUpgradeAction } from "@/app/[locale]/(app)/plan/actions";
import { Button } from "@/components/ui/button";
import { useEngineAction } from "@/lib/actions/use-engine-action";
import type { EngineFailure } from "@/lib/engine/result";
import { ActionError } from "./action-error";

type Props = { error: EngineFailure; locale: string; canRequestUpgrade: boolean };

/** An action's error; a 429 quota_exceeded shows the limit and the next step for this role (design §9). */
export function ActionFailure({ error, locale, canRequestUpgrade }: Props) {
  if (error.code !== "quota_exceeded") return <ActionError error={error} />;
  return <QuotaExceeded error={error} locale={locale} canRequestUpgrade={canRequestUpgrade} />;
}

function QuotaExceeded({ error, locale, canRequestUpgrade }: Props) {
  const t = useTranslations("Quota");
  const tMetrics = useTranslations("Dashboard.quota.metrics");
  const upgrade = useEngineAction(requestUpgradeAction);
  const [requested, setRequested] = useState(false);
  const [failure, setFailure] = useState<EngineFailure | null>(null);
  const metric = String(error.details?.metric ?? "");
  const label = metric && tMetrics.has(metric) ? tMetrics(metric) : metric;

  async function request() {
    setFailure(null);
    const result = await upgrade.run({ locale, metric: metric || undefined });
    if (result.ok) setRequested(true);
    else setFailure(result.error);
  }

  return (
    <div role="alert" data-testid="quota-exceeded" className="flex flex-col gap-2 rounded-md bg-bad-bg px-3 py-2 text-sm text-bad-fg">
      <p>{t("limitReached", { metric: label })}</p>
      {!canRequestUpgrade && <p data-testid="ask-admin">{t("askAdmin")}</p>}
      {canRequestUpgrade && !requested && (
        <div>
          <Button size="sm" data-testid="request-upgrade" disabled={upgrade.pending} onClick={() => void request()}>
            {t("request")}
          </Button>
        </div>
      )}
      {requested && <p data-testid="upgrade-requested">{t("requested")}</p>}
      {failure && <ActionError error={failure} />}
    </div>
  );
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test && pnpm typecheck && pnpm lint`

Expected: unit PASS (241 + 4 = 245); typecheck and lint exit 0.

- [ ] **Step 7: Commit**

```bash
git add src messages tests/unit
git commit -m "feat: keyword, topic idea, new draft and upgrade-request actions; the 429 limit shows Request upgrade or Ask your admin"
```

---
### Task 6: The Keywords page

**Files:**
- Create:
  - `src/lib/keywords/tabs.ts`, `src/lib/drafting/choices.ts`
  - `src/components/drafting/draft-language-dialog.tsx`
  - `src/app/[locale]/(app)/keywords/page.tsx`
  - `src/components/keywords/keywords-view.tsx`, `src/components/keywords/keyword-tabs.tsx`, `src/components/keywords/keywords-board.tsx`, `src/components/keywords/add-keywords.tsx`, `src/components/keywords/propose-keywords.tsx`
- Modify: `src/components/lists/pager.tsx`, `src/components/shell/nav.ts`, `messages/en.json`, `messages/ar.json`
- Test: `tests/unit/keyword-tabs.test.ts` (create), `tests/e2e/keywords.spec.ts` (create)

**Interfaces:**
- Consumes:
  - Task 1 `listKeywords`; Task 4 `JobTracker`
  - Task 5 keyword actions and `ActionFailure`
  - M2b `Pager`, `SkippedNote`, `requestedPage`, `pageCount`, `bulkFailureLines`, `useEngineAction`
- Produces:
  - **Helpers:**
    - `KEYWORD_TABS`, `type KeywordTab` (`new | inUse | covered | dismissed`)
    - `keywordTab(value)`, `tabStatuses(tab)`, `tabActions(tab)`
    - `draftLanguageOptions(languages)`
  - **Components:**
    - `<DraftLanguageDialog testId triggerLabel … languages onConfirm(language) />`: radios `{testId}-language-{code}`, confirm `{testId}-confirm`; a failure shows inside via `ActionFailure`
    - `Pager` takes an optional `query` to keep (e.g. the tab)
    - `type KeywordRow`, `<KeywordsBoard />`, `<AddKeywords />`, `<ProposeKeywords />`
  - **Navigation:** nav item `keywords`
  - **Test ids:**
    - tabs and rows: `keyword-tab-{tab}`, `keyword-row-{id}`, `keyword-select-{id}`, `keyword-phrase-{id}`, `keyword-off-strategy-{id}`, `keywords-empty`
    - bulk buttons: `keywords-approve`, `keywords-dismiss`, `keywords-restore`, `keywords-topics`, `keywords-draft` (dialog)
    - jobs: `topics-job`, `topics-ready`, `open-ideas`, `drafts-started`, `draft-job`
    - add: `add-keywords-input`, `add-keywords-language`, `add-keywords`, `keywords-added`, `keywords-skipped`
    - propose: `propose-language`, `propose-keywords`, `propose-job`, `proposals-ready`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/keyword-tabs.test.ts
import { describe, expect, it } from "vitest";
import { draftLanguageOptions } from "@/lib/drafting/choices";
import { keywordTab, tabActions, tabStatuses } from "@/lib/keywords/tabs";

describe("keyword tabs (spec v1.1 §6 /keywords)", () => {
  it("reads the tab from ?tab=, defaulting to New", () => {
    expect([keywordTab(undefined), keywordTab("covered"), keywordTab(["inUse", "new"]), keywordTab("everything")]).toEqual(["new", "covered", "inUse", "new"]);
  });

  it("lists off-strategy keywords with the dismissed ones", () => {
    expect([tabStatuses("new"), tabStatuses("inUse"), tabStatuses("covered"), tabStatuses("dismissed")]).toEqual([
      ["new"],
      ["approved"],
      ["covered"],
      ["dismissed", "off_strategy"],
    ]);
  });

  it("offers each tab's buttons: approve and dismiss new keywords, restore dismissed ones, topics and drafts from new or in-use ones", () => {
    expect(tabActions("new")).toEqual({ approve: true, dismiss: true, restore: false, topics: true, draft: true });
    expect(tabActions("inUse")).toEqual({ approve: false, dismiss: true, restore: false, topics: true, draft: true });
    expect(tabActions("covered")).toEqual({ approve: false, dismiss: false, restore: false, topics: false, draft: false });
    expect(tabActions("dismissed")).toEqual({ approve: false, dismiss: false, restore: true, topics: false, draft: false });
  });
});

describe("drafting languages (spec v1.1 §6: en, ar or both)", () => {
  it("adds both only when the site has more than one language", () => {
    expect([draftLanguageOptions(["en", "ar"]), draftLanguageOptions(["en"])]).toEqual([["en", "ar", "both"], ["en"]]);
  });
});
```

```ts
// tests/e2e/keywords.spec.ts
import { expect, test } from "@playwright/test";
import { isolateMockStore, setMockScenario, signInWithCookie } from "./helpers";

test.beforeEach(async ({ context }) => {
  await isolateMockStore(context);
  await signInWithCookie(context, "dev_reviewer");
});

test("tabs list the right keywords; off-strategy ones sit with the dismissed", async ({ page }) => {
  await page.goto("/en/keywords");
  await expect(page.getByTestId("keyword-row-kw_3")).toBeVisible();
  await expect(page.getByTestId("keyword-row-kw_1")).toHaveCount(0);
  await expect(page.getByTestId("keyword-tab-dismissed")).toHaveAttribute("href", "/en/keywords?tab=dismissed");
  await page.goto("/en/keywords?tab=dismissed");
  await expect(page.getByTestId("keyword-off-strategy-kw_9")).toHaveText("Outside the strategy");
  await expect(page.getByTestId("keyword-row-kw_8")).toBeVisible();
});

test("adds keywords and names the ones already in the list (Review Focus 3)", async ({ page }) => {
  await page.goto("/en/keywords");
  await page.getByTestId("add-keywords-input").fill("labour court claims dubai,\nCommission  UAE labour law");
  await page.getByTestId("add-keywords").click();
  await expect(page.getByTestId("keywords-added")).toHaveText("Added 1 keyword.");
  await expect(page.getByTestId("keywords-skipped")).toHaveText("Already in the list: Commission UAE labour law.");
  await expect(page.locator('[data-testid^="keyword-phrase-"]', { hasText: "labour court claims dubai" })).toBeVisible();
});

test("approving moves selected keywords to In use; Restore brings a dismissed one back (Review Focus 4)", async ({ page }) => {
  await page.goto("/en/keywords");
  await page.getByTestId("keyword-select-kw_3").check();
  await page.getByTestId("keywords-approve").click();
  await expect(page.getByTestId("keyword-row-kw_3")).toHaveCount(0);
  await page.goto("/en/keywords?tab=inUse");
  await expect(page.getByTestId("keyword-row-kw_3")).toBeVisible();
  await page.goto("/en/keywords?tab=dismissed");
  await page.getByTestId("keyword-select-kw_9").check();
  await page.getByTestId("keywords-restore").click();
  await expect(page.getByTestId("keyword-row-kw_9")).toHaveCount(0);
});

test("AI keyword proposals appear in the New tab when the job is done (design §8)", async ({ page }) => {
  await page.goto("/en/keywords");
  await page.getByTestId("propose-keywords").click();
  await expect(page.getByTestId("propose-job")).toBeVisible();
  await expect(page.getByTestId("proposals-ready")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-testid^="keyword-phrase-"]', { hasText: "non-compete clause uae" })).toBeVisible();
});

test("proposing topics for selected keywords ends with a link to Topic ideas", async ({ page }) => {
  await page.goto("/en/keywords");
  await page.getByTestId("keyword-select-kw_5").check();
  await page.getByTestId("keywords-topics").click();
  await expect(page.getByTestId("topics-ready")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("open-ideas")).toHaveAttribute("href", "/en/ideas");
});

test("drafting articles asks for the language first, then a linked pair arrives in Review (Review Focus 5)", async ({ page }) => {
  await page.goto("/en/keywords");
  await page.getByTestId("keyword-select-kw_3").check();
  await page.getByTestId("keywords-draft").click();
  await page.getByTestId("keywords-draft-language-both").check();
  await page.getByTestId("keywords-draft-confirm").click();
  await expect(page.getByTestId("drafts-started")).toContainText("Drafting 2 articles");
  await expect(page.getByTestId("draft-job")).toHaveAttribute("data-state", "done", { timeout: 15_000 });
  await page.goto("/en/review");
  await expect(page.getByText("End of service gratuity calculator uae: what you need to know", { exact: true })).toHaveCount(2);
});

test("with the monthly limit reached, a reviewer is told to ask the admin (Review Focus 1)", async ({ page, context }) => {
  await setMockScenario(context, "quota");
  await page.goto("/en/keywords");
  await page.getByTestId("keyword-select-kw_3").check();
  await page.getByTestId("keywords-draft").click();
  await page.getByTestId("keywords-draft-confirm").click();
  await expect(page.getByTestId("quota-exceeded")).toContainText("Monthly limit reached for Articles");
  await expect(page.getByTestId("ask-admin")).toBeVisible();
  await expect(page.getByTestId("request-upgrade")).toHaveCount(0);
});

test("with the monthly limit reached, an admin can request an upgrade (Review Focus 1)", async ({ page, context }) => {
  await signInWithCookie(context, "dev_admin");
  await setMockScenario(context, "quota");
  await page.goto("/en/keywords");
  await page.getByTestId("keyword-select-kw_3").check();
  await page.getByTestId("keywords-draft").click();
  await page.getByTestId("keywords-draft-confirm").click();
  await page.getByTestId("request-upgrade").click();
  await expect(page.getByTestId("upgrade-requested")).toBeVisible();
});

test("Arabic keywords read right to left", async ({ page }) => {
  await page.goto("/en/keywords");
  await expect(page.getByTestId("keyword-phrase-kw_7")).toHaveAttribute("dir", "rtl");
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test tests/unit/keyword-tabs.test.ts`
Expected: FAIL. `@/lib/drafting/choices` and `@/lib/keywords/tabs` can't be resolved.

Then add the two helper modules (Step 3), and run: `pnpm e2e tests/e2e/keywords.spec.ts`
Expected: FAIL. `/en/keywords` is a 404.

- [ ] **Step 3: Add the helpers and keep the tab when paging**

```ts
// src/lib/keywords/tabs.ts
/** Keyword tabs (spec v1.1 §6). The AI's off-strategy keywords sit with the dismissed ones; Restore moves both back to New. */
export const KEYWORD_TABS = ["new", "inUse", "covered", "dismissed"] as const;
export type KeywordTab = (typeof KEYWORD_TABS)[number];

const STATUSES: Record<KeywordTab, string[]> = {
  new: ["new"],
  inUse: ["approved"],
  covered: ["covered"],
  dismissed: ["dismissed", "off_strategy"],
};

export function keywordTab(value: string | string[] | undefined): KeywordTab {
  const raw = Array.isArray(value) ? value[0] : value;
  return (KEYWORD_TABS as readonly string[]).includes(raw ?? "") ? (raw as KeywordTab) : "new";
}

export const tabStatuses = (tab: KeywordTab): string[] => STATUSES[tab];

/** The buttons each tab offers (spec v1.1 §5, §6). The engine still decides; refusals come back by phrase. */
export function tabActions(tab: KeywordTab) {
  const usable = tab === "new" || tab === "inUse";
  return { approve: tab === "new", dismiss: usable, restore: tab === "dismissed", topics: usable, draft: usable };
}
```

```ts
// src/lib/drafting/choices.ts
/** Drafting language choices (spec v1.1 §6: en, ar or both): the site's languages from /meta, plus "both" when there are several. */
export function draftLanguageOptions(languages: string[]): string[] {
  return languages.length > 1 ? [...languages, "both"] : [...languages];
}
```

In `src/components/lists/pager.tsx`, keep other query values when paging. Change the signature to:

```tsx
export async function Pager({ pathname, page, pages, query = {} }: { pathname: string; page: number; pages: number; query?: Record<string, string> }) {
```

and both `href` values to `{ pathname, query: { ...query, page: String(page - 1) } }` and `{ pathname, query: { ...query, page: String(page + 1) } }`.

- [ ] **Step 4: Add the messages and the nav item**

In `src/components/shell/nav.ts`, add `{ key: "keywords", href: "/keywords", permission: "content.work" },` after the `dashboard` item.

`messages/en.json`:
- inside `Shell.nav`, add `"keywords": "Keywords"`
- at the top level, add:

```json
  "Drafting": {
    "language": "Language",
    "both": "Both languages",
    "cancel": "Cancel"
  },
  "Keywords": {
    "title": "Keywords",
    "tabs": { "label": "Keyword lists", "new": "New", "inUse": "In use", "covered": "Covered", "dismissed": "Dismissed" },
    "columns": { "phrase": "Phrase", "language": "Language", "source": "Source", "rationale": "Why", "uses": "Uses" },
    "sources": { "ai": "AI", "person": "Added by a person", "search_console": "Search Console" },
    "offStrategy": "Outside the strategy",
    "empty": "No keywords here.",
    "select": "Select “{phrase}”",
    "approve": "Approve",
    "dismiss": "Dismiss",
    "restore": "Restore",
    "topics": "Propose topics",
    "proposingTopics": "Proposing topics…",
    "topicsReady": "New topic ideas are ready.",
    "openIdeas": "Open Topic ideas",
    "draft": "Draft articles",
    "draftTitle": "Draft one article per keyword?",
    "draftBody": "Each selected keyword gets its own article. Choose the language.",
    "draftConfirm": "Start drafting",
    "drafting": "Drafting…",
    "draftsStarted": "{count, plural, one {Drafting {n} article. It will appear in Review.} other {Drafting {n} articles. They will appear in Review.}}",
    "openReview": "Open Review",
    "bulkFailed": "Not done:",
    "add": {
      "title": "Add keywords",
      "hint": "Separate them with commas or new lines.",
      "language": "Language",
      "submit": "Add",
      "added": "{count, plural, one {Added {n} keyword.} other {Added {n} keywords.}}",
      "skipped": "Already in the list: {phrases}."
    },
    "propose": {
      "title": "Propose keywords (AI)",
      "hint": "The AI suggests keywords from the site's profile and searches.",
      "language": "Language",
      "all": "All languages",
      "submit": "Propose",
      "running": "Proposing keywords…",
      "ready": "New keywords are in the New tab."
    }
  }
```

`messages/ar.json`:
- inside `Shell.nav`, add `"keywords": "الكلمات المفتاحية"`
- at the top level, add:

```json
  "Drafting": {
    "language": "اللغة",
    "both": "اللغتان",
    "cancel": "إلغاء"
  },
  "Keywords": {
    "title": "الكلمات المفتاحية",
    "tabs": { "label": "قوائم الكلمات المفتاحية", "new": "جديدة", "inUse": "قيد الاستخدام", "covered": "مغطّاة", "dismissed": "مستبعدة" },
    "columns": { "phrase": "العبارة", "language": "اللغة", "source": "المصدر", "rationale": "السبب", "uses": "مرات الاستخدام" },
    "sources": { "ai": "الذكاء الاصطناعي", "person": "أضافها شخص", "search_console": "Search Console" },
    "offStrategy": "خارج الاستراتيجية",
    "empty": "لا توجد كلمات مفتاحية هنا.",
    "select": "تحديد «{phrase}»",
    "approve": "اعتماد",
    "dismiss": "استبعاد",
    "restore": "استعادة",
    "topics": "اقتراح مواضيع",
    "proposingTopics": "جارٍ اقتراح المواضيع…",
    "topicsReady": "أفكار المواضيع الجديدة جاهزة.",
    "openIdeas": "فتح أفكار المواضيع",
    "draft": "صياغة مقالات",
    "draftTitle": "صياغة مقال لكل كلمة مفتاحية؟",
    "draftBody": "تحصل كل كلمة مفتاحية محددة على مقال خاص بها. اختر اللغة.",
    "draftConfirm": "بدء الصياغة",
    "drafting": "جارٍ الصياغة…",
    "draftsStarted": "{count, plural, one {جارٍ صياغة مقال واحد، وسيظهر في المراجعة.} two {جارٍ صياغة مقالين، وسيظهران في المراجعة.} few {جارٍ صياغة {n} مقالات، وستظهر في المراجعة.} many {جارٍ صياغة {n} مقالاً، وستظهر في المراجعة.} other {جارٍ صياغة {n} مقال، وستظهر في المراجعة.}}",
    "openReview": "فتح المراجعة",
    "bulkFailed": "لم يتم:",
    "add": {
      "title": "إضافة كلمات مفتاحية",
      "hint": "افصل بينها بفواصل أو بأسطر جديدة.",
      "language": "اللغة",
      "submit": "إضافة",
      "added": "{count, plural, one {أُضيفت كلمة مفتاحية واحدة.} two {أُضيفت كلمتان مفتاحيتان.} few {أُضيفت {n} كلمات مفتاحية.} many {أُضيفت {n} كلمة مفتاحية.} other {أُضيفت {n} كلمة مفتاحية.}}",
      "skipped": "موجودة في القائمة مسبقاً: {phrases}."
    },
    "propose": {
      "title": "اقتراح كلمات مفتاحية (الذكاء الاصطناعي)",
      "hint": "يقترح الذكاء الاصطناعي كلمات مفتاحية من ملف الموقع وعمليات البحث.",
      "language": "اللغة",
      "all": "كل اللغات",
      "submit": "اقتراح",
      "running": "جارٍ اقتراح الكلمات المفتاحية…",
      "ready": "الكلمات المفتاحية الجديدة في تبويب «جديدة»."
    }
  }
```

- [ ] **Step 5: Add the language dialog and the Keywords components**

```tsx
// src/components/drafting/draft-language-dialog.tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ActionFailure } from "@/components/actions/action-failure";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { draftLanguageOptions } from "@/lib/drafting/choices";
import type { EngineFailure } from "@/lib/engine/result";

type Props = {
  testId: string;
  triggerLabel: string;
  triggerVariant?: "default" | "outline" | "secondary";
  triggerSize?: "default" | "sm";
  disabled?: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  languages: string[];
  pending: boolean;
  locale: string;
  canRequestUpgrade: boolean;
  onConfirm: (language: string) => Promise<EngineFailure | null>;
};

/** Draft with AI after choosing the language (spec v1.1 §6: en, ar or both). Closes only once the draft has started. */
export function DraftLanguageDialog(props: Props) {
  const { testId, triggerLabel, triggerVariant = "default", triggerSize = "default", disabled, title, description, confirmLabel } = props;
  const t = useTranslations("Drafting");
  const tLanguages = useTranslations("Review.languages");
  const options = draftLanguageOptions(props.languages);
  const [open, setOpen] = useState(false);
  const [language, setLanguage] = useState(options[0] ?? "");
  const [error, setError] = useState<EngineFailure | null>(null);
  const label = (code: string) => (code === "both" ? t("both") : tLanguages.has(code) ? tLanguages(code) : code);

  async function confirm() {
    const failure = await props.onConfirm(language);
    setError(failure);
    if (!failure) setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant={triggerVariant} size={triggerSize} data-testid={testId} disabled={disabled}>
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">{t("language")}</legend>
          {options.map((code) => (
            <label key={code} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={`${testId}-language`}
                value={code}
                checked={language === code}
                onChange={() => setLanguage(code)}
                data-testid={`${testId}-language-${code}`}
                className="accent-primary"
              />
              {label(code)}
            </label>
          ))}
        </fieldset>
        {error && <ActionFailure error={error} locale={props.locale} canRequestUpgrade={props.canRequestUpgrade} />}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{t("cancel")}</Button>
          </DialogClose>
          <Button data-testid={`${testId}-confirm`} disabled={props.pending || !language} onClick={() => void confirm()}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

```tsx
// src/components/keywords/keyword-tabs.tsx
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { KEYWORD_TABS, type KeywordTab } from "@/lib/keywords/tabs";
import { cn } from "@/lib/utils";

export async function KeywordTabs({ current }: { current: KeywordTab }) {
  const t = await getTranslations("Keywords.tabs");
  return (
    <nav aria-label={t("label")} className="flex flex-wrap gap-2 border-b border-border">
      {KEYWORD_TABS.map((tab) => (
        <Link
          key={tab}
          href={{ pathname: "/keywords", query: { tab } }}
          data-testid={`keyword-tab-${tab}`}
          aria-current={tab === current ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm",
            tab === current ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {t(tab)}
        </Link>
      ))}
    </nav>
  );
}
```

```tsx
// src/components/keywords/add-keywords.tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { addKeywordsAction } from "@/app/[locale]/(app)/keywords/actions";
import { ActionError } from "@/components/actions/action-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useEngineAction } from "@/lib/actions/use-engine-action";
import type { EngineFailure } from "@/lib/engine/result";
import { parsePhrases } from "@/lib/keywords/phrases";

/** Spec v1.1 §6 "Add keyword(s): comma or line separated". Phrases already in the list are skipped and named. */
export function AddKeywords({ locale, languages }: { locale: string; languages: string[] }) {
  const t = useTranslations("Keywords.add");
  const tLanguages = useTranslations("Review.languages");
  const add = useEngineAction(addKeywordsAction);
  const [text, setText] = useState("");
  const [language, setLanguage] = useState(languages[0] ?? "");
  const [outcome, setOutcome] = useState<{ added: number; skipped: string[] } | null>(null);
  const [error, setError] = useState<EngineFailure | null>(null);
  const phrases = parsePhrases(text);

  async function submit() {
    setError(null);
    setOutcome(null);
    const result = await add.run({ locale, phrases, language });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOutcome({ added: result.data.created.length, skipped: result.data.skipped });
    setText("");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("hint")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Textarea data-testid="add-keywords-input" aria-label={t("title")} dir="auto" rows={3} value={text} onChange={(event) => setText(event.target.value)} />
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-keywords-language">{t("language")}</Label>
            <select
              id="add-keywords-language"
              data-testid="add-keywords-language"
              className="h-9 rounded-md border border-input bg-card px-3 text-sm"
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
            >
              {languages.map((code) => (
                <option key={code} value={code}>
                  {tLanguages.has(code) ? tLanguages(code) : code}
                </option>
              ))}
            </select>
          </div>
          <Button data-testid="add-keywords" disabled={phrases.length === 0 || add.pending} onClick={() => void submit()}>
            {t("submit")}
          </Button>
        </div>
        {outcome && (
          <p role="status" data-testid="keywords-added" className="text-sm">
            {t("added", { count: outcome.added, n: String(outcome.added) })}
          </p>
        )}
        {outcome && outcome.skipped.length > 0 && (
          <p data-testid="keywords-skipped" className="text-sm text-muted-foreground">
            {t("skipped", { phrases: outcome.skipped.join(", ") })}
          </p>
        )}
        {error && <ActionError error={error} />}
      </CardContent>
    </Card>
  );
}
```

```tsx
// src/components/keywords/propose-keywords.tsx
"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { proposeKeywordsAction } from "@/app/[locale]/(app)/keywords/actions";
import { ActionError } from "@/components/actions/action-error";
import { JobTracker } from "@/components/jobs/job-tracker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useRouter } from "@/i18n/navigation";
import { useEngineAction } from "@/lib/actions/use-engine-action";
import type { EngineFailure } from "@/lib/engine/result";

/** Spec v1.1 §6 "Propose keywords (AI): starts a job". The new keywords land in the New tab. */
export function ProposeKeywords({ locale, languages, pollSeconds }: { locale: string; languages: string[]; pollSeconds: number }) {
  const t = useTranslations("Keywords.propose");
  const tLanguages = useTranslations("Review.languages");
  const router = useRouter();
  const propose = useEngineAction(proposeKeywordsAction);
  const [language, setLanguage] = useState(""); // "" means all the site's languages
  const [jobId, setJobId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<EngineFailure | null>(null);
  const finished = useCallback(() => {
    setReady(true);
    router.refresh();
  }, [router]);

  async function start() {
    setError(null);
    setReady(false);
    const result = await propose.run({ locale, language: language || undefined });
    if (result.ok) setJobId(result.data.jobId);
    else setError(result.error);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("hint")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <select
            data-testid="propose-language"
            aria-label={t("language")}
            className="h-9 rounded-md border border-input bg-card px-3 text-sm"
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
          >
            <option value="">{t("all")}</option>
            {languages.map((code) => (
              <option key={code} value={code}>
                {tLanguages.has(code) ? tLanguages(code) : code}
              </option>
            ))}
          </select>
          <Button data-testid="propose-keywords" disabled={propose.pending} onClick={() => void start()}>
            {t("submit")}
          </Button>
        </div>
        {jobId && <JobTracker key={jobId} jobId={jobId} pollSeconds={pollSeconds} label={t("running")} testId="propose-job" onDone={finished} />}
        {ready && (
          <p data-testid="proposals-ready" className="text-sm">
            {t("ready")}
          </p>
        )}
        {error && <ActionError error={error} />}
      </CardContent>
    </Card>
  );
}
```

```tsx
// src/components/keywords/keywords-board.tsx
"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { bulkKeywordsAction, draftKeywordArticlesAction, keywordTopicsAction } from "@/app/[locale]/(app)/keywords/actions";
import { ActionFailure } from "@/components/actions/action-failure";
import { DraftLanguageDialog } from "@/components/drafting/draft-language-dialog";
import { JobTracker } from "@/components/jobs/job-tracker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/navigation";
import { useEngineAction } from "@/lib/actions/use-engine-action";
import type { KeywordBulkAction } from "@/lib/engine/api";
import type { EngineFailure } from "@/lib/engine/result";
import { tabActions, type KeywordTab } from "@/lib/keywords/tabs";
import { bulkFailureLines } from "@/lib/review/summary";

export type KeywordRow = { id: string; phrase: string; language: string; source: string; status: string; rationale: string | null; uses: number };

type Props = { locale: string; tab: KeywordTab; keywords: KeywordRow[]; languages: string[]; pollSeconds: number; canRequestUpgrade: boolean };

/** Spec v1.1 §6 /keywords: a table per tab; approve, dismiss, restore, propose topics and draft articles for the selected keywords. */
export function KeywordsBoard({ locale, tab, keywords, languages, pollSeconds, canRequestUpgrade }: Props) {
  const t = useTranslations("Keywords");
  const tLanguages = useTranslations("Review.languages");
  const router = useRouter();
  const bulk = useEngineAction(bulkKeywordsAction);
  const topics = useEngineAction(keywordTopicsAction);
  const draft = useEngineAction(draftKeywordArticlesAction);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [failures, setFailures] = useState<{ id: string; title: string; message: string }[]>([]);
  const [error, setError] = useState<EngineFailure | null>(null);
  const [topicsJob, setTopicsJob] = useState<string | null>(null);
  const [topicsReady, setTopicsReady] = useState(false);
  const [draftJob, setDraftJob] = useState<{ jobId: string; count: number } | null>(null);
  const actions = tabActions(tab);
  const chosen = [...selected].filter((id) => keywords.some((keyword) => keyword.id === id));
  const languageLabel = (code: string) => (tLanguages.has(code) ? tLanguages(code) : code);
  const sourceLabel = (source: string) => (t.has(`sources.${source}`) ? t(`sources.${source}`) : source);
  const refresh = useCallback(() => router.refresh(), [router]);
  const showTopicsReady = useCallback(() => setTopicsReady(true), []);

  function toggle(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function move(action: KeywordBulkAction) {
    setError(null);
    const result = await bulk.run({ locale, action, ids: chosen });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setFailures(bulkFailureLines(result.data, keywords.map((keyword) => ({ id: keyword.id, title: keyword.phrase }))));
    setSelected(new Set(result.data.failed.map((failure) => failure.id)));
  }

  async function proposeTopics() {
    setError(null);
    setTopicsReady(false);
    const result = await topics.run({ locale, ids: chosen });
    if (result.ok) setTopicsJob(result.data.jobId);
    else setError(result.error);
  }

  async function draftArticles(language: string): Promise<EngineFailure | null> {
    const result = await draft.run({ locale, ids: chosen, language });
    if (!result.ok) return result.error;
    setDraftJob({ jobId: result.data.jobId, count: result.data.postIds.length });
    setSelected(new Set());
    return null;
  }

  const none = chosen.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {actions.approve && (
          <Button size="sm" data-testid="keywords-approve" disabled={none || bulk.pending} onClick={() => void move("approve")}>
            {t("approve")}
          </Button>
        )}
        {actions.dismiss && (
          <Button size="sm" variant="outline" data-testid="keywords-dismiss" disabled={none || bulk.pending} onClick={() => void move("dismiss")}>
            {t("dismiss")}
          </Button>
        )}
        {actions.restore && (
          <Button size="sm" data-testid="keywords-restore" disabled={none || bulk.pending} onClick={() => void move("restore")}>
            {t("restore")}
          </Button>
        )}
        {actions.topics && (
          <Button size="sm" variant="outline" data-testid="keywords-topics" disabled={none || topics.pending} onClick={() => void proposeTopics()}>
            {t("topics")}
          </Button>
        )}
        {actions.draft && (
          <DraftLanguageDialog
            testId="keywords-draft"
            triggerLabel={t("draft")}
            triggerVariant="secondary"
            triggerSize="sm"
            disabled={none}
            title={t("draftTitle")}
            description={t("draftBody")}
            confirmLabel={t("draftConfirm")}
            languages={languages}
            pending={draft.pending}
            locale={locale}
            canRequestUpgrade={canRequestUpgrade}
            onConfirm={draftArticles}
          />
        )}
      </div>
      {error && <ActionFailure error={error} locale={locale} canRequestUpgrade={canRequestUpgrade} />}
      {failures.length > 0 && (
        <div role="alert" data-testid="bulk-failures" className="rounded-md bg-bad-bg p-3 text-sm text-bad-fg">
          <p className="font-medium">{t("bulkFailed")}</p>
          <ul className="mt-1 list-disc ps-5">
            {failures.map((failure) => (
              <li key={failure.id}>
                <span dir="auto">{failure.title}</span>: {failure.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {topicsJob && <JobTracker key={topicsJob} jobId={topicsJob} pollSeconds={pollSeconds} label={t("proposingTopics")} testId="topics-job" onDone={showTopicsReady} />}
      {topicsReady && (
        <p data-testid="topics-ready" className="text-sm">
          {t("topicsReady")}{" "}
          <Link href="/ideas" data-testid="open-ideas" className="text-primary underline">
            {t("openIdeas")}
          </Link>
        </p>
      )}
      {draftJob && (
        <div className="flex flex-col gap-2">
          <p data-testid="drafts-started" className="text-sm">
            {t("draftsStarted", { count: draftJob.count, n: String(draftJob.count) })}{" "}
            <Link href="/review" className="text-primary underline">
              {t("openReview")}
            </Link>
          </p>
          <JobTracker key={draftJob.jobId} jobId={draftJob.jobId} pollSeconds={pollSeconds} label={t("drafting")} testId="draft-job" onDone={refresh} />
        </div>
      )}
      {keywords.length === 0 ? (
        <p data-testid="keywords-empty" className="text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="w-8 p-2" />
                <th className="p-2 text-start font-medium">{t("columns.phrase")}</th>
                <th className="p-2 text-start font-medium">{t("columns.language")}</th>
                <th className="p-2 text-start font-medium">{t("columns.source")}</th>
                <th className="p-2 text-start font-medium">{t("columns.rationale")}</th>
                <th className="p-2 text-end font-medium">{t("columns.uses")}</th>
              </tr>
            </thead>
            <tbody>
              {keywords.map((keyword) => (
                <tr key={keyword.id} data-testid={`keyword-row-${keyword.id}`} className="border-b border-border">
                  <td className="p-2">
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      data-testid={`keyword-select-${keyword.id}`}
                      aria-label={t("select", { phrase: keyword.phrase })}
                      checked={selected.has(keyword.id)}
                      onChange={(event) => toggle(keyword.id, event.target.checked)}
                    />
                  </td>
                  <td className="p-2">
                    <span data-testid={`keyword-phrase-${keyword.id}`} lang={keyword.language} dir={keyword.language === "ar" ? "rtl" : "ltr"} className="font-medium">
                      {keyword.phrase}
                    </span>
                    {keyword.status === "off_strategy" && (
                      <Badge variant="outline" className="ms-2" data-testid={`keyword-off-strategy-${keyword.id}`}>
                        {t("offStrategy")}
                      </Badge>
                    )}
                  </td>
                  <td className="p-2">{languageLabel(keyword.language)}</td>
                  <td className="p-2">{sourceLabel(keyword.source)}</td>
                  <td className="p-2 text-muted-foreground">{keyword.rationale ?? "—"}</td>
                  <td className="p-2 text-end">{keyword.uses}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

```tsx
// src/components/keywords/keywords-view.tsx
import { EngineNotice } from "@/components/dashboard/engine-notice";
import { Pager } from "@/components/lists/pager";
import { SkippedNote } from "@/components/lists/skipped-note";
import type { AppLocale } from "@/i18n/locales";
import { can } from "@/lib/auth/roles";
import { requirePermission } from "@/lib/auth/session";
import { getEngine } from "@/lib/engine";
import { tryEngine } from "@/lib/engine/result";
import { keywordTab, tabStatuses } from "@/lib/keywords/tabs";
import { pageCount, requestedPage } from "@/lib/lists/paging";
import { AddKeywords } from "./add-keywords";
import { KeywordTabs } from "./keyword-tabs";
import { KeywordsBoard, type KeywordRow } from "./keywords-board";
import { ProposeKeywords } from "./propose-keywords";

type Props = { locale: AppLocale; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Spec v1.1 §6 /keywords: add, propose, and the tab's table, a page at a time. */
export async function KeywordsView({ locale, searchParams }: Props) {
  const session = await requirePermission(locale, "content.work");
  const query = await searchParams;
  const tab = keywordTab(query.tab);
  const page = requestedPage(query.page);
  const engine = await getEngine();
  const meta = await tryEngine(() => engine.meta());
  if (!meta.ok) return <EngineNotice error={meta.error} />;
  const { languages, pollSeconds } = meta.data;
  const list = await tryEngine(() => engine.listKeywords({ statuses: tabStatuses(tab), page, pageSize: meta.data.limits.pageSizeDefault }));
  const canRequestUpgrade = can(session.role, "plan.manage");

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <AddKeywords locale={locale} languages={languages} />
        <ProposeKeywords locale={locale} languages={languages} pollSeconds={pollSeconds} />
      </div>
      <KeywordTabs current={tab} />
      {list.ok ? (
        <>
          <SkippedNote count={list.data.skipped} />
          <KeywordsBoard
            key={tab}
            locale={locale}
            tab={tab}
            keywords={list.data.keywords.map(
              (keyword): KeywordRow => ({
                id: keyword.id,
                phrase: keyword.phrase,
                language: keyword.language,
                source: keyword.source,
                status: keyword.status,
                rationale: keyword.rationale ?? null,
                uses: keyword.uses ?? 0,
              }),
            )}
            languages={languages}
            pollSeconds={pollSeconds}
            canRequestUpgrade={canRequestUpgrade}
          />
          <Pager pathname="/keywords" page={page} pages={pageCount(list.data.meta)} query={{ tab }} />
        </>
      ) : (
        <EngineNotice error={list.error} />
      )}
    </div>
  );
}
```

```tsx
// src/app/[locale]/(app)/keywords/page.tsx
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SectionSkeleton } from "@/components/dashboard/section-skeleton";
import { KeywordsView } from "@/components/keywords/keywords-view";
import { asAppLocale } from "@/i18n/locales";

export default async function KeywordsPage({ params, searchParams }: PageProps<"/[locale]/keywords">) {
  const locale = asAppLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("Keywords");
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl">{t("title")}</h1>
      <Suspense fallback={<SectionSkeleton />}>
        <KeywordsView locale={locale} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm e2e`

Expected:
- **lint and typecheck:** exit 0
- **unit:** PASS, 245 + 4 = 249
- **e2e:** PASS, 76 + 9 = 85

- [ ] **Step 7: Commit**

```bash
git add src messages tests
git commit -m "feat: Keywords page with tabs, adding, approve/dismiss/restore, AI proposals, topics and drafting with a language choice"
```

---

### Task 7: The Topic ideas page

**Files:**
- Create:
  - `src/app/[locale]/(app)/ideas/page.tsx`
  - `src/components/ideas/ideas-view.tsx`, `src/components/ideas/ideas-board.tsx`, `src/components/ideas/suggestion-card.tsx`, `src/components/ideas/new-request-form.tsx`
- Modify: `src/lib/drafting/choices.ts`, `src/components/shell/nav.ts`, `messages/en.json`, `messages/ar.json`
- Test: `tests/unit/keyword-tabs.test.ts` (append), `tests/e2e/ideas.spec.ts` (create)

**Interfaces:**
- Consumes:
  - Task 1 `listSuggestions`, `Suggestion`, `DraftRequest`
  - Task 4 `JobTracker`; Task 5 idea actions and `ActionFailure`
  - Task 6 `DraftLanguageDialog`, `draftLanguageOptions`
  - M2a `AutoRefresh`
- Produces:
  - **Helper:** `platformsFor(kind, platforms)`: an article goes to `website`, a social post to the other platforms
  - **Navigation:** nav item `ideas`
  - **Test ids:**
    - cards: `idea-card-{id}`, `idea-select-{id}`, `idea-title-{id}`, `idea-draft-{id}` (dialog), `idea-dismiss-{id}`, `idea-drafting-{id}`, `idea-drafted-{id}`, `idea-post-{postId}`, `ideas-empty`
    - bulk: `ideas-draft-selected` (dialog), `ideas-dismiss-selected`
    - request form: `request-topic`, `request-kind`, `request-platform`, `request-language`, `request-tone`, `request-keywords`, `request-submit`, `request-started`, `request-job`

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/keyword-tabs.test.ts`:

```ts
describe("new-request platforms (spec v1.1 §4 Post.platform)", () => {
  it("sends an article to the website and a social post to a social platform", () => {
    const platforms = ["website", "linkedin", "instagram"];
    expect([platformsFor("blog", platforms), platformsFor("social", platforms)]).toEqual([["website"], ["linkedin", "instagram"]]);
  });
});
```

and change its first import to `import { draftLanguageOptions, platformsFor } from "@/lib/drafting/choices";`.

```ts
// tests/e2e/ideas.spec.ts
import { expect, test } from "@playwright/test";
import { isolateMockStore, setMockScenario, signInWithCookie } from "./helpers";

test.beforeEach(async ({ context }) => {
  await isolateMockStore(context);
  await signInWithCookie(context, "dev_reviewer");
});

test("cards show the title, type, keywords and why; Arabic reads right to left; a drafted idea links to its drafts", async ({ page }) => {
  await page.goto("/en/ideas");
  const card = page.getByTestId("idea-card-sg_1");
  await expect(card).toContainText("Article");
  await expect(card).toContainText("end of service gratuity calculator uae");
  await expect(card).toContainText("Why: Keyword proposed, not covered yet");
  await expect(page.getByTestId("idea-title-sg_4")).toHaveAttribute("dir", "rtl");
  await expect(page.getByTestId("idea-post-p_201")).toHaveAttribute("href", "/en/review/p_201");
  await expect(page.getByTestId("idea-card-sg_6")).toHaveCount(0);
});

test("drafting an idea in both languages makes a linked pair that arrives in Review (Review Focus 5)", async ({ page }) => {
  await page.goto("/en/ideas");
  await page.getByTestId("idea-draft-sg_2").click();
  await page.getByTestId("idea-draft-sg_2-language-both").check();
  await page.getByTestId("idea-draft-sg_2-confirm").click();
  await expect(page.getByTestId("idea-drafting-sg_2")).toBeVisible();
  await expect(page.getByTestId("idea-drafted-sg_2")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("idea-card-sg_2").locator('[data-testid^="idea-post-"]')).toHaveCount(2);
  await page.goto("/en/review");
  await expect(page.locator('[data-testid^="card-title-"]', { hasText: "What a shareholders' agreement should say about deadlock" })).toHaveCount(2);
});

test("dismisses one idea, then two more in bulk", async ({ page }) => {
  await page.goto("/en/ideas");
  await page.getByTestId("idea-dismiss-sg_1").click();
  await expect(page.getByTestId("idea-card-sg_1")).toHaveCount(0);
  await page.getByTestId("idea-select-sg_2").check();
  await page.getByTestId("idea-select-sg_3").check();
  await page.getByTestId("ideas-dismiss-selected").click();
  await expect(page.getByTestId("idea-card-sg_2")).toHaveCount(0);
  await expect(page.getByTestId("idea-card-sg_3")).toHaveCount(0);
});

test("bulk drafting starts every selected idea", async ({ page }) => {
  await page.goto("/en/ideas");
  await page.getByTestId("idea-select-sg_1").check();
  await page.getByTestId("idea-select-sg_3").check();
  await page.getByTestId("ideas-draft-selected").click();
  await page.getByTestId("ideas-draft-selected-confirm").click();
  await expect(page.getByTestId("idea-drafting-sg_1").or(page.getByTestId("idea-drafted-sg_1"))).toBeVisible();
  await expect(page.getByTestId("idea-drafting-sg_3").or(page.getByTestId("idea-drafted-sg_3"))).toBeVisible();
});

test("a new request starts a draft that arrives in Review", async ({ page }) => {
  await page.goto("/en/ideas");
  await page.getByTestId("request-topic").fill("Annual leave rules for part-time staff");
  await page.getByTestId("request-submit").click();
  await expect(page.getByTestId("request-started")).toContainText("Drafting 1 post");
  await expect(page.getByTestId("request-job")).toHaveAttribute("data-state", "done", { timeout: 15_000 });
  await page.goto("/en/review");
  await expect(page.getByText("Annual leave rules for part-time staff", { exact: true })).toBeVisible();
});

test("an article goes to the website and a social post to a social platform", async ({ page }) => {
  await page.goto("/en/ideas");
  await expect(page.getByTestId("request-platform").locator("option")).toHaveText(["Website"]);
  await page.getByTestId("request-kind").selectOption("social");
  await expect(page.getByTestId("request-platform").locator("option")).toHaveText(["LinkedIn", "Instagram"]);
});

test("with the monthly limit reached, drafting an idea or a new request shows the limit (Review Focus 1)", async ({ page, context }) => {
  await setMockScenario(context, "quota");
  await page.goto("/en/ideas");
  await page.getByTestId("idea-draft-sg_1").click();
  await page.getByTestId("idea-draft-sg_1-confirm").click();
  await expect(page.getByTestId("quota-exceeded")).toContainText("Monthly limit reached for Articles");
  await expect(page.getByTestId("ask-admin")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByTestId("request-topic").fill("Gratuity");
  await page.getByTestId("request-submit").click();
  await expect(page.getByTestId("quota-exceeded")).toBeVisible();
});

test("topics proposed from Keywords show up as new ideas", async ({ page }) => {
  await page.goto("/en/keywords");
  await page.getByTestId("keyword-select-kw_5").check();
  await page.getByTestId("keywords-topics").click();
  await expect(page.getByTestId("topics-ready")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("open-ideas").click();
  await expect(page.getByText("What to know about shareholder deadlock uae").filter({ visible: true })).toBeVisible();
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test tests/unit/keyword-tabs.test.ts`
Expected: FAIL. `platformsFor` isn't exported.

Then add `platformsFor` (Step 3), and run: `pnpm e2e tests/e2e/ideas.spec.ts`
Expected: FAIL. `/en/ideas` is a 404.

- [ ] **Step 3: Add the platform rule, the messages and the nav item**

Append to `src/lib/drafting/choices.ts`:

```ts
/** Where a new draft can go: an article to the website, a social post to the social platforms (from /meta.platforms). */
export function platformsFor(kind: string, platforms: string[]): string[] {
  return kind === "blog" ? platforms.filter((platform) => platform === "website") : platforms.filter((platform) => platform !== "website");
}
```

In `src/components/shell/nav.ts`, add `{ key: "ideas", href: "/ideas", permission: "content.work" },` after `keywords`.

`messages/en.json`:
- inside `Shell.nav`, add `"ideas": "Topic ideas"`
- at the top level, add:

```json
  "Ideas": {
    "title": "Topic ideas",
    "empty": "No topic ideas yet. Propose topics from Keywords, or start a new request.",
    "why": "Why: {why}",
    "statuses": { "drafting": "Drafting…", "drafted": "Drafted" },
    "openDraft": "Open draft {n}",
    "select": "Select “{title}”",
    "draft": "Draft",
    "draftTitle": "Draft this topic?",
    "draftBody": "Choose the language. Both languages makes an English and an Arabic version that are linked.",
    "draftConfirm": "Start drafting",
    "dismiss": "Dismiss",
    "draftSelected": "Draft selected ({count})",
    "dismissSelected": "Dismiss selected ({count})",
    "bulkFailed": "Not done:",
    "request": {
      "title": "New request",
      "hint": "Ask for an article or a social post on any topic.",
      "topic": "Topic",
      "kind": "Type",
      "platform": "Platform",
      "language": "Language",
      "tone": "Tone (optional)",
      "keywords": "Keywords (optional)",
      "keywordsHint": "Separate them with commas. Leave empty and the engine proposes them.",
      "submit": "Start drafting",
      "started": "{count, plural, one {Drafting {n} post. It will appear in Review.} other {Drafting {n} posts. They will appear in Review.}}",
      "openReview": "Open Review",
      "running": "Drafting…"
    }
  }
```

`messages/ar.json`:
- inside `Shell.nav`, add `"ideas": "أفكار المواضيع"`
- at the top level, add:

```json
  "Ideas": {
    "title": "أفكار المواضيع",
    "empty": "لا توجد أفكار مواضيع بعد. اقترح مواضيع من الكلمات المفتاحية أو ابدأ طلباً جديداً.",
    "why": "السبب: {why}",
    "statuses": { "drafting": "جارٍ الصياغة…", "drafted": "تمت الصياغة" },
    "openDraft": "فتح المسودة {n}",
    "select": "تحديد «{title}»",
    "draft": "صياغة",
    "draftTitle": "صياغة هذا الموضوع؟",
    "draftBody": "اختر اللغة. خيار «اللغتان» يصوغ نسخة إنجليزية وأخرى عربية مرتبطتين.",
    "draftConfirm": "بدء الصياغة",
    "dismiss": "استبعاد",
    "draftSelected": "صياغة المحدد ({count})",
    "dismissSelected": "استبعاد المحدد ({count})",
    "bulkFailed": "لم يتم:",
    "request": {
      "title": "طلب جديد",
      "hint": "اطلب مقالاً أو منشور تواصل عن أي موضوع.",
      "topic": "الموضوع",
      "kind": "النوع",
      "platform": "المنصة",
      "language": "اللغة",
      "tone": "الأسلوب (اختياري)",
      "keywords": "الكلمات المفتاحية (اختياري)",
      "keywordsHint": "افصل بينها بفواصل. اتركها فارغة ويقترحها المحرك.",
      "submit": "بدء الصياغة",
      "started": "{count, plural, one {جارٍ صياغة منشور واحد، وسيظهر في المراجعة.} two {جارٍ صياغة منشورين، وسيظهران في المراجعة.} few {جارٍ صياغة {n} منشورات، وستظهر في المراجعة.} many {جارٍ صياغة {n} منشوراً، وستظهر في المراجعة.} other {جارٍ صياغة {n} منشور، وستظهر في المراجعة.}}",
      "openReview": "فتح المراجعة",
      "running": "جارٍ الصياغة…"
    }
  }
```

- [ ] **Step 4: Add the Topic ideas components**

```tsx
// src/components/ideas/suggestion-card.tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { dismissSuggestionAction, draftSuggestionAction } from "@/app/[locale]/(app)/ideas/actions";
import { ActionFailure } from "@/components/actions/action-failure";
import { DraftLanguageDialog } from "@/components/drafting/draft-language-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { useEngineAction } from "@/lib/actions/use-engine-action";
import type { EngineFailure } from "@/lib/engine/result";
import type { Suggestion } from "@/lib/engine/schemas";

type Props = {
  locale: string;
  idea: Suggestion;
  languages: string[];
  canRequestUpgrade: boolean;
  selected: boolean;
  onSelect: (checked: boolean) => void;
};

/** Spec v1.1 §6 /suggestions: title, type, language, keywords and why; Draft or Dismiss; a drafted idea links to its drafts. */
export function SuggestionCard({ locale, idea, languages, canRequestUpgrade, selected, onSelect }: Props) {
  const t = useTranslations("Ideas");
  const tReview = useTranslations("Review");
  const draft = useEngineAction(draftSuggestionAction);
  const dismiss = useEngineAction(dismissSuggestionAction);
  const [error, setError] = useState<EngineFailure | null>(null);
  const label = (group: "languages" | "kinds", code: string) => (tReview.has(`${group}.${code}`) ? tReview(`${group}.${code}`) : code);
  const isNew = idea.status === "new";

  async function draftIdea(language: string): Promise<EngineFailure | null> {
    const result = await draft.run({ locale, suggestionId: idea.id, language });
    return result.ok ? null : result.error;
  }

  async function dismissIdea() {
    setError(null);
    const result = await dismiss.run({ locale, suggestionId: idea.id });
    if (!result.ok) setError(result.error);
  }

  return (
    <Card data-testid={`idea-card-${idea.id}`}>
      <CardHeader className="flex flex-row items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 size-4 accent-primary"
          data-testid={`idea-select-${idea.id}`}
          aria-label={t("select", { title: idea.title })}
          checked={selected}
          disabled={!isNew}
          onChange={(event) => onSelect(event.target.checked)}
        />
        <div className="flex min-w-0 flex-col gap-2">
          <h2 data-testid={`idea-title-${idea.id}`} lang={idea.language} dir={idea.language === "ar" ? "rtl" : "ltr"} className="font-heading text-lg">
            {idea.title}
          </h2>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="secondary">{label("kinds", idea.kind)}</Badge>
            <Badge variant="outline">{label("languages", idea.language)}</Badge>
            {idea.keywords.map((keyword) => (
              <Badge key={keyword} variant="outline" dir="auto">
                {keyword}
              </Badge>
            ))}
            {idea.status === "drafted" && (
              <Badge variant="secondary" data-testid={`idea-drafted-${idea.id}`}>
                {t("statuses.drafted")}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {idea.why && <p className="text-muted-foreground">{t("why", { why: idea.why })}</p>}
        {idea.status === "drafting" && (
          <span data-testid={`idea-drafting-${idea.id}`} className="inline-flex items-center gap-2 text-muted-foreground">
            <span className="size-3 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" aria-hidden="true" />
            {t("statuses.drafting")}
          </span>
        )}
        {idea.postIds.length > 0 && (
          <ul className="flex flex-wrap gap-3">
            {idea.postIds.map((postId, index) => (
              <li key={postId}>
                <Link href={`/review/${postId}`} data-testid={`idea-post-${postId}`} className="text-primary underline">
                  {t("openDraft", { n: String(index + 1) })}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {isNew && (
          <div className="flex flex-wrap gap-2">
            <DraftLanguageDialog
              testId={`idea-draft-${idea.id}`}
              triggerLabel={t("draft")}
              triggerSize="sm"
              title={t("draftTitle")}
              description={t("draftBody")}
              confirmLabel={t("draftConfirm")}
              languages={languages}
              pending={draft.pending}
              locale={locale}
              canRequestUpgrade={canRequestUpgrade}
              onConfirm={draftIdea}
            />
            <Button size="sm" variant="outline" data-testid={`idea-dismiss-${idea.id}`} disabled={dismiss.pending} onClick={() => void dismissIdea()}>
              {t("dismiss")}
            </Button>
          </div>
        )}
        {error && <ActionFailure error={error} locale={locale} canRequestUpgrade={canRequestUpgrade} />}
      </CardContent>
    </Card>
  );
}
```

```tsx
// src/components/ideas/ideas-board.tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { bulkSuggestionsAction } from "@/app/[locale]/(app)/ideas/actions";
import { ActionFailure } from "@/components/actions/action-failure";
import { DraftLanguageDialog } from "@/components/drafting/draft-language-dialog";
import { AutoRefresh } from "@/components/review/auto-refresh";
import { Button } from "@/components/ui/button";
import { useEngineAction } from "@/lib/actions/use-engine-action";
import type { SuggestionBulkAction } from "@/lib/engine/api";
import type { EngineFailure } from "@/lib/engine/result";
import type { Suggestion } from "@/lib/engine/schemas";
import { bulkFailureLines } from "@/lib/review/summary";
import { SuggestionCard } from "./suggestion-card";

type Props = { locale: string; ideas: Suggestion[]; languages: string[]; pollSeconds: number; canRequestUpgrade: boolean };

/** Spec v1.1 §6 /suggestions: topic cards; Draft (en, ar or both) or Dismiss, one by one or in bulk. */
export function IdeasBoard({ locale, ideas, languages, pollSeconds, canRequestUpgrade }: Props) {
  const t = useTranslations("Ideas");
  const bulk = useEngineAction(bulkSuggestionsAction);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [failures, setFailures] = useState<{ id: string; title: string; message: string }[]>([]);
  const [error, setError] = useState<EngineFailure | null>(null);
  const chosen = [...selected].filter((id) => ideas.some((idea) => idea.id === id && idea.status === "new"));

  function toggle(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function runBulk(action: SuggestionBulkAction, language?: string): Promise<EngineFailure | null> {
    setError(null);
    const result = await bulk.run({ locale, action, ids: chosen, language });
    if (!result.ok) return result.error;
    setFailures(bulkFailureLines(result.data, ideas));
    setSelected(new Set(result.data.failed.map((failure) => failure.id)));
    return null;
  }

  async function dismissSelected() {
    const failure = await runBulk("dismiss");
    if (failure) setError(failure);
  }

  if (ideas.length === 0) {
    return (
      <p data-testid="ideas-empty" className="text-muted-foreground">
        {t("empty")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {ideas.some((idea) => idea.status === "drafting") && <AutoRefresh seconds={pollSeconds} />}
      <div className="flex flex-wrap items-center gap-2">
        <DraftLanguageDialog
          testId="ideas-draft-selected"
          triggerLabel={t("draftSelected", { count: String(chosen.length) })}
          triggerSize="sm"
          disabled={chosen.length === 0}
          title={t("draftTitle")}
          description={t("draftBody")}
          confirmLabel={t("draftConfirm")}
          languages={languages}
          pending={bulk.pending}
          locale={locale}
          canRequestUpgrade={canRequestUpgrade}
          onConfirm={(language) => runBulk("draft", language)}
        />
        <Button size="sm" variant="outline" data-testid="ideas-dismiss-selected" disabled={chosen.length === 0 || bulk.pending} onClick={() => void dismissSelected()}>
          {t("dismissSelected", { count: String(chosen.length) })}
        </Button>
      </div>
      {error && <ActionFailure error={error} locale={locale} canRequestUpgrade={canRequestUpgrade} />}
      {failures.length > 0 && (
        <div role="alert" data-testid="bulk-failures" className="rounded-md bg-bad-bg p-3 text-sm text-bad-fg">
          <p className="font-medium">{t("bulkFailed")}</p>
          <ul className="mt-1 list-disc ps-5">
            {failures.map((failure) => (
              <li key={failure.id}>
                <span dir="auto">{failure.title}</span>: {failure.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {ideas.map((idea) => (
          <SuggestionCard
            key={idea.id}
            locale={locale}
            idea={idea}
            languages={languages}
            canRequestUpgrade={canRequestUpgrade}
            selected={selected.has(idea.id)}
            onSelect={(checked) => toggle(idea.id, checked)}
          />
        ))}
      </div>
    </div>
  );
}
```

```tsx
// src/components/ideas/new-request-form.tsx
"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { createDraftsAction } from "@/app/[locale]/(app)/ideas/actions";
import { ActionFailure } from "@/components/actions/action-failure";
import { JobTracker } from "@/components/jobs/job-tracker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, useRouter } from "@/i18n/navigation";
import { useEngineAction } from "@/lib/actions/use-engine-action";
import { draftLanguageOptions, platformsFor } from "@/lib/drafting/choices";
import type { EngineFailure } from "@/lib/engine/result";
import { parsePhrases } from "@/lib/keywords/phrases";

type Props = { locale: string; kinds: string[]; platforms: string[]; languages: string[]; pollSeconds: number; canRequestUpgrade: boolean };

const SELECT = "h-9 rounded-md border border-input bg-card px-3 text-sm";

/** Spec v1.1 §6 "New request": topic, type, platform, language (en, ar or both), tone and optional keywords → POST …/drafts. */
export function NewRequestForm({ locale, kinds, platforms, languages, pollSeconds, canRequestUpgrade }: Props) {
  const t = useTranslations("Ideas.request");
  const tReview = useTranslations("Review");
  const tDrafting = useTranslations("Drafting");
  const router = useRouter();
  const create = useEngineAction(createDraftsAction);
  const [topic, setTopic] = useState("");
  const [kind, setKind] = useState(kinds[0] ?? "");
  const [platform, setPlatform] = useState("");
  const [language, setLanguage] = useState(draftLanguageOptions(languages)[0] ?? "");
  const [tone, setTone] = useState("");
  const [keywords, setKeywords] = useState("");
  const [started, setStarted] = useState<{ jobId: string; count: number } | null>(null);
  const [error, setError] = useState<EngineFailure | null>(null);
  const refresh = useCallback(() => router.refresh(), [router]);
  const platformChoices = platformsFor(kind, platforms);
  const chosenPlatform = platformChoices.includes(platform) ? platform : (platformChoices[0] ?? "");
  const label = (group: "kinds" | "platforms" | "languages", code: string) => (tReview.has(`${group}.${code}`) ? tReview(`${group}.${code}`) : code);

  async function submit() {
    setError(null);
    const phrases = parsePhrases(keywords);
    const request = {
      topic: topic.trim(),
      kind,
      platform: chosenPlatform,
      language,
      ...(tone.trim() ? { tone: tone.trim() } : {}),
      ...(phrases.length > 0 ? { keywords: phrases } : {}),
    };
    const result = await create.run({ locale, request });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setStarted({ jobId: result.data.jobId, count: result.data.postIds.length });
    setTopic("");
    setTone("");
    setKeywords("");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("hint")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="request-topic">{t("topic")}</Label>
          <Input id="request-topic" data-testid="request-topic" dir="auto" value={topic} onChange={(event) => setTopic(event.target.value)} />
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="request-kind">{t("kind")}</Label>
            <select id="request-kind" data-testid="request-kind" className={SELECT} value={kind} onChange={(event) => setKind(event.target.value)}>
              {kinds.map((code) => (
                <option key={code} value={code}>
                  {label("kinds", code)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="request-platform">{t("platform")}</Label>
            <select id="request-platform" data-testid="request-platform" className={SELECT} value={chosenPlatform} onChange={(event) => setPlatform(event.target.value)}>
              {platformChoices.map((code) => (
                <option key={code} value={code}>
                  {label("platforms", code)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="request-language">{t("language")}</Label>
            <select id="request-language" data-testid="request-language" className={SELECT} value={language} onChange={(event) => setLanguage(event.target.value)}>
              {draftLanguageOptions(languages).map((code) => (
                <option key={code} value={code}>
                  {code === "both" ? tDrafting("both") : label("languages", code)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="request-tone">{t("tone")}</Label>
          <Input id="request-tone" data-testid="request-tone" value={tone} onChange={(event) => setTone(event.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="request-keywords">{t("keywords")}</Label>
          <Input id="request-keywords" data-testid="request-keywords" dir="auto" value={keywords} onChange={(event) => setKeywords(event.target.value)} />
          <p className="text-xs text-muted-foreground">{t("keywordsHint")}</p>
        </div>
        <div>
          <Button data-testid="request-submit" disabled={!topic.trim() || !chosenPlatform || create.pending} onClick={() => void submit()}>
            {t("submit")}
          </Button>
        </div>
        {error && <ActionFailure error={error} locale={locale} canRequestUpgrade={canRequestUpgrade} />}
        {error?.fields && (
          <ul className="list-disc ps-5 text-sm text-bad-fg">
            {Object.entries(error.fields).map(([field, message]) => (
              <li key={field} data-testid={`request-error-${field}`}>
                {t.has(field) ? t(field) : field}: {message}
              </li>
            ))}
          </ul>
        )}
        {started && (
          <div className="flex flex-col gap-2">
            <p data-testid="request-started" className="text-sm">
              {t("started", { count: started.count, n: String(started.count) })}{" "}
              <Link href="/review" className="text-primary underline">
                {t("openReview")}
              </Link>
            </p>
            <JobTracker key={started.jobId} jobId={started.jobId} pollSeconds={pollSeconds} label={t("running")} testId="request-job" onDone={refresh} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

```tsx
// src/components/ideas/ideas-view.tsx
import { EngineNotice } from "@/components/dashboard/engine-notice";
import { SkippedNote } from "@/components/lists/skipped-note";
import type { AppLocale } from "@/i18n/locales";
import { can } from "@/lib/auth/roles";
import { requirePermission } from "@/lib/auth/session";
import { getEngine } from "@/lib/engine";
import { tryEngine } from "@/lib/engine/result";
import { IdeasBoard } from "./ideas-board";
import { NewRequestForm } from "./new-request-form";

/** Spec v1.1 §6 /suggestions: the new-request form and the topic cards (dismissed ideas are left out). */
export async function IdeasView({ locale }: { locale: AppLocale }) {
  const session = await requirePermission(locale, "content.work");
  const engine = await getEngine();
  const meta = await tryEngine(() => engine.meta());
  if (!meta.ok) return <EngineNotice error={meta.error} />;
  const list = await tryEngine(() => engine.listSuggestions({ statuses: ["new", "drafting", "drafted"] }));
  const canRequestUpgrade = can(session.role, "plan.manage");
  const { languages, kinds, platforms, pollSeconds } = meta.data;

  return (
    <div className="flex flex-col gap-6">
      <NewRequestForm locale={locale} kinds={kinds} platforms={platforms} languages={languages} pollSeconds={pollSeconds} canRequestUpgrade={canRequestUpgrade} />
      {list.ok ? (
        <>
          <SkippedNote count={list.data.skipped} />
          <IdeasBoard locale={locale} ideas={list.data.suggestions} languages={languages} pollSeconds={pollSeconds} canRequestUpgrade={canRequestUpgrade} />
        </>
      ) : (
        <EngineNotice error={list.error} />
      )}
    </div>
  );
}
```

```tsx
// src/app/[locale]/(app)/ideas/page.tsx
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SectionSkeleton } from "@/components/dashboard/section-skeleton";
import { IdeasView } from "@/components/ideas/ideas-view";
import { asAppLocale } from "@/i18n/locales";

export default async function IdeasPage({ params }: PageProps<"/[locale]/ideas">) {
  const locale = asAppLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("Ideas");
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl">{t("title")}</h1>
      <Suspense fallback={<SectionSkeleton />}>
        <IdeasView locale={locale} />
      </Suspense>
    </div>
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm e2e`

Expected:
- **lint and typecheck:** exit 0
- **unit:** PASS, 249 + 1 = 250
- **e2e:** PASS, 85 + 8 = 93

- [ ] **Step 6: Commit**

```bash
git add src messages tests
git commit -m "feat: Topic ideas page with drafting in en/ar/both, dismissing, bulk actions and a new-request form"
```

---

### Task 8: M3a wrap-up and full verification

**Files:**
- Create: `docs/plans/2026-10-22-m3a-followups.md`
- Modify: `README.md`, `docs/plans/2026-10-22-m2a-followups.md`

**Interfaces:**
- Consumes: everything above
- Produces: a documented, fully green M3a

- [ ] **Step 1: Document M3a in `README.md`**

Append:

```markdown
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
```

- [ ] **Step 2: Update the follow-up docs**

In `docs/plans/2026-10-22-m2a-followups.md`, append ` — job polling moved to /api/jobs/[id] in M3a (the editor's StatusWatcher still checks the post through a server action)` to the item about polling through server actions.

Create `docs/plans/2026-10-22-m3a-followups.md`:

```markdown
# M3a follow-ups

## Questions for Quantum1st (from M3a)

- `POST …/keywords` says "duplicates skipped and listed". The portal works out the skipped phrases itself, from what it sent minus what came back. If the engine lists them, where (`meta`, `details`)?
- `POST …/suggestions/{id}/draft` takes an optional `platform`. Which platform does the engine pick for a social suggestion when it's left out?
- Can topics (`…/keywords/topics`) and article drafts (`…/keywords/draft-articles`) start from covered keywords too? The portal offers them on New and In use only.
- What do finished jobs return in `result` for proposals, topics and drafts? The mock returns `{keywordIds}`, `{suggestionIds}` and `{postIds}`.
- Confirm 429 `details` is `{metric, used, limit}` for every metered action, and which metric drafting a social post counts against.
```

- [ ] **Step 3: Run every check from a clean build**

```bash
rm -rf .next
pnpm lint && pnpm typecheck && pnpm test && pnpm e2e && ALLOW_TEST_LOGINS=1 pnpm build
```

Expected:
- lint and typecheck exit 0
- Vitest: 250 passed
- Playwright: 93 passed
- the build lists `◐ /en/keywords`, `◐ /ar/keywords`, `◐ /en/ideas` and `◐ /ar/ideas`, and `ƒ /api/jobs/[id]`

- [ ] **Step 4: Manual smoke test**

Run `pnpm dev`, sign in as **Reviewer**, and check:
- (a) **Keywords tabs:** `/en/keywords` shows New (kw_3, kw_5, kw_6, kw_7). Dismissed shows kw_9 with "Outside the strategy".
- (b) **Add:** adding "labour court claims dubai, Commission UAE labour law" adds 1 and names the other.
- (c) **Draft articles:** selecting kw_5 → Draft articles → Both languages shows the progress bar. `/en/review` then shows two "Shareholder deadlock uae: what you need to know" cards with a pair badge.
- (d) **Topic ideas:** `/en/ideas` shows the cards with the Arabic one right to left. Draft on sg_2 shows "Drafting…", then "Drafted" with two links.
- (e) **Arabic:** `/ar/keywords` and `/ar/ideas` are right to left.
- (f) **Dev console:** no console errors, no dev overlay, and no errors in the `pnpm dev` log.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: M3a decisions and questions for Quantum1st; keywords and topic ideas complete"
git log --oneline | head -12
```
