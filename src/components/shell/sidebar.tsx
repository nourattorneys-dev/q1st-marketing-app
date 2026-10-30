import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { ClientBrand } from "@/components/brand/client-brand";
import { ProductMark } from "@/components/brand/qalam-mark";
import type { AppLocale } from "@/i18n/locales";
import { SidebarFrame } from "./sidebar-frame";
import { SidebarNav } from "./sidebar-nav";
import { UserMenu } from "./user-menu";

/** P2b: the client's logo, the page list in groups, and the signed-in person at the foot. */
export async function Sidebar({ locale }: { locale: AppLocale }) {
  const t = await getTranslations("Shell");
  return (
    <aside className="border-b border-border bg-sidebar px-4 py-5 text-sidebar-foreground md:sticky md:top-0 md:flex md:h-dvh md:flex-col md:border-e md:border-b-0">
      <SidebarFrame
        brand={
          <Suspense fallback={<ProductMark name={t("brand")} />}>
            <ClientBrand />
          </Suspense>
        }
        menu={t("menu")}
        close={t("closeMenu")}
      >
        <div className="flex flex-col gap-6 md:h-full">
          <Suspense fallback={<p className="text-sm text-muted-foreground">{t("loading")}</p>}>
            <SidebarNav locale={locale} />
          </Suspense>
          <div className="md:mt-auto">
            <Suspense fallback={null}>
              <UserMenu locale={locale} />
            </Suspense>
          </div>
        </div>
      </SidebarFrame>
    </aside>
  );
}
