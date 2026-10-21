# M4a: Site Health, Plan & Usage, and Social Post Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first half of design §13 M4:
- **`/site-health`:**
  - Scan site (a job).
  - A findings table: URL, level, issue, proposed fix, status.
  - Prepare fixes for selected findings (a job).
  - Apply (Admin only: it changes the live website) and Dismiss, per finding.
- **`/plan`** (Admin):
  - The plan's name and period.
  - Account-wide quota bars with this site's share.
  - This site's monthly usage chart.
  - This site's results.
  - Request upgrade with a note.
- **Social post editing:**
  - Hashtags as tidy chips.
  - A caption preview with a character count.
  - An Instagram post can't be approved or published without a photo.

It also folds in deferred quota items:
- the dashboard shows this site's share of usage (M1)
- a limit of 0 counts as reached (M1)
- a 429 without a metric reads sensibly (M3a)
- the AI proposal buttons (keywords, SEO profile) get the quota message with the role's next step (M3a, M3b)

M4b (users, the webhook receiver with the database, email notifications) gets its own plan.

**Architecture:**
- **Mock engine:** it gains a small site-health store (findings with statuses, a scan job that adds a finding, a fix-preparation job, and bulk apply/dismiss with refusals) and a usage generator.
- **Pages:** server-rendered under `<Suspense>`, with client boards for buttons and jobs, like `/keywords`.
- **Quota bars:** pulled out of the dashboard into one component that both the dashboard and `/plan` use.

**Tech Stack:** Next.js 16.4 (App Router, Cache Components), React 19.3, TypeScript 5, next-intl 4.14, Zod 4.6, shadcn/ui, Vitest 5, Playwright 1.64. No new dependencies: the usage chart is plain HTML and CSS.

**Spec:**
- `docs/specs/2026-10-21-marketing-dashboard-design.md`:
  - §5 roles: site health view for both roles, apply Admin only; plan & upgrade Admin only
  - §7 screens: `/site-health`, `/plan`
  - §8 slow AI jobs (scans, fix preparation)
  - §9 errors (429)
- `docs/specs/Marketing Portal Build Spec v1.1.html`:
  - §2 nothing hard-coded
  - §4 Plan & Quota, SiteFinding, Post (`hashtags` social only; Instagram needs an image)
  - §6 `/site-health`, `/account` Plan & usage tab, the editor (hashtags for social posts)
  - §7 site and account endpoints
  - §10 acceptance ("Quota bars match /account/plan", "No quota numbers or metric names are hard-coded")
- Follow-ups: `docs/plans/2026-10-21-m1-followups.md`, `2026-10-22-m3a-followups.md` and `2026-10-22-m3b-followups.md`

## Global Constraints

- **Earlier constraints still hold:** all M1–M3b Global Constraints. In particular:
  - Cache Components: runtime data, including `searchParams`, only inside `<Suspense>`
  - the engine key stays server-only
  - Latin digits and logical CSS
  - never "law firm": Fakher & Co is a "legal consultancy", including in mock findings and fixes
  - changes go through server actions with role check, Zod, `X-Acting-User`, key and `ActionResult`, via `useEngineAction`
  - lists are parsed leniently, with `SkippedNote`
  - every e2e test isolates the mock store
- **No new packages.**
- **Roles (design §5):**
  - `/site-health` needs `siteHealth.view` (both roles). Scanning, preparing fixes and dismissing also need it.
  - Applying a fix needs `siteHealth.apply` (Admin only). Reviewers don't see Apply, and the action refuses them.
  - `/plan` and Request upgrade need `plan.manage` (Admin only).
