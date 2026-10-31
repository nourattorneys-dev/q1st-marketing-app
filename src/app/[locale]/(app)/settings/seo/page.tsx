import { Suspense } from "react";
import { LimitStrip } from "@/components/plan/limit-strip";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SectionSkeleton } from "@/components/dashboard/section-skeleton";
import { SeoView } from "@/components/settings/seo-view";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { asAppLocale } from "@/i18n/locales";

export default async function SeoSettingsPage({ params }: PageProps<"/[locale]/settings/seo">) {
  const locale = asAppLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("Settings");
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-[32px] leading-tight">{t("title")}</h1>
      <SettingsTabs current="seo" />
      <Suspense fallback={null}>
        <LimitStrip locale={locale} metrics={["profileProposals"]} />
      </Suspense>
      <Suspense fallback={<SectionSkeleton />}>
        <SeoView locale={locale} />
      </Suspense>
    </div>
  );
}
