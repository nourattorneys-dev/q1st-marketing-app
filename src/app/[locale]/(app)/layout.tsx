import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ClientBrandStyle } from "@/components/brand/client-brand";
import { Splash } from "@/components/brand/splash";
import { Footer } from "@/components/shell/footer";
import { ServiceBanner } from "@/components/shell/service-banner";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { asAppLocale } from "@/i18n/locales";
import { tabClientName } from "@/lib/tenancy/title";

/** The browser tab names the client ("Fakher & Co · Qalam"), so several open dashboards are told apart. */
export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Meta" });
  const client = await tabClientName();
  return { title: client ? t("clientTitle", { client }) : t("title") };
}

export default async function AppLayout({ children, params }: LayoutProps<"/[locale]">) {
  const locale = asAppLocale((await params).locale);
  setRequestLocale(locale);
  return (
    <div className="grid min-h-dvh grid-cols-1 md:grid-cols-[16.5rem_minmax(0,1fr)]">
      <Suspense fallback={null}>
        <ClientBrandStyle />
      </Suspense>
      <Splash />
      <Sidebar locale={locale} />
      <div className="flex min-w-0 flex-col">
        <Topbar locale={locale} />
        <Suspense fallback={null}>
          <ServiceBanner />
        </Suspense>
        <main className="flex-1 px-4 py-6 md:px-10 md:py-8">{children}</main>
        <Footer />
      </div>
    </div>
  );
}
