import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AppLocale } from "@/i18n/locales";
import { requireSession } from "@/lib/auth/session";
import { quotaView } from "@/lib/dashboard/quota";
import { getEngine } from "@/lib/engine";
import { tryEngine } from "@/lib/engine/result";
import { formatNumber } from "@/lib/format/number";
import { cn } from "@/lib/utils";
import { EngineNotice } from "./engine-notice";

export async function QuotaPanel({ locale }: { locale: AppLocale }) {
  await requireSession(locale);
  const t = await getTranslations("Dashboard.quota");
  const engine = await getEngine();
  const plan = await tryEngine(() => engine.plan());

  if (!plan.ok) {
    return (
      <Card data-testid="quota">
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <EngineNotice error={plan.error} />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="quota">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{plan.data.plan.name}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-4">
          {plan.data.quotas.map((quota) => {
            const q = quotaView(quota);
            const label = t.has(`metrics.${q.metric}`) ? t(`metrics.${q.metric}`) : q.metric;
            const used = formatNumber(q.used, locale);
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
                      className={cn(
                        "h-full rounded-full",
                        q.state === "over" ? "bg-bad-fg" : q.state === "warning" ? "bg-warn-fg" : "bg-primary",
                      )}
                      style={{ width: `${q.percent}%` }}
                    />
                  </div>
                )}
                {q.state === "warning" && <p className="mt-1 text-xs text-warn-fg">{t("warning")}</p>}
                {q.state === "over" && <p className="mt-1 text-xs text-bad-fg">{t("over")}</p>}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
