import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AppLocale } from "@/i18n/locales";
import { requireSession } from "@/lib/auth/session";
import { nextSlotView } from "@/lib/dashboard/next-slot";
import { getEngine } from "@/lib/engine";
import { tryEngine } from "@/lib/engine/result";
import { formatDateTime } from "@/lib/format/datetime";
import { EngineNotice } from "./engine-notice";

export async function NextSlotCard({ locale }: { locale: AppLocale }) {
  await requireSession(locale);
  const t = await getTranslations("Dashboard.nextSlot");
  const engine = await getEngine();
  const [site, scheduled] = await Promise.all([
    tryEngine(() => engine.site()),
    tryEngine(() => engine.scheduled({ pageSize: 5 })),
  ]);

  let body;
  if (!site.ok) body = <EngineNotice error={site.error} />;
  else if (!scheduled.ok) body = <EngineNotice error={scheduled.error} />;
  else {
    const view = nextSlotView(scheduled.data);
    if (view.kind === "slot") {
      body = (
        <p className="text-lg" data-testid="next-slot-time">
          {formatDateTime(view.at, { timeZone: site.data.timezone, locale })}
        </p>
      );
    } else if (view.kind === "off") {
      body = <p className="text-sm text-muted-foreground">{t("off")}</p>;
    } else {
      const reason = t.has(`reasons.${view.reason}`) ? t(`reasons.${view.reason}`) : view.reason;
      body = <p className="text-sm text-muted-foreground">{t("waiting", { reason })}</p>;
    }
  }

  return (
    <Card data-testid="next-slot">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
