# Articles AI Dashboard — M2a Review & Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reviewers can open the review queue, edit a draft in a rich-text editor, and act on it against the v1.1 API (mock engine):
- save, with version-conflict and edit-lock handling
- see checks and sources
- approve, including overriding critical findings (with a reason)
- ask for changes and watch the redraft progress
- reject or delete
- compare an English/Arabic pair side by side

**Architecture:**
- **Mock engine.** It becomes stateful: an in-process store, one per `mock_store` cookie namespace, with seeded posts, rule-based findings, locks, versions, background jobs and idempotent replay.
- **Engine access.** The engine API gains the post, job and category endpoints. Server actions wrap them with role checks, input validation, `X-Acting-User` and an `Idempotency-Key`, then `refresh()` the page.
- **UI.** Client components (review board, editor) call the actions through one hook, `useEngineAction`, which owns the idempotency key.

**Tech Stack:**
- Existing M1 stack (Next.js 16.4.2 with Cache Components, React 19.3, next-intl 4.14.9, Zod 4.6.7, shadcn/ui radix-nova RTL, Vitest 5, Playwright 1.64)
- plus TipTap 3.32.0 (`@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extension-table`; `@tiptap/html` for tests) and happy-dom 20.14.6 (tests)

**Spec:**
- `docs/specs/2026-10-21-marketing-dashboard-design.md`: §5 roles, §6 matching structure, §7 screens, §8 data flow, §9 errors
- `docs/specs/Marketing Portal Build Spec v1.1.html`: §3 conventions and locks, §4 Post/Finding/Job, §5 status flows, §6 `/review` and `/review/[postId]`, §7 endpoints, §9 errors
- M1 follow-ups: `docs/plans/2026-10-21-m1-followups.md`

**Scope split:** design M2 is split into two plans.
- **M2a (this plan):** review and editing.
- **M2b (next plan):** photos, publish now and bulk publish, Scheduled, History, export, plus the remaining M1 follow-ups:
  - site-wide 401 banner
  - `error.tsx`
  - language switch on the sign-in and no-access pages

## Global Constraints

- All M1 Global Constraints still hold (`docs/plans/2026-10-21-m1-foundation.md`). In particular:
  - Cache Components rules
  - the server-only engine key
  - 12-hour site-timezone times
  - Latin digits
  - logical CSS (`ms-`, `me-`, `ps-`, `pe-`, `start`, `end`)
  - no "law firm" in copy
- **Pinned versions:** `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extension-table` and `@tiptap/html` 3.32.0; `happy-dom` 20.14.6 (the `@tiptap/html` peer range is `^20.8.9`).
- **Dynamic params:** `params` of the `[postId]` segment is runtime data. Await it only inside a component rendered under `<Suspense>`, never at the top of the page.
- **Changes go through server actions** in `src/app/[locale]/(app)/review/actions.ts`. Each one:
  1. calls `requirePermission(locale, "content.work")`
  2. validates its input with Zod
  3. sends `X-Acting-User` (the session email) and the caller's `idempotencyKey`
  4. returns a serialisable `ActionResult<T>` and never throws engine errors
  5. calls `refresh()` (from `next/cache`) after a successful change
- **Client components call actions only through `useEngineAction`.** It reuses the idempotency key after a `network_error` and makes a new one after any definite answer (spec §2).
- **Buttons come from `post.actions`** (from the API), filtered by role. Never infer allowed actions from status in the browser.
- **Arabic content renders right to left** (`dir="rtl"`) in the editor, the twin view and the review cards.
- **Every e2e test isolates the mock engine's state** by calling `isolateMockStore(context)` before navigating.
- **Show engine error messages as they are**, except the codes that have a translation:
  - `unauthorized`, `network_error`, `engine_unavailable`, `invalid_response`, `engine_busy`, `not_found`
  - plus the UI-handled `version_conflict` and `locked`

## Review Focus

1. **Loading engine HTML into the editor must not lose content.** Tables, links, h2–h4, lists and blockquotes must survive load and save. *Pinned by Task 6's round-trip unit test.*
2. **The same reviewer saves from two tabs.** The second save shows "Someone saved first" with the changed fields; nothing is silently overwritten. *Pinned by Task 6 e2e.*
3. **Double-clicking or retrying approve must not approve twice.** The engine replays the first result for a repeated key, and the client reuses the key only after `network_error`. *Pinned by Task 3 (replay) and Task 4 (`shouldReuseKey`) unit tests.*
4. **A lock left by a closed tab must expire**, not block the post forever. *Pinned by a Task 2 unit test.*
5. **An Arabic twin whose structure doesn't match its English version can't be approved**, even with an override reason, and the UI says why. *Pinned by Task 2 unit tests and Task 7 e2e.*

## File map (new unless marked)

```
src/lib/engine/schemas.ts                 (modify) Post, Finding, Job, BulkResult, categories, lock, PostUpdate
src/lib/engine/result.ts                  (modify) failures keep fields/details
src/lib/engine/notice.ts                  (modify) + engine_busy, not_found
src/lib/posts/rules.ts                    isOverridable, approvalMode, findingCounts (shared by mock + UI)
src/lib/engine/mock/rules.ts              mock-only finding computation, section signature
src/lib/engine/mock/post-fixtures.ts      seeded posts (EN/AR pairs, social, drafting, locked)
src/lib/engine/mock/store.ts              stateful mock store (posts, jobs, locks, versions, idempotency)
src/lib/engine/mock/registry.ts           one store per mock_store cookie namespace
src/lib/engine/mock/server.ts             (modify) post/job/category routes, idempotency, acting user
src/lib/engine/api.ts                     (modify) post/job/category methods
src/lib/engine/index.ts                   (modify) pass the namespaced store
src/lib/actions/result.ts                 ActionResult, shouldReuseKey, NETWORK_FAILURE
src/lib/actions/use-engine-action.ts      client hook owning the idempotency key
src/app/[locale]/(app)/review/actions.ts  server actions
src/lib/review/summary.ts                 bulk failure lines
src/app/[locale]/(app)/review/page.tsx    review queue page
src/components/review/*                   queue, board, card, auto-refresh
src/lib/editor/changed-fields.ts          conflict diff
src/lib/editor/blocks.ts                  block summaries + alignment for the twin view
src/components/editor/*                   rich text, fields, chips, conflict, lock, checks, sources, actions, job progress, twin view, post editor
src/app/[locale]/(app)/review/[postId]/page.tsx   editor page
messages/en.json, messages/ar.json        (modify) Shell.nav.review, Review, Editor, Errors additions
tests/unit/*.test.ts, tests/e2e/*.spec.ts
```

---

### Task 1: Post, job and bulk schemas; failures keep details

**Files:**
- Modify: `src/lib/engine/schemas.ts`, `src/lib/engine/result.ts`
- Create: `src/lib/posts/rules.ts`
- Test: `tests/unit/posts-schema.test.ts`

**Interfaces:**
- Consumes: the existing `isoDateTime` helper and the existing schemas
- Produces:
  - `FindingSchema`/`Finding` (`{ level; code?; ref?; overridable?; message }`)
  - `PostSchema`/`Post`; arrays default to `[]`; `content` is nullish because lists omit it
  - `PostsSchema`
  - `JobSchema`/`Job`, `JobStartSchema`, `BulkResultSchema`/`BulkResult`, `CategoriesSchema`/`Category`, `LockSchema`, `DeletedSchema`, `ReleasedSchema`
  - `PostUpdateSchema`/`PostUpdate` (`{ title; subtitle; slug; metaTitle; metaDescription; keywords; content; hashtags; section; version }`)
  - `EngineFailure` gains optional `fields` and `details`
  - from `src/lib/posts/rules.ts`: `isOverridable(f)`, `findingCounts(post)` → `{ critical; warn; human }`, `approvalMode(findings)` → `"direct" | "override" | "blocked"`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/posts-schema.test.ts
import { describe, expect, it } from "vitest";
import { EngineError } from "@/lib/engine/errors";
import { tryEngine } from "@/lib/engine/result";
import { PostSchema, PostUpdateSchema } from "@/lib/engine/schemas";
import { approvalMode, findingCounts, isOverridable } from "@/lib/posts/rules";

const minimal = {
  id: "p_1",
  kind: "blog",
  platform: "website",
  language: "en",
  status: "pending",
  title: "A title",
  createdAt: "2026-10-21T09:00:00+04:00",
  updatedAt: "2026-10-21T09:00:00+04:00",
  version: 3,
};

describe("PostSchema", () => {
  it("defaults missing lists to empty arrays", () => {
    const post = PostSchema.parse(minimal);
    expect(post.keywords).toEqual([]);
    expect(post.findings).toEqual([]);
    expect(post.actions).toEqual([]);
    expect(post.content).toBeUndefined();
  });

  it("parses a full post including lock, twin and seo", () => {
    const post = PostSchema.parse({
      ...minimal,
      pairId: "p_2",
      twin: { id: "p_2", language: "ar", status: "pending" },
      content: "<p>Body</p>",
      findings: [{ level: "critical", code: "meta_description_length", ref: "§3.2", message: "Too long" }],
      seo: { score: 85, checks: [] },
      lock: { by: "omar@example.com", at: "2026-10-21T09:00:00+04:00", expiresAt: "2026-10-21T09:15:00+04:00" },
      actions: ["edit", "approve"],
    });
    expect(post.twin?.language).toBe("ar");
    expect(post.lock?.by).toBe("omar@example.com");
    expect(post.actions).toEqual(["edit", "approve"]);
  });
});

describe("PostUpdateSchema", () => {
  it("accepts a complete update and rejects a missing version", () => {
    const update = {
      title: "T",
      subtitle: null,
      slug: "t",
      metaTitle: null,
      metaDescription: null,
      keywords: [],
      content: "<p>x</p>",
      hashtags: [],
      section: null,
      version: 2,
    };
    expect(PostUpdateSchema.safeParse(update).success).toBe(true);
    const withoutVersion = Object.fromEntries(Object.entries(update).filter(([key]) => key !== "version"));
    expect(PostUpdateSchema.safeParse(withoutVersion).success).toBe(false);
  });
});

describe("finding rules", () => {
  const critical = { level: "critical", message: "x" };
  const locked = { level: "critical", overridable: false, message: "structure" };
  const warn = { level: "warn", message: "w" };
  const human = { level: "human", message: "h" };

  it("treats a missing overridable flag as overridable", () => {
    expect(isOverridable(critical)).toBe(true);
    expect(isOverridable(locked)).toBe(false);
  });

  it("counts findings by level", () => {
    expect(findingCounts({ findings: [critical, warn, warn, human] })).toEqual({ critical: 1, warn: 2, human: 1 });
  });

  it("decides how approval works", () => {
    expect(approvalMode([warn, human])).toBe("direct");
    expect(approvalMode([critical, warn])).toBe("override");
    expect(approvalMode([critical, locked])).toBe("blocked");
  });
});

