# M2b: Photos, Publishing, Scheduled and History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish design §13 M2:
- the editor's photo panel (Pexels search, upload, remove, alt text and credit)
- Publish now (single and bulk) and export (HTML / Markdown)
- the Scheduled page and the History page
- the shell gaps left from M1: a site-wide 401 banner, `error.tsx`, and the language switch on the sign-in and no-access pages
- the M2a follow-ups that the new screens make urgent

**Architecture:**
- **Mock engine:** the stateful mock store from M2a now owns:
  - the publishing queue (approved posts in order, hold/resume, deterministic Dubai-time slots)
  - publishing (with one deterministic "website refused" failure)
  - the history seeds, Pexels-like photos (offline SVG data URLs), multipart uploads, and file exports
- **Engine client:**
  - multipart bodies
  - raw-file downloads
  - lenient list parsing: one malformed item is skipped and counted, not fatal
- **Pages:** Scheduled and History are new server-rendered pages under `<Suspense>`, with small client boards for the buttons.
- **Changes:** every change still goes through server actions with idempotency keys. A key is now reused only for the *same* request after no answer.

**Tech Stack:** Next.js 16.4 (App Router, Cache Components), React 19.3, TypeScript 5, next-intl 4.14, Zod 4.6, shadcn/ui, TipTap 3.32, Vitest 5, Playwright 1.64. No new dependencies.

**Spec:**
- `docs/specs/2026-10-21-marketing-dashboard-design.md`: §5 roles, §7 screens and display rules, §8 data flow, §9 errors and retries, §14 testing
- `docs/specs/Marketing Portal Build Spec v1.1.html`:
  - §2 ground rules, §3 conventions (idempotency, locks), §4 Post / Photo / Meta
  - §5 status flows, §6 `/review`, `/review/[postId]`, `/scheduled`, `/history`
  - §7 endpoints (publish, hold, bulk, photos, image, export, scheduled), §9 errors, §10 acceptance
- `docs/plans/2026-10-21-m1-followups.md` and `docs/plans/2026-10-22-m2a-followups.md`

## Global Constraints

- **Earlier constraints still hold:** all M1 and M2a Global Constraints (`docs/plans/2026-10-21-m1-foundation.md`, `docs/plans/2026-10-22-m2a-review-and-editing.md`). In particular:
  - **Rendering:** Cache Components rules (runtime data, including `searchParams`, only inside `<Suspense>`)
  - **Engine key:** server-only
  - **Formatting:**
    - times in 12-hour format in the site's timezone (`site.timezone`), formatted on the server with `formatDateTime`
    - Latin digits
    - logical CSS
  - **Copy:** never "law firm"
  - **Changes:** made through server actions that check the role, validate with Zod, send `X-Acting-User` and the key, return `ActionResult`, and `refresh()` on success
  - **Buttons:** come from `post.actions`
  - **E2E isolation:** every e2e test isolates the mock store
- **No new packages.** Pinned versions stay as they are.
- **Action names:** the mock's names are `publishNow` (pending and approved posts), `hold` / `resume` (approved), `retry` (failed), plus M2a's `edit`, `approve`, `changes`, `reject`, `delete`.
  - The spec's example is `["approve","changes","reject","edit","publishNow"]`; `hold`, `resume` and `retry` are our names.
  - They're checked against the real engine at M5 and listed as a question in the follow-ups.
- **Photo upload:** goes browser → our server action (FormData) → engine (multipart).
  - `experimental.serverActions.bodySizeLimit` is `"6mb"` (`/meta.limits.photoMaxBytes` is 5 MB plus multipart overhead).
  - The **file type** is checked only by the engine, so its message is shown (spec §10).
  - The **size** is checked in the browser first, against `/meta.limits.photoMaxBytes`, never a hard-coded number.
  - *Known risk:* Vercel caps a function's request body at 4.5 MB. Recorded as a question for Quantum1st (a direct-upload URL).
- **Export** goes through a server action that returns the file's text. The browser saves it as a Blob, so the engine key never reaches the browser.
- **The photo's alt text and credit** are editable fields saved with Save, sent as `image: {alt, credit}` in the PUT body. The photo itself changes only through the image endpoints, which may bump the post's version. *Assumption, recorded for Quantum1st.*
- **New screens:**
  - Arabic titles render right to left
  - status, platform, target and language labels come from messages, with the raw value as fallback
  - counts use ICU plurals, with digits passed as a separate string argument `n` so they stay Latin

## Review Focus

1. **A publish retried after a timeout with the same key publishes once. A Retry after a definite `publish_failed` uses a new key**, otherwise the engine replays the failure forever.
   - *Pinned by:* the Task 2 mock tests (replay), the Task 4 key-memory tests, and the Task 8 History e2e (p_303 fails once, then a second Retry goes through).
2. **The photo endpoints may bump the post's version.** Picking a photo, then saving other fields, must not raise a false conflict; a save by someone else in between still must.
   - *Pinned by:* Task 5's draft tests and its e2e "after picking a photo, saving other fields doesn't conflict".
3. **Scheduled and History times show in the site's timezone, 12-hour, whatever the browser's zone.**
   - *Pinned by:* the Task 7 and Task 8 e2e tests, which expect "10:00" with "AM" for a 10:00 Dubai slot. The e2e browser runs in the machine's zone, not Dubai's.
4. **A malformed item from the engine in any list (Review, Scheduled, History) is skipped with a note**, and the rest of the page still shows.
   - *Pinned by:* the Task 1 client tests and the Task 8 e2e with the `drift` scenario.
5. **Arabic posts stay right to left on the new screens**, and an Arabic twin with `structure_mismatch` can't be published from the editor or in bulk.
   - *Pinned by:* the Task 6, Task 7 and Task 8 e2e tests.

## File map (new unless marked)

```
src/lib/engine/schemas.ts                 (modify) PostImage, Photo, Removed, PostUpdate.image, PostSummary.actions/image, parseItems, lenient Scheduled
src/lib/engine/client.ts                  (modify) multipart bodies, requestFile, shared retry loop
src/lib/engine/api.ts                     (modify) listPosts paging/sort/skipped, publish, hold, bulk actions, photos, export
src/lib/engine/mock/schedule.ts           Dubai publishing slots (Sun–Thu, 10:00 and 13:00)
src/lib/engine/mock/photos.ts             offline Pexels stand-ins (SVG data URLs)
src/lib/engine/mock/export.ts             export.html / export.md bodies (HTML page, Markdown)
src/lib/engine/mock/post-fixtures.ts      (modify) queue, history and Instagram seeds
src/lib/engine/mock/fixtures.ts           (modify) static Scheduled fixture removed (the store owns the queue)
src/lib/engine/mock/store.ts              (modify) queue, publish, hold, photos, export, actionsFor, sort
src/lib/engine/mock/server.ts             (modify) routes, multipart, file replies, "manual" / "crash" scenarios, drift items
src/lib/engine/index.ts                   (modify) "crash" mock scenario
src/lib/actions/idempotency.ts            key memory: same key only for the same request after no answer
src/lib/actions/use-engine-action.ts      (modify) uses the key memory; adds useEngineUpload
src/lib/actions/server.ts                 shared server-action helpers (role check + engine, change, input schemas)
src/app/[locale]/(app)/review/actions.ts  (modify) publish, hold, bulk actions, export; helpers moved out
src/app/[locale]/(app)/review/photo-actions.ts  search, pick, upload (FormData), remove
next.config.ts                            (modify) server action body limit
src/lib/editor/changed-fields.ts          (modify) image (alt, credit) field, toUpdate
src/lib/editor/draft.ts                   (modify) server snapshot, afterSave(post), withServerImage
src/components/editor/photo-panel.tsx     photo panel
src/components/editor/photo-picker.tsx    Pexels grid dialog
src/components/editor/export-buttons.tsx  Export HTML / Markdown
src/components/editor/action-bar.tsx      (modify) Publish now, lock-aware actions
src/components/editor/editor-footer.tsx   (modify) export, lock props
src/components/editor/post-editor.tsx     (modify) photo panel, toUpdate, live link, fresh-key lock heartbeat
src/components/editor/conflict-panel.tsx  (modify) shows the photo's alt/credit
src/app/[locale]/(app)/review/[postId]/page.tsx (modify) photo limits
src/lib/lists/paging.ts                   page from ?page=, page count
src/components/lists/pager.tsx            Previous / Page n of m / Next
src/components/lists/skipped-note.tsx     "1 item couldn't be shown"
src/components/review/review-queue.tsx    (modify) paging, skipped note
src/components/review/review-board.tsx    (modify) bulk Publish now
src/components/review/post-card.tsx       (modify) selectable for publishNow; plural counts
src/app/[locale]/(app)/review/page.tsx    (modify) passes searchParams
src/app/[locale]/(app)/scheduled/page.tsx Scheduled page
src/components/schedule/scheduled-queue.tsx  server: queue, banner
src/components/schedule/schedule-board.tsx   client: hold, resume, publish now, bulk
src/app/[locale]/(app)/history/page.tsx   History page
src/components/history/history-list.tsx   server: list, paging
src/components/history/history-board.tsx  client: entries, Retry
src/components/shell/nav.ts               (modify) scheduled, history
src/components/shell/service-banner.tsx   site-wide 401 banner
src/app/[locale]/(app)/layout.tsx         (modify) service banner
src/app/[locale]/(app)/error.tsx          error page
src/app/[locale]/sign-in/page.tsx         (modify) language switch
src/app/[locale]/no-access/page.tsx       (modify) language switch
messages/en.json, messages/ar.json        (modify)
tests/unit/*.test.ts, tests/e2e/*.spec.ts
```

---

### Task 1: Engine contract for M2b (schemas, multipart, file downloads, lenient lists)

**Files:**
- Modify: `src/lib/engine/schemas.ts`, `src/lib/engine/client.ts`, `src/lib/engine/api.ts`
- Test: `tests/unit/engine-client.test.ts` (append), `tests/unit/engine-lists.test.ts` (create)

**Interfaces:**
- Consumes: M1/M2a `createEngineClient`, `createEngineApi`, `PostSchema`, `EngineError`
- Produces:
  - **Schemas and types:**
    - `PostImageSchema` / `type PostImage = { url: string; alt?: string | null; credit?: string | null; source?: string | null; pexelsId?: number | null }`
    - `PhotoSchema` / `type Photo` (spec §4 Photo), `PhotosSchema`, `RemovedSchema`
    - `parseItems(items: unknown[], schema): { items; skipped: number }`
    - `PostUpdate.image?: { alt: string | null; credit: string | null }`
    - `PostSummary` gains `actions: string[]` and `image`
    - `Scheduled` is now `{ autoPublish; nextSlotAt?; waitingReason?; posts: PostSummary[]; skipped: number }`
  - **Client:**
    - `EngineRequest.form?: FormData`
    - `client.requestFile({ path, query? }): Promise<EngineFile>`, where `type EngineFile = { body: string; contentType: string; filename: string | null }`
  - **API:**
    - `listPosts({ statuses, page?, pageSize?, sort? }): Promise<{ posts: Post[]; skipped: number; meta }>`
    - `publishPost(id, ctx)`, `holdPost(id, hold, ctx)`
    - `BULK_ACTIONS` / `type BulkAction` (`approve | reject | delete | publishNow | hold | resume`), with `bulkPosts(action: BulkAction, …)`
    - `searchPhotos(query, page?)`
    - `pickPhoto(id, pexelsId, alt | undefined, ctx): Promise<PostImage>`
    - `uploadPhoto(id, { file: File; alt?; credit? }, ctx): Promise<PostImage>`
    - `removePhoto(id, ctx)`
    - `exportPost(id, "html" | "md"): Promise<EngineFile>`

- [ ] **Step 1: Write the failing client tests**

Append to `tests/unit/engine-client.test.ts` (it already defines `recorder`, `okJson`, `errJson`, `headersOf`, `Thing`, `config` and `failure`):

```ts
describe("engine client: uploads and files", () => {
  it("sends a photo upload as multipart, with no JSON content type", async () => {
    const { calls, fetch } = recorder([okJson({ id: "img" })]);
    const client = createEngineClient(config(fetch));
    const form = new FormData();
    form.set("file", new File(["png-bytes"], "photo.png", { type: "image/png" }));

    await client.request({ method: "POST", path: "/things", schema: Thing, form, actingUser: "sara@example.com", idempotencyKey: "key-1" });

    expect(calls[0].init.body).toBe(form);
    expect(headersOf(calls[0]).get("Content-Type")).toBeNull();
    expect(headersOf(calls[0]).get("Idempotency-Key")).toBe("key-1");
  });

  it("downloads a file as text, with the name from Content-Disposition", async () => {
    const { calls, fetch } = recorder([
      new Response("# Title\n", {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": "attachment; filename=\"commission.md\"; filename*=UTF-8''%D8%B9%D9%85%D9%88%D9%84%D8%A9.md",
        },
      }),
    ]);
    const client = createEngineClient(config(fetch));

    const file = await client.requestFile({ path: "/posts/p_1/export.md" });

    expect(file).toEqual({ body: "# Title\n", contentType: "text/markdown; charset=utf-8", filename: "عمولة.md" });
    expect(calls[0].url).toBe("https://api.example.com/api/v1/posts/p_1/export.md");
    expect(headersOf(calls[0]).get("X-Api-Key")).toBe("secret-key");
  });

  it("reports the engine's error for a failed download", async () => {
    const { fetch } = recorder([errJson(404, { code: "not_found", message: "This post no longer exists." })]);
    const client = createEngineClient(config(fetch));
    expect(await failure(client.requestFile({ path: "/posts/p_9/export.html" }))).toMatchObject({ status: 404, code: "not_found" });
  });

  it("retries a download after a network failure", async () => {
    const { calls, fetch } = recorder([new TypeError("fetch failed"), new Response("<h1>x</h1>", { headers: { "Content-Type": "text/html" } })]);
    const client = createEngineClient(config(fetch));
    expect((await client.requestFile({ path: "/posts/p_1/export.html" })).body).toBe("<h1>x</h1>");
    expect(calls).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Write the failing list and API tests**

```ts
// tests/unit/engine-lists.test.ts
import { describe, expect, it } from "vitest";
import { createEngineApi } from "@/lib/engine/api";
import { createEngineClient, type FetchLike } from "@/lib/engine/client";

const BASE = "https://api.example.com/api/v1";
const POST = {
  id: "p_1",
  kind: "blog",
  platform: "website",
  language: "en",
  status: "published",
  title: "One",
  createdAt: "2026-10-21T09:00:00+04:00",
  updatedAt: "2026-10-21T09:00:00+04:00",
  version: 1,
};
const ctx = { actingUser: "sara@example.com", idempotencyKey: "key-12345678" };

type Call = { method: string; path: string; search: string; body: unknown };

/** A fake engine that answers by "METHOD /path" and records what was sent. */
function fakeEngine(routes: Record<string, unknown>) {
  const calls: Call[] = [];
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
  const engine = createEngineApi(createEngineClient({ baseUrl: BASE, apiKey: "k", fetch, retryDelaysMs: [0, 0] }));
  return { engine, calls };
}

describe("lists keep the items they can read (Review Focus 4)", () => {
  it("skips a malformed post and counts it", async () => {
    const { engine } = fakeEngine({ "GET /sites/site_1/posts": [POST, { id: 5 }, { ...POST, id: "p_2" }] });
    const list = await engine.listPosts({ statuses: ["published"] });
    expect(list.posts.map((post) => post.id)).toEqual(["p_1", "p_2"]);
    expect(list.skipped).toBe(1);
    expect(list.meta?.total).toBe(3);
  });

  it("asks for the page and the sort order", async () => {
    const { engine, calls } = fakeEngine({ "GET /sites/site_1/posts": [] });
    await engine.listPosts({ statuses: ["published", "failed"], page: 2, pageSize: 25, sort: "-updated_at" });
    const query = new URLSearchParams(calls.at(-1)?.search);
    expect([query.get("status"), query.get("page"), query.get("pageSize"), query.get("sort")]).toEqual(["published,failed", "2", "25", "-updated_at"]);
  });

  it("skips a malformed post in the publishing queue", async () => {
    const queued = { ...POST, status: "approved", schedule: { hold: false, scheduledAt: null, position: 1 }, actions: ["hold", "publishNow"] };
    const { engine } = fakeEngine({
      "GET /sites/site_1/scheduled": { autoPublish: true, nextSlotAt: null, waitingReason: "queue_empty", posts: [queued, { title: 7 }] },
    });
    const scheduled = await engine.scheduled();
    expect(scheduled.posts.map((post) => [post.id, post.actions])).toEqual([["p_1", ["hold", "publishNow"]]]);
    expect(scheduled.skipped).toBe(1);
  });
});

