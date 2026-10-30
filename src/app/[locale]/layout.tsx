import type { Metadata } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import localFont from "next/font/local";
import { notFound } from "next/navigation";
import { DirectionProvider } from "@/components/ui/direction";
import { directionOf } from "@/i18n/locales";
import { routing } from "@/i18n/routing";
import "../globals.css";

// Quantum1st brand type, served by this app (never downloaded from Google at build or in the browser): Geist for Latin
// text and headings, Geist Mono for labels and numbers, IBM Plex Sans Arabic for Arabic.
const plexArabic = localFont({
  src: [
    { path: "../fonts/ibm-plex-sans-arabic-arabic-400-normal.woff2", weight: "400" },
    { path: "../fonts/ibm-plex-sans-arabic-arabic-500-normal.woff2", weight: "500" },
    { path: "../fonts/ibm-plex-sans-arabic-arabic-600-normal.woff2", weight: "600" },
  ],
  variable: "--font-plex-arabic",
  display: "swap",
});
const FONT_VARIABLES = [GeistSans.variable, GeistMono.variable, plexArabic.variable].join(" ");

/**
 * Runs before first paint: applies the saved theme so dark mode never flashes light, and times the Qalam splash (once per
 * visit, fade, then gone) through a style element of its own, which the page's later renders never touch.
 */
const THEME_SCRIPT = `(function(){var d=document.documentElement;try{d.setAttribute("data-theme",localStorage.getItem("theme")==="dark"?"dark":"light")}catch(e){d.setAttribute("data-theme","light")}var q=document.createElement("style");document.head.appendChild(q);var hide=".qalam-splash{display:none!important}";try{if(sessionStorage.getItem("qalam-splash")){q.textContent=hide}else{sessionStorage.setItem("qalam-splash","1");setTimeout(function(){q.textContent=".qalam-splash{opacity:0}"},4000);setTimeout(function(){q.textContent=hide},4550)}}catch(e){q.textContent=hide}})();`;

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Meta" });
  return { title: t("title") };
}

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const dir = directionOf(locale);

  const content = (
    <NextIntlClientProvider>
      <DirectionProvider dir={dir}>{children}</DirectionProvider>
    </NextIntlClientProvider>
  );

  return (
    <html lang={locale} dir={dir} data-theme="light" className={FONT_VARIABLES} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh antialiased">
        {content}
      </body>
    </html>
  );
}
