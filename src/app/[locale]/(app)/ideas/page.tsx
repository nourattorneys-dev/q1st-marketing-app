import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SectionSkeleton } from "@/components/dashboard/section-skeleton";
import { IdeasView } from "@/components/ideas/ideas-view";
import { asAppLocale } from "@/i18n/locales";

export default async function IdeasPage({ params }: PageProps<"/[locale]/ideas">) {
  const locale = asAppLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("Ideas");
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl">{t("title")}</h1>
      <Suspense fallback={<SectionSkeleton />}>
        <IdeasView locale={locale} />
      </Suspense>
    </div>
  );
}
