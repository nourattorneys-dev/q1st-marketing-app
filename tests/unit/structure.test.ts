import { generateHTML, generateJSON } from "@tiptap/html";
import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";
import { editorExtensions } from "@/components/editor/extensions";
import { blockSummaries } from "@/lib/editor/blocks";
import { sectionSignature } from "@/lib/engine/mock/rules";
import { seedPosts } from "@/lib/engine/mock/post-fixtures";
import { createMockStore } from "@/lib/engine/mock/store";

const parse = (html: string) => new new Window().DOMParser().parseFromString(html, "text/html") as unknown as Document;
const asEditorSavesIt = (html: string) => generateHTML(generateJSON(html, editorExtensions), editorExtensions);
const articles = seedPosts().filter((post) => post.kind === "blog" && post.content);

describe("the mock's structure check and the side-by-side view count the same sections (final review)", () => {
  it.each(articles.map((post) => [post.id, post.content as string]))("agree on %s, as seeded and as the editor saves it", (_id, html) => {
    for (const version of [html, asEditorSavesIt(html)]) {
      expect(sectionSignature(version)).toEqual(blockSummaries(version, parse).map((block) => block.tag));
    }
  });

  it("saving the English article from the editor doesn't flag its Arabic twin", () => {
    const store = createMockStore({ now: () => Date.parse("2026-10-22T08:00:00Z"), jobDurationMs: 1000 });
    const english = store.getPost("p_201");
    if (!english.ok) throw new Error("seed missing");
    const saved = store.updatePost("p_201", { ...english.data, content: asEditorSavesIt(english.data.content ?? "") }, "reviewer@example.com");
    expect(saved.ok).toBe(true);
    const arabic = store.getPost("p_202");
    expect(arabic.ok && arabic.data.findings.some((finding) => finding.code === "structure_mismatch")).toBe(false);
  });
});
