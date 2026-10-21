import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SectionSkeleton } from "@/components/dashboard/section-skeleton";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { SocialView } from "@/components/settings/social-view";
import { asAppLocale } from "@/i18n/locales";

// searchParams (?connected=… after the OAuth round trip) is request data: awaited inside the Suspense boundary (Cache Components).
export default async function SocialSettingsPage({ params, searchParams }: PageProps<"/[locale]/settings/social">) {
  const locale = asAppLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("Settings");
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl">{t("title")}</h1>
      <SettingsTabs current="social" />
      <Suspense fallback={<SectionSkeleton />}>
        <SocialView locale={locale} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
