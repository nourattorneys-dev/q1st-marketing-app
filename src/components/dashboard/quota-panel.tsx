import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AppLocale } from "@/i18n/locales";
import { requireSession } from "@/lib/auth/session";
import { getEngine } from "@/lib/engine";
import { tryEngine } from "@/lib/engine/result";
import { periodMonth, siteMetrics } from "@/lib/plan/usage";
import { EngineNotice } from "./engine-notice";
import { QuotaBars } from "./quota-bars";

/** Spec v1.1 §6 dashboard: quota bars for the account, and this site's share of the usage this month. */
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

  // The site's share is extra: if usage can't be read, the account bars still show.
  const month = periodMonth(plan.data.period);
  const [usage, siteId] = await Promise.all([tryEngine(() => engine.usage({ from: month, to: month })), tryEngine(() => engine.siteId())]);
  const siteUsage = usage.ok && siteId.ok ? siteMetrics(usage.data, siteId.data, month) : null;

  return (
    <Card data-testid="quota">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{plan.data.plan.name}</CardDescription>
      </CardHeader>
      <CardContent>
        <QuotaBars locale={locale} quotas={plan.data.quotas} siteUsage={siteUsage} />
      </CardContent>
    </Card>
  );
}
