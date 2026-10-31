import { Suspense } from "react";
import { LimitStrip } from "@/components/plan/limit-strip";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SectionSkeleton } from "@/components/dashboard/section-skeleton";
import { SiteHealthView } from "@/components/site-health/site-health-view";
import { asAppLocale } from "@/i18n/locales";

// searchParams (tab, page) is request data: it's awaited inside the Suspense boundary (Cache Components).
export default async function SiteHealthPage({ params, searchParams }: PageProps<"/[locale]/site-health">) {
  const locale = asAppLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("SiteHealth");
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-[32px] leading-tight">{t("title")}</h1>
        <Suspense fallback={null}>
          <LimitStrip locale={locale} metrics={["siteScans"]} />
        </Suspense>
        <p className="text-sm text-muted-foreground">{t("hint")}</p>
      </div>
      <Suspense fallback={<SectionSkeleton />}>
        <SiteHealthView locale={locale} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
