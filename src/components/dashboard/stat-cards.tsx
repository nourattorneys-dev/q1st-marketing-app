import { getTranslations } from "next-intl/server";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AppLocale } from "@/i18n/locales";
import { requireSession } from "@/lib/auth/session";
import { getEngine } from "@/lib/engine";
import { tryEngine } from "@/lib/engine/result";
import { formatNumber } from "@/lib/format/number";
import { EngineNotice } from "./engine-notice";

export async function StatCards({ locale }: { locale: AppLocale }) {
  await requireSession(locale);
  const t = await getTranslations("Dashboard.stats");
  const engine = await getEngine();
  const site = await tryEngine(() => engine.site());
  if (!site.ok) return <EngineNotice error={site.error} />;

  const { counts } = site.data;
  const stats = [
    ["suggestions", counts.suggestions],
    ["pending", counts.pending],
    ["scheduled", counts.scheduled],
    ["published", counts.published],
    ["failed", counts.failed],
  ] as const;

  return (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {stats.map(([key, value]) => (
        <Card key={key} data-testid={`stat-${key}`}>
          <CardHeader>
            <CardDescription>{t(key)}</CardDescription>
            <CardTitle className="font-heading text-3xl" data-testid={`stat-${key}-value`}>
              {formatNumber(value, locale)}
            </CardTitle>
          </CardHeader>
        </Card>
      ))}
    </section>
  );
}
