import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/locales";
import { ClientBrand } from "@/components/brand/client-brand";
import { ProductMark } from "@/components/brand/qalam-mark";
import { SidebarFrame } from "./sidebar-frame";
import { SidebarNav } from "./sidebar-nav";

export async function Sidebar({ locale }: { locale: AppLocale }) {
  const t = await getTranslations("Shell");
  return (
    <aside className="border-b border-border bg-sidebar p-4 text-sidebar-foreground md:border-e md:border-b-0">
      <SidebarFrame
        brand={
          <Suspense fallback={<ProductMark name={t("brand")} />}>
            <ClientBrand />
          </Suspense>
        } menu={t("menu")} close={t("closeMenu")}>
        <Suspense fallback={<p className="text-sm text-muted-foreground">{t("loading")}</p>}>
          <SidebarNav locale={locale} />
        </Suspense>
      </SidebarFrame>
    </aside>
  );
}
