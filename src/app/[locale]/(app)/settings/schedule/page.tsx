import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SectionSkeleton } from "@/components/dashboard/section-skeleton";
import { ScheduleView } from "@/components/settings/schedule-view";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { asAppLocale } from "@/i18n/locales";

export default async function ScheduleSettingsPage({ params }: PageProps<"/[locale]/settings/schedule">) {
  const locale = asAppLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("Settings");
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl">{t("title")}</h1>
      <SettingsTabs current="schedule" />
      <Suspense fallback={<SectionSkeleton />}>
        <ScheduleView locale={locale} />
      </Suspense>
    </div>
  );
}