- **Nothing hard-coded (spec §2, §10):**
  - Quota rows, limits, modes and `warnAt` come from `/account/plan`, and the usage chart's metrics from `/account/plan.metrics`.
  - Usage numbers come from `/account/usage` (this key's site only).
  - An unknown metric shows its raw name.
  - Page sizes and the poll interval come from `/meta`.
  - **Fixed lists (spec §4 enumerations, like M3a's keyword tabs):**
    - The finding tabs are To do (`open`, `prepared`), Applied (`applied`) and Dismissed (`dismissed`).
    - An unknown status still shows, as raw text.
- **Months:**
  - The usage chart covers the 6 months ending with the plan period's month, read as `YYYY-MM` from `plan.period.start`. It's never worked out from the browser's clock.
  - A month with no numbers shows 0.
- **Hashtags (spec §4: social posts only):**
  - Each starts with `#`, has no spaces or punctuation (letters, digits and `_`, any script), and appears once, ignoring case.
  - Typing `dubai labour` adds `#dubai` and `#labour`.
- **Instagram needs a photo (spec §4 Post.image):** Approve and Publish now are disabled while an Instagram post has no photo, with the reason shown. The engine still refuses it (400) if asked.
- **Mock-only behaviour, checked at M5:**
  - A scan adds one finding.
  - Fix preparation fills `fix` with a proposed text.
  - Apply needs status `prepared`; dismiss needs `open` or `prepared`.
  - The usage numbers are fixed for May–October 2026.
  - **Quota scenario:**
    - scans are refused with `siteScans`
    - AI proposals (keywords, SEO profile) are refused with `aiTokens`
    - drafting is refused with `articles`, as before

## Review Focus

1. **Applying a fix changes the live website:**
   - Only an Admin sees Apply; a Reviewer gets neither the button nor the action.
   - Apply asks for confirmation first.
   - It's offered only for a prepared fix, and a refusal names the finding.
   - *Pinned by:* Task 4 unit tests (`findingActions`, permission) and Task 4 e2e.
2. **Scans and fix preparation are slow jobs:** progress shows, and the table refreshes when they finish. A scan over the monthly limit shows the 429 message, with Request upgrade for an Admin and "Ask your admin" for a Reviewer.
   - *Pinned by:* Task 2 store tests and Task 4 e2e.
3. **Plan and usage numbers come only from the engine:**
   - An unknown metric shows its raw name.
   - `null` is unlimited, and a limit of 0 counts as reached.
   - A month with no numbers shows 0.
   - This site's share is read for the plan period's month.
   - *Pinned by:* Task 3 and Task 5 unit tests, and Task 3 and Task 5 e2e.
4. **An Instagram post without a photo can't be approved or published.** The reason shows next to the buttons, and adding a photo enables them.
   - *Pinned by:* Task 6 unit test (`needsPhoto`) and Task 6 e2e.
5. **Arabic:**
   - An Arabic finding, an Arabic caption and Arabic month names read right to left.
   - Numbers use Latin digits.
   - Hashtags in Arabic script are kept, like `#عقارات_دبي`.
   - *Pinned by:* Task 5 and Task 6 unit tests, and Task 4 and Task 5 e2e.

## File map (new unless marked)

```
src/lib/engine/schemas.ts                       (modify) SiteFinding, Usage
src/lib/engine/api.ts                           (modify) listFindings, scanSite, prepareFixes, bulkFindings, usage
src/lib/engine/mock/site-health.ts              seeded findings and the site-health store
src/lib/engine/mock/usage.ts                    this site's monthly usage in the mock
src/lib/engine/mock/fixtures.ts                 (modify) siteScans and aiTokens quotas
src/lib/engine/mock/store.ts                    (modify) findings, scan and fix jobs
src/lib/engine/mock/server.ts                   (modify) site-health and usage routes; quota scenario for scans and proposals
src/lib/dashboard/quota.ts                      (modify) a limit of 0 is reached; quotaMetric
src/lib/plan/usage.ts                           months, this site's metrics, chart series (pure)
src/lib/format/datetime.ts                      (modify) formatDate, formatMonth
src/lib/site-health/findings.ts                 tabs ↔ statuses, actions per finding (pure)
src/lib/posts/social.ts                         hashtags, caption, caption length (pure)
src/lib/posts/rules.ts                          (modify) needsPhoto
src/components/dashboard/quota-bars.tsx         the quota list, shared by the dashboard and /plan
src/components/dashboard/quota-panel.tsx        (modify) uses QuotaBars, with this site's share
src/components/actions/action-failure.tsx       (modify) 429 without a metric
src/components/keywords/propose-keywords.tsx, keywords-view.tsx     (modify) ActionFailure
src/components/settings/seo-settings-form.tsx, seo-view.tsx         (modify) ActionFailure
src/app/[locale]/(app)/site-health/{page.tsx,actions.ts}
src/components/site-health/{site-health-view.tsx,finding-tabs.tsx,findings-board.tsx}
src/app/[locale]/(app)/plan/page.tsx            (plan/actions.ts exists; modify: note)
src/components/plan/{plan-view.tsx,usage-chart.tsx,request-upgrade.tsx}
src/components/editor/{hashtag-chips.tsx,social-preview.tsx}
src/components/editor/post-editor.tsx, action-bar.tsx               (modify)
src/components/shell/nav.ts                     (modify) Site health, Plan & usage
messages/en.json, messages/ar.json              (modify)
tests/unit/engine-health.test.ts, mock-health.test.ts, plan-usage.test.ts, site-health.test.ts, social.test.ts
tests/unit/dashboard.test.ts, format.test.ts, nav.test.ts, action-inputs.test.ts   (modify)
tests/e2e/quota.spec.ts, site-health.spec.ts, plan.spec.ts, social.spec.ts
tests/e2e/editor.spec.ts, photos.spec.ts       (modify) hashtag chips; Instagram approve disabled
README.md, docs/plans/2026-10-22-m4a-followups.md
```

**Messages:** each task adds its keys to `messages/en.json` and `messages/ar.json` with `python3 .superpowers/tools/merge_messages.py FILE DOTTED.PATH FRAGMENT`. Keep the two files' keys identical; `tests/unit/messages.test.ts` checks it. Every task's messages are given in full, in both languages.

---

### Task 1: Engine contract for site health and usage

**Files:**
- Modify: `src/lib/engine/schemas.ts`, `src/lib/engine/api.ts`
- Test: `tests/unit/engine-health.test.ts` (create)

**Interfaces:**
- Consumes: M3a `fakeEngine`; M2b `parseItems`, `JobStartSchema`, `BulkResultSchema`, `ChangeContext`, `SLOW_CHANGE_MS`
- Produces:
  - **Schemas and types:**
    - `SiteFindingSchema` / `type SiteFinding` (`fix` may be null)
    - `UsageSchema` / `type Usage` (`months[].sites` and `results` are always arrays)
  - **`FINDING_BULK_ACTIONS` / `type FindingBulkAction`:** `apply` or `dismiss`
  - **API methods:**
    - `listFindings({ statuses, levels?, page?, pageSize? }): { findings; skipped; meta }`
    - `scanSite(ctx): JobStart`
    - `prepareFixes(ids, ctx): JobStart`
    - `bulkFindings(action, ids, ctx): BulkResult` (with the slow-change limit, since apply changes the website)
    - `usage({ from, to }): Usage`, where months are `YYYY-MM`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/engine-health.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { fakeEngine, type FakeCall } from "./fake-engine";

const ctx = { actingUser: "admin@example.com", idempotencyKey: "key-12345678" };
const FINDING = { id: "sf_1", url: "https://fakhernco.com/services/", level: "critical", issue: "Missing meta description", fix: null, status: "open" };
const changes = (calls: FakeCall[]) => calls.filter((call) => call.method !== "GET").map((call) => [call.path, call.body]);

describe("site health (spec v1.1 §4 SiteFinding, §7)", () => {
  it("lists findings a page at a time by status and level, skipping one in an unexpected shape", async () => {
    const { engine, calls } = fakeEngine({ "GET /sites/site_1/site/findings": [FINDING, { id: 4 }] });
    const list = await engine.listFindings({ statuses: ["open", "prepared"], levels: ["critical"], page: 2, pageSize: 25 });
    expect([list.findings.map((finding) => finding.id), list.skipped, list.meta?.total]).toEqual([["sf_1"], 1, 3]);
    const query = new URLSearchParams(calls.at(-1)?.search);
    expect([query.get("status"), query.get("level"), query.get("page"), query.get("pageSize")]).toEqual(["open,prepared", "critical", "2", "25"]);
    await engine.listFindings({ statuses: ["applied"], levels: [] });
    expect(new URLSearchParams(calls.at(-1)?.search).has("level")).toBe(false);
  });

  it("starts a scan and fix preparation as jobs, and applies or dismisses findings in bulk", async () => {
    const { engine, calls } = fakeEngine({
      "POST /sites/site_1/site/scan": { jobId: "j_1" },
      "POST /sites/site_1/site/fixes": { jobId: "j_2" },
      "POST /sites/site_1/site/findings/bulk": { done: ["sf_1"], failed: [] },
    });
    expect((await engine.scanSite(ctx)).jobId).toBe("j_1");
    expect((await engine.prepareFixes(["sf_1", "sf_2"], ctx)).jobId).toBe("j_2");
    expect(await engine.bulkFindings("apply", ["sf_1"], ctx)).toEqual({ done: ["sf_1"], failed: [] });
    expect(changes(calls)).toEqual([
      ["/sites/site_1/site/scan", {}],
      ["/sites/site_1/site/fixes", { ids: ["sf_1", "sf_2"] }],
      ["/sites/site_1/site/findings/bulk", { action: "apply", ids: ["sf_1"] }],
    ]);
  });
});

describe("usage (spec v1.1 §7 GET /account/usage)", () => {
  it("asks for a month range and returns this site's months and results", async () => {
    const { engine, calls } = fakeEngine({
      "GET /account/usage": {
        months: [{ month: "2026-10", sites: [{ siteId: "site_1", metrics: { articles: 24 } }] }, { month: "2026-09" }],
        results: [{ siteId: "site_1", published: 41, keywordsCovered: 12 }],
      },
    });
    const usage = await engine.usage({ from: "2026-05", to: "2026-10" });
    expect([usage.months[0].sites[0].metrics.articles, usage.months[1].sites, usage.results[0].published]).toEqual([24, [], 41]);
    const query = new URLSearchParams(calls.at(-1)?.search);
    expect([query.get("from"), query.get("to")]).toEqual(["2026-05", "2026-10"]);
  });
});
```

- [ ] **Step 2: Run the tests to make sure they fail**

Run: `pnpm test tests/unit/engine-health.test.ts`
Expected: FAIL. All 3 tests fail with `TypeError: engine.listFindings is not a function` (or `engine.scanSite`, `engine.usage`).

- [ ] **Step 3: Add the schemas**

Append to `src/lib/engine/schemas.ts`:

```ts
// ── Site health (spec v1.1 §4 SiteFinding; §7 …/site endpoints) ──────────────
export const SiteFindingSchema = z.object({
  id: z.string(),
  url: z.string(),
  level: z.string(), // known: critical | warn | info
  issue: z.string(),
  fix: z.string().nullish(),
  status: z.string(), // known: open | prepared | applied | dismissed
});
export type SiteFinding = z.infer<typeof SiteFindingSchema>;

// ── Usage (spec v1.1 §7 GET /account/usage: this key's site only) ────────────
export const UsageSchema = z.object({
  months: z.array(
    z.object({
      month: z.string(), // YYYY-MM
      sites: list(z.object({ siteId: z.string(), metrics: z.record(z.string(), z.number()) })),
    }),
  ),
  results: list(z.object({ siteId: z.string(), published: z.number().int(), keywordsCovered: z.number().int() })),
});
export type Usage = z.output<typeof UsageSchema>;
```

- [ ] **Step 4: Add the API methods**

In `src/lib/engine/api.ts`:
- Add `SiteFindingSchema` and `UsageSchema` to the import from `./schemas`, keeping it alphabetical.
- Below `SUGGESTION_BULK_ACTIONS`' type, add:

  ```ts
  /** Site-health bulk actions (spec v1.1 §7 POST …/site/findings/bulk). */
  export const FINDING_BULK_ACTIONS = ["apply", "dismiss"] as const;
  export type FindingBulkAction = (typeof FINDING_BULK_ACTIONS)[number];
  ```

- Just before `const settingsPath = async`, add:

  ```ts
    async function listFindings(options: { statuses: string[]; levels?: string[]; page?: number; pageSize?: number }) {
      const { data, meta } = await client.request({
        method: "GET",
        path: `${await sitePath()}/site/findings`,
        schema: z.array(z.unknown()),
        query: {
          status: options.statuses.join(","),
          level: options.levels?.length ? options.levels.join(",") : undefined,
          page: options.page,
          pageSize: options.pageSize,
        },
      });
      const { items, skipped } = parseItems(data, SiteFindingSchema);
      return { findings: items, skipped, meta };
    }

    const scanSite = async (ctx: ChangeContext) =>
      (await client.request({ method: "POST", path: `${await sitePath()}/site/scan`, schema: JobStartSchema, body: {}, ...ctx })).data;

    const prepareFixes = async (ids: string[], ctx: ChangeContext) =>
      (await client.request({ method: "POST", path: `${await sitePath()}/site/fixes`, schema: JobStartSchema, body: { ids }, ...ctx })).data;

    // Apply changes the live website, so it gets the slow-change limit.
    const bulkFindings = async (action: FindingBulkAction, ids: string[], ctx: ChangeContext) =>
      (
        await client.request({
          method: "POST",
          path: `${await sitePath()}/site/findings/bulk`,
          schema: BulkResultSchema,
          body: { action, ids },
          timeoutMs: SLOW_CHANGE_MS,
          ...ctx,
        })
      ).data;

    /** Spec v1.1 §7: this key's site only; months are YYYY-MM. Quota totals in /account/plan stay account-wide. */
    const usage = async (range: { from: string; to: string }) =>
      (await client.request({ method: "GET", path: "/account/usage", schema: UsageSchema, query: range })).data;
  ```

- In the returned object, after `disconnectSearchConsole,`, add `listFindings,`, `scanSite,`, `prepareFixes,`, `bulkFindings,` and `usage,`.

- [ ] **Step 5: Run the tests to make sure they pass**

Run: `pnpm test tests/unit/engine-health.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Lint, typecheck and the whole unit suite**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected:
- lint and typecheck exit 0
- Vitest: every test passes (317 before this task + 3)

- [ ] **Step 7: Commit**

```bash
git add src/lib/engine/schemas.ts src/lib/engine/api.ts tests/unit/engine-health.test.ts
git commit -m "feat: engine contract for site health and usage"
```

---

### Task 2: Mock engine: site health, usage, and quota refusals for scans and proposals

**Files:**
- Create: `src/lib/engine/mock/site-health.ts`, `src/lib/engine/mock/usage.ts`
- Modify: `src/lib/engine/mock/fixtures.ts`, `src/lib/engine/mock/store.ts`, `src/lib/engine/mock/server.ts`
- Test: `tests/unit/mock-health.test.ts` (create)

**Interfaces:**
- Consumes: Task 1 schemas and API; M3a `startJob`, `tick`, `job`; M3b `outcome.ts`
- Produces:
  - **`createSiteHealthStore()`:** `list(statuses, levels, page, pageSize)`, `scanned()`, `preparable(ids)`, `prepare(ids)`, `bulk(action, ids)`
  - **`mockUsage(from, to)`:** `Usage`, or `null` for months it can't read
  - **`createMockStore()` gains:**
    - `listFindings(statuses, levels, page, pageSize)` (it runs finished jobs first)
    - `scanSite()`, a job whose result is `{findingIds}`
    - `prepareFixes(ids)`, a job; `422` when none of `ids` is open
    - `bulkFindings(action, ids)`
  - **`mockPlan()` adds two hard quotas:** `siteScans` (2 of 4) and `aiTokens` (812,000 of 2,000,000)
  - **Routes:**
    - `GET …/site/findings?status&level&page&pageSize`
    - `POST …/site/scan`, `POST …/site/fixes`, `POST …/site/findings/bulk`
    - `GET /account/usage?from&to`
  - **The `quota` scenario also refuses:**
    - `POST …/site/scan`, with metric `siteScans`
    - `POST …/keywords/propose` and `POST …/settings/seo/propose`, with metric `aiTokens`
    - its plan shows every hard quota at its limit

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/mock-health.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { createEngineApi } from "@/lib/engine/api";
import { createEngineClient } from "@/lib/engine/client";
import { mockPlan } from "@/lib/engine/mock/fixtures";
import { createMockFetch, type MockScenario } from "@/lib/engine/mock/server";
import { createMockStore, type MockStore } from "@/lib/engine/mock/store";
import { mockUsage } from "@/lib/engine/mock/usage";

const BASE = "https://mock.engine.local/api/v1";
let t = Date.parse("2026-10-22T08:00:00Z");
let store: MockStore;

function data<T>(outcome: { ok: boolean; data?: T }): T {
  expect(outcome.ok).toBe(true);
  return (outcome as { data: T }).data;
}
const ids = (outcome: { ok: boolean; data?: { items: { id: string }[] } }) => data(outcome).items.map((finding) => finding.id);

function httpEngine(scenario: MockScenario = "normal") {
  const fetch = createMockFetch({ baseUrl: BASE, apiKey: "mock-key", scenario });
  return createEngineApi(createEngineClient({ baseUrl: BASE, apiKey: "mock-key", fetch, retryDelaysMs: [0, 0] }));
}

beforeEach(() => {
  t = Date.parse("2026-10-22T08:00:00Z");
  store = createMockStore({ now: () => t, jobDurationMs: 1000 });
});

describe("site health (spec v1.1 §6 /site-health)", () => {
  it("lists findings by status and level, a page at a time", () => {
    expect(ids(store.listFindings(["open", "prepared"], null, 1, 25))).toEqual(["sf_1", "sf_2", "sf_3", "sf_4"]);
    expect(ids(store.listFindings(null, ["critical"], 1, 25))).toEqual(["sf_1", "sf_3"]);
    expect(data(store.listFindings(null, null, 1, 2)).meta).toEqual({ page: 1, pageSize: 2, total: 6 });
  });

  it("a scan is a job that adds what it found (Review Focus 2)", () => {
    const { jobId } = data(store.scanSite());
    t += 1000;
    expect(data(store.job(jobId))).toMatchObject({ status: "done", result: { findingIds: ["sf_7"] } });
    expect(ids(store.listFindings(["open"], null, 1, 25))).toContain("sf_7");
  });

  it("prepares fixes for the open findings chosen, as a job, and refuses when none is open", () => {
    const { jobId } = data(store.prepareFixes(["sf_1", "sf_3", "sf_5"]));
    t += 1000;
    expect(data(store.job(jobId)).result).toEqual({ findingIds: ["sf_1"] });
    expect(data(store.listFindings(["prepared"], null, 1, 25)).items.find((finding) => finding.id === "sf_1")).toMatchObject({
      status: "prepared",
      fix: expect.stringContaining("Fakher & Co"),
    });
    expect(store.prepareFixes(["sf_5", "sf_99"])).toMatchObject({ ok: false, status: 422, code: "invalid_input" });
  });

  it("applies only prepared fixes and dismisses only open or prepared findings, naming each refusal (Review Focus 1)", () => {
    expect(data(store.bulkFindings("apply", ["sf_3", "sf_1", "sf_99"]))).toEqual({
      done: ["sf_3"],
      failed: [
        { id: "sf_1", code: "invalid_input", message: "Prepare the fix first." },
        { id: "sf_99", code: "not_found", message: "This finding no longer exists." },
      ],
    });
    expect(data(store.bulkFindings("dismiss", ["sf_2", "sf_5"]))).toEqual({
      done: ["sf_2"],
      failed: [{ id: "sf_5", code: "invalid_input", message: "Only open or prepared findings can be dismissed." }],
    });
    expect(store.bulkFindings("delete", ["sf_1"])).toMatchObject({ ok: false, status: 400 });
  });

  it("never calls Fakher & Co a law firm", () => {
    const { jobId } = data(store.prepareFixes(["sf_1", "sf_2", "sf_4"]));
    t += 1000;
    data(store.job(jobId));
    expect(JSON.stringify(data(store.listFindings(null, null, 1, 50))).toLowerCase()).not.toContain("law firm");
  });
});

describe("usage (spec v1.1 §7 GET /account/usage)", () => {
  it("reports every month in the range, with no site numbers for a month it has none for", () => {
    const usage = mockUsage("2026-04", "2026-06");
    expect(usage?.months.map((month) => [month.month, month.sites.length])).toEqual([
      ["2026-04", 0],
      ["2026-05", 1],
      ["2026-06", 1],
    ]);
    expect(usage?.results).toEqual([{ siteId: "site_fakher", published: 41, keywordsCovered: 12 }]);
  });

  it("refuses months it can't read, or a range that runs backwards", () => {
    expect([mockUsage("2026-13", "2026-10"), mockUsage("2026-10", "2026-05"), mockUsage("", "2026-05")]).toEqual([null, null, null]);
  });
});

describe("over HTTP", () => {
  it("serves findings, a scan, fix preparation, bulk actions and usage", async () => {
    const engine = httpEngine();
    const key = (n: number) => ({ actingUser: "admin@example.com", idempotencyKey: `key-health-${n}` });
    expect((await engine.listFindings({ statuses: ["open"], levels: ["warn"] })).findings.map((finding) => finding.id)).toEqual(["sf_2", "sf_4"]);
    expect((await engine.scanSite(key(1))).jobId).toMatch(/^j_/);
    expect((await engine.prepareFixes(["sf_1"], key(2))).jobId).toMatch(/^j_/);
    expect(await engine.bulkFindings("dismiss", ["sf_2"], key(3))).toEqual({ done: ["sf_2"], failed: [] });
    expect((await engine.usage({ from: "2026-05", to: "2026-10" })).months).toHaveLength(6);
    await expect(engine.usage({ from: "May", to: "2026-10" })).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("the quota scenario refuses scans and AI proposals with their metrics, and the plan shows hard quotas at their limit", async () => {
    const quota = httpEngine("quota");
    const key = (n: number) => ({ actingUser: "admin@example.com", idempotencyKey: `key-quota-${n}` });
    await expect(quota.scanSite(key(1))).rejects.toMatchObject({ code: "quota_exceeded", details: { metric: "siteScans" } });
    await expect(quota.proposeKeywords(undefined, key(2))).rejects.toMatchObject({ code: "quota_exceeded", details: { metric: "aiTokens" } });
    await expect(quota.proposeSeo(key(3))).rejects.toMatchObject({ code: "quota_exceeded", details: { metric: "aiTokens" } });
    const plan = await quota.plan();
    const at = (metric: string) => plan.quotas.find((row) => row.metric === metric);
    expect([at("articles")?.used, at("siteScans")?.used, at("aiTokens")?.used]).toEqual([40, 4, 2_000_000]);
    expect(mockPlan().quotas.find((row) => row.metric === "siteScans")).toMatchObject({ limit: 4, used: 2, mode: "hard" });
  });
});
```

- [ ] **Step 2: Run the tests to make sure they fail**

Run: `pnpm test tests/unit/mock-health.test.ts`
Expected: FAIL. The file fails to load: `Failed to resolve import "@/lib/engine/mock/usage"`.

- [ ] **Step 3: Seed the findings and write the site-health store**

Create `src/lib/engine/mock/site-health.ts`:

```ts
import type { BulkResult, SiteFinding } from "../schemas";
import { fail, ok, type MockOutcome } from "./outcome";

/** Fakher & Co's site-health findings (spec v1.1 §4 SiteFinding): each status, and one on an Arabic page. */
export function seedFindings(): SiteFinding[] {
  return [
    { id: "sf_1", url: "https://fakhernco.com/services/labour-law/", level: "critical", issue: "Missing meta description", fix: null, status: "open" },
    { id: "sf_2", url: "https://fakhernco.com/insights/probation-period-uae-labour-law/", level: "warn", issue: "Image without alt text", fix: null, status: "open" },
    { id: "sf_3", url: "https://fakhernco.com/about/", level: "critical", issue: "Broken internal link to /contact-us", fix: "Point the link to /contact/", status: "prepared" },
    { id: "sf_4", url: "https://fakhernco.com/ar/services/", level: "warn", issue: "عنوان الصفحة أطول من 60 حرفاً", fix: null, status: "open" },
    {
      id: "sf_5",
      url: "https://fakhernco.com/insights/",
      level: "info",
      issue: "Page title longer than 60 characters",
      fix: "Shorten the title to “Insights | Fakher & Co”",
      status: "applied",
    },
    { id: "sf_6", url: "https://fakhernco.com/careers/", level: "warn", issue: "Duplicate H1 heading", fix: null, status: "dismissed" },
  ];
}

/** The mock "AI" behind fix preparation: a proposed fix per issue (Fakher & Co is a legal consultancy). */
const PROPOSED: Record<string, string> = {
  "Missing meta description": "Add: “Labour law advice in Dubai and Abu Dhabi from the legal consultants at Fakher & Co.”",
  "Image without alt text": "Add the alt text “Employment contract on a desk”.",
  "عنوان الصفحة أطول من 60 حرفاً": "اختصر العنوان إلى «خدماتنا | فاخر وشركاه».",
};

export function createSiteHealthStore() {
  const findings = new Map(seedFindings().map((finding) => [finding.id, finding]));
  let sequence = findings.size;

  /** GET …/site/findings: by status and level (null = any), a page at a time. */
  function list(statuses: string[] | null, levels: string[] | null, page: number, pageSize: number) {
    const all = [...findings.values()].filter(
      (finding) => (!statuses || statuses.includes(finding.status)) && (!levels || levels.includes(finding.level)),
    );
    const start = (page - 1) * pageSize;
    return ok({ items: structuredClone(all.slice(start, start + pageSize)), meta: { page, pageSize, total: all.length } });
  }

  /** What a finished scan adds (mock rule: one new finding each time). */
  function scanned(): { findingIds: string[] } {
    const id = `sf_${++sequence}`;
    findings.set(id, { id, url: "https://fakhernco.com/insights/", level: "warn", issue: "Largest image is 2.4 MB", fix: null, status: "open" });
    return { findingIds: [id] };
  }

  /** The open findings among `ids`: the ones a fix can be prepared for. */
  const preparable = (ids: string[]) => ids.filter((id) => findings.get(id)?.status === "open");

  function prepare(ids: string[]): { findingIds: string[] } {
    const chosen = preparable(ids);
    for (const id of chosen) {
      const finding = findings.get(id) as SiteFinding;
      finding.status = "prepared";
      finding.fix = PROPOSED[finding.issue] ?? `Proposed fix for: ${finding.issue}`;
    }
    return { findingIds: chosen };
  }

  /** POST …/site/findings/bulk: apply needs a prepared fix; dismiss needs an open or prepared finding. */
  function bulk(action: string, ids: string[]): MockOutcome<BulkResult> {
    if (action !== "apply" && action !== "dismiss") return fail(400, "invalid_input", "Unknown action.", { fields: { action: "apply or dismiss" } });
    const result: BulkResult = { done: [], failed: [] };
    for (const id of ids) {
      const finding = findings.get(id);
      if (!finding) result.failed.push({ id, code: "not_found", message: "This finding no longer exists." });
      else if (action === "apply" && finding.status !== "prepared") result.failed.push({ id, code: "invalid_input", message: "Prepare the fix first." });
      else if (action === "dismiss" && finding.status !== "open" && finding.status !== "prepared") {
        result.failed.push({ id, code: "invalid_input", message: "Only open or prepared findings can be dismissed." });
      } else {
        finding.status = action === "apply" ? "applied" : "dismissed";
        result.done.push(id);
      }
    }
    return ok(result);
  }

  return { list, scanned, preparable, prepare, bulk };
}
```

- [ ] **Step 4: Write the usage generator**

Create `src/lib/engine/mock/usage.ts`:

```ts
import type { Usage } from "../schemas";
import { MOCK_SITE_ID } from "./fixtures";

/** This site's numbers per month in the mock (spec v1.1 §7 /account/usage); October 2026 is the plan period's month. */
const MONTHS: Record<string, Record<string, number>> = {
  "2026-05": { articles: 12, socialPosts: 30, photos: 20, publishes: 10, siteScans: 1, aiTokens: 420_000 },
  "2026-06": { articles: 16, socialPosts: 38, photos: 26, publishes: 14, siteScans: 1, aiTokens: 510_000 },
  "2026-07": { articles: 14, socialPosts: 35, photos: 22, publishes: 13, siteScans: 2, aiTokens: 480_000 },
  "2026-08": { articles: 20, socialPosts: 52, photos: 34, publishes: 18, siteScans: 1, aiTokens: 640_000 },
  "2026-09": { articles: 22, socialPosts: 61, photos: 41, publishes: 21, siteScans: 2, aiTokens: 700_000 },
  "2026-10": { articles: 24, socialPosts: 44, photos: 37, publishes: 19, siteScans: 2, aiTokens: 612_000 },
};
const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** Every month from `from` to `to` (YYYY-MM, at most 24); null when a month can't be read or the range runs backwards. */
export function mockUsage(from: string, to: string): Usage | null {
  const start = MONTH.exec(from);
  const end = MONTH.exec(to);
  if (!start || !end) return null;
  let index = Number(start[1]) * 12 + Number(start[2]) - 1;
  const last = Number(end[1]) * 12 + Number(end[2]) - 1;
  if (last < index || last - index >= 24) return null;
  const months: Usage["months"] = [];
  for (; index <= last; index++) {
    const month = `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
    const metrics = MONTHS[month];
    months.push({ month, sites: metrics ? [{ siteId: MOCK_SITE_ID, metrics: { ...metrics } }] : [] });
  }
  return { months, results: [{ siteId: MOCK_SITE_ID, published: 41, keywordsCovered: 12 }] };
}
```

- [ ] **Step 5: Add the two quotas**

In `src/lib/engine/mock/fixtures.ts`, in `mockPlan().quotas`, after the `photos` row, add:

```ts
      { metric: "siteScans", limit: 4, used: 2, scope: "account", mode: "hard", warnAt: 0.75 },
      { metric: "aiTokens", limit: 2_000_000, used: 812_000, scope: "account", mode: "hard", warnAt: 0.8 },
```

- [ ] **Step 6: Wire the store**

In `src/lib/engine/mock/store.ts`:
- Add `import { createSiteHealthStore } from "./site-health";` to the imports.
- Below `const settings = createSettingsStore({ now, firstRun: options.firstRun });`, add `const siteHealth = createSiteHealthStore();`.
- Just before `function job(id: string)`, add:

```ts
  /** GET …/site/findings, after any finished scan or fix job has landed. */
  function listFindings(statuses: string[] | null, levels: string[] | null, page: number, pageSize: number) {
    tick();
    return siteHealth.list(statuses, levels, page, pageSize);
  }

  /** POST …/site/scan: a job; the scan's findings land when it's done (spec v1.1 §6 "Scan site (starts a job)"). */
  function scanSite() {
    tick();
    return ok({ jobId: startJob(() => siteHealth.scanned()), status: "queued", postIds: [] as string[] });
  }

  /** POST …/site/fixes: a job that prepares a fix for each open finding chosen; the findings become prepared. */
  function prepareFixes(ids: string[]) {
    tick();
    if (siteHealth.preparable(ids).length === 0) return fail(422, "invalid_input", "Choose findings that are still open.");
    return ok({ jobId: startJob(() => siteHealth.prepare(ids)), status: "queued", postIds: [] as string[] });
  }

  function bulkFindings(action: string, ids: string[]) {
    tick();
    return siteHealth.bulk(action, ids);
  }
```

- In the returned object, after `proposeSeo,`, add `listFindings,`, `scanSite,`, `prepareFixes,` and `bulkFindings,`.

- [ ] **Step 7: Serve the routes and the quota refusals**

In `src/lib/engine/mock/server.ts`:

1. Add `import { mockUsage } from "./usage";` to the imports.
2. Replace the `QUOTA_EXCEEDED` constant and `planAtLimit` with:

   ```ts
   /** A 429 for a metered request in the "quota" scenario: the metric's limit is reached (design §9). */
   function quotaRefusal(metric: string): Reply {
     const limit = mockPlan().quotas.find((quota) => quota.metric === metric)?.limit ?? 0;
     return {
       status: 429,
       json: { ok: false, error: { code: "quota_exceeded", message: `Monthly limit reached for ${metric}.`, details: { metric, used: limit, limit } } },
     };
   }

   /** The plan as it looks in the "quota" scenario: every hard quota is at its limit. */
   function planAtLimit() {
     const plan = mockPlan();
     return { ...plan, quotas: plan.quotas.map((quota) => (quota.mode === "hard" && quota.limit !== null ? { ...quota, used: quota.limit } : quota)) };
   }
   ```

3. Replace `if (scenario === "quota" && draftingRequest) return QUOTA_EXCEEDED;` with `if (scenario === "quota" && draftingRequest) return quotaRefusal("articles");`.
4. After `if (method === "POST" && path === "/account/upgrade-request") return ok({ requested: true });`, add:

   ```ts
     if (method === "GET" && path === "/account/usage") {
       const usage = mockUsage(url.searchParams.get("from") ?? "", url.searchParams.get("to") ?? "");
       return usage ? ok(usage) : fail(400, "invalid_input", "Use months like 2026-05, with from no later than to.");
     }
   ```

5. Just before `if (rest === "/settings/seo" && method === "GET")`, add:

   ```ts
     // The "quota" scenario: scans and AI proposals are metered too (spec v1.1 §4 metrics).
     if (scenario === "quota" && method === "POST" && rest === "/site/scan") return quotaRefusal("siteScans");
     if (scenario === "quota" && method === "POST" && (rest === "/keywords/propose" || rest === "/settings/seo/propose")) return quotaRefusal("aiTokens");
     if (rest === "/site/findings" && method === "GET") {
       const levels = url.searchParams.get("level")?.split(",").filter(Boolean) ?? null;
       const { page, pageSize } = pageOf();
       const listed = store.listFindings(statusesOf(), levels, page, pageSize);
       return listed.ok ? { status: 200, json: { ok: true, data: listed.data.items, meta: listed.data.meta } } : outcome(listed);
     }
     if (rest === "/site/scan" && method === "POST") return outcome(store.scanSite());
     if (rest === "/site/fixes" && method === "POST") return outcome(store.prepareFixes(idsOf(body.ids)));
     if (rest === "/site/findings/bulk" && method === "POST") return outcome(store.bulkFindings(String(body.action ?? ""), idsOf(body.ids)));
   ```

6. Update the scenario comment's `quota` entry to read `· quota (monthly limits reached: articles for drafting, aiTokens for AI proposals, siteScans for scans)`.

- [ ] **Step 8: Run the tests to make sure they pass**

Run: `pnpm test tests/unit/mock-health.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 9: Lint, typecheck, the whole unit suite, and the dashboard and quota e2e**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm e2e tests/e2e/dashboard.spec.ts tests/e2e/keywords.spec.ts tests/e2e/ideas.spec.ts`
Expected:
- lint and typecheck exit 0
- every unit test passes
- the dashboard quota states and the drafting quota tests still pass (two more quota rows don't change the ones they check)

- [ ] **Step 10: Commit**

```bash
git add src/lib/engine/mock tests/unit/mock-health.test.ts
git commit -m "feat: mock site health and usage; the quota scenario also meters scans and AI proposals"
```

---

### Task 3: Quota bars with this site's share, and the quota message everywhere AI is metered

**Files:**
- Modify:
  - `src/lib/dashboard/quota.ts`, `src/components/dashboard/quota-panel.tsx`, `src/components/actions/action-failure.tsx`
  - `src/components/keywords/propose-keywords.tsx`, `src/components/keywords/keywords-view.tsx`
  - `src/components/settings/seo-settings-form.tsx`, `src/components/settings/seo-view.tsx`
  - `messages/en.json`, `messages/ar.json`
- Create: `src/lib/plan/usage.ts`, `src/components/dashboard/quota-bars.tsx`
- Test: `tests/unit/dashboard.test.ts` (append), `tests/unit/plan-usage.test.ts` (create), `tests/e2e/quota.spec.ts` (create)

**Interfaces:**
- Consumes: Task 1 `usage`, `Usage`; Task 2 `siteScans` and `aiTokens` quotas and quota refusals; M3a `ActionFailure`
- Produces:
  - **`quotaView`:** a limit of 0 is reached (`over`, 100%).
  - **`quotaMetric(details): string | null`:** the 429's metric.
  - **`src/lib/plan/usage.ts`:** `monthOf(iso)` (YYYY-MM as written) and `siteMetrics(usage, siteId, month)`.
  - **`QuotaBars({ locale, quotas, siteUsage })`:** a server component that renders `quota-{metric}` and `quota-site-{metric}`.
  - **`ActionFailure`:** without a metric it reads "A monthly limit has been reached."
  - **`ProposeKeywords({ …, canRequestUpgrade })`** and **`SeoSettingsForm({ …, canRequestUpgrade })`** show 429s with `ActionFailure`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/dashboard.test.ts`. Add `quotaMetric` to its import from `@/lib/dashboard/quota`, and import `quotaView` there too if it isn't already:

```ts
describe("quota edge cases (M1 and M3a follow-ups)", () => {
  it("a limit of 0 is already reached, used or not (Review Focus 3)", () => {
    expect(quotaView({ metric: "siteScans", limit: 0, used: 0, mode: "hard" })).toMatchObject({ percent: 100, state: "over" });
  });

  it("reads the 429's metric, or null when the engine didn't say which limit", () => {
    expect([quotaMetric({ metric: "aiTokens", used: 1, limit: 1 }), quotaMetric({ metric: " " }), quotaMetric({}), quotaMetric(undefined)]).toEqual([
      "aiTokens",
      null,
      null,
      null,
    ]);
  });
});
```

Create `tests/unit/plan-usage.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { monthOf, siteMetrics } from "@/lib/plan/usage";

const USAGE = {
  months: [
    {
      month: "2026-10",
      sites: [
        { siteId: "site_fakher", metrics: { articles: 24 } },
        { siteId: "site_other", metrics: { articles: 9 } },
      ],
    },
    { month: "2026-09", sites: [] },
  ],
  results: [{ siteId: "site_fakher", published: 41, keywordsCovered: 12 }],
};

describe("this site's usage (spec v1.1 §7 /account/usage)", () => {
  it("takes the plan period's month as the engine wrote it, never the browser's clock", () => {
    expect(monthOf("2026-10-01T00:00:00+04:00")).toBe("2026-10");
  });

  it("reads this site's numbers for a month, or null when there are none", () => {
    expect(siteMetrics(USAGE, "site_fakher", "2026-10")).toEqual({ articles: 24 });
    expect([siteMetrics(USAGE, "site_fakher", "2026-09"), siteMetrics(USAGE, "site_fakher", "2026-01")]).toEqual([null, null]);
  });
});
```

Create `tests/e2e/quota.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { isolateMockStore, setMockScenario, signInWithCookie } from "./helpers";

test.beforeEach(async ({ context }) => {
  await isolateMockStore(context);
});

test("the dashboard shows this site's share of each quota this month (M1 follow-up)", async ({ page, context }) => {
  await signInWithCookie(context, "dev_reviewer");
  await page.goto("/en");
  await expect(page.getByTestId("quota-articles")).toContainText("31 of 40");
  await expect(page.getByTestId("quota-site-articles")).toHaveText("This site: 24");
  await expect(page.getByTestId("quota-site-aiTokens")).toHaveText("This site: 612,000");
});

test("with the limits reached, hard quotas show as reached on the dashboard (Review Focus 3)", async ({ page, context }) => {
  await setMockScenario(context, "quota");
  await signInWithCookie(context, "dev_reviewer");
  await page.goto("/en");
  await expect(page.getByTestId("quota-articles")).toHaveAttribute("data-state", "over");
  await expect(page.getByTestId("quota-siteScans")).toHaveAttribute("data-state", "over");
});

test("AI keyword proposals over the limit tell a reviewer to ask the admin (M3a follow-up)", async ({ page, context }) => {
  await setMockScenario(context, "quota");
  await signInWithCookie(context, "dev_reviewer");
  await page.goto("/en/keywords");
  await page.getByTestId("propose-keywords").click();
  await expect(page.getByTestId("quota-exceeded")).toContainText("Monthly limit reached for AI tokens.");
  await expect(page.getByTestId("ask-admin")).toBeVisible();
});

test("SEO suggestions over the limit offer an admin Request upgrade (M3b follow-up)", async ({ page, context }) => {
  await setMockScenario(context, "quota");
  await signInWithCookie(context, "dev_admin");
  await page.goto("/en/settings/seo");
  await page.getByTestId("seo-propose").click();
  await expect(page.getByTestId("quota-exceeded")).toContainText("Monthly limit reached for AI tokens.");
  await page.getByTestId("request-upgrade").click();
  await expect(page.getByTestId("upgrade-requested")).toBeVisible();
});
```

- [ ] **Step 2: Run the unit tests to make sure they fail**

Run: `pnpm test tests/unit/dashboard.test.ts tests/unit/plan-usage.test.ts`
Expected: FAIL.
- `plan-usage` fails to resolve `@/lib/plan/usage`.
- The limit-0 test gets `state: "ok"`.
- The `quotaMetric` test fails with `TypeError: quotaMetric is not a function`.

- [ ] **Step 3: Fix the quota rules and add the usage helpers**

In `src/lib/dashboard/quota.ts`, replace

```ts
  const ratio = limit > 0 ? used / limit : used > 0 ? Number.POSITIVE_INFINITY : 0;
```

with

```ts
  // A limit of 0 is already reached (M1 follow-up): nothing more can be used.
  const ratio = limit > 0 ? used / limit : used > 0 ? Number.POSITIVE_INFINITY : 1;
```

and append:

```ts
/** The metric a 429 names (spec v1.1 §9 error.details.metric), or null when the engine didn't say which limit. */
export function quotaMetric(details: Record<string, unknown> | undefined): string | null {
  const metric = details?.metric;
  return typeof metric === "string" && metric.trim() ? metric : null;
}
```

Create `src/lib/plan/usage.ts`:

```ts
import type { Usage } from "@/lib/engine/schemas";

/** The plan period's month, YYYY-MM, as the engine wrote it (spec v1.1 §4 Plan.period), never from the browser's clock. */
export const monthOf = (iso: string) => iso.slice(0, 7);

/** This site's numbers for one month (spec v1.1 §7: usage covers this key's site), or null when the engine has none. */
export function siteMetrics(usage: Usage, siteId: string, month: string): Record<string, number> | null {
  const sites = usage.months.find((entry) => entry.month === month)?.sites ?? [];
  return sites.find((site) => site.siteId === siteId)?.metrics ?? null;
}
```

- [ ] **Step 4: Run the unit tests to make sure they pass**

Run: `pnpm test tests/unit/dashboard.test.ts tests/unit/plan-usage.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the messages**

Merge into `messages/en.json`:
- at `Dashboard.quota`: `{ "thisSite": "This site: {used}" }`
- at `Quota`: `{ "limitReachedAny": "A monthly limit has been reached." }`

Merge into `messages/ar.json`:
- at `Dashboard.quota`: `{ "thisSite": "هذا الموقع: {used}" }`
- at `Quota`: `{ "limitReachedAny": "تم بلوغ أحد الحدود الشهرية." }`

- [ ] **Step 6: Share the quota bars, and show this site's share on the dashboard**

Create `src/components/dashboard/quota-bars.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/locales";
import { quotaView } from "@/lib/dashboard/quota";
import type { Quota } from "@/lib/engine/schemas";
import { formatNumber } from "@/lib/format/number";
import { cn } from "@/lib/utils";

type Props = { locale: AppLocale; quotas: Quota[]; siteUsage: Record<string, number> | null };

/** Account-wide quota bars from /account/plan (spec v1.1 §4), each with this site's share this month when the engine reports it. */
export async function QuotaBars({ locale, quotas, siteUsage }: Props) {
  const t = await getTranslations("Dashboard.quota");
  return (
    <ul className="flex flex-col gap-4">
      {quotas.map((quota) => {
        const q = quotaView(quota);
        const label = t.has(`metrics.${q.metric}`) ? t(`metrics.${q.metric}`) : q.metric;
        const used = formatNumber(q.used, locale);
        const share = siteUsage?.[q.metric];
        return (
          <li key={q.metric} data-testid={`quota-${q.metric}`} data-state={q.state}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium">{label}</span>
              <span className="text-muted-foreground">
                {q.limit === null ? t("unlimited", { used }) : t("usage", { used, limit: formatNumber(q.limit, locale) })}
              </span>
            </div>
            {q.limit !== null && (
              <div
                className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-label={label}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={q.percent}
              >
                <div
                  className={cn("h-full rounded-full", q.state === "over" ? "bg-bad-fg" : q.state === "warning" ? "bg-warn-fg" : "bg-primary")}
                  style={{ width: `${q.percent}%` }}
                />
              </div>
            )}
            {share !== undefined && (
              <p data-testid={`quota-site-${q.metric}`} className="mt-1 text-xs text-muted-foreground">
                {t("thisSite", { used: formatNumber(share, locale) })}
              </p>
            )}
            {q.state === "warning" && <p className="mt-1 text-xs text-warn-fg">{t("warning")}</p>}
            {q.state === "over" && <p className="mt-1 text-xs text-bad-fg">{t("over")}</p>}
          </li>
        );
      })}
    </ul>
  );
}
```

Replace `src/components/dashboard/quota-panel.tsx` with:

```tsx
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AppLocale } from "@/i18n/locales";
import { requireSession } from "@/lib/auth/session";
import { getEngine } from "@/lib/engine";
import { tryEngine } from "@/lib/engine/result";
import { monthOf, siteMetrics } from "@/lib/plan/usage";
import { EngineNotice } from "./engine-notice";
import { QuotaBars } from "./quota-bars";

/** Spec v1.1 §6 dashboard: quota bars for the account, and this site's share of the usage this month. */
export async function QuotaPanel({ locale }: { locale: AppLocale }) {
  await requireSession(locale);
  const t = await getTranslations("Dashboard.quota");
  const engine = await getEngine();
  const plan = await tryEngine(() => engine.plan());

  if (!plan.ok) {
    return (
      <Card data-testid="quota">
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <EngineNotice error={plan.error} />
        </CardContent>
      </Card>
    );
  }

  // The site's share is extra: if usage can't be read, the account bars still show.
  const month = monthOf(plan.data.period.start);
  const [usage, siteId] = await Promise.all([tryEngine(() => engine.usage({ from: month, to: month })), tryEngine(() => engine.siteId())]);
  const siteUsage = usage.ok && siteId.ok ? siteMetrics(usage.data, siteId.data, month) : null;

  return (
    <Card data-testid="quota">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{plan.data.plan.name}</CardDescription>
      </CardHeader>
      <CardContent>
        <QuotaBars locale={locale} quotas={plan.data.quotas} siteUsage={siteUsage} />
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 7: Give every metered AI action the quota message**

In `src/components/actions/action-failure.tsx`:
- Add `import { quotaMetric } from "@/lib/dashboard/quota";`.
- In `QuotaExceeded`, replace

  ```tsx
    const metric = String(error.details?.metric ?? "");
    const label = metric && tMetrics.has(metric) ? tMetrics(metric) : metric;
  ```

  with

  ```tsx
    const metric = quotaMetric(error.details);
    const label = metric ? (tMetrics.has(metric) ? tMetrics(metric) : metric) : null;
  ```

- Change `const result = await upgrade.run({ locale, metric: metric || undefined });` to `const result = await upgrade.run({ locale, metric: metric ?? undefined });`.
- Change `<p>{t("limitReached", { metric: label })}</p>` to `<p>{label ? t("limitReached", { metric: label }) : t("limitReachedAny")}</p>`.

In `src/components/keywords/propose-keywords.tsx`:
- Replace the `ActionError` import with `import { ActionFailure } from "@/components/actions/action-failure";`.
- Change the signature to:

  ```tsx
  export function ProposeKeywords({ locale, languages, pollSeconds, canRequestUpgrade }: { locale: string; languages: string[]; pollSeconds: number; canRequestUpgrade: boolean }) {
  ```

- Change `{error && <ActionError error={error} />}` to `{error && <ActionFailure error={error} locale={locale} canRequestUpgrade={canRequestUpgrade} />}`.

In `src/components/keywords/keywords-view.tsx`, change `<ProposeKeywords locale={locale} languages={languages} pollSeconds={pollSeconds} />` to `<ProposeKeywords locale={locale} languages={languages} pollSeconds={pollSeconds} canRequestUpgrade={canRequestUpgrade} />`.

In `src/components/settings/seo-settings-form.tsx`:
- Replace `import { ActionError } from "@/components/actions/action-error";` with `import { ActionFailure } from "@/components/actions/action-failure";`.
- Change `type Props = { locale: string; settings: SeoSettings; languages: string[]; pollSeconds: number };` to `type Props = { locale: string; settings: SeoSettings; languages: string[]; pollSeconds: number; canRequestUpgrade: boolean };`.
- Add `canRequestUpgrade` to the destructured props.
- Change `{proposeError && <ActionError error={proposeError} />}` to `{proposeError && <ActionFailure error={proposeError} locale={locale} canRequestUpgrade={canRequestUpgrade} />}`.

In `src/components/settings/seo-view.tsx`:
- Add `import { can } from "@/lib/auth/roles";`.
- Change `await requirePermission(locale, "settings.manage");` to `const session = await requirePermission(locale, "settings.manage");`.
- Add `canRequestUpgrade={can(session.role, "plan.manage")}` to `<SeoSettingsForm … />`.

- [ ] **Step 8: Run the e2e tests**

Run: `pnpm e2e tests/e2e/quota.spec.ts tests/e2e/dashboard.spec.ts tests/e2e/keywords.spec.ts tests/e2e/settings-seo.spec.ts`
Expected: PASS. The 4 new tests pass, and the dashboard, keywords and SEO tests still do.

- [ ] **Step 9: Lint, typecheck and the whole unit suite**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: lint and typecheck exit 0; every unit test passes, including `messages.test.ts`.

- [ ] **Step 10: Commit**

```bash
git add src messages tests/unit/dashboard.test.ts tests/unit/plan-usage.test.ts tests/e2e/quota.spec.ts
git commit -m "feat: quota bars with this site's share; the quota message on AI proposals; a limit of 0 is reached"
```

---

### Task 4: The Site health page

**Files:**
- Create:
  - lib: `src/lib/site-health/findings.ts`
  - route: `src/app/[locale]/(app)/site-health/actions.ts`, `src/app/[locale]/(app)/site-health/page.tsx`
  - components: `src/components/site-health/finding-tabs.tsx`, `src/components/site-health/site-health-view.tsx`, `src/components/site-health/findings-board.tsx`
- Modify: `src/components/shell/nav.ts`, `messages/en.json`, `messages/ar.json`, `tests/unit/action-inputs.test.ts`, `tests/unit/nav.test.ts`
- Test: `tests/unit/site-health.test.ts`, `tests/e2e/site-health.spec.ts` (create)

**Interfaces:**
- Consumes:
  - Task 1 `listFindings`, `scanSite`, `prepareFixes`, `bulkFindings`, `FINDING_BULK_ACTIONS`
  - Task 2 mock findings and quota refusal
  - Task 3 `ActionFailure` (429 without a metric)
  - M3a `JobTracker`, `Pager`, `SkippedNote`
  - M3b `ask()`
- Produces:
  - **`findings.ts`:**
    - `FINDING_TABS` (`todo`, `applied`, `dismissed`), `type FindingTab`, `FINDING_TAB_KEYS`
    - `findingTab(value)`, `tabStatuses(tab)`
    - `findingActions(finding, canApply)` returns `{ select, apply, dismiss }`
  - **Actions:**
    - `scanSiteAction({ locale, idempotencyKey })`, permission `siteHealth.view`
    - `prepareFixesAction({ locale, ids, idempotencyKey })`, permission `siteHealth.view`
    - `findingsAction({ locale, action, ids, idempotencyKey })`: `apply` needs `siteHealth.apply`, `dismiss` needs `siteHealth.view`
  - **Nav item:** `{ key: "siteHealth", href: "/site-health", permission: "siteHealth.view" }`
  - **Test ids:**
    - Page: `nav-siteHealth`, `finding-tab-{tab}`, `site-scan`, `scan-job`, `prepare-fixes`, `prepare-job`.
    - Findings table: `findings`, `finding-{id}`, `finding-select-{id}`, `finding-level-{id}`, `finding-issue-{id}`, `finding-fix-{id}`, `finding-status-{id}`.
    - Row actions: `finding-apply-{id}` (and `-confirm`), `finding-dismiss-{id}`.
    - Messages: `finding-failures`, `findings-empty`.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/site-health.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { findingActions, findingTab, tabStatuses } from "@/lib/site-health/findings";

describe("finding tabs (spec v1.1 §4 SiteFinding.status)", () => {
  it("To do holds open and prepared findings; Applied and Dismissed hold their own", () => {
    expect([tabStatuses("todo"), tabStatuses("applied"), tabStatuses("dismissed")]).toEqual([["open", "prepared"], ["applied"], ["dismissed"]]);
  });

  it("an unknown or missing tab falls back to To do, even one named like an object property", () => {
    expect([findingTab(undefined), findingTab("constructor"), findingTab(["applied"]), findingTab("x")]).toEqual(["todo", "todo", "applied", "todo"]);
  });
});

describe("findingActions (design §5; Review Focus 1)", () => {
  it("a reviewer can choose open findings and dismiss, but never apply", () => {
    expect(findingActions({ status: "prepared" }, false)).toEqual({ select: false, apply: false, dismiss: true });
    expect(findingActions({ status: "open" }, false)).toEqual({ select: true, apply: false, dismiss: true });
  });

  it("an admin applies only a prepared fix; an applied or dismissed finding offers nothing", () => {
    expect(findingActions({ status: "open" }, true).apply).toBe(false);
    expect(findingActions({ status: "prepared" }, true).apply).toBe(true);
    expect(findingActions({ status: "applied" }, true)).toEqual({ select: false, apply: false, dismiss: false });
    expect(findingActions({ status: "dismissed" }, true)).toEqual({ select: false, apply: false, dismiss: false });
  });
});
```

In `tests/unit/action-inputs.test.ts`:
- Add `scanSite: vi.fn(),`, `prepareFixes: vi.fn(),` and `bulkFindings: vi.fn(),` to the `engine` object.
- After the existing `await import(…)` lines, add:

  ```ts
  const { findingsAction, prepareFixesAction, scanSiteAction } = await import("@/app/[locale]/(app)/site-health/actions");
  ```

- Append:

  ```ts
  describe("site-health actions (design §5)", () => {
    it("asks for siteHealth.apply before applying a fix, and siteHealth.view to dismiss or scan (Review Focus 1)", async () => {
      engine.bulkFindings.mockResolvedValue({ done: ["sf_3"], failed: [] });
      await findingsAction({ locale: "en", action: "apply", ids: ["sf_3"], idempotencyKey: key });
      expect(requirePermission).toHaveBeenLastCalledWith("en", "siteHealth.apply");
      await findingsAction({ locale: "en", action: "dismiss", ids: ["sf_3"], idempotencyKey: key });
      expect(requirePermission).toHaveBeenLastCalledWith("en", "siteHealth.view");
      engine.scanSite.mockResolvedValue({ jobId: "j_1", postIds: [] });
      await scanSiteAction({ locale: "en", idempotencyKey: key });
      expect(requirePermission).toHaveBeenLastCalledWith("en", "siteHealth.view");
    });

    it("refuses an unknown finding action or a malformed id without calling the engine", async () => {
      expect(await findingsAction({ locale: "en", action: "delete", ids: ["sf_1"], idempotencyKey: key })).toMatchObject({
        ok: false,
        error: { code: "invalid_input" },
      });
      expect(await prepareFixesAction({ locale: "en", ids: [".."], idempotencyKey: key })).toMatchObject({ ok: false, error: { code: "invalid_input" } });
      expect(engine.bulkFindings).not.toHaveBeenCalled();
      expect(engine.prepareFixes).not.toHaveBeenCalled();
    });
  });
  ```

  If `key` isn't already a top-level constant in that file, add `const key = "key-12345678";` above the new `describe`.

In `tests/unit/nav.test.ts`, append inside `describe("visibleNavItems", …)`:

```ts
  it("shows Site health to both roles", () => {
    expect(visibleNavItems("reviewer").map((item) => item.key)).toContain("siteHealth");
    expect(NAV_ITEMS.find((item) => item.key === "siteHealth")).toEqual({ key: "siteHealth", href: "/site-health", permission: "siteHealth.view" });
  });
```

Create `tests/e2e/site-health.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { isolateMockStore, setMockScenario, signInWithCookie } from "./helpers";

test.beforeEach(async ({ context }) => {
  await isolateMockStore(context);
});

test("To do lists open and prepared findings; Applied and Dismissed have their own tabs", async ({ page, context }) => {
  await signInWithCookie(context, "dev_reviewer");
  await page.goto("/en/site-health");
  for (const id of ["sf_1", "sf_2", "sf_3", "sf_4"]) await expect(page.getByTestId(`finding-${id}`)).toBeVisible();
  await expect(page.getByTestId("finding-sf_5")).toHaveCount(0);
  await expect(page.getByTestId("finding-status-sf_3")).toHaveText("Fix prepared");
  await expect(page.getByTestId("finding-level-sf_1")).toHaveText("Critical");
  await page.getByTestId("finding-tab-applied").click();
  await expect(page.getByTestId("finding-sf_5").filter({ visible: true })).toBeVisible();
});

test("scanning shows progress and adds what it found (Review Focus 2)", async ({ page, context }) => {
  await signInWithCookie(context, "dev_reviewer");
  await page.goto("/en/site-health");
  await page.getByTestId("site-scan").click();
  await expect(page.getByTestId("scan-job")).toHaveAttribute("data-state", "done", { timeout: 15_000 });
  await expect(page.getByTestId("finding-sf_7")).toBeVisible();
});

test("preparing fixes for the selected findings fills in the proposed fix", async ({ page, context }) => {
  await signInWithCookie(context, "dev_reviewer");
  await page.goto("/en/site-health");
  await expect(page.getByTestId("finding-select-sf_3")).toBeDisabled();
  await page.getByTestId("finding-select-sf_1").check();
  await page.getByTestId("prepare-fixes").click();
  await expect(page.getByTestId("prepare-job")).toHaveAttribute("data-state", "done", { timeout: 15_000 });
  await expect(page.getByTestId("finding-status-sf_1")).toHaveText("Fix prepared");
  await expect(page.getByTestId("finding-fix-sf_1")).toContainText("legal consultants at Fakher & Co");
});

test("an admin applies a prepared fix after confirming; a reviewer sees no Apply (Review Focus 1)", async ({ page, context }) => {
  await signInWithCookie(context, "dev_reviewer");
  await page.goto("/en/site-health");
  await expect(page.getByTestId("finding-dismiss-sf_3")).toBeVisible();
  await expect(page.getByTestId("finding-apply-sf_3")).toHaveCount(0);
  await signInWithCookie(context, "dev_admin");
  await page.goto("/en/site-health");
  await expect(page.getByTestId("finding-apply-sf_1")).toHaveCount(0);
  await page.getByTestId("finding-apply-sf_3").click();
  await page.getByTestId("finding-apply-sf_3-confirm").click();
  await expect(page.getByTestId("finding-sf_3")).toHaveCount(0);
  await page.goto("/en/site-health?tab=applied");
  await expect(page.getByTestId("finding-sf_3")).toBeVisible();
});

test("dismissing moves a finding to Dismissed", async ({ page, context }) => {
  await signInWithCookie(context, "dev_reviewer");
  await page.goto("/en/site-health");
  await page.getByTestId("finding-dismiss-sf_2").click();
  await expect(page.getByTestId("finding-sf_2")).toHaveCount(0);
  await page.goto("/en/site-health?tab=dismissed");
  await expect(page.getByTestId("finding-sf_2")).toBeVisible();
});

test("a scan over the monthly limit shows the quota message, and a reviewer is told to ask the admin (Review Focus 2)", async ({ page, context }) => {
  await setMockScenario(context, "quota");
  await signInWithCookie(context, "dev_reviewer");
  await page.goto("/en/site-health");
  await page.getByTestId("site-scan").click();
  await expect(page.getByTestId("quota-exceeded")).toContainText("Monthly limit reached for Site scans.");
  await expect(page.getByTestId("ask-admin")).toBeVisible();
});

test("in Arabic, the page is right to left and an Arabic finding keeps its own direction (Review Focus 5)", async ({ page, context }) => {
  await signInWithCookie(context, "dev_reviewer");
  await page.goto("/ar/site-health");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByTestId("finding-tab-todo")).toHaveText("للمعالجة");
  await expect(page.getByTestId("finding-issue-sf_4")).toHaveAttribute("dir", "auto");
  await expect(page.getByTestId("finding-issue-sf_4")).toHaveText("عنوان الصفحة أطول من 60 حرفاً");
});
```

- [ ] **Step 2: Run the unit tests to make sure they fail**

Run: `pnpm test tests/unit/site-health.test.ts tests/unit/action-inputs.test.ts tests/unit/nav.test.ts`
Expected: FAIL.
- `site-health.test.ts` and `action-inputs.test.ts` fail to resolve `@/lib/site-health/findings` and `…/site-health/actions`.
- The nav test finds no `siteHealth` item.

- [ ] **Step 3: Write the findings module**

Create `src/lib/site-health/findings.ts`:

```ts
/** Finding tabs (spec v1.1 §4 SiteFinding.status): what still needs a decision, then what's done. */
export const FINDING_TABS = {
  todo: ["open", "prepared"],
  applied: ["applied"],
  dismissed: ["dismissed"],
} as const;
export type FindingTab = keyof typeof FINDING_TABS;
export const FINDING_TAB_KEYS = Object.keys(FINDING_TABS) as FindingTab[];

export function findingTab(value: string | string[] | undefined): FindingTab {
  const tab = Array.isArray(value) ? value[0] : value;
  return tab && Object.hasOwn(FINDING_TABS, tab) ? (tab as FindingTab) : "todo";
}

export const tabStatuses = (tab: FindingTab): string[] => [...FINDING_TABS[tab]];

/**
 * What a person can do with a finding: choose an open one to prepare a fix for, apply a prepared fix (Admin only,
 * because it changes the live website: design §5), and dismiss one that's still open or prepared.
 */
export function findingActions(finding: { status: string }, canApply: boolean) {
  return {
    select: finding.status === "open",
    apply: canApply && finding.status === "prepared",
    dismiss: finding.status === "open" || finding.status === "prepared",
  };
}
```

- [ ] **Step 4: Write the actions and the menu item**

Create `src/app/[locale]/(app)/site-health/actions.ts`:

```ts
"use server";

import { z } from "zod";
import type { ActionResult } from "@/lib/actions/result";
import { ask, change, EngineId, IdempotencyKey, INVALID, Locale } from "@/lib/actions/server";
import { FINDING_BULK_ACTIONS } from "@/lib/engine/api";
import type { BulkResult, JobStart } from "@/lib/engine/schemas";

const Change = z.object({ locale: Locale, idempotencyKey: IdempotencyKey });
const Ids = z.array(EngineId).min(1).max(100);

/** Scan site (spec v1.1 §6): a job. Both roles can start one (design §5: site health view). */
export async function scanSiteAction(input: { locale: string; idempotencyKey: string }): Promise<ActionResult<JobStart>> {
  const parsed = Change.safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, idempotencyKey } = parsed.data;
  return ask(locale, idempotencyKey, ({ engine, ...ctx }) => engine.scanSite(ctx), "siteHealth.view");
}

/** Prepare fixes for the selected findings: a job; nothing changes on the website yet. */
export async function prepareFixesAction(input: { locale: string; ids: string[]; idempotencyKey: string }): Promise<ActionResult<JobStart>> {
  const parsed = Change.extend({ ids: Ids }).safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, ids, idempotencyKey } = parsed.data;
  return ask(locale, idempotencyKey, ({ engine, ...ctx }) => engine.prepareFixes(ids, ctx), "siteHealth.view");
}

/** Apply changes the live website, so it's the Admin's (design §5 siteHealth.apply); dismiss is open to both roles. */
export async function findingsAction(input: { locale: string; action: string; ids: string[]; idempotencyKey: string }): Promise<ActionResult<BulkResult>> {
  const parsed = Change.extend({ action: z.enum(FINDING_BULK_ACTIONS), ids: Ids }).safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, action, ids, idempotencyKey } = parsed.data;
  return change(locale, idempotencyKey, ({ engine, ...ctx }) => engine.bulkFindings(action, ids, ctx), action === "apply" ? "siteHealth.apply" : "siteHealth.view");
}
```

In `src/components/shell/nav.ts`, insert this item before the `settings` item:

```ts
  { key: "siteHealth", href: "/site-health", permission: "siteHealth.view" },
```

- [ ] **Step 5: Run the unit tests to make sure they pass**

Run: `pnpm test tests/unit/site-health.test.ts tests/unit/action-inputs.test.ts tests/unit/nav.test.ts`
Expected: PASS.

- [ ] **Step 6: Add the messages**

Merge into `messages/en.json`:
- at `Shell.nav`: `{ "siteHealth": "Site health" }`
- at the top level:

```json
{
  "SiteHealth": {
    "title": "Site health",
    "hint": "Problems the content engine found on the website, and the fixes it proposes. Applying a fix changes the live website.",
    "tabs": { "label": "Findings", "todo": "To do", "applied": "Applied", "dismissed": "Dismissed" },
    "scan": "Scan site",
    "scanning": "Scanning the website…",
    "prepare": "Prepare fixes for selected ({count})",
    "preparing": "Preparing fixes…",
    "columns": { "select": "Select", "url": "Page", "level": "Level", "issue": "Issue", "fix": "Proposed fix", "status": "Status", "actions": "Actions" },
    "select": "Select {url}",
    "levels": { "critical": "Critical", "warn": "Warning", "info": "Info" },
    "statuses": { "open": "Open", "prepared": "Fix prepared", "applied": "Applied", "dismissed": "Dismissed" },
    "apply": "Apply",
    "applyTitle": "Apply this fix to the live website?",
    "applyBody": "The content engine will change {url} on the website now.",
    "dismiss": "Dismiss",
    "empty": "Nothing here.",
    "failed": "Not done:"
  }
}
```

Merge into `messages/ar.json`:
- at `Shell.nav`: `{ "siteHealth": "صحة الموقع" }`
- at the top level:

```json
{
  "SiteHealth": {
    "title": "صحة الموقع",
    "hint": "مشكلات وجدها محرك المحتوى في الموقع، والإصلاحات التي يقترحها. تطبيق الإصلاح يغيّر الموقع المباشر.",
    "tabs": { "label": "النتائج", "todo": "للمعالجة", "applied": "مطبّقة", "dismissed": "مستبعدة" },
    "scan": "فحص الموقع",
    "scanning": "جارٍ فحص الموقع…",
    "prepare": "إعداد إصلاحات للمحدد ({count})",
    "preparing": "جارٍ إعداد الإصلاحات…",
    "columns": { "select": "تحديد", "url": "الصفحة", "level": "المستوى", "issue": "المشكلة", "fix": "الإصلاح المقترح", "status": "الحالة", "actions": "الإجراءات" },
    "select": "تحديد {url}",
    "levels": { "critical": "حرج", "warn": "تحذير", "info": "معلومة" },
    "statuses": { "open": "مفتوحة", "prepared": "الإصلاح جاهز", "applied": "مطبّقة", "dismissed": "مستبعدة" },
    "apply": "تطبيق",
    "applyTitle": "تطبيق هذا الإصلاح على الموقع المباشر؟",
    "applyBody": "سيغيّر محرك المحتوى الصفحة {url} على الموقع الآن.",
    "dismiss": "استبعاد",
    "empty": "لا شيء هنا.",
    "failed": "لم يتم:"
  }
}
```

- [ ] **Step 7: Write the page**

Create `src/components/site-health/finding-tabs.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { FINDING_TAB_KEYS, type FindingTab } from "@/lib/site-health/findings";
import { cn } from "@/lib/utils";

export const findingTabHref = (tab: FindingTab) => (tab === "todo" ? "/site-health" : `/site-health?tab=${tab}`);

export async function FindingTabs({ current }: { current: FindingTab }) {
  const t = await getTranslations("SiteHealth.tabs");
  return (
    <nav aria-label={t("label")} className="flex flex-wrap gap-2 border-b border-border pb-2">
      {FINDING_TAB_KEYS.map((tab) => (
        <Link
          key={tab}
          href={findingTabHref(tab)}
          data-testid={`finding-tab-${tab}`}
          aria-current={tab === current ? "page" : undefined}
          className={cn("rounded-md px-3 py-1.5 text-sm hover:bg-muted", tab === current && "bg-muted font-medium")}
        >
          {t(tab)}
        </Link>
      ))}
    </nav>
  );
}
```

Create `src/components/site-health/findings-board.tsx`:

```tsx
"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { findingsAction, prepareFixesAction, scanSiteAction } from "@/app/[locale]/(app)/site-health/actions";
import { ActionFailure } from "@/components/actions/action-failure";
import { ConfirmDialog } from "@/components/editor/confirm-dialog";
import { JobTracker } from "@/components/jobs/job-tracker";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { useEngineAction } from "@/lib/actions/use-engine-action";
import type { EngineFailure } from "@/lib/engine/result";
import type { SiteFinding } from "@/lib/engine/schemas";
import { findingActions } from "@/lib/site-health/findings";
import { cn } from "@/lib/utils";

type Props = { locale: string; findings: SiteFinding[]; pollSeconds: number; canApply: boolean; canRequestUpgrade: boolean };

const LEVEL_TONE: Record<string, string> = { critical: "bg-bad-bg text-bad-fg", warn: "bg-warn-bg text-warn-fg", info: "bg-info-bg text-info-fg" };

/** Spec v1.1 §6 /site-health: Scan site and Prepare fixes for selected (jobs), and a findings table with Apply and Dismiss. */
export function FindingsBoard({ locale, findings, pollSeconds, canApply, canRequestUpgrade }: Props) {
  const t = useTranslations("SiteHealth");
  const router = useRouter();
  const scan = useEngineAction(scanSiteAction);
  const prepare = useEngineAction(prepareFixesAction);
  const act = useEngineAction(findingsAction);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scanJob, setScanJob] = useState<string | null>(null);
  const [prepareJob, setPrepareJob] = useState<string | null>(null);
  const [error, setError] = useState<EngineFailure | null>(null);
  const [failures, setFailures] = useState<string[]>([]);
  const refresh = useCallback(() => router.refresh(), [router]);
  const chosen = [...selected].filter((id) => findings.some((finding) => finding.id === id && findingActions(finding, canApply).select));
  const label = (group: "levels" | "statuses", code: string) => (t.has(`${group}.${code}`) ? t(`${group}.${code}`) : code);

  function toggle(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function startScan() {
    setError(null);
    const result = await scan.run({ locale });
    if (result.ok) setScanJob(result.data.jobId);
    else setError(result.error);
  }

  async function startPrepare() {
    setError(null);
    const result = await prepare.run({ locale, ids: chosen });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPrepareJob(result.data.jobId);
    setSelected(new Set());
  }

  /** One finding through the bulk endpoint; a refusal names the page it's about (spec v1.1 §3 bulk result). */
  async function run(action: "apply" | "dismiss", finding: SiteFinding): Promise<EngineFailure | null> {
    setFailures([]);
    const result = await act.run({ locale, action, ids: [finding.id] });
    if (!result.ok) return result.error;
    setFailures(result.data.failed.map((failure) => `${finding.url}: ${failure.message}`));
    return null;
  }

  async function dismiss(finding: SiteFinding) {
    setError(null);
    const failure = await run("dismiss", finding);
    if (failure) setError(failure);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button data-testid="site-scan" disabled={scan.pending} onClick={() => void startScan()}>
          {t("scan")}
        </Button>
        <Button variant="outline" data-testid="prepare-fixes" disabled={chosen.length === 0 || prepare.pending} onClick={() => void startPrepare()}>
          {t("prepare", { count: String(chosen.length) })}
        </Button>
      </div>
      {scanJob && <JobTracker key={scanJob} jobId={scanJob} pollSeconds={pollSeconds} label={t("scanning")} testId="scan-job" onDone={refresh} />}
      {prepareJob && <JobTracker key={prepareJob} jobId={prepareJob} pollSeconds={pollSeconds} label={t("preparing")} testId="prepare-job" onDone={refresh} />}
      {error && <ActionFailure error={error} locale={locale} canRequestUpgrade={canRequestUpgrade} />}
      {failures.length > 0 && (
        <div role="alert" data-testid="finding-failures" className="rounded-md bg-bad-bg p-3 text-sm text-bad-fg">
          <p className="font-medium">{t("failed")}</p>
          <ul className="mt-1 list-disc ps-5">
            {failures.map((line) => (
              <li key={line} dir="auto">
                {line}
              </li>
            ))}
          </ul>
        </div>
      )}
      {findings.length === 0 ? (
        <p data-testid="findings-empty" className="text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table data-testid="findings" className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="w-8 p-2">
                  <span className="sr-only">{t("columns.select")}</span>
                </th>
                <th className="p-2 text-start font-medium">{t("columns.url")}</th>
                <th className="p-2 text-start font-medium">{t("columns.level")}</th>
                <th className="p-2 text-start font-medium">{t("columns.issue")}</th>
                <th className="p-2 text-start font-medium">{t("columns.fix")}</th>
                <th className="p-2 text-start font-medium">{t("columns.status")}</th>
                <th className="p-2">
                  <span className="sr-only">{t("columns.actions")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {findings.map((finding) => {
                const allowed = findingActions(finding, canApply);
                return (
                  <tr key={finding.id} data-testid={`finding-${finding.id}`} className="border-b border-border align-top last:border-0">
                    <td className="p-2">
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        data-testid={`finding-select-${finding.id}`}
                        aria-label={t("select", { url: finding.url })}
                        disabled={!allowed.select}
                        checked={selected.has(finding.id)}
                        onChange={(event) => toggle(finding.id, event.target.checked)}
                      />
                    </td>
                    <td className="p-2">
                      <a href={finding.url} target="_blank" rel="noreferrer" dir="ltr" className="break-all text-primary underline">
                        {finding.url}
                      </a>
                    </td>
                    <td className="p-2">
                      <span data-testid={`finding-level-${finding.id}`} className={cn("rounded px-2 py-0.5 text-xs", LEVEL_TONE[finding.level] ?? "bg-muted")}>
                        {label("levels", finding.level)}
                      </span>
                    </td>
                    <td className="p-2" dir="auto" data-testid={`finding-issue-${finding.id}`}>
                      {finding.issue}
                    </td>
                    <td className="p-2" dir="auto" data-testid={`finding-fix-${finding.id}`}>
                      {finding.fix ?? "—"}
                    </td>
                    <td className="p-2" data-testid={`finding-status-${finding.id}`}>
                      {label("statuses", finding.status)}
                    </td>
                    <td className="p-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {allowed.apply && (
                          <ConfirmDialog
                            testId={`finding-apply-${finding.id}`}
                            triggerVariant="default"
                            triggerLabel={t("apply")}
                            title={t("applyTitle")}
                            description={t("applyBody", { url: finding.url })}
                            confirmLabel={t("apply")}
                            pending={act.pending}
                            onConfirm={() => run("apply", finding)}
                          />
                        )}
                        {allowed.dismiss && (
                          <Button size="sm" variant="outline" data-testid={`finding-dismiss-${finding.id}`} disabled={act.pending} onClick={() => void dismiss(finding)}>
                            {t("dismiss")}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

Create `src/components/site-health/site-health-view.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import { EngineNotice } from "@/components/dashboard/engine-notice";
import { Pager } from "@/components/lists/pager";
import { SkippedNote } from "@/components/lists/skipped-note";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/locales";
import { can } from "@/lib/auth/roles";
import { requirePermission } from "@/lib/auth/session";
import { getEngine } from "@/lib/engine";
import { tryEngine } from "@/lib/engine/result";
import { pageCount, requestedPage } from "@/lib/lists/paging";
import { findingTab, tabStatuses } from "@/lib/site-health/findings";
import { FindingTabs, findingTabHref } from "./finding-tabs";
import { FindingsBoard } from "./findings-board";

type Props = { locale: AppLocale; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Spec v1.1 §6 /site-health: findings by tab, a page at a time. Both roles see it; only an Admin can apply a fix (design §5). */
export async function SiteHealthView({ locale, searchParams }: Props) {
  const session = await requirePermission(locale, "siteHealth.view");
  const query = await searchParams;
  const tab = findingTab(query.tab);
  const page = requestedPage(query.page);
  const tLists = await getTranslations("Lists");
  const engine = await getEngine();
  const meta = await tryEngine(() => engine.meta());
  if (!meta.ok) return <EngineNotice error={meta.error} />;
  const list = await tryEngine(() => engine.listFindings({ statuses: tabStatuses(tab), page, pageSize: meta.data.limits.pageSizeDefault }));

  return (
    <div className="flex flex-col gap-4">
      <FindingTabs current={tab} />
      {!list.ok ? (
        <EngineNotice error={list.error} />
      ) : (
        <>
          <SkippedNote count={list.data.skipped} />
          {page > 1 && list.data.findings.length === 0 ? (
            <p data-testid="list-page-empty" className="text-sm">
              {tLists("pageEmpty")}{" "}
              <Link href={findingTabHref(tab)} data-testid="list-first-page" className="text-primary underline">
                {tLists("firstPage")}
              </Link>
            </p>
          ) : (
            <FindingsBoard
              locale={locale}
              findings={list.data.findings}
              pollSeconds={meta.data.pollSeconds}
              canApply={can(session.role, "siteHealth.apply")}
              canRequestUpgrade={can(session.role, "plan.manage")}
            />
          )}
          <Pager pathname="/site-health" page={page} pages={pageCount(list.data.meta)} query={tab === "todo" ? {} : { tab }} />
        </>
      )}
    </div>
  );
}
```

Create `src/app/[locale]/(app)/site-health/page.tsx`:

```tsx
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SectionSkeleton } from "@/components/dashboard/section-skeleton";
import { SiteHealthView } from "@/components/site-health/site-health-view";
import { asAppLocale } from "@/i18n/locales";

// searchParams (tab, page) is request data: it's awaited inside the Suspense boundary (Cache Components).
export default async function SiteHealthPage({ params, searchParams }: PageProps<"/[locale]/site-health">) {
  const locale = asAppLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("SiteHealth");
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-3xl">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("hint")}</p>
      </div>
      <Suspense fallback={<SectionSkeleton />}>
        <SiteHealthView locale={locale} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
```

- [ ] **Step 8: Run the e2e tests**

Run: `pnpm e2e tests/e2e/site-health.spec.ts tests/e2e/shell.spec.ts`
Expected: PASS (7 site-health tests, and the shell tests still pass).

- [ ] **Step 9: Lint, typecheck and the whole unit suite**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: lint and typecheck exit 0; every unit test passes.

- [ ] **Step 10: Commit**

```bash
git add src messages tests/unit/site-health.test.ts tests/unit/action-inputs.test.ts tests/unit/nav.test.ts tests/e2e/site-health.spec.ts
git commit -m "feat: the Site health page: scans, fix preparation, apply (Admin) and dismiss"
```

---

### Task 5: The Plan & usage page

**Files:**
- Create:
  - page: `src/app/[locale]/(app)/plan/page.tsx`
  - components: `src/components/plan/plan-view.tsx`, `src/components/plan/usage-chart.tsx`, `src/components/plan/request-upgrade.tsx`
- Modify:
  - libs: `src/lib/plan/usage.ts`, `src/lib/format/datetime.ts`
  - actions and menu: `src/app/[locale]/(app)/plan/actions.ts`, `src/components/shell/nav.ts`
  - messages: `messages/en.json`, `messages/ar.json`
- Test:
  - unit (append): `tests/unit/plan-usage.test.ts`, `tests/unit/format.test.ts`, `tests/unit/action-inputs.test.ts`, `tests/unit/nav.test.ts`
  - e2e (create): `tests/e2e/plan.spec.ts`

**Interfaces:**
- Consumes: Task 1 `usage`; Task 3 `QuotaBars`, `monthOf`, `siteMetrics`; M3a `requestUpgradeAction`
- Produces:
  - **`usage.ts`:**
    - `lastMonths(month, count)`
    - `metricSeries(usage, siteId, months, metric)`, which returns `{ month, value }[]`
    - `siteResults(usage, siteId)`
  - **`datetime.ts`:** `formatDate(iso, { timeZone, locale })` and `formatMonth(month, locale, { year? })`
  - **`requestUpgradeAction({ locale, metric?, note?, idempotencyKey })`**
  - **Nav item:** `{ key: "plan", href: "/plan", permission: "plan.manage" }`
  - **Test ids:**
    - Summary: `plan-name`, `plan-period`.
    - Chart: `usage-{metric}`, `usage-latest-{metric}`, `usage-bar-{metric}-{YYYY-MM}`.
    - Results: `results-published`, `results-keywords`, `results-live`.
    - Upgrade: `upgrade-metric`, `upgrade-note`, `plan-request-upgrade`, `plan-upgrade-requested`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/plan-usage.test.ts`, and add `lastMonths`, `metricSeries` and `siteResults` to its import from `@/lib/plan/usage`:

```ts
describe("the usage chart's numbers (Review Focus 3)", () => {
  it("takes the months ending with the plan's month, oldest first, across a year boundary", () => {
    expect(lastMonths("2026-02", 4)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(lastMonths("someday", 3)).toEqual([]);
  });

  it("reads one metric per month for this site, with 0 for a month that has no numbers", () => {
    expect(metricSeries(USAGE, "site_fakher", ["2026-09", "2026-10"], "articles")).toEqual([
      { month: "2026-09", value: 0 },
      { month: "2026-10", value: 24 },
    ]);
    expect(metricSeries(USAGE, "site_fakher", ["2026-10"], "videoMinutes")).toEqual([{ month: "2026-10", value: 0 }]);
  });

  it("reads this site's results, or zeros", () => {
    expect([siteResults(USAGE, "site_fakher"), siteResults(USAGE, "site_other")]).toEqual([
      { published: 41, keywordsCovered: 12 },
      { published: 0, keywordsCovered: 0 },
    ]);
  });
});
```

Append to `tests/unit/format.test.ts`, and add `formatDate` and `formatMonth` to its import from `@/lib/format/datetime`:

```ts
describe("formatDate and formatMonth (spec v1.1 §6 Plan & usage)", () => {
  it("shows a plan period's dates in the site's timezone, without the time", () => {
    expect(formatDate("2026-10-31T23:59:59+04:00", { timeZone: "Asia/Dubai", locale: "en" })).toBe("Oct 31, 2026");
    expect(formatDate("not a date", { timeZone: "Asia/Dubai", locale: "en" })).toBe("not a date");
  });

  it("names a YYYY-MM month in the interface language with Latin digits (Review Focus 5)", () => {
    expect([formatMonth("2026-10", "en"), formatMonth("2026-10", "en", { year: false })]).toEqual(["Oct 2026", "Oct"]);
    const arabic = formatMonth("2026-10", "ar");
    expect(arabic).toContain("2026");
    expect(arabic).not.toMatch(/[٠-٩]/);
    expect(arabic).not.toBe("Oct 2026");
    expect(formatMonth("2026-13", "en")).toBe("2026-13");
  });
});
```

Append to `tests/unit/action-inputs.test.ts`:

```ts
describe("requesting an upgrade from the Plan page", () => {
  it("sends the chosen limit and the note", async () => {
    engine.requestUpgrade.mockResolvedValue({ requested: true });
    await requestUpgradeAction({ locale: "en", metric: "articles", note: "Twenty more articles a month", idempotencyKey: key });
    expect(engine.requestUpgrade).toHaveBeenCalledWith("articles", "Twenty more articles a month", expect.objectContaining({ idempotencyKey: key }));
  });
});
```

In `tests/unit/nav.test.ts`, append inside `describe("visibleNavItems", …)`:

```ts
  it("shows Plan & usage to admins only", () => {
    expect(visibleNavItems("reviewer").map((item) => item.key)).not.toContain("plan");
    expect(NAV_ITEMS.find((item) => item.key === "plan")).toEqual({ key: "plan", href: "/plan", permission: "plan.manage" });
  });
```

Create `tests/e2e/plan.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { isolateMockStore, signInWithCookie } from "./helpers";

test.beforeEach(async ({ context }) => {
  await isolateMockStore(context);
});

test("an admin sees the plan, its period, quota bars with this site's share, and this site's results", async ({ page, context }) => {
  await signInWithCookie(context, "dev_admin");
  await page.goto("/en/plan");
  await expect(page.getByTestId("plan-name")).toHaveText("Pro");
  await expect(page.getByTestId("plan-period")).toHaveText("Oct 1, 2026 – Oct 31, 2026");
  await expect(page.getByTestId("quota-articles")).toContainText("31 of 40");
  await expect(page.getByTestId("quota-site-articles")).toHaveText("This site: 24");
  await expect(page.getByTestId("results-published")).toHaveText("41");
  await expect(page.getByTestId("results-keywords")).toHaveText("12");
  await expect(page.getByTestId("results-live")).toHaveAttribute("href", "/en/history");
});

test("the usage chart covers six months for each metric the plan lists, a month with no numbers as 0 (Review Focus 3)", async ({ page, context }) => {
  await signInWithCookie(context, "dev_admin");
  await page.goto("/en/plan");
  await expect(page.getByTestId("usage-articles").locator("li")).toHaveCount(6);
  await expect(page.getByTestId("usage-bar-articles-2026-05")).toHaveAttribute("aria-label", "May 2026: 12");
  await expect(page.getByTestId("usage-latest-articles")).toHaveText("24");
  await expect(page.getByTestId("usage-bar-videoMinutes-2026-10")).toHaveAttribute("aria-label", "Oct 2026: 0");
});

test("an admin requests an upgrade with a note", async ({ page, context }) => {
  await signInWithCookie(context, "dev_admin");
  await page.goto("/en/plan");
  await page.getByTestId("upgrade-metric").selectOption("articles");
  await page.getByTestId("upgrade-note").fill("Twenty more articles a month");
  await page.getByTestId("plan-request-upgrade").click();
  await expect(page.getByTestId("plan-upgrade-requested")).toBeVisible();
});

test("a reviewer has no Plan & usage item and is sent back from /plan", async ({ page, context }) => {
  await signInWithCookie(context, "dev_reviewer");
  await page.goto("/en/plan");
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.getByTestId("nav-plan")).toHaveCount(0);
});

test("in Arabic, months are named in Arabic with Latin digits (Review Focus 5)", async ({ page, context }) => {
  await signInWithCookie(context, "dev_admin");
  await page.goto("/ar/plan");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  const label = await page.getByTestId("usage-bar-articles-2026-10").getAttribute("aria-label");
  expect(label).toContain("2026");
  expect(label).toMatch(/: 24$/);
  expect(label).not.toMatch(/[٠-٩]/);
});
```

- [ ] **Step 2: Run the unit tests to make sure they fail**

Run: `pnpm test tests/unit/plan-usage.test.ts tests/unit/format.test.ts tests/unit/action-inputs.test.ts tests/unit/nav.test.ts`
Expected: FAIL.
- `lastMonths`, `metricSeries`, `siteResults`, `formatDate` and `formatMonth` are not functions.
- The note test sees `requestUpgrade` called with `undefined` as the note.
- The nav test finds no `plan` item.

- [ ] **Step 3: Write the helpers, the note and the menu item**

Append to `src/lib/plan/usage.ts`:

```ts
const MONTH = /^(\d{4})-(\d{2})$/;

/** The `count` months ending with `month` (YYYY-MM), oldest first; none when the month can't be read. */
export function lastMonths(month: string, count: number): string[] {
  const match = MONTH.exec(month);
  if (!match) return [];
  const end = Number(match[1]) * 12 + Number(match[2]) - 1;
  return Array.from({ length: count }, (_, i) => {
    const index = end - (count - 1 - i);
    return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
  });
}

/** One metric's monthly numbers for this site; a month with no numbers is 0. */
export function metricSeries(usage: Usage, siteId: string, months: string[], metric: string): { month: string; value: number }[] {
  return months.map((month) => ({ month, value: siteMetrics(usage, siteId, month)?.[metric] ?? 0 }));
}

/** This site's results (spec v1.1 §7 usage.results: articles published, keywords covered), or zeros. */
export function siteResults(usage: Usage, siteId: string): { published: number; keywordsCovered: number } {
  const found = usage.results.find((result) => result.siteId === siteId);
  return { published: found?.published ?? 0, keywordsCovered: found?.keywordsCovered ?? 0 };
}
```

Append to `src/lib/format/datetime.ts`:

```ts
/** A date without the time (a plan period's start or end), in the site's timezone. */
export function formatDate(iso: string, opts: { timeZone: string; locale: AppLocale }): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const format = (timeZone: string) =>
    new Intl.DateTimeFormat(INTL_LOCALE[opts.locale], { day: "numeric", month: "short", year: "numeric", timeZone, numberingSystem: "latn" }).format(date);
  try {
    return format(opts.timeZone);
  } catch (error) {
    if (error instanceof RangeError) return `${format("UTC")} UTC`;
    throw error;
  }
}

/** A YYYY-MM month as a short name ("Oct 2026"; "Oct" without the year), with Latin digits; unchanged if it can't be read. */
export function formatMonth(month: string, locale: AppLocale, options: { year?: boolean } = {}): string {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!match) return month;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    month: "short",
    ...(options.year === false ? {} : { year: "numeric" }),
    timeZone: "UTC",
    numberingSystem: "latn",
  }).format(date);
}
```

Replace `src/app/[locale]/(app)/plan/actions.ts` with:

```ts
"use server";

import { z } from "zod";
import type { ActionResult } from "@/lib/actions/result";
import { change, IdempotencyKey, INVALID, Locale } from "@/lib/actions/server";

/** Request upgrade (design §9 429 and the Plan page: Admin only; spec v1.1 §7 POST /account/upgrade-request {metric?, note?}). */
export async function requestUpgradeAction(input: {
  locale: string;
  metric?: string;
  note?: string;
  idempotencyKey: string;
}): Promise<ActionResult<{ requested: true }>> {
  const parsed = z
    .object({ locale: Locale, metric: z.string().max(60).optional(), note: z.string().max(2000).optional(), idempotencyKey: IdempotencyKey })
    .safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, metric, note, idempotencyKey } = parsed.data;
  return change(locale, idempotencyKey, ({ engine, ...ctx }) => engine.requestUpgrade(metric, note, ctx), "plan.manage");
}
```

In `src/components/shell/nav.ts`, insert this item before the `settings` item:

```ts
  { key: "plan", href: "/plan", permission: "plan.manage" },
```

- [ ] **Step 4: Run the unit tests to make sure they pass**

Run: `pnpm test tests/unit/plan-usage.test.ts tests/unit/format.test.ts tests/unit/action-inputs.test.ts tests/unit/nav.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the messages**

Merge into `messages/en.json`:
- at `Shell.nav`: `{ "plan": "Plan & usage" }`
- at the top level:

```json
{
  "Plan": {
    "title": "Plan & usage",
    "period": "{from} – {to}",
    "usage": { "title": "This site's usage", "hint": "Per month, {from} to {to}.", "bar": "{month}: {value}" },
    "results": {
      "title": "This site's results",
      "published": "articles published",
      "keywordsCovered": "keywords covered",
      "liveUrls": "See the live URLs in History"
    },
    "upgrade": {
      "title": "Request an upgrade",
      "hint": "Quantum1st sets the limits. Tell them what you need.",
      "metric": "Limit",
      "anyMetric": "Not one in particular",
      "note": "Note (optional)",
      "submit": "Request upgrade",
      "requested": "Upgrade requested. Quantum1st will be in touch."
    }
  }
}
```

Merge into `messages/ar.json`:
- at `Shell.nav`: `{ "plan": "الباقة والاستخدام" }`
- at the top level:

```json
{
  "Plan": {
    "title": "الباقة والاستخدام",
    "period": "{from} – {to}",
    "usage": { "title": "استخدام هذا الموقع", "hint": "شهرياً، من {from} إلى {to}.", "bar": "{month}: {value}" },
    "results": {
      "title": "نتائج هذا الموقع",
      "published": "مقالات منشورة",
      "keywordsCovered": "كلمات مفتاحية مغطاة",
      "liveUrls": "اعرض الروابط المباشرة في السجل"
    },
    "upgrade": {
      "title": "طلب ترقية",
      "hint": "تحدد Quantum1st الحدود. أخبرهم بما تحتاجه.",
      "metric": "الحد",
      "anyMetric": "ليس حداً بعينه",
      "note": "ملاحظة (اختيارية)",
      "submit": "طلب ترقية",
      "requested": "تم طلب الترقية. ستتواصل معك Quantum1st."
    }
  }
}
```

- [ ] **Step 6: Write the page**

Create `src/components/plan/usage-chart.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AppLocale } from "@/i18n/locales";
import type { Usage } from "@/lib/engine/schemas";
import { formatMonth } from "@/lib/format/datetime";
import { formatNumber } from "@/lib/format/number";
import { metricSeries } from "@/lib/plan/usage";

type Props = { locale: AppLocale; metrics: string[]; months: string[]; usage: Usage; siteId: string };

/** Spec v1.1 §6 Plan & usage: this site's usage per metric (metrics from /account/plan), as plain bars; each metric's busiest month is full height. */
export async function UsageChart({ locale, metrics, months, usage, siteId }: Props) {
  const t = await getTranslations("Plan.usage");
  const tMetrics = await getTranslations("Dashboard.quota.metrics");
  return (
    <Card data-testid="usage-chart">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("hint", { from: formatMonth(months[0], locale), to: formatMonth(months[months.length - 1], locale) })}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 sm:grid-cols-2">
        {metrics.map((metric) => {
          const series = metricSeries(usage, siteId, months, metric);
          const max = Math.max(1, ...series.map((point) => point.value));
          const label = tMetrics.has(metric) ? tMetrics(metric) : metric;
          return (
            <figure key={metric} data-testid={`usage-${metric}`} className="flex flex-col gap-2">
              <figcaption className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium">{label}</span>
                <span data-testid={`usage-latest-${metric}`} className="text-muted-foreground">
                  {formatNumber(series[series.length - 1]?.value ?? 0, locale)}
                </span>
              </figcaption>
              <ol className="flex h-24 items-end gap-1.5" aria-label={label}>
                {series.map((point) => (
                  <li
                    key={point.month}
                    data-testid={`usage-bar-${metric}-${point.month}`}
                    aria-label={t("bar", { month: formatMonth(point.month, locale), value: formatNumber(point.value, locale) })}
                    className="flex h-full flex-1 flex-col justify-end"
                  >
                    <div className="w-full rounded-t bg-primary/70" style={{ height: `${Math.round((point.value / max) * 100)}%` }} />
                  </li>
                ))}
              </ol>
              <div className="flex gap-1.5 text-[10px] text-muted-foreground" aria-hidden="true">
                {series.map((point) => (
                  <span key={point.month} className="flex-1 text-center">
                    {formatMonth(point.month, locale, { year: false })}
                  </span>
                ))}
              </div>
            </figure>
          );
        })}
      </CardContent>
    </Card>
  );
}
```

Create `src/components/plan/request-upgrade.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { requestUpgradeAction } from "@/app/[locale]/(app)/plan/actions";
import { ActionError } from "@/components/actions/action-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useEngineAction } from "@/lib/actions/use-engine-action";
import type { EngineFailure } from "@/lib/engine/result";

const SELECT = "h-9 rounded-md border border-input bg-card px-3 text-sm";

/** Spec v1.1 §6 Plan & usage "Request upgrade": an optional limit and note; Quantum1st answers outside the portal. */
export function RequestUpgrade({ locale, metrics }: { locale: string; metrics: string[] }) {
  const t = useTranslations("Plan.upgrade");
  const tMetrics = useTranslations("Dashboard.quota.metrics");
  const request = useEngineAction(requestUpgradeAction);
  const [metric, setMetric] = useState("");
  const [note, setNote] = useState("");
  const [requested, setRequested] = useState(false);
  const [error, setError] = useState<EngineFailure | null>(null);

  async function submit() {
    setError(null);
    const result = await request.run({ locale, metric: metric || undefined, note: note.trim() || undefined });
    if (result.ok) setRequested(true);
    else setError(result.error);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("hint")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {requested ? (
          <p role="status" data-testid="plan-upgrade-requested" className="text-sm text-ok-fg">
            {t("requested")}
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="upgrade-metric">{t("metric")}</Label>
              <select id="upgrade-metric" data-testid="upgrade-metric" className={SELECT} value={metric} onChange={(event) => setMetric(event.target.value)}>
                <option value="">{t("anyMetric")}</option>
                {metrics.map((code) => (
                  <option key={code} value={code}>
                    {tMetrics.has(code) ? tMetrics(code) : code}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="upgrade-note">{t("note")}</Label>
              <Textarea id="upgrade-note" data-testid="upgrade-note" dir="auto" rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
            </div>
            <div>
              <Button data-testid="plan-request-upgrade" disabled={request.pending} onClick={() => void submit()}>
                {t("submit")}
              </Button>
            </div>
          </>
        )}
        {error && <ActionError error={error} />}
      </CardContent>
    </Card>
  );
}
```

Create `src/components/plan/plan-view.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import { EngineNotice } from "@/components/dashboard/engine-notice";
import { QuotaBars } from "@/components/dashboard/quota-bars";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/locales";
import { requirePermission } from "@/lib/auth/session";
import { getEngine } from "@/lib/engine";
import { tryEngine } from "@/lib/engine/result";
import { formatDate } from "@/lib/format/datetime";
import { formatNumber } from "@/lib/format/number";
import { lastMonths, monthOf, siteMetrics, siteResults } from "@/lib/plan/usage";
import { RequestUpgrade } from "./request-upgrade";
import { UsageChart } from "./usage-chart";

/** Spec v1.1 §6 /account Plan & usage tab (design §7 /plan, Admin): plan, quota bars, this site's usage and results, Request upgrade. */
export async function PlanView({ locale }: { locale: AppLocale }) {
  await requirePermission(locale, "plan.manage");
  const t = await getTranslations("Plan");
  const engine = await getEngine();
  const [plan, siteId, site] = await Promise.all([tryEngine(() => engine.plan()), tryEngine(() => engine.siteId()), tryEngine(() => engine.siteTimezone())]);
  if (!plan.ok) return <EngineNotice error={plan.error} />;

  const timeZone = site.ok ? site.data.timezone : "UTC";
  const month = monthOf(plan.data.period.start);
  const months = lastMonths(month, 6);
  const usage = months.length > 0 ? await tryEngine(() => engine.usage({ from: months[0], to: month })) : null;
  const id = siteId.ok ? siteId.data : "";
  const siteUsage = usage?.ok ? siteMetrics(usage.data, id, month) : null;
  const results = usage?.ok ? siteResults(usage.data, id) : null;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle data-testid="plan-name">{plan.data.plan.name}</CardTitle>
          <CardDescription data-testid="plan-period">
            {t("period", { from: formatDate(plan.data.period.start, { timeZone, locale }), to: formatDate(plan.data.period.end, { timeZone, locale }) })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <QuotaBars locale={locale} quotas={plan.data.quotas} siteUsage={siteUsage} />
        </CardContent>
      </Card>
      {usage && !usage.ok && <EngineNotice error={usage.error} />}
      {usage?.ok && <UsageChart locale={locale} metrics={plan.data.metrics} months={months} usage={usage.data} siteId={id} />}
      {results && (
        <Card>
          <CardHeader>
            <CardTitle>{t("results.title")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-8 text-sm">
            <div>
              <p data-testid="results-published" className="text-2xl font-semibold">
                {formatNumber(results.published, locale)}
              </p>
              <p className="text-muted-foreground">{t("results.published")}</p>
            </div>
            <div>
              <p data-testid="results-keywords" className="text-2xl font-semibold">
                {formatNumber(results.keywordsCovered, locale)}
              </p>
              <p className="text-muted-foreground">{t("results.keywordsCovered")}</p>
            </div>
            <Link href="/history" data-testid="results-live" className="text-primary underline">
              {t("results.liveUrls")}
            </Link>
          </CardContent>
        </Card>
      )}
      <RequestUpgrade locale={locale} metrics={plan.data.metrics} />
    </div>
  );
}
```

Create `src/app/[locale]/(app)/plan/page.tsx`:

```tsx
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SectionSkeleton } from "@/components/dashboard/section-skeleton";
import { PlanView } from "@/components/plan/plan-view";
import { asAppLocale } from "@/i18n/locales";

export default async function PlanPage({ params }: PageProps<"/[locale]/plan">) {
  const locale = asAppLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("Plan");
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl">{t("title")}</h1>
      <Suspense fallback={<SectionSkeleton />}>
        <PlanView locale={locale} />
      </Suspense>
    </div>
  );
}
```

- [ ] **Step 7: Run the e2e tests**

Run: `pnpm e2e tests/e2e/plan.spec.ts tests/e2e/quota.spec.ts`
Expected: PASS (5 plan tests, and the quota tests still pass).

- [ ] **Step 8: Lint, typecheck and the whole unit suite**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: lint and typecheck exit 0; every unit test passes.

- [ ] **Step 9: Commit**

```bash
git add src messages tests/unit tests/e2e/plan.spec.ts
git commit -m "feat: the Plan & usage page: quota bars, this site's monthly usage and results, Request upgrade with a note"
```

---

### Task 6: Social post editing: hashtag chips, a caption preview, and Instagram's photo rule

**Files:**
- Create:
  - lib: `src/lib/posts/social.ts`
  - components: `src/components/editor/hashtag-chips.tsx`, `src/components/editor/social-preview.tsx`
- Modify:
  - lib: `src/lib/posts/rules.ts`
  - components: `src/components/editor/post-editor.tsx`, `src/components/editor/action-bar.tsx`
  - messages: `messages/en.json`, `messages/ar.json`
  - e2e: `tests/e2e/editor.spec.ts`, `tests/e2e/photos.spec.ts`
- Test: `tests/unit/social.test.ts`, `tests/e2e/social.spec.ts` (create)

**Interfaces:**
- Consumes: M2a editor (`PostEditor`, `ActionBar`, `set("hashtags")`, `FieldError`); M2b `PhotoPanel`
- Produces:
  - **`social.ts`:** `toHashtag(word)`, `parseHashtags(text)`, `withHashtags(current, added)`, `captionOf(content, hashtags)`, `captionLength(caption)`
  - **`needsPhoto(post)`** in `rules.ts`
  - **`HashtagChips({ value, onChange, disabled })`**
  - **`SocialPreview({ platform, language, content, hashtags, imageUrl })`**
  - **Test ids:**
    - Hashtags: `hashtags`, `hashtag-chip-{i}`, `hashtag-remove-{i}`, `hashtag-input`.
    - Preview: `social-preview`, `social-preview-caption`, `social-preview-count`, `social-preview-photo`.
    - The Instagram photo rule: `photo-needed`.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/social.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { needsPhoto } from "@/lib/posts/rules";
import { captionLength, captionOf, parseHashtags, withHashtags } from "@/lib/posts/social";

describe("hashtags (spec v1.1 §4: social posts only)", () => {
  it("turns typed words into hashtags, splitting on spaces and commas, the Arabic one too (Review Focus 5)", () => {
    expect(parseHashtags("dubai labour, #DubaiLaw،#عقارات_دبي")).toEqual(["#dubai", "#labour", "#DubaiLaw", "#عقارات_دبي"]);
  });

  it("drops punctuation and empty tags", () => {
    expect(parseHashtags("#UAE-Labour ## , !!")).toEqual(["#UAELabour"]);
  });

  it("keeps each tag once, ignoring case, and keeps the first spelling", () => {
    expect(withHashtags(["#Dubai"], ["#dubai", "#OffPlan", "#offplan"])).toEqual(["#Dubai", "#OffPlan"]);
  });
});

describe("the caption", () => {
  it("is the text, a blank line, then the hashtags", () => {
    expect([captionOf(" Short update. ", ["#UAELabourLaw", "#Dubai"]), captionOf("", ["#Dubai"]), captionOf("Text", [])]).toEqual([
      "Short update.\n\n#UAELabourLaw #Dubai",
      "#Dubai",
      "Text",
    ]);
  });

  it("counts characters as people do: an emoji or an Arabic letter is one", () => {
    expect([captionLength("مرحبا 👋"), captionLength("Short update.\n\n#UAELabourLaw #Dubai")]).toEqual([7, 35]);
  });
});

describe("needsPhoto (spec v1.1 §4 Post.image; Review Focus 4)", () => {
  it("an Instagram post without a photo needs one; with one, or on another platform, it doesn't", () => {
    expect([
      needsPhoto({ platform: "instagram", image: null }),
      needsPhoto({ platform: "instagram", image: { url: "https://x/p.jpg" } }),
      needsPhoto({ platform: "linkedin", image: null }),
    ]).toEqual([true, false, false]);
  });
});
```

Create `tests/e2e/social.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { isolateMockStore, signInWithCookie } from "./helpers";

const chips = "[data-testid^='hashtag-chip-']";

test.beforeEach(async ({ context }) => {
  await isolateMockStore(context);
  await signInWithCookie(context, "dev_reviewer");
});

test("hashtags are tidy chips: typed words get a #, a duplicate is dropped, and the change saves", async ({ page }) => {
  await page.goto("/en/review/p_206");
  await page.getByTestId("hashtag-input").fill("dubai labour, #dubai");
  await page.getByTestId("hashtag-input").press("Enter");
  await expect(page.getByTestId("hashtags").locator(chips)).toHaveCount(3);
  await expect(page.getByTestId("hashtag-chip-2")).toHaveText(/#labour/);
  await page.getByTestId("hashtag-remove-0").click();
  await expect(page.getByTestId("hashtag-chip-0")).toHaveText(/#Dubai/);
  await page.getByTestId("save").click();
  await expect(page.getByTestId("save-status")).toHaveText("Saved");
  await page.reload();
  await expect(page.getByTestId("hashtags").locator(chips)).toHaveCount(2);
});

test("the preview shows the caption with its hashtags, and counts the characters", async ({ page }) => {
  await page.goto("/en/review/p_206");
  const caption = page.getByTestId("social-preview-caption");
  await expect(caption).toContainText("Resigning doesn't cancel a commission");
  await expect(caption).toContainText("#UAELabourLaw #Dubai");
  await expect(page.getByTestId("social-preview-count")).toHaveText("127 characters");
  await page.getByTestId("editor-body").fill("Short update.");
  await expect(page.getByTestId("social-preview-count")).toHaveText("35 characters");
});

test("an article has neither hashtags nor a social preview", async ({ page }) => {
  await page.goto("/en/review/p_201");
  await expect(page.getByTestId("field-title")).toBeVisible();
  await expect(page.getByTestId("social-preview")).toHaveCount(0);
  await expect(page.getByTestId("hashtag-input")).toHaveCount(0);
});
```

In `tests/e2e/editor.spec.ts`, replace

```ts
  await expect(page.getByTestId("field-hashtags")).toHaveValue("#UAELabourLaw, #Dubai");
```

with

```ts
  await expect(page.getByTestId("hashtag-chip-0")).toHaveText(/#UAELabourLaw/);
  await expect(page.getByTestId("hashtag-chip-1")).toHaveText(/#Dubai/);
```

In `tests/e2e/photos.spec.ts`, replace the test `"an Instagram post asks for a photo and can't be approved without one"` with:

```ts
test("an Instagram post asks for a photo and can't be approved or published without one (Review Focus 4)", async ({ page }) => {
  await page.goto("/en/review/p_209");
  await expect(page.getByTestId("photo-required")).toBeVisible();
  await expect(page.getByTestId("approve")).toBeDisabled();
  await expect(page.getByTestId("publish")).toBeDisabled();
  await expect(page.getByTestId("photo-needed")).toBeVisible();
  await page.getByTestId("photo-upload").setInputFiles({ name: "pixel.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByTestId("photo-needed")).toHaveCount(0);
  await expect(page.getByTestId("approve")).toBeEnabled();
});
```

- [ ] **Step 2: Run the unit test to make sure it fails**

Run: `pnpm test tests/unit/social.test.ts`
Expected: FAIL to resolve `@/lib/posts/social`.

- [ ] **Step 3: Write the social module and the photo rule**

Create `src/lib/posts/social.ts`:

```ts
/** Anything that isn't a letter, digit or underscore, in any script. */
const NOT_TAG = /[^\p{L}\p{N}_]+/gu;

/** One hashtag: '#' and then letters, digits or '_' in any script; null when nothing is left. */
export function toHashtag(word: string): string | null {
  const body = word.replace(/^#+/, "").replace(NOT_TAG, "");
  return body ? `#${body}` : null;
}

/** "dubai labour, #DubaiLaw،#عقارات_دبي" → four tags: split on spaces and commas (the Arabic comma too). */
export function parseHashtags(text: string): string[] {
  return text
    .split(/[\s,،]+/u)
    .map(toHashtag)
    .filter((tag): tag is string => tag !== null);
}

/** Adds tags, keeping each once, ignoring case; the first spelling stays. */
export function withHashtags(current: string[], added: string[]): string[] {
  const seen = new Set(current.map((tag) => tag.toLowerCase()));
  const next = [...current];
  for (const tag of added) {
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(tag);
  }
  return next;
}

/** The caption as it will be posted: the text, a blank line, then the hashtags. */
export function captionOf(content: string, hashtags: string[]): string {
  const text = content.trim();
  const tags = hashtags.join(" ");
  return text && tags ? `${text}\n\n${tags}` : text || tags;
}

/** Characters as people count them (an emoji is one), not UTF-16 units. */
export const captionLength = (caption: string) => [...caption].length;
```

Append to `src/lib/posts/rules.ts`:

```ts
/** Spec v1.1 §4 Post.image: an Instagram post can't be approved or published without a photo. */
export const needsPhoto = (post: { platform: string; image?: unknown }) => post.platform === "instagram" && !post.image;
```

- [ ] **Step 4: Run the unit test to make sure it passes**

Run: `pnpm test tests/unit/social.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Add the messages**

Merge into `messages/en.json` at `Editor`:

```json
{
  "hashtagsHint": "Press Enter to add. Spaces and commas separate hashtags.",
  "addHashtag": "Add a hashtag",
  "removeHashtag": "Remove {tag}",
  "photoNeeded": "Add a photo first: Instagram posts can't be approved or published without one.",
  "preview": {
    "title": "Preview on {platform}",
    "empty": "Nothing to post yet.",
    "count": "{count, plural, one {{n} character} other {{n} characters}}"
  }
}
```

Merge into `messages/ar.json` at `Editor`:

```json
{
  "hashtagsHint": "اضغط Enter للإضافة. المسافات والفواصل تفصل بين الوسوم.",
  "addHashtag": "أضف وسماً",
  "removeHashtag": "إزالة {tag}",
  "photoNeeded": "أضف صورة أولاً: لا يمكن اعتماد منشورات إنستغرام أو نشرها بدونها.",
  "preview": {
    "title": "معاينة على {platform}",
    "empty": "لا شيء للنشر بعد.",
    "count": "{count, plural, zero {لا أحرف} one {حرف واحد} two {حرفان} few {{n} أحرف} many {{n} حرفاً} other {{n} حرف}}"
  }
}
```

- [ ] **Step 6: Write the components and wire them into the editor**

Create `src/components/editor/hashtag-chips.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseHashtags, withHashtags } from "@/lib/posts/social";

/** A social post's hashtags as chips: typed words become tags, each kept once (spec v1.1 §4: social posts only). */
export function HashtagChips({ value, onChange, disabled }: { value: string[]; onChange: (next: string[]) => void; disabled: boolean }) {
  const t = useTranslations("Editor");
  const [draft, setDraft] = useState("");

  function add(text: string) {
    const tags = parseHashtags(text);
    if (tags.length > 0) onChange(withHashtags(value, tags));
    setDraft("");
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="hashtag-input">{t("fields.hashtags")}</Label>
      <div data-testid="hashtags" className="flex flex-wrap gap-2">
        {value.map((tag, index) => (
          <span
            key={tag}
            data-testid={`hashtag-chip-${index}`}
            dir="auto"
            className="inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-sm text-accent-foreground"
          >
            {tag}
            {!disabled && (
              <button
                type="button"
                className="ms-1"
                data-testid={`hashtag-remove-${index}`}
                aria-label={t("removeHashtag", { tag })}
                onClick={() => onChange(value.filter((item) => item !== tag))}
              >
                ×
              </button>
            )}
          </span>
        ))}
      </div>
      {!disabled && (
        <>
          <Input
            id="hashtag-input"
            data-testid="hashtag-input"
            dir="auto"
            value={draft}
            placeholder={t("addHashtag")}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add(draft);
              }
            }}
            onBlur={() => {
              if (draft.trim()) add(draft);
            }}
          />
          <p className="text-xs text-muted-foreground">{t("hashtagsHint")}</p>
        </>
      )}
    </div>
  );
}
```

Create `src/components/editor/social-preview.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { captionLength, captionOf } from "@/lib/posts/social";

type Props = { platform: string; language: string; content: string; hashtags: string[]; imageUrl: string | null };

/** How the post will read on its platform: the photo, the text and the hashtags, with a character count. */
export function SocialPreview({ platform, language, content, hashtags, imageUrl }: Props) {
  const t = useTranslations("Editor.preview");
  const tReview = useTranslations("Review");
  const caption = captionOf(content, hashtags);
  const length = captionLength(caption);
  const platformName = tReview.has(`platforms.${platform}`) ? tReview(`platforms.${platform}`) : platform;
  return (
    <section data-testid="social-preview" aria-label={t("title", { platform: platformName })} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 text-sm">
      <p className="font-medium">{t("title", { platform: platformName })}</p>
      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- engine photo URLs come from many hosts (Pexels, uploads)
        <img src={imageUrl} alt="" data-testid="social-preview-photo" className="aspect-square w-full rounded object-cover" />
      )}
      <p data-testid="social-preview-caption" lang={language} dir={language === "ar" ? "rtl" : "ltr"} className="whitespace-pre-wrap break-words">
        {caption || t("empty")}
      </p>
      <p data-testid="social-preview-count" className="text-xs text-muted-foreground">
        {t("count", { count: length, n: String(length) })}
      </p>
    </section>
  );
}
```

In `src/components/editor/post-editor.tsx`:
1. Add the imports `import { HashtagChips } from "./hashtag-chips";` and `import { SocialPreview } from "./social-preview";`.
2. Delete `const parseHashtags = (text: string) => text.split(",").map((tag) => tag.trim()).filter(Boolean);`.
3. Delete `const [hashtagText, setHashtagText] = useState(() => post.hashtags.join(", "));`.
4. In `show()`, delete the line `setHashtagText(next.form.hashtags.join(", "));`.
5. Replace the hashtags `FieldCounter`

   ```tsx
             <FieldCounter
               id="hashtags" error={errors.byField.hashtags}
               testId="field-hashtags"
               label={t("fields.hashtags")}
               hint={t("hashtagsHint")}
               value={hashtagText}
               onChange={(value) => {
                 setHashtagText(value);
                 set("hashtags")(parseHashtags(value));
               }}
               disabled={!editable}
             />
   ```

   with

   ```tsx
             <>
               <HashtagChips value={form.hashtags} onChange={set("hashtags")} disabled={!editable} />
               {errors.byField.hashtags && <FieldError testId="field-hashtags-error" message={errors.byField.hashtags} />}
             </>
   ```

6. In the `<aside>`, before `<PhotoPanel`, add:

   ```tsx
             {current.kind === "social" && (
               <SocialPreview
                 platform={current.platform}
                 language={current.language}
                 content={form.content}
                 hashtags={form.hashtags}
                 imageUrl={current.image?.url ?? null}
               />
             )}
   ```

In `src/components/editor/action-bar.tsx`:
1. Change the rules import to include `needsPhoto`: `import { approvalMode, needsPhoto } from "@/lib/posts/rules";` (keep any other names it already imports).
2. Below `const publishable = …;`, add:

   ```tsx
     // Spec v1.1 §4 Post.image: an Instagram post can't be approved or published without a photo.
     const photoMissing = needsPhoto(post);
   ```

3. Add `|| photoMissing` to these three `disabled` expressions:
   - the direct Approve: `disabled={dirty || locked || approve.pending || photoMissing}`
   - the override Approve `ConfirmDialog`: `disabled={dirty || locked || photoMissing}`
   - the Publish now `ConfirmDialog`: `disabled={dirty || locked || !publishable || photoMissing}`
4. Before `{(allowed.has("approve") || allowed.has("publishNow")) && mode === "blocked" && (`, add:

   ```tsx
         {(allowed.has("approve") || allowed.has("publishNow")) && photoMissing && (
           <p data-testid="photo-needed" className="text-sm text-bad-fg">
             {t("photoNeeded")}
           </p>
         )}
   ```

If `useState` or `FieldCounter` are no longer used anywhere in `post-editor.tsx` after these edits, the linter will say so; remove only what it names.

- [ ] **Step 7: Run the e2e tests**

Run: `pnpm e2e tests/e2e/social.spec.ts tests/e2e/editor.spec.ts tests/e2e/photos.spec.ts tests/e2e/editor-actions.spec.ts`
Expected: PASS. The 3 social tests pass, as do the editor, photo and editor-action tests, including the updated hashtag and Instagram tests.

- [ ] **Step 8: Lint, typecheck and the whole unit suite**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: lint and typecheck exit 0; every unit test passes.

- [ ] **Step 9: Commit**

```bash
git add src messages tests/unit/social.test.ts tests/e2e/social.spec.ts tests/e2e/editor.spec.ts tests/e2e/photos.spec.ts
git commit -m "feat: social post editing: hashtag chips, a caption preview with a count, and Instagram's photo rule on Approve and Publish"
```

---

### Task 7: M4a wrap-up and full verification

**Files:**
- Create: `docs/plans/2026-10-22-m4a-followups.md`
- Modify: `README.md`, `docs/plans/2026-10-21-m1-followups.md`, `docs/plans/2026-10-22-m3a-followups.md`, `docs/plans/2026-10-22-m3b-followups.md`

**Interfaces:**
- Consumes: everything above
- Produces: a documented, fully green M4a

- [ ] **Step 1: Document M4a in `README.md`**

Append:

```markdown
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
```

- [ ] **Step 2: Update the follow-up docs**

- In `docs/plans/2026-10-21-m1-followups.md`:
  - append ` — handled in M4a` to "limit 0 + used 0 shows "ok" with empty bar…"
  - append ` — handled in M4a (dashboard and /plan show this site's share)` to the ruling about the dashboard's share of usage
- In `docs/plans/2026-10-22-m3a-followups.md`:
  - append ` — handled in M4a` to "AI keyword proposals show errors with `ActionError`, not `ActionFailure`…"
  - append ` — handled in M4a` to "A 429 without `details.metric`…"
- In `docs/plans/2026-10-22-m3b-followups.md`, append ` — handled in M4a` to the smaller point about the SEO proposal using `ActionError`.

Create `docs/plans/2026-10-22-m4a-followups.md`:

```markdown
# M4a follow-ups

## Questions for Quantum1st (from M4a)

- **Site health:**
  - Can a fix be applied only after it's prepared?
  - Who may dismiss a finding? The portal lets both roles dismiss, and only the Admin apply.
  - Which order and page size does `GET …/site/findings` use? Is `level` a comma-separated filter?
  - What does a finished scan or fix job return in `result`? The mock returns `{findingIds}`.
- **Usage:**
  - Are `from`/`to` inclusive months in the site's timezone?
  - Is a month with no activity missing, or present with zeros?
  - Should `plan.metrics` like `sites` (account-level) be charted per site?
- **Social posts:** what are the caption and hashtag limits per platform (LinkedIn, Instagram)? Could `/meta.limits` carry them, so the preview's count can warn?
- **Upgrade requests:** is there a way to read whether an upgrade request is pending? The portal remembers "requested" only until the page reloads.
```

- [ ] **Step 3: Run every check from a clean build**

```bash
rm -rf .next
pnpm lint && pnpm typecheck && pnpm test && pnpm e2e && ALLOW_TEST_LOGINS=1 pnpm build
```

Expected:
- lint and typecheck exit 0
- Vitest: about 351 passed (317 + 34)
- Playwright: about 140 passed (121 + 19)
- the build lists `◐ /en/site-health`, `◐ /ar/site-health`, `◐ /en/plan` and `◐ /ar/plan`

- [ ] **Step 4: Manual smoke test**

Run `pnpm dev`, use a fresh `mock_store` cookie, and check:
- (a) **As Reviewer:**
  - The menu has Site health but neither Plan & usage nor Settings.
  - Scan site shows progress and adds a finding.
  - Preparing a fix for "Missing meta description" fills in its fix.
  - There's no Apply button.
- (b) **As Admin:** Apply on the prepared broken-link finding asks first, then moves it to Applied.
- (c) **Plan & usage:**
  - "Pro" with "Oct 1, 2026 – Oct 31, 2026".
  - Quota bars with "This site: …".
  - The six-month chart, the results (41 published, 12 keywords covered), and Request upgrade.
- (d) **Social posts:**
  - On p_206, adding "dubai labour" adds `#labour` only once, and the preview updates its count.
  - On p_209 (Instagram), Approve stays disabled with the reason until a photo is uploaded.
- (e) **Arabic:** `/ar/site-health` and `/ar/plan` are right to left, with Arabic month names and Latin digits.
- (f) **Dev console:** no console errors, no dev overlay, and no errors in the `pnpm dev` log.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: M4a decisions and questions for Quantum1st; site health, plan & usage and social editing complete"
git log --oneline | head -10
```

## Decisions in M4a

These come from the plan, ahead of execution:

- **Site health permissions:** dismissing a finding and preparing fixes don't change the website, so both roles can. Only Apply needs `siteHealth.apply` (design §5: "apply a fix (changes the live site)").
- **Finding tabs:** To do / Applied / Dismissed, from spec v1.1 §4's statuses, like M3a's keyword tabs. No level filter yet, because the engine's order puts critical findings first (a question for Quantum1st).
- **The usage chart:**
  - It's plain HTML and CSS (no chart package).
  - It covers 6 months ending with the plan period's month, and every metric `/account/plan.metrics` lists, even account-level ones like `sites`, which show 0 per site.
- **Social preview limits:** no per-platform cap is shown, because `/meta` has none. Hard-coding LinkedIn's or Instagram's limits would break spec §2.
- **Instagram's photo rule:** it's checked in the browser as well as by the engine, so the reason shows before a refused request.
- **The quota scenario:** it now also meters scans and AI proposals, and its plan shows every hard quota at its limit.
