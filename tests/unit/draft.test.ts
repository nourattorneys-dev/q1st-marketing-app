import { describe, expect, it } from "vitest";
import { afterSave, draftOf, edit, rebase, unsavedFields, withMyChanges } from "@/lib/editor/draft";
import { toEditable } from "@/lib/editor/changed-fields";
import type { Post } from "@/lib/engine/schemas";
import { seedPosts } from "@/lib/engine/mock/post-fixtures";

const v1 = seedPosts().find((post) => post.id === "p_201") as Post;
const v2: Post = { ...v1, title: "Saved by someone else", version: v1.version + 1 };

describe("the editor's draft (final review: stale saves)", () => {
  it("shows a newer version when there's nothing unsaved", () => {
    const next = rebase(draftOf(v1), v2);
    expect(next.form.title).toBe("Saved by someone else");
    expect(next.version).toBe(v2.version);
    expect(unsavedFields(next)).toEqual([]);
  });

  it("keeps unsaved edits on their old version, so the next save conflicts instead of overwriting", () => {
    const mine = edit(draftOf(v1), "subtitle", "My standfirst");
    const next = rebase(mine, v2);
    expect(next.version).toBe(v1.version);
    expect(next.form.title).toBe(v1.title);
    expect(unsavedFields(next)).toEqual(["subtitle"]);
  });

  it("ignores a version it already has", () => {
    const mine = edit(draftOf(v1), "title", "Mine");
    expect(rebase(mine, v1)).toBe(mine);
  });

  it("leaves nothing unsaved when the engine stores a save in its own form", () => {
    const mine = edit(draftOf(v1), "content", "<ul><li><p>Edited</p></li></ul>");
    const sent = mine.form;
    const next = afterSave(mine, sent, v1.version + 1);
    expect(unsavedFields(next)).toEqual([]);
    expect(next.version).toBe(v1.version + 1);
  });

  it("keeps an edit made while the save was in flight", () => {
    const sending = edit(draftOf(v1), "title", "First");
    const typedOn = edit(sending, "subtitle", "Typed while saving");
    expect(unsavedFields(afterSave(typedOn, sending.form, v1.version + 1))).toEqual(["subtitle"]);
  });

  it("keep mine puts only my changed fields on top of their version", () => {
    const mine = edit(draftOf(v1), "subtitle", "My standfirst");
    const next = withMyChanges(mine, v2);
    expect(next.form.title).toBe("Saved by someone else");
    expect(next.form.subtitle).toBe("My standfirst");
    expect(next.version).toBe(v2.version);
    expect(next.base).toEqual(toEditable(v2));
  });
});
