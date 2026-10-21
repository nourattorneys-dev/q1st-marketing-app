import type { Finding, Post } from "../schemas";

type Limits = { metaTitle: number; metaDescription: number };

/** Top-level block tags in order. The mock's content keeps lists and tables free of nested <p>, so a regex is enough. */
export function sectionSignature(html: string): string[] {
  return [...html.matchAll(/<(h[1-6]|p|ul|ol|table|blockquote)\b/gi)].map((match) => match[1].toLowerCase());
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