describe("tryEngine failures", () => {
  it("keep fields and details for the UI", async () => {
    const result = await tryEngine(async () => {
      throw new EngineError({
        status: 409,
        code: "locked",
        message: "Being edited",
        details: { lockedBy: "omar@example.com" },
        fields: { title: "Too long" },
      });
    });
    expect(result).toEqual({
      ok: false,
      error: { status: 409, code: "locked", message: "Being edited", details: { lockedBy: "omar@example.com" }, fields: { title: "Too long" } },
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test tests/unit/posts-schema.test.ts`
Expected: FAIL. `@/lib/posts/rules` can't be resolved, and `PostSchema` isn't exported.

- [ ] **Step 3: Add the schemas**

Append to `src/lib/engine/schemas.ts`:

```ts
// ── Posts (spec v1.1 §4 Post, Finding; §7 posts endpoints) ───────────────────
/** A list that may be missing or null in the response; always an array after parsing. */
const list = <T extends z.ZodType>(item: T) => z.array(item).nullish().transform((value) => value ?? []);

export const FindingSchema = z.object({
  level: z.string(), // known: critical | warn | human
  code: z.string().nullish(),
  ref: z.string().nullish(),
  overridable: z.boolean().nullish(),
  message: z.string(),
});
export type Finding = z.infer<typeof FindingSchema>;

export const LockSchema = z.object({ by: z.string(), at: isoDateTime, expiresAt: isoDateTime });

export const PostSchema = z.object({
  id: z.string(),
  kind: z.string(),
  platform: z.string(),
  origin: z.string().nullish(),
  sourcePostId: z.string().nullish(),
  language: z.string(),
  pairId: z.string().nullish(),
  twin: z.object({ id: z.string(), language: z.string(), status: z.string() }).nullish(),
  status: z.string(),
  topic: z.string().nullish(),
  tone: z.string().nullish(),
  title: z.string(),
  subtitle: z.string().nullish(),
  slug: z.string().nullish(),
  metaTitle: z.string().nullish(),
  metaDescription: z.string().nullish(),
  keywords: list(z.string()),
  content: z.string().nullish(), // lists (GET …/posts) omit it
  hashtags: list(z.string()),
  section: z.string().nullish(),
  image: z
    .object({
      url: z.string(),
      alt: z.string().nullish(),
      credit: z.string().nullish(),
      source: z.string().nullish(),
      pexelsId: z.number().nullish(),
    })
    .nullish(),
  photoIdea: z.string().nullish(),
  sources: list(z.object({ title: z.string(), url: z.string() })),
  linkSuggestions: list(z.object({ anchor: z.string(), url: z.string(), title: z.string().nullish() })),
  findings: list(FindingSchema),
  seo: z.object({ score: z.number(), checks: list(FindingSchema) }).nullish(),
  reviewNote: z.string().nullish(),
  error: z.string().nullish(),
  overrideReason: z.string().nullish(),
  schedule: z
    .object({ hold: z.boolean(), scheduledAt: isoDateTime.nullish(), position: z.number().int().nullish() })
    .nullish(),
  published: z
    .object({ target: z.string(), url: z.string(), externalId: z.string().nullish(), at: isoDateTime })
    .nullish(),
  lock: LockSchema.nullish(),
  requestedBy: z.string().nullish(),
  reviewedBy: z.string().nullish(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  version: z.number().int(),
  actions: list(z.string()), // GET …/posts/{id} returns the allowed actions
});
export type Post = z.output<typeof PostSchema>;
export const PostsSchema = z.array(PostSchema);

export const PostUpdateSchema = z.object({
  title: z.string(),
  subtitle: z.string().nullable(),
  slug: z.string().nullable(),
  metaTitle: z.string().nullable(),
  metaDescription: z.string().nullable(),
  keywords: z.array(z.string()),
  content: z.string(),
  hashtags: z.array(z.string()),
  section: z.string().nullable(),
  version: z.number().int(),
});
export type PostUpdate = z.infer<typeof PostUpdateSchema>;

export const JobSchema = z.object({
  id: z.string(),
  status: z.string(), // known: queued | running | done | failed
  progress: z.number().nullish(),
  result: z.unknown().nullish(),
  error: z.unknown().nullish(),
});
export type Job = z.infer<typeof JobSchema>;
export const JobStartSchema = z.object({ jobId: z.string(), status: z.string().nullish(), postIds: list(z.string()) });
export type JobStart = z.output<typeof JobStartSchema>;

export const BulkResultSchema = z.object({
  done: z.array(z.string()),
  failed: z.array(z.object({ id: z.string(), code: z.string(), message: z.string() })),
});
export type BulkResult = z.infer<typeof BulkResultSchema>;

export const CategoriesSchema = z.array(z.object({ slug: z.string(), name: z.string() }));
export type Category = z.infer<typeof CategoriesSchema>[number];

export const DeletedSchema = z.object({ deleted: z.literal(true) });
export const ReleasedSchema = z.object({ released: z.literal(true) });
```

- [ ] **Step 4: Keep fields and details on failures**

Replace `src/lib/engine/result.ts` with:

```ts
import { isEngineError } from "./errors";

export type EngineFailure = {
  status: number;
  code: string;
  message: string;
  fields?: Record<string, string>;
  details?: Record<string, unknown>;
};
export type EngineResult<T> = { ok: true; data: T } | { ok: false; error: EngineFailure };

/** Engine failures become values so a section can show a readable notice (Next hides thrown messages in production). */
export async function tryEngine<T>(fn: () => Promise<T>): Promise<EngineResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    if (isEngineError(error)) {
      return {
        ok: false,
        error: {
          status: error.status,
          code: error.code,
          message: error.message,
          ...(error.fields ? { fields: error.fields } : {}),
          ...(error.details ? { details: error.details } : {}),
        },
      };
    }
    throw error;
  }
}
```

- [ ] **Step 5: Add the shared finding rules**

```ts
// src/lib/posts/rules.ts
type FindingLike = { level: string; overridable?: boolean | null };

/** A missing flag means overridable; only an explicit false (e.g. structure_mismatch on TranslatePress sites) locks it. */
export function isOverridable(finding: FindingLike): boolean {
  return finding.overridable !== false;
}

export function findingCounts(post: { findings: readonly FindingLike[] }): { critical: number; warn: number; human: number } {
  const counts = { critical: 0, warn: 0, human: 0 };
  for (const finding of post.findings) {
    if (finding.level === "critical") counts.critical++;
    else if (finding.level === "warn") counts.warn++;
    else if (finding.level === "human") counts.human++;
  }
  return counts;
}

/** direct: no critical findings · override: needs a reason · blocked: a critical finding can't be overridden. */
export function approvalMode(findings: readonly FindingLike[]): "direct" | "override" | "blocked" {
  const critical = findings.filter((f) => f.level === "critical");
  if (critical.some((f) => !isOverridable(f))) return "blocked";
  return critical.length > 0 ? "override" : "direct";
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test && pnpm typecheck`
Expected: all unit tests pass (72 existing + 7 new = 79); typecheck exits 0. The existing `tryEngine` tests still pass because `toEqual` ignores missing optional keys.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add v1.1 post, finding, job and bulk schemas; keep error details on failures"
```

---
### Task 2: Stateful mock store (posts, findings, locks, versions, jobs)

**Files:**
- Create: `src/lib/engine/mock/rules.ts`, `src/lib/engine/mock/post-fixtures.ts`, `src/lib/engine/mock/store.ts`
- Test: `tests/unit/mock-store.test.ts`

**Interfaces:**
- Consumes: from Task 1, `Post`, `Finding`, `BulkResult`, `Category`, `approvalMode`; from M1, `mockMeta().limits`
- Produces:
  - `sectionSignature(html: string): string[]`
  - `computeFindings(post, twin, limits): Finding[]`
  - `seoScore(findings): number`
  - `seedPosts(): Post[]` (ids `p_201`–`p_208`), `SEED_DRAFTING_POST_ID = "p_207"`
  - `type MockOutcome<T> = { ok: true; status: number; data: T } | { ok: false; status: number; code: string; message: string; fields?; details? }`
  - `createMockStore(options?: { now?: () => number; jobDurationMs?: number })` → `MockStore` with these methods:
    - reads: `listPosts(statuses: string[] | null, page, pageSize)`, `getPost(id)`, `job(id)`, `categories()`
    - changes: `updatePost(id, input, actor)`, `approve(id, overrideReason, actor)`, `requestChanges(id, note, actor)`, `reject(id, note, actor)`, `remove(id, actor)`, `bulk(action, ids, note, actor)`
    - locks: `lock(id, actor)`, `unlock(id, actor)`, `takeover(id, actor)`
    - internals: `idempotency: Map<string, StoredResponse>`
  - Every method returns `MockOutcome`. `type MockStore = ReturnType<typeof createMockStore>`.

**Seeded posts** (all for the Fakher & Co site):

| id | kind / language | status | purpose |
|---|---|---|---|
| p_201 | blog en | pending | clean article, twin of p_202; has h2, ul, table, blockquote, link |
| p_202 | blog ar | pending | Arabic twin of p_201, same structure |
| p_203 | blog en | pending | meta description over the limit → critical, overridable |
| p_204 | blog en | pending | twin of p_205 |
| p_205 | blog ar | pending | one paragraph fewer than p_204 → `structure_mismatch`, not overridable |
| p_206 | social en (linkedin) | pending | plain-text body and hashtags |
| p_207 | blog en | drafting | redraft job that never finishes (spinner) |
| p_208 | blog en | pending | locked by `omar@example.com` until 2099 |

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/mock-store.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { sectionSignature } from "@/lib/engine/mock/rules";
import { createMockStore, type MockStore } from "@/lib/engine/mock/store";

const ME = "reviewer@example.com";
const START = Date.parse("2026-10-22T08:00:00Z");
let t = START;
let store: MockStore;

function data<T>(outcome: { ok: boolean; data?: T }): T {
  expect(outcome.ok).toBe(true);
  return (outcome as { data: T }).data;
}

function update(id: string, changes: Record<string, unknown>) {
  const post = data(store.getPost(id));
  return store.updatePost(id, { ...post, ...changes, version: changes.version ?? post.version }, ME);
}

beforeEach(() => {
  t = START;
  store = createMockStore({ now: () => t, jobDurationMs: 1000 });
});

describe("section signature", () => {
  it("lists top-level block tags only", () => {
    expect(sectionSignature("<h2>a</h2><p>b <a href='x'>c</a></p><ul><li>d</li></ul><table><tr><th>e</th></tr></table>")).toEqual([
      "h2",
      "p",
      "ul",
      "table",
    ]);
  });
});

describe("seeded posts and findings", () => {
  it("lists posts without their content, with paging meta", () => {
    const page = data(store.listPosts(["pending", "drafting"], 1, 25));
    expect(page.items.map((p) => p.id)).toEqual(["p_201", "p_202", "p_203", "p_204", "p_205", "p_206", "p_207", "p_208"]);
    expect(page.items[0].content).toBeUndefined();
    expect(page.meta).toEqual({ page: 1, pageSize: 25, total: 8 });
  });

  it("computes findings from the rules", () => {
    const codes = (id: string) => data(store.getPost(id)).findings.map((f) => `${f.level}:${f.code}`);
    expect(codes("p_201")).toEqual(["human:legal_review"]);
    expect(codes("p_203")).toContain("critical:meta_description_length");
    expect(data(store.getPost("p_205")).findings.find((f) => f.code === "structure_mismatch")?.overridable).toBe(false);
  });

  it("returns allowed actions and the twin summary", () => {
    const post = data(store.getPost("p_201"));
    expect(post.actions).toEqual(["edit", "approve", "changes", "reject", "delete"]);
    expect(post.twin).toEqual({ id: "p_202", language: "ar", status: "pending" });
  });
});

describe("saving", () => {
  it("rejects a stale version with version_conflict", () => {
    const outcome = update("p_201", { title: "New", version: 0 });
    expect(outcome).toMatchObject({ ok: false, status: 409, code: "version_conflict" });
  });

  it("saves, bumps the version and recalculates findings", () => {
    const before = data(store.getPost("p_203"));
    const saved = data(update("p_203", { metaDescription: "Short and clear." }));
    expect(saved.version).toBe(before.version + 1);
    expect(saved.findings.some((f) => f.level === "critical")).toBe(false);
  });

  it("clears the Arabic structure mismatch once the structures match", () => {
    const english = data(store.getPost("p_204"));
    const fixed = data(update("p_205", { content: english.content }));
    expect(fixed.findings.some((f) => f.code === "structure_mismatch")).toBe(false);
  });
});

describe("locks", () => {
  it("refuses changes while someone else holds the lock", () => {
    const outcome = update("p_208", { title: "Mine" });
    expect(outcome).toMatchObject({ ok: false, status: 409, code: "locked", details: { lockedBy: "omar@example.com" } });
  });

  it("lets a lock expire so an abandoned tab can't block the post (Review Focus 4)", () => {
    data(store.lock("p_201", "omar@example.com"));
    expect(update("p_201", { title: "Blocked" })).toMatchObject({ code: "locked" });
    t += 16 * 60_000; // lockMinutes is 15
    expect(update("p_201", { title: "Free again" }).ok).toBe(true);
  });

  it("moves the lock to whoever takes over", () => {
    const post = data(store.takeover("p_208", ME));
    expect(post.lock?.by).toBe(ME);
    expect(update("p_208", { title: "Mine now" }).ok).toBe(true);
  });
});

describe("approval", () => {
  it("approves a post with no critical findings", () => {
    const post = data(store.approve("p_201", undefined, ME));
    expect(post.status).toBe("approved");
    expect(post.reviewedBy).toBe(ME);
    expect(post.actions).toEqual(["delete"]);
  });

  it("needs a reason to override a critical finding", () => {
    expect(store.approve("p_203", "  ", ME)).toMatchObject({ ok: false, status: 422, code: "framework_blocked" });
    const post = data(store.approve("p_203", "Checked by the partner", ME));
    expect(post.overrideReason).toBe("Checked by the partner");
  });

  it("never approves a structure mismatch, even with a reason (Review Focus 5)", () => {
    expect(store.approve("p_205", "Please approve", ME)).toMatchObject({ ok: false, code: "framework_blocked" });
  });
});

describe("changes, reject, delete, bulk", () => {
  it("needs a note to ask for changes", () => {
    expect(store.requestChanges("p_201", " ", ME)).toMatchObject({ ok: false, status: 400, code: "invalid_input" });
  });

  it("redrafts in the background and comes back for review", () => {
    const started = data(store.requestChanges("p_201", "Shorter intro", ME));
    expect(data(store.getPost("p_201")).status).toBe("drafting");
    expect(data(store.job(started.jobId)).status).not.toBe("done");
    t += 1000;
    expect(data(store.job(started.jobId))).toMatchObject({ status: "done", progress: 1 });
    const post = data(store.getPost("p_201"));
    expect(post.status).toBe("pending");
    expect(post.reviewNote).toBe("Shorter intro");
    expect(post.content).toContain("Revised as requested: Shorter intro");
  });

  it("keeps the seeded drafting post drafting", () => {
    t += 24 * 60 * 60_000;
    expect(data(store.getPost("p_207")).status).toBe("drafting");
  });

  it("rejects with a note and deletes, unpairing the twin", () => {
    expect(data(store.reject("p_206", "Off-topic", ME))).toMatchObject({ status: "rejected", reviewNote: "Off-topic" });
    expect(data(store.remove("p_201", ME))).toEqual({ deleted: true });
    expect(store.getPost("p_201")).toMatchObject({ ok: false, code: "not_found" });
    expect(data(store.getPost("p_202")).twin).toBeNull();
  });

  it("applies a bulk action post by post and reports failures", () => {
    const result = data(store.bulk("approve", ["p_201", "p_203"], undefined, ME));
    expect(result.done).toEqual(["p_201"]);
    expect(result.failed).toEqual([expect.objectContaining({ id: "p_203", code: "framework_blocked" })]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test tests/unit/mock-store.test.ts`
Expected: FAIL. `@/lib/engine/mock/rules` and `@/lib/engine/mock/store` can't be resolved.

- [ ] **Step 3: Implement the mock rules**

```ts
// src/lib/engine/mock/rules.ts
import type { Finding, Post } from "../schemas";

type Limits = { metaTitle: number; metaDescription: number };

/** Top-level block tags in order. The mock's content keeps lists and tables free of nested <p>, so a regex is enough. */
export function sectionSignature(html: string): string[] {
  return [...html.matchAll(/<(h[1-6]|p|ul|ol|table|blockquote)\b/gi)].map((match) => match[1].toLowerCase());
}

/** A stand-in for Quantum1st's article checks; codes follow spec v1.1 §4 Finding. */
export function computeFindings(post: Post, twin: Post | undefined, limits: Limits): Finding[] {
  const findings: Finding[] = [];
  if (!post.title.trim()) {
    findings.push({ level: "critical", code: "title_missing", ref: "§2.1", overridable: true, message: "The title is empty." });
  }
  const metaDescription = post.metaDescription ?? "";
  if (metaDescription.length > limits.metaDescription) {
    findings.push({
      level: "critical",
      code: "meta_description_length",
      ref: "§3.2",
      overridable: true,
      message: `The meta description is ${metaDescription.length} characters; the limit is ${limits.metaDescription}.`,
    });
  }
  const metaTitle = post.metaTitle ?? "";
  if (metaTitle.length > limits.metaTitle) {
    findings.push({
      level: "warn",
      code: "meta_title_length",
      ref: "§3.1",
      overridable: true,
      message: `The meta title is ${metaTitle.length} characters; the limit is ${limits.metaTitle}.`,
    });
  }
  if (post.kind === "blog" && post.keywords.length === 0) {
    findings.push({ level: "warn", code: "focus_keyword_missing", ref: "§3.4", overridable: true, message: "There is no focus keyword." });
  }
  if (post.kind === "blog" && post.language === "ar" && twin?.content && post.content) {
    const english = sectionSignature(twin.content);
    const arabic = sectionSignature(post.content);
    if (english.join(",") !== arabic.join(",")) {
      findings.push({
        level: "critical",
        code: "structure_mismatch",
        ref: "§11",
        overridable: false,
        message: `The Arabic version's structure doesn't match the English version (${arabic.length} vs ${english.length} sections).`,
      });
    }
  }
  if (post.kind === "blog") {
    findings.push({
      level: "human",
      code: "legal_review",
      ref: "§5.1",
      overridable: true,
      message: "Check the legal statements with a qualified reviewer before approving.",
    });
  }
  return findings;
}

export function seoScore(findings: readonly Finding[]): number {
  const critical = findings.filter((f) => f.level === "critical").length;
  const warn = findings.filter((f) => f.level === "warn").length;
  return Math.max(0, 100 - 15 * critical - 5 * warn);
}
```

- [ ] **Step 4: Add the seeded posts**

```ts
// src/lib/engine/mock/post-fixtures.ts
import type { Post } from "../schemas";

export const SEED_DRAFTING_POST_ID = "p_207";
const SEEDED_AT = "2026-10-21T09:00:00+04:00";

type Required = Pick<Post, "id" | "kind" | "platform" | "language" | "status" | "title">;

function post(fields: Required & Partial<Post>): Post {
  return {
    keywords: [],
    hashtags: [],
    sources: [],
    linkSuggestions: [],
    findings: [],
    actions: [],
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
    version: 1,
    requestedBy: "admin@example.com",
    ...fields,
  };
}

const LABOUR_LAW = "https://uaelegislation.gov.ae/en/legislations/1541";

const COMMISSION_EN =
  "<h2>When the commission is earned</h2>" +
  "<p>A commission is part of the wage when the contract or plan sets the percentage, the triggering event and the payment date.</p>" +
  "<ul><li>The employee's performance</li><li>The event that creates the right</li><li>The payment date</li></ul>" +
  "<h2>Rates by contract value</h2>" +
  "<table><tr><th>Contract value</th><th>Rate</th></tr><tr><td>Up to AED 1 million</td><td>2%</td></tr></table>" +
  "<blockquote>Article 53 requires payment within fourteen days of the end of the contract.</blockquote>" +
  `<p>Read the <a href="${LABOUR_LAW}">Labour Law</a> together with your commission plan.</p>`;

const COMMISSION_AR =
  "<h2>متى تُستحق العمولة</h2>" +
  "<p>تكون العمولة جزءاً من الأجر إذا حدد العقد أو النظام النسبة والواقعة المنشئة للحق وموعد السداد.</p>" +
  "<ul><li>أداء العامل</li><li>الواقعة المنشئة للحق</li><li>موعد السداد</li></ul>" +
  "<h2>النسب بحسب قيمة العقد</h2>" +
  "<table><tr><th>قيمة العقد</th><th>النسبة</th></tr><tr><td>حتى مليون درهم</td><td>2%</td></tr></table>" +
  "<blockquote>تلزم المادة 53 بالسداد خلال أربعة عشر يوماً من انتهاء العقد.</blockquote>" +
  `<p>اقرأ <a href="${LABOUR_LAW}">قانون العمل</a> مع نظام العمولات.</p>`;

const EVICTION_EN =
  "<h2>The 12-month notice</h2><p>A landlord who wants the property back must give notice twelve months ahead.</p>" +
  "<p>The notice must be sent by notary public or registered mail.</p>" +
  "<h2>Before the notice ends</h2><p>The tenant keeps every right under the lease until the date passes.</p>";

const EVICTION_AR = // one paragraph fewer than the English version → structure_mismatch
  "<h2>إشعار الاثني عشر شهراً</h2><p>على المؤجر الذي يريد استرداد العقار أن يرسل إشعاراً قبل اثني عشر شهراً.</p>" +
  "<h2>قبل انتهاء الإشعار</h2><p>يحتفظ المستأجر بجميع حقوقه بموجب العقد حتى انقضاء المدة.</p>";

export function seedPosts(): Post[] {
  return [
    post({
      id: "p_201",
      kind: "blog",
      platform: "website",
      language: "en",
      status: "pending",
      pairId: "p_202",
      title: "When does a commission become payable under UAE Labour Law?",
      subtitle: "The plan, the triggering event and the payment date decide it.",
      slug: "commission-payable-uae-labour-law",
      metaTitle: "When Is Commission Payable Under UAE Labour Law?",
      metaDescription: "When commission is earned under UAE Labour Law, what collection conditions mean, and claims after resignation.",
      keywords: ["commission uae labour law", "unpaid commission dubai"],
      section: "labour-law",
      content: COMMISSION_EN,
      sources: [{ title: "Federal Decree-Law No. 33 of 2021", url: LABOUR_LAW }],
    }),
    post({
      id: "p_202",
      kind: "blog",
      platform: "website",
      language: "ar",
      status: "pending",
      pairId: "p_201",
      title: "متى تستحق العمولة وفق قانون العمل الإماراتي؟",
      slug: "commission-payable-uae-labour-law-ar",
      metaTitle: "متى تستحق العمولة وفق قانون العمل الإماراتي؟",
      metaDescription: "متى تستحق العمولة وفق قانون العمل الإماراتي، وشرط التحصيل، وحق العامل بعد الاستقالة.",
      keywords: ["العمولة قانون العمل الإماراتي"],
      section: "labour-law",
      content: COMMISSION_AR,
      sources: [{ title: "المرسوم بقانون اتحادي رقم 33 لسنة 2021", url: LABOUR_LAW }],
    }),
    post({
      id: "p_203",
      kind: "blog",
      platform: "website",
      language: "en",
      status: "pending",
      title: "Shareholder deadlock: your options under UAE company law",
      slug: "shareholder-deadlock-uae",
      metaTitle: "Shareholder Deadlock Options in the UAE",
      metaDescription:
        "Deadlock between shareholders can stall a company for months. This guide explains buy-outs, mediation, court-ordered exits and what to put in your agreement now to avoid it later.",
      keywords: ["shareholder deadlock uae"],
      section: "corporate",
      content: "<h2>What deadlock looks like</h2><p>Votes split evenly and nothing moves.</p>",
    }),
    post({
      id: "p_204",
      kind: "blog",
      platform: "website",
      language: "en",
      status: "pending",
      pairId: "p_205",
      title: "Eviction notices in Dubai: the 12-month rule",
      slug: "eviction-notice-dubai-12-months",
      metaTitle: "Dubai Eviction Notice: The 12-Month Rule",
      metaDescription: "How the 12-month eviction notice works in Dubai and what tenants keep until it ends.",
      keywords: ["eviction notice dubai"],
      section: "real-estate",
      content: EVICTION_EN,
    }),
    post({
      id: "p_205",
      kind: "blog",
      platform: "website",
      language: "ar",
      status: "pending",
      pairId: "p_204",
      title: "إشعار الإخلاء في دبي: قاعدة الاثني عشر شهراً",
      slug: "eviction-notice-dubai-12-months-ar",
      metaTitle: "إشعار الإخلاء في دبي",
      metaDescription: "كيف يعمل إشعار الإخلاء لمدة اثني عشر شهراً في دبي.",
      keywords: ["إشعار الإخلاء دبي"],
      section: "real-estate",
      content: EVICTION_AR,
    }),
    post({
      id: "p_206",
      kind: "social",
      platform: "linkedin",
      language: "en",
      status: "pending",
      title: "Commission rights after resignation",
      content: "Resigning doesn't cancel a commission you've already earned. What matters is when the plan says it's due.",
      hashtags: ["#UAELabourLaw", "#Dubai"],
    }),
    post({
      id: SEED_DRAFTING_POST_ID,
      kind: "blog",
      platform: "website",
      language: "en",
      status: "drafting",
      title: "Probation periods under the UAE Labour Law",
      content: "",
    }),
    post({
      id: "p_208",
      kind: "blog",
      platform: "website",
      language: "en",
      status: "pending",
      title: "Off-plan property: what to check before signing",
      slug: "off-plan-property-checklist-dubai",
      metaTitle: "Off-Plan Property Checklist for Dubai Buyers",
      metaDescription: "What to check in an off-plan sale agreement before you sign.",
      keywords: ["off-plan property dubai"],
      section: "real-estate",
      content: "<h2>Read the escrow clause</h2><p>Payments must go to the project's escrow account.</p>",
      lock: { by: "omar@example.com", at: SEEDED_AT, expiresAt: "2099-01-01T00:00:00+04:00" },
    }),
  ];
}
```

- [ ] **Step 5: Implement the store**

```ts
// src/lib/engine/mock/store.ts
import { approvalMode } from "@/lib/posts/rules";
import type { BulkResult, Category, Job, Post } from "../schemas";
import { mockMeta } from "./fixtures";
import { SEED_DRAFTING_POST_ID, seedPosts } from "./post-fixtures";
import { computeFindings, seoScore } from "./rules";

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
export type StoredResponse = { fingerprint: string; status: number; json: unknown };

type MockJob = { id: string; postId: string; note: string; startedAt: number; durationMs: number; done: boolean };

const ACTIONS_BY_STATUS: Record<string, string[]> = {
  drafting: [],
  pending: ["edit", "approve", "changes", "reject", "delete"],
  approved: ["delete"],
  rejected: ["delete"],
  failed: ["delete"],
  published: [],
};

const EDITABLE_FIELDS = ["title", "subtitle", "slug", "metaTitle", "metaDescription", "keywords", "content", "hashtags", "section"] as const;

const CATEGORIES: Category[] = [
  { slug: "insights", name: "Insights" },
  { slug: "labour-law", name: "Labour law" },
  { slug: "corporate", name: "Corporate" },
  { slug: "real-estate", name: "Real estate" },
];

const ok = <T>(data: T, status = 200): MockOk<T> => ({ ok: true, status, data });
const fail = (
  status: number,
  code: string,
  message: string,
  extra: { fields?: Record<string, string>; details?: Record<string, unknown> } = {},
): MockFail => ({ ok: false, status, code, message, ...extra });

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

export function createMockStore(options: { now?: () => number; jobDurationMs?: number } = {}) {
  const now = options.now ?? Date.now;
  const jobDurationMs = options.jobDurationMs ?? 2500;
  const limits = mockMeta().limits;
  const posts = new Map<string, Post>();
  const jobs = new Map<string, MockJob>();
  const idempotency = new Map<string, StoredResponse>();
  let sequence = 0;
  const iso = (ms: number) => new Date(ms).toISOString();

  const twinOf = (post: Post) => (post.pairId ? posts.get(post.pairId) : undefined);

  function refreshFindings(post: Post): void {
    post.findings = computeFindings(post, twinOf(post), limits);
    post.seo = { score: seoScore(post.findings), checks: post.findings.filter((f) => f.level !== "human") };
  }

  function view(post: Post): Post {
    const twin = twinOf(post);
    return structuredClone({
      ...post,
      twin: twin ? { id: twin.id, language: twin.language, status: twin.status } : null,
      actions: ACTIONS_BY_STATUS[post.status] ?? [],
    });
  }

  function touch(post: Post): void {
    post.version += 1;
    post.updatedAt = iso(now());
  }

  /** Jobs finish lazily: every read or change first applies the jobs whose time is up. */
  function tick(): void {
    for (const job of jobs.values()) {
      if (job.done || now() - job.startedAt < job.durationMs) continue;
      job.done = true;
      const post = posts.get(job.postId);
      if (!post || post.status !== "drafting") continue;
      post.status = "pending";
      post.reviewNote = job.note;
      post.content = `${post.content ?? ""}<p>${escapeHtml(`Revised as requested: ${job.note}`)}</p>`;
      touch(post);
      refreshFindings(post);
      const twin = twinOf(post);
      if (twin) refreshFindings(twin);
    }
  }

  function guard(id: string, actor: string): MockOutcome<Post> {
    tick();
    const post = posts.get(id);
    if (!post) return fail(404, "not_found", "This post no longer exists.");
    const lock = post.lock;
    if (lock && Date.parse(lock.expiresAt) > now() && lock.by !== actor) {
      return fail(409, "locked", `Being edited by ${lock.by}.`, { details: { lockedBy: lock.by, lockedAt: lock.at } });
    }
    return ok(post);
  }

  function listPosts(statuses: string[] | null, page: number, pageSize: number) {
    tick();
    const all = [...posts.values()].filter((post) => !statuses || statuses.includes(post.status));
    const start = (page - 1) * pageSize;
    const items = all.slice(start, start + pageSize).map((post) => {
      const item = view(post);
      delete item.content;
      return item;
    });
    return ok({ items, meta: { page, pageSize, total: all.length } });
  }

  function getPost(id: string): MockOutcome<Post> {
    tick();
    const post = posts.get(id);
    return post ? ok(view(post)) : fail(404, "not_found", "This post no longer exists.");
  }

  function updatePost(id: string, input: Record<string, unknown>, actor: string): MockOutcome<Post> {
    const guarded = guard(id, actor);
    if (!guarded.ok) return guarded;
    const post = guarded.data;
    if (!(ACTIONS_BY_STATUS[post.status] ?? []).includes("edit")) {
      return fail(422, "invalid_input", "This post can't be edited in its current status.");
    }
    if (input.version !== post.version) {
      return fail(409, "version_conflict", "Someone saved this post first. Reload to see their changes.");
    }
    const target = post as Record<string, unknown>;
    for (const field of EDITABLE_FIELDS) if (field in input) target[field] = input[field];
    touch(post);
    refreshFindings(post);
    const twin = twinOf(post);
    if (twin) refreshFindings(twin);
    return ok(view(post));
  }

  function approve(id: string, overrideReason: string | undefined, actor: string): MockOutcome<Post> {
    const guarded = guard(id, actor);
    if (!guarded.ok) return guarded;
    const post = guarded.data;
    if (post.status !== "pending") return fail(422, "invalid_input", "Only posts waiting for review can be approved.");
    const critical = post.findings.filter((f) => f.level === "critical");
    const mode = approvalMode(post.findings);
    if (mode === "blocked") {
      const locked = critical.filter((f) => f.overridable === false);
      return fail(422, "framework_blocked", `Not approved — ${locked.length} rule(s) can't be overridden.`, {
        details: { findings: locked },
      });
    }
    const reason = overrideReason?.trim() ?? "";
    if (mode === "override" && !reason) {
      return fail(422, "framework_blocked", `Not approved — ${critical.length} framework rule(s) to fix.`, {
        details: { findings: critical },
      });
    }
    post.status = "approved";
    post.reviewedBy = actor;
    post.overrideReason = mode === "override" ? reason : null;
    touch(post);
    return ok(view(post));
  }

  function requestChanges(id: string, note: string, actor: string): MockOutcome<{ jobId: string; status: string; postIds: string[] }> {
    const guarded = guard(id, actor);
    if (!guarded.ok) return guarded;
    const post = guarded.data;
    if (post.status !== "pending") return fail(422, "invalid_input", "Changes can only be requested for posts waiting for review.");
    if (!note.trim()) return fail(400, "invalid_input", "Say what should change.", { fields: { note: "Required" } });
    const jobId = `j_${++sequence}`;
    jobs.set(jobId, { id: jobId, postId: id, note: note.trim(), startedAt: now(), durationMs: jobDurationMs, done: false });
    post.status = "drafting";
    touch(post);
    return ok({ jobId, status: "queued", postIds: [id] }, 202);
  }

  function reject(id: string, note: string | undefined, actor: string): MockOutcome<Post> {
    const guarded = guard(id, actor);
    if (!guarded.ok) return guarded;
    const post = guarded.data;
    if (post.status !== "pending") return fail(422, "invalid_input", "Only posts waiting for review can be rejected.");
    post.status = "rejected";
    post.reviewNote = note?.trim() || null;
    post.reviewedBy = actor;
    touch(post);
    return ok(view(post));
  }

  function remove(id: string, actor: string): MockOutcome<{ deleted: true }> {
    const guarded = guard(id, actor);
    if (!guarded.ok) return guarded;
    const post = guarded.data;
    if (post.status === "published") return fail(422, "invalid_input", "Published posts can't be deleted.");
    posts.delete(id);
    const twin = post.pairId ? posts.get(post.pairId) : undefined;
    if (twin) {
      twin.pairId = null;
      refreshFindings(twin);
    }
    return ok({ deleted: true as const });
  }

  function lock(id: string, actor: string): MockOutcome<NonNullable<Post["lock"]>> {
    const guarded = guard(id, actor);
    if (!guarded.ok) return guarded;
    const at = now();
    const held = { by: actor, at: iso(at), expiresAt: iso(at + limits.lockMinutes * 60_000) };
    guarded.data.lock = held;
    return ok(held);
  }

  function unlock(id: string, actor: string): MockOutcome<{ released: true }> {
    const post = posts.get(id);
    if (post?.lock?.by === actor) post.lock = null;
    return ok({ released: true as const });
  }

  function takeover(id: string, actor: string): MockOutcome<Post> {
    tick();
    const post = posts.get(id);
    if (!post) return fail(404, "not_found", "This post no longer exists.");
    const at = now();
    post.lock = { by: actor, at: iso(at), expiresAt: iso(at + limits.lockMinutes * 60_000) };
    return ok(view(post));
  }

  function bulk(action: string, ids: string[], note: string | undefined, actor: string): MockOutcome<BulkResult> {
    const apply = { approve: (id: string) => approve(id, undefined, actor), reject: (id: string) => reject(id, note, actor), delete: (id: string) => remove(id, actor) }[
      action as "approve" | "reject" | "delete"
    ];
    if (!apply) return fail(400, "invalid_input", `Unknown bulk action: ${action}.`, { fields: { action: "Unknown" } });
    const result: BulkResult = { done: [], failed: [] };
    for (const id of ids) {
      const outcome = apply(id);
      if (outcome.ok) result.done.push(id);
      else result.failed.push({ id, code: outcome.code, message: outcome.message });
    }
    return ok(result);
  }

  function job(id: string): MockOutcome<Job> {
    tick();
    const found = jobs.get(id);
    if (!found) return fail(404, "not_found", "This job no longer exists.");
    const elapsed = now() - found.startedAt;
    const status = found.done ? "done" : elapsed < 300 ? "queued" : "running";
    const progress = found.done ? 1 : Number.isFinite(found.durationMs) ? Math.min(0.99, elapsed / found.durationMs) : 0.5;
    return ok({
      id,
      status,
      progress: Math.round(progress * 100) / 100,
      result: found.done ? { postIds: [found.postId] } : null,
      error: null,
    });
  }

  const categories = () => ok(CATEGORIES);

  for (const seeded of seedPosts()) posts.set(seeded.id, seeded);
  for (const seeded of posts.values()) refreshFindings(seeded);
  jobs.set("j_seed", {
    id: "j_seed",
    postId: SEED_DRAFTING_POST_ID,
    note: "",
    startedAt: now(),
    durationMs: Number.POSITIVE_INFINITY,
    done: false,
  });

  return {
    idempotency,
    listPosts,
    getPost,
    updatePost,
    approve,
    requestChanges,
    reject,
    remove,
    lock,
    unlock,
    takeover,
    bulk,
    job,
    categories,
  };
}

export type MockStore = ReturnType<typeof createMockStore>;
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test && pnpm typecheck`
Expected: all unit tests pass (79 + 18 new = 97); typecheck exits 0.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add a stateful mock store with seeded posts, rule-based findings, locks, versions and redraft jobs"
```

---
### Task 3: Mock HTTP routes, per-namespace stores, engine API methods

**Files:**
- Create: `src/lib/engine/mock/registry.ts`
- Modify: `src/lib/engine/mock/server.ts` (full replacement), `src/lib/engine/api.ts` (add methods), `src/lib/engine/index.ts` (pass the store)
- Test: `tests/unit/engine-posts.test.ts`

**Interfaces:**
- Consumes:
  - from Task 2: `createMockStore`, `MockStore`, `MockOutcome`
  - from Task 1: `PostSchema`, `PostsSchema`, `PostUpdate`, `JobSchema`, `JobStartSchema`, `BulkResultSchema`, `CategoriesSchema`, `LockSchema`, `DeletedSchema`, `ReleasedSchema`
- Produces:
  - `createMockFetch({ baseUrl, apiKey, scenario?, store? })`. Changes require `X-Acting-User` and `Idempotency-Key`. A repeated key with the same request replays the stored response; with a different request it gets `422 idempotency_mismatch`.
  - `MOCK_STORE_COOKIE = "mock_store"`, `mockStoreFor(namespace?: string): MockStore`
  - `type ChangeContext = { actingUser: string; idempotencyKey: string }`
  - engine API reads:
    - `listPosts({ statuses, page?, pageSize? })` → `{ posts: Post[]; meta: ListMeta | null }`
    - `post(id)` → `Post`
    - `job(id)` → `Job`
    - `categories()` → `Category[]`
  - engine API changes:
    - `savePost(id, update: PostUpdate, ctx)` → `Post`
    - `approvePost(id, overrideReason: string | undefined, ctx)` → `Post`
    - `requestChanges(id, note, ctx)` → `JobStart`
    - `rejectPost(id, note: string | undefined, ctx)` → `Post`
    - `deletePost(id, ctx)` → `{ deleted: true }`
    - `lockPost(id, ctx)` → lock
    - `unlockPost(id, ctx)` → `{ released: true }`
    - `takeoverPost(id, ctx)` → `Post`
    - `bulkPosts(action: "approve" | "reject" | "delete", ids, note: string | undefined, ctx)` → `BulkResult`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/engine-posts.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { createEngineApi, type ChangeContext } from "@/lib/engine/api";
import { createEngineClient } from "@/lib/engine/client";
import { EngineError } from "@/lib/engine/errors";
import { mockStoreFor } from "@/lib/engine/mock/registry";
import { createMockFetch } from "@/lib/engine/mock/server";
import { createMockStore } from "@/lib/engine/mock/store";
import { MetaSchema, type PostUpdate } from "@/lib/engine/schemas";

const BASE = "https://mock.engine.local/api/v1";
let t = Date.parse("2026-10-22T08:00:00Z");

function setup() {
  const store = createMockStore({ now: () => t, jobDurationMs: 1000 });
  const client = createEngineClient({
    baseUrl: BASE,
    apiKey: "mock-key",
    retryDelaysMs: [0, 0],
    fetch: createMockFetch({ baseUrl: BASE, apiKey: "mock-key", store }),
  });
  return { client, engine: createEngineApi(client) };
}

let counter = 0;
const ctx = (actingUser = "reviewer@example.com"): ChangeContext => ({ actingUser, idempotencyKey: `key-${++counter}` });

async function failure(promise: Promise<unknown>): Promise<EngineError> {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(EngineError);
  return error as EngineError;
}

function updateFrom(post: { title: string; version: number } & Record<string, unknown>, changes: Partial<PostUpdate>): PostUpdate {
  return {
    title: post.title,
    subtitle: (post.subtitle as string | null | undefined) ?? null,
    slug: (post.slug as string | null | undefined) ?? null,
    metaTitle: (post.metaTitle as string | null | undefined) ?? null,
    metaDescription: (post.metaDescription as string | null | undefined) ?? null,
    keywords: (post.keywords as string[]) ?? [],
    content: (post.content as string | null | undefined) ?? "",
    hashtags: (post.hashtags as string[]) ?? [],
    section: (post.section as string | null | undefined) ?? null,
    version: post.version,
    ...changes,
  };
}

beforeEach(() => {
  t = Date.parse("2026-10-22T08:00:00Z");
});

describe("posts over the mock engine", () => {
  it("lists posts by status with paging meta", async () => {
    const { engine } = setup();
    const { posts, meta } = await engine.listPosts({ statuses: ["drafting"], pageSize: 10 });
    expect(posts.map((p) => p.id)).toEqual(["p_207"]);
    expect(meta).toEqual({ page: 1, pageSize: 10, total: 1 });
  });

  it("reads one post with its content and actions", async () => {
    const post = await setup().engine.post("p_201");
    expect(post.content).toContain("<table>");
    expect(post.actions).toContain("approve");
  });

  it("saves with the version and reports a conflict for a stale one", async () => {
    const { engine } = setup();
    const post = await engine.post("p_201");
    const saved = await engine.savePost("p_201", updateFrom(post, { title: "Updated" }), ctx());
    expect(saved).toMatchObject({ title: "Updated", version: post.version + 1 });
    const stale = await failure(engine.savePost("p_201", updateFrom(post, { title: "Late" }), ctx()));
    expect(stale).toMatchObject({ status: 409, code: "version_conflict" });
  });

  it("returns the blocking findings when approval is refused", async () => {
    const error = await failure(setup().engine.approvePost("p_203", undefined, ctx()));
    expect(error.code).toBe("framework_blocked");
    expect(error.details?.findings).toEqual([expect.objectContaining({ code: "meta_description_length" })]);
  });

  it("replays a repeated idempotency key instead of approving twice (Review Focus 3)", async () => {
    const { engine } = setup();
    const once = ctx();
    const first = await engine.approvePost("p_201", undefined, once);
    const replay = await engine.approvePost("p_201", undefined, once);
    expect(replay).toEqual(first);
    const misuse = await failure(engine.approvePost("p_204", undefined, once));
    expect(misuse).toMatchObject({ status: 422, code: "idempotency_mismatch" });
  });

  it("requires the acting user on changes", async () => {
    const { client } = setup();
    const error = await failure(
      client.request({ method: "POST", path: "/sites/site_fakher/posts/p_201/approve", schema: MetaSchema, body: {} }),
    );
    expect(error).toMatchObject({ status: 400, code: "invalid_input" });
  });

  it("starts a redraft job and reports it done when the time is up", async () => {
    const { engine } = setup();
    const start = await engine.requestChanges("p_201", "Shorter intro", ctx());
    expect(start.postIds).toEqual(["p_201"]);
    expect((await engine.job(start.jobId)).status).not.toBe("done");
    t += 1000;
    expect(await engine.job(start.jobId)).toMatchObject({ status: "done", progress: 1 });
    expect((await engine.post("p_201")).status).toBe("pending");
  });

  it("locks, reports the holder to others, and lets them take over", async () => {
    const { engine } = setup();
    await engine.lockPost("p_201", ctx("omar@example.com"));
    const locked = await failure(engine.lockPost("p_201", ctx()));
    expect(locked).toMatchObject({ status: 409, code: "locked", details: { lockedBy: "omar@example.com" } });
    const taken = await engine.takeoverPost("p_201", ctx());
    expect(taken.lock?.by).toBe("reviewer@example.com");
    expect(await engine.unlockPost("p_201", ctx())).toEqual({ released: true });
  });

  it("rejects, deletes and runs bulk actions", async () => {
    const { engine } = setup();
    expect((await engine.rejectPost("p_206", "Off-topic", ctx())).status).toBe("rejected");
    expect(await engine.deletePost("p_206", ctx())).toEqual({ deleted: true });
    const bulk = await engine.bulkPosts("approve", ["p_201", "p_203"], undefined, ctx());
    expect(bulk.done).toEqual(["p_201"]);
    expect(bulk.failed[0]).toMatchObject({ id: "p_203", code: "framework_blocked" });
  });

  it("lists the website's categories", async () => {
    expect((await setup().engine.categories()).map((c) => c.slug)).toContain("labour-law");
  });
});

describe("mock store registry", () => {
  it("keeps one store per namespace and falls back to default for odd names", () => {
    expect(mockStoreFor("test-a")).toBe(mockStoreFor("test-a"));
    expect(mockStoreFor("test-a")).not.toBe(mockStoreFor("test-b"));
    expect(mockStoreFor("../etc")).toBe(mockStoreFor(undefined));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test tests/unit/engine-posts.test.ts`
Expected: FAIL. `@/lib/engine/mock/registry` can't be resolved, and `engine.listPosts` is not a function.

- [ ] **Step 3: Add the registry**

```ts
// src/lib/engine/mock/registry.ts
import { createMockStore, type MockStore } from "./store";

export const MOCK_STORE_COOKIE = "mock_store";
const REGISTRY = Symbol.for("articles-ai.mock-stores");

/** One stateful mock per namespace (e2e tests use a fresh namespace each). Survives dev hot reloads via globalThis. */
export function mockStoreFor(namespace?: string): MockStore {
  const holder = globalThis as unknown as Record<symbol, Map<string, MockStore> | undefined>;
  const stores = (holder[REGISTRY] ??= new Map<string, MockStore>());
  const key = namespace && /^[A-Za-z0-9_-]{1,64}$/.test(namespace) ? namespace : "default";
  let store = stores.get(key);
  if (!store) {
    store = createMockStore();
    stores.set(key, store);
  }
  return store;
}
```

- [ ] **Step 4: Replace the mock HTTP server**

```ts
// src/lib/engine/mock/server.ts
import type { FetchLike } from "../client";
import { MOCK_SITE_ID, mockMeta, mockPlan, mockScheduled, mockSite } from "./fixtures";
import { createMockStore, type MockOutcome, type MockStore } from "./store";

export type MockScenario = "normal" | "unauthorized" | "down" | "drift";
const MOCK_SCENARIOS: readonly MockScenario[] = ["normal", "unauthorized", "down", "drift"];
export const MOCK_SCENARIO_COOKIE = "mock_scenario";

export function isMockScenario(value: unknown): value is MockScenario {
  return typeof value === "string" && (MOCK_SCENARIOS as readonly string[]).includes(value);
}

type MockOptions = { baseUrl: string; apiKey: string; scenario?: MockScenario; store?: MockStore };
type Reply = { status: number; json: unknown };

/** An in-process stand-in for Quantum1st's API: same envelope, status codes, auth, acting-user and idempotency rules. */
export function createMockFetch(options: MockOptions): FetchLike {
  const basePath = new URL(options.baseUrl).pathname.replace(/\/+$/, "");
  const store = options.store ?? createMockStore();

  return async (input, init) => {
    const scenario = options.scenario ?? "normal";
    if (scenario === "down") throw new TypeError("fetch failed");

    const headers = new Headers(init.headers);
    if (scenario === "unauthorized" || headers.get("X-Api-Key") !== options.apiKey) {
      return send(fail(401, "unauthorized", "Key missing, revoked, or the account is suspended."));
    }

    const url = new URL(input);
    if (!url.pathname.startsWith(basePath)) return send(fail(404, "not_found", "Not found."));
    const path = url.pathname.slice(basePath.length);
    const method = (init.method ?? "GET").toUpperCase();
    const body = typeof init.body === "string" ? init.body : "";

    if (method === "GET") return send(route(method, path, url, {}, "", scenario, store));

    const actor = headers.get("X-Acting-User");
    if (!actor) return send(fail(400, "invalid_input", "X-Acting-User is required for changes."));
    const key = headers.get("Idempotency-Key");
    if (!key) return send(fail(400, "invalid_input", "Idempotency-Key is required for changes."));

    const fingerprint = `${method} ${path} ${body}`;
    const seen = store.idempotency.get(key);
    if (seen) {
      return seen.fingerprint === fingerprint
        ? send({ status: seen.status, json: seen.json })
        : send(fail(422, "idempotency_mismatch", "This Idempotency-Key was already used for a different request."));
    }

    let parsed: Record<string, unknown> = {};
    try {
      parsed = body ? (JSON.parse(body) as Record<string, unknown>) : {};
    } catch {
      return send(fail(400, "invalid_input", "The request body isn't valid JSON."));
    }

    const reply = route(method, path, url, parsed, actor, scenario, store);
    store.idempotency.set(key, { fingerprint, status: reply.status, json: reply.json });
    return send(reply);
  };
}

function route(
  method: string,
  path: string,
  url: URL,
  body: Record<string, unknown>,
  actor: string,
  scenario: MockScenario,
  store: MockStore,
): Reply {
  if (method === "GET" && path === "/meta") return ok(mockMeta());
  if (method === "GET" && path === "/sites") return ok([scenario === "drift" ? driftedSite() : mockSite()]);
  if (method === "GET" && path === "/account/plan") return ok(mockPlan());

  const jobRoute = /^\/jobs\/([^/]+)$/.exec(path);
  if (jobRoute && method === "GET") return outcome(store.job(decodeURIComponent(jobRoute[1])));

  const siteRoute = /^\/sites\/([^/]+)(\/.*)?$/.exec(path);
  if (!siteRoute) return fail(404, "not_found", `No mock route for ${method} ${path}.`);
  if (decodeURIComponent(siteRoute[1]) !== MOCK_SITE_ID) return fail(404, "not_found", "Site not found.");
  const rest = siteRoute[2] ?? "";

  if (method === "GET" && rest === "") return ok(scenario === "drift" ? driftedSite() : mockSite());
  if (method === "GET" && rest === "/scheduled") {
    const scheduled = mockScheduled();
    const pageSize = Number(url.searchParams.get("pageSize") ?? scheduled.posts.length);
    return ok({ ...scheduled, posts: scheduled.posts.slice(0, pageSize) });
  }
  if (method === "GET" && rest === "/website/categories") return outcome(store.categories());

  if (rest === "/posts" && method === "GET") {
    const statuses = url.searchParams.get("status")?.split(",").filter(Boolean) ?? null;
    const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize")) || 25));
    const listed = store.listPosts(statuses, page, pageSize);
    return listed.ok ? { status: 200, json: { ok: true, data: listed.data.items, meta: listed.data.meta } } : outcome(listed);
  }
  if (rest === "/posts/bulk" && method === "POST") {
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
    return outcome(store.bulk(String(body.action ?? ""), ids, optionalText(body.note), actor));
  }

  const postRoute = /^\/posts\/([^/]+)(\/[a-z]+)?$/.exec(rest);
  if (postRoute) {
    const id = decodeURIComponent(postRoute[1]);
    const action = postRoute[2] ?? "";
    if (action === "" && method === "GET") return outcome(store.getPost(id));
    if (action === "" && method === "PUT") return outcome(store.updatePost(id, body, actor));
    if (action === "" && method === "DELETE") return outcome(store.remove(id, actor));
    if (action === "/approve" && method === "POST") return outcome(store.approve(id, optionalText(body.overrideReason), actor));
    if (action === "/changes" && method === "POST") return outcome(store.requestChanges(id, String(body.note ?? ""), actor));
    if (action === "/reject" && method === "POST") return outcome(store.reject(id, optionalText(body.note), actor));
    if (action === "/lock" && method === "POST") return outcome(store.lock(id, actor));
    if (action === "/lock" && method === "DELETE") return outcome(store.unlock(id, actor));
    if (action === "/takeover" && method === "POST") return outcome(store.takeover(id, actor));
  }

  return fail(404, "not_found", `No mock route for ${method} ${path}.`);
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function outcome<T>(result: MockOutcome<T>): Reply {
  if (result.ok) return { status: result.status, json: { ok: true, data: result.data } };
  const { code, message, fields, details } = result;
  return { status: result.status, json: { ok: false, error: { code, message, ...(fields ? { fields } : {}), ...(details ? { details } : {}) } } };
}

function ok(data: unknown): Reply {
  return { status: 200, json: { ok: true, data } };
}

function fail(status: number, code: string, message: string): Reply {
  return { status, json: { ok: false, error: { code, message } } };
}

function send(reply: Reply): Response {
  return Response.json(reply.json, { status: reply.status });
}

/** The site as an engine that changed its shape would send it: `counts` is gone. */
function driftedSite(): Record<string, unknown> {
  const site: Record<string, unknown> = { ...mockSite() };
  delete site.counts;
  return site;
}
```

- [ ] **Step 5: Add the engine API methods**

In `src/lib/engine/api.ts`:

(a) Extend the schema import to:

```ts
import {
  BulkResultSchema,
  CategoriesSchema,
  DeletedSchema,
  JobSchema,
  JobStartSchema,
  LockSchema,
  MetaSchema,
  PlanSchema,
  PostSchema,
  PostsSchema,
  ReleasedSchema,
  ScheduledSchema,
  SiteRefsSchema,
  SiteSchema,
  type PostUpdate,
} from "./schemas";
```

(b) Above `createEngineApi`, add:

```ts
/** Who made a change (audit log) and the key that makes a retried change safe (spec v1.1 §3). */
export type ChangeContext = { actingUser: string; idempotencyKey: string };
```

(c) Inside `createEngineApi`, before its `return`, add:

```ts
  const postPath = async (id: string, suffix = "") => `${await sitePath()}/posts/${encodeURIComponent(id)}${suffix}`;

  async function listPosts(options: { statuses: string[]; page?: number; pageSize?: number }) {
    const { data, meta } = await client.request({
      method: "GET",
      path: `${await sitePath()}/posts`,
      schema: PostsSchema,
      query: { status: options.statuses.join(","), page: options.page, pageSize: options.pageSize },
    });
    return { posts: data, meta };
  }

  const post = async (id: string) => (await client.request({ method: "GET", path: await postPath(id), schema: PostSchema })).data;

  const savePost = async (id: string, update: PostUpdate, ctx: ChangeContext) =>
    (await client.request({ method: "PUT", path: await postPath(id), schema: PostSchema, body: update, ...ctx })).data;

  const approvePost = async (id: string, overrideReason: string | undefined, ctx: ChangeContext) =>
    (await client.request({ method: "POST", path: await postPath(id, "/approve"), schema: PostSchema, body: { overrideReason }, ...ctx }))
      .data;

  const requestChanges = async (id: string, note: string, ctx: ChangeContext) =>
    (await client.request({ method: "POST", path: await postPath(id, "/changes"), schema: JobStartSchema, body: { note }, ...ctx })).data;

  const rejectPost = async (id: string, note: string | undefined, ctx: ChangeContext) =>
    (await client.request({ method: "POST", path: await postPath(id, "/reject"), schema: PostSchema, body: { note }, ...ctx })).data;

  const deletePost = async (id: string, ctx: ChangeContext) =>
    (await client.request({ method: "DELETE", path: await postPath(id), schema: DeletedSchema, ...ctx })).data;

  const lockPost = async (id: string, ctx: ChangeContext) =>
    (await client.request({ method: "POST", path: await postPath(id, "/lock"), schema: LockSchema, body: {}, ...ctx })).data;

  const unlockPost = async (id: string, ctx: ChangeContext) =>
    (await client.request({ method: "DELETE", path: await postPath(id, "/lock"), schema: ReleasedSchema, ...ctx })).data;

  const takeoverPost = async (id: string, ctx: ChangeContext) =>
    (await client.request({ method: "POST", path: await postPath(id, "/takeover"), schema: PostSchema, body: {}, ...ctx })).data;

  const bulkPosts = async (action: "approve" | "reject" | "delete", ids: string[], note: string | undefined, ctx: ChangeContext) =>
    (
      await client.request({
        method: "POST",
        path: `${await sitePath()}/posts/bulk`,
        schema: BulkResultSchema,
        body: { action, ids, note },
        ...ctx,
      })
    ).data;

  const job = async (id: string) =>
    (await client.request({ method: "GET", path: `/jobs/${encodeURIComponent(id)}`, schema: JobSchema })).data;

  const categories = once(
    async () => (await client.request({ method: "GET", path: `${await sitePath()}/website/categories`, schema: CategoriesSchema })).data,
  );
```

(d) Replace the `return` with:

```ts
  return {
    siteId,
    meta,
    site,
    siteCounts,
    siteTimezone,
    siteConnections,
    plan,
    scheduled,
    listPosts,
    post,
    savePost,
    approvePost,
    requestChanges,
    rejectPost,
    deletePost,
    lockPost,
    unlockPost,
    takeoverPost,
    bulkPosts,
    job,
    categories,
  };
```

- [ ] **Step 6: Give each request its namespace's store**

In `src/lib/engine/index.ts`, import the registry and pass the store into the mock:

```ts
import { MOCK_STORE_COOKIE, mockStoreFor } from "./mock/registry";
```

and replace the mock branch with:

```ts
  if (env.engineMode === "mock") {
    const jar = await cookies();
    const scenario = jar.get(MOCK_SCENARIO_COOKIE)?.value;
    fetchImpl = createMockFetch({
      baseUrl: env.engineBaseUrl,
      apiKey: env.engineApiKey,
      scenario: isMockScenario(scenario) ? scenario : "normal",
      store: mockStoreFor(jar.get(MOCK_STORE_COOKIE)?.value),
    });
  } else {
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm test && pnpm typecheck`
Expected: all unit tests pass (97 + 11 new = 108), including the M1 engine-mock suite; typecheck exits 0.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: serve posts, jobs and categories from the mock with idempotent replay; add the post engine API"
```

---
### Task 4: Server actions, the idempotency hook and translated action errors

**Files:**
- Create: `src/lib/actions/result.ts`, `src/lib/actions/use-engine-action.ts`, `src/app/[locale]/(app)/review/actions.ts`, `src/components/actions/action-error.tsx`
- Modify: `src/lib/engine/notice.ts`, `messages/en.json`, `messages/ar.json`
- Test: `tests/unit/actions.test.ts`

**Interfaces:**
- Consumes:
  - from Task 3: the engine API methods and `ChangeContext`
  - from Task 1: `PostUpdateSchema`, `Post`, `Job`, `JobStart`, `BulkResult`
  - from M1: `requirePermission`, `getEngine`, `tryEngine`
- Produces:
  - `type ActionResult<T> = EngineResult<T>`, `shouldReuseKey(error: EngineFailure): boolean`, `NETWORK_FAILURE: EngineFailure`
  - `useEngineAction(action)` → `{ run(input without idempotencyKey): Promise<ActionResult<T>>; pending: boolean }`
  - Server actions, all taking one object and returning `ActionResult`:
    - `loadPostAction({ locale, postId })` → `Post`
    - `savePostAction({ locale, postId, update, idempotencyKey })` → `Post`
    - `approvePostAction({ locale, postId, overrideReason?, idempotencyKey })` → `Post`
    - `requestChangesAction({ locale, postId, note, idempotencyKey })` → `JobStart`
    - `rejectPostAction({ locale, postId, note?, idempotencyKey })` → `Post`
    - `deletePostAction({ locale, postId, idempotencyKey })` → `{ deleted: true }`
    - `lockPostAction` / `unlockPostAction` / `takeoverPostAction({ locale, postId, idempotencyKey })`
    - `bulkPostsAction({ locale, action, ids, idempotencyKey })` → `BulkResult`
    - `jobAction({ locale, jobId })` → `Job`
  - `engineNoticeKey(code)` now also maps `engine_busy` → `"engineBusy"` and `not_found` → `"notFound"`
  - `<ActionError error={EngineFailure} />`: a client alert that shows the translated text for known codes and the engine's message otherwise

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/actions.test.ts
import { describe, expect, it } from "vitest";
import { NETWORK_FAILURE, shouldReuseKey } from "@/lib/actions/result";
import { engineNoticeKey } from "@/lib/engine/notice";

describe("shouldReuseKey", () => {
  it("reuses the key only when no answer arrived (spec v1.1 §2)", () => {
    expect(shouldReuseKey(NETWORK_FAILURE)).toBe(true);
    expect(shouldReuseKey({ status: 0, code: "network_error", message: "x" })).toBe(true);
    expect(shouldReuseKey({ status: 422, code: "framework_blocked", message: "x" })).toBe(false);
    expect(shouldReuseKey({ status: 502, code: "publish_failed", message: "x" })).toBe(false);
  });
});

describe("engineNoticeKey", () => {
  it("translates the codes the spec gives a fixed meaning", () => {
    expect(engineNoticeKey("engine_busy")).toBe("engineBusy");
    expect(engineNoticeKey("not_found")).toBe("notFound");
    expect(engineNoticeKey("framework_blocked")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test tests/unit/actions.test.ts`
Expected: FAIL. `@/lib/actions/result` can't be resolved.

- [ ] **Step 3: Implement the result helpers and extend the notice mapping**

```ts
// src/lib/actions/result.ts
import type { EngineFailure, EngineResult } from "@/lib/engine/result";

export type ActionResult<T> = EngineResult<T>;

/** Our own server (or the engine) gave no answer: the request may have gone through, so a retry must reuse the key. */
export const NETWORK_FAILURE: EngineFailure = {
  status: 0,
  code: "network_error",
  message: "The server could not be reached. Try again shortly.",
};

export function shouldReuseKey(error: EngineFailure): boolean {
  return error.code === "network_error";
}
```

Replace `src/lib/engine/notice.ts` with:

```ts
export type NoticeKey = "serviceUnavailable" | "engineUnreachable" | "engineInvalid" | "engineBusy" | "notFound";

/** Which translated message to show for an engine failure; null means show the engine's own message as it is. */
export function engineNoticeKey(code: string): NoticeKey | null {
  switch (code) {
    case "unauthorized":
      return "serviceUnavailable";
    case "network_error":
    case "engine_unavailable":
      return "engineUnreachable";
    case "invalid_response":
      return "engineInvalid";
    case "engine_busy":
      return "engineBusy";
    case "not_found":
      return "notFound";
    default:
      return null;
  }
}
```

Add two keys to the `Errors` namespace in `messages/en.json`:

```json
    "engineBusy": "The content engine is busy. Your request is queued; try again shortly.",
    "notFound": "This item was removed. Go back to the list."
```

and in `messages/ar.json`:

```json
    "engineBusy": "محرك المحتوى مشغول. طلبك في قائمة الانتظار؛ حاول مرة أخرى بعد قليل.",
    "notFound": "تمت إزالة هذا العنصر. ارجع إلى القائمة."
```

- [ ] **Step 4: Add the client hook and the error display**

```ts
// src/lib/actions/use-engine-action.ts
"use client";

import { useCallback, useRef, useState } from "react";
import { NETWORK_FAILURE, shouldReuseKey, type ActionResult } from "./result";

/**
 * Runs a server action with an idempotency key: the same key is reused while no answer has arrived
 * (so a retry can't apply a change twice), and a new one is made after any definite answer.
 */
export function useEngineAction<I extends { idempotencyKey: string }, T>(action: (input: I) => Promise<ActionResult<T>>) {
  const keyRef = useRef<string | null>(null);
  const [pending, setPending] = useState(false);

  const run = useCallback(
    async (input: Omit<I, "idempotencyKey">): Promise<ActionResult<T>> => {
      keyRef.current ??= crypto.randomUUID();
      setPending(true);
      try {
        const result = await action({ ...input, idempotencyKey: keyRef.current } as I);
        if (result.ok || !shouldReuseKey(result.error)) keyRef.current = null;
        return result;
      } catch {
        return { ok: false, error: NETWORK_FAILURE }; // the key is kept: a retry is the same request
      } finally {
        setPending(false);
      }
    },
    [action],
  );

  return { run, pending };
}
```

```tsx
// src/components/actions/action-error.tsx
"use client";

import { useTranslations } from "next-intl";
import { engineNoticeKey } from "@/lib/engine/notice";
import type { EngineFailure } from "@/lib/engine/result";

export function ActionError({ error }: { error: EngineFailure }) {
  const t = useTranslations("Errors");
  const key = engineNoticeKey(error.code);
  return (
    <p role="alert" data-testid="action-error" data-code={error.code} className="rounded-md bg-bad-bg px-3 py-2 text-sm text-bad-fg">
      {key ? t(key) : error.message}
    </p>
  );
}
```

- [ ] **Step 5: Add the server actions**

```ts
// src/app/[locale]/(app)/review/actions.ts
"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/actions/result";
import { requirePermission } from "@/lib/auth/session";
import { getEngine } from "@/lib/engine";
import type { ChangeContext } from "@/lib/engine/api";
import { tryEngine } from "@/lib/engine/result";
import { PostUpdateSchema, type BulkResult, type Job, type JobStart, type Post } from "@/lib/engine/schemas";

const Base = z.object({ locale: z.string(), postId: z.string().min(1) });
const Change = Base.extend({ idempotencyKey: z.string().min(8) });

const INVALID = { ok: false as const, error: { status: 400, code: "invalid_input", message: "Invalid request." } };

/** Role check + engine + who is acting. Every change in this file goes through it. */
async function engineFor(locale: string) {
  const session = await requirePermission(locale, "content.work");
  return { engine: await getEngine(), actingUser: session.email };
}

async function change<T>(locale: string, idempotencyKey: string, run: (ctx: ChangeContext & { engine: Awaited<ReturnType<typeof getEngine>> }) => Promise<T>): Promise<ActionResult<T>> {
  const { engine, actingUser } = await engineFor(locale);
  const result = await tryEngine(() => run({ engine, actingUser, idempotencyKey }));
  if (result.ok) refresh();
  return result;
}

export async function loadPostAction(input: { locale: string; postId: string }): Promise<ActionResult<Post>> {
  const parsed = Base.safeParse(input);
  if (!parsed.success) return INVALID;
  const { engine } = await engineFor(parsed.data.locale);
  return tryEngine(() => engine.post(parsed.data.postId));
}

export async function savePostAction(input: {
  locale: string;
  postId: string;
  update: z.infer<typeof PostUpdateSchema>;
  idempotencyKey: string;
}): Promise<ActionResult<Post>> {
  const parsed = Change.extend({ update: PostUpdateSchema }).safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, postId, update, idempotencyKey } = parsed.data;
  return change(locale, idempotencyKey, ({ engine, ...ctx }) => engine.savePost(postId, update, ctx));
}

export async function approvePostAction(input: {
  locale: string;
  postId: string;
  overrideReason?: string;
  idempotencyKey: string;
}): Promise<ActionResult<Post>> {
  const parsed = Change.extend({ overrideReason: z.string().max(2000).optional() }).safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, postId, overrideReason, idempotencyKey } = parsed.data;
  return change(locale, idempotencyKey, ({ engine, ...ctx }) => engine.approvePost(postId, overrideReason, ctx));
}

export async function requestChangesAction(input: {
  locale: string;
  postId: string;
  note: string;
  idempotencyKey: string;
}): Promise<ActionResult<JobStart>> {
  const parsed = Change.extend({ note: z.string().max(4000) }).safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, postId, note, idempotencyKey } = parsed.data;
  return change(locale, idempotencyKey, ({ engine, ...ctx }) => engine.requestChanges(postId, note, ctx));
}

export async function rejectPostAction(input: {
  locale: string;
  postId: string;
  note?: string;
  idempotencyKey: string;
}): Promise<ActionResult<Post>> {
  const parsed = Change.extend({ note: z.string().max(4000).optional() }).safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, postId, note, idempotencyKey } = parsed.data;
  return change(locale, idempotencyKey, ({ engine, ...ctx }) => engine.rejectPost(postId, note, ctx));
}

export async function deletePostAction(input: { locale: string; postId: string; idempotencyKey: string }): Promise<ActionResult<{ deleted: true }>> {
  const parsed = Change.safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, postId, idempotencyKey } = parsed.data;
  return change(locale, idempotencyKey, ({ engine, ...ctx }) => engine.deletePost(postId, ctx));
}

export async function lockPostAction(input: { locale: string; postId: string; idempotencyKey: string }) {
  const parsed = Change.safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, postId, idempotencyKey } = parsed.data;
  const { engine, actingUser } = await engineFor(locale); // no refresh(): taking a lock changes nothing on screen
  return tryEngine(() => engine.lockPost(postId, { actingUser, idempotencyKey }));
}

export async function unlockPostAction(input: { locale: string; postId: string; idempotencyKey: string }) {
  const parsed = Change.safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, postId, idempotencyKey } = parsed.data;
  const { engine, actingUser } = await engineFor(locale);
  return tryEngine(() => engine.unlockPost(postId, { actingUser, idempotencyKey }));
}

export async function takeoverPostAction(input: { locale: string; postId: string; idempotencyKey: string }): Promise<ActionResult<Post>> {
  const parsed = Change.safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, postId, idempotencyKey } = parsed.data;
  return change(locale, idempotencyKey, ({ engine, ...ctx }) => engine.takeoverPost(postId, ctx));
}

export async function bulkPostsAction(input: {
  locale: string;
  action: "approve" | "reject" | "delete";
  ids: string[];
  idempotencyKey: string;
}): Promise<ActionResult<BulkResult>> {
  const parsed = z
    .object({ locale: z.string(), action: z.enum(["approve", "reject", "delete"]), ids: z.array(z.string()).min(1).max(100), idempotencyKey: z.string().min(8) })
    .safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, action, ids, idempotencyKey } = parsed.data;
  return change(locale, idempotencyKey, ({ engine, ...ctx }) => engine.bulkPosts(action, ids, undefined, ctx));
}

export async function jobAction(input: { locale: string; jobId: string }): Promise<ActionResult<Job>> {
  const parsed = z.object({ locale: z.string(), jobId: z.string().min(1) }).safeParse(input);
  if (!parsed.success) return INVALID;
  const { engine } = await engineFor(parsed.data.locale);
  return tryEngine(() => engine.job(parsed.data.jobId));
}
```

- [ ] **Step 6: Run the checks**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all unit tests pass (108 + 2 new = 110); typecheck and lint exit 0. The actions are exercised end to end by the e2e tests in Tasks 5–8.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add post server actions with role checks, input validation and idempotency keys"
```

---
### Task 5: The review queue

**Files:**
- Create:
  - `src/lib/review/summary.ts`
  - `src/app/[locale]/(app)/review/page.tsx`
  - `src/components/review/review-queue.tsx`, `review-board.tsx`, `post-card.tsx`, `auto-refresh.tsx`
- Modify: `src/components/shell/nav.ts`, `messages/en.json`, `messages/ar.json`, `tests/e2e/helpers.ts`
- Test: `tests/unit/review-summary.test.ts`, `tests/e2e/review.spec.ts`

**Interfaces:**
- Consumes:
  - from Task 4: `bulkPostsAction`, `useEngineAction`, `ActionError`
  - from Task 3: `engine.listPosts`, `engine.meta`
  - from Task 1: `findingCounts`, `Post`
  - from M1: `requirePermission`, `EngineNotice`, `SectionSkeleton`, `Link`
- Produces:
  - `bulkFailureLines(result: BulkResult, posts: { id: string; title: string }[])` → `{ id; title; message }[]`
  - the `/[locale]/review` page and the nav item `review`
  - e2e helper `isolateMockStore(context)`
  - test ids:
    - cards: `card-<id>`, `card-title-<id>`, `card-select-<id>`, `card-twin-<id>`, `card-critical-<id>`, `card-drafting-<id>`
    - board: `review-count`, `approve-selected`, `bulk-failures`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/review-summary.test.ts
import { describe, expect, it } from "vitest";
import { bulkFailureLines } from "@/lib/review/summary";

describe("bulkFailureLines", () => {
  it("names each failed post by its title, falling back to its id", () => {
    const lines = bulkFailureLines(
      { done: ["p_1"], failed: [{ id: "p_2", code: "framework_blocked", message: "Not approved" }, { id: "p_9", code: "not_found", message: "Gone" }] },
      [
        { id: "p_1", title: "First" },
        { id: "p_2", title: "Second" },
      ],
    );
    expect(lines).toEqual([
      { id: "p_2", title: "Second", message: "Not approved" },
      { id: "p_9", title: "p_9", message: "Gone" },
    ]);
  });
});
```

Add to `tests/e2e/helpers.ts`:

```ts
/** Gives this test its own copy of the mock engine's data, so tests can't affect each other. */
export async function isolateMockStore(context: BrowserContext): Promise<void> {
  const namespace = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  await context.addCookies([{ name: "mock_store", value: namespace, url: BASE_URL }]);
}
```

```ts
// tests/e2e/review.spec.ts
import { expect, test } from "@playwright/test";
import { isolateMockStore, signInWithCookie } from "./helpers";

test.beforeEach(async ({ context }) => {
  await isolateMockStore(context);
  await signInWithCookie(context, "dev_reviewer");
});

test("lists posts waiting for review with pairs, findings and drafting state", async ({ page }) => {
  await page.goto("/en/review");
  await expect(page.getByTestId("review-count")).toHaveText("8 of 8 posts");
  await expect(page.getByTestId("card-twin-p_201")).toHaveText("Pair: Arabic");
  await expect(page.getByTestId("card-critical-p_203")).toHaveText("1 critical");
  await expect(page.getByTestId("card-drafting-p_207")).toBeVisible();
  await expect(page.getByTestId("card-select-p_207")).toBeDisabled();
});

test("shows Arabic titles right to left", async ({ page }) => {
  await page.goto("/en/review");
  await expect(page.getByTestId("card-title-p_202")).toHaveAttribute("dir", "rtl");
});

test("bulk approve approves what it can and names what it couldn't", async ({ page }) => {
  await page.goto("/en/review");
  await page.getByTestId("card-select-p_201").check();
  await page.getByTestId("card-select-p_203").check();
  await page.getByTestId("approve-selected").click();
  await expect(page.getByTestId("bulk-failures")).toContainText("Shareholder deadlock: your options under UAE company law");
  await expect(page.getByTestId("card-p_201")).toHaveCount(0);
  await expect(page.getByTestId("card-p_203")).toBeVisible();
});

test("the nav links to the review queue", async ({ page }) => {
  await page.goto("/en");
  await page.getByTestId("nav-review").click();
  await expect(page).toHaveURL(/\/en\/review$/);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test tests/unit/review-summary.test.ts`
Expected: FAIL. `@/lib/review/summary` can't be resolved. Watch the e2e fail too, once Step 3 exists: `pnpm e2e tests/e2e/review.spec.ts` should fail with `/en/review` returning 404. (Before Step 3 the build can't start, because it type-checks the tests and this import is missing.)

- [ ] **Step 3: Implement the summary helper, nav item and messages**

```ts
// src/lib/review/summary.ts
import type { BulkResult } from "@/lib/engine/schemas";

/** Spec v1.1 §6: posts a bulk action couldn't handle are listed by name. */
export function bulkFailureLines(result: BulkResult, posts: { id: string; title: string }[]) {
  const titles = new Map(posts.map((post) => [post.id, post.title]));
  return result.failed.map((failure) => ({ id: failure.id, title: titles.get(failure.id) ?? failure.id, message: failure.message }));
}
```

In `src/components/shell/nav.ts`, set:

```ts
export const NAV_ITEMS: readonly NavItem[] = [
  { key: "dashboard", href: "/", permission: "content.work" },
  { key: "review", href: "/review", permission: "content.work" },
];
```

`messages/en.json`: add `"review": "Review"` inside `Shell.nav`, and a new top-level namespace:

```json
  "Review": {
    "title": "Review",
    "empty": "Nothing is waiting for review.",
    "count": "{shown} of {total} posts",
    "selectAll": "Select all",
    "select": "Select “{title}”",
    "approveSelected": "Approve selected ({count})",
    "bulkFailed": "Not approved:",
    "drafting": "Drafting…",
    "twin": "Pair: {language}",
    "critical": "{count} critical",
    "warn": "{count} warnings",
    "languages": { "en": "English", "ar": "Arabic" },
    "kinds": { "blog": "Article", "social": "Social post" }
  }
```

`messages/ar.json`: add `"review": "المراجعة"` inside `Shell.nav`, and:

```json
  "Review": {
    "title": "المراجعة",
    "empty": "لا يوجد شيء بانتظار المراجعة.",
    "count": "{shown} من {total} منشورات",
    "selectAll": "تحديد الكل",
    "select": "تحديد «{title}»",
    "approveSelected": "اعتماد المحدد ({count})",
    "bulkFailed": "لم يُعتمد:",
    "drafting": "جارٍ الصياغة…",
    "twin": "النسخة المقابلة: {language}",
    "critical": "{count} حرجة",
    "warn": "{count} تحذيرات",
    "languages": { "en": "الإنجليزية", "ar": "العربية" },
    "kinds": { "blog": "مقال", "social": "منشور تواصل" }
  }
```

- [ ] **Step 4: Implement the queue components**

```tsx
// src/components/review/auto-refresh.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";

/** While drafts are being written, re-fetch the page at the engine's poll interval (spec v1.1 §2, no webhook yet). */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(timer);
  }, [router, seconds]);
  return null;
}
```

```tsx
// src/components/review/post-card.tsx
"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import type { Post } from "@/lib/engine/schemas";
import { findingCounts } from "@/lib/posts/rules";

export function PostCard({ post, selected, onSelect }: { post: Post; selected: boolean; onSelect: (checked: boolean) => void }) {
  const t = useTranslations("Review");
  const counts = findingCounts(post);
  const selectable = post.actions.includes("approve");
  const languageName = (code: string) => (t.has(`languages.${code}`) ? t(`languages.${code}`) : code);

  return (
    <Card data-testid={`card-${post.id}`}>
      <CardHeader className="flex flex-row items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 size-4 accent-primary"
          data-testid={`card-select-${post.id}`}
          aria-label={t("select", { title: post.title })}
          checked={selected}
          disabled={!selectable}
          onChange={(event) => onSelect(event.target.checked)}
        />
        <div className="flex min-w-0 flex-col gap-2">
          <Link
            href={`/review/${post.id}`}
            data-testid={`card-title-${post.id}`}
            lang={post.language}
            dir={post.language === "ar" ? "rtl" : "ltr"}
            className="font-heading text-lg hover:underline"
          >
            {post.title}
          </Link>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="secondary">{t.has(`kinds.${post.kind}`) ? t(`kinds.${post.kind}`) : post.kind}</Badge>
            <Badge variant="outline">{languageName(post.language)}</Badge>
            {post.twin && (
              <Badge variant="outline" data-testid={`card-twin-${post.id}`}>
                {t("twin", { language: languageName(post.twin.language) })}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3 text-sm">
        {post.status === "drafting" ? (
          <span data-testid={`card-drafting-${post.id}`} className="inline-flex items-center gap-2 text-muted-foreground">
            <span className="size-3 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" aria-hidden="true" />
            {t("drafting")}
          </span>
        ) : (
          <>
            {counts.critical > 0 && (
              <span data-testid={`card-critical-${post.id}`} className="rounded bg-bad-bg px-2 py-0.5 text-bad-fg">
                {t("critical", { count: counts.critical })}
              </span>
            )}
            {counts.warn > 0 && <span className="rounded bg-warn-bg px-2 py-0.5 text-warn-fg">{t("warn", { count: counts.warn })}</span>}
          </>
        )}
        {post.image && (
          // eslint-disable-next-line @next/next/no-img-element -- engine photo URLs come from many hosts (Pexels, uploads)
          <img src={post.image.url} alt={post.image.alt ?? ""} className="ms-auto h-12 w-16 rounded object-cover" />
        )}
      </CardContent>
    </Card>
  );
}
```

```tsx
// src/components/review/review-board.tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { bulkPostsAction } from "@/app/[locale]/(app)/review/actions";
import { ActionError } from "@/components/actions/action-error";
import { Button } from "@/components/ui/button";
import { useEngineAction } from "@/lib/actions/use-engine-action";
import type { EngineFailure } from "@/lib/engine/result";
import type { Post } from "@/lib/engine/schemas";
import { bulkFailureLines } from "@/lib/review/summary";
import { AutoRefresh } from "./auto-refresh";
import { PostCard } from "./post-card";

type Props = { locale: string; posts: Post[]; total: number; pollSeconds: number };

export function ReviewBoard({ locale, posts, total, pollSeconds }: Props) {
  const t = useTranslations("Review");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [failures, setFailures] = useState<{ id: string; title: string; message: string }[]>([]);
  const [error, setError] = useState<EngineFailure | null>(null);
  const bulk = useEngineAction(bulkPostsAction);
  const selectable = posts.filter((post) => post.actions.includes("approve"));
  const chosen = [...selected].filter((id) => selectable.some((post) => post.id === id));

  function toggle(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function approveSelected() {
    setError(null);
    const result = await bulk.run({ locale, action: "approve", ids: chosen });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setFailures(bulkFailureLines(result.data, posts));
    setSelected(new Set(result.data.failed.map((failure) => failure.id)));
  }

  if (posts.length === 0) return <p className="text-muted-foreground">{t("empty")}</p>;

  return (
    <div className="flex flex-col gap-4">
      {posts.some((post) => post.status === "drafting") && <AutoRefresh seconds={pollSeconds} />}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground" data-testid="review-count">
          {t("count", { shown: String(posts.length), total: String(total) })}
        </span>
        <Button variant="outline" size="sm" onClick={() => setSelected(new Set(selectable.map((post) => post.id)))}>
          {t("selectAll")}
        </Button>
        <Button size="sm" data-testid="approve-selected" disabled={chosen.length === 0 || bulk.pending} onClick={approveSelected}>
          {t("approveSelected", { count: String(chosen.length) })}
        </Button>
      </div>
      {error && <ActionError error={error} />}
      {failures.length > 0 && (
        <div role="alert" data-testid="bulk-failures" className="rounded-md bg-bad-bg p-3 text-sm text-bad-fg">
          <p className="font-medium">{t("bulkFailed")}</p>
          <ul className="mt-1 list-disc ps-5">
            {failures.map((failure) => (
              <li key={failure.id}>
                {failure.title}: {failure.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {posts.map((post) => (
          <PostCard key={post.id} post={post} selected={selected.has(post.id)} onSelect={(checked) => toggle(post.id, checked)} />
        ))}
      </div>
    </div>
  );
}
```

```tsx
// src/components/review/review-queue.tsx
import { EngineNotice } from "@/components/dashboard/engine-notice";
import type { AppLocale } from "@/i18n/locales";
import { requirePermission } from "@/lib/auth/session";
import { getEngine } from "@/lib/engine";
import { tryEngine } from "@/lib/engine/result";
import { ReviewBoard } from "./review-board";

export async function ReviewQueue({ locale }: { locale: AppLocale }) {
  await requirePermission(locale, "content.work");
  const engine = await getEngine();
  const meta = await tryEngine(() => engine.meta());
  const list = await tryEngine(() =>
    engine.listPosts({ statuses: ["drafting", "pending"], pageSize: meta.ok ? meta.data.limits.pageSizeDefault : undefined }),
  );
  if (!list.ok) return <EngineNotice error={list.error} />;
  return (
    <ReviewBoard
      locale={locale}
      posts={list.data.posts}
      total={list.data.meta?.total ?? list.data.posts.length}
      pollSeconds={meta.ok ? meta.data.pollSeconds : 5}
    />
  );
}
```

```tsx
// src/app/[locale]/(app)/review/page.tsx
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SectionSkeleton } from "@/components/dashboard/section-skeleton";
import { ReviewQueue } from "@/components/review/review-queue";
import { asAppLocale } from "@/i18n/locales";

export default async function ReviewPage({ params }: PageProps<"/[locale]/review">) {
  const locale = asAppLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("Review");
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl">{t("title")}</h1>
      <Suspense fallback={<SectionSkeleton />}>
        <ReviewQueue locale={locale} />
      </Suspense>
    </div>
  );
}
```

- [ ] **Step 5: Run the unit tests**

Run: `pnpm test`
Expected: PASS (110 + 1 new = 111).

- [ ] **Step 6: Run the e2e tests**

Run: `pnpm e2e`
Expected: all pass. That's the 22 from M1 and 4 new in `review.spec.ts`.

- [ ] **Step 7: Lint, typecheck and commit**

Run: `pnpm lint && pnpm typecheck`
Expected: exit 0.

```bash
git add -A
git commit -m "feat: add the review queue with drafting refresh, pairs, finding counts and bulk approve"
```

---
### Task 6: The editor (fields, rich text, save, conflicts, locks, checks, sources)

**Files:**
- Create:
  - `src/lib/editor/changed-fields.ts`
  - `src/components/editor/extensions.ts`, `rich-text.tsx`, `field-counter.tsx`, `keyword-chips.tsx`, `lock-banner.tsx`, `conflict-panel.tsx`, `checks-panel.tsx`, `sources-list.tsx`, `editor-body.tsx`, `editor-footer.tsx`, `post-editor.tsx`
  - `src/app/[locale]/(app)/review/[postId]/page.tsx`
- Generate: `src/components/ui/{dialog,input,textarea,label}.tsx` (shadcn)
- Modify: `messages/en.json`, `messages/ar.json`
- Test: `tests/unit/editor-roundtrip.test.ts`, `tests/unit/changed-fields.test.ts`, `tests/e2e/editor.spec.ts`

**Interfaces:**
- Consumes:
  - from Task 4: `savePostAction`, `loadPostAction`, `lockPostAction`, `unlockPostAction`, `takeoverPostAction`, `useEngineAction`, `ActionError`
  - from Task 3: `engine.post`, `engine.meta`, `engine.categories`
  - from Task 1: `Post`, `PostUpdate`, `Category`
- Produces:
  - `editorExtensions`: the TipTap extension list, shared by the editor and the round-trip test
  - `type EditableFields`, `toEditable(post): EditableFields`, `changedFields(mine, theirs): FieldKey[]`, `FIELD_KEYS`
  - `<EditorBody kind language value editable onChange bodyKey />`. **Task 8 replaces this file.**
  - `<EditorFooter {...EditorFooterProps} />`, where `EditorFooterProps = { locale; post; dirty; editable; saving; onSave; pollSeconds }`. **Task 7 replaces this file.**
  - `<PostEditor locale post twin limits categories lockMinutes pollSeconds />`
  - test ids:
    - fields: `field-title`, `field-subtitle`, `field-slug`, `field-meta-title`, `field-meta-description`, `field-section`, `field-hashtags`, `keyword-chip-<n>`, `keyword-input`
    - body: `editor-body`
    - save: `save`, `save-status`
    - lock: `lock-banner`, `takeover`
    - conflict: `conflict-panel`, `conflict-load-theirs`, `conflict-keep-mine`
    - checks and sources: `checks-critical`, `checks-warn`, `checks-human`, `seo-score`, `sources`

- [ ] **Step 1: Install the editor and the UI pieces**

```bash
pnpm add @tiptap/react@3.32.0 @tiptap/pm@3.32.0 @tiptap/starter-kit@3.32.0 @tiptap/extension-table@3.32.0
pnpm add -D @tiptap/html@3.32.0 happy-dom@20.14.6
CI=1 pnpm dlx shadcn@4.22.1 add dialog input textarea label --yes < /dev/null
ls src/components/ui
```
Expected: `badge button card dialog direction input label textarea`.

- [ ] **Step 2: Write the failing unit tests**

```ts
// tests/unit/editor-roundtrip.test.ts
import { generateHTML, generateJSON } from "@tiptap/html";
import { describe, expect, it } from "vitest";
import { editorExtensions } from "@/components/editor/extensions";

const ARTICLE =
  "<h2>When the commission is earned</h2>" +
  '<p>Read the <a href="https://uaelegislation.gov.ae/en/legislations/1541">Labour Law</a> with <strong>your plan</strong>.</p>' +
  "<h3>Steps</h3><h4>Detail</h4>" +
  "<ul><li>Performance</li><li>Event</li></ul><ol><li>First</li></ol>" +
  "<table><tr><th>Contract value</th><th>Rate</th></tr><tr><td>Up to AED 1 million</td><td>2%</td></tr></table>" +
  "<blockquote>Article 53</blockquote>";

describe("the editor keeps the engine's article HTML (Review Focus 1)", () => {
  const roundTrip = (html: string) => generateHTML(generateJSON(html, editorExtensions), editorExtensions);

  it("keeps headings, links, emphasis, lists, tables and quotes", () => {
    const out = roundTrip(ARTICLE);
    for (const fragment of [
      "<h2>When the commission is earned</h2>",
      'href="https://uaelegislation.gov.ae/en/legislations/1541"',
      "<strong>your plan</strong>",
      "<h3>Steps</h3>",
      "<h4>Detail</h4>",
      "<ul>",
      "<ol>",
      "<table",
      "Contract value",
      "Up to AED 1 million",
      "<blockquote>",
      "Article 53",
    ]) {
      expect(out).toContain(fragment);
    }
  });

  it("is stable: a second round trip changes nothing", () => {
    const once = roundTrip(ARTICLE);
    expect(roundTrip(once)).toBe(once);
  });
});
```

```ts
// tests/unit/changed-fields.test.ts
import { describe, expect, it } from "vitest";
import { changedFields, type EditableFields } from "@/lib/editor/changed-fields";

const base: EditableFields = {
  title: "T",
  subtitle: null,
  slug: "t",
  metaTitle: null,
  metaDescription: "D",
  keywords: ["a"],
  content: "<p>x</p>",
  hashtags: [],
  section: "labour-law",
};

describe("changedFields", () => {
  it("lists the fields that differ", () => {
    expect(changedFields(base, { ...base, title: "U", keywords: ["a", "b"] })).toEqual(["title", "keywords"]);
  });

  it("treats empty text and null as the same", () => {
    expect(changedFields({ ...base, subtitle: "" }, base)).toEqual([]);
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `pnpm test tests/unit/editor-roundtrip.test.ts tests/unit/changed-fields.test.ts`
Expected: FAIL. `@/components/editor/extensions` and `@/lib/editor/changed-fields` can't be resolved.

- [ ] **Step 4: Implement the extension list and the field diff**

```ts
// src/components/editor/extensions.ts
import { TableKit } from "@tiptap/extension-table";
import { StarterKit } from "@tiptap/starter-kit";

/** Everything an engine article can contain (spec v1.1 §11 neutral form): h2–h4, lists, links, emphasis, quotes, tables. */
export const editorExtensions = [
  StarterKit.configure({ heading: { levels: [2, 3, 4] }, link: { openOnClick: false, autolink: false } }),
  TableKit,
];
```

```ts
// src/lib/editor/changed-fields.ts
import type { Post } from "@/lib/engine/schemas";

export const FIELD_KEYS = ["title", "subtitle", "slug", "metaTitle", "metaDescription", "keywords", "content", "hashtags", "section"] as const;
export type FieldKey = (typeof FIELD_KEYS)[number];

export type EditableFields = {
  title: string;
  subtitle: string | null;
  slug: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  keywords: string[];
  content: string;
  hashtags: string[];
  section: string | null;
};

export function toEditable(post: Post): EditableFields {
  return {
    title: post.title,
    subtitle: post.subtitle ?? null,
    slug: post.slug ?? null,
    metaTitle: post.metaTitle ?? null,
    metaDescription: post.metaDescription ?? null,
    keywords: [...post.keywords],
    content: post.content ?? "",
    hashtags: [...post.hashtags],
    section: post.section ?? null,
  };
}

const normalize = (value: unknown) => (value === null || value === undefined ? "" : value);

/** Fields where my unsaved edit and the newer saved version differ (shown in the conflict panel). */
export function changedFields(mine: EditableFields, theirs: EditableFields): FieldKey[] {
  return FIELD_KEYS.filter((key) => JSON.stringify(normalize(mine[key])) !== JSON.stringify(normalize(theirs[key])));
}
```

- [ ] **Step 5: Run the unit tests to verify they pass**

Run: `pnpm test`
Expected: PASS (111 + 4 new = 115). If the round-trip test shows a missing tag, the extension list lacks a node type: add it to `editorExtensions` and don't weaken the test.

- [ ] **Step 6: Add the Editor messages**

`messages/en.json`, new top-level namespace:

```json
  "Editor": {
    "back": "← Review",
    "status": { "drafting": "Drafting", "pending": "Waiting for review", "approved": "Approved", "rejected": "Rejected", "published": "Published", "failed": "Failed" },
    "fields": {
      "title": "Title",
      "subtitle": "Standfirst",
      "slug": "Slug",
      "metaTitle": "Meta title",
      "metaDescription": "Meta description",
      "keywords": "Keywords",
      "content": "Body",
      "hashtags": "Hashtags",
      "section": "Section"
    },
    "noSection": "No section",
    "focusKeyword": "focus",
    "addKeyword": "Add a keyword and press Enter",
    "removeKeyword": "Remove “{keyword}”",
    "hashtagsHint": "Separate with commas",
    "counter": "{length} / {limit}",
    "toolbar": { "h2": "Heading", "h3": "Subheading", "bold": "Bold", "italic": "Italic", "bulletList": "Bulleted list", "orderedList": "Numbered list" },
    "save": "Save",
    "saving": "Saving…",
    "saved": "Saved",
    "unsaved": "Unsaved changes",
    "lockedBy": "Being edited by {name}. You can read it, or take over to edit.",
    "takeover": "Take over",
    "conflictTitle": "Someone saved first",
    "conflictBody": "These fields are different in the version they saved:",
    "loadTheirs": "Load their version",
    "keepMine": "Keep mine and save",
    "checks": "Checks",
    "seoScore": "SEO score {score}",
    "critical": "Critical",
    "warn": "Warnings",
    "human": "For the reviewer",
    "humanHint": "Check these yourself; they're never marked as passed.",
    "noFindings": "No issues found.",
    "sources": "Sources",
    "noSources": "No sources listed.",
    "reviewNote": "Requested change: {note}"
  }
```

`messages/ar.json`:

```json
  "Editor": {
    "back": "→ المراجعة",
    "status": { "drafting": "قيد الصياغة", "pending": "بانتظار المراجعة", "approved": "معتمد", "rejected": "مرفوض", "published": "منشور", "failed": "فشل" },
    "fields": {
      "title": "العنوان",
      "subtitle": "المقدمة",
      "slug": "الرابط المختصر",
      "metaTitle": "عنوان الميتا",
      "metaDescription": "وصف الميتا",
      "keywords": "الكلمات المفتاحية",
      "content": "النص",
      "hashtags": "الوسوم",
      "section": "القسم"
    },
    "noSection": "بدون قسم",
    "focusKeyword": "الرئيسية",
    "addKeyword": "أضف كلمة مفتاحية واضغط Enter",
    "removeKeyword": "إزالة «{keyword}»",
    "hashtagsHint": "افصل بينها بفواصل",
    "counter": "{length} / {limit}",
    "toolbar": { "h2": "عنوان", "h3": "عنوان فرعي", "bold": "غامق", "italic": "مائل", "bulletList": "قائمة نقطية", "orderedList": "قائمة مرقمة" },
    "save": "حفظ",
    "saving": "جارٍ الحفظ…",
    "saved": "تم الحفظ",
    "unsaved": "تغييرات غير محفوظة",
    "lockedBy": "يحرره {name} الآن. يمكنك القراءة، أو تولي التحرير.",
    "takeover": "تولي التحرير",
    "conflictTitle": "حفظ شخص آخر أولاً",
    "conflictBody": "هذه الحقول مختلفة في النسخة التي حفظها:",
    "loadTheirs": "تحميل نسخته",
    "keepMine": "الإبقاء على نسختي وحفظها",
    "checks": "الفحوصات",
    "seoScore": "تقييم السيو {score}",
    "critical": "حرجة",
    "warn": "تحذيرات",
    "human": "للمراجع",
    "humanHint": "تحقق منها بنفسك؛ لا تُعلَّم كمجتازة أبداً.",
    "noFindings": "لا توجد مشكلات.",
    "sources": "المصادر",
    "noSources": "لا توجد مصادر.",
    "reviewNote": "التعديل المطلوب: {note}"
  }
```

- [ ] **Step 7: Write the failing e2e test**

```ts
// tests/e2e/editor.spec.ts
import { expect, test } from "@playwright/test";
import { isolateMockStore, signInWithCookie } from "./helpers";

test.beforeEach(async ({ context }) => {
  await isolateMockStore(context);
  await signInWithCookie(context, "dev_reviewer");
});

test("opens a post from the queue and saves a change", async ({ page }) => {
  await page.goto("/en/review");
  await page.getByTestId("card-title-p_201").click();
  await expect(page).toHaveURL(/\/en\/review\/p_201$/);
  await page.getByTestId("field-title").fill("Commission rules in the UAE");
  await page.getByTestId("save").click();
  await expect(page.getByTestId("save-status")).toHaveText("Saved");
  await page.reload();
  await expect(page.getByTestId("field-title")).toHaveValue("Commission rules in the UAE");
});

test("a second tab's save shows a conflict instead of overwriting (Review Focus 2)", async ({ page, context }) => {
  await page.goto("/en/review/p_201");
  const other = await context.newPage();
  await other.goto("/en/review/p_201");
  await other.getByTestId("field-title").fill("Saved in the other tab");
  await other.getByTestId("save").click();
  await expect(other.getByTestId("save-status")).toHaveText("Saved");

  await page.getByTestId("field-subtitle").fill("My new standfirst");
  await page.getByTestId("save").click();
  await expect(page.getByTestId("conflict-panel")).toContainText("Title");
  await page.getByTestId("conflict-load-theirs").click();
  await expect(page.getByTestId("field-title")).toHaveValue("Saved in the other tab");
  await expect(page.getByTestId("conflict-panel")).toHaveCount(0);
});

test("a post someone else is editing is read-only until you take over", async ({ page }) => {
  await page.goto("/en/review/p_208");
  await expect(page.getByTestId("lock-banner")).toContainText("omar@example.com");
  await expect(page.getByTestId("field-title")).toBeDisabled();
  await page.getByTestId("takeover").click();
  await expect(page.getByTestId("lock-banner")).toHaveCount(0);
  await expect(page.getByTestId("field-title")).toBeEnabled();
});

test("shows checks, the SEO score and sources", async ({ page }) => {
  await page.goto("/en/review/p_203");
  await expect(page.getByTestId("checks-critical")).toContainText("The meta description is");
  await expect(page.getByTestId("seo-score")).toHaveText("SEO score 85");
  await page.goto("/en/review/p_201");
  await expect(page.getByTestId("sources")).toContainText("Federal Decree-Law No. 33 of 2021");
});

test("an Arabic post is edited right to left", async ({ page }) => {
  await page.goto("/en/review/p_202");
  await expect(page.getByTestId("editor-body")).toHaveAttribute("dir", "rtl");
  await expect(page.getByTestId("field-title")).toHaveAttribute("dir", "rtl");
});

test("a social post has a plain-text body and hashtags", async ({ page }) => {
  await page.goto("/en/review/p_206");
  await expect(page.getByTestId("field-hashtags")).toHaveValue("#UAELabourLaw, #Dubai");
  await expect(page.getByTestId("editor-body")).toHaveValue(/Resigning doesn't cancel/);
});
```

- [ ] **Step 8: Run it to verify it fails**

Run: `pnpm e2e tests/e2e/editor.spec.ts`
Expected: FAIL. `/en/review/p_201` returns 404, so `field-title` is never found.

- [ ] **Step 9: Add article styles for the editor body**

Append to `src/app/globals.css`:

```css
/* Engine article HTML inside the editor and the twin view (logical properties, so Arabic mirrors). */
@layer components {
  .prose-article h2 { @apply mt-4 mb-2 font-heading text-2xl; }
  .prose-article h3 { @apply mt-3 mb-2 font-heading text-xl; }
  .prose-article h4 { @apply mt-3 mb-1 font-semibold; }
  .prose-article p { @apply my-2 leading-7; }
  .prose-article ul { @apply my-2 list-disc ps-6; }
  .prose-article ol { @apply my-2 list-decimal ps-6; }
  .prose-article blockquote { @apply my-3 border-s-4 border-border ps-4 text-muted-foreground; }
  .prose-article table { @apply my-3 w-full border-collapse text-sm; }
  .prose-article th,
  .prose-article td { @apply border border-border px-2 py-1 text-start; }
  .prose-article a { @apply text-primary underline; }
}
```

- [ ] **Step 10: Implement the editor components**

```tsx
// src/components/editor/rich-text.tsx
"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { editorExtensions } from "./extensions";

type Props = { initialHtml: string; editable: boolean; dir: "ltr" | "rtl"; lang: string; label: string; onChange: (html: string) => void };

export function RichText({ initialHtml, editable, dir, lang, label, onChange }: Props) {
  const t = useTranslations("Editor.toolbar");
  const editor = useEditor({
    extensions: editorExtensions,
    content: initialHtml,
    editable,
    immediatelyRender: false, // server-rendered page: create the editor in the browser only
    editorProps: {
      attributes: {
        dir,
        lang,
        "aria-label": label,
        "data-testid": "editor-body",
        class: "prose-article min-h-64 rounded-md border border-input bg-card p-4 focus:outline-none",
      },
    },
    onUpdate: ({ editor: current }) => onChange(current.getHTML()),
  });

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  if (!editor) return <div className="min-h-64 rounded-md border border-input bg-card" aria-hidden="true" />;

  const tools: [string, () => boolean][] = [
    ["h2", () => editor.chain().focus().toggleHeading({ level: 2 }).run()],
    ["h3", () => editor.chain().focus().toggleHeading({ level: 3 }).run()],
    ["bold", () => editor.chain().focus().toggleBold().run()],
    ["italic", () => editor.chain().focus().toggleItalic().run()],
    ["bulletList", () => editor.chain().focus().toggleBulletList().run()],
    ["orderedList", () => editor.chain().focus().toggleOrderedList().run()],
  ];

  return (
    <div className="flex flex-col gap-2">
      {editable && (
        <div role="toolbar" aria-label={label} className="flex flex-wrap gap-1">
          {tools.map(([key, apply]) => (
            <Button key={key} type="button" variant="outline" size="xs" onClick={() => apply()}>
              {t(key)}
            </Button>
          ))}
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
```

```tsx
// src/components/editor/field-counter.tsx
"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Props = {
  id: string;
  testId: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  limit?: number;
  multiline?: boolean;
  dir?: "ltr" | "rtl";
  hint?: string;
};

export function FieldCounter({ id, testId, label, value, onChange, disabled, limit, multiline, dir, hint }: Props) {
  const t = useTranslations("Editor");
  const over = limit !== undefined && value.length > limit;
  const shared = { id, "data-testid": testId, value, dir, disabled, "aria-invalid": over || undefined };
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {limit !== undefined && (
          <span data-testid={`${testId}-count`} className={cn("text-xs", over ? "text-bad-fg" : "text-muted-foreground")}>
            {t("counter", { length: String(value.length), limit: String(limit) })}
          </span>
        )}
      </div>
      {multiline ? (
        <Textarea {...shared} rows={3} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <Input {...shared} onChange={(event) => onChange(event.target.value)} />
      )}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
```

```tsx
// src/components/editor/keyword-chips.tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function KeywordChips({ value, onChange, disabled }: { value: string[]; onChange: (next: string[]) => void; disabled: boolean }) {
  const t = useTranslations("Editor");
  const [draft, setDraft] = useState("");

  function add() {
    const word = draft.trim();
    if (word && !value.includes(word)) onChange([...value, word]);
    setDraft("");
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="keyword-input">{t("fields.keywords")}</Label>
      <div className="flex flex-wrap gap-2">
        {value.map((keyword, index) => (
          <span
            key={keyword}
            data-testid={`keyword-chip-${index}`}
            className="inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-sm text-accent-foreground"
          >
            {keyword}
            {index === 0 && <span className="text-xs opacity-70">({t("focusKeyword")})</span>}
            {!disabled && (
              <button type="button" className="ms-1" aria-label={t("removeKeyword", { keyword })} onClick={() => onChange(value.filter((k) => k !== keyword))}>
                ×
              </button>
            )}
          </span>
        ))}
      </div>
      {!disabled && (
        <Input
          id="keyword-input"
          data-testid="keyword-input"
          value={draft}
          placeholder={t("addKeyword")}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
        />
      )}
    </div>
  );
}
```

```tsx
// src/components/editor/lock-banner.tsx
"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export function LockBanner({ name, pending, onTakeover }: { name: string; pending: boolean; onTakeover: () => void }) {
  const t = useTranslations("Editor");
  return (
    <div role="status" data-testid="lock-banner" className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-warn-bg px-4 py-3 text-sm text-warn-fg">
      <span>{t("lockedBy", { name })}</span>
      <Button size="sm" variant="outline" data-testid="takeover" disabled={pending} onClick={onTakeover}>
        {t("takeover")}
      </Button>
    </div>
  );
}
```

```tsx
// src/components/editor/conflict-panel.tsx
"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { FieldKey } from "@/lib/editor/changed-fields";

type Props = { fields: FieldKey[]; pending: boolean; onLoadTheirs: () => void; onKeepMine: () => void };

export function ConflictPanel({ fields, pending, onLoadTheirs, onKeepMine }: Props) {
  const t = useTranslations("Editor");
  return (
    <div role="alert" data-testid="conflict-panel" className="rounded-md border border-warn-fg/40 bg-warn-bg p-4 text-sm text-warn-fg">
      <p className="font-medium">{t("conflictTitle")}</p>
      <p className="mt-1">{t("conflictBody")}</p>
      <ul className="mt-2 list-disc ps-5">
        {fields.map((field) => (
          <li key={field}>{t(`fields.${field}`)}</li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" data-testid="conflict-load-theirs" onClick={onLoadTheirs}>
          {t("loadTheirs")}
        </Button>
        <Button size="sm" data-testid="conflict-keep-mine" disabled={pending} onClick={onKeepMine}>
          {t("keepMine")}
        </Button>
      </div>
    </div>
  );
}
```

```tsx
// src/components/editor/checks-panel.tsx
"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Post } from "@/lib/engine/schemas";
import { cn } from "@/lib/utils";

const LEVELS = ["critical", "warn", "human"] as const;
const STYLE = { critical: "bg-bad-bg text-bad-fg", warn: "bg-warn-bg text-warn-fg", human: "bg-neutral-bg text-neutral-fg" };

/** Findings exactly as the engine words them (spec §2 "show errors as text"); "human" items are never shown as passed. */
export function ChecksPanel({ post }: { post: Post }) {
  const t = useTranslations("Editor");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("checks")}</CardTitle>
        {post.seo && <CardDescription data-testid="seo-score">{t("seoScore", { score: String(post.seo.score) })}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {post.findings.length === 0 && <p className="text-muted-foreground">{t("noFindings")}</p>}
        {LEVELS.map((level) => {
          const items = post.findings.filter((finding) => finding.level === level);
          if (items.length === 0) return null;
          return (
            <section key={level} data-testid={`checks-${level}`}>
              <h3 className="mb-1 font-medium">{t(level)}</h3>
              {level === "human" && <p className="mb-1 text-xs text-muted-foreground">{t("humanHint")}</p>}
              <ul className="flex flex-col gap-1">
                {items.map((finding, index) => (
                  <li key={`${finding.code ?? finding.message}-${index}`} className={cn("rounded px-2 py-1", STYLE[level])}>
                    {finding.ref && <span className="me-1 font-mono text-xs">{finding.ref}</span>}
                    {finding.message}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </CardContent>
    </Card>
  );
}
```

```tsx
// src/components/editor/sources-list.tsx
"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Post } from "@/lib/engine/schemas";

export function SourcesList({ post }: { post: Post }) {
  const t = useTranslations("Editor");
  return (
    <Card data-testid="sources">
      <CardHeader>
        <CardTitle>{t("sources")}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm">
        {post.sources.length === 0 ? (
          <p className="text-muted-foreground">{t("noSources")}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {post.sources.map((source) => (
              <li key={source.url}>
                <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                  {source.title}
                </a>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
```

```tsx
// src/components/editor/editor-body.tsx  (Task 8 replaces this file to add the side-by-side view)
"use client";

import { useTranslations } from "next-intl";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RichText } from "./rich-text";

type Props = { kind: string; language: string; value: string; editable: boolean; onChange: (value: string) => void; bodyKey: number };

/** Articles are HTML (rich text); social posts are plain text (spec v1.1 §4 Post.content). */
export function EditorBody({ kind, language, value, editable, onChange, bodyKey }: Props) {
  const t = useTranslations("Editor");
  const dir = language === "ar" ? "rtl" : "ltr";
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{t("fields.content")}</Label>
      {kind === "blog" ? (
        <RichText key={bodyKey} initialHtml={value} editable={editable} dir={dir} lang={language} label={t("fields.content")} onChange={onChange} />
      ) : (
        <Textarea
          data-testid="editor-body"
          aria-label={t("fields.content")}
          dir={dir}
          lang={language}
          rows={6}
          value={value}
          disabled={!editable}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </div>
  );
}
```

```tsx
// src/components/editor/editor-footer.tsx  (Task 7 replaces this file to add the review actions)
"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { Post } from "@/lib/engine/schemas";

export type EditorFooterProps = {
  locale: string;
  post: Post;
  dirty: boolean;
  editable: boolean;
  saving: boolean;
  onSave: () => void;
  pollSeconds: number;
};

export function EditorFooter(props: EditorFooterProps) {
  const t = useTranslations("Editor");
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
      {props.editable && (
        <Button data-testid="save" disabled={!props.dirty || props.saving} onClick={props.onSave}>
          {props.saving ? t("saving") : t("save")}
        </Button>
      )}
      {props.dirty && <span className="text-sm text-muted-foreground">{t("unsaved")}</span>}
    </div>
  );
}
```

```tsx
// src/components/editor/post-editor.tsx
"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  loadPostAction,
  lockPostAction,
  savePostAction,
  takeoverPostAction,
  unlockPostAction,
} from "@/app/[locale]/(app)/review/actions";
import { ActionError } from "@/components/actions/action-error";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Link } from "@/i18n/navigation";
import { useEngineAction } from "@/lib/actions/use-engine-action";
import { changedFields, toEditable, type EditableFields } from "@/lib/editor/changed-fields";
import type { EngineFailure } from "@/lib/engine/result";
import type { Category, Post } from "@/lib/engine/schemas";
import { ChecksPanel } from "./checks-panel";
import { ConflictPanel } from "./conflict-panel";
import { EditorBody } from "./editor-body";
import { EditorFooter } from "./editor-footer";
import { FieldCounter } from "./field-counter";
import { KeywordChips } from "./keyword-chips";
import { LockBanner } from "./lock-banner";
import { SourcesList } from "./sources-list";

type Props = {
  locale: string;
  post: Post;
  twin: Post | null;
  limits: { metaTitle: number; metaDescription: number };
  categories: Category[];
  lockMinutes: number;
  pollSeconds: number;
};

const parseHashtags = (text: string) => text.split(",").map((tag) => tag.trim()).filter(Boolean);

export function PostEditor({ locale, post, limits, categories, lockMinutes, pollSeconds }: Props) {
  const t = useTranslations("Editor");
  const [saved, setSaved] = useState<Post | null>(null);
  // The newest version wins: my last save, or what the server re-rendered after refresh().
  const current = saved && saved.version >= post.version ? saved : post;
  const [form, setForm] = useState<EditableFields>(() => toEditable(post));
  const [hashtagText, setHashtagText] = useState(() => post.hashtags.join(", "));
  const [bodyKey, setBodyKey] = useState(0);
  const [lockedBy, setLockedBy] = useState<string | null>(null);
  const [conflict, setConflict] = useState<Post | null>(null);
  const [savedNow, setSavedNow] = useState(false);
  const [error, setError] = useState<EngineFailure | null>(null);
  const save = useEngineAction(savePostAction);
  const takeover = useEngineAction(takeoverPostAction);
  const takeLock = useEngineAction(lockPostAction).run;

  const canEdit = current.actions.includes("edit");
  const editable = canEdit && lockedBy === null;
  const dirty = changedFields(form, toEditable(current)).length > 0;
  const dir = current.language === "ar" ? "rtl" : "ltr";

  // Spec v1.1 §3: take the lock on open, renew it while editing, release it on leaving.
  useEffect(() => {
    if (!canEdit) return;
    let active = true;
    async function acquire() {
      const result = await takeLock({ locale, postId: post.id });
      if (!active) return;
      setLockedBy(!result.ok && result.error.code === "locked" ? String(result.error.details?.lockedBy ?? "") : null);
    }
    void acquire();
    const timer = setInterval(acquire, Math.max(30, lockMinutes * 30) * 1000);
    return () => {
      active = false;
      clearInterval(timer);
      void unlockPostAction({ locale, postId: post.id, idempotencyKey: crypto.randomUUID() });
    };
  }, [canEdit, locale, lockMinutes, post.id, takeLock]);

  function set<K extends keyof EditableFields>(key: K) {
    return (value: EditableFields[K]) => {
      setSavedNow(false);
      setForm((previous) => ({ ...previous, [key]: value }));
    };
  }

  async function persist(version: number) {
    setError(null);
    setSavedNow(false);
    const result = await save.run({ locale, postId: post.id, update: { ...form, version } });
    if (result.ok) {
      setSaved(result.data);
      setSavedNow(true);
      return;
    }
    if (result.error.code === "version_conflict") {
      const theirs = await loadPostAction({ locale, postId: post.id });
      if (theirs.ok) setConflict(theirs.data);
      else setError(theirs.error);
      return;
    }
    if (result.error.code === "locked") {
      setLockedBy(String(result.error.details?.lockedBy ?? ""));
      return;
    }
    setError(result.error);
  }

  function loadTheirs() {
    if (!conflict) return;
    setSaved(conflict);
    setForm(toEditable(conflict));
    setHashtagText(conflict.hashtags.join(", "));
    setBodyKey((key) => key + 1);
    setConflict(null);
  }

  async function keepMine() {
    if (!conflict) return;
    const version = conflict.version;
    setSaved(conflict);
    setConflict(null);
    await persist(version);
  }

  async function takeOver() {
    const result = await takeover.run({ locale, postId: post.id });
    if (result.ok) {
      setLockedBy(null);
      setSaved(result.data);
    } else {
      setError(result.error);
    }
  }

  const statusLabel = t.has(`status.${current.status}`) ? t(`status.${current.status}`) : current.status;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/review" className="text-sm text-muted-foreground hover:underline">
          {t("back")}
        </Link>
        <Badge variant="secondary" data-testid="post-status">
          {statusLabel}
        </Badge>
        {savedNow && (
          <span data-testid="save-status" className="text-sm text-ok-fg">
            {t("saved")}
          </span>
        )}
      </div>

      {lockedBy !== null && <LockBanner name={lockedBy || "?"} pending={takeover.pending} onTakeover={takeOver} />}
      {conflict && (
        <ConflictPanel fields={changedFields(form, toEditable(conflict))} pending={save.pending} onLoadTheirs={loadTheirs} onKeepMine={keepMine} />
      )}
      {current.reviewNote && (
        <p className="rounded-md bg-info-bg px-3 py-2 text-sm text-info-fg">{t("reviewNote", { note: current.reviewNote })}</p>
      )}
      {error && <ActionError error={error} />}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-4" lang={current.language}>
          <FieldCounter id="title" testId="field-title" label={t("fields.title")} value={form.title} onChange={set("title")} disabled={!editable} dir={dir} />
          <FieldCounter
            id="subtitle"
            testId="field-subtitle"
            label={t("fields.subtitle")}
            value={form.subtitle ?? ""}
            onChange={(value) => set("subtitle")(value || null)}
            disabled={!editable}
            dir={dir}
          />
          <EditorBody kind={current.kind} language={current.language} value={form.content} editable={editable} onChange={set("content")} bodyKey={bodyKey} />
          {current.kind === "social" ? (
            <FieldCounter
              id="hashtags"
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
          ) : (
            <>
              <FieldCounter id="slug" testId="field-slug" label={t("fields.slug")} value={form.slug ?? ""} onChange={(value) => set("slug")(value || null)} disabled={!editable} dir="ltr" />
              <FieldCounter
                id="meta-title"
                testId="field-meta-title"
                label={t("fields.metaTitle")}
                value={form.metaTitle ?? ""}
                limit={limits.metaTitle}
                onChange={(value) => set("metaTitle")(value || null)}
                disabled={!editable}
                dir={dir}
              />
              <FieldCounter
                id="meta-description"
                testId="field-meta-description"
                label={t("fields.metaDescription")}
                value={form.metaDescription ?? ""}
                limit={limits.metaDescription}
                multiline
                onChange={(value) => set("metaDescription")(value || null)}
                disabled={!editable}
                dir={dir}
              />
              <KeywordChips value={form.keywords} onChange={set("keywords")} disabled={!editable} />
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="section">{t("fields.section")}</Label>
                <select
                  id="section"
                  data-testid="field-section"
                  className="h-9 rounded-md border border-input bg-card px-3 text-sm"
                  value={form.section ?? ""}
                  disabled={!editable}
                  onChange={(event) => set("section")(event.target.value || null)}
                >
                  <option value="">{t("noSection")}</option>
                  {categories.map((category) => (
                    <option key={category.slug} value={category.slug}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>
        <aside className="flex flex-col gap-4">
          <ChecksPanel post={current} />
          <SourcesList post={current} />
        </aside>
      </div>

      <EditorFooter
        locale={locale}
        post={current}
        dirty={dirty}
        editable={editable}
        saving={save.pending}
        onSave={() => void persist(current.version)}
        pollSeconds={pollSeconds}
      />
    </div>
  );
}
```

- [ ] **Step 11: Add the editor page**

```tsx
// src/app/[locale]/(app)/review/[postId]/page.tsx
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { EngineNotice } from "@/components/dashboard/engine-notice";
import { SectionSkeleton } from "@/components/dashboard/section-skeleton";
import { PostEditor } from "@/components/editor/post-editor";
import { Link } from "@/i18n/navigation";
import { asAppLocale } from "@/i18n/locales";
import { requirePermission } from "@/lib/auth/session";
import { getEngine } from "@/lib/engine";
import { tryEngine, type EngineFailure } from "@/lib/engine/result";

// `postId` isn't known at build time, so params is read inside the Suspense boundary (Cache Components).
export default function EditorPage({ params }: PageProps<"/[locale]/review/[postId]">) {
  return (
    <Suspense fallback={<SectionSkeleton />}>
      <EditorLoader params={params} />
    </Suspense>
  );
}

async function EditorLoader({ params }: { params: Promise<{ locale: string; postId: string }> }) {
  const { locale: rawLocale, postId } = await params;
  const locale = asAppLocale(rawLocale);
  setRequestLocale(locale);
  await requirePermission(locale, "content.work");
  const t = await getTranslations("Editor");
  const engine = await getEngine();

  const [post, meta, categories] = await Promise.all([
    tryEngine(() => engine.post(postId)),
    tryEngine(() => engine.meta()),
    tryEngine(() => engine.categories()),
  ]);
  const missing = (error: EngineFailure) => (
    <div className="flex flex-col gap-4">
      <EngineNotice error={error} />
      <Link href="/review" className="text-sm text-primary underline">
        {t("back")}
      </Link>
    </div>
  );
  if (!post.ok) return missing(post.error);
  if (!meta.ok) return missing(meta.error);

  const twinId = post.data.twin?.id;
  const twin = twinId ? await tryEngine(() => engine.post(twinId)) : null;

  return (
    <PostEditor
      locale={locale}
      post={post.data}
      twin={twin?.ok ? twin.data : null}
      limits={{ metaTitle: meta.data.limits.metaTitle, metaDescription: meta.data.limits.metaDescription }}
      categories={categories.ok ? categories.data : []}
      lockMinutes={meta.data.limits.lockMinutes}
      pollSeconds={meta.data.pollSeconds}
    />
  );
}
```

- [ ] **Step 12: Run the tests to verify they pass**

Run: `pnpm test && pnpm e2e`
Expected: unit PASS (115); e2e PASS (26 earlier + 6 in `editor.spec.ts` = 32).

- [ ] **Step 13: Lint, typecheck and commit**

Run: `pnpm lint && pnpm typecheck`
Expected: exit 0.

```bash
git add -A
git commit -m "feat: add the post editor with rich text, field limits, keywords, checks, sources, version conflicts and edit locks"
```

---
### Task 7: Review actions in the editor (approve, override, changes, reject, delete) and job progress

**Files:**
- Create: `src/components/editor/confirm-dialog.tsx`, `src/components/editor/job-progress.tsx`, `src/components/editor/status-watcher.tsx`, `src/components/editor/action-bar.tsx`
- Replace: `src/components/editor/editor-footer.tsx`
- Modify: `messages/en.json`, `messages/ar.json` (keys added inside `Editor`)
- Test: `tests/e2e/editor-actions.spec.ts`

**Interfaces:**
- Consumes:
  - from Task 6: `EditorFooterProps` (unchanged), `PostEditor`
  - from Task 4: `approvePostAction`, `requestChangesAction`, `rejectPostAction`, `deletePostAction`, `jobAction`, `loadPostAction`, `useEngineAction`, `ActionError`
  - from Task 1: `approvalMode`
- Produces:
  - `<ConfirmDialog …>`: a dialog with an optional note; `onConfirm(note)` resolves to `EngineFailure | null`, and the dialog closes only on `null`
  - `<JobProgress locale jobId pollSeconds onDone />`
  - `<StatusWatcher locale postId status pollSeconds />`: when the page was opened mid-redraft (no job id), it reloads once the post's status changes
  - A finished redraft triggers a **full page reload**, so the editor shows the engine's new content (the editor's form keeps its own state and wouldn't pick up a server refresh)
  - `<ActionBar locale post dirty pollSeconds />`
  - test ids:
    - approve: `approve`, `approve-confirm`, `approve-note`, `approve-blocked`
    - changes: `changes`, `changes-note`, `changes-confirm`
    - reject: `reject`, `reject-note`, `reject-confirm`
    - delete: `delete`, `delete-confirm`
    - progress: `job-progress`

- [ ] **Step 1: Write the failing e2e test**

```ts
// tests/e2e/editor-actions.spec.ts
import { expect, test } from "@playwright/test";
import { isolateMockStore, signInWithCookie } from "./helpers";

test.beforeEach(async ({ context }) => {
  await isolateMockStore(context);
  await signInWithCookie(context, "dev_reviewer");
});

test("approves a post with no critical findings", async ({ page }) => {
  await page.goto("/en/review/p_201");
  await page.getByTestId("approve").click();
  await expect(page.getByTestId("post-status")).toHaveText("Approved");
  await page.goto("/en/review");
  await expect(page.getByTestId("card-p_201")).toHaveCount(0);
});

test("overriding a critical finding needs a reason", async ({ page }) => {
  await page.goto("/en/review/p_203");
  await page.getByTestId("approve").click();
  await expect(page.getByTestId("approve-confirm")).toBeDisabled();
  await page.getByTestId("approve-note").fill("Length agreed with the client");
  await page.getByTestId("approve-confirm").click();
  await expect(page.getByTestId("post-status")).toHaveText("Approved");
});

test("an Arabic version whose structure doesn't match can't be approved (Review Focus 5)", async ({ page }) => {
  await page.goto("/en/review/p_205");
  await expect(page.getByTestId("approve")).toBeDisabled();
  await expect(page.getByTestId("approve-blocked")).toBeVisible();
  await expect(page.getByTestId("approve-note")).toHaveCount(0);
});

test("fixing the finding lets you approve directly", async ({ page }) => {
  await page.goto("/en/review/p_203");
  await page.getByTestId("field-meta-description").fill("Buy-outs, mediation and court exits for deadlocked UAE companies.");
  await page.getByTestId("save").click();
  await expect(page.getByTestId("save-status")).toHaveText("Saved");
  await expect(page.getByTestId("checks-critical")).toHaveCount(0);
  await page.getByTestId("approve").click();
  await expect(page.getByTestId("post-status")).toHaveText("Approved");
});

test("asking for changes redrafts the post and brings it back for review", async ({ page }) => {
  await page.goto("/en/review/p_201");
  await page.getByTestId("changes").click();
  await page.getByTestId("changes-note").fill("Shorter introduction");
  await page.getByTestId("changes-confirm").click();
  await expect(page.getByTestId("job-progress")).toBeVisible();
  await expect(page.getByTestId("post-status")).toHaveText("Waiting for review", { timeout: 15_000 });
  await expect(page.getByText("Requested change: Shorter introduction")).toBeVisible();
  await expect(page.getByTestId("editor-body")).toContainText("Revised as requested: Shorter introduction");
});

test("rejects, then deletes, returning to the queue", async ({ page }) => {
  await page.goto("/en/review/p_206");
  await page.getByTestId("reject").click();
  await page.getByTestId("reject-note").fill("Off-topic");
  await page.getByTestId("reject-confirm").click();
  await expect(page.getByTestId("post-status")).toHaveText("Rejected");
  await page.getByTestId("delete").click();
  await page.getByTestId("delete-confirm").click();
  await expect(page).toHaveURL(/\/en\/review$/);
  await expect(page.getByTestId("card-p_206")).toHaveCount(0);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm e2e tests/e2e/editor-actions.spec.ts`
Expected: FAIL. The `approve`, `changes` and `reject` test ids don't exist yet.

- [ ] **Step 3: Add the messages**

Inside the `Editor` namespace of `messages/en.json`, add:

```json
    "approve": "Approve",
    "approveBlockedHint": "A critical check can't be overridden here. Fix it first (see Checks).",
    "saveFirst": "Save your changes before approving.",
    "overrideTitle": "Approve with an override",
    "overrideBody": "This post has critical findings. Approving it anyway needs a reason, which is recorded in History.",
    "overrideReason": "Reason",
    "approveAnyway": "Approve anyway",
    "changes": "Ask for changes",
    "changesBody": "Say what should change. The post is redrafted and comes back for review.",
    "changesNote": "What should change",
    "send": "Send",
    "reject": "Reject",
    "rejectTitle": "Reject this post?",
    "rejectBody": "It leaves the review queue. You can add a note.",
    "rejectNote": "Note (optional)",
    "delete": "Delete",
    "deleteTitle": "Delete this post?",
    "deleteBody": "This can't be undone.",
    "cancel": "Cancel",
    "redrafting": "Redrafting… {percent}%",
    "jobFailed": "The redraft failed."
```

Inside `Editor` in `messages/ar.json`:

```json
    "approve": "اعتماد",
    "approveBlockedHint": "يوجد فحص حرج لا يمكن تجاوزه هنا. أصلحه أولاً (راجع الفحوصات).",
    "saveFirst": "احفظ تغييراتك قبل الاعتماد.",
    "overrideTitle": "اعتماد مع تجاوز",
    "overrideBody": "في هذا المنشور نتائج حرجة. اعتماده رغم ذلك يتطلب سبباً يُسجَّل في السجل.",
    "overrideReason": "السبب",
    "approveAnyway": "اعتماد رغم ذلك",
    "changes": "طلب تعديلات",
    "changesBody": "اذكر ما يجب تغييره. ستُعاد صياغة المنشور ويعود للمراجعة.",
    "changesNote": "ما الذي يجب تغييره",
    "send": "إرسال",
    "reject": "رفض",
    "rejectTitle": "رفض هذا المنشور؟",
    "rejectBody": "سيخرج من قائمة المراجعة. يمكنك إضافة ملاحظة.",
    "rejectNote": "ملاحظة (اختياري)",
    "delete": "حذف",
    "deleteTitle": "حذف هذا المنشور؟",
    "deleteBody": "لا يمكن التراجع عن ذلك.",
    "cancel": "إلغاء",
    "redrafting": "جارٍ إعادة الصياغة… {percent}%",
    "jobFailed": "فشلت إعادة الصياغة."
```

- [ ] **Step 4: Implement the dialog, job progress and action bar**

```tsx
// src/components/editor/confirm-dialog.tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ActionError } from "@/components/actions/action-error";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { EngineFailure } from "@/lib/engine/result";

type Props = {
  testId: string;
  triggerLabel: string;
  triggerVariant?: "default" | "outline" | "secondary" | "destructive";
  disabled?: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  note?: { label: string; required: boolean };
  pending: boolean;
  onConfirm: (note: string) => Promise<EngineFailure | null>;
};

export function ConfirmDialog({ testId, triggerLabel, triggerVariant = "outline", disabled, title, description, confirmLabel, note, pending, onConfirm }: Props) {
  const t = useTranslations("Editor");
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<EngineFailure | null>(null);
  const missingNote = note?.required === true && !text.trim();

  async function confirm() {
    const failure = await onConfirm(text.trim());
    setError(failure);
    if (!failure) {
      setOpen(false);
      setText("");
    }
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
        <Button variant={triggerVariant} data-testid={testId} disabled={disabled}>
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {note && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${testId}-note`}>{note.label}</Label>
            <Textarea id={`${testId}-note`} data-testid={`${testId}-note`} rows={3} value={text} onChange={(event) => setText(event.target.value)} />
          </div>
        )}
        {error && <ActionError error={error} />}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{t("cancel")}</Button>
          </DialogClose>
          <Button data-testid={`${testId}-confirm`} disabled={missingNote || pending} onClick={() => void confirm()}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

```tsx
// src/components/editor/job-progress.tsx
"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { jobAction } from "@/app/[locale]/(app)/review/actions";

type Props = { locale: string; jobId: string; pollSeconds: number; onDone: () => void };

/** Polls GET /jobs/{id} at the engine's interval until the job is done or failed (spec v1.1 §3 async jobs). */
export function JobProgress({ locale, jobId, pollSeconds, onDone }: Props) {
  const t = useTranslations("Editor");
  const [progress, setProgress] = useState(0);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const timer = setInterval(() => void poll(), pollSeconds * 1000);
    async function poll() {
      const result = await jobAction({ locale, jobId });
      if (!active) return;
      if (!result.ok) {
        setFailure(result.error.message);
        return;
      }
      setProgress(result.data.progress ?? 0);
      if (result.data.status === "done") {
        active = false;
        clearInterval(timer);
        onDone();
      } else if (result.data.status === "failed") {
        active = false;
        clearInterval(timer);
        setFailure(typeof result.data.error === "string" ? result.data.error : t("jobFailed"));
      }
    }
    void poll();
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [jobId, locale, onDone, pollSeconds, t]);

  return (
    <div role="status" data-testid="job-progress" className="flex flex-col gap-1 text-sm">
      <span>{t("redrafting", { percent: String(Math.round(progress * 100)) })}</span>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
      {failure && <p className="text-bad-fg">{failure}</p>}
    </div>
  );
}
```

```tsx
// src/components/editor/status-watcher.tsx
"use client";

import { useEffect } from "react";
import { loadPostAction } from "@/app/[locale]/(app)/review/actions";

type Props = { locale: string; postId: string; status: string; pollSeconds: number };

/** Opened mid-redraft (no job id to poll): check the post at the engine's interval and reload once its status changes. */
export function StatusWatcher({ locale, postId, status, pollSeconds }: Props) {
  useEffect(() => {
    const timer = setInterval(async () => {
      const result = await loadPostAction({ locale, postId });
      if (result.ok && result.data.status !== status) window.location.reload();
    }, pollSeconds * 1000);
    return () => clearInterval(timer);
  }, [locale, postId, status, pollSeconds]);
  return null;
}
```

```tsx
// src/components/editor/action-bar.tsx
"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { approvePostAction, deletePostAction, rejectPostAction, requestChangesAction } from "@/app/[locale]/(app)/review/actions";
import { ActionError } from "@/components/actions/action-error";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { useEngineAction } from "@/lib/actions/use-engine-action";
import type { EngineFailure } from "@/lib/engine/result";
import type { Post } from "@/lib/engine/schemas";
import { approvalMode } from "@/lib/posts/rules";
import { ConfirmDialog } from "./confirm-dialog";
import { JobProgress } from "./job-progress";
import { StatusWatcher } from "./status-watcher";

type Props = { locale: string; post: Post; dirty: boolean; pollSeconds: number };

/** Buttons come from post.actions (spec v1.1 §5); approval follows the findings (direct, override with reason, or blocked). */
export function ActionBar({ locale, post, dirty, pollSeconds }: Props) {
  const t = useTranslations("Editor");
  const router = useRouter();
  const approve = useEngineAction(approvePostAction);
  const changes = useEngineAction(requestChangesAction);
  const reject = useEngineAction(rejectPostAction);
  const remove = useEngineAction(deletePostAction);
  const [error, setError] = useState<EngineFailure | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  // A full reload: the editor keeps its own form state, so only a fresh page shows the redrafted content.
  const finishJob = useCallback(() => window.location.reload(), []);

  const allowed = new Set(post.actions);
  const mode = approvalMode(post.findings);

  async function approveDirectly() {
    setError(null);
    const result = await approve.run({ locale, postId: post.id });
    if (!result.ok) setError(result.error);
  }

  const approveWithReason = async (reason: string) => {
    const result = await approve.run({ locale, postId: post.id, overrideReason: reason });
    return result.ok ? null : result.error;
  };
  const askForChanges = async (note: string) => {
    const result = await changes.run({ locale, postId: post.id, note });
    if (!result.ok) return result.error;
    setJobId(result.data.jobId);
    return null;
  };
  const rejectPost = async (note: string) => {
    const result = await reject.run({ locale, postId: post.id, note: note || undefined });
    return result.ok ? null : result.error;
  };
  const deletePost = async () => {
    const result = await remove.run({ locale, postId: post.id });
    if (!result.ok) return result.error;
    router.push("/review");
    return null;
  };

  return (
    <div className="flex flex-col gap-2">
      {jobId && <JobProgress locale={locale} jobId={jobId} pollSeconds={pollSeconds} onDone={finishJob} />}
      {!jobId && post.status === "drafting" && <StatusWatcher locale={locale} postId={post.id} status={post.status} pollSeconds={pollSeconds} />}
      <div className="flex flex-wrap items-center gap-2">
        {allowed.has("approve") && mode === "direct" && (
          <Button data-testid="approve" disabled={dirty || approve.pending} onClick={() => void approveDirectly()}>
            {t("approve")}
          </Button>
        )}
        {allowed.has("approve") && mode === "override" && (
          <ConfirmDialog
            testId="approve"
            triggerVariant="default"
            triggerLabel={t("approve")}
            disabled={dirty}
            title={t("overrideTitle")}
            description={t("overrideBody")}
            confirmLabel={t("approveAnyway")}
            note={{ label: t("overrideReason"), required: true }}
            pending={approve.pending}
            onConfirm={approveWithReason}
          />
        )}
        {allowed.has("approve") && mode === "blocked" && (
          <Button data-testid="approve" disabled>
            {t("approve")}
          </Button>
        )}
        {allowed.has("changes") && (
          <ConfirmDialog
            testId="changes"
            triggerLabel={t("changes")}
            title={t("changes")}
            description={t("changesBody")}
            confirmLabel={t("send")}
            note={{ label: t("changesNote"), required: true }}
            pending={changes.pending}
            onConfirm={askForChanges}
          />
        )}
        {allowed.has("reject") && (
          <ConfirmDialog
            testId="reject"
            triggerLabel={t("reject")}
            title={t("rejectTitle")}
            description={t("rejectBody")}
            confirmLabel={t("reject")}
            note={{ label: t("rejectNote"), required: false }}
            pending={reject.pending}
            onConfirm={rejectPost}
          />
        )}
        {allowed.has("delete") && (
          <ConfirmDialog
            testId="delete"
            triggerVariant="destructive"
            triggerLabel={t("delete")}
            title={t("deleteTitle")}
            description={t("deleteBody")}
            confirmLabel={t("delete")}
            pending={remove.pending}
            onConfirm={deletePost}
          />
        )}
      </div>
      {allowed.has("approve") && mode === "blocked" && (
        <p data-testid="approve-blocked" className="text-sm text-bad-fg">
          {t("approveBlockedHint")}
        </p>
      )}
      {allowed.has("approve") && mode !== "blocked" && dirty && <p className="text-sm text-muted-foreground">{t("saveFirst")}</p>}
      {error && <ActionError error={error} />}
    </div>
  );
}
```

- [ ] **Step 5: Replace the editor footer**

```tsx
// src/components/editor/editor-footer.tsx
"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { Post } from "@/lib/engine/schemas";
import { ActionBar } from "./action-bar";

export type EditorFooterProps = {
  locale: string;
  post: Post;
  dirty: boolean;
  editable: boolean;
  saving: boolean;
  onSave: () => void;
  pollSeconds: number;
};

export function EditorFooter({ locale, post, dirty, editable, saving, onSave, pollSeconds }: EditorFooterProps) {
  const t = useTranslations("Editor");
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <div className="flex flex-wrap items-center gap-3">
        {editable && (
          <Button data-testid="save" disabled={!dirty || saving} onClick={onSave}>
            {saving ? t("saving") : t("save")}
          </Button>
        )}
        {dirty && <span className="text-sm text-muted-foreground">{t("unsaved")}</span>}
      </div>
      <ActionBar locale={locale} post={post} dirty={dirty} pollSeconds={pollSeconds} />
    </div>
  );
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test && pnpm e2e`
Expected: unit PASS (115); e2e PASS (32 + 6 = 38). The redraft test waits for the 2.5 s mock job and the 3 s poll.

- [ ] **Step 7: Lint, typecheck and commit**

Run: `pnpm lint && pnpm typecheck`
Expected: exit 0.

```bash
git add -A
git commit -m "feat: add approve, override, ask-for-changes, reject and delete to the editor with redraft progress"
```

---
### Task 8: Side-by-side English/Arabic view

**Files:**
- Create: `src/lib/editor/blocks.ts`, `src/components/editor/twin-view.tsx`
- Replace: `src/components/editor/editor-body.tsx`
- Modify: `src/components/editor/post-editor.tsx` (pass `twin`), `messages/en.json`, `messages/ar.json` (keys inside `Editor`)
- Test: `tests/unit/blocks.test.ts`, `tests/e2e/twin.spec.ts`

**Interfaces:**
- Consumes: from Task 6, `EditorBody`'s props and `PostEditor`; from Task 1, `Post`
- Produces:
  - `type BlockSummary = { tag: string; text: string }`
  - `blockSummaries(html: string, parse: (html: string) => Document): BlockSummary[]`: top-level blocks only
  - `type AlignedRow = { left: BlockSummary | null; right: BlockSummary | null; matches: boolean }`
  - `alignBlocks(left, right): AlignedRow[]`: a longest-common-subsequence alignment on tags, so a missing paragraph shows as one gap rather than shifting every row after it
  - `<TwinView mineHtml mineLanguage twin />`
  - test ids: `compare-toggle`, `twin-view`, `twin-summary`, `twin-left`, `twin-right`, `twin-row-mismatch`

- [ ] **Step 1: Write the failing unit tests**

```ts
// tests/unit/blocks.test.ts
import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";
import { alignBlocks, blockSummaries, type BlockSummary } from "@/lib/editor/blocks";

const parse = (html: string) => new new Window().DOMParser().parseFromString(html, "text/html") as unknown as Document;
const blocks = (...tags: string[]): BlockSummary[] => tags.map((tag, i) => ({ tag, text: `${tag}${i}` }));

describe("blockSummaries", () => {
  it("lists top-level blocks with their text, ignoring nested elements", () => {
    expect(blockSummaries("<h2>Title</h2><p>Text <a href='x'>link</a></p><ul><li>One</li></ul>", parse)).toEqual([
      { tag: "h2", text: "Title" },
      { tag: "p", text: "Text link" },
      { tag: "ul", text: "One" },
    ]);
  });
});

describe("alignBlocks", () => {
  it("matches identical structures row by row", () => {
    const rows = alignBlocks(blocks("h2", "p", "ul"), blocks("h2", "p", "ul"));
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.matches)).toBe(true);
  });

  it("shows a missing paragraph as a single gap", () => {
    const rows = alignBlocks(blocks("h2", "p", "p", "h2", "p"), blocks("h2", "p", "h2", "p"));
    expect(rows.map((row) => row.matches)).toEqual([true, true, false, true, true]);
    expect(rows[2]).toMatchObject({ left: { tag: "p" }, right: null });
  });

  it("shows an extra block on the other side as a gap", () => {
    const rows = alignBlocks(blocks("h2", "p"), blocks("h2", "blockquote", "p"));
    expect(rows.filter((row) => !row.matches)).toEqual([{ left: null, right: expect.objectContaining({ tag: "blockquote" }), matches: false }]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test tests/unit/blocks.test.ts`
Expected: FAIL. `@/lib/editor/blocks` can't be resolved.

- [ ] **Step 3: Implement the block alignment**

```ts
// src/lib/editor/blocks.ts
export type BlockSummary = { tag: string; text: string };
export type AlignedRow = { left: BlockSummary | null; right: BlockSummary | null; matches: boolean };

/** Top-level blocks of an article (the units TranslatePress pairs by position). */
export function blockSummaries(html: string, parse: (html: string) => Document): BlockSummary[] {
  const doc = parse(html);
  return [...doc.body.children].map((element) => ({
    tag: element.tagName.toLowerCase(),
    text: (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 160),
  }));
}

/** Longest-common-subsequence alignment on tags: a missing block becomes one gap instead of shifting every row. */
export function alignBlocks(left: BlockSummary[], right: BlockSummary[]): AlignedRow[] {
  const n = left.length;
  const m = right.length;
  const lcs = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = left[i].tag === right[j].tag ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const rows: AlignedRow[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && left[i].tag === right[j].tag) {
      rows.push({ left: left[i], right: right[j], matches: true });
      i++;
      j++;
    } else if (j >= m || (i < n && lcs[i + 1][j] >= lcs[i][j + 1])) {
      rows.push({ left: left[i], right: null, matches: false });
      i++;
    } else {
      rows.push({ left: null, right: right[j], matches: false });
      j++;
    }
  }
  return rows;
}
```

- [ ] **Step 4: Run the unit tests to verify they pass**

Run: `pnpm test`
Expected: PASS (115 + 4 new = 119).

- [ ] **Step 5: Write the failing e2e test**

```ts
// tests/e2e/twin.spec.ts
import { expect, test } from "@playwright/test";
import { isolateMockStore, signInWithCookie } from "./helpers";

test.beforeEach(async ({ context }) => {
  await isolateMockStore(context);
  await signInWithCookie(context, "dev_reviewer");
});

test("shows an English article and its Arabic version side by side", async ({ page }) => {
  await page.goto("/en/review/p_201");
  await page.getByTestId("compare-toggle").click();
  await expect(page.getByTestId("twin-view")).toBeVisible();
  await expect(page.getByTestId("twin-summary")).toHaveText("The structure matches (7 sections).");
  await expect(page.getByTestId("twin-left")).toHaveAttribute("dir", "ltr");
  await expect(page.getByTestId("twin-right")).toHaveAttribute("dir", "rtl");
});

test("points at the section that doesn't line up", async ({ page }) => {
  await page.goto("/en/review/p_205");
  await page.getByTestId("compare-toggle").click();
  await expect(page.getByTestId("twin-summary")).toContainText("1 section doesn't line up");
  await expect(page.getByTestId("twin-row-mismatch")).toHaveCount(1);
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm e2e tests/e2e/twin.spec.ts`
Expected: FAIL. `compare-toggle` doesn't exist.

- [ ] **Step 7: Add the messages**

Inside `Editor` in `messages/en.json`:

```json
    "compare": "Side by side with the {language} version",
    "hideCompare": "Hide side by side",
    "languages": { "en": "English", "ar": "Arabic" },
    "structureMatches": "The structure matches ({count} sections).",
    "structureMismatchOne": "1 section doesn't line up. TranslatePress needs both versions to have the same structure.",
    "structureMismatchMany": "{count} sections don't line up. TranslatePress needs both versions to have the same structure.",
    "missingBlock": "— missing —"
```

Inside `Editor` in `messages/ar.json`:

```json
    "compare": "عرض متجاور مع النسخة {language}",
    "hideCompare": "إخفاء العرض المتجاور",
    "languages": { "en": "الإنجليزية", "ar": "العربية" },
    "structureMatches": "البنية متطابقة ({count} أقسام).",
    "structureMismatchOne": "قسم واحد غير متطابق. يحتاج TranslatePress إلى البنية نفسها في النسختين.",
    "structureMismatchMany": "{count} أقسام غير متطابقة. يحتاج TranslatePress إلى البنية نفسها في النسختين.",
    "missingBlock": "— غير موجود —"
```

- [ ] **Step 8: Implement the twin view and the new editor body**

```tsx
// src/components/editor/twin-view.tsx
"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { alignBlocks, blockSummaries, type BlockSummary } from "@/lib/editor/blocks";
import type { Post } from "@/lib/engine/schemas";
import { cn } from "@/lib/utils";

const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");

type Props = { mineHtml: string; mineLanguage: string; twin: Post };

/** English always on the left, Arabic on the right, aligned section by section (design §7). */
export function TwinView({ mineHtml, mineLanguage, twin }: Props) {
  const t = useTranslations("Editor");
  const mineIsEnglish = mineLanguage !== "ar";
  const english = mineIsEnglish ? mineHtml : (twin.content ?? "");
  const arabic = mineIsEnglish ? (twin.content ?? "") : mineHtml;
  const rows = useMemo(() => alignBlocks(blockSummaries(english, parse), blockSummaries(arabic, parse)), [english, arabic]);
  const mismatches = rows.filter((row) => !row.matches).length;

  const summary =
    mismatches === 0
      ? t("structureMatches", { count: String(rows.length) })
      : mismatches === 1
        ? t("structureMismatchOne")
        : t("structureMismatchMany", { count: String(mismatches) });

  const cell = (block: BlockSummary | null, dir: "ltr" | "rtl", lang: string) => (
    <div dir={dir} lang={lang} className="min-w-0 rounded px-2 py-1">
      {block ? (
        <>
          <span className="me-2 font-mono text-xs text-muted-foreground">{block.tag}</span>
          {block.text}
        </>
      ) : (
        <span className="text-muted-foreground">{t("missingBlock")}</span>
      )}
    </div>
  );

  return (
    <section data-testid="twin-view" className="flex flex-col gap-2 rounded-md border border-border p-3 text-sm">
      <p data-testid="twin-summary" className={cn("rounded px-2 py-1", mismatches === 0 ? "bg-ok-bg text-ok-fg" : "bg-bad-bg text-bad-fg")}>
        {summary}
      </p>
      <div className="grid grid-cols-2 gap-2 font-medium">
        <div data-testid="twin-left" dir="ltr" lang="en">
          {t("languages.en")}
        </div>
        <div data-testid="twin-right" dir="rtl" lang="ar">
          {t("languages.ar")}
        </div>
      </div>
      {rows.map((row, index) => (
        <div
          key={index}
          data-testid={row.matches ? "twin-row" : "twin-row-mismatch"}
          className={cn("grid grid-cols-2 gap-2", !row.matches && "bg-bad-bg text-bad-fg")}
        >
          {cell(row.left, "ltr", "en")}
          {cell(row.right, "rtl", "ar")}
        </div>
      ))}
    </section>
  );
}
```

```tsx
// src/components/editor/editor-body.tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Post } from "@/lib/engine/schemas";
import { RichText } from "./rich-text";
import { TwinView } from "./twin-view";

type Props = {
  kind: string;
  language: string;
  value: string;
  editable: boolean;
  onChange: (value: string) => void;
  bodyKey: number;
  twin: Post | null;
};

/** Articles are HTML (rich text); social posts are plain text. An article with a twin can be compared side by side. */
export function EditorBody({ kind, language, value, editable, onChange, bodyKey, twin }: Props) {
  const t = useTranslations("Editor");
  const [comparing, setComparing] = useState(false);
  const dir = language === "ar" ? "rtl" : "ltr";
  const canCompare = kind === "blog" && twin !== null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label>{t("fields.content")}</Label>
        {canCompare && (
          <Button type="button" variant="outline" size="sm" data-testid="compare-toggle" onClick={() => setComparing((on) => !on)}>
            {comparing
              ? t("hideCompare")
              : t("compare", { language: t.has(`languages.${twin.language}`) ? t(`languages.${twin.language}`) : twin.language })}
          </Button>
        )}
      </div>
      {comparing && twin && <TwinView mineHtml={value} mineLanguage={language} twin={twin} />}
      {kind === "blog" ? (
        <RichText key={bodyKey} initialHtml={value} editable={editable} dir={dir} lang={language} label={t("fields.content")} onChange={onChange} />
      ) : (
        <Textarea
          data-testid="editor-body"
          aria-label={t("fields.content")}
          dir={dir}
          lang={language}
          rows={6}
          value={value}
          disabled={!editable}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </div>
  );
}
```

In `src/components/editor/post-editor.tsx`, make two changes:

(a) Change the function signature line from

```tsx
export function PostEditor({ locale, post, limits, categories, lockMinutes, pollSeconds }: Props) {
```

to

```tsx
export function PostEditor({ locale, post, twin, limits, categories, lockMinutes, pollSeconds }: Props) {
```

(b) Change the `<EditorBody … />` element to pass the twin:

```tsx
          <EditorBody
            kind={current.kind}
            language={current.language}
            value={form.content}
            editable={editable}
            onChange={set("content")}
            bodyKey={bodyKey}
            twin={twin}
          />
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `pnpm test && pnpm e2e`
Expected: unit PASS (119); e2e PASS (38 + 2 = 40).

- [ ] **Step 10: Lint, typecheck and commit**

Run: `pnpm lint && pnpm typecheck`
Expected: exit 0.

```bash
git add -A
git commit -m "feat: compare an article with its Arabic version side by side, aligned section by section"
```

---

### Task 9: M2a wrap-up and full verification

**Files:**
- Modify: `README.md`, `docs/plans/2026-10-21-m1-followups.md`

**Interfaces:**
- Consumes: everything above
- Produces: a documented, fully green M2a

- [ ] **Step 1: Document M2a in `README.md`**

Append to the "Decisions in M1" section a new section:

```markdown
## Decisions in M2a (review and editing)

- **The mock engine keeps state per `mock_store` cookie.** Each browser test sets its own namespace, so tests can't affect each other. Without the cookie, everything shares the "default" store until the server restarts.
- **Every change carries an `Idempotency-Key`.** It's created by `useEngineAction`, reused only after a network error, and the mock replays repeated keys exactly as the engine will.
- **Edit locks:** taken on opening the editor, renewed every half of `lockMinutes`, released on leaving, and taken over on request. An abandoned lock expires on its own.
- **Approval follows the findings:**
  - **Direct:** no critical findings.
  - **Override:** critical findings that can be overridden, with a required reason recorded in History.
  - **Blocked:** a non-overridable finding such as `structure_mismatch`.
- **The side-by-side view aligns sections** with a longest-common-subsequence match on block tags, so one missing paragraph shows as one gap.
```

- [ ] **Step 2: Mark the M1 follow-up handled in M2a**

In `docs/plans/2026-10-21-m1-followups.md`, append ` — handled in M2a (engine_busy and not_found translated)` to the line about unmapped engine codes showing English messages.

- [ ] **Step 3: Run every check from a clean build**

```bash
rm -rf .next
pnpm lint && pnpm typecheck && pnpm test && pnpm e2e && ALLOW_TEST_LOGINS=1 pnpm build
```
Expected:
- lint and typecheck exit 0
- Vitest: 119 passed
- Playwright: 40 passed
- the build lists `◐ /en/review`, `◐ /ar/review` and `ƒ /[locale]/review/[postId]` (or `◐`)

- [ ] **Step 4: Manual smoke test**

Run `pnpm dev`, sign in as **Reviewer**, and check:
- (a) `/en/review` lists 8 posts. p_207 shows "Drafting…".
- (b) Opening p_201 shows a rich-text body with a table and toolbar buttons. Edit and Save shows "Saved".
- (c) **Side by side** on p_201 shows English on the left and Arabic on the right, all rows matching.
- (d) On p_205, Approve is disabled and the explanation is shown.
- (e) In `/ar/review/p_202`, the whole editor is right to left.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: M2a decisions; review and editing complete"
git log --oneline | head -10
```
