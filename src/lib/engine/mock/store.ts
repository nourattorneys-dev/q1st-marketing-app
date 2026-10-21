import { normalizePhrase } from "@/lib/keywords/phrases";
import { approvalMode } from "@/lib/posts/rules";
import type { BulkResult, Job, Keyword, Photo, Post, Suggestion } from "../schemas";
import { draftedContent, ideaTitleFor, PROPOSALS, topicFor } from "./drafting";
import { exportHtml, exportMarkdown } from "./export";
import { fail, ok, type MockFail, type MockOutcome, type UploadedFile } from "./outcome";
import { searchMockPhotos } from "./photos";
import { mockMeta } from "./fixtures";
import { seedKeywords, seedSuggestions } from "./keyword-fixtures";
import { SEED_DRAFTING_POST_ID, SEED_FAILING_PUBLISH, SEED_QUEUE, seedPosts } from "./post-fixtures";
import { computeFindings, seoScore, toNeutralHtml } from "./rules";
import { slotTimes } from "./schedule";
import { MOCK_CATEGORIES } from "./settings-fixtures";
import { createSettingsStore } from "./settings-store";

export type { MockFail, MockOk, MockOutcome, UploadedFile } from "./outcome";
export type ExportFile = { body: string; contentType: string; filename: string };

function isImageText(value: unknown): value is { alt: string | null; credit: string | null } {
  if (typeof value !== "object" || value === null) return false;
  const { alt, credit } = value as Record<string, unknown>;
  return (typeof alt === "string" || alt === null) && (typeof credit === "string" || credit === null);
}
export type StoredResponse = { fingerprint: string; status: number; json: unknown };

/** A slow AI job: it finishes lazily `durationMs` after it starts, and `complete()` applies its effect and gives its result. */
type MockJob = { id: string; startedAt: number; durationMs: number; done: boolean; result: unknown; complete: () => unknown };
type DraftInput = { topic: string; kind: string; platform: string; language: string; keywords: string[] };

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

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

export function createMockStore(options: { now?: () => number; jobDurationMs?: number; firstRun?: boolean } = {}) {
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
  const keywords = new Map<string, Keyword>();
  const suggestions = new Map<string, Suggestion>();
  const siteLanguages = mockMeta().languages;
  let keywordSequence = 100;
  let suggestionSequence = 100;
  let postSequence = 600;
  const iso = (ms: number) => new Date(ms).toISOString();
  const settings = createSettingsStore({ now, firstRun: options.firstRun });

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
    const times = autoPublish ? slotTimes(queued.filter((post) => !post.schedule?.hold).length, settings.slotPlan()) : [];
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
    const jobId = startJob(() => redraft(id, note.trim()));
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
      return { target: settings.websiteType() ?? "wordpress", url: `https://fakhernco.com${path}`, externalId: String(9000 + n), at };
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
    // A rule that can't be overridden (structure_mismatch) blocks publishing in any status: an approved twin can
    // stop matching when its English version is edited later (spec v1.1 §5).
    const blocked = approvalMode(post.findings) === "blocked";
    const refusal = post.status === "pending" || blocked ? approvalRefusal(post, undefined) : missingPhoto(post);
    if (refusal) return refusal;
    // The post's connection must be set up and working (spec v1.1 §9 not_connected); details say which one (mock-only name).
    const connection = settings.connectionStatus(post.platform);
    if (connection === "missing" || connection === "error") {
      const name = post.platform === "website" ? "The website" : post.platform === "linkedin" ? "LinkedIn" : post.platform === "instagram" ? "Instagram" : post.platform;
      return fail(422, "not_connected", `${name} isn't connected. An admin can connect it in Settings.`, { details: { connection: post.platform } });
    }
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

  /** POST …/settings/seo/propose: AI suggestions for focus keywords and the call to action, as a job (not saved). */
  function proposeSeo() {
    tick();
    return ok({ jobId: startJob(() => settings.seoProposal()), status: "queued", postIds: [] as string[] });
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
      result: found.done ? found.result : null,
      error: null,
    });
  }

  const categories = () => ok(MOCK_CATEGORIES);

  for (const seeded of seedPosts()) posts.set(seeded.id, seeded);
  for (const seeded of posts.values()) refreshFindings(seeded);
  queue.push(...SEED_QUEUE);
  for (const id of SEED_FAILING_PUBLISH) failNextPublish.add(id);
  for (const seeded of seedKeywords()) keywords.set(seeded.id, seeded);
  for (const seeded of seedSuggestions()) suggestions.set(seeded.id, seeded);
  jobs.set("j_seed", { id: "j_seed", startedAt: now(), durationMs: Number.POSITIVE_INFINITY, done: false, result: null, complete: () => ({ postIds: [SEED_DRAFTING_POST_ID] }) });

  return {
    idempotency,
    settings,
    proposeSeo,
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
    listKeywords,
    addKeywords,
    bulkKeywords,
    listSuggestions,
    dismissSuggestion,
    proposeKeywords,
    keywordTopics,
    draftKeywordArticles,
    draftSuggestion,
    bulkSuggestions,
    createDrafts,
    bulk,
    job,
    categories,
  };
}

export type MockStore = ReturnType<typeof createMockStore>;
