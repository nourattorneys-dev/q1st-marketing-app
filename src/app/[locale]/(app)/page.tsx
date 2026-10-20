import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ConnectionWarnings } from "@/components/dashboard/connection-warnings";
import { NextSlotCard } from "@/components/dashboard/next-slot-card";
import { QuotaPanel } from "@/components/dashboard/quota-panel";
import { SectionSkeleton } from "@/components/dashboard/section-skeleton";
import { StatCards } from "@/components/dashboard/stat-cards";
import { asAppLocale } from "@/i18n/locales";

export default async function DashboardPage({ params }: PageProps<"/[locale]">) {
  const locale = asAppLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("Dashboard");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl">{t("title")}</h1>
      <Suspense fallback={<SectionSkeleton />}>
        <StatCards locale={locale} />
      </Suspense>
      <div className="grid gap-6 lg:grid-cols-2">
        <Suspense fallback={<SectionSkeleton />}>
          <NextSlotCard locale={locale} />
        </Suspense>
        <Suspense fallback={<SectionSkeleton />}>
          <ConnectionWarnings locale={locale} />
        </Suspense>
      </div>
      <Suspense fallback={<SectionSkeleton />}>
        <QuotaPanel locale={locale} />
      </Suspense>
    </div>
  );
}
