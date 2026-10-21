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
