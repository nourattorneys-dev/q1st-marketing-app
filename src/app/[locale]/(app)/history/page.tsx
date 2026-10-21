import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SectionSkeleton } from "@/components/dashboard/section-skeleton";
import { HistoryList } from "@/components/history/history-list";
import { asAppLocale } from "@/i18n/locales";

// searchParams is request data: it is passed down and awaited inside the Suspense boundary (Cache Components).
export default async function HistoryPage({ params, searchParams }: PageProps<"/[locale]/history">) {
  const locale = asAppLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("History");
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl">{t("title")}</h1>
      <Suspense fallback={<SectionSkeleton />}>
        <HistoryList locale={locale} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
