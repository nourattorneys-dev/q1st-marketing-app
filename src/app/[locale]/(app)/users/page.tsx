import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SectionSkeleton } from "@/components/dashboard/section-skeleton";
import { UsersView } from "@/components/users/users-view";
import { asAppLocale } from "@/i18n/locales";

export default async function UsersPage({ params }: PageProps<"/[locale]/users">) {
  const locale = asAppLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("Users");
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-[32px] leading-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("intro")}</p>
      </div>
      <Suspense fallback={<SectionSkeleton />}>
        <UsersView locale={locale} />
      </Suspense>
    </div>
  );
}
