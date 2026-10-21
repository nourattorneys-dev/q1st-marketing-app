import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SectionSkeleton } from "@/components/dashboard/section-skeleton";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { WebhookView } from "@/components/settings/webhook-view";
import { asAppLocale } from "@/i18n/locales";

export default async function WebhookSettingsPage({ params }: PageProps<"/[locale]/settings/webhook">) {
  const locale = asAppLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("Settings");
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl">{t("title")}</h1>
      <SettingsTabs current="webhook" />
      <Suspense fallback={<SectionSkeleton />}>
        <WebhookView locale={locale} />
      </Suspense>
    </div>
  );
}
