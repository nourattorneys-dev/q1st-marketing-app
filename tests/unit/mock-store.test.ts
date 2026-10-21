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
  it("lists blocks, one entry per list item and table row (spec v1.1 §11)", () => {
    expect(sectionSignature("<h2>a</h2><p>b <a href='x'>c</a></p><ul><li>d</li><li>e</li></ul><table><tr><th>e</th></tr></table>")).toEqual([
      "h2",
      "p",
      "li",
      "li",
      "tr",
    ]);
  });

  it("doesn't count paragraphs inside list items, cells or quotes", () => {
    expect(sectionSignature("<ul><li><p>d</p></li></ul><table><tbody><tr><td><p>e</p></td></tr></tbody></table><blockquote><p>q</p></blockquote>")).toEqual([
      "li",
      "tr",
      "blockquote",
    ]);
  });
});

describe("seeded posts and findings", () => {
  it("lists posts without their content, with paging meta", () => {
    const page = data(store.listPosts(["pending", "drafting"], 1, 25));
    expect(page.items.map((p) => p.id)).toEqual(["p_201", "p_202", "p_203", "p_204", "p_205", "p_206", "p_207", "p_208", "p_209"]);
    expect(page.items[0].content).toBeUndefined();
    expect(page.meta).toEqual({ page: 1, pageSize: 25, total: 9 });
  });

  it("computes findings from the rules", () => {
    const codes = (id: string) => data(store.getPost(id)).findings.map((f) => `${f.level}:${f.code}`);
    expect(codes("p_201")).toEqual(["human:legal_review"]);
    expect(codes("p_203")).toContain("critical:meta_description_length");
    expect(data(store.getPost("p_205")).findings.find((f) => f.code === "structure_mismatch")?.overridable).toBe(false);
  });

  it("returns allowed actions and the twin summary", () => {
    const post = data(store.getPost("p_201"));
    expect(post.actions).toEqual(["edit", "approve", "changes", "reject", "delete", "publishNow"]);
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

  it("stores an article in the engine's neutral form, not the editor's (spec v1.1 §11)", () => {
    const saved = data(update("p_203", { content: "<ul><li><p>One</p></li></ul><table><colgroup><col style=\"min-width: 25px\"></colgroup><tbody><tr><td colspan=\"1\" rowspan=\"1\"><p>Cell</p></td></tr></tbody></table>" }));
    expect(saved.content).toBe("<ul><li>One</li></ul><table><tbody><tr><td>Cell</td></tr></tbody></table>");
  });

  it("refuses a malformed slug with a field error (spec v1.1 §9)", () => {
    const outcome = update("p_203", { slug: "Bad Slug!" });
    expect(outcome).toMatchObject({ ok: false, status: 400, code: "invalid_input", fields: { slug: expect.any(String) } });
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
    expect(post.actions).toEqual(["hold", "publishNow", "delete"]);
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
