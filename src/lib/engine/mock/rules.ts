import type { Finding, Post } from "../schemas";

type Limits = { metaTitle: number; metaDescription: number };

const VOID = new Set(["area", "br", "col", "embed", "hr", "img", "input", "source", "track", "wbr"]);

/**
 * Sections in order, counted like the side-by-side view's blockSummaries: each top-level block, with lists split into
 * items and tables into rows. A tag scan, because the mock runs on the server without a DOM.
 */
export function sectionSignature(html: string): string[] {
  const signature: string[] = [];
  const open: string[] = [];
  for (const [whole, closing, name] of html.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g)) {
    const tag = name.toLowerCase();
    if (closing) {
      const at = open.lastIndexOf(tag);
      if (at >= 0) open.length = at;
      continue;
    }
    const top = open[0];
    if (top === undefined) {
      if (tag !== "ul" && tag !== "ol" && tag !== "table") signature.push(tag);
    } else if ((top === "ul" || top === "ol") && tag === "li") {
      signature.push("li");
    } else if (top === "table" && tag === "tr") {
      signature.push("tr");
    }
    if (!VOID.has(tag) && !whole.endsWith("/>")) open.push(tag);
  }
  return signature;
}

/**
 * The engine stores articles in its neutral form (spec v1.1 §11), not in the editor's HTML: no paragraph wrapped
 * around a list item's or cell's text, no table sizing. Saving through the mock does the same, so the portal can't
 * rely on getting its own HTML back.
 */
export function toNeutralHtml(html: string): string {
  return html
    .replace(/<colgroup>[\s\S]*?<\/colgroup>/g, "")
    .replace(/\s(?:style="min-width:[^"]*"|colspan="1"|rowspan="1")/g, "")
    .replace(/<(li|td|th)([^>]*)><p>((?:(?!<\/?p\b)[\s\S])*)<\/p><\/\1>/g, "<$1$2>$3</$1>");
}

/** A stand-in for Quantum1st's article checks; codes follow spec v1.1 §4 Finding. */
export function computeFindings(post: Post, twin: Post | undefined, limits: Limits): Finding[] {
  const findings: Finding[] = [];
  if (!post.title.trim()) {
    findings.push({ level: "critical", code: "title_missing", ref: "§2.1", overridable: true, message: "The title is empty." });
  }
  const metaDescription = post.metaDescription ?? "";
  if (metaDescription.length > limits.metaDescription) {
    findings.push({
      level: "critical",
      code: "meta_description_length",
      ref: "§3.2",
      overridable: true,
      message: `The meta description is ${metaDescription.length} characters; the limit is ${limits.metaDescription}.`,
    });
  }
  const metaTitle = post.metaTitle ?? "";
  if (metaTitle.length > limits.metaTitle) {
    findings.push({
      level: "warn",
      code: "meta_title_length",
      ref: "§3.1",
      overridable: true,
      message: `The meta title is ${metaTitle.length} characters; the limit is ${limits.metaTitle}.`,
    });
  }
  if (post.kind === "blog" && post.keywords.length === 0) {
    findings.push({ level: "warn", code: "focus_keyword_missing", ref: "§3.4", overridable: true, message: "There is no focus keyword." });
  }
  if (post.kind === "blog" && post.language === "ar" && twin?.content && post.content) {
    const english = sectionSignature(twin.content);
    const arabic = sectionSignature(post.content);
    if (english.join(",") !== arabic.join(",")) {
      findings.push({
        level: "critical",
        code: "structure_mismatch",
        ref: "§11",
        overridable: false,
        message: `The Arabic version's structure doesn't match the English version (${arabic.length} vs ${english.length} sections).`,
      });
    }
  }
  if (post.kind === "blog") {
    findings.push({
      level: "human",
      code: "legal_review",
      ref: "§5.1",
      overridable: true,
      message: "Check the legal statements with a qualified reviewer before approving.",
    });
  }
  return findings;
}

export function seoScore(findings: readonly Finding[]): number {
  const critical = findings.filter((f) => f.level === "critical").length;
  const warn = findings.filter((f) => f.level === "warn").length;
  return Math.max(0, 100 - 15 * critical - 5 * warn);
}
