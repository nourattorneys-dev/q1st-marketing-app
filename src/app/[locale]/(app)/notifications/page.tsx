import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SectionSkeleton } from "@/components/dashboard/section-skeleton";
import { NotificationsView } from "@/components/notifications/notifications-view";
import { asAppLocale } from "@/i18n/locales";

export default async function NotificationsPage({ params }: PageProps<"/[locale]/notifications">) {
  const locale = asAppLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("Notifications");
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-[32px] leading-tight">{t("title")}</h1>
      <Suspense fallback={<SectionSkeleton />}>
        <NotificationsView locale={locale} />
      </Suspense>
    </div>
  );
}