describe("publishing, photo and export calls (spec v1.1 §7)", () => {
  it("publishes, holds and bulk-publishes", async () => {
    const { engine, calls } = fakeEngine({
      "POST /sites/site_1/posts/p_1/publish": POST,
      "POST /sites/site_1/posts/p_1/hold": POST,
      "POST /sites/site_1/posts/bulk": { done: ["p_1"], failed: [] },
    });
    await engine.publishPost("p_1", ctx);
    await engine.holdPost("p_1", true, ctx);
    await engine.bulkPosts("publishNow", ["p_1"], undefined, ctx);
    expect(calls.filter((call) => call.method === "POST").map((call) => [call.path, call.body])).toEqual([
      ["/sites/site_1/posts/p_1/publish", {}],
      ["/sites/site_1/posts/p_1/hold", { hold: true }],
      ["/sites/site_1/posts/bulk", { action: "publishNow", ids: ["p_1"] }],
    ]);
  });

  it("searches, picks, uploads and removes photos", async () => {
    const image = { url: "https://images.example/1.jpg", alt: "Court", credit: "Photo by A on Pexels", source: "pexels", pexelsId: 12 };
    const { engine, calls } = fakeEngine({
      "GET /sites/site_1/photos/search": [
        { pexelsId: 12, thumb: "t", full: "f", width: 4000, height: 2667, photographer: "A", photographerUrl: "u", alt: "Court" },
      ],
      "POST /sites/site_1/posts/p_1/image/pick": image,
      "POST /sites/site_1/posts/p_1/image": { ...image, source: "upload", pexelsId: null },
      "DELETE /sites/site_1/posts/p_1/image": { removed: true },
    });

    expect((await engine.searchPhotos("court building", 2))[0].pexelsId).toBe(12);
    const query = new URLSearchParams(calls.at(-1)?.search);
    expect([query.get("q"), query.get("page")]).toEqual(["court building", "2"]);

    await engine.pickPhoto("p_1", 12, "Court", ctx);
    expect(calls.at(-1)?.body).toEqual({ pexelsId: 12, alt: "Court" });

    const uploaded = await engine.uploadPhoto("p_1", { file: new File(["x"], "a.png", { type: "image/png" }), alt: "Court" }, ctx);
    expect(uploaded.source).toBe("upload");
    const form = calls.at(-1)?.body as FormData;
    expect((form.get("file") as File).name).toBe("a.png");
    expect(form.get("alt")).toBe("Court");

    await expect(engine.removePhoto("p_1", ctx)).resolves.toEqual({ removed: true });
  });

  it("exports a post as a file", async () => {
    const fetch: FetchLike = async (url) =>
      new URL(url).pathname.endsWith("/sites")
        ? Response.json({ ok: true, data: [{ id: "site_1" }] })
        : new Response("<h1>One</h1>", { headers: { "Content-Type": "text/html; charset=utf-8", "Content-Disposition": 'attachment; filename="one.html"' } });
    const engine = createEngineApi(createEngineClient({ baseUrl: BASE, apiKey: "k", fetch, retryDelaysMs: [0, 0] }));
    await expect(engine.exportPost("p_1", "html")).resolves.toEqual({ body: "<h1>One</h1>", contentType: "text/html; charset=utf-8", filename: "one.html" });
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `pnpm test tests/unit/engine-client.test.ts tests/unit/engine-lists.test.ts`

Expected: FAIL.
- `client.requestFile is not a function`
- the multipart test fails, because `body` is undefined
- `list.skipped` is undefined, and `scheduled.skipped` is undefined
- `engine.publishPost is not a function`

- [ ] **Step 4: Update the schemas**

In `src/lib/engine/schemas.ts`:

(a) Move the `list` helper and add `parseItems`, both directly after the `isoDateTime` constant (and delete the old `list` definition under "Posts"):

```ts
/** A list that may be missing or null in the response; always an array after parsing. */
const list = <T extends z.ZodType>(item: T) => z.array(item).nullish().transform((value) => value ?? []);

/** Parses list items one by one: an item the engine sent in an unexpected shape is skipped and counted, not fatal for the page. */
export function parseItems<T extends z.ZodType>(items: unknown[], schema: T): { items: z.output<T>[]; skipped: number } {
  const parsed: z.output<T>[] = [];
  let skipped = 0;
  for (const item of items) {
    const result = schema.safeParse(item);
    if (result.success) parsed.push(result.data);
    else skipped += 1;
  }
  return { items: parsed, skipped };
}
```

(b) Replace the whole `// ── Scheduled` block (`PostSummarySchema` … `export type Scheduled`) with:

```ts
// ── Photos (spec v1.1 §4 Post.image, Photo) ─────────────────────────────────
export const PostImageSchema = z.object({
  url: z.string(),
  alt: z.string().nullish(),
  credit: z.string().nullish(),
  source: z.string().nullish(), // known: pexels | upload
  pexelsId: z.number().nullish(),
});
export type PostImage = z.infer<typeof PostImageSchema>;

export const PhotoSchema = z.object({
  pexelsId: z.number(),
  thumb: z.string(),
  full: z.string(),
  width: z.number(),
  height: z.number(),
  photographer: z.string(),
  photographerUrl: z.string().nullish(),
  alt: z.string().nullish(),
});
export type Photo = z.infer<typeof PhotoSchema>;
export const PhotosSchema = z.array(PhotoSchema);
export const RemovedSchema = z.object({ removed: z.literal(true) });

// ── Scheduled (spec v1.1 §7 GET …/scheduled) ─────────────────────────────────
export const PostSummarySchema = z.object({
  id: z.string(),
  kind: z.string(),
  platform: z.string(),
  language: z.string(),
  status: z.string(),
  title: z.string(),
  image: PostImageSchema.nullish(),
  schedule: z
    .object({ hold: z.boolean(), scheduledAt: isoDateTime.nullish(), position: z.number().int().nullish() })
    .nullish(),
  updatedAt: isoDateTime,
  actions: list(z.string()),
});
export type PostSummary = z.output<typeof PostSummarySchema>;

export const ScheduledSchema = z
  .object({
    autoPublish: z.boolean(),
    nextSlotAt: isoDateTime.nullish(),
    waitingReason: z.string().nullish(),
    posts: z.array(z.unknown()),
  })
  .transform(({ posts, ...rest }) => {
    const parsed = parseItems(posts, PostSummarySchema);
    return { ...rest, posts: parsed.items, skipped: parsed.skipped };
  });
export type Scheduled = z.output<typeof ScheduledSchema>;
```

(c) In `PostSchema`, replace the inline `image: z.object({…}).nullish(),` with `image: PostImageSchema.nullish(),`.

(d) In `PostUpdateSchema`, add after `section`:

```ts
  // The photo's alt text and credit; the photo itself changes through the image endpoints (spec v1.1 §7).
  image: z.object({ alt: z.string().nullable(), credit: z.string().nullable() }).optional(),
```

- [ ] **Step 5: Add multipart bodies and file downloads to the client**

Replace `src/lib/engine/client.ts` with:

```ts
import { z } from "zod";
import { EngineError } from "./errors";
import { EnvelopeSchema, type ListMeta } from "./schemas";

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;
export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

export type EngineClientConfig = {
  baseUrl: string;
  apiKey: string;
  fetch: FetchLike;
  /** Delays between read retries; reads are tried retryDelaysMs.length + 1 times. */
  retryDelaysMs?: readonly number[];
  /** Per-attempt limit (request + body). A timed-out attempt counts as a network failure. */
  timeoutMs?: number;
};

type Query = Record<string, string | number | boolean | undefined>;

export type EngineRequest<S extends z.ZodType> = {
  method: HttpMethod;
  path: string; // starts with "/", relative to the base URL
  schema: S;
  query?: Query;
  body?: unknown;
  /** A multipart body (photo upload); fetch sets the Content-Type with its boundary. */
  form?: FormData;
  actingUser?: string;
  idempotencyKey?: string;
};

export type EngineResponse<T> = { data: T; meta: ListMeta | null };

/** A downloaded file (spec v1.1 §7 export.html / .md): the body is the file itself, not the JSON envelope. */
export type EngineFile = { body: string; contentType: string; filename: string | null };

const DEFAULT_RETRY_DELAYS_MS = [250, 750] as const;
const DEFAULT_TIMEOUT_MS = 10_000;

export function createEngineClient(config: EngineClientConfig) {
  const base = config.baseUrl.replace(/\/+$/, "");
  const retryDelays = config.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  function urlOf(path: string, query: Query | undefined): URL {
    const url = new URL(base + path);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    return url;
  }

  /** Runs attempts with a timeout each; network failures are retried `attempts - 1` times, engine answers never. */
  async function withRetries<T>(attempts: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await withTimeout(timeoutMs, run);
      } catch (error) {
        if (error instanceof EngineError) throw error;
        if (attempt >= attempts - 1) {
          throw new EngineError({
            status: 0,
            code: "network_error",
            message: "The content engine could not be reached. Try again shortly.",
          });
        }
        await sleep(retryDelays[attempt] ?? 0);
      }
    }
  }

  async function request<S extends z.ZodType>(req: EngineRequest<S>): Promise<EngineResponse<z.infer<S>>> {
    const url = urlOf(req.path, req.query);
    const headers: Record<string, string> = { "X-Api-Key": config.apiKey, Accept: "application/json" };
    if (req.actingUser) headers["X-Acting-User"] = req.actingUser;
    if (req.method !== "GET") headers["Idempotency-Key"] = req.idempotencyKey ?? crypto.randomUUID();

    let body: BodyInit | undefined;
    if (req.form) {
      body = req.form;
    } else if (req.body !== undefined) {
      headers["Content-Type"] = "application/json; charset=utf-8";
      body = JSON.stringify(req.body);
    }

    // Only reads are retried; a change is never repeated automatically (design §9).
    const attempts = req.method === "GET" ? retryDelays.length + 1 : 1;
    return withRetries(attempts, async (signal) => {
      const response = await config.fetch(url.toString(), { method: req.method, headers, body, cache: "no-store", signal });
      return parseResponse(response, req.schema);
    });
  }

  async function requestFile(req: { path: string; query?: Query }): Promise<EngineFile> {
    const url = urlOf(req.path, req.query);
    const headers = { "X-Api-Key": config.apiKey, Accept: "*/*" };
    return withRetries(retryDelays.length + 1, async (signal) => {
      const response = await config.fetch(url.toString(), { method: "GET", headers, cache: "no-store", signal });
      if (!response.ok) {
        await parseResponse(response, z.unknown()); // throws the engine's error from the JSON envelope
        throw new EngineError({ status: response.status, code: "invalid_response", message: "The content engine sent an unexpected answer." });
      }
      return {
        body: await response.text(),
        contentType: response.headers.get("Content-Type") ?? "application/octet-stream",
        filename: filenameOf(response.headers.get("Content-Disposition")),
      };
    });
  }

  return { request, requestFile };
}

export type EngineClient = ReturnType<typeof createEngineClient>;

async function parseResponse<S extends z.ZodType>(response: Response, schema: S): Promise<EngineResponse<z.infer<S>>> {
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new EngineError({
      status: response.status,
      code: "engine_unavailable",
      message: `The content engine returned an unreadable response (HTTP ${response.status}).`,
    });
  }

  const envelope = EnvelopeSchema.safeParse(json);
  if (!envelope.success) {
    throw new EngineError({
      status: response.status,
      code: "invalid_response",
      message: "The content engine sent a response in an unexpected format.",
    });
  }

  if (!envelope.data.ok) {
    const { code, message, fields, details } = envelope.data.error;
    throw new EngineError({ status: response.status, code, message, fields, details });
  }

  const data = schema.safeParse(envelope.data.data);
  if (!data.success) {
    throw new EngineError({
      status: response.status,
      code: "invalid_response",
      message: "The content engine sent data in an unexpected format.",
      details: { issues: z.prettifyError(data.error) },
    });
  }

  return { data: data.data, meta: envelope.data.meta ?? null };
}

/** The file name from Content-Disposition: filename*=UTF-8''… if present, else filename="…". */
function filenameOf(header: string | null): string | null {
  if (!header) return null;
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1]);
    } catch {
      // a malformed encoded name: fall back to the plain one
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain ? plain[1] : null;
}

/** Runs one attempt with an abort signal; rejects (and aborts) if it takes longer than `ms`. */
async function withTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`Engine request timed out after ${ms} ms`));
    }, ms);
  });
  try {
    return await Promise.race([run(controller.signal), timedOut]);
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

- [ ] **Step 6: Add the API methods**

In `src/lib/engine/api.ts`:

(a) Update the schema import to:

```ts
import {
  BulkResultSchema,
  CategoriesSchema,
  DeletedSchema,
  JobSchema,
  JobStartSchema,
  LockSchema,
  MetaSchema,
  parseItems,
  PhotosSchema,
  PlanSchema,
  PostImageSchema,
  PostSchema,
  ReleasedSchema,
  RemovedSchema,
  ScheduledSchema,
  SiteRefsSchema,
  SiteSchema,
  type PostUpdate,
} from "./schemas";
```

(b) After the `ChangeContext` type, add:

```ts
/** Bulk actions on posts (spec v1.1 §3 Bulk actions, §7 POST …/posts/bulk). */
export const BULK_ACTIONS = ["approve", "reject", "delete", "publishNow", "hold", "resume"] as const;
export type BulkAction = (typeof BULK_ACTIONS)[number];
```

(c) Replace `listPosts` with:

```ts
  async function listPosts(options: { statuses: string[]; page?: number; pageSize?: number; sort?: string }) {
    const { data, meta } = await client.request({
      method: "GET",
      path: `${await sitePath()}/posts`,
      schema: z.array(z.unknown()),
      query: { status: options.statuses.join(","), page: options.page, pageSize: options.pageSize, sort: options.sort },
    });
    const { items, skipped } = parseItems(data, PostSchema);
    return { posts: items, skipped, meta };
  }
```

(d) Change the `bulkPosts` signature's first parameter from `action: "approve" | "reject" | "delete"` to `action: BulkAction`.

(e) Before `const job = …`, add:

```ts
  const publishPost = async (id: string, ctx: ChangeContext) =>
    (await client.request({ method: "POST", path: await postPath(id, "/publish"), schema: PostSchema, body: {}, ...ctx })).data;

  const holdPost = async (id: string, hold: boolean, ctx: ChangeContext) =>
    (await client.request({ method: "POST", path: await postPath(id, "/hold"), schema: PostSchema, body: { hold }, ...ctx })).data;

  const searchPhotos = async (query: string, page = 1) =>
    (await client.request({ method: "GET", path: `${await sitePath()}/photos/search`, schema: PhotosSchema, query: { q: query, page } })).data;

  const pickPhoto = async (id: string, pexelsId: number, alt: string | undefined, ctx: ChangeContext) =>
    (await client.request({ method: "POST", path: await postPath(id, "/image/pick"), schema: PostImageSchema, body: { pexelsId, alt }, ...ctx }))
      .data;

  async function uploadPhoto(id: string, upload: { file: File; alt?: string; credit?: string }, ctx: ChangeContext) {
    const form = new FormData();
    form.set("file", upload.file);
    if (upload.alt) form.set("alt", upload.alt);
    if (upload.credit) form.set("credit", upload.credit);
    return (await client.request({ method: "POST", path: await postPath(id, "/image"), schema: PostImageSchema, form, ...ctx })).data;
  }

  const removePhoto = async (id: string, ctx: ChangeContext) =>
    (await client.request({ method: "DELETE", path: await postPath(id, "/image"), schema: RemovedSchema, ...ctx })).data;

  const exportPost = async (id: string, format: "html" | "md") => client.requestFile({ path: await postPath(id, `/export.${format}`) });
```

(f) Add the new methods to the returned object (after `bulkPosts`): `publishPost, holdPost, searchPhotos, pickPhoto, uploadPhoto, removePhoto, exportPost,`.

(g) Keep M1's static queue fixture compiling until Task 2 replaces it. In `src/lib/engine/mock/fixtures.ts`:
- add `actions: []` to each of the three `SCHEDULED_POSTS` entries
- add `skipped: 0` to the object `mockScheduled()` returns

The client ignores the extra JSON field.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm test && pnpm typecheck`

Expected: unit PASS (154 + 10 = 164), typecheck exit 0. `review-queue.tsx` still reads `list.data.posts` and `list.data.meta`, and the dashboard reads only `autoPublish`/`nextSlotAt`/`waitingReason` from `scheduled`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/engine tests/unit/engine-client.test.ts tests/unit/engine-lists.test.ts
git commit -m "feat: engine contract for photos, publishing, export and lenient lists"
```

---
### Task 2: Mock engine: the publishing queue, publishing and history

**Files:**
- Create: `src/lib/engine/mock/schedule.ts`
- Modify:
  - `src/lib/engine/mock/post-fixtures.ts`, `src/lib/engine/mock/fixtures.ts`
  - `src/lib/engine/mock/store.ts`, `src/lib/engine/mock/server.ts`
  - `tests/e2e/helpers.ts`, `tests/e2e/review.spec.ts`
  - `tests/unit/engine-mock.test.ts`, `tests/unit/mock-store.test.ts`
- Test: `tests/unit/mock-store.test.ts` (append), `tests/unit/engine-posts.test.ts` (append), `tests/unit/mock-schedule.test.ts` (create)

**Interfaces:**
- Consumes: Task 1 `Scheduled`, `BulkAction` names; M2a `createMockStore`, `approvalMode`
- Produces:
  - **Slot calendar:** `slotTimes(count): string[]`. Dubai slots, Sunday to Thursday at 10:00 and 13:00, from Thursday 22 Oct 2026, as ISO strings with `+04:00`.
  - **Seeds:**
    - the queue: p_101 (EN), p_102 (AR twin), p_103 (LinkedIn, on hold)
    - history:
      - p_301: published; override reason "Length agreed with the client"
      - p_302: published on LinkedIn
      - p_303: failed; its next publish fails once more, then succeeds
      - p_304: rejected
    - p_209: pending Instagram post without a photo
    - `SEED_QUEUE`, `SEED_FAILING_PUBLISH`
  - **Store:**
    - `store.scheduled(autoPublish, pageSize | null)`, `store.publish(id, actor)`, `store.hold(id, hold, actor)`
    - `store.bulk` also takes `publishNow | hold | resume`
    - `store.listPosts(statuses, page, pageSize, sort?)` (sort `-updated_at`)
  - **Actions by status:**
    - pending: `edit, approve, changes, reject, delete, publishNow`
    - approved: `hold` or `resume`, `publishNow`, `delete`
    - failed: `retry, delete`
    - rejected: `delete`
  - **Approval rule:** approving or publishing an Instagram post without a photo is refused with 400 `invalid_input`, `fields.image`.
  - **Mock scenario `manual`:** auto-publish is off on `/scheduled`.

- [ ] **Step 1: Write the failing slot-calendar test**

```ts
// tests/unit/mock-schedule.test.ts
import { describe, expect, it } from "vitest";
import { slotTimes } from "@/lib/engine/mock/schedule";

describe("the mock's publishing slots (Fakher & Co: 2 a day, Sunday to Thursday)", () => {
  it("publishes at 10:00 and 13:00 Dubai time and skips Friday and Saturday", () => {
    expect(slotTimes(5)).toEqual([
      "2026-10-22T10:00:00+04:00",
      "2026-10-22T13:00:00+04:00",
      "2026-10-25T10:00:00+04:00",
      "2026-10-25T13:00:00+04:00",
      "2026-10-26T10:00:00+04:00",
    ]);
  });
});
```

- [ ] **Step 2: Write the failing store tests**

Append to `tests/unit/mock-store.test.ts` (it defines `ME`, `t`, `store`, `data` and `update`):

```ts
describe("the publishing queue (spec v1.1 §6 /scheduled)", () => {
  const queue = (autoPublish = true) =>
    data(store.scheduled(autoPublish, null)).posts.map((post) => [post.id, post.schedule?.position, post.schedule?.hold, post.schedule?.scheduledAt]);

  it("lists approved posts in queue order with Dubai times; a held post keeps its place without a time", () => {
    expect(queue()).toEqual([
      ["p_101", 1, false, "2026-10-22T10:00:00+04:00"],
      ["p_102", 2, false, "2026-10-22T13:00:00+04:00"],
      ["p_103", 3, true, null],
    ]);
    expect(data(store.scheduled(true, null))).toMatchObject({ autoPublish: true, nextSlotAt: "2026-10-22T10:00:00+04:00", waitingReason: null });
  });

  it("with auto-publish off, nothing has a time and there is no next slot", () => {
    expect(queue(false).map((row) => row[3])).toEqual([null, null, null]);
    expect(data(store.scheduled(false, null))).toMatchObject({ autoPublish: false, nextSlotAt: null });
  });

  it("approving puts a post at the end of the queue", () => {
    data(store.approve("p_201", undefined, ME));
    expect(queue().at(-1)).toEqual(["p_201", 4, false, "2026-10-25T10:00:00+04:00"]);
  });

  it("holding a post moves the next one up; resuming puts it back", () => {
    data(store.hold("p_101", true, ME));
    expect(queue().slice(0, 2)).toEqual([
      ["p_101", 1, true, null],
      ["p_102", 2, false, "2026-10-22T10:00:00+04:00"],
    ]);
    data(store.hold("p_101", false, ME));
    expect(queue()[0]).toEqual(["p_101", 1, false, "2026-10-22T10:00:00+04:00"]);
  });

  it("only approved posts can be held", () => {
    expect(store.hold("p_201", true, ME)).toMatchObject({ ok: false, status: 422, code: "invalid_input" });
  });
});

describe("publishing (spec v1.1 §5: approved → published, publish error → failed)", () => {
  it("publish now publishes an approved post, takes it out of the queue and leaves its twin alone", () => {
    const published = data(store.publish("p_101", ME));
    expect(published).toMatchObject({
      status: "published",
      published: { target: "wordpress", url: "https://fakhernco.com/commission-payable-uae-labour-law-guide/" },
      actions: [],
    });
    expect(data(store.scheduled(true, null)).posts.map((post) => post.id)).toEqual(["p_102", "p_103"]);
    expect(data(store.getPost("p_102")).status).toBe("approved");
  });

  it("publishing straight from review needs what approval needs", () => {
    expect(store.publish("p_203", ME)).toMatchObject({ ok: false, status: 422, code: "framework_blocked" });
    expect(store.publish("p_205", ME)).toMatchObject({ ok: false, status: 422, code: "framework_blocked" });
    expect(data(store.publish("p_201", ME)).status).toBe("published");
  });

  it("an Instagram post can't be approved or published without a photo", () => {
    for (const outcome of [store.approve("p_209", undefined, ME), store.publish("p_209", ME)]) {
      expect(outcome).toMatchObject({ ok: false, status: 400, code: "invalid_input", fields: { image: expect.any(String) } });
    }
  });

  it("a publish the website refuses marks the post failed; the next attempt goes through", () => {
    expect(store.publish("p_303", ME)).toMatchObject({ ok: false, status: 502, code: "publish_failed" });
    expect(data(store.getPost("p_303"))).toMatchObject({ status: "failed", actions: ["retry", "delete"] });
    expect(data(store.publish("p_303", ME))).toMatchObject({ status: "published", error: null });
  });

  it("bulk publish, hold and resume report what they couldn't do", () => {
    expect(data(store.bulk("publishNow", ["p_101", "p_203"], undefined, ME))).toEqual({
      done: ["p_101"],
      failed: [{ id: "p_203", code: "framework_blocked", message: expect.any(String) }],
    });
    expect(data(store.bulk("hold", ["p_102"], undefined, ME)).done).toEqual(["p_102"]);
    expect(data(store.bulk("resume", ["p_102"], undefined, ME)).done).toEqual(["p_102"]);
  });

  it("history lists published, failed and rejected posts, newest first", () => {
    const ids = () => data(store.listPosts(["published", "failed", "rejected"], 1, 25, "-updated_at")).items.map((post) => post.id);
    expect(ids()).toEqual(["p_303", "p_302", "p_301", "p_304"]);
    data(store.publish("p_201", ME));
    expect(ids()[0]).toBe("p_201");
  });
});
```

In the existing test "lists posts without their content, with paging meta", change the expected ids to include the new pending Instagram post:

```ts
    expect(page.items.map((p) => p.id)).toEqual(["p_201", "p_202", "p_203", "p_204", "p_205", "p_206", "p_207", "p_208", "p_209"]);
```

- [ ] **Step 3: Write the failing API-over-mock tests**

Append to `tests/unit/engine-posts.test.ts` (it defines `setup`, `ctx` and `failure`):

```ts
describe("publishing over the mock engine (spec v1.1 §10: one publication per key)", () => {
  it("publishing again with the same key returns the first result instead of publishing twice", async () => {
    const { engine } = setup();
    const key = { actingUser: "reviewer@example.com", idempotencyKey: "publish-p_101-once" };
    const first = await engine.publishPost("p_101", key);
    const again = await engine.publishPost("p_101", key);
    expect(again).toEqual(first);
    expect((await engine.post("p_101")).version).toBe(first.version);
    const published = await engine.listPosts({ statuses: ["published"] });
    expect(published.posts.filter((post) => post.id === "p_101")).toHaveLength(1);
  });

  it("after publish_failed the same key replays the failure; a new key tries again (design §9)", async () => {
    const { engine } = setup();
    const key = ctx();
    expect((await failure(engine.publishPost("p_303", key))).code).toBe("publish_failed");
    expect((await failure(engine.publishPost("p_303", key))).code).toBe("publish_failed");
    expect((await engine.publishPost("p_303", ctx())).status).toBe("published");
  });

  it("serves the queue from the store, with hold", async () => {
    const { engine } = setup();
    await engine.holdPost("p_101", true, ctx());
    const queue = await engine.scheduled();
    expect(queue.posts.map((post) => [post.id, post.schedule?.hold, post.schedule?.scheduledAt])).toEqual([
      ["p_101", true, null],
      ["p_102", false, "2026-10-22T10:00:00+04:00"],
      ["p_103", true, null],
    ]);
    expect(queue.skipped).toBe(0);
  });
});
```

- [ ] **Step 4: Run them to verify they fail**

Run: `pnpm test tests/unit/mock-schedule.test.ts tests/unit/mock-store.test.ts tests/unit/engine-posts.test.ts`

Expected: FAIL.
- `@/lib/engine/mock/schedule` can't be resolved
- `store.scheduled is not a function`, `store.publish is not a function`
- the pending ids lack `p_209`

- [ ] **Step 5: Add the slot calendar**

```ts
// src/lib/engine/mock/schedule.ts
/** Fakher & Co's mock publishing settings: 2 a day, Sunday to Thursday, at 10:00 and 13:00 Dubai time (UTC+4, no DST). */
const DUBAI_OFFSET_MS = 4 * 3_600_000;
const FIRST_DAY = Date.UTC(2026, 9, 22); // Thursday 22 Oct 2026, as a Dubai calendar date at UTC midnight
const SLOT_HOURS = [10, 13];
const PUBLISHING_DAYS = new Set([0, 1, 2, 3, 4]); // Sunday … Thursday

export function toDubaiIso(ms: number): string {
  return `${new Date(ms + DUBAI_OFFSET_MS).toISOString().slice(0, 19)}+04:00`;
}

/** The first `count` publishing slots of the mock queue, as ISO times with Dubai's offset. */
export function slotTimes(count: number): string[] {
  const slots: string[] = [];
  for (let day = 0; slots.length < count; day++) {
    const date = FIRST_DAY + day * 86_400_000;
    if (!PUBLISHING_DAYS.has(new Date(date).getUTCDay())) continue;
    for (const hour of SLOT_HOURS) {
      if (slots.length < count) slots.push(toDubaiIso(date + hour * 3_600_000 - DUBAI_OFFSET_MS));
    }
  }
  return slots;
}
```

- [ ] **Step 6: Add the seeds**

In `src/lib/engine/mock/post-fixtures.ts`:

(a) After `SEED_DRAFTING_POST_ID`, add:

```ts
/** Approved posts, in queue order (spec v1.1 §6 /scheduled). */
export const SEED_QUEUE = ["p_101", "p_102", "p_103"];
/** A failed post whose next publish is refused once more by the website, then goes through (design §9 Retry). */
export const SEED_FAILING_PUBLISH = ["p_303"];
```

(b) After the `EVICTION_AR` constant, add:

```ts
const QUEUED_EN = "<h2>When the commission is earned</h2><p>The plan, the triggering event and the payment date decide it.</p>";
const QUEUED_AR = "<h2>متى تُستحق العمولة</h2><p>يحدد ذلك النظام والواقعة المنشئة للحق وموعد السداد.</p>";
const PROBATION_EN = "<h2>How long probation lasts</h2><p>Probation can't exceed six months, and the contract must say how long it is.</p>";
```

(c) At the end of the array returned by `seedPosts()` (after the `p_208` entry), add:

```ts
    post({
      id: "p_209",
      kind: "social",
      platform: "instagram",
      language: "en",
      status: "pending",
      title: "Three checks before you sign an off-plan contract",
      content: "Check the escrow account, the completion date and the developer's registration before you sign.",
      hashtags: ["#DubaiProperty", "#OffPlan"],
      photoIdea: "keys and a signed contract on a desk",
    }),
    post({
      id: "p_101",
      kind: "blog",
      platform: "website",
      language: "en",
      status: "approved",
      pairId: "p_102",
      title: "When does a commission become payable under UAE Labour Law?",
      slug: "commission-payable-uae-labour-law-guide",
      metaTitle: "When Is Commission Payable in the UAE?",
      metaDescription: "How the contract, the commission plan and the payment date decide when a commission is owed.",
      keywords: ["commission uae labour law"],
      section: "labour-law",
      content: QUEUED_EN,
      reviewedBy: "omar@example.com",
      schedule: { hold: false, scheduledAt: null, position: null },
    }),
    post({
      id: "p_102",
      kind: "blog",
      platform: "website",
      language: "ar",
      status: "approved",
      pairId: "p_101",
      title: "متى تستحق العمولة وفق قانون العمل الإماراتي؟",
      slug: "commission-payable-uae-labour-law-guide-ar",
      keywords: ["العمولة قانون العمل الإماراتي"],
      section: "labour-law",
      content: QUEUED_AR,
      reviewedBy: "omar@example.com",
      schedule: { hold: false, scheduledAt: null, position: null },
    }),
    post({
      id: "p_103",
      kind: "social",
      platform: "linkedin",
      language: "en",
      status: "approved",
      title: "Commission rights after resignation",
      content: "Resigning doesn't cancel a commission you've already earned.",
      hashtags: ["#UAELabourLaw"],
      reviewedBy: "omar@example.com",
      schedule: { hold: true, scheduledAt: null, position: null },
    }),
    post({
      id: "p_301",
      kind: "blog",
      platform: "website",
      language: "en",
      status: "published",
      title: "Probation periods under the UAE Labour Law",
      slug: "probation-period-uae-labour-law",
      keywords: ["probation period uae"],
      section: "labour-law",
      content: PROBATION_EN,
      overrideReason: "Length agreed with the client",
      reviewedBy: "omar@example.com",
      published: { target: "wordpress", url: "https://fakhernco.com/probation-period-uae-labour-law/", externalId: "8840", at: "2026-10-19T10:00:00+04:00" },
      updatedAt: "2026-10-19T10:00:00+04:00",
    }),
    post({
      id: "p_302",
      kind: "social",
      platform: "linkedin",
      language: "en",
      status: "published",
      title: "Notice periods: what an employer must give",
      content: "A notice period of at least 30 days applies to both sides, unless the contract says more.",
      hashtags: ["#UAELabourLaw"],
      reviewedBy: "omar@example.com",
      published: {
        target: "linkedin",
        url: "https://www.linkedin.com/feed/update/urn:li:share:7001",
        externalId: "urn:li:share:7001",
        at: "2026-10-20T13:00:00+04:00",
      },
      updatedAt: "2026-10-20T13:00:00+04:00",
    }),
    post({
      id: "p_303",
      kind: "blog",
      platform: "website",
      language: "en",
      status: "failed",
      title: "End-of-service gratuity for part-time employees",
      slug: "gratuity-part-time-employees-uae",
      keywords: ["gratuity part time uae"],
      section: "labour-law",
      content: "<h2>Who qualifies</h2><p>Part-time employees earn gratuity in proportion to the hours they work.</p>",
      error: "WordPress refused the request: 503 Service Unavailable.",
      reviewedBy: "omar@example.com",
      updatedAt: "2026-10-20T16:00:00+04:00",
    }),
    post({
      id: "p_304",
      kind: "blog",
      platform: "website",
      language: "en",
      status: "rejected",
      title: "Five myths about free zone licences",
      content: "<p>Free zone licences come with rules that are often misunderstood.</p>",
      reviewNote: "Off-topic for this quarter",
      reviewedBy: "omar@example.com",
      updatedAt: "2026-10-18T12:00:00+04:00",
    }),
```

(d) In `src/lib/engine/mock/fixtures.ts`, delete the `SCHEDULED_POSTS` constant and the `mockScheduled` function (the store owns the queue now), and drop `PostSummary` and `Scheduled` from its type import.

- [ ] **Step 7: Add the queue, publishing and history to the store**

In `src/lib/engine/mock/store.ts`:

(a) Update the imports:

```ts
import { approvalMode } from "@/lib/posts/rules";
import type { BulkResult, Category, Job, Post } from "../schemas";
import { mockMeta } from "./fixtures";
import { SEED_DRAFTING_POST_ID, SEED_FAILING_PUBLISH, SEED_QUEUE, seedPosts } from "./post-fixtures";
import { computeFindings, seoScore, toNeutralHtml } from "./rules";
import { slotTimes } from "./schedule";
```

(b) Replace the `ACTIONS_BY_STATUS` constant with:

```ts
/** What a post's buttons may do (spec v1.1 §5: the API returns post.actions; the portal never works it out). */
function actionsFor(post: Post): string[] {
  switch (post.status) {
    case "pending":
      return ["edit", "approve", "changes", "reject", "delete", "publishNow"];
    case "approved":
      return [post.schedule?.hold ? "resume" : "hold", "publishNow", "delete"];
    case "failed":
      return ["retry", "delete"];
    case "rejected":
      return ["delete"];
    default:
      return [];
  }
}

type QueueEntry = { hold: boolean; scheduledAt: string | null; position: number };
```

(c) Inside `createMockStore`, after `let sequence = 0;`, add:

```ts
  const queue: string[] = [];
  const failNextPublish = new Set<string>();
```

(d) Replace `view` with:

```ts
  function view(post: Post): Post {
    const twin = twinOf(post);
    return structuredClone({
      ...post,
      twin: twin ? { id: twin.id, language: twin.language, status: twin.status } : null,
      schedule: post.status === "approved" ? (queueSchedule(true).get(post.id) ?? null) : null,
      actions: actionsFor(post),
    });
  }

  /** Positions and expected times of the approved queue: a held post keeps its place but gets no time. */
  function queueSchedule(autoPublish: boolean): Map<string, QueueEntry> {
    const queued = queue.map((id) => posts.get(id)).filter((post): post is Post => post?.status === "approved");
    const times = autoPublish ? slotTimes(queued.filter((post) => !post.schedule?.hold).length) : [];
    const plan = new Map<string, QueueEntry>();
    let slot = 0;
    queued.forEach((post, index) => {
      const hold = post.schedule?.hold ?? false;
      plan.set(post.id, { hold, scheduledAt: hold ? null : (times[slot++] ?? null), position: index + 1 });
    });
    return plan;
  }

  function dequeue(id: string): void {
    const index = queue.indexOf(id);
    if (index >= 0) queue.splice(index, 1);
  }

  /** Spec v1.1 §4 Post.image: an Instagram post can't be approved or published without a photo. */
  function missingPhoto(post: Post): MockFail | null {
    return post.platform === "instagram" && !post.image
      ? fail(400, "invalid_input", "An Instagram post needs a photo.", { fields: { image: "Add a photo first." } })
      : null;
  }

  /** Why a post can't be approved (or published straight from review), or null. */
  function approvalRefusal(post: Post, overrideReason: string | undefined): MockFail | null {
    const critical = post.findings.filter((f) => f.level === "critical");
    const mode = approvalMode(post.findings);
    if (mode === "blocked") {
      const locked = critical.filter((f) => f.overridable === false);
      return fail(422, "framework_blocked", `Not approved — ${locked.length} rule(s) can't be overridden.`, { details: { findings: locked } });
    }
    if (mode === "override" && !overrideReason?.trim()) {
      return fail(422, "framework_blocked", `Not approved — ${critical.length} framework rule(s) to fix.`, { details: { findings: critical } });
    }
    return missingPhoto(post);
  }
```

(e) Replace `listPosts` with:

```ts
  function listPosts(statuses: string[] | null, page: number, pageSize: number, sort: string | null = null) {
    tick();
    let all = [...posts.values()].filter((post) => !statuses || statuses.includes(post.status));
    if (sort === "-updated_at") all = [...all].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    const start = (page - 1) * pageSize;
    const items = all.slice(start, start + pageSize).map((post) => {
      const item = view(post);
      delete item.content;
      return item;
    });
    return ok({ items, meta: { page, pageSize, total: all.length } });
  }
```

(f) In `updatePost`, replace `if (!(ACTIONS_BY_STATUS[post.status] ?? []).includes("edit")) {` with `if (!actionsFor(post).includes("edit")) {`.

(g) Replace `approve` with:

```ts
  function approve(id: string, overrideReason: string | undefined, actor: string): MockOutcome<Post> {
    const guarded = guard(id, actor);
    if (!guarded.ok) return guarded;
    const post = guarded.data;
    if (post.status !== "pending") return fail(422, "invalid_input", "Only posts waiting for review can be approved.");
    const refusal = approvalRefusal(post, overrideReason);
    if (refusal) return refusal;
    post.status = "approved";
    post.reviewedBy = actor;
    post.overrideReason = approvalMode(post.findings) === "override" ? (overrideReason?.trim() ?? null) : null;
    post.schedule = { hold: false, scheduledAt: null, position: null };
    queue.push(id);
    touch(post);
    return ok(view(post));
  }
```

(h) In `remove`, after `posts.delete(id);`, add `dequeue(id);`.

(i) After `takeover`, add:

```ts
  /** Where the mock "publishes": the WordPress site (Arabic under /ar/, TranslatePress) or the LinkedIn page. */
  function publication(post: Post): NonNullable<Post["published"]> {
    const n = ++sequence;
    const at = iso(now());
    if (post.platform === "website") {
      const path = `${post.language === "ar" ? "/ar" : ""}/${post.slug ?? post.id}/`;
      return { target: "wordpress", url: `https://fakhernco.com${path}`, externalId: String(9000 + n), at };
    }
    const share = `urn:li:share:${7000 + n}`;
    return { target: post.platform, url: `https://www.linkedin.com/feed/update/${share}`, externalId: share, at };
  }

  function publish(id: string, actor: string): MockOutcome<Post> {
    const guarded = guard(id, actor);
    if (!guarded.ok) return guarded;
    const post = guarded.data;
    const allowed = actionsFor(post);
    if (!allowed.includes("publishNow") && !allowed.includes("retry")) {
      return fail(422, "invalid_input", "This post can't be published in its current status.");
    }
    const refusal = post.status === "pending" ? approvalRefusal(post, undefined) : missingPhoto(post);
    if (refusal) return refusal;
    if (post.platform === "instagram") return fail(422, "not_connected", "Instagram isn't connected. An admin can connect it in Settings.");
    if (failNextPublish.delete(id)) {
      post.status = "failed";
      post.error = "WordPress refused the request: 503 Service Unavailable.";
      touch(post);
      return fail(502, "publish_failed", post.error);
    }
    post.status = "published";
    post.error = null;
    post.reviewedBy ??= actor;
    post.schedule = null;
    post.published = publication(post);
    dequeue(id);
    touch(post);
    return ok(view(post));
  }

  function hold(id: string, held: boolean, actor: string): MockOutcome<Post> {
    const guarded = guard(id, actor);
    if (!guarded.ok) return guarded;
    const post = guarded.data;
    if (post.status !== "approved") return fail(422, "invalid_input", "Only approved posts in the queue can be held or resumed.");
    post.schedule = { hold: held, scheduledAt: null, position: null };
    touch(post);
    return ok(view(post));
  }

  /** GET …/scheduled: the queue with positions and times; with auto-publish off, nothing has a time. */
  function scheduled(autoPublish: boolean, pageSize: number | null) {
    tick();
    const plan = queueSchedule(autoPublish);
    const items = [...plan].map(([id, schedule]) => {
      const item = view(posts.get(id) as Post);
      delete item.content;
      return { ...item, schedule };
    });
    const next = [...plan.values()].find((entry) => entry.scheduledAt)?.scheduledAt ?? null;
    return ok({
      autoPublish,
      nextSlotAt: next,
      waitingReason: autoPublish && !next ? "queue_empty" : null,
      posts: pageSize ? items.slice(0, pageSize) : items,
    });
  }
```

(j) Replace `bulk` with:

```ts
  function bulk(action: string, ids: string[], note: string | undefined, actor: string): MockOutcome<BulkResult> {
    const handlers: Record<string, (id: string) => MockOutcome<unknown>> = {
      approve: (id) => approve(id, undefined, actor),
      reject: (id) => reject(id, note, actor),
      delete: (id) => remove(id, actor),
      publishNow: (id) => publish(id, actor),
      hold: (id) => hold(id, true, actor),
      resume: (id) => hold(id, false, actor),
    };
    const apply = Object.hasOwn(handlers, action) ? handlers[action] : undefined;
    if (!apply) return fail(400, "invalid_input", `Unknown bulk action: ${action}.`, { fields: { action: "Unknown" } });
    const result: BulkResult = { done: [], failed: [] };
    for (const id of ids) {
      const outcome = apply(id);
      if (outcome.ok) result.done.push(id);
      else result.failed.push({ id, code: outcome.code, message: outcome.message });
    }
    return ok(result);
  }
```

(k) After the seeding loop (`for (const seeded of posts.values()) refreshFindings(seeded);`), add:

```ts
  queue.push(...SEED_QUEUE);
  for (const id of SEED_FAILING_PUBLISH) failNextPublish.add(id);
```

(l) Add `publish, hold, scheduled,` to the returned object.

- [ ] **Step 8: Route the queue and publishing in the mock server**

In `src/lib/engine/mock/server.ts`:

(a) Change the fixtures import to `import { MOCK_SITE_ID, mockMeta, mockPlan, mockSite } from "./fixtures";`.

(b) Replace the scenario list with:

```ts
/** normal · unauthorized (revoked key) · down (unreachable) · drift (changed shapes) · manual (auto-publish off). */
export type MockScenario = "normal" | "unauthorized" | "down" | "drift" | "manual";
const MOCK_SCENARIOS: readonly MockScenario[] = ["normal", "unauthorized", "down", "drift", "manual"];
```

(c) Replace the `/scheduled` branch with:

```ts
  if (method === "GET" && rest === "/scheduled") {
    const pageSize = Number(url.searchParams.get("pageSize")) || null;
    return outcome(store.scheduled(scenario !== "manual", pageSize));
  }
```

(d) In the `/posts` GET branch, pass the sort: `const listed = store.listPosts(statuses, page, pageSize, url.searchParams.get("sort"));`.

(e) Replace the post route regex line with `const postRoute = /^\/posts\/([^/]+)(\/.*)?$/.exec(rest);` and add, after the `/takeover` line:

```ts
    if (action === "/publish" && method === "POST") return outcome(store.publish(id, actor));
    if (action === "/hold" && method === "POST") return outcome(store.hold(id, body.hold === true, actor));
```

- [ ] **Step 9: Update the tests the new seeds and the removed fixture touch**

(a) `tests/unit/engine-mock.test.ts`:
- Change the fixtures import to `import { MOCK_SITE_ID, mockMeta, mockPlan, mockSite } from "@/lib/engine/mock/fixtures";`.
- Add `import { seedPosts } from "@/lib/engine/mock/post-fixtures";`.
- Remove `ScheduledSchema` from the schemas import.
- Delete the line `expect(ScheduledSchema.safeParse(mockScheduled()).success).toBe(true);`.
- Change the "law firm" assertion to `expect(JSON.stringify([mockSite(), mockPlan(), seedPosts()]).toLowerCase()).not.toContain("law firm");`.

(b) `tests/e2e/review.spec.ts`: change `"8 of 8 posts"` to `"9 of 9 posts"`.

(c) `tests/e2e/helpers.ts`: change the `setMockScenario` scenario type to `"normal" | "unauthorized" | "down" | "drift" | "manual" | "crash"` ("crash" is added to the engine in Task 9).

- [ ] **Step 10: Run the tests to verify they pass**

Run: `pnpm test && pnpm typecheck && pnpm e2e`

Expected:
- **unit:** PASS, 164 + 15 = 179
- **typecheck:** exit 0
- **e2e:** PASS (46). The dashboard's next slot is still 22 Oct, 10:00, from p_101, and the review list shows 9 of 9.

- [ ] **Step 11: Commit**

```bash
git add src/lib/engine tests
git commit -m "feat: mock engine publishing queue with Dubai slots, hold/resume, publish now, retry and history seeds"
```

---

### Task 3: Mock engine: photos, uploads and export

**Files:**
- Create: `src/lib/engine/mock/photos.ts`, `src/lib/engine/mock/export.ts`
- Modify: `src/lib/engine/mock/store.ts`, `src/lib/engine/mock/server.ts`
- Test: `tests/unit/mock-store.test.ts` (append), `tests/unit/engine-posts.test.ts` (append)

**Interfaces:**
- Consumes: Task 1 `Photo`, `PostImage`, `PostUpdate.image`, `uploadPhoto`/`exportPost`; Task 2 `actionsFor`
- Produces:
  - **Mock helpers:**
    - `searchMockPhotos(query, page): Photo[]`: 6 deterministic photos per page; SVG data URLs, so no network is used
    - `exportHtml(post)`, `exportMarkdown(post)`, `htmlToMarkdown(html)`
  - **Store:**
    - `store.searchPhotos(query, page)`
    - `store.pickPhoto(id, pexelsId, alt, actor)`: credit is "Photo by {photographer} on Pexels"; bumps the version
    - `store.uploadPhoto(id, file | null, alt, credit, actor)`, where `type UploadedFile = { name; type; size; dataUrl }`
      - a type not in `photoTypes` → 400 "Only JPEG, PNG or WebP photos can be uploaded."
      - larger than `photoMaxBytes` → 400 "The photo is larger than 5 MB."
    - `store.removePhoto(id, actor)`
    - `store.exportPost(id, "html" | "md"): { body; contentType; filename }`
    - a PUT with `image: {alt, credit}` updates the current photo's alt text and credit
  - **Server:**
    - parses multipart bodies (a file becomes `UploadedFile`); the idempotency fingerprint of a multipart request lists its fields and the file's name, type and size
    - answers export routes with the raw file and a `Content-Disposition` header

- [ ] **Step 1: Write the failing store tests**

Append to `tests/unit/mock-store.test.ts`:

```ts
describe("photos (spec v1.1 §6 photo panel)", () => {
  it("search gives the same photos for the same words; picking one saves Pexels' credit", () => {
    const first = data(store.searchPhotos("court building", 1));
    expect(first).toHaveLength(6);
    expect(data(store.searchPhotos("court building", 1))).toEqual(first);
    const before = data(store.getPost("p_201")).version;
    const image = data(store.pickPhoto("p_201", first[0].pexelsId, undefined, ME));
    expect(image).toMatchObject({ credit: "Photo by Mock Photographer 1 on Pexels", source: "pexels", pexelsId: first[0].pexelsId });
    expect(data(store.getPost("p_201")).version).toBe(before + 1);
  });

  it("refuses an upload of the wrong type with a readable message", () => {
    const outcome = store.uploadPhoto("p_201", { name: "notes.txt", type: "text/plain", size: 5, dataUrl: "data:text/plain;base64,aGVsbG8=" }, undefined, undefined, ME);
    expect(outcome).toMatchObject({ ok: false, status: 400, code: "invalid_input", message: "Only JPEG, PNG or WebP photos can be uploaded." });
  });

  it("refuses an upload over the size limit", () => {
    const outcome = store.uploadPhoto("p_201", { name: "big.png", type: "image/png", size: 5_242_881, dataUrl: "data:image/png;base64," }, undefined, undefined, ME);
    expect(outcome).toMatchObject({ ok: false, status: 400, message: "The photo is larger than 5 MB." });
  });

  it("uploads, takes alt text and credit through a save, and removes", () => {
    data(store.uploadPhoto("p_201", { name: "p.png", type: "image/png", size: 68, dataUrl: "data:image/png;base64,iVBOR" }, undefined, undefined, ME));
    const saved = data(update("p_201", { image: { alt: "A signed contract", credit: "Fakher & Co" } }));
    expect(saved.image).toMatchObject({ alt: "A signed contract", credit: "Fakher & Co", source: "upload" });
    expect(store.removePhoto("p_201", ME)).toMatchObject({ ok: true });
    expect(data(store.getPost("p_201")).image).toBeNull();
  });

  it("a photo can only change while the post can be edited", () => {
    expect(store.removePhoto("p_301", ME)).toMatchObject({ ok: false, status: 422 });
  });
});

describe("export (spec v1.1 §7 export.html / .md)", () => {
  it("exports Markdown with headings, lists, tables, quotes and links", () => {
    const file = data(store.exportPost("p_201", "md"));
    expect(file).toMatchObject({ contentType: "text/markdown; charset=utf-8", filename: "commission-payable-uae-labour-law.md" });
    for (const line of [
      "# When does a commission become payable under UAE Labour Law?",
      "## When the commission is earned",
      "- The employee's performance",
      "| Contract value | Rate |",
      "| Up to AED 1 million | 2% |",
      "> Article 53 requires payment within fourteen days of the end of the contract.",
      "[Labour Law](https://uaelegislation.gov.ae/en/legislations/1541)",
    ]) {
      expect(file.body).toContain(line);
    }
  });

  it("exports a standalone HTML page that keeps the article's direction", () => {
    expect(data(store.exportPost("p_201", "html")).body).toContain('<html lang="en" dir="ltr">');
    const arabic = data(store.exportPost("p_202", "html"));
    expect(arabic.body).toContain('<html lang="ar" dir="rtl">');
    expect(arabic.filename).toBe("commission-payable-uae-labour-law-ar.html");
  });
});
```

- [ ] **Step 2: Write the failing API-over-mock tests**

Append to `tests/unit/engine-posts.test.ts`:

```ts
// A 1×1 transparent PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

describe("photos and export over the mock engine", () => {
  it("uploads a photo as multipart; a wrong type comes back with the engine's message", async () => {
    const { engine } = setup();
    const refused = await failure(engine.uploadPhoto("p_201", { file: new File(["hello"], "notes.txt", { type: "text/plain" }) }, ctx()));
    expect(refused).toMatchObject({ status: 400, code: "invalid_input", message: "Only JPEG, PNG or WebP photos can be uploaded." });
    const image = await engine.uploadPhoto("p_201", { file: new File([PNG], "pixel.png", { type: "image/png" }), alt: "A pixel" }, ctx());
    expect(image).toMatchObject({ source: "upload", alt: "A pixel" });
    expect(image.url.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("exports Markdown as a file with the post's name", async () => {
    const { engine } = setup();
    const file = await engine.exportPost("p_201", "md");
    expect(file.filename).toBe("commission-payable-uae-labour-law.md");
    expect(file.body).toContain("## When the commission is earned");
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `pnpm test tests/unit/mock-store.test.ts tests/unit/engine-posts.test.ts`

Expected: FAIL.
- `store.searchPhotos is not a function`
- `store.exportPost is not a function`
- the API tests get 404 "No mock route"

- [ ] **Step 4: Add the photo stand-ins and the export bodies**

```ts
// src/lib/engine/mock/photos.ts
import type { Photo } from "../schemas";

const PER_PAGE = 6;

function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c] ?? c);
}

function hashOf(text: string): number {
  let hash = 0;
  for (const char of text) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  return hash;
}

/** An offline stand-in for a photo: an SVG data URL, so tests and previews never call the internet. */
export function placeholderPhoto(label: string, hue: number): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="427" viewBox="0 0 640 427">` +
    `<rect width="640" height="427" fill="hsl(${hue} 35% 55%)"/>` +
    `<text x="320" y="224" font-family="sans-serif" font-size="28" fill="white" text-anchor="middle">${escapeXml(label)}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** GET …/photos/search in the mock: the same words always give the same photos. */
export function searchMockPhotos(query: string, page: number): Photo[] {
  const words = query.trim() || "photo";
  const seed = hashOf(words.toLowerCase());
  return Array.from({ length: PER_PAGE }, (_, index) => {
    const n = (page - 1) * PER_PAGE + index + 1;
    const url = placeholderPhoto(`${words} ${n}`, (seed + n * 47) % 360);
    return {
      pexelsId: 100_000 + ((seed + n * 7_919) % 900_000),
      thumb: url,
      full: url,
      width: 640,
      height: 427,
      photographer: `Mock Photographer ${n}`,
      photographerUrl: "https://www.pexels.com",
      alt: `${words} ${n}`,
    };
  });
}
```

```ts
// src/lib/engine/mock/export.ts
import type { Post } from "../schemas";

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Inline HTML to Markdown: links, bold and italic; any other tag is dropped. */
function inline(html: string): string {
  return decodeEntities(
    html
      .replace(/<a href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g, "[$2]($1)")
      .replace(/<(strong|b)>([\s\S]*?)<\/\1>/g, "**$2**")
      .replace(/<(em|i)>([\s\S]*?)<\/\1>/g, "_$2_")
      .replace(/<[^>]+>/g, ""),
  ).trim();
}

const listItems = (html: string) => [...html.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((match) => inline(match[1]));

function tableToMarkdown(table: string): string {
  const rows = [...table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((row) => [...row[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((cell) => inline(cell[1])));
  const [head, ...body] = rows;
  if (!head) return "";
  return `\n\n| ${head.join(" | ")} |\n| ${head.map(() => "---").join(" | ")} |\n${body.map((row) => `| ${row.join(" | ")} |`).join("\n")}\n\n`;
}

/** The engine's neutral article HTML (spec v1.1 §11) as Markdown. */
export function htmlToMarkdown(html: string): string {
  return html
    .replace(/<table>[\s\S]*?<\/table>/g, (table) => tableToMarkdown(table))
    .replace(/<h([1-6])>([\s\S]*?)<\/h\1>/g, (_, level: string, text: string) => `\n\n${"#".repeat(Number(level))} ${inline(text)}\n\n`)
    .replace(/<blockquote>([\s\S]*?)<\/blockquote>/g, (_, text: string) => `\n\n> ${inline(text)}\n\n`)
    .replace(/<ul>([\s\S]*?)<\/ul>/g, (_, items: string) => `\n\n${listItems(items).map((item) => `- ${item}`).join("\n")}\n\n`)
    .replace(/<ol>([\s\S]*?)<\/ol>/g, (_, items: string) => `\n\n${listItems(items).map((item, i) => `${i + 1}. ${item}`).join("\n")}\n\n`)
    .replace(/<p>([\s\S]*?)<\/p>/g, (_, text: string) => `\n\n${inline(text)}\n\n`)
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** export.html: a standalone page in the article's language and direction. */
export function exportHtml(post: Post): string {
  const dir = post.language === "ar" ? "rtl" : "ltr";
  const description = post.metaDescription ? `<meta name="description" content="${escapeHtml(post.metaDescription)}">` : "";
  const standfirst = post.subtitle ? `<p><em>${escapeHtml(post.subtitle)}</em></p>` : "";
  const body = post.kind === "blog" ? (post.content ?? "") : `<p>${escapeHtml(post.content ?? "")}</p>`;
  return (
    `<!doctype html><html lang="${post.language}" dir="${dir}"><head><meta charset="utf-8">` +
    `<title>${escapeHtml(post.metaTitle ?? post.title)}</title>${description}</head>` +
    `<body><h1>${escapeHtml(post.title)}</h1>${standfirst}${body}</body></html>`
  );
}

/** export.md: the title, standfirst, body and hashtags as Markdown. */
export function exportMarkdown(post: Post): string {
  const lines = [`# ${post.title}`];
  if (post.subtitle) lines.push("", `_${post.subtitle}_`);
  lines.push("", post.kind === "blog" ? htmlToMarkdown(post.content ?? "") : (post.content ?? ""));
  if (post.hashtags.length > 0) lines.push("", post.hashtags.join(" "));
  return `${lines.join("\n").trim()}\n`;
}
```

- [ ] **Step 5: Add photos and export to the store**

In `src/lib/engine/mock/store.ts`:

(a) Update the imports:

```ts
import type { BulkResult, Category, Job, Photo, Post } from "../schemas";
import { exportHtml, exportMarkdown } from "./export";
import { searchMockPhotos } from "./photos";
```

(b) After the `MockOutcome` type, add:

```ts
/** A file from a multipart upload, as the mock server hands it to the store. */
export type UploadedFile = { name: string; type: string; size: number; dataUrl: string };
export type ExportFile = { body: string; contentType: string; filename: string };

function isImageText(value: unknown): value is { alt: string | null; credit: string | null } {
  if (typeof value !== "object" || value === null) return false;
  const { alt, credit } = value as Record<string, unknown>;
  return (typeof alt === "string" || alt === null) && (typeof credit === "string" || credit === null);
}
```

(c) Inside `createMockStore`, after `const failNextPublish = …`, add `const photoCache = new Map<number, Photo>();`.

(d) In `updatePost`, after the `for (const field of EDITABLE_FIELDS) …` line, add:

```ts
    if (isImageText(input.image) && post.image) post.image = { ...post.image, alt: input.image.alt, credit: input.image.credit };
```

(e) After `scheduled`, add:

```ts
  /** The photo endpoints change a post only while it can be edited. Like a save, a photo change bumps the version. */
  function photoTarget(id: string, actor: string): MockOutcome<Post> {
    const guarded = guard(id, actor);
    if (!guarded.ok) return guarded;
    if (!actionsFor(guarded.data).includes("edit")) {
      return fail(422, "invalid_input", "The photo can't be changed in this post's current status.");
    }
    return guarded;
  }

  function setImage(post: Post, image: Post["image"]): void {
    post.image = image;
    touch(post);
    refreshFindings(post);
  }

  function searchPhotos(query: string, page: number): MockOutcome<Photo[]> {
    const photos = searchMockPhotos(query, page);
    for (const photo of photos) photoCache.set(photo.pexelsId, photo);
    return ok(photos);
  }

  function pickPhoto(id: string, pexelsId: number, alt: string | undefined, actor: string): MockOutcome<NonNullable<Post["image"]>> {
    const target = photoTarget(id, actor);
    if (!target.ok) return target;
    const photo = photoCache.get(pexelsId);
    if (!photo) return fail(404, "not_found", "That photo is no longer available. Search again.");
    const image = {
      url: photo.full,
      alt: alt?.trim() || photo.alt || null,
      credit: `Photo by ${photo.photographer} on Pexels`,
      source: "pexels",
      pexelsId,
    };
    setImage(target.data, image);
    return ok(structuredClone(image));
  }

  function uploadPhoto(
    id: string,
    file: UploadedFile | null,
    alt: string | undefined,
    credit: string | undefined,
    actor: string,
  ): MockOutcome<NonNullable<Post["image"]>> {
    const target = photoTarget(id, actor);
    if (!target.ok) return target;
    if (!file) return fail(400, "invalid_input", "Choose a photo to upload.", { fields: { file: "Required" } });
    if (!limits.photoTypes.includes(file.type)) {
      return fail(400, "invalid_input", "Only JPEG, PNG or WebP photos can be uploaded.", { fields: { file: "Unsupported type" } });
    }
    if (file.size > limits.photoMaxBytes) {
      return fail(400, "invalid_input", `The photo is larger than ${limits.photoMaxBytes / 1_048_576} MB.`, { fields: { file: "Too large" } });
    }
    const image = { url: file.dataUrl, alt: alt?.trim() || null, credit: credit?.trim() || null, source: "upload", pexelsId: null };
    setImage(target.data, image);
    return ok(structuredClone(image));
  }

  function removePhoto(id: string, actor: string): MockOutcome<{ removed: true }> {
    const target = photoTarget(id, actor);
    if (!target.ok) return target;
    setImage(target.data, null);
    return ok({ removed: true as const });
  }

  function exportPost(id: string, format: string): MockOutcome<ExportFile> {
    tick();
    const post = posts.get(id);
    if (!post) return fail(404, "not_found", "This post no longer exists.");
    const name = post.slug || post.id;
    if (format === "html") return ok({ body: exportHtml(post), contentType: "text/html; charset=utf-8", filename: `${name}.html` });
    if (format === "md") return ok({ body: exportMarkdown(post), contentType: "text/markdown; charset=utf-8", filename: `${name}.md` });
    return fail(404, "not_found", `There's no ${format} export.`);
  }
```

(f) Add `searchPhotos, pickPhoto, uploadPhoto, removePhoto, exportPost,` to the returned object.

- [ ] **Step 6: Route photos, uploads and export in the mock server**

In `src/lib/engine/mock/server.ts`:

(a) Change the store import to `import { createMockStore, type ExportFile, type MockOutcome, type MockStore, type UploadedFile } from "./store";` and the reply type to:

```ts
type Reply = { status: number; json?: unknown; file?: ExportFile };
```

(b) In `createMockFetch`, replace everything from `const body = typeof init.body === "string" ? init.body : "";` through the closing `}` of the JSON-parsing `try/catch` with the block below. The block repeats the GET, acting-user and key checks unchanged. The three lines after it stay as they are: `const reply = route(…)`, `store.idempotency.set(…)` and `return send(reply)`.

```ts
    const form = init.body instanceof FormData ? init.body : null;
    const text = typeof init.body === "string" ? init.body : "";

    if (method === "GET") return send(route(method, path, url, {}, "", scenario, store));

    const actor = headers.get("X-Acting-User");
    if (!actor) return send(fail(400, "invalid_input", "X-Acting-User is required for changes."));
    const key = headers.get("Idempotency-Key");
    if (!key) return send(fail(400, "invalid_input", "Idempotency-Key is required for changes."));

    const fingerprint = `${method} ${path} ${form ? describeForm(form) : text}`;
    const seen = store.idempotency.get(key);
    if (seen) {
      return seen.fingerprint === fingerprint
        ? send({ status: seen.status, json: seen.json })
        : send(fail(422, "idempotency_mismatch", "This Idempotency-Key was already used for a different request."));
    }

    let parsed: Record<string, unknown> = {};
    if (form) {
      parsed = await readForm(form);
    } else {
      try {
        parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
      } catch {
        return send(fail(400, "invalid_input", "The request body isn't valid JSON."));
      }
    }
```

(c) In `route`, after the `/website/categories` line, add:

```ts
  if (method === "GET" && rest === "/photos/search") {
    return outcome(store.searchPhotos(url.searchParams.get("q") ?? "", Math.max(1, Number(url.searchParams.get("page")) || 1)));
  }
```

and after the `/hold` line inside the post routes:

```ts
    if (action === "/image/pick" && method === "POST") return outcome(store.pickPhoto(id, Number(body.pexelsId), optionalText(body.alt), actor));
    if (action === "/image" && method === "POST") {
      return outcome(store.uploadPhoto(id, uploadedFile(body.file), optionalText(body.alt), optionalText(body.credit), actor));
    }
    if (action === "/image" && method === "DELETE") return outcome(store.removePhoto(id, actor));
    const exportFormat = /^\/export\.([a-z]+)$/.exec(action);
    if (exportFormat && method === "GET") {
      const file = store.exportPost(id, exportFormat[1]);
      return file.ok ? { status: 200, file: file.data } : outcome(file);
    }
```

(d) Replace `send` and add the multipart helpers at the end of the file:

```ts
function send(reply: Reply): Response {
  if (reply.file) {
    const { body, contentType, filename } = reply.file;
    const ascii = filename.replace(/[^\x20-\x7e]|"/g, "_");
    return new Response(body, {
      status: reply.status,
      headers: { "Content-Type": contentType, "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}` },
    });
  }
  return Response.json(reply.json, { status: reply.status });
}

/** Multipart fields as plain values; a file becomes its name, type, size and a data URL (the mock keeps uploads in memory). */
async function readForm(form: FormData): Promise<Record<string, unknown>> {
  const fields: Record<string, unknown> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") {
      fields[key] = value;
    } else {
      const base64 = Buffer.from(await value.arrayBuffer()).toString("base64");
      fields[key] = { name: value.name, type: value.type, size: value.size, dataUrl: `data:${value.type || "application/octet-stream"};base64,${base64}` };
    }
  }
  return fields;
}

/** What a multipart request asked for, for the idempotency check: the fields, and each file by name, type and size. */
function describeForm(form: FormData): string {
  return [...form.entries()].map(([key, value]) => (typeof value === "string" ? `${key}=${value}` : `${key}=${value.name}:${value.type}:${value.size}`)).join("&");
}

function uploadedFile(value: unknown): UploadedFile | null {
  if (typeof value !== "object" || value === null) return null;
  const file = value as Partial<UploadedFile>;
  return typeof file.name === "string" && typeof file.type === "string" && typeof file.size === "number" && typeof file.dataUrl === "string"
    ? (file as UploadedFile)
    : null;
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm test && pnpm typecheck`

Expected: unit PASS (179 + 9 = 188); typecheck exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/lib/engine tests/unit
git commit -m "feat: mock engine photos (search, pick, upload, remove) and HTML/Markdown export"
```

---
### Task 4: Server actions for publishing, photos and export; idempotency keys per request

**Files:**
- Create:
  - `src/lib/actions/idempotency.ts`, `src/lib/actions/server.ts`
  - `src/app/[locale]/(app)/review/photo-actions.ts`
- Modify:
  - `src/lib/actions/use-engine-action.ts`, `src/app/[locale]/(app)/review/actions.ts`
  - `next.config.ts`, `tests/unit/action-inputs.test.ts`
- Test: `tests/unit/idempotency.test.ts` (create), `tests/unit/action-inputs.test.ts` (append)

**Interfaces:**
- Consumes: Task 1 API methods, `BULK_ACTIONS`, `PostImage`, `Photo`, `EngineFile`
- Produces:
  - **Key memory:** `keyForAttempt(memory, fingerprint, mint)`, `afterAttempt(memory, answered)`, `fingerprintOf(input)`, `type KeyMemory`
  - **Hooks:**
    - `useEngineAction(action)`: same API as before; a retry reuses the key only for the same input after no answer
    - `useEngineUpload(action: (form: FormData) => Promise<ActionResult<T>>)` → `{ run(fields: Record<string, string>, file: File), pending }`
  - **Shared server helpers:** `src/lib/actions/server.ts` exports `Locale`, `EngineId`, `IdempotencyKey`, `INVALID`, `engineFor(locale)` and `change(locale, key, run)`
  - **Post actions:**
    - `publishPostAction({ locale, postId, idempotencyKey }) → Post`
    - `holdPostAction({ locale, postId, hold, idempotencyKey }) → Post`
    - `bulkPostsAction` accepts every `BulkAction`
    - `exportPostAction({ locale, postId, format: "html" | "md" }) → ExportedFile`, where `type ExportedFile = { filename: string; contentType: string; body: string }`
  - **Photo actions:**
    - `searchPhotosAction({ locale, query, page }) → Photo[]`
    - `pickPhotoAction({ locale, postId, pexelsId, alt?, idempotencyKey }) → PostImage`
    - `uploadPhotoAction(form: FormData) → PostImage`: fields `locale`, `postId`, `idempotencyKey`, `file`, optional `alt` and `credit`
    - `removePhotoAction({ locale, postId, idempotencyKey }) → { removed: true }`

- [ ] **Step 1: Write the failing key-memory tests**

```ts
// tests/unit/idempotency.test.ts
import { describe, expect, it } from "vitest";
import { afterAttempt, fingerprintOf, keyForAttempt } from "@/lib/actions/idempotency";

function minter() {
  let n = 0;
  return () => `key-${++n}`;
}

describe("idempotency keys (spec v1.1 §2; Review Focus 1)", () => {
  it("reuses the key when the same request got no answer", () => {
    const mint = minter();
    const first = keyForAttempt(null, "publish p_1", mint);
    expect(keyForAttempt(afterAttempt(first.memory, false), "publish p_1", mint).key).toBe(first.key);
  });

  it("uses a new key after any answer, even a refusal", () => {
    const mint = minter();
    const first = keyForAttempt(null, "publish p_1", mint);
    expect(keyForAttempt(afterAttempt(first.memory, true), "publish p_1", mint).key).not.toBe(first.key);
  });

  it("uses a new key when the request changed, even with no answer (so no idempotency_mismatch)", () => {
    const mint = minter();
    const first = keyForAttempt(null, fingerprintOf({ postId: "p_1", note: "Shorter" }), mint);
    const edited = keyForAttempt(afterAttempt(first.memory, false), fingerprintOf({ postId: "p_1", note: "Shorter introduction" }), mint);
    expect(edited.key).not.toBe(first.key);
  });

  it("tells files apart by name, type, size and date", () => {
    const file = (body: string) => new File([body], "a.png", { type: "image/png", lastModified: 1 });
    expect(fingerprintOf({ file: file("aa") })).toBe(fingerprintOf({ file: file("aa") }));
    expect(fingerprintOf({ file: file("aa") })).not.toBe(fingerprintOf({ file: file("aaa") }));
  });
});
```

- [ ] **Step 2: Write the failing action-input tests**

In `tests/unit/action-inputs.test.ts`:

(a) Replace the `engine` constant with:

```ts
const engine = {
  deletePost: vi.fn(),
  job: vi.fn(),
  post: vi.fn(),
  publishPost: vi.fn(),
  holdPost: vi.fn(),
  exportPost: vi.fn(),
  searchPhotos: vi.fn(),
  uploadPhoto: vi.fn(),
};
```

(b) Replace the dynamic import line with:

```ts
const { deletePostAction, exportPostAction, holdPostAction, jobAction, loadPostAction, publishPostAction } = await import(
  "@/app/[locale]/(app)/review/actions"
);
const { searchPhotosAction, uploadPhotoAction } = await import("@/app/[locale]/(app)/review/photo-actions");
```

(c) Append:

```ts
function uploadForm(fields: Record<string, string>, file?: File): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  if (file) form.set("file", file);
  return form;
}

describe("M2b actions validate their input too", () => {
  it("refuses a malformed id for publish and hold without calling the engine", async () => {
    expect(await publishPostAction({ locale: "en", postId: "..", idempotencyKey: "key-12345678" })).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(await holdPostAction({ locale: "en", postId: "p_1/x", hold: true, idempotencyKey: "key-12345678" })).toMatchObject({ ok: false });
    expect(engine.publishPost).not.toHaveBeenCalled();
    expect(engine.holdPost).not.toHaveBeenCalled();
  });

  it("refuses an upload with a bad post id or no file", async () => {
    const png = new File(["x"], "a.png", { type: "image/png" });
    expect(await uploadPhotoAction(uploadForm({ locale: "en", postId: "..", idempotencyKey: "key-12345678" }, png))).toMatchObject({ ok: false });
    expect(await uploadPhotoAction(uploadForm({ locale: "en", postId: "p_201", idempotencyKey: "key-12345678" }))).toMatchObject({ ok: false });
    expect(engine.uploadPhoto).not.toHaveBeenCalled();
  });

  it("passes a well-formed upload to the engine with who is acting and the key", async () => {
    engine.uploadPhoto.mockResolvedValue({ url: "data:image/png;base64,eA==", source: "upload" });
    const png = new File(["x"], "a.png", { type: "image/png" });
    const result = await uploadPhotoAction(uploadForm({ locale: "en", postId: "p_201", idempotencyKey: "key-12345678", alt: "Court" }, png));
    expect(result).toMatchObject({ ok: true, data: { source: "upload" } });
    expect(engine.uploadPhoto).toHaveBeenCalledWith(
      "p_201",
      expect.objectContaining({ alt: "Court" }),
      expect.objectContaining({ actingUser: "reviewer@example.com", idempotencyKey: "key-12345678" }),
    );
  });

  it("exports only HTML or Markdown", async () => {
    expect(await exportPostAction({ locale: "en", postId: "p_201", format: "pdf" as "html" })).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(engine.exportPost).not.toHaveBeenCalled();
  });

  it("searches photos only for actual words", async () => {
    expect(await searchPhotosAction({ locale: "en", query: "   ", page: 1 })).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(engine.searchPhotos).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `pnpm test tests/unit/idempotency.test.ts tests/unit/action-inputs.test.ts`

Expected: FAIL.
- `@/lib/actions/idempotency` can't be resolved
- `photo-actions` can't be resolved
- `publishPostAction is not a function`

- [ ] **Step 4: Add the key memory and the hooks**

```ts
// src/lib/actions/idempotency.ts
/**
 * Spec v1.1 §2: a fresh Idempotency-Key per user action; the same key again only when no answer arrived for the very
 * same request. A changed note or another file is a new request, so it gets a new key (reusing it would be refused
 * as idempotency_mismatch).
 */
export type KeyMemory = { key: string; fingerprint: string } | null;

export function keyForAttempt(memory: KeyMemory, fingerprint: string, mint: () => string): { key: string; memory: KeyMemory } {
  if (memory && memory.fingerprint === fingerprint) return { key: memory.key, memory };
  const key = mint();
  return { key, memory: { key, fingerprint } };
}

/** After an attempt: keep the key only if no answer arrived (the request may have gone through). */
export function afterAttempt(memory: KeyMemory, answered: boolean): KeyMemory {
  return answered ? null : memory;
}

/** A stable description of an action's input, to tell a retry of the same request from a new one. */
export function fingerprintOf(input: unknown): string {
  return JSON.stringify(input, (_key, value: unknown) =>
    value instanceof File ? `file:${value.name}:${value.type}:${value.size}:${value.lastModified}` : value,
  );
}
```

Replace `src/lib/actions/use-engine-action.ts` with:

```ts
"use client";

import { useCallback, useRef, useState } from "react";
import { afterAttempt, fingerprintOf, keyForAttempt, type KeyMemory } from "./idempotency";
import { NETWORK_FAILURE, shouldReuseKey, type ActionResult } from "./result";

/** One key memory and a pending flag, shared by the two hooks below. */
function useKeyedAttempt() {
  const memory = useRef<KeyMemory>(null);
  const [pending, setPending] = useState(false);

  const attempt = useCallback(async <T>(fingerprint: string, send: (key: string) => Promise<ActionResult<T>>): Promise<ActionResult<T>> => {
    const next = keyForAttempt(memory.current, fingerprint, () => crypto.randomUUID());
    memory.current = next.memory;
    setPending(true);
    try {
      const result = await send(next.key);
      memory.current = afterAttempt(memory.current, result.ok || !shouldReuseKey(result.error));
      return result;
    } catch {
      return { ok: false, error: NETWORK_FAILURE }; // no answer: retrying the same request reuses the key
    } finally {
      setPending(false);
    }
  }, []);

  return { attempt, pending };
}

/**
 * Runs a server action with an idempotency key: the same key is reused only for the same request after no answer
 * (so a retry can't apply a change twice), and a new one is made after any answer or for a changed request.
 */
export function useEngineAction<I extends { idempotencyKey: string }, T>(action: (input: I) => Promise<ActionResult<T>>) {
  const { attempt, pending } = useKeyedAttempt();
  const run = useCallback(
    (input: Omit<I, "idempotencyKey">) => attempt<T>(fingerprintOf(input), (idempotencyKey) => action({ ...input, idempotencyKey } as I)),
    [action, attempt],
  );
  return { run, pending };
}

/** The same for a multipart upload: the server action takes FormData, which carries the fields, the file and the key. */
export function useEngineUpload<T>(action: (form: FormData) => Promise<ActionResult<T>>) {
  const { attempt, pending } = useKeyedAttempt();
  const run = useCallback(
    (fields: Record<string, string>, file: File) =>
      attempt<T>(fingerprintOf({ fields, file }), (idempotencyKey) => {
        const form = new FormData();
        for (const [key, value] of Object.entries(fields)) form.set(key, value);
        form.set("file", file);
        form.set("idempotencyKey", idempotencyKey);
        return action(form);
      }),
    [action, attempt],
  );
  return { run, pending };
}
```

- [ ] **Step 5: Move the shared helpers out of the actions file**

A `"use server"` file may export only async functions, and each export becomes a callable action. The helpers therefore live in a server-only module.

```ts
// src/lib/actions/server.ts
import "server-only";
import { refresh } from "next/cache";
import { z } from "zod";
import { LOCALES } from "@/i18n/locales";
import type { ActionResult } from "@/lib/actions/result";
import { requirePermission } from "@/lib/auth/session";
import { getEngine } from "@/lib/engine";
import type { ChangeContext, EngineApi } from "@/lib/engine/api";
import { ENGINE_ID } from "@/lib/engine/ids";
import { tryEngine } from "@/lib/engine/result";

export const Locale = z.enum(LOCALES);
// Ids go into engine URL paths: only the engine's opaque id characters, so "." or ".." can't reach another endpoint.
export const EngineId = z.string().regex(ENGINE_ID);
export const IdempotencyKey = z.string().min(8);
export const INVALID = { ok: false as const, error: { status: 400, code: "invalid_input", message: "Invalid request." } };

/** Role check + engine + who is acting. Every action goes through it. */
export async function engineFor(locale: string) {
  const session = await requirePermission(locale, "content.work");
  return { engine: await getEngine(), actingUser: session.email };
}

/** A change (design §8): role check, X-Acting-User and the caller's key, then a refresh of the page if it succeeded. */
export async function change<T>(
  locale: string,
  idempotencyKey: string,
  run: (ctx: ChangeContext & { engine: EngineApi }) => Promise<T>,
): Promise<ActionResult<T>> {
  const { engine, actingUser } = await engineFor(locale);
  const result = await tryEngine(() => run({ engine, actingUser, idempotencyKey }));
  if (result.ok) refresh();
  return result;
}
```

Replace `src/app/[locale]/(app)/review/actions.ts` with:

```ts
"use server";

import { z } from "zod";
import type { ActionResult } from "@/lib/actions/result";
import { change, EngineId, engineFor, IdempotencyKey, INVALID, Locale } from "@/lib/actions/server";
import { BULK_ACTIONS, type BulkAction } from "@/lib/engine/api";
import { tryEngine } from "@/lib/engine/result";
import { PostUpdateSchema, type BulkResult, type Job, type JobStart, type Post } from "@/lib/engine/schemas";

const Base = z.object({ locale: Locale, postId: EngineId });
const Change = Base.extend({ idempotencyKey: IdempotencyKey });

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

/** Publish now (spec v1.1 §7 POST …/publish), also used for Retry in History. */
export async function publishPostAction(input: { locale: string; postId: string; idempotencyKey: string }): Promise<ActionResult<Post>> {
  const parsed = Change.safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, postId, idempotencyKey } = parsed.data;
  return change(locale, idempotencyKey, ({ engine, ...ctx }) => engine.publishPost(postId, ctx));
}

export async function holdPostAction(input: { locale: string; postId: string; hold: boolean; idempotencyKey: string }): Promise<ActionResult<Post>> {
  const parsed = Change.extend({ hold: z.boolean() }).safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, postId, hold, idempotencyKey } = parsed.data;
  return change(locale, idempotencyKey, ({ engine, ...ctx }) => engine.holdPost(postId, hold, ctx));
}

export async function bulkPostsAction(input: {
  locale: string;
  action: BulkAction;
  ids: string[];
  idempotencyKey: string;
}): Promise<ActionResult<BulkResult>> {
  const parsed = z
    .object({ locale: Locale, action: z.enum(BULK_ACTIONS), ids: z.array(EngineId).min(1).max(100), idempotencyKey: IdempotencyKey })
    .safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, action, ids, idempotencyKey } = parsed.data;
  return change(locale, idempotencyKey, ({ engine, ...ctx }) => engine.bulkPosts(action, ids, undefined, ctx));
}

export async function jobAction(input: { locale: string; jobId: string }): Promise<ActionResult<Job>> {
  const parsed = z.object({ locale: Locale, jobId: EngineId }).safeParse(input);
  if (!parsed.success) return INVALID;
  const { engine } = await engineFor(parsed.data.locale);
  return tryEngine(() => engine.job(parsed.data.jobId));
}

export type ExportedFile = { filename: string; contentType: string; body: string };

/** Export HTML or Markdown (spec v1.1 §7). A read: no key, no refresh. The file comes through our server, so the key never reaches the browser. */
export async function exportPostAction(input: { locale: string; postId: string; format: "html" | "md" }): Promise<ActionResult<ExportedFile>> {
  const parsed = Base.extend({ format: z.enum(["html", "md"]) }).safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, postId, format } = parsed.data;
  const { engine } = await engineFor(locale);
  const file = await tryEngine(() => engine.exportPost(postId, format));
  if (!file.ok) return file;
  return { ok: true, data: { filename: file.data.filename ?? `${postId}.${format}`, contentType: file.data.contentType, body: file.data.body } };
}
```

- [ ] **Step 6: Add the photo actions and the body size limit**

```ts
// src/app/[locale]/(app)/review/photo-actions.ts
"use server";

import { z } from "zod";
import type { ActionResult } from "@/lib/actions/result";
import { change, EngineId, engineFor, IdempotencyKey, INVALID, Locale } from "@/lib/actions/server";
import { tryEngine } from "@/lib/engine/result";
import type { Photo, PostImage } from "@/lib/engine/schemas";

export async function searchPhotosAction(input: { locale: string; query: string; page: number }): Promise<ActionResult<Photo[]>> {
  const parsed = z.object({ locale: Locale, query: z.string().trim().min(1).max(200), page: z.number().int().min(1).max(50) }).safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, query, page } = parsed.data;
  const { engine } = await engineFor(locale);
  return tryEngine(() => engine.searchPhotos(query, page));
}

export async function pickPhotoAction(input: {
  locale: string;
  postId: string;
  pexelsId: number;
  alt?: string;
  idempotencyKey: string;
}): Promise<ActionResult<PostImage>> {
  const parsed = z
    .object({ locale: Locale, postId: EngineId, pexelsId: z.number().int().positive(), alt: z.string().max(300).optional(), idempotencyKey: IdempotencyKey })
    .safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, postId, pexelsId, alt, idempotencyKey } = parsed.data;
  return change(locale, idempotencyKey, ({ engine, ...ctx }) => engine.pickPhoto(postId, pexelsId, alt, ctx));
}

const UploadSchema = z.object({
  locale: Locale,
  postId: EngineId,
  idempotencyKey: IdempotencyKey,
  alt: z.string().max(300).optional(),
  credit: z.string().max(300).optional(),
  file: z.instanceof(File),
});

/** A photo upload: the browser sends FormData; its type and size are checked by the engine (spec v1.1 §10). */
export async function uploadPhotoAction(form: FormData): Promise<ActionResult<PostImage>> {
  const parsed = UploadSchema.safeParse({
    locale: form.get("locale"),
    postId: form.get("postId"),
    idempotencyKey: form.get("idempotencyKey"),
    alt: form.get("alt") ?? undefined,
    credit: form.get("credit") ?? undefined,
    file: form.get("file"),
  });
  if (!parsed.success) return INVALID;
  const { locale, postId, idempotencyKey, alt, credit, file } = parsed.data;
  return change(locale, idempotencyKey, ({ engine, ...ctx }) => engine.uploadPhoto(postId, { file, alt, credit }, ctx));
}

export async function removePhotoAction(input: { locale: string; postId: string; idempotencyKey: string }): Promise<ActionResult<{ removed: true }>> {
  const parsed = z.object({ locale: Locale, postId: EngineId, idempotencyKey: IdempotencyKey }).safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, postId, idempotencyKey } = parsed.data;
  return change(locale, idempotencyKey, ({ engine, ...ctx }) => engine.removePhoto(postId, ctx));
}
```

In `next.config.ts`, add to `nextConfig` (after `partialPrefetching: true,`):

```ts
  experimental: {
    // Photo uploads go through a server action: /meta.limits.photoMaxBytes is 5 MB, plus multipart overhead.
    serverActions: { bodySizeLimit: "6mb" },
  },
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm test && pnpm typecheck && pnpm lint`

Expected: unit PASS (188 + 9 = 197); typecheck and lint exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/lib/actions src/app next.config.ts tests/unit
git commit -m "feat: publish, hold, photo and export actions; reuse an idempotency key only for the same request"
```

---

### Task 5: The editor's photo panel

**Files:**
- Create: `src/components/editor/photo-panel.tsx`, `src/components/editor/photo-picker.tsx`
- Modify:
  - `src/lib/editor/changed-fields.ts`, `src/lib/editor/draft.ts`
  - `src/components/editor/post-editor.tsx`, `src/components/editor/conflict-panel.tsx`
  - `src/app/[locale]/(app)/review/[postId]/page.tsx`
  - `messages/en.json`, `messages/ar.json`
- Test:
  - `tests/unit/draft.test.ts` (modify and append)
  - `tests/unit/changed-fields.test.ts` (modify and append)
  - `tests/e2e/photos.spec.ts` (create)

**Interfaces:**
- Consumes: Task 4 photo actions and `useEngineUpload`; Task 1 `PostImage`; M2a `Draft`, `toEditable`, `changedFields`, `FieldError`
- Produces:
  - **Fields:**
    - `type ImageText = { alt: string | null; credit: string | null }`
    - `EditableFields.image: ImageText | null`; `"image"` is also in `FIELD_KEYS`
    - `toUpdate(fields, version): PostUpdate`
  - **Draft:**
    - `Draft` gains `server: EditableFields` (the engine's own copy of the base)
    - `afterSave(draft, sent, saved: Post)`
    - `withServerImage(draft, post): Draft`
  - **Components:**
    - `<PhotoPanel locale post editable text onTextChange onChanged limits error? />`, with `type PhotoLimits = { photoTypes: string[]; photoMaxBytes: number }`
    - `<PhotoPicker locale initialQuery disabled onPick />`
  - **PostEditor:** takes a new prop `photoLimits`
  - **Test ids:**
    - panel: `photo-panel`, `photo-preview`, `photo-none`, `photo-required`
    - picker: `photo-find`, `photo-search-input`, `photo-search`, `photo-use-{pexelsId}`, `photo-more`
    - upload and fields: `photo-upload`, `photo-upload-button`, `photo-remove`, `photo-alt`, `photo-credit`, `photo-too-large`, `field-image-error`

- [ ] **Step 1: Write the failing unit tests**

In `tests/unit/changed-fields.test.ts`:
- add `image: null,` to the `base` object (after `section`)
- change the import to `import { changedFields, toUpdate, type EditableFields } from "@/lib/editor/changed-fields";`
- append:

```ts
describe("toUpdate", () => {
  it("sends the photo's alt text and credit only when there is a photo", () => {
    expect(toUpdate(base, 4)).not.toHaveProperty("image");
    expect(toUpdate({ ...base, image: { alt: "Court", credit: null } }, 4)).toMatchObject({ title: "T", image: { alt: "Court", credit: null }, version: 4 });
  });
});
```

In `tests/unit/draft.test.ts`:
- change the import to `import { afterSave, draftOf, edit, rebase, unsavedFields, withMyChanges, withServerImage } from "@/lib/editor/draft";`
- in "leaves nothing unsaved when the engine stores a save in its own form", change `afterSave(mine, sent, v1.version + 1)` to `afterSave(mine, sent, { ...v1, content: "<ul><li>Edited</li></ul>", version: v1.version + 1 })`
- in "keeps an edit made while the save was in flight", change `afterSave(typedOn, sending.form, v1.version + 1)` to `afterSave(typedOn, sending.form, { ...v1, title: "First", version: v1.version + 1 })`
- append:

```ts
describe("a photo change on the server (Review Focus 2)", () => {
  const photo = { url: "u", alt: "Court", credit: "Photo by A on Pexels", source: "pexels", pexelsId: 1 };

  it("follows the photo and takes its version when nothing else changed there", () => {
    const mine = edit(draftOf(v1), "subtitle", "Mine");
    const next = withServerImage(mine, { ...v1, version: v1.version + 1, image: photo });
    expect(next.version).toBe(v1.version + 1);
    expect(next.form.image).toEqual({ alt: "Court", credit: "Photo by A on Pexels" });
    expect(unsavedFields(next)).toEqual(["subtitle"]);
  });

  it("keeps the old version when someone else also saved, so the next save conflicts", () => {
    expect(withServerImage(draftOf(v1), { ...v1, title: "Theirs", version: v1.version + 2, image: photo }).version).toBe(v1.version);
  });

  it("compares with what the engine stored, not with what the editor sent", () => {
    const sent = edit(draftOf(v1), "content", "<ul><li><p>Edited</p></li></ul>");
    const stored: Post = { ...v1, content: "<ul><li>Edited</li></ul>", version: v1.version + 1 };
    const saved = afterSave(sent, sent.form, stored);
    expect(withServerImage(saved, { ...stored, version: stored.version + 1, image: photo }).version).toBe(stored.version + 1);
  });
});
```

- [ ] **Step 2: Write the failing e2e test**

```ts
// tests/e2e/photos.spec.ts
import { expect, test, type Page } from "@playwright/test";
import { isolateMockStore, signInWithCookie } from "./helpers";

// A 1×1 transparent PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

test.beforeEach(async ({ context }) => {
  await isolateMockStore(context);
  await signInWithCookie(context, "dev_reviewer");
});

async function pickFirstPhoto(page: Page) {
  await page.getByTestId("photo-find").click();
  await page.getByTestId("photo-search-input").fill("court building");
  await page.getByTestId("photo-search").click();
  await page.locator('[data-testid^="photo-use-"]').first().click();
  await expect(page.getByTestId("photo-preview")).toBeVisible();
}

test("picking a Pexels photo saves its credit (spec v1.1 §10)", async ({ page }) => {
  await page.goto("/en/review/p_201");
  await pickFirstPhoto(page);
  await expect(page.getByTestId("photo-credit")).toHaveValue("Photo by Mock Photographer 1 on Pexels");
  await page.reload();
  await expect(page.getByTestId("photo-credit")).toHaveValue("Photo by Mock Photographer 1 on Pexels");
});

test("after picking a photo, saving other fields doesn't report a conflict (Review Focus 2)", async ({ page }) => {
  await page.goto("/en/review/p_201");
  await pickFirstPhoto(page);
  await page.getByTestId("field-title").fill("Commission rules in the UAE");
  await page.getByTestId("save").click();
  await expect(page.getByTestId("save-status")).toHaveText("Saved");
  await expect(page.getByTestId("conflict-panel")).toHaveCount(0);
});

test("an upload of the wrong type shows the server's message (spec v1.1 §10)", async ({ page }) => {
  await page.goto("/en/review/p_201");
  await page.getByTestId("photo-upload").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  await expect(page.getByTestId("photo-panel").getByTestId("action-error")).toHaveText("Only JPEG, PNG or WebP photos can be uploaded.");
});

test("a photo over the size limit is stopped before it's uploaded", async ({ page }) => {
  await page.goto("/en/review/p_201");
  await page.getByTestId("photo-upload").setInputFiles({ name: "big.png", mimeType: "image/png", buffer: Buffer.alloc(6_000_000) });
  await expect(page.getByTestId("photo-too-large")).toContainText("the limit is 5 MB");
});

test("upload a photo, save its alt text, then remove it", async ({ page }) => {
  await page.goto("/en/review/p_201");
  await page.getByTestId("photo-upload").setInputFiles({ name: "pixel.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByTestId("photo-preview")).toBeVisible();
  await page.getByTestId("photo-alt").fill("A signed employment contract on a desk");
  await page.getByTestId("save").click();
  await expect(page.getByTestId("save-status")).toHaveText("Saved");
  await page.reload();
  await expect(page.getByTestId("photo-alt")).toHaveValue("A signed employment contract on a desk");
  await page.getByTestId("photo-remove").click();
  await expect(page.getByTestId("photo-none")).toBeVisible();
});

test("an Instagram post asks for a photo and can't be approved without one", async ({ page }) => {
  await page.goto("/en/review/p_209");
  await expect(page.getByTestId("photo-required")).toBeVisible();
  await page.getByTestId("approve").click();
  await expect(page.getByTestId("action-error")).toHaveText("An Instagram post needs a photo.");
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `pnpm test tests/unit/draft.test.ts tests/unit/changed-fields.test.ts`

Expected: FAIL. `toUpdate` and `withServerImage` aren't exported yet.

The e2e test is run RED in Step 6. The production build type-checks the test files, so it can't start until these imports exist.

- [ ] **Step 4: Add the photo's text to the fields and the draft**

In `src/lib/editor/changed-fields.ts`:
- change the import to `import type { Post, PostUpdate } from "@/lib/engine/schemas";`
- add `"image"` at the end of `FIELD_KEYS`
- add `image: ImageText | null;` at the end of `EditableFields`
- in `toEditable`, add `image: post.image ? { alt: post.image.alt ?? null, credit: post.image.credit ?? null } : null,`
- add the following above `EditableFields`:

```ts
/** The photo's alt text and credit, edited in the photo panel and saved with the other fields. */
export type ImageText = { alt: string | null; credit: string | null };
```

and at the end of the file:

```ts
/** The PUT body (spec v1.1 §7): the editable fields, the photo's alt text and credit when there is a photo, and the version. */
export function toUpdate(fields: EditableFields, version: number): PostUpdate {
  const { image, ...rest } = fields;
  return { ...rest, ...(image ? { image } : {}), version };
}
```

Replace `src/lib/editor/draft.ts` with:

```ts
import type { Post } from "@/lib/engine/schemas";
import { changedFields, toEditable, type EditableFields, type FieldKey } from "./changed-fields";

/**
 * The reviewer's form, the saved version it started from, and the engine's own copy of that version (it may store
 * HTML in its own form). A save sends the version (spec v1.1 §3), so a newer save by someone else always comes back as
 * version_conflict instead of being overwritten.
 */
export type Draft = { base: EditableFields; server: EditableFields; version: number; form: EditableFields };

export function draftOf(post: Post): Draft {
  const fields = toEditable(post);
  return { base: fields, server: fields, version: post.version, form: fields };
}

export function edit<K extends FieldKey>(draft: Draft, key: K, value: EditableFields[K]): Draft {
  return { ...draft, form: { ...draft.form, [key]: value } };
}

export const unsavedFields = (draft: Draft): FieldKey[] => changedFields(draft.form, draft.base);

/** A save went through: what I sent is the new base, whatever form the engine stored it in. Edits typed meanwhile stay unsaved. */
export function afterSave(draft: Draft, sent: EditableFields, saved: Post): Draft {
  return { ...draft, base: sent, server: toEditable(saved), version: saved.version };
}

/** A newer version arrived. With nothing unsaved, show it; otherwise keep the edits on their old version, so saving them conflicts. */
export function rebase(draft: Draft, post: Post): Draft {
  if (post.version <= draft.version || unsavedFields(draft).length > 0) return draft;
  return draftOf(post);
}

/** Keep mine after a conflict: their version with only the fields I changed on top (design §9: nothing is discarded). */
export function withMyChanges(draft: Draft, theirs: Post): Draft {
  const base = toEditable(theirs);
  const mine = Object.fromEntries(unsavedFields(draft).map((key) => [key, draft.form[key]]));
  return { base, server: base, version: theirs.version, form: { ...base, ...mine } };
}

/**
 * The photo changed on the server (picked, uploaded or removed; those endpoints may bump the version). The photo's
 * alt text and credit follow the server. The version is taken over only if nothing else changed there, so a save by
 * someone else in between still comes back as a conflict.
 */
export function withServerImage(draft: Draft, post: Post): Draft {
  const server = toEditable(post);
  const othersUnchanged = changedFields({ ...server, image: null }, { ...draft.server, image: null }).length === 0;
  return {
    version: othersUnchanged ? Math.max(draft.version, post.version) : draft.version,
    base: { ...draft.base, image: server.image },
    server: othersUnchanged ? server : { ...draft.server, image: server.image },
    form: { ...draft.form, image: server.image },
  };
}
```

- [ ] **Step 5: Add the messages**

Inside `Editor.fields` in `messages/en.json`, add `"image": "Photo alt text and credit"`. Inside `Editor`, add:

```json
    "photo": {
      "title": "Photo",
      "none": "No photo yet.",
      "required": "Instagram posts need a photo before they can be approved or published.",
      "suggested": "Suggested search: {idea}",
      "find": "Find a photo",
      "pickerTitle": "Find a photo on Pexels",
      "pickerBody": "Search, then choose a photo. Its credit is saved with it.",
      "searchLabel": "Search Pexels",
      "search": "Search",
      "noResults": "No photos found. Try other words.",
      "by": "Photo by {name}",
      "use": "Use this photo",
      "more": "More photos",
      "upload": "Upload a photo",
      "uploadHint": "{types}, up to {size} MB.",
      "tooLarge": "This file is {size} MB; the limit is {limit} MB.",
      "remove": "Remove photo",
      "alt": "Alt text",
      "credit": "Credit"
    }
```

Inside `Editor.fields` in `messages/ar.json`, add `"image": "النص البديل للصورة ومصدرها"`. Inside `Editor`, add:

```json
    "photo": {
      "title": "الصورة",
      "none": "لا توجد صورة بعد.",
      "required": "منشورات إنستغرام تحتاج إلى صورة قبل اعتمادها أو نشرها.",
      "suggested": "البحث المقترح: {idea}",
      "find": "ابحث عن صورة",
      "pickerTitle": "ابحث عن صورة في Pexels",
      "pickerBody": "ابحث ثم اختر صورة، ويُحفظ اسم المصوّر معها.",
      "searchLabel": "البحث في Pexels",
      "search": "بحث",
      "noResults": "لم يُعثر على صور. جرّب كلمات أخرى.",
      "by": "تصوير {name}",
      "use": "استخدم هذه الصورة",
      "more": "صور أخرى",
      "upload": "ارفع صورة",
      "uploadHint": "{types}، حتى {size} ميغابايت.",
      "tooLarge": "حجم هذا الملف {size} ميغابايت، والحد الأقصى {limit} ميغابايت.",
      "remove": "إزالة الصورة",
      "alt": "النص البديل",
      "credit": "المصدر"
    }
```

- [ ] **Step 6: Run the e2e test to verify it fails**

Run: `pnpm test tests/unit/draft.test.ts tests/unit/changed-fields.test.ts && pnpm e2e tests/e2e/photos.spec.ts`

Expected: unit PASS. e2e FAIL: `photo-find`, `photo-upload` and `photo-required` don't exist.

- [ ] **Step 7: Add the picker and the panel**

```tsx
// src/components/editor/photo-picker.tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { searchPhotosAction } from "@/app/[locale]/(app)/review/photo-actions";
import { ActionError } from "@/components/actions/action-error";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NETWORK_FAILURE } from "@/lib/actions/result";
import type { EngineFailure } from "@/lib/engine/result";
import type { Photo } from "@/lib/engine/schemas";

type Props = { locale: string; initialQuery: string; disabled: boolean; onPick: (photo: Photo) => Promise<EngineFailure | null> };

/** A Pexels grid (spec v1.1 §6 "Find a photo"); the search starts from the post's photoIdea. */
export function PhotoPicker({ locale, initialQuery, disabled, onPick }: Props) {
  const t = useTranslations("Editor.photo");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(initialQuery);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [page, setPage] = useState(1);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<EngineFailure | null>(null);

  async function search(nextPage: number) {
    if (!query.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await searchPhotosAction({ locale, query: query.trim(), page: nextPage });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPhotos((current) => (nextPage === 1 ? result.data : [...current, ...result.data]));
      setPage(nextPage);
      setSearched(true);
    } catch {
      setError(NETWORK_FAILURE);
    } finally {
      setBusy(false);
    }
  }

  async function choose(photo: Photo) {
    setBusy(true);
    const failure = await onPick(photo);
    setBusy(false);
    if (failure) setError(failure);
    else setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next && !searched && query.trim()) void search(1);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" size="sm" disabled={disabled} data-testid="photo-find">
          {t("find")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("pickerTitle")}</DialogTitle>
          <DialogDescription>{t("pickerBody")}</DialogDescription>
        </DialogHeader>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void search(1);
          }}
        >
          <Input value={query} onChange={(event) => setQuery(event.target.value)} aria-label={t("searchLabel")} data-testid="photo-search-input" />
          <Button type="submit" disabled={busy || !query.trim()} data-testid="photo-search">
            {t("search")}
          </Button>
        </form>
        {error && <ActionError error={error} />}
        {searched && photos.length === 0 && <p className="text-sm text-muted-foreground">{t("noResults")}</p>}
        <ul className="grid max-h-[60vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
          {photos.map((photo) => (
            <li key={photo.pexelsId} className="flex flex-col gap-1">
              {/* eslint-disable-next-line @next/next/no-img-element -- Pexels thumbnails come from Pexels' own hosts */}
              <img src={photo.thumb} alt={photo.alt ?? ""} className="aspect-[3/2] w-full rounded object-cover" />
              <span className="text-xs text-muted-foreground">{t("by", { name: photo.photographer })}</span>
              <Button type="button" size="xs" variant="outline" disabled={busy} data-testid={`photo-use-${photo.pexelsId}`} onClick={() => void choose(photo)}>
                {t("use")}
              </Button>
            </li>
          ))}
        </ul>
        {photos.length > 0 && (
          <Button type="button" variant="outline" disabled={busy} onClick={() => void search(page + 1)} data-testid="photo-more">
            {t("more")}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

```tsx
// src/components/editor/photo-panel.tsx
"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { pickPhotoAction, removePhotoAction, uploadPhotoAction } from "@/app/[locale]/(app)/review/photo-actions";
import { ActionError } from "@/components/actions/action-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEngineAction, useEngineUpload } from "@/lib/actions/use-engine-action";
import type { ImageText } from "@/lib/editor/changed-fields";
import type { EngineFailure } from "@/lib/engine/result";
import type { Photo, Post } from "@/lib/engine/schemas";
import { FieldError } from "./field-counter";
import { PhotoPicker } from "./photo-picker";

export type PhotoLimits = { photoTypes: string[]; photoMaxBytes: number };

type Props = {
  locale: string;
  post: Post;
  editable: boolean;
  text: ImageText | null;
  onTextChange: (text: ImageText) => void;
  onChanged: () => Promise<void>;
  limits: PhotoLimits;
  error?: string;
};

const megabytes = (bytes: number) => String(Math.round((bytes / 1_048_576) * 10) / 10);

/** Spec v1.1 §6 photo panel: the suggested search, a Pexels picker, upload, remove, and the photo's alt text and credit. */
export function PhotoPanel({ locale, post, editable, text, onTextChange, onChanged, limits, error }: Props) {
  const t = useTranslations("Editor.photo");
  const pick = useEngineAction(pickPhotoAction);
  const remove = useEngineAction(removePhotoAction);
  const upload = useEngineUpload(uploadPhotoAction);
  const [failure, setFailure] = useState<EngineFailure | null>(null);
  const [tooLarge, setTooLarge] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const image = post.image;
  const busy = pick.pending || remove.pending || upload.pending;

  async function choose(photo: Photo): Promise<EngineFailure | null> {
    setFailure(null);
    const result = await pick.run({ locale, postId: post.id, pexelsId: photo.pexelsId, alt: photo.alt ?? undefined });
    if (!result.ok) return result.error;
    await onChanged();
    return null;
  }

  async function uploadFile(file: File) {
    setFailure(null);
    setTooLarge(null);
    // The engine checks the type (its message is shown, spec v1.1 §10); the size is checked here, before the upload starts.
    if (file.size > limits.photoMaxBytes) {
      setTooLarge(t("tooLarge", { size: megabytes(file.size), limit: megabytes(limits.photoMaxBytes) }));
    } else {
      const result = await upload.run({ locale, postId: post.id }, file);
      if (result.ok) await onChanged();
      else setFailure(result.error);
    }
    if (fileInput.current) fileInput.current.value = "";
  }

  async function removePhoto() {
    setFailure(null);
    const result = await remove.run({ locale, postId: post.id });
    if (result.ok) await onChanged();
    else setFailure(result.error);
  }

  const types = limits.photoTypes.map((type) => type.replace("image/", "").toUpperCase()).join(", ");

  return (
    <Card data-testid="photo-panel">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- engine photo URLs come from many hosts (Pexels, uploads)
          <img src={image.url} alt={image.alt ?? ""} data-testid="photo-preview" className="aspect-[3/2] w-full rounded object-cover" />
        ) : (
          <p data-testid="photo-none" className="text-muted-foreground">
            {t("none")}
          </p>
        )}
        {post.platform === "instagram" && !image && (
          <p data-testid="photo-required" className="rounded bg-warn-bg px-2 py-1 text-warn-fg">
            {t("required")}
          </p>
        )}
        {post.photoIdea && <p className="text-muted-foreground">{t("suggested", { idea: post.photoIdea })}</p>}
        {editable && (
          <>
            <div className="flex flex-wrap gap-2">
              <PhotoPicker locale={locale} initialQuery={post.photoIdea ?? ""} disabled={busy} onPick={choose} />
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => fileInput.current?.click()} data-testid="photo-upload-button">
                {t("upload")}
              </Button>
              {image && (
                <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void removePhoto()} data-testid="photo-remove">
                  {t("remove")}
                </Button>
              )}
            </div>
            <input
              ref={fileInput}
              type="file"
              className="sr-only"
              accept={limits.photoTypes.join(",")}
              aria-label={t("upload")}
              data-testid="photo-upload"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadFile(file);
              }}
            />
            <p className="text-xs text-muted-foreground">{t("uploadHint", { types, size: megabytes(limits.photoMaxBytes) })}</p>
          </>
        )}
        {image && text && (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="photo-alt">{t("alt")}</Label>
              <Input
                id="photo-alt"
                data-testid="photo-alt"
                value={text.alt ?? ""}
                disabled={!editable}
                onChange={(event) => onTextChange({ ...text, alt: event.target.value || null })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="photo-credit">{t("credit")}</Label>
              <Input
                id="photo-credit"
                data-testid="photo-credit"
                value={text.credit ?? ""}
                disabled={!editable}
                onChange={(event) => onTextChange({ ...text, credit: event.target.value || null })}
              />
            </div>
          </>
        )}
        {tooLarge && (
          <p role="alert" data-testid="photo-too-large" className="text-bad-fg">
            {tooLarge}
          </p>
        )}
        {error && <FieldError testId="field-image-error" message={error} />}
        {failure && <ActionError error={failure} />}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 8: Wire the panel into the editor**

In `src/components/editor/post-editor.tsx`:

(a) Change the field and draft imports to:

```ts
import { changedFields, toEditable, toUpdate, type EditableFields } from "@/lib/editor/changed-fields";
import { afterSave, draftOf, edit, rebase, unsavedFields, withMyChanges, withServerImage, type Draft } from "@/lib/editor/draft";
```

and add `import { PhotoPanel, type PhotoLimits } from "./photo-panel";`.

(b) In `Props`, add `photoLimits: PhotoLimits;`. Change the signature to `export function PostEditor({ locale, post, twin, limits, photoLimits, categories, lockMinutes, pollSeconds }: Props) {`.

(c) In `persist`, change the save call and the success branch to:

```ts
    const result = await save.run({ locale, postId: post.id, update: toUpdate(sent, toSave.version) });
    if (result.ok) {
      setSaved(result.data);
      setDraft((latest) => afterSave(latest, sent, result.data));
      setSavedNow(true);
      return;
    }
```

(d) After `takeOver`, add:

```ts
  /** After a photo change: reload the post (the image endpoints answer with the photo only) and follow its photo. */
  async function photoChanged() {
    const fresh = await loadPostAction({ locale, postId: post.id });
    if (!fresh.ok) {
      setError(fresh.error);
      return;
    }
    setSaved(fresh.data);
    setDraft((latest) => withServerImage(latest, fresh.data));
  }
```

(e) In the `<aside>`, before `<ChecksPanel post={current} />`, add:

```tsx
          <PhotoPanel
            locale={locale}
            post={current}
            editable={editable}
            text={form.image}
            onTextChange={set("image")}
            onChanged={photoChanged}
            limits={photoLimits}
            error={errors.byField.image}
          />
```

In `src/app/[locale]/(app)/review/[postId]/page.tsx`, add this prop to `<PostEditor …>`, after `limits={…}`:

```tsx
      photoLimits={{ photoTypes: meta.data.limits.photoTypes, photoMaxBytes: meta.data.limits.photoMaxBytes }}
```

In `src/components/editor/conflict-panel.tsx`, replace the `display` function with:

```ts
/** A readable value: text for the body, lists joined, the photo's alt and credit, a dash for empty. Shown only in the browser. */
function display(key: FieldKey, value: EditableFields[FieldKey]): string {
  if (value === null || value === "") return "—";
  if (Array.isArray(value)) return value.join(", ") || "—";
  if (typeof value === "object") return [value.alt, value.credit].filter(Boolean).join(" · ") || "—";
  if (key !== "content") return value;
  const text = new DOMParser().parseFromString(value, "text/html").body.textContent ?? "";
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 240 ? `${flat.slice(0, 240)}…` : flat || "—";
}
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `pnpm test && pnpm lint && pnpm typecheck && pnpm e2e`

Expected:
- **unit:** PASS, 197 + 4 = 201
- **lint and typecheck:** exit 0
- **e2e:** PASS, 46 + 6 = 52

- [ ] **Step 10: Commit**

```bash
git add src messages tests
git commit -m "feat: editor photo panel with Pexels search, upload, remove, and alt text and credit saved with the post"
```

---

### Task 6: Publish now and export in the editor; actions wait while someone else holds the lock

**Files:**
- Create: `src/components/editor/export-buttons.tsx`
- Modify:
  - `src/components/editor/action-bar.tsx`, `src/components/editor/editor-footer.tsx`, `src/components/editor/post-editor.tsx`
  - `tests/e2e/helpers.ts`, `messages/en.json`, `messages/ar.json`
- Test: `tests/e2e/publish.spec.ts` (create)

**Interfaces:**
- Consumes: Task 4 `publishPostAction`, `exportPostAction`, `ExportedFile`; M2a `ConfirmDialog`, `approvalMode`, `LockBanner`
- Produces:
  - **Components:**
    - `<ActionBar … lockedBy onLocked />`: every action is disabled while `lockedBy !== null`; a `locked` reply calls `onLocked(by)` instead of showing an error
    - `EditorFooterProps` gains `lockedBy: string | null; onLocked: (by: string) => void`
    - `<ExportButtons locale postId />`
  - **Test ids:** `publish`, `publish-confirm`, `publish-needs-approval`, `published-link`, `export-html`, `export-md`
  - **E2E helper:** `pageInSharedStore(browser, store, user)`

- [ ] **Step 1: Write the failing e2e test**

Add to `tests/e2e/helpers.ts`:

```ts
import type { Browser, Page } from "@playwright/test";

/** A page for `user` on a mock engine shared with other pages (same store namespace), for two-person tests. */
export async function pageInSharedStore(browser: Browser, store: string, user: TestUser): Promise<Page> {
  const context = await browser.newContext();
  await context.addCookies([
    { name: "mock_store", value: store, url: BASE_URL },
    { name: "dev_session", value: user, url: BASE_URL },
  ]);
  return context.newPage();
}
```

Merge the type import with the existing `import type { BrowserContext } from "@playwright/test";` into `import type { Browser, BrowserContext, Page } from "@playwright/test";`.

```ts
// tests/e2e/publish.spec.ts
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { isolateMockStore, pageInSharedStore, signInWithCookie } from "./helpers";

test.beforeEach(async ({ context }) => {
  await isolateMockStore(context);
  await signInWithCookie(context, "dev_reviewer");
});

test("publish now from the editor publishes the post and links to it live", async ({ page }) => {
  await page.goto("/en/review/p_201");
  await page.getByTestId("publish").click();
  await page.getByTestId("publish-confirm").click();
  await expect(page.getByTestId("post-status")).toHaveText("Published");
  await expect(page.getByTestId("published-link")).toHaveAttribute("href", "https://fakhernco.com/commission-payable-uae-labour-law/");
});

test("an Arabic twin whose structure doesn't match can't be published (spec v1.1 §10)", async ({ page }) => {
  await page.goto("/en/review/p_205");
  await expect(page.getByTestId("publish")).toBeDisabled();
  await expect(page.getByTestId("approve-blocked")).toBeVisible();
});

test("a post with a critical finding is approved with a reason before it can be published", async ({ page }) => {
  await page.goto("/en/review/p_203");
  await expect(page.getByTestId("publish")).toBeDisabled();
  await expect(page.getByTestId("publish-needs-approval")).toBeVisible();
});

test("exports Markdown and HTML through the dashboard's own server", async ({ page }) => {
  await page.goto("/en/review/p_201");
  const [markdown] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-md").click()]);
  expect(markdown.suggestedFilename()).toBe("commission-payable-uae-labour-law.md");
  expect(await readFile(await markdown.path(), "utf8")).toContain("## When the commission is earned");
  const [html] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-html").click()]);
  expect(html.suggestedFilename()).toBe("commission-payable-uae-labour-law.html");
});

test("while someone else holds the lock, the actions wait for Take over (M2a follow-up)", async ({ page }) => {
  await page.goto("/en/review/p_208");
  await expect(page.getByTestId("lock-banner")).toBeVisible();
  await expect(page.getByTestId("approve")).toBeDisabled();
  await expect(page.getByTestId("publish")).toBeDisabled();
  await page.getByTestId("takeover").click();
  await expect(page.getByTestId("approve")).toBeEnabled();
});

test("an action refused because someone else took over shows the lock banner, not an error", async ({ browser }) => {
  const store = `t${Date.now().toString(36)}lock`;
  const me = await pageInSharedStore(browser, store, "dev_reviewer");
  await me.goto("/en/review/p_201");
  await expect(me.getByTestId("field-title")).toBeEnabled();
  const other = await pageInSharedStore(browser, store, "dev_admin");
  await other.goto("/en/review/p_201");
  await other.getByTestId("takeover").click();
  await expect(other.getByTestId("lock-banner")).toHaveCount(0);

  await me.getByTestId("approve").click();
  await expect(me.getByTestId("lock-banner")).toContainText("admin@example.com");
  await expect(me.getByTestId("action-error")).toHaveCount(0);
  await expect(me.getByTestId("post-status")).toHaveText("Waiting for review");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm e2e tests/e2e/publish.spec.ts`

Expected: FAIL.
- `publish` and `export-md` don't exist
- p_208's approve button stays enabled while locked
- the takeover race shows an `action-error` instead of the banner

- [ ] **Step 3: Add the messages**

Inside `Editor` in `messages/en.json`, add:

```json
    "publishNow": "Publish now",
    "publishTitle": "Publish this post now?",
    "publishBody": "It goes live right away. Publishing now doesn't use up today's allowance.",
    "publishBodyPending": "This approves the post and publishes it right away.",
    "publishNeedsApproval": "Approve it with a reason first; then it can be published.",
    "viewLive": "View it live",
    "exportHtml": "Export HTML",
    "exportMarkdown": "Export Markdown"
```

Inside `Editor` in `messages/ar.json`:

```json
    "publishNow": "انشر الآن",
    "publishTitle": "نشر هذا المنشور الآن؟",
    "publishBody": "سيُنشر فوراً. النشر الآن لا يُحتسب من حصة اليوم.",
    "publishBodyPending": "سيُعتمد المنشور ويُنشر فوراً.",
    "publishNeedsApproval": "اعتمده مع ذكر السبب أولاً، ثم يمكن نشره.",
    "viewLive": "عرضه منشوراً",
    "exportHtml": "تصدير HTML",
    "exportMarkdown": "تصدير Markdown"
```

- [ ] **Step 4: Add the export buttons**

```tsx
// src/components/editor/export-buttons.tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { exportPostAction, type ExportedFile } from "@/app/[locale]/(app)/review/actions";
import { ActionError } from "@/components/actions/action-error";
import { Button } from "@/components/ui/button";
import { NETWORK_FAILURE } from "@/lib/actions/result";
import type { EngineFailure } from "@/lib/engine/result";

/** Saves the export in the browser. The file came through our server, so the engine's key never reached the browser. */
function saveFile(file: ExportedFile) {
  const url = URL.createObjectURL(new Blob([file.body], { type: file.contentType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = file.filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function ExportButtons({ locale, postId }: { locale: string; postId: string }) {
  const t = useTranslations("Editor");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<EngineFailure | null>(null);

  async function exportAs(format: "html" | "md") {
    setError(null);
    setPending(true);
    try {
      const result = await exportPostAction({ locale, postId, format });
      if (result.ok) saveFile(result.data);
      else setError(result.error);
    } catch {
      setError(NETWORK_FAILURE);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" data-testid="export-html" disabled={pending} onClick={() => void exportAs("html")}>
        {t("exportHtml")}
      </Button>
      <Button variant="outline" size="sm" data-testid="export-md" disabled={pending} onClick={() => void exportAs("md")}>
        {t("exportMarkdown")}
      </Button>
      {error && <ActionError error={error} />}
    </div>
  );
}
```

- [ ] **Step 5: Add Publish now and lock-aware actions to the action bar**

Replace `src/components/editor/action-bar.tsx` with:

```tsx
"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import {
  approvePostAction,
  deletePostAction,
  publishPostAction,
  rejectPostAction,
  requestChangesAction,
} from "@/app/[locale]/(app)/review/actions";
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

type Props = {
  locale: string;
  post: Post;
  dirty: boolean;
  pollSeconds: number;
  lockedBy: string | null;
  onLocked: (by: string) => void;
};

/** Buttons come from post.actions (spec v1.1 §5); approval and publishing follow the findings. Nothing runs while someone else holds the lock. */
export function ActionBar({ locale, post, dirty, pollSeconds, lockedBy, onLocked }: Props) {
  const t = useTranslations("Editor");
  const router = useRouter();
  const approve = useEngineAction(approvePostAction);
  const changes = useEngineAction(requestChangesAction);
  const reject = useEngineAction(rejectPostAction);
  const remove = useEngineAction(deletePostAction);
  const publish = useEngineAction(publishPostAction);
  const [error, setError] = useState<EngineFailure | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  // A full reload: the editor keeps its own form state, so only a fresh page shows the redrafted content.
  const finishJob = useCallback(() => window.location.reload(), []);

  const allowed = new Set(post.actions);
  const mode = approvalMode(post.findings);
  const locked = lockedBy !== null;
  // Publishing straight from review needs what approval needs; with a critical finding, approve with a reason first.
  const publishable = post.status !== "pending" || mode === "direct";

  /** A refusal because someone else took the lock shows the lock banner (with Take over) instead of an error. */
  function refusal(failure: EngineFailure): EngineFailure | null {
    if (failure.code !== "locked") return failure;
    onLocked(String(failure.details?.lockedBy ?? ""));
    return null;
  }

  async function approveDirectly() {
    setError(null);
    const result = await approve.run({ locale, postId: post.id });
    if (!result.ok) setError(refusal(result.error));
  }

  const approveWithReason = async (reason: string) => {
    const result = await approve.run({ locale, postId: post.id, overrideReason: reason });
    return result.ok ? null : refusal(result.error);
  };
  const askForChanges = async (note: string) => {
    const result = await changes.run({ locale, postId: post.id, note });
    if (!result.ok) return refusal(result.error);
    setJobId(result.data.jobId);
    return null;
  };
  const rejectPost = async (note: string) => {
    const result = await reject.run({ locale, postId: post.id, note: note || undefined });
    return result.ok ? null : refusal(result.error);
  };
  const deletePost = async () => {
    const result = await remove.run({ locale, postId: post.id });
    if (!result.ok) return refusal(result.error);
    router.push("/review");
    return null;
  };
  const publishPost = async () => {
    const result = await publish.run({ locale, postId: post.id });
    return result.ok ? null : refusal(result.error);
  };

  return (
    <div className="flex flex-col gap-2">
      {jobId && <JobProgress locale={locale} jobId={jobId} pollSeconds={pollSeconds} onDone={finishJob} />}
      {!jobId && post.status === "drafting" && <StatusWatcher locale={locale} postId={post.id} status={post.status} pollSeconds={pollSeconds} />}
      <div className="flex flex-wrap items-center gap-2">
        {allowed.has("approve") && mode === "direct" && (
          <Button data-testid="approve" disabled={dirty || locked || approve.pending} onClick={() => void approveDirectly()}>
            {t("approve")}
          </Button>
        )}
        {allowed.has("approve") && mode === "override" && (
          <ConfirmDialog
            testId="approve"
            triggerVariant="default"
            triggerLabel={t("approve")}
            disabled={dirty || locked}
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
        {allowed.has("publishNow") && (
          <ConfirmDialog
            testId="publish"
            triggerVariant="secondary"
            triggerLabel={t("publishNow")}
            disabled={dirty || locked || !publishable}
            title={t("publishTitle")}
            description={post.status === "pending" ? t("publishBodyPending") : t("publishBody")}
            confirmLabel={t("publishNow")}
            pending={publish.pending}
            onConfirm={publishPost}
          />
        )}
        {allowed.has("changes") && (
          <ConfirmDialog
            testId="changes"
            triggerLabel={t("changes")}
            disabled={locked}
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
            disabled={locked}
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
            disabled={locked}
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
      {allowed.has("publishNow") && post.status === "pending" && mode === "override" && (
        <p data-testid="publish-needs-approval" className="text-sm text-muted-foreground">
          {t("publishNeedsApproval")}
        </p>
      )}
      {(allowed.has("approve") || allowed.has("publishNow")) && mode !== "blocked" && dirty && (
        <p className="text-sm text-muted-foreground">{t("saveFirst")}</p>
      )}
      {error && <ActionError error={error} />}
    </div>
  );
}
```

- [ ] **Step 6: Wire the footer and the editor**

Replace `src/components/editor/editor-footer.tsx` with:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { Post } from "@/lib/engine/schemas";
import { ActionBar } from "./action-bar";
import { ExportButtons } from "./export-buttons";

export type EditorFooterProps = {
  locale: string;
  post: Post;
  dirty: boolean;
  editable: boolean;
  saving: boolean;
  onSave: () => void;
  pollSeconds: number;
  lockedBy: string | null;
  onLocked: (by: string) => void;
};

export function EditorFooter({ locale, post, dirty, editable, saving, onSave, pollSeconds, lockedBy, onLocked }: EditorFooterProps) {
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
        <div className="ms-auto">
          <ExportButtons locale={locale} postId={post.id} />
        </div>
      </div>
      <ActionBar locale={locale} post={post} dirty={dirty} pollSeconds={pollSeconds} lockedBy={lockedBy} onLocked={onLocked} />
    </div>
  );
}
```

In `src/components/editor/post-editor.tsx`:

(a) Delete the line `const takeLock = useEngineAction(lockPostAction).run;`.

(b) Replace the lock effect with the version below. Each renewal now sends a fresh key: a reused key after a lost answer would replay the first lock instead of extending it (M2a follow-up).

```ts
  // Spec v1.1 §3: take the lock on open, renew it while editing, release it on leaving.
  useEffect(() => {
    if (!canEdit) return;
    let active = true;
    async function acquire() {
      const result = await lockPostAction({ locale, postId: post.id, idempotencyKey: crypto.randomUUID() }).catch(() => null);
      if (!active || !result) return;
      setLockedBy(!result.ok && result.error.code === "locked" ? String(result.error.details?.lockedBy ?? "") : null);
    }
    void acquire();
    const timer = setInterval(acquire, Math.max(30, lockMinutes * 30) * 1000);
    return () => {
      active = false;
      clearInterval(timer);
      void unlockPostAction({ locale, postId: post.id, idempotencyKey: crypto.randomUUID() });
    };
  }, [canEdit, locale, lockMinutes, post.id]);
```

(c) In the header row, after the `save-status` span, add:

```tsx
        {current.published && (
          <a href={current.published.url} target="_blank" rel="noopener noreferrer" dir="ltr" data-testid="published-link" className="text-sm text-primary underline">
            {t("viewLive")}
          </a>
        )}
```

(d) Add `lockedBy={lockedBy}` and `onLocked={setLockedBy}` to `<EditorFooter … />`.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm e2e`

Expected:
- **lint and typecheck:** exit 0
- **unit:** PASS (201)
- **e2e:** PASS, 52 + 6 = 58

- [ ] **Step 8: Commit**

```bash
git add src messages tests/e2e
git commit -m "feat: publish now and HTML/Markdown export in the editor; actions wait while someone else holds the lock"
```

---
### Task 7: The Scheduled page

**Files:**
- Create: `src/app/[locale]/(app)/scheduled/page.tsx`, `src/components/schedule/scheduled-queue.tsx`, `src/components/schedule/schedule-board.tsx`
- Modify: `src/components/shell/nav.ts`, `messages/en.json`, `messages/ar.json`
- Test: `tests/e2e/scheduled.spec.ts` (create)

**Interfaces:**
- Consumes:
  - Task 1 `scheduled()` and `PostSummary.actions`
  - Task 4 `holdPostAction`, `publishPostAction`, `bulkPostsAction`
  - M1 `nextSlotView`, `formatDateTime`, `EngineNotice`
  - M2a `ConfirmDialog`, `bulkFailureLines`
- Produces:
  - **Navigation:** nav item `scheduled` (`content.work`)
  - **Components:**
    - `type QueueItem = { id; title; language; platform; position: number | null; hold: boolean; time: string | null; actions: string[] }`
    - `<ScheduleBoard locale items />`
  - **Messages:** `Review.platforms`
  - **Test ids:**
    - `schedule-banner`, `scheduled-empty`
    - per row: `scheduled-row-{id}`, `scheduled-select-{id}`, `scheduled-position-{id}`, `scheduled-title-{id}`, `scheduled-time-{id}`, `scheduled-hold-{id}`
    - per-row buttons: `hold-{id}`, `resume-{id}`, `publish-{id}` (and `-confirm`)
    - bulk: `publish-selected` (and `-confirm`)

- [ ] **Step 1: Write the failing e2e test**

```ts
// tests/e2e/scheduled.spec.ts
import { expect, test } from "@playwright/test";
import { isolateMockStore, normalizeSpaces, setMockScenario, signInWithCookie } from "./helpers";

test.beforeEach(async ({ context }) => {
  await isolateMockStore(context);
  await signInWithCookie(context, "dev_reviewer");
});

test("lists the queue in order with 12-hour Dubai times; a held post shows On hold (Review Focus 3)", async ({ page }) => {
  await page.goto("/en/scheduled");
  await expect(page.getByTestId("schedule-banner")).toContainText("10:00");
  const rows = page.locator('[data-testid^="scheduled-row-"]');
  await expect(rows).toHaveCount(3);
  expect(await rows.evaluateAll((items) => items.map((item) => item.getAttribute("data-testid")))).toEqual([
    "scheduled-row-p_101",
    "scheduled-row-p_102",
    "scheduled-row-p_103",
  ]);
  const time = normalizeSpaces(await page.getByTestId("scheduled-time-p_101").innerText());
  expect(time).toContain("10:00");
  expect(time).toContain("AM");
  await expect(page.getByTestId("scheduled-hold-p_103")).toHaveText("On hold");
  await expect(page.getByTestId("scheduled-time-p_103")).toHaveText("Not scheduled");
});

test("holding the first post moves the next one up; resuming puts it back", async ({ page }) => {
  await page.goto("/en/scheduled");
  await page.getByTestId("hold-p_101").click();
  await expect(page.getByTestId("scheduled-hold-p_101")).toBeVisible();
  await expect(page.getByTestId("scheduled-time-p_102")).toContainText("10:00");
  await page.getByTestId("resume-p_101").click();
  await expect(page.getByTestId("scheduled-time-p_101")).toContainText("10:00");
});

test("publish now sends one post out and leaves its Arabic twin in the queue", async ({ page }) => {
  await page.goto("/en/scheduled");
  await page.getByTestId("publish-p_101").click();
  await page.getByTestId("publish-p_101-confirm").click();
  await expect(page.getByTestId("scheduled-row-p_101")).toHaveCount(0);
  await expect(page.getByTestId("scheduled-row-p_102")).toBeVisible();
});

test("bulk publish now publishes the selected posts", async ({ page }) => {
  await page.goto("/en/scheduled");
  await page.getByTestId("scheduled-select-p_101").check();
  await page.getByTestId("scheduled-select-p_103").check();
  await page.getByTestId("publish-selected").click();
  await page.getByTestId("publish-selected-confirm").click();
  await expect(page.getByTestId("scheduled-row-p_101")).toHaveCount(0);
  await expect(page.getByTestId("scheduled-row-p_103")).toHaveCount(0);
});

test("with auto-publish off, the banner says so and nothing has a time (spec v1.1 §10)", async ({ page, context }) => {
  await setMockScenario(context, "manual");
  await page.goto("/en/scheduled");
  await expect(page.getByTestId("schedule-banner")).toHaveText("Auto-publish is off. Nothing goes out until someone presses Publish now.");
  await expect(page.getByTestId("scheduled-time-p_101")).toHaveText("Not scheduled");
});

test("the nav links to Scheduled, and Arabic titles read right to left", async ({ page }) => {
  await page.goto("/en");
  await page.getByTestId("nav-scheduled").click();
  await expect(page).toHaveURL(/\/en\/scheduled$/);
  await expect(page.getByTestId("scheduled-title-p_102").filter({ visible: true })).toHaveAttribute("dir", "rtl");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm e2e tests/e2e/scheduled.spec.ts`

Expected: FAIL. `/en/scheduled` is a 404, and `nav-scheduled` doesn't exist.

- [ ] **Step 3: Add the messages and the nav item**

In `src/components/shell/nav.ts`, add `{ key: "scheduled", href: "/scheduled", permission: "content.work" },` after the `review` item.

`messages/en.json`:
- inside `Shell.nav`, add `"scheduled": "Scheduled"`
- inside `Review`, add `"platforms": { "website": "Website", "linkedin": "LinkedIn", "instagram": "Instagram" }`
- at the top level, add:

```json
  "Scheduled": {
    "title": "Scheduled",
    "empty": "Nothing is queued.",
    "bannerSlot": "Auto-publish is on. Next slot: {time}.",
    "onHold": "On hold",
    "noTime": "Not scheduled",
    "hold": "Hold",
    "resume": "Resume",
    "select": "Select “{title}”",
    "publishNow": "Publish now",
    "publishTitle": "Publish this post now?",
    "publishBody": "It goes live right away. Publishing now doesn't use up today's allowance.",
    "publishSelected": "Publish selected ({count})",
    "publishSelectedTitle": "Publish the selected posts now?",
    "bulkFailed": "Not published:"
  }
```

`messages/ar.json`:
- inside `Shell.nav`, add `"scheduled": "المجدولة"`
- inside `Review`, add `"platforms": { "website": "الموقع", "linkedin": "لينكدإن", "instagram": "إنستغرام" }`
- at the top level, add:

```json
  "Scheduled": {
    "title": "المجدولة",
    "empty": "لا يوجد شيء في قائمة الانتظار.",
    "bannerSlot": "النشر التلقائي يعمل. الموعد التالي: {time}.",
    "onHold": "معلّق",
    "noTime": "غير مجدول",
    "hold": "تعليق",
    "resume": "استئناف",
    "select": "تحديد «{title}»",
    "publishNow": "انشر الآن",
    "publishTitle": "نشر هذا المنشور الآن؟",
    "publishBody": "سيُنشر فوراً. النشر الآن لا يُحتسب من حصة اليوم.",
    "publishSelected": "نشر المحدد ({count})",
    "publishSelectedTitle": "نشر المنشورات المحددة الآن؟",
    "bulkFailed": "لم يُنشر:"
  }
```

- [ ] **Step 4: Add the board, the queue and the page**

```tsx
// src/components/schedule/schedule-board.tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { bulkPostsAction, holdPostAction, publishPostAction } from "@/app/[locale]/(app)/review/actions";
import { ActionError } from "@/components/actions/action-error";
import { ConfirmDialog } from "@/components/editor/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { useEngineAction } from "@/lib/actions/use-engine-action";
import type { EngineFailure } from "@/lib/engine/result";
import { bulkFailureLines } from "@/lib/review/summary";

/** One queued post, with its expected time already formatted in the site's timezone (on the server). */
export type QueueItem = {
  id: string;
  title: string;
  language: string;
  platform: string;
  position: number | null;
  hold: boolean;
  time: string | null;
  actions: string[];
};

/** Spec v1.1 §6 /scheduled: the queue in order; hold, resume and publish now, one by one or in bulk. */
export function ScheduleBoard({ locale, items }: { locale: string; items: QueueItem[] }) {
  const t = useTranslations("Scheduled");
  const tReview = useTranslations("Review");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [failures, setFailures] = useState<{ id: string; title: string; message: string }[]>([]);
  const [error, setError] = useState<EngineFailure | null>(null);
  const hold = useEngineAction(holdPostAction);
  const publish = useEngineAction(publishPostAction);
  const bulk = useEngineAction(bulkPostsAction);
  const chosen = [...selected].filter((id) => items.some((item) => item.id === id && item.actions.includes("publishNow")));
  const label = (group: "languages" | "platforms", code: string) => (tReview.has(`${group}.${code}`) ? tReview(`${group}.${code}`) : code);

  function toggle(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function setHold(id: string, held: boolean) {
    setError(null);
    const result = await hold.run({ locale, postId: id, hold: held });
    if (!result.ok) setError(result.error);
  }

  const publishOne = (id: string) => async () => {
    const result = await publish.run({ locale, postId: id });
    return result.ok ? null : result.error;
  };

  async function publishSelected() {
    const result = await bulk.run({ locale, action: "publishNow", ids: chosen });
    if (!result.ok) return result.error;
    setFailures(bulkFailureLines(result.data, items));
    setSelected(new Set(result.data.failed.map((failure) => failure.id)));
    return null;
  }

  if (items.length === 0) {
    return (
      <p data-testid="scheduled-empty" className="text-muted-foreground">
        {t("empty")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ConfirmDialog
        testId="publish-selected"
        triggerVariant="default"
        triggerLabel={t("publishSelected", { count: String(chosen.length) })}
        disabled={chosen.length === 0}
        title={t("publishSelectedTitle")}
        description={t("publishBody")}
        confirmLabel={t("publishNow")}
        pending={bulk.pending}
        onConfirm={publishSelected}
      />
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
      <ol className="flex flex-col gap-3">
        {items.map((item) => (
          <li key={item.id} data-testid={`scheduled-row-${item.id}`} className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-4">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              data-testid={`scheduled-select-${item.id}`}
              aria-label={t("select", { title: item.title })}
              checked={selected.has(item.id)}
              disabled={!item.actions.includes("publishNow")}
              onChange={(event) => toggle(item.id, event.target.checked)}
            />
            <span data-testid={`scheduled-position-${item.id}`} className="w-6 text-center font-mono text-sm text-muted-foreground">
              {item.position ?? "—"}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <Link
                href={`/review/${item.id}`}
                lang={item.language}
                dir={item.language === "ar" ? "rtl" : "ltr"}
                data-testid={`scheduled-title-${item.id}`}
                className="font-medium hover:underline"
              >
                {item.title}
              </Link>
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="outline">{label("languages", item.language)}</Badge>
                <Badge variant="outline">{label("platforms", item.platform)}</Badge>
                {item.hold && (
                  <Badge variant="secondary" data-testid={`scheduled-hold-${item.id}`}>
                    {t("onHold")}
                  </Badge>
                )}
              </div>
            </div>
            <span data-testid={`scheduled-time-${item.id}`} className="text-sm">
              {item.time ?? t("noTime")}
            </span>
            {item.actions.includes("hold") && (
              <Button variant="outline" size="sm" data-testid={`hold-${item.id}`} disabled={hold.pending} onClick={() => void setHold(item.id, true)}>
                {t("hold")}
              </Button>
            )}
            {item.actions.includes("resume") && (
              <Button variant="outline" size="sm" data-testid={`resume-${item.id}`} disabled={hold.pending} onClick={() => void setHold(item.id, false)}>
                {t("resume")}
              </Button>
            )}
            {item.actions.includes("publishNow") && (
              <ConfirmDialog
                testId={`publish-${item.id}`}
                triggerLabel={t("publishNow")}
                title={t("publishTitle")}
                description={t("publishBody")}
                confirmLabel={t("publishNow")}
                pending={publish.pending}
                onConfirm={publishOne(item.id)}
              />
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
```

```tsx
// src/components/schedule/scheduled-queue.tsx
import { getTranslations } from "next-intl/server";
import { EngineNotice } from "@/components/dashboard/engine-notice";
import { SkippedNote } from "@/components/lists/skipped-note";
import type { AppLocale } from "@/i18n/locales";
import { requirePermission } from "@/lib/auth/session";
import { nextSlotView } from "@/lib/dashboard/next-slot";
import { getEngine } from "@/lib/engine";
import { tryEngine } from "@/lib/engine/result";
import { formatDateTime } from "@/lib/format/datetime";
import { cn } from "@/lib/utils";
import { ScheduleBoard, type QueueItem } from "./schedule-board";

/** Spec v1.1 §6 /scheduled: the banner (auto-publish state and next slot, or why nothing is going out) and the queue. */
export async function ScheduledQueue({ locale }: { locale: AppLocale }) {
  await requirePermission(locale, "content.work");
  const t = await getTranslations("Scheduled");
  const tSlot = await getTranslations("Dashboard.nextSlot");
  const engine = await getEngine();
  const [scheduled, site] = await Promise.all([tryEngine(() => engine.scheduled()), tryEngine(() => engine.siteTimezone())]);
  if (!scheduled.ok) return <EngineNotice error={scheduled.error} />;
  if (!site.ok) return <EngineNotice error={site.error} />;
  const timeZone = site.data.timezone;

  const view = nextSlotView(scheduled.data);
  const banner =
    view.kind === "slot"
      ? t("bannerSlot", { time: formatDateTime(view.at, { timeZone, locale }) })
      : view.kind === "off"
        ? tSlot("off")
        : tSlot("waiting", { reason: tSlot.has(`reasons.${view.reason}`) ? tSlot(`reasons.${view.reason}`) : view.reason });

  const items: QueueItem[] = scheduled.data.posts.map((post) => ({
    id: post.id,
    title: post.title,
    language: post.language,
    platform: post.platform,
    position: post.schedule?.position ?? null,
    hold: post.schedule?.hold ?? false,
    time: post.schedule?.scheduledAt ? formatDateTime(post.schedule.scheduledAt, { timeZone, locale }) : null,
    actions: post.actions,
  }));

  return (
    <div className="flex flex-col gap-4">
      <p
        role="status"
        data-testid="schedule-banner"
        className={cn("rounded-md px-3 py-2 text-sm", view.kind === "slot" ? "bg-ok-bg text-ok-fg" : "bg-warn-bg text-warn-fg")}
      >
        {banner}
      </p>
      <SkippedNote count={scheduled.data.skipped} />
      <ScheduleBoard locale={locale} items={items} />
    </div>
  );
}
```

```tsx
// src/app/[locale]/(app)/scheduled/page.tsx
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SectionSkeleton } from "@/components/dashboard/section-skeleton";
import { ScheduledQueue } from "@/components/schedule/scheduled-queue";
import { asAppLocale } from "@/i18n/locales";

export default async function ScheduledPage({ params }: PageProps<"/[locale]/scheduled">) {
  const locale = asAppLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("Scheduled");
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl">{t("title")}</h1>
      <Suspense fallback={<SectionSkeleton />}>
        <ScheduledQueue locale={locale} />
      </Suspense>
    </div>
  );
}
```

`ScheduledQueue` uses `SkippedNote`, which Task 8 adds to the History list as well. Create it now:

```tsx
// src/components/lists/skipped-note.tsx
import { getTranslations } from "next-intl/server";

/** Items the engine sent in an unexpected shape are left out of a list; this says how many (never a blank page). */
export async function SkippedNote({ count }: { count: number }) {
  if (count === 0) return null;
  const t = await getTranslations("Lists");
  return (
    <p role="status" data-testid="list-skipped" className="rounded-md bg-warn-bg px-3 py-2 text-sm text-warn-fg">
      {t("skipped", { count, n: String(count) })}
    </p>
  );
}
```

Add the `Lists` messages at the top level of `messages/en.json`:

```json
  "Lists": {
    "pages": "Pages",
    "previous": "Previous",
    "next": "Next",
    "pageOf": "Page {page} of {count}",
    "pageEmpty": "There's nothing on this page.",
    "firstPage": "Go to the first page",
    "skipped": "{count, plural, one {{n} item couldn't be shown because the content engine sent it in an unexpected format.} other {{n} items couldn't be shown because the content engine sent them in an unexpected format.}}"
  }
```

and of `messages/ar.json`:

```json
  "Lists": {
    "pages": "الصفحات",
    "previous": "السابق",
    "next": "التالي",
    "pageOf": "الصفحة {page} من {count}",
    "pageEmpty": "لا يوجد شيء في هذه الصفحة.",
    "firstPage": "الانتقال إلى الصفحة الأولى",
    "skipped": "{count, plural, one {تعذّر عرض عنصر واحد لأن محرك المحتوى أرسله بصيغة غير متوقعة.} two {تعذّر عرض عنصرين لأن محرك المحتوى أرسلهما بصيغة غير متوقعة.} few {تعذّر عرض {n} عناصر لأن محرك المحتوى أرسلها بصيغة غير متوقعة.} many {تعذّر عرض {n} عنصراً لأن محرك المحتوى أرسلها بصيغة غير متوقعة.} other {تعذّر عرض {n} عنصر لأن محرك المحتوى أرسلها بصيغة غير متوقعة.}}"
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm e2e`

Expected:
- **lint and typecheck:** exit 0
- **unit:** PASS (201). `nav.test.ts` still passes: both roles see every content item.
- **e2e:** PASS, 58 + 6 = 64

- [ ] **Step 6: Commit**

```bash
git add src messages tests/e2e
git commit -m "feat: Scheduled page with the queue, Dubai times, hold/resume, publish now and bulk publish"
```

---

### Task 8: The History page, list paging, bulk publish in Review, and drifted list items

**Files:**
- Create:
  - `src/lib/lists/paging.ts`, `src/components/lists/pager.tsx`
  - `src/app/[locale]/(app)/history/page.tsx`
  - `src/components/history/history-list.tsx`, `src/components/history/history-board.tsx`
- Modify:
  - `src/components/shell/nav.ts`
  - `src/app/[locale]/(app)/review/page.tsx`
  - `src/components/review/review-queue.tsx`, `src/components/review/review-board.tsx`, `src/components/review/post-card.tsx`
  - `src/lib/engine/mock/server.ts`, `messages/en.json`, `messages/ar.json`
- Test: `tests/unit/paging.test.ts` (create), `tests/e2e/history.spec.ts` (create), `tests/e2e/review.spec.ts` (append)

**Interfaces:**
- Consumes:
  - Task 1 `listPosts({…, page, sort})` with `skipped`
  - Task 4 `publishPostAction`, `bulkPostsAction`
  - Task 7 `SkippedNote`, `Lists` messages, `Review.platforms`
- Produces:
  - **Paging:** `requestedPage(value)`, `pageCount(meta)`, `<Pager pathname page pages />`
  - **History:** `type HistoryEntry`, `<HistoryBoard locale entries />`, `<HistoryList locale searchParams />`
  - **Review:**
    - `ReviewQueue` takes `searchParams`
    - `ReviewBoard` adds bulk Publish now: `publish-selected` (and `-confirm`)
  - **Mock:** the `drift` scenario adds one malformed post to `GET …/posts` and `GET …/scheduled`
  - **Test ids:**
    - history: `history-item-{id}`, `history-status-{id}`, `history-target-{id}`, `history-url-{id}`, `history-time-{id}`, `history-override-{id}`, `history-note-{id}`, `history-error-{id}`, `history-retry-{id}`, `history-empty`
    - lists: `list-page-empty`, `list-first-page`, `pager`, `pager-previous`, `pager-status`, `pager-next`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/paging.test.ts
import { describe, expect, it } from "vitest";
import { pageCount, requestedPage } from "@/lib/lists/paging";

describe("list paging (spec v1.1 §3 Lists)", () => {
  it("reads ?page=, treating a missing or bad value as page 1", () => {
    expect([requestedPage(undefined), requestedPage("3"), requestedPage("0"), requestedPage("abc"), requestedPage(["2", "5"])]).toEqual([1, 3, 1, 1, 2]);
  });

  it("counts pages from the engine's list meta", () => {
    expect([pageCount(null), pageCount({ pageSize: 25, total: 0 }), pageCount({ pageSize: 25, total: 25 }), pageCount({ pageSize: 25, total: 26 })]).toEqual([1, 1, 1, 2]);
  });
});
```

```ts
// tests/e2e/history.spec.ts
import { expect, test } from "@playwright/test";
import { isolateMockStore, normalizeSpaces, setMockScenario, signInWithCookie } from "./helpers";

test.beforeEach(async ({ context }) => {
  await isolateMockStore(context);
  await signInWithCookie(context, "dev_reviewer");
});

test("lists published, failed and rejected posts with live links, times, targets and override reasons", async ({ page }) => {
  await page.goto("/en/history");
  await expect(page.getByTestId("history-url-p_301")).toHaveAttribute("href", "https://fakhernco.com/probation-period-uae-labour-law/");
  const time = normalizeSpaces(await page.getByTestId("history-time-p_301").innerText());
  expect(time).toContain("10:00");
  expect(time).toContain("AM");
  await expect(page.getByTestId("history-target-p_301")).toHaveText("WordPress");
  await expect(page.getByTestId("history-override-p_301")).toContainText("Length agreed with the client");
  await expect(page.getByTestId("history-error-p_303")).toHaveText("WordPress refused the request: 503 Service Unavailable.");
  await expect(page.getByTestId("history-note-p_304")).toContainText("Off-topic for this quarter");
  await expect(page.getByTestId("pager")).toHaveCount(0);
});

test("Retry after a refused publish is a new attempt, and the next one goes through (Review Focus 1)", async ({ page }) => {
  await page.goto("/en/history");
  const item = page.getByTestId("history-item-p_303");
  await item.getByTestId("history-retry-p_303").click();
  await expect(item.getByTestId("action-error")).toHaveText("WordPress refused the request: 503 Service Unavailable.");
  await item.getByTestId("history-retry-p_303").click();
  await expect(page.getByTestId("history-status-p_303")).toHaveText("Published");
  await expect(page.getByTestId("history-url-p_303")).toHaveAttribute("href", "https://fakhernco.com/gratuity-part-time-employees-uae/");
});

test("a post published from Scheduled shows first in History", async ({ page }) => {
  await page.goto("/en/scheduled");
  await page.getByTestId("publish-p_101").click();
  await page.getByTestId("publish-p_101-confirm").click();
  await expect(page.getByTestId("scheduled-row-p_101")).toHaveCount(0);
  await page.goto("/en/history");
  await expect(page.locator('[data-testid^="history-item-"]').first()).toHaveAttribute("data-testid", "history-item-p_101");
});

test("a page past the end says so and links back to the first page", async ({ page }) => {
  await page.goto("/en/history?page=9");
  await expect(page.getByTestId("list-page-empty")).toBeVisible();
  await page.getByTestId("list-first-page").click();
  await expect(page.getByTestId("history-item-p_301").filter({ visible: true })).toBeVisible();
});

test("a post the engine sent in an unknown shape is skipped with a note; the rest still shows (Review Focus 4)", async ({ page, context }) => {
  await setMockScenario(context, "drift");
  await page.goto("/en/review");
  await expect(page.getByTestId("list-skipped")).toHaveText("1 item couldn't be shown because the content engine sent it in an unexpected format.");
  await expect(page.getByTestId("card-p_201")).toBeVisible();
});
```

Append to `tests/e2e/review.spec.ts`:

```ts
test("bulk publish publishes what it can and names what it couldn't", async ({ page }) => {
  await page.goto("/en/review");
  await page.getByTestId("card-select-p_201").check();
  await page.getByTestId("card-select-p_203").check();
  await page.getByTestId("publish-selected").click();
  await page.getByTestId("publish-selected-confirm").click();
  await expect(page.getByTestId("bulk-failures")).toContainText("Shareholder deadlock: your options under UAE company law");
  await expect(page.getByTestId("card-p_201")).toHaveCount(0);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test tests/unit/paging.test.ts`
Expected: FAIL. `@/lib/lists/paging` can't be resolved.

Then add the paging module (Step 3) so the build compiles, and run: `pnpm e2e tests/e2e/history.spec.ts tests/e2e/review.spec.ts`
Expected: FAIL.
- `/en/history` is a 404
- `list-skipped` and `publish-selected` don't exist

- [ ] **Step 3: Add the paging helpers and the pager**

```ts
// src/lib/lists/paging.ts
/** The page asked for in ?page= (a missing or bad value means page 1). */
export function requestedPage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const page = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(page) && page >= 1 ? page : 1;
}

/** How many pages a list has, from the engine's list meta (spec v1.1 §3 Lists). */
export function pageCount(meta: { pageSize: number; total: number } | null): number {
  return meta && meta.pageSize > 0 ? Math.max(1, Math.ceil(meta.total / meta.pageSize)) : 1;
}
```

```tsx
// src/components/lists/pager.tsx
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

/** Previous · Page n of m · Next for a list page (?page=). Hidden when everything fits on one page. */
export async function Pager({ pathname, page, pages }: { pathname: string; page: number; pages: number }) {
  if (pages <= 1) return null;
  const t = await getTranslations("Lists");
  return (
    <nav aria-label={t("pages")} data-testid="pager" className="flex items-center gap-3 text-sm">
      {page > 1 && (
        <Link href={{ pathname, query: { page: String(page - 1) } }} data-testid="pager-previous" className="text-primary underline">
          {t("previous")}
        </Link>
      )}
      <span data-testid="pager-status">{t("pageOf", { page: String(Math.min(page, pages)), count: String(pages) })}</span>
      {page < pages && (
        <Link href={{ pathname, query: { page: String(page + 1) } }} data-testid="pager-next" className="text-primary underline">
          {t("next")}
        </Link>
      )}
    </nav>
  );
}
```

- [ ] **Step 4: Add the messages and the nav item**

In `src/components/shell/nav.ts`, add `{ key: "history", href: "/history", permission: "content.work" },` after `scheduled`.

`messages/en.json`:
- inside `Shell.nav`: `"history": "History"`
- inside `Review`:

```json
    "publishNow": "Publish now",
    "publishSelected": "Publish selected ({count})",
    "publishSelectedTitle": "Publish the selected posts now?",
    "publishSelectedBody": "Each one is approved and published right away. Posts that need a reason or a photo are skipped and listed.",
    "bulkPublishFailed": "Not published:"
```

- at the top level:

```json
  "History": {
    "title": "History",
    "empty": "Nothing has been published, failed or been rejected yet.",
    "publishedAt": "Published {time}",
    "override": "Approved with an override: {reason}",
    "rejectionNote": "Rejection note: {note}",
    "retry": "Retry",
    "targets": { "wordpress": "WordPress", "strapi": "Strapi", "linkedin": "LinkedIn", "instagram": "Instagram" }
  }
```

`messages/ar.json`:
- inside `Shell.nav`: `"history": "السجل"`
- inside `Review`:

```json
    "publishNow": "انشر الآن",
    "publishSelected": "نشر المحدد ({count})",
    "publishSelectedTitle": "نشر المنشورات المحددة الآن؟",
    "publishSelectedBody": "سيُعتمد كل منشور ويُنشر فوراً. المنشورات التي تحتاج إلى سبب أو صورة تُتخطى وتُذكر بالاسم.",
    "bulkPublishFailed": "لم يُنشر:"
```

- at the top level:

```json
  "History": {
    "title": "السجل",
    "empty": "لم يُنشر أي منشور ولم يفشل أو يُرفض شيء بعد.",
    "publishedAt": "نُشر {time}",
    "override": "اعتُمد مع تجاوز: {reason}",
    "rejectionNote": "ملاحظة الرفض: {note}",
    "retry": "إعادة المحاولة",
    "targets": { "wordpress": "ووردبريس", "strapi": "Strapi", "linkedin": "لينكدإن", "instagram": "إنستغرام" }
  }
```

- [ ] **Step 5: Add the History page**

```tsx
// src/components/history/history-board.tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { publishPostAction } from "@/app/[locale]/(app)/review/actions";
import { ActionError } from "@/components/actions/action-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { useEngineAction } from "@/lib/actions/use-engine-action";
import type { EngineFailure } from "@/lib/engine/result";

/** One History row; the publish time is already formatted in the site's timezone (on the server). */
export type HistoryEntry = {
  id: string;
  title: string;
  language: string;
  status: string;
  platform: string;
  target: string | null;
  url: string | null;
  publishedAt: string | null;
  overrideReason: string | null;
  error: string | null;
  reviewNote: string | null;
  actions: string[];
};

/** Spec v1.1 §6 /history: live URL, publish time, platform, target, override reason and error; Retry for failed posts. */
export function HistoryBoard({ locale, entries }: { locale: string; entries: HistoryEntry[] }) {
  const t = useTranslations("History");
  const tReview = useTranslations("Review");
  const tStatus = useTranslations("Editor.status");
  const retry = useEngineAction(publishPostAction);
  const [errors, setErrors] = useState<Record<string, EngineFailure>>({});
  const statusLabel = (status: string) => (tStatus.has(status) ? tStatus(status) : status);
  const platformLabel = (platform: string) => (tReview.has(`platforms.${platform}`) ? tReview(`platforms.${platform}`) : platform);
  const targetLabel = (target: string) => (t.has(`targets.${target}`) ? t(`targets.${target}`) : target);

  async function retryPublish(id: string) {
    setErrors((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    // A Retry after a definite refusal is a new attempt: useEngineAction makes a new key (design §9).
    const result = await retry.run({ locale, postId: id });
    if (!result.ok) setErrors((current) => ({ ...current, [id]: result.error }));
  }

  return (
    <ul className="flex flex-col gap-3">
      {entries.map((entry) => (
        <li key={entry.id} data-testid={`history-item-${entry.id}`} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/review/${entry.id}`}
              lang={entry.language}
              dir={entry.language === "ar" ? "rtl" : "ltr"}
              data-testid={`history-title-${entry.id}`}
              className="font-medium hover:underline"
            >
              {entry.title}
            </Link>
            <Badge variant="secondary" data-testid={`history-status-${entry.id}`}>
              {statusLabel(entry.status)}
            </Badge>
            <Badge variant="outline">{platformLabel(entry.platform)}</Badge>
            {entry.target && (
              <Badge variant="outline" data-testid={`history-target-${entry.id}`}>
                {targetLabel(entry.target)}
              </Badge>
            )}
          </div>
          {entry.url && (
            <a href={entry.url} target="_blank" rel="noopener noreferrer" dir="ltr" data-testid={`history-url-${entry.id}`} className="text-sm text-primary underline">
              {entry.url}
            </a>
          )}
          {entry.publishedAt && (
            <p data-testid={`history-time-${entry.id}`} className="text-sm text-muted-foreground">
              {t("publishedAt", { time: entry.publishedAt })}
            </p>
          )}
          {entry.overrideReason && (
            <p data-testid={`history-override-${entry.id}`} className="text-sm">
              {t("override", { reason: entry.overrideReason })}
            </p>
          )}
          {entry.reviewNote && (
            <p data-testid={`history-note-${entry.id}`} className="text-sm">
              {t("rejectionNote", { note: entry.reviewNote })}
            </p>
          )}
          {entry.error && (
            <p data-testid={`history-error-${entry.id}`} className="text-sm text-bad-fg">
              {entry.error}
            </p>
          )}
          {entry.actions.includes("retry") && (
            <div>
              <Button size="sm" data-testid={`history-retry-${entry.id}`} disabled={retry.pending} onClick={() => void retryPublish(entry.id)}>
                {t("retry")}
              </Button>
            </div>
          )}
          {errors[entry.id] && <ActionError error={errors[entry.id]} />}
        </li>
      ))}
    </ul>
  );
}
```

```tsx
// src/components/history/history-list.tsx
import { getTranslations } from "next-intl/server";
import { EngineNotice } from "@/components/dashboard/engine-notice";
import { Pager } from "@/components/lists/pager";
import { SkippedNote } from "@/components/lists/skipped-note";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/locales";
import { requirePermission } from "@/lib/auth/session";
import { getEngine } from "@/lib/engine";
import { tryEngine } from "@/lib/engine/result";
import { formatDateTime } from "@/lib/format/datetime";
import { pageCount, requestedPage } from "@/lib/lists/paging";
import { HistoryBoard, type HistoryEntry } from "./history-board";

type Props = { locale: AppLocale; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Spec v1.1 §6 /history: published, failed and rejected posts, newest first, a page at a time. */
export async function HistoryList({ locale, searchParams }: Props) {
  await requirePermission(locale, "content.work");
  const page = requestedPage((await searchParams).page);
  const t = await getTranslations("History");
  const tLists = await getTranslations("Lists");
  const engine = await getEngine();
  const meta = await tryEngine(() => engine.meta());
  const [list, site] = await Promise.all([
    tryEngine(() =>
      engine.listPosts({
        statuses: ["published", "failed", "rejected"],
        page,
        pageSize: meta.ok ? meta.data.limits.pageSizeDefault : undefined,
        sort: "-updated_at",
      }),
    ),
    tryEngine(() => engine.siteTimezone()),
  ]);
  if (!list.ok) return <EngineNotice error={list.error} />;
  if (!site.ok) return <EngineNotice error={site.error} />;

  if (list.data.posts.length === 0) {
    if (page === 1) {
      return (
        <p data-testid="history-empty" className="text-muted-foreground">
          {t("empty")}
        </p>
      );
    }
    return (
      <p data-testid="list-page-empty" className="text-sm">
        {tLists("pageEmpty")}{" "}
        <Link href="/history" data-testid="list-first-page" className="text-primary underline">
          {tLists("firstPage")}
        </Link>
      </p>
    );
  }

  const timeZone = site.data.timezone;
  const entries: HistoryEntry[] = list.data.posts.map((post) => ({
    id: post.id,
    title: post.title,
    language: post.language,
    status: post.status,
    platform: post.platform,
    target: post.published?.target ?? null,
    url: post.published?.url ?? null,
    publishedAt: post.published ? formatDateTime(post.published.at, { timeZone, locale }) : null,
    overrideReason: post.overrideReason ?? null,
    error: post.status === "failed" ? (post.error ?? null) : null,
    reviewNote: post.status === "rejected" ? (post.reviewNote ?? null) : null,
    actions: post.actions,
  }));

  return (
    <div className="flex flex-col gap-4">
      <SkippedNote count={list.data.skipped} />
      <HistoryBoard locale={locale} entries={entries} />
      <Pager pathname="/history" page={page} pages={pageCount(list.data.meta)} />
    </div>
  );
}
```

```tsx
// src/app/[locale]/(app)/history/page.tsx
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SectionSkeleton } from "@/components/dashboard/section-skeleton";
import { HistoryList } from "@/components/history/history-list";
import { asAppLocale } from "@/i18n/locales";

// searchParams is request data: it is passed down and awaited inside the Suspense boundary (Cache Components).
export default async function HistoryPage({ params, searchParams }: PageProps<"/[locale]/history">) {
  const locale = asAppLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("History");
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl">{t("title")}</h1>
      <Suspense fallback={<SectionSkeleton />}>
        <HistoryList locale={locale} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
```

- [ ] **Step 6: Page the Review list and add bulk Publish now**

Replace `src/app/[locale]/(app)/review/page.tsx` with:

```tsx
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SectionSkeleton } from "@/components/dashboard/section-skeleton";
import { ReviewQueue } from "@/components/review/review-queue";
import { asAppLocale } from "@/i18n/locales";

export default async function ReviewPage({ params, searchParams }: PageProps<"/[locale]/review">) {
  const locale = asAppLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("Review");
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl">{t("title")}</h1>
      <Suspense fallback={<SectionSkeleton />}>
        <ReviewQueue locale={locale} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
```

Replace `src/components/review/review-queue.tsx` with:

```tsx
import { EngineNotice } from "@/components/dashboard/engine-notice";
import { Pager } from "@/components/lists/pager";
import { SkippedNote } from "@/components/lists/skipped-note";
import type { AppLocale } from "@/i18n/locales";
import { requirePermission } from "@/lib/auth/session";
import { getEngine } from "@/lib/engine";
import { tryEngine } from "@/lib/engine/result";
import { pageCount, requestedPage } from "@/lib/lists/paging";
import { ReviewBoard } from "./review-board";

type Props = { locale: AppLocale; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function ReviewQueue({ locale, searchParams }: Props) {
  await requirePermission(locale, "content.work");
  const page = requestedPage((await searchParams).page);
  const engine = await getEngine();
  const meta = await tryEngine(() => engine.meta());
  const list = await tryEngine(() =>
    engine.listPosts({ statuses: ["drafting", "pending"], page, pageSize: meta.ok ? meta.data.limits.pageSizeDefault : undefined }),
  );
  if (!list.ok) return <EngineNotice error={list.error} />;
  return (
    <div className="flex flex-col gap-4">
      <SkippedNote count={list.data.skipped} />
      <ReviewBoard
        locale={locale}
        posts={list.data.posts}
        total={list.data.meta?.total ?? list.data.posts.length}
        pollSeconds={meta.ok ? meta.data.pollSeconds : 5}
      />
      <Pager pathname="/review" page={page} pages={pageCount(list.data.meta)} />
    </div>
  );
}
```

Replace `src/components/review/review-board.tsx` with:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { bulkPostsAction } from "@/app/[locale]/(app)/review/actions";
import { ActionError } from "@/components/actions/action-error";
import { ConfirmDialog } from "@/components/editor/confirm-dialog";
import { Button } from "@/components/ui/button";
import { useEngineAction } from "@/lib/actions/use-engine-action";
import type { BulkAction } from "@/lib/engine/api";
import type { EngineFailure } from "@/lib/engine/result";
import type { Post } from "@/lib/engine/schemas";
import { bulkFailureLines } from "@/lib/review/summary";
import { AutoRefresh } from "./auto-refresh";
import { PostCard } from "./post-card";

type Props = { locale: string; posts: Post[]; total: number; pollSeconds: number };
type Failures = { heading: string; lines: { id: string; title: string; message: string }[] };

export function ReviewBoard({ locale, posts, total, pollSeconds }: Props) {
  const t = useTranslations("Review");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [failures, setFailures] = useState<Failures | null>(null);
  const [error, setError] = useState<EngineFailure | null>(null);
  const bulk = useEngineAction(bulkPostsAction);
  const selectable = posts.filter((post) => post.actions.includes("approve") || post.actions.includes("publishNow"));
  const chosenFor = (action: string) => [...selected].filter((id) => posts.some((post) => post.id === id && post.actions.includes(action)));
  const toApprove = chosenFor("approve");
  const toPublish = chosenFor("publishNow");

  function toggle(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  /** Runs a bulk action; posts it couldn't handle stay selected and are listed by name (spec v1.1 §6). */
  async function runBulk(action: BulkAction, ids: string[], heading: string): Promise<EngineFailure | null> {
    setError(null);
    const result = await bulk.run({ locale, action, ids });
    if (!result.ok) return result.error;
    const lines = bulkFailureLines(result.data, posts);
    setFailures(lines.length > 0 ? { heading, lines } : null);
    setSelected(new Set(result.data.failed.map((failure) => failure.id)));
    return null;
  }

  async function approveSelected() {
    const failure = await runBulk("approve", toApprove, t("bulkFailed"));
    if (failure) setError(failure);
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
        <Button size="sm" data-testid="approve-selected" disabled={toApprove.length === 0 || bulk.pending} onClick={() => void approveSelected()}>
          {t("approveSelected", { count: String(toApprove.length) })}
        </Button>
        <ConfirmDialog
          testId="publish-selected"
          triggerVariant="secondary"
          triggerLabel={t("publishSelected", { count: String(toPublish.length) })}
          disabled={toPublish.length === 0}
          title={t("publishSelectedTitle")}
          description={t("publishSelectedBody")}
          confirmLabel={t("publishNow")}
          pending={bulk.pending}
          onConfirm={() => runBulk("publishNow", toPublish, t("bulkPublishFailed"))}
        />
      </div>
      {error && <ActionError error={error} />}
      {failures && (
        <div role="alert" data-testid="bulk-failures" className="rounded-md bg-bad-bg p-3 text-sm text-bad-fg">
          <p className="font-medium">{failures.heading}</p>
          <ul className="mt-1 list-disc ps-5">
            {failures.lines.map((failure) => (
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

In `src/components/review/post-card.tsx`, change `const selectable = post.actions.includes("approve");` to:

```ts
  const selectable = post.actions.includes("approve") || post.actions.includes("publishNow");
```

- [ ] **Step 7: Send a drifted item with the `drift` scenario**

In `src/lib/engine/mock/server.ts`:

(a) Above `route`, add:

```ts
/** With the "drift" scenario, lists also carry a post in a shape the portal doesn't know (Review Focus 4). */
const DRIFTED_POST = { id: "p_drift", title: 42 };
```

(b) In the `/posts` GET branch, replace the final return with:

```ts
    if (!listed.ok) return outcome(listed);
    const items = scenario === "drift" ? [...listed.data.items, DRIFTED_POST] : listed.data.items;
    return { status: 200, json: { ok: true, data: items, meta: listed.data.meta } };
```

(c) Replace the `/scheduled` branch with:

```ts
  if (method === "GET" && rest === "/scheduled") {
    const pageSize = Number(url.searchParams.get("pageSize")) || null;
    const queue = store.scheduled(scenario !== "manual", pageSize);
    if (queue.ok && scenario === "drift") return ok({ ...queue.data, posts: [...queue.data.posts, DRIFTED_POST] });
    return outcome(queue);
  }
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm e2e`

Expected:
- **lint and typecheck:** exit 0
- **unit:** PASS, 201 + 2 = 203
- **e2e:** PASS, 64 + 6 = 70. M1's drift dashboard test still shows exactly one engine notice: the queue's drifted item is skipped, not fatal.

- [ ] **Step 9: Commit**

```bash
git add src messages tests
git commit -m "feat: History page with live links, override reasons and Retry; list paging; bulk publish in Review; lists skip drifted items"
```

---

### Task 9: Shell: site-wide 401 banner, error page, language switch on sign-in and no-access, plural counts

**Files:**
- Create: `src/components/shell/service-banner.tsx`, `src/app/[locale]/(app)/error.tsx`
- Modify:
  - `src/app/[locale]/(app)/layout.tsx`, `src/app/[locale]/sign-in/page.tsx`, `src/app/[locale]/no-access/page.tsx`
  - `src/lib/engine/index.ts`, `src/lib/engine/mock/server.ts`
  - `src/components/review/post-card.tsx`, `messages/en.json`, `messages/ar.json`
- Test: `tests/unit/messages.test.ts` (create), `tests/e2e/shell.spec.ts` (create)

**Interfaces:**
- Consumes: M1 `LocaleSwitch`, `ThemeToggle`, `getSession`, `getEngine`, `Errors.serviceUnavailable`
- Produces:
  - **Components:** `<ServiceBanner />` (test id `service-banner`); the `(app)` error boundary (test ids `error-page`, `error-retry`)
  - **Mock scenario `crash`:** `getEngine` throws a plain error
  - **Plurals:** `Review.critical` and `Review.warn` use ICU plurals; callers pass `{ count: number, n: string }`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/messages.test.ts
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import ar from "../../messages/ar.json";
import en from "../../messages/en.json";

const keysOf = (value: unknown, prefix = ""): string[] =>
  typeof value === "object" && value !== null
    ? Object.entries(value).flatMap(([key, child]) => keysOf(child, prefix ? `${prefix}.${key}` : key))
    : [prefix];

describe("messages", () => {
  it("every message exists in both languages", () => {
    expect(keysOf(ar).sort()).toEqual(keysOf(en).sort());
  });

  it("finding counts read naturally in English", () => {
    const t = createTranslator({ locale: "en", messages: en, namespace: "Review" });
    expect([t("warn", { count: 1, n: "1" }), t("warn", { count: 3, n: "3" }), t("critical", { count: 2, n: "2" })]).toEqual([
      "1 warning",
      "3 warnings",
      "2 critical",
    ]);
  });

  it("finding counts use Arabic plural forms with Latin digits", () => {
    const t = createTranslator({ locale: "ar", messages: ar, namespace: "Review" });
    expect([1, 2, 3, 11].map((count) => t("warn", { count, n: String(count) }))).toEqual(["تحذير واحد", "تحذيران", "3 تحذيرات", "11 تحذيراً"]);
  });
});
```

```ts
// tests/e2e/shell.spec.ts
import { expect, test } from "@playwright/test";
import { isolateMockStore, setMockScenario, signInWithCookie } from "./helpers";

test("a revoked key shows one site-wide banner (design §9)", async ({ page, context }) => {
  await isolateMockStore(context);
  await signInWithCookie(context, "dev_reviewer");
  await setMockScenario(context, "unauthorized");
  await page.goto("/en/review");
  await expect(page.getByTestId("service-banner")).toHaveText("Service unavailable, contact Quantum1st.");
  await expect(page.getByTestId("service-banner")).toHaveCount(1);
});

test("an unexpected failure shows a translated error page with Try again", async ({ page, context }) => {
  await isolateMockStore(context);
  await signInWithCookie(context, "dev_reviewer");
  await setMockScenario(context, "crash");
  await page.goto("/ar/review");
  await expect(page.getByTestId("error-page")).toContainText("حدث خطأ");
  await expect(page.getByTestId("error-retry")).toBeVisible();
});

test("the sign-in page switches to Arabic (M1 follow-up)", async ({ page }) => {
  await page.goto("/en/sign-in");
  await page.getByTestId("locale-switch").click();
  await expect(page).toHaveURL(/\/ar\/sign-in$/);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
});

test("the no-access page has the language switch (M1 follow-up)", async ({ page, context }) => {
  await signInWithCookie(context, "dev_norole");
  await page.goto("/en/no-access");
  await expect(page.getByTestId("locale-switch")).toBeVisible();
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test tests/unit/messages.test.ts && pnpm e2e tests/e2e/shell.spec.ts`

Expected: FAIL.
- **unit:** `t("warn", { count: 1 … })` gives "1 warnings", and Arabic gives "1 تحذيرات"
- **e2e:**
  - `service-banner` and `error-page` don't exist; with `crash` (not yet a scenario), the page renders normally
  - there's no `locale-switch` on sign-in

- [ ] **Step 3: Add the messages and plural counts**

`messages/en.json`:
- in `Review`, replace `"critical"` and `"warn"` with:

```json
    "critical": "{n} critical",
    "warn": "{count, plural, one {{n} warning} other {{n} warnings}}",
```

- at the top level:

```json
  "ErrorPage": {
    "title": "Something went wrong",
    "body": "This page couldn't be shown. Try again; if it keeps happening, contact your admin.",
    "retry": "Try again",
    "home": "Go to the dashboard"
  }
```

`messages/ar.json`:
- in `Review`:

```json
    "critical": "{count, plural, one {نتيجة حرجة واحدة} two {نتيجتان حرجتان} few {{n} نتائج حرجة} many {{n} نتيجة حرجة} other {{n} نتيجة حرجة}}",
    "warn": "{count, plural, one {تحذير واحد} two {تحذيران} few {{n} تحذيرات} many {{n} تحذيراً} other {{n} تحذير}}",
```

- at the top level:

```json
  "ErrorPage": {
    "title": "حدث خطأ",
    "body": "تعذّر عرض هذه الصفحة. حاول مرة أخرى، وإذا تكرر ذلك فتواصل مع المسؤول.",
    "retry": "حاول مرة أخرى",
    "home": "الانتقال إلى لوحة التحكم"
  }
```

In `src/components/review/post-card.tsx`, change the two count calls to:

```tsx
                {t("critical", { count: counts.critical, n: String(counts.critical) })}
```

```tsx
            {counts.warn > 0 && <span className="rounded bg-warn-bg px-2 py-0.5 text-warn-fg">{t("warn", { count: counts.warn, n: String(counts.warn) })}</span>}
```

- [ ] **Step 4: Add the service banner, the error page and the crash scenario**

```tsx
// src/components/shell/service-banner.tsx
import { getTranslations } from "next-intl/server";
import { getSession } from "@/lib/auth/session";
import { getEngine } from "@/lib/engine";
import { tryEngine } from "@/lib/engine/result";

/** Design §9: a revoked or missing key (401) shows one site-wide banner, above whatever each section says. */
export async function ServiceBanner() {
  const session = await getSession();
  if (!session?.role) return null;
  let code: string | null = null;
  try {
    const engine = await getEngine();
    const meta = await tryEngine(() => engine.meta());
    code = meta.ok ? null : meta.error.code;
  } catch {
    return null; // anything else that went wrong is shown by the page's error boundary
  }
  if (code !== "unauthorized") return null;
  const t = await getTranslations("Errors");
  return (
    <div role="alert" data-testid="service-banner" className="border-b border-bad-fg/30 bg-bad-bg px-6 py-3 text-sm text-bad-fg">
      {t("serviceUnavailable")}
    </div>
  );
}
```

Replace `src/app/[locale]/(app)/layout.tsx` with:

```tsx
import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";
import { ServiceBanner } from "@/components/shell/service-banner";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { asAppLocale } from "@/i18n/locales";

export default async function AppLayout({ children, params }: LayoutProps<"/[locale]">) {
  const locale = asAppLocale((await params).locale);
  setRequestLocale(locale);
  return (
    <div className="grid min-h-dvh grid-cols-1 md:grid-cols-[15rem_minmax(0,1fr)]">
      <Sidebar locale={locale} />
      <div className="flex min-w-0 flex-col">
        <Topbar locale={locale} />
        <Suspense fallback={null}>
          <ServiceBanner />
        </Suspense>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
```

```tsx
// src/app/[locale]/(app)/error.tsx
"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

/** The app pages' error boundary (Next 16 passes `retry`): a translated message, Try again, and the way home. */
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useTranslations("ErrorPage");
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div role="alert" data-testid="error-page" className="flex max-w-xl flex-col gap-3 rounded-lg border border-bad-fg/30 bg-bad-bg p-6 text-bad-fg">
      <h1 className="font-heading text-2xl">{t("title")}</h1>
      <p>{t("body")}</p>
      <div className="flex flex-wrap gap-2">
        <Button data-testid="error-retry" onClick={() => retry()}>
          {t("retry")}
        </Button>
        <Link href="/" className={buttonVariants({ variant: "outline" })}>
          {t("home")}
        </Link>
      </div>
    </div>
  );
}
```

In `src/lib/engine/mock/server.ts`, extend the scenarios:

```ts
/** normal · unauthorized (revoked key) · down (unreachable) · drift (changed shapes) · manual (auto-publish off) · crash (a non-engine error). */
export type MockScenario = "normal" | "unauthorized" | "down" | "drift" | "manual" | "crash";
const MOCK_SCENARIOS: readonly MockScenario[] = ["normal", "unauthorized", "down", "drift", "manual", "crash"];
```

In `src/lib/engine/index.ts`, after `const scenario = jar.get(MOCK_SCENARIO_COOKIE)?.value;`, add:

```ts
    // The "crash" scenario throws a plain error, to show the error page (an engine error would show a notice instead).
    if (scenario === "crash") throw new Error("Simulated crash (mock scenario).");
```

- [ ] **Step 5: Put the language switch on the sign-in and no-access pages**

In `src/app/[locale]/sign-in/page.tsx` and `src/app/[locale]/no-access/page.tsx`:
- add `import { LocaleSwitch } from "@/components/shell/locale-switch";` and `import { ThemeToggle } from "@/components/shell/theme-toggle";`
- change `<main className="flex min-h-dvh items-center justify-center p-6">` to `<main className="relative flex min-h-dvh items-center justify-center p-6">`
- add as the first child of `<main>`:

```tsx
      <div className="absolute end-4 top-4 flex gap-2">
        <ThemeToggle />
        <LocaleSwitch />
      </div>
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm e2e`

Expected:
- **lint and typecheck:** exit 0
- **unit:** PASS, 203 + 3 = 206
- **e2e:** PASS, 70 + 4 = 74. M2a's "1 critical" card text is unchanged in English.

- [ ] **Step 7: Commit**

```bash
git add src messages tests
git commit -m "feat: site-wide 401 banner, translated error page, language switch on sign-in and no-access, plural finding counts"
```

---

### Task 10: M2b wrap-up and full verification

**Files:**
- Modify: `README.md`, `docs/plans/2026-10-21-m1-followups.md`, `docs/plans/2026-10-22-m2a-followups.md`

**Interfaces:**
- Consumes: everything above
- Produces: a documented, fully green M2b

- [ ] **Step 1: Document M2b in `README.md`**

Append:

```markdown
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
```

- [ ] **Step 2: Update the follow-up docs**

In `docs/plans/2026-10-21-m1-followups.md`, append ` — handled in M2b` to the line about `error.tsx`.

In `docs/plans/2026-10-22-m2a-followups.md`:

(a) Append ` — handled in M2b` to these deferred items:
- idempotency key reuse
- the review queue showing only the first page
- one malformed post blanking the queue
- the `useEngineAction` hook having no unit test

(b) In the "Lock lifetime" item:
- append ` (actions now wait while someone else holds the lock, and a locked reply shows the banner — M2b)`
- leave the idle renewal and the `pagehide` release as deferred

(c) In the i18n item, append ` (finding counts now use plural forms — M2b)`.

(d) Append this section at the end of the file:

```markdown
## Questions for Quantum1st (from M2b)

- Action names in `post.actions`: we use `publishNow` (spec example), plus `hold`, `resume` and `retry`. Please confirm or send yours. Do `GET …/posts` list items carry `actions`?
- Photo text: we send `image: {alt, credit}` in `PUT …/posts/{id}` to change the alt text and credit. Is that right? Do the image endpoints (`pick`, upload, `DELETE`) bump the post's `version`?
- Photo uploads: Vercel caps a request body at 4.5 MB, and `/meta.limits.photoMaxBytes` is 5 MB. Could the engine offer a direct-upload URL?
- Export: please confirm `Content-Disposition` carries the file name (UTF-8 `filename*` for Arabic slugs).
- The neutral form's FAQ markup (from M2a), so the editor can keep FAQ blocks editable.
```

- [ ] **Step 3: Run every check from a clean build**

```bash
rm -rf .next
pnpm lint && pnpm typecheck && pnpm test && pnpm e2e && ALLOW_TEST_LOGINS=1 pnpm build
```

Expected:
- lint and typecheck exit 0
- Vitest: 206 passed
- Playwright: 74 passed
- the build lists `◐ /en/scheduled`, `◐ /ar/scheduled`, `◐ /en/history`, `◐ /ar/history`

- [ ] **Step 4: Manual smoke test**

Run `pnpm dev`, sign in as **Reviewer**, and check:
- (a) **Scheduled:**
  - `/en/scheduled` shows the green banner with "10:00 AM"
  - p_101, p_102 and p_103 are in order; p_103 is "On hold"
- (b) **Publish now** on p_101 removes it from the queue. On `/en/history` it's first, with a live link and a 12-hour time.
- (c) **Retry on History:** on p_303, the first Retry shows the WordPress message; the second publishes it.
- (d) **Photos on p_201:**
  - Find a photo → Search → Use this photo shows the photo and the credit
  - Export Markdown downloads `commission-payable-uae-labour-law.md`
- (e) **Arabic:** `/ar/history` and `/ar/scheduled` are right to left; p_102's title reads right to left.
- (f) **Dev console:** no prerender errors or console errors in the `pnpm dev` output.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: M2b decisions and questions for Quantum1st; photos, publishing, Scheduled and History complete"
git log --oneline | head -12
```
