import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AppLocale } from "@/i18n/locales";
import type { Usage } from "@/lib/engine/schemas";
import { formatMonth } from "@/lib/format/datetime";
import { formatNumber } from "@/lib/format/number";
import { metricSeries } from "@/lib/plan/usage";

type Props = { locale: AppLocale; metrics: string[]; months: string[]; usage: Usage; siteId: string };

/** Spec v1.1 §6 Plan & usage: this site's usage per metric (metrics from /account/plan), as plain bars; each metric's busiest month is full height. */
export async function UsageChart({ locale, metrics, months, usage, siteId }: Props) {
  const t = await getTranslations("Plan.usage");
  const tMetrics = await getTranslations("Dashboard.quota.metrics");
  return (
    <Card data-testid="usage-chart">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("hint", { from: formatMonth(months[0], locale), to: formatMonth(months[months.length - 1], locale) })}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 sm:grid-cols-2">
        {metrics.map((metric) => {
          const series = metricSeries(usage, siteId, months, metric);
          const max = Math.max(1, ...series.map((point) => point.value));
          const label = tMetrics.has(metric) ? tMetrics(metric) : metric;
          return (
            <figure key={metric} data-testid={`usage-${metric}`} className="flex flex-col gap-2">
              <figcaption className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium">{label}</span>
                <span data-testid={`usage-latest-${metric}`} className="text-muted-foreground">
                  {formatNumber(series[series.length - 1]?.value ?? 0, locale)}
                </span>
              </figcaption>
              <ol className="flex h-24 items-end gap-1.5" aria-label={label}>
                {series.map((point) => (
                  <li
                    key={point.month}
                    data-testid={`usage-bar-${metric}-${point.month}`}
                    aria-label={t("bar", { month: formatMonth(point.month, locale), value: formatNumber(point.value, locale) })}
                    className="flex h-full flex-1 flex-col justify-end"
                  >
                    <div className="w-full rounded-t bg-primary/70" style={{ height: `${Math.round((point.value / max) * 100)}%` }} />
                  </li>
                ))}
              </ol>
              <div className="flex gap-1.5 text-[10px] text-muted-foreground" aria-hidden="true">
                {series.map((point) => (
                  <span key={point.month} className="flex-1 text-center">
                    {formatMonth(point.month, locale, { year: false })}
                  </span>
                ))}
              </div>
            </figure>
          );
        })}
      </CardContent>
    </Card>
  );
}
