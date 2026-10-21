export type BlockSummary = { tag: string; text: string };
export type AlignedRow = { left: BlockSummary | null; right: BlockSummary | null; matches: boolean };

const textOf = (element: Element) => (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 160);

/**
 * The sections TranslatePress pairs by position (spec v1.1 §11: headings, paragraphs, list items, tables): each top-level
 * block, with lists split into their items and tables into their rows. The mock's sectionSignature counts the same way.
 */
export function blockSummaries(html: string, parse: (html: string) => Document): BlockSummary[] {
  const blocks: BlockSummary[] = [];
  for (const element of parse(html).body.children) {
    const tag = element.tagName.toLowerCase();
    if (tag === "ul" || tag === "ol") {
      for (const item of element.querySelectorAll("li")) blocks.push({ tag: "li", text: textOf(item) });
    } else if (tag === "table") {
      for (const row of element.querySelectorAll("tr")) blocks.push({ tag: "tr", text: [...row.children].map(textOf).join(" | ") });
    } else {
      blocks.push({ tag, text: textOf(element) });
    }
  }
  return blocks;
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
