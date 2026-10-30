import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ConnectionWarnings } from "@/components/dashboard/connection-warnings";
import { Greeting, GreetingActions } from "@/components/dashboard/greeting";
import { NextSlotCard } from "@/components/dashboard/next-slot-card";
import { QuotaPanel } from "@/components/dashboard/quota-panel";
import { SectionSkeleton } from "@/components/dashboard/section-skeleton";
import { StatCards } from "@/components/dashboard/stat-cards";
import { asAppLocale } from "@/i18n/locales";

/** P2b dashboard: a greeting and next steps, the counts, what needs attention beside the schedule, and the month's usage. */
export default async function DashboardPage({ params }: PageProps<"/[locale]">) {
  const locale = asAppLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("Dashboard");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-3">
          <h1 className="font-heading text-[32px] leading-tight">{t("title")}</h1>
          <Suspense fallback={<div className="h-16" />}>
            <Greeting locale={locale} />
          </Suspense>
        </div>
        <GreetingActions />
      </div>
      <Suspense fallback={<SectionSkeleton />}>
        <StatCards locale={locale} />
      </Suspense>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Suspense fallback={<SectionSkeleton />}>
          <ConnectionWarnings locale={locale} />
        </Suspense>
        <Suspense fallback={<SectionSkeleton />}>
          <NextSlotCard locale={locale} />
        </Suspense>
      </div>
      <Suspense fallback={<SectionSkeleton />}>
        <QuotaPanel locale={locale} />
      </Suspense>
    </div>
  );
}
