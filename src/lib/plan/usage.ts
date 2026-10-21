import type { Usage } from "@/lib/engine/schemas";

/** The plan period's month, YYYY-MM, as the engine wrote it (spec v1.1 §4 Plan.period), never from the browser's clock. */
export const monthOf = (iso: string) => iso.slice(0, 7);

/** This site's numbers for one month (spec v1.1 §7: usage covers this key's site), or null when the engine has none. */
export function siteMetrics(usage: Usage, siteId: string, month: string): Record<string, number> | null {
  const sites = usage.months.find((entry) => entry.month === month)?.sites ?? [];
  return sites.find((site) => site.siteId === siteId)?.metrics ?? null;
}
