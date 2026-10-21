import { approvalMode } from "@/lib/posts/rules";
import type { BulkResult, Category, Job, Post } from "../schemas";
import { mockMeta } from "./fixtures";
import { SEED_DRAFTING_POST_ID, seedPosts } from "./post-fixtures";
import { computeFindings, seoScore, toNeutralHtml } from "./rules";

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

/** Lowercase letters (any script), digits and single hyphens, as WordPress and Strapi slugs allow. */
const SLUG = /^[\p{Ll}\p{Lo}\p{N}]+(?:-[\p{Ll}\p{Lo}\p{N}]+)*$/u;
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
    if (typeof input.slug === "string" && !SLUG.test(input.slug)) {
      return fail(400, "invalid_input", "Some fields aren't valid.", { fields: { slug: "Use lowercase letters, numbers and hyphens." } });
    }
    const target = post as Record<string, unknown>;
    for (const field of EDITABLE_FIELDS) if (field in input) target[field] = input[field];
    if (post.kind === "blog" && post.content) post.content = toNeutralHtml(post.content);
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
