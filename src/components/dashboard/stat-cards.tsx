import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/locales";
import { requireSession } from "@/lib/auth/session";
import { getEngine } from "@/lib/engine";
import { tryEngine } from "@/lib/engine/result";
import { formatNumber } from "@/lib/format/number";
import { cn } from "@/lib/utils";
import { EngineNotice } from "./engine-notice";

/** P2b: the site's counts, each a way into the page that lists them; failures stand out when there are any. */
export async function StatCards({ locale }: { locale: AppLocale }) {
  await requireSession(locale);
  const t = await getTranslations("Dashboard");
  const engine = await getEngine();
  const site = await tryEngine(() => engine.siteCounts());
  if (!site.ok) return <EngineNotice error={site.error} />;

  const { counts } = site.data;
  const stats = [
    ["pending", counts.pending, "/review"],
    ["scheduled", counts.scheduled, "/scheduled"],
    ["published", counts.published, "/history"],
    ["suggestions", counts.suggestions, "/ideas"],
    ["failed", counts.failed, "/history"],
  ] as const;

  return (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {stats.map(([key, value, href]) => {
        const warn = key === "failed" && value > 0;
        return (
          <Link
            key={key}
            href={href}
            data-testid={`stat-${key}`}
            className={cn(
              "group flex flex-col gap-2.5 rounded-[20px] border bg-card px-5 py-4 transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/40",
              warn ? "border-warn-fg/30 text-warn-fg" : "border-border",
            )}
          >
            <span className={cn("text-[13px]", warn ? "text-warn-fg" : "text-muted-foreground")}>{t(`stats.${key}`)}</span>
            <span className="text-4xl leading-none font-semibold tracking-[-0.03em]" data-testid={`stat-${key}-value`}>
              {formatNumber(value, locale)}
            </span>
            <span className={cn("text-[12.5px] font-medium", warn ? "text-warn-fg" : "text-muted-foreground group-hover:text-primary")}>{t(`open.${key}`)}</span>
          </Link>
        );
      })}
    </section>
  );
}
