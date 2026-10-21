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
