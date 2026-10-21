import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SectionSkeleton } from "@/components/dashboard/section-skeleton";
import { PlanView } from "@/components/plan/plan-view";
import { asAppLocale } from "@/i18n/locales";

export default async function PlanPage({ params }: PageProps<"/[locale]/plan">) {
  const locale = asAppLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("Plan");
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl">{t("title")}</h1>
      <Suspense fallback={<SectionSkeleton />}>
        <PlanView locale={locale} />
      </Suspense>
    </div>
  );
}
