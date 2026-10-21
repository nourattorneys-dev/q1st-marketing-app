import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/locales";
import { quotaView } from "@/lib/dashboard/quota";
import type { Quota } from "@/lib/engine/schemas";
import { formatNumber } from "@/lib/format/number";
import { cn } from "@/lib/utils";

type Props = { locale: AppLocale; quotas: Quota[]; siteUsage: Record<string, number> | null };

/** Account-wide quota bars from /account/plan (spec v1.1 §4), each with this site's share this month when the engine reports it. */
export async function QuotaBars({ locale, quotas, siteUsage }: Props) {
  const t = await getTranslations("Dashboard.quota");
  return (
    <ul className="flex flex-col gap-4">
      {quotas.map((quota) => {
        const q = quotaView(quota);
        const label = t.has(`metrics.${q.metric}`) ? t(`metrics.${q.metric}`) : q.metric;
        const used = formatNumber(q.used, locale);
        const share = siteUsage?.[q.metric];
        return (
          <li key={q.metric} data-testid={`quota-${q.metric}`} data-state={q.state}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium">{label}</span>
              <span className="text-muted-foreground">
                {q.limit === null ? t("unlimited", { used }) : t("usage", { used, limit: formatNumber(q.limit, locale) })}
              </span>
            </div>
            {q.limit !== null && (
              <div
                className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-label={label}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={q.percent}
              >
                <div
                  className={cn("h-full rounded-full", q.state === "over" ? "bg-bad-fg" : q.state === "warning" ? "bg-warn-fg" : "bg-primary")}
                  style={{ width: `${q.percent}%` }}
                />
              </div>
            )}
            {share !== undefined && (
              <p data-testid={`quota-site-${q.metric}`} className="mt-1 text-xs text-muted-foreground">
                {t("thisSite", { used: formatNumber(share, locale) })}
              </p>
            )}
            {q.state === "warning" && <p className="mt-1 text-xs text-warn-fg">{t("warning")}</p>}
            {q.state === "over" && <p className="mt-1 text-xs text-bad-fg">{t("over")}</p>}
          </li>
        );
      })}
    </ul>
  );
}
