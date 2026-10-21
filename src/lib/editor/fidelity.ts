// Tags the editor adds, drops or renames without losing content: wrappers, table plumbing, and b/i/strike spellings.
const IGNORED = new Set(["html", "head", "body", "p", "div", "span", "br", "wbr", "thead", "tbody", "tfoot", "colgroup", "col"]);
const SAME_AS: Record<string, string> = { b: "strong", i: "em", strike: "s", del: "s" };

function tagCounts(html: string, parse: (html: string) => Document): Map<string, number> {
  const counts = new Map<string, number>();
  for (const element of parse(html).body.querySelectorAll("*")) {
    const tag = element.tagName.toLowerCase();
    const name = SAME_AS[tag] ?? tag;
    if (!IGNORED.has(name)) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return counts;
}

/** Elements in the engine's HTML that the editor's version no longer has, i.e. what saving the body would lose. */
export function lostElements(original: string, kept: string, parse: (html: string) => Document): string[] {
  const before = tagCounts(original, parse);
  const after = tagCounts(kept, parse);
  return [...before].filter(([tag, count]) => (after.get(tag) ?? 0) < count).map(([tag]) => tag).sort();
}
