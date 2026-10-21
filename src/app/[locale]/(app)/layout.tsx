import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";
import { ServiceBanner } from "@/components/shell/service-banner";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { asAppLocale } from "@/i18n/locales";

export default async function AppLayout({ children, params }: LayoutProps<"/[locale]">) {
  const locale = asAppLocale((await params).locale);
  setRequestLocale(locale);
  return (
    <div className="grid min-h-dvh grid-cols-1 md:grid-cols-[15rem_minmax(0,1fr)]">
      <Sidebar locale={locale} />
      <div className="flex min-w-0 flex-col">
        <Topbar locale={locale} />
        <Suspense fallback={null}>
          <ServiceBanner />
        </Suspense>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
