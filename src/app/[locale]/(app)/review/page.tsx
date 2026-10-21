import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SectionSkeleton } from "@/components/dashboard/section-skeleton";
import { ReviewQueue } from "@/components/review/review-queue";
import { asAppLocale } from "@/i18n/locales";

export default async function ReviewPage({ params, searchParams }: PageProps<"/[locale]/review">) {
  const locale = asAppLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("Review");
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl">{t("title")}</h1>
      <Suspense fallback={<SectionSkeleton />}>
        <ReviewQueue locale={locale} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
