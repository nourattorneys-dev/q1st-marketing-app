import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { INTL_LOCALE, type AppLocale } from "@/i18n/locales";
import { requireSession } from "@/lib/auth/session";
import { nextSlotView } from "@/lib/dashboard/next-slot";
import { getEngine } from "@/lib/engine";
import { tryEngine } from "@/lib/engine/result";
import { formatDateTime } from "@/lib/format/datetime";
import { EngineNotice } from "./engine-notice";

const SHOWN = 4;

/** A date chip for one scheduled post: short weekday over the day of the month, in the site's time zone. */
function dayChip(iso: string, locale: AppLocale, timeZone: string) {
  const at = new Date(iso);
  const part = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(INTL_LOCALE[locale], { ...options, timeZone, numberingSystem: "latn" }).format(at);
  return { weekday: part({ weekday: "short" }), day: part({ day: "numeric" }) };
}

/**
 * P2b: the publishing schedule, on the ink panel: when the next post goes out (or why nothing is going out), then the
 * next few scheduled posts by day.
 */
export async function NextSlotCard({ locale }: { locale: AppLocale }) {
  await requireSession(locale);
  const t = await getTranslations("Dashboard");
  const engine = await getEngine();
  const [site, scheduled] = await Promise.all([tryEngine(() => engine.siteTimezone()), tryEngine(() => engine.scheduled({ pageSize: SHOWN }))]);

  let body;
  if (!site.ok) body = <EngineNotice error={site.error} />;
  else if (!scheduled.ok) body = <EngineNotice error={scheduled.error} />;
  else {
    const timeZone = site.data.timezone;
    const view = nextSlotView(scheduled.data);
    const next =
      view.kind === "slot" ? (
        <p className="text-sm text-[#a9b1c4]">
          {t("schedule.next")}:{" "}
          <span className="font-semibold text-[#eef1f7]" data-testid="next-slot-time">
            {formatDateTime(view.at, { timeZone, locale })}
          </span>
        </p>
      ) : view.kind === "off" ? (
        <p className="text-sm text-[#a9b1c4]">{t("nextSlot.off")}</p>
      ) : (
        <p className="text-sm text-[#a9b1c4]">
          {t("nextSlot.waiting", { reason: t.has(`nextSlot.reasons.${view.reason}`) ? t(`nextSlot.reasons.${view.reason}`) : view.reason })}
        </p>
      );
    const posts = scheduled.data.posts.filter((post) => post.schedule?.scheduledAt).slice(0, SHOWN);
    body = (
      <div className="flex flex-col gap-4">
        {next}
        {posts.length === 0 ? (
          <p className="text-sm text-[#a9b1c4]">{t("schedule.none")}</p>
        ) : (
          <ol className="flex flex-col gap-3.5">
            {posts.map((post, index) => {
              const at = post.schedule!.scheduledAt!;
              const chip = dayChip(at, locale, timeZone);
              return (
                <li key={post.id} className="flex gap-3.5">
                  <span className={`flex w-11 shrink-0 flex-col items-center rounded-[10px] py-1.5 ${index === 0 ? "bg-[#2f6bff] text-white" : "bg-[#1a2236] text-[#eef1f7]"}`}>
                    <span className="text-[10px] uppercase opacity-80">{chip.weekday}</span>
                    <span className="text-lg leading-tight font-semibold">{chip.day}</span>
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-sm font-semibold text-[#eef1f7]" dir="auto">
                      {post.title}
                    </span>
                    <span className="text-xs text-[#a9b1c4]">{formatDateTime(at, { timeZone, locale })}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    );
  }

  return (
    <section data-testid="next-slot" className="flex flex-col gap-4 rounded-[20px] bg-[#0a0f1c] p-6 text-[#eef1f7] dark:bg-[#111a2e]">
      <h2 className="text-[17px] font-semibold">{t("schedule.title")}</h2>
      {body}
      <Link href="/scheduled" className="mt-auto text-sm font-semibold text-[#8fb1ff] transition-colors duration-200 hover:text-white">
        {t("schedule.all")} <span aria-hidden="true" className="inline-block rtl:rotate-180">→</span>
      </Link>
    </section>
  );
}
