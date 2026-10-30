import type { Quota } from "@/lib/engine/schemas";

/**
 * What each metered thing is called, in the page's language. The engine names its metrics (and adds new ones), so its
 * label wins; the app's own wording is next; a metric neither knows is spelled out from its key ("keywordProposals" →
 * "Keyword proposals"), never shown raw.
 */
export type MetricNames = Record<string, string>;

export function metricNames(quotas: Quota[], locale: string): MetricNames {
  const names: MetricNames = {};
  for (const quota of quotas) {
    const name = locale === "ar" ? quota.labelAr || null : quota.label || null;
    if (name) names[quota.metric] = name;
  }
  return names;
}

export function spellOut(key: string): string {
  const words = key.replace(/[_-]+/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function metricLabel(metric: string, names: MetricNames, own: { has: (key: string) => boolean; get: (key: string) => string }): string {
  return names[metric] ?? (own.has(metric) ? own.get(metric) : spellOut(metric));
}
