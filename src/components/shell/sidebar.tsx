import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/locales";
import { SidebarNav } from "./sidebar-nav";

export async function Sidebar({ locale }: { locale: AppLocale }) {
  const t = await getTranslations("Shell");
  return (
    <aside className="border-e border-border bg-sidebar p-4 text-sidebar-foreground">
      <div className="mb-6 font-heading text-xl">{t("brand")}</div>
      <Suspense fallback={<p className="text-sm text-muted-foreground">{t("loading")}</p>}>
        <SidebarNav locale={locale} />
      </Suspense>
    </aside>
  );
}
