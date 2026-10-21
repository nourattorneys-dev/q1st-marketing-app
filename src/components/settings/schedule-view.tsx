import { getTranslations } from "next-intl/server";
import { EngineNotice } from "@/components/dashboard/engine-notice";
import type { AppLocale } from "@/i18n/locales";
import { requirePermission } from "@/lib/auth/session";
import { nextSlotView } from "@/lib/dashboard/next-slot";
import { getEngine } from "@/lib/engine";
import { tryEngine } from "@/lib/engine/result";
import { formatDateTime } from "@/lib/format/datetime";
import { ScheduleSettingsForm } from "./schedule-form";

/** The schedule form, with the next slot as the engine reports it (spec v1.1 §4: never worked out in the browser). */
export async function ScheduleView({ locale }: { locale: AppLocale }) {
  await requirePermission(locale, "settings.manage");
  const t = await getTranslations("Settings.schedule");
  const tSlot = await getTranslations("Dashboard.nextSlot");
  const engine = await getEngine();
  const [settings, scheduled, site] = await Promise.all([
    tryEngine(() => engine.publishingSettings()),
    tryEngine(() => engine.scheduled({ pageSize: 1 })),
    tryEngine(() => engine.siteTimezone()),
  ]);
  if (!settings.ok) return <EngineNotice error={settings.error} />;

  let nextSlot: string | null = null;
  if (scheduled.ok && site.ok) {
    const view = nextSlotView(scheduled.data);
    nextSlot =
      view.kind === "slot"
        ? t("nextSlot", { time: formatDateTime(view.at, { timeZone: site.data.timezone, locale }) })
        : view.kind === "off"
          ? tSlot("off")
          : tSlot("waiting", { reason: tSlot.has(`reasons.${view.reason}`) ? tSlot(`reasons.${view.reason}`) : view.reason });
  }

  return (
    <div className="flex flex-col gap-4">
      {nextSlot && (
        <p role="status" data-testid="schedule-next-slot" className="rounded-md bg-muted px-3 py-2 text-sm">
          {nextSlot}
        </p>
      )}
      <ScheduleSettingsForm locale={locale} settings={settings.data} />
    </div>
  );
}
