import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SectionSkeleton } from "@/components/dashboard/section-skeleton";
import { ScheduledQueue } from "@/components/schedule/scheduled-queue";
import { asAppLocale } from "@/i18n/locales";

export default async function ScheduledPage({ params }: PageProps<"/[locale]/scheduled">) {
  const locale = asAppLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("Scheduled");
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-[32px] leading-tight">{t("title")}</h1>
      <Suspense fallback={<SectionSkeleton />}>
        <ScheduledQueue locale={locale} />
      </Suspense>
    </div>
  );
}
