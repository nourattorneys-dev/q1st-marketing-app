import { Suspense } from "react";
import { LimitStrip } from "@/components/plan/limit-strip";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SectionSkeleton } from "@/components/dashboard/section-skeleton";
import { KeywordsView } from "@/components/keywords/keywords-view";
import { asAppLocale } from "@/i18n/locales";

export default async function KeywordsPage({ params, searchParams }: PageProps<"/[locale]/keywords">) {
  const locale = asAppLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("Keywords");
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-[32px] leading-tight">{t("title")}</h1>
      <Suspense fallback={null}>
        <LimitStrip locale={locale} metrics={["keywordProposals", "topicRuns", "articles"]} />
      </Suspense>
      <Suspense fallback={<SectionSkeleton />}>
        <KeywordsView locale={locale} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
