import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/locales";
import { ProductMark } from "@/components/brand/node-q";
import { SidebarFrame } from "./sidebar-frame";
import { SidebarNav } from "./sidebar-nav";

export async function Sidebar({ locale }: { locale: AppLocale }) {
  const t = await getTranslations("Shell");
  return (
    <aside className="border-b border-border bg-sidebar p-4 text-sidebar-foreground md:border-e md:border-b-0">
      <SidebarFrame brand={<ProductMark name={t("brand")} byline={t("byline")} />} menu={t("menu")} close={t("closeMenu")}>
        <Suspense fallback={<p className="text-sm text-muted-foreground">{t("loading")}</p>}>
          <SidebarNav locale={locale} />
        </Suspense>
      </SidebarFrame>
    </aside>
  );
}
