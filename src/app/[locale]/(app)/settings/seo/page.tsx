import { Suspense } from "react";
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
      <h1 className="font-heading text-3xl">{t("title")}</h1>
      <SettingsTabs current="seo" />
      <Suspense fallback={<SectionSkeleton />}>
        <SeoView locale={locale} />
      </Suspense>
    </div>
  );
}
