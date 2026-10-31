import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/locales";
import { requireSession } from "@/lib/auth/session";
import { quotaView } from "@/lib/dashboard/quota";
import { getEngine } from "@/lib/engine";
import { tryEngine } from "@/lib/engine/result";
import { formatNumber } from "@/lib/format/number";
import { metricLabel, metricNames } from "@/lib/plan/metric-label";
import { cn } from "@/lib/utils";

const TONE = {
  ok: "border-border bg-card text-muted-foreground",
  unlimited: "border-border bg-card text-muted-foreground",
  warning: "border-warn-fg/30 bg-warn-bg text-warn-fg",
  over: "border-bad-fg/30 bg-bad-bg text-bad-fg",
} as const;

/**
 * What is left of the limits a section uses, so people see it before they start: each monthly limit ("Articles: 17 of
 * 20 left this month") and, where publishing happens, today's articles. Nothing shows when the plan can't be read.
 */
export async function LimitStrip({ locale, metrics, today = false }: { locale: AppLocale; metrics: string[]; today?: boolean }) {
  // The request first (as every engine view): while Next builds a page, this stops it before any setting is read.
  await requireSession(locale);
  const engine = await getEngine();
  const [plan, publishing] = await Promise.all([
    tryEngine(() => engine.plan()),
    today ? tryEngine(() => engine.publishingSettings()) : Promise.resolve(null),
  ]);
  if (!plan.ok) return null;
  const t = await getTranslations("Limits");
  const tQuota = await getTranslations("Dashboard.quota");
  const names = metricNames(plan.data.quotas, locale);
  const own = { has: (key: string) => tQuota.has(`metrics.${key}`), get: (key: string) => tQuota(`metrics.${key}` as never) };
  const chips = plan.data.quotas
    .filter((quota) => metrics.includes(quota.metric))
    .map((quota) => {
      const q = quotaView(quota);
      const label = metricLabel(q.metric, names, own);
      const text =
        q.limit === null
          ? t("unlimited", { label })
          : t("left", { label, left: formatNumber(Math.max(0, q.limit - q.used), locale), limit: formatNumber(q.limit, locale) });
      return { key: q.metric, text, state: q.state };
    });
  const day = publishing?.ok ? publishing.data : null;
  if (day && typeof day.maxPerDay === "number") {
    const left = Math.max(0, day.maxPerDay - (day.publishedToday ?? 0));
    chips.push({
      key: "today",
      text: t("today", { left: formatNumber(left, locale), limit: formatNumber(day.maxPerDay, locale) }),
      state: left === 0 ? "over" : left === 1 ? "warning" : "ok",
    });
  }
  if (chips.length === 0) return null;
  return (
    <ul data-testid="limit-strip" aria-label={t("label")} className="flex flex-wrap gap-2 animate-in fade-in-0 duration-300">
      {chips.map((chip) => (
        <li key={chip.key} data-testid={`limit-${chip.key}`} data-state={chip.state} className={cn("rounded-full border px-3 py-1 text-xs font-medium", TONE[chip.state])}>
          {chip.text}
        </li>
      ))}
    </ul>
  );
}
