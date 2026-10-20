import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { IBM_Plex_Sans, IBM_Plex_Sans_Arabic, Newsreader, Noto_Naskh_Arabic } from "next/font/google";
import { notFound } from "next/navigation";
import { DirectionProvider } from "@/components/ui/direction";
import { directionOf } from "@/i18n/locales";
import { routing } from "@/i18n/routing";
import { serverEnv } from "@/lib/env";
import "../globals.css";

const plexSans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-sans", display: "swap" });
const plexArabic = IBM_Plex_Sans_Arabic({ subsets: ["arabic"], weight: ["400", "500", "600"], variable: "--font-plex-arabic", display: "swap" });
const newsreader = Newsreader({ subsets: ["latin"], variable: "--font-newsreader", display: "swap" });
const naskh = Noto_Naskh_Arabic({ subsets: ["arabic"], variable: "--font-naskh", display: "swap" });
const FONT_VARIABLES = [plexSans.variable, plexArabic.variable, newsreader.variable, naskh.variable].join(" ");

/** Runs before first paint: applies the saved theme so dark mode never flashes light. */
const THEME_SCRIPT = `(function(){var d=document.documentElement;try{d.setAttribute("data-theme",localStorage.getItem("theme")==="dark"?"dark":"light")}catch(e){d.setAttribute("data-theme","light")}})();`;

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
        {serverEnv().authMode === "clerk" ? (
          <ClerkProvider signInUrl={`/${locale}/sign-in`} afterSignOutUrl={`/${locale}/sign-in`}>
            {content}
          </ClerkProvider>
        ) : (
          content
        )}
      </body>
    </html>
  );
}
