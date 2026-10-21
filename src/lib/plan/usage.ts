import type { Usage } from "@/lib/engine/schemas";

/**
 * The calendar month a plan period covers (spec v1.1 §4 Plan.period), YYYY-MM: the month of its midpoint, so the
 * offset the engine writes (+04:00 or Z) can't shift it to the previous month. Never the browser's clock.
 */
export function periodMonth(period: { start: string; end: string }): string {
  const start = Date.parse(period.start);
  const end = Date.parse(period.end);
  if (Number.isNaN(start) || Number.isNaN(end)) return period.start.slice(0, 7);
  return new Date(start + (end - start) / 2).toISOString().slice(0, 7);
}

/** This site's numbers for one month (spec v1.1 §7: usage covers this key's site), or null when the engine has none. */
export function siteMetrics(usage: Usage, siteId: string, month: string): Record<string, number> | null {
  const sites = usage.months.find((entry) => entry.month === month)?.sites ?? [];
  return sites.find((site) => site.siteId === siteId)?.metrics ?? null;
}

const MONTH = /^(\d{4})-(\d{2})$/;

/** The `count` months ending with `month` (YYYY-MM), oldest first; none when the month can't be read. */
export function lastMonths(month: string, count: number): string[] {
  const match = MONTH.exec(month);
  if (!match) return [];
  const end = Number(match[1]) * 12 + Number(match[2]) - 1;
  return Array.from({ length: count }, (_, i) => {
    const index = end - (count - 1 - i);
    return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
  });
}

/** One metric's monthly numbers for this site; a month with no numbers is 0. */
export function metricSeries(usage: Usage, siteId: string, months: string[], metric: string): { month: string; value: number }[] {
  return months.map((month) => ({ month, value: siteMetrics(usage, siteId, month)?.[metric] ?? 0 }));
}

/** This site's results (spec v1.1 §7 usage.results: articles published, keywords covered), or zeros. */
export function siteResults(usage: Usage, siteId: string): { published: number; keywordsCovered: number } {
  const found = usage.results.find((result) => result.siteId === siteId);
  return { published: found?.published ?? 0, keywordsCovered: found?.keywordsCovered ?? 0 };
}
