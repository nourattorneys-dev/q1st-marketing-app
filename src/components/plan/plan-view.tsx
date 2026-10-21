import { getTranslations } from "next-intl/server";
import { EngineNotice } from "@/components/dashboard/engine-notice";
import { QuotaBars } from "@/components/dashboard/quota-bars";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/locales";
import { requirePermission } from "@/lib/auth/session";
import { getEngine } from "@/lib/engine";
import { tryEngine } from "@/lib/engine/result";
import { formatDate } from "@/lib/format/datetime";
import { formatNumber } from "@/lib/format/number";
import { lastMonths, periodMonth, siteMetrics, siteResults } from "@/lib/plan/usage";
import { RequestUpgrade } from "./request-upgrade";
import { UsageChart } from "./usage-chart";

/** Spec v1.1 §6 /account Plan & usage tab (design §7 /plan, Admin): plan, quota bars, this site's usage and results, Request upgrade. */
export async function PlanView({ locale }: { locale: AppLocale }) {
  await requirePermission(locale, "plan.manage");
  const t = await getTranslations("Plan");
  const engine = await getEngine();
  const [plan, siteId, site] = await Promise.all([tryEngine(() => engine.plan()), tryEngine(() => engine.siteId()), tryEngine(() => engine.siteTimezone())]);
  if (!plan.ok) return <EngineNotice error={plan.error} />;

  const timeZone = site.ok ? site.data.timezone : "UTC";
  const month = periodMonth(plan.data.period);
  const months = lastMonths(month, 6);
  const usage = months.length > 0 ? await tryEngine(() => engine.usage({ from: months[0], to: month })) : null;
  const id = siteId.ok ? siteId.data : "";
  const siteUsage = usage?.ok ? siteMetrics(usage.data, id, month) : null;
  const results = usage?.ok ? siteResults(usage.data, id) : null;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle data-testid="plan-name">{plan.data.plan.name}</CardTitle>
          <CardDescription data-testid="plan-period">
            {t("period", { from: formatDate(plan.data.period.start, { timeZone, locale }), to: formatDate(plan.data.period.end, { timeZone, locale }) })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <QuotaBars locale={locale} quotas={plan.data.quotas} siteUsage={siteUsage} />
        </CardContent>
      </Card>
      {usage && !usage.ok && <EngineNotice error={usage.error} />}
      {usage?.ok && <UsageChart locale={locale} metrics={plan.data.metrics} months={months} usage={usage.data} siteId={id} />}
      {results && (
        <Card>
          <CardHeader>
            <CardTitle>{t("results.title")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-8 text-sm">
            <div>
              <p data-testid="results-published" className="text-2xl font-semibold">
                {formatNumber(results.published, locale)}
              </p>
              <p className="text-muted-foreground">{t("results.published")}</p>
            </div>
            <div>
              <p data-testid="results-keywords" className="text-2xl font-semibold">
                {formatNumber(results.keywordsCovered, locale)}
              </p>
              <p className="text-muted-foreground">{t("results.keywordsCovered")}</p>
            </div>
            <Link href="/history" data-testid="results-live" className="text-primary underline">
              {t("results.liveUrls")}
            </Link>
          </CardContent>
        </Card>
      )}
      <RequestUpgrade locale={locale} metrics={plan.data.metrics} />
    </div>
  );
}
