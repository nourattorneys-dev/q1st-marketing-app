import { approvalMode } from "@/lib/posts/rules";
import type { BulkResult, Category, Job, Photo, Post } from "../schemas";
import { exportHtml, exportMarkdown } from "./export";
import { searchMockPhotos } from "./photos";
import { mockMeta } from "./fixtures";
import { SEED_DRAFTING_POST_ID, SEED_FAILING_PUBLISH, SEED_QUEUE, seedPosts } from "./post-fixtures";
import { computeFindings, seoScore, toNeutralHtml } from "./rules";
import { slotTimes } from "./schedule";

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
export type ExportFile = { body: string; contentType: string; filename: string };

function isImageText(value: unknown): value is { alt: string | null; credit: string | null } {
  if (typeof value !== "object" || value === null) return false;
  const { alt, credit } = value as Record<string, unknown>;
  return (typeof alt === "string" || alt === null) && (typeof credit === "string" || credit === null);
}
export type StoredResponse = { fingerprint: string; status: number; json: unknown };

type MockJob = { id: string; postId: string; note: string; startedAt: number; durationMs: number; done: boolean };

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
  const queue: string[] = [];
  const failNextPublish = new Set<string>();
  const photoCache = new Map<number, Photo>();
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

  function getPost(id: string): MockOutcome<Post> {
    tick();
    const post = posts.get(id);
    return post ? ok(view(post)) : fail(404, "not_found", "This post no longer exists.");
  }

  function updatePost(id: string, input: Record<string, unknown>, actor: string): MockOutcome<Post> {
    const guarded = guard(id, actor);
    if (!guarded.ok) return guarded;
    const post = guarded.data;
    if (!actionsFor(post).includes("edit")) {
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
    if (isImageText(input.image) && post.image) post.image = { ...post.image, alt: input.image.alt, credit: input.image.credit };
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
    dequeue(id);
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
  queue.push(...SEED_QUEUE);
  for (const id of SEED_FAILING_PUBLISH) failNextPublish.add(id);
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
    publish,
    hold,
    scheduled,
    searchPhotos,
    pickPhoto,
    uploadPhoto,
    removePhoto,
    exportPost,
    bulk,
    job,
    categories,
  };
}

export type MockStore = ReturnType<typeof createMockStore>;
