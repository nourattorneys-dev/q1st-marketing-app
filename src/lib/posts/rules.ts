type FindingLike = { level: string; overridable?: boolean | null };

/** A missing flag means overridable; only an explicit false (e.g. structure_mismatch on TranslatePress sites) locks it. */
export function isOverridable(finding: FindingLike): boolean {
  return finding.overridable !== false;
}

export function findingCounts(post: { findings: readonly FindingLike[] }): { critical: number; warn: number; human: number } {
  const counts = { critical: 0, warn: 0, human: 0 };
  for (const finding of post.findings) {
    if (finding.level === "critical") counts.critical++;
    else if (finding.level === "warn") counts.warn++;
    else if (finding.level === "human") counts.human++;
  }
  return counts;
}

/** direct: no critical findings · override: needs a reason · blocked: a critical finding can't be overridden. */
export function approvalMode(findings: readonly FindingLike[]): "direct" | "override" | "blocked" {
  const critical = findings.filter((f) => f.level === "critical");
  if (critical.some((f) => !isOverridable(f))) return "blocked";
  return critical.length > 0 ? "override" : "direct";
}
