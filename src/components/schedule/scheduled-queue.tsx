import { getTranslations } from "next-intl/server";
import { EngineNotice } from "@/components/dashboard/engine-notice";
import { SkippedNote } from "@/components/lists/skipped-note";
import type { AppLocale } from "@/i18n/locales";
import { requirePermission } from "@/lib/auth/session";
import { nextSlotView } from "@/lib/dashboard/next-slot";
import { getEngine } from "@/lib/engine";
import { tryEngine } from "@/lib/engine/result";
import { formatDateTime } from "@/lib/format/datetime";
import { cn } from "@/lib/utils";
import { ScheduleBoard, type QueueItem } from "./schedule-board";

/** Spec v1.1 §6 /scheduled: the banner (auto-publish state and next slot, or why nothing is going out) and the queue. */
export async function ScheduledQueue({ locale }: { locale: AppLocale }) {
  await requirePermission(locale, "content.work");
  const t = await getTranslations("Scheduled");
  const tSlot = await getTranslations("Dashboard.nextSlot");
  const engine = await getEngine();
  const [scheduled, site] = await Promise.all([tryEngine(() => engine.scheduled()), tryEngine(() => engine.siteTimezone())]);
  if (!scheduled.ok) return <EngineNotice error={scheduled.error} />;
  if (!site.ok) return <EngineNotice error={site.error} />;
  const timeZone = site.data.timezone;

  const view = nextSlotView(scheduled.data);
  const banner =
    view.kind === "slot"
      ? t("bannerSlot", { time: formatDateTime(view.at, { timeZone, locale }) })
      : view.kind === "off"
        ? tSlot("off")
        : tSlot("waiting", { reason: tSlot.has(`reasons.${view.reason}`) ? tSlot(`reasons.${view.reason}`) : view.reason });

  const items: QueueItem[] = scheduled.data.posts.map((post) => ({
    id: post.id,
    title: post.title,
    language: post.language,
    platform: post.platform,
    position: post.schedule?.position ?? null,
    hold: post.schedule?.hold ?? false,
    time: post.schedule?.scheduledAt ? formatDateTime(post.schedule.scheduledAt, { timeZone, locale }) : null,
    actions: post.actions,
  }));

  return (
    <div className="flex flex-col gap-4">
      <p
        role="status"
        data-testid="schedule-banner"
        className={cn("rounded-md px-3 py-2 text-sm", view.kind === "slot" ? "bg-ok-bg text-ok-fg" : "bg-warn-bg text-warn-fg")}
      >
        {banner}
      </p>
      <SkippedNote count={scheduled.data.skipped} />
      <ScheduleBoard locale={locale} items={items} />
    </div>
  );
}
