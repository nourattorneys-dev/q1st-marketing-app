import type { BulkResult, SiteFinding } from "../schemas";
import { fail, ok, type MockOutcome } from "./outcome";

/** Fakher & Co's site-health findings (spec v1.1 §4 SiteFinding): each status, and one on an Arabic page. */
export function seedFindings(): SiteFinding[] {
  return [
    { id: "sf_1", url: "https://fakhernco.com/services/labour-law/", level: "critical", issue: "Missing meta description", fix: null, status: "open" },
    { id: "sf_2", url: "https://fakhernco.com/insights/probation-period-uae-labour-law/", level: "warn", issue: "Image without alt text", fix: null, status: "open" },
    { id: "sf_3", url: "https://fakhernco.com/about/", level: "critical", issue: "Broken internal link to /contact-us", fix: "Point the link to /contact/", status: "prepared" },
    { id: "sf_4", url: "https://fakhernco.com/ar/services/", level: "warn", issue: "عنوان الصفحة أطول من 60 حرفاً", fix: null, status: "open" },
    {
      id: "sf_5",
      url: "https://fakhernco.com/insights/",
      level: "info",
      issue: "Page title longer than 60 characters",
      fix: "Shorten the title to “Insights | Fakher & Co”",
      status: "applied",
    },
    { id: "sf_6", url: "https://fakhernco.com/careers/", level: "warn", issue: "Duplicate H1 heading", fix: null, status: "dismissed" },
  ];
}

/** The mock "AI" behind fix preparation: a proposed fix per issue (Fakher & Co is a legal consultancy). */
const PROPOSED: Record<string, string> = {
  "Missing meta description": "Add: “Labour law advice in Dubai and Abu Dhabi from the legal consultants at Fakher & Co.”",
  "Image without alt text": "Add the alt text “Employment contract on a desk”.",
  "عنوان الصفحة أطول من 60 حرفاً": "اختصر العنوان إلى «خدماتنا | فاخر وشركاه».",
};

export function createSiteHealthStore() {
  const findings = new Map(seedFindings().map((finding) => [finding.id, finding]));
  let sequence = findings.size;

  /** GET …/site/findings: by status and level (null = any), a page at a time. */
  function list(statuses: string[] | null, levels: string[] | null, page: number, pageSize: number) {
    const all = [...findings.values()].filter(
      (finding) => (!statuses || statuses.includes(finding.status)) && (!levels || levels.includes(finding.level)),
    );
    const start = (page - 1) * pageSize;
    return ok({ items: structuredClone(all.slice(start, start + pageSize)), meta: { page, pageSize, total: all.length } });
  }

  /** What a finished scan adds (mock rule: one new finding each time). */
  function scanned(): { findingIds: string[] } {
    const id = `sf_${++sequence}`;
    findings.set(id, { id, url: "https://fakhernco.com/insights/", level: "warn", issue: "Largest image is 2.4 MB", fix: null, status: "open" });
    return { findingIds: [id] };
  }

  /** The open findings among `ids`: the ones a fix can be prepared for. */
  const preparable = (ids: string[]) => ids.filter((id) => findings.get(id)?.status === "open");

  function prepare(ids: string[]): { findingIds: string[] } {
    const chosen = preparable(ids);
    for (const id of chosen) {
      const finding = findings.get(id) as SiteFinding;
      finding.status = "prepared";
      finding.fix = PROPOSED[finding.issue] ?? `Proposed fix for: ${finding.issue}`;
    }
    return { findingIds: chosen };
  }

  /** POST …/site/findings/bulk: apply needs a prepared fix; dismiss needs an open or prepared finding. */
  function bulk(action: string, ids: string[]): MockOutcome<BulkResult> {
    if (action !== "apply" && action !== "dismiss") return fail(400, "invalid_input", "Unknown action.", { fields: { action: "apply or dismiss" } });
    const result: BulkResult = { done: [], failed: [] };
    for (const id of ids) {
      const finding = findings.get(id);
      if (!finding) result.failed.push({ id, code: "not_found", message: "This finding no longer exists." });
      else if (action === "apply" && finding.status !== "prepared") result.failed.push({ id, code: "invalid_input", message: "Prepare the fix first." });
      else if (action === "dismiss" && finding.status !== "open" && finding.status !== "prepared") {
        result.failed.push({ id, code: "invalid_input", message: "Only open or prepared findings can be dismissed." });
      } else {
        finding.status = action === "apply" ? "applied" : "dismissed";
        result.done.push(id);
      }
    }
    return ok(result);
  }

  return { list, scanned, preparable, prepare, bulk };
}
