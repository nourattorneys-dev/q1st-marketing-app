import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { INTL_LOCALE, type AppLocale } from "@/i18n/locales";
import { requireSession } from "@/lib/auth/session";
import { getEngine } from "@/lib/engine";
import { tryEngine } from "@/lib/engine/result";

/** The part of the day at the site's time zone (P2b greeting). */
export function dayPart(now: Date, timeZone: string): "morning" | "afternoon" | "evening" {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone }).format(now));
  return hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
}

/** P2b: today's date, a greeting by name, what is waiting, and the two most common next steps. */
export async function Greeting({ locale }: { locale: AppLocale }) {
  const session = await requireSession(locale);
  const t = await getTranslations("Dashboard");
  const engine = await getEngine();
  const [site, counts] = await Promise.all([tryEngine(() => engine.siteTimezone()), tryEngine(() => engine.siteCounts())]);
  const timeZone = site.ok ? site.data.timezone : "Asia/Dubai";
  const now = new Date();
  const name = session.name.split(/\s+/)[0] ?? session.name;
  const date = new Intl.DateTimeFormat(INTL_LOCALE[locale], { weekday: "long", day: "numeric", month: "long", timeZone, numberingSystem: "latn" }).format(now);
  return (
    <div className="flex flex-col gap-1.5" data-testid="greeting">
      <span className="text-xs text-muted-foreground ltr:font-mono ltr:tracking-[0.1em] ltr:uppercase">{date}</span>
      <p className="text-lg font-medium">{t(`greeting.${dayPart(now, timeZone)}`, { name })}</p>
      {counts.ok && <p className="text-sm text-muted-foreground">{t("summary", { count: counts.data.counts.pending })}</p>}
    </div>
  );
}

export async function GreetingActions() {
  const t = await getTranslations("Dashboard");
  return (
    <div className="flex flex-wrap gap-2">
      <Link href="/ideas" className="inline-flex h-11 items-center rounded-xl border border-border bg-card px-4 text-sm font-semibold transition-colors duration-200 hover:bg-accent">
        {t("suggestTopics")}
      </Link>
      <Link
        href="/review"
        className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity duration-200 hover:opacity-90"
      >
        {t("reviewNow")}
        <ArrowRight aria-hidden="true" className="size-4 rtl:rotate-180" />
      </Link>
    </div>
  );
}
