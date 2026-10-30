import { Suspense } from "react";
import type { AppLocale } from "@/i18n/locales";
import { LocaleSwitch } from "./locale-switch";
import { SiteSwitcher } from "./site-switcher";
import { ThemeToggle } from "./theme-toggle";

/** P2b: where you are (client / website) on the start side; language and theme on the end side. */
export function Topbar({ locale }: { locale: AppLocale }) {
  return (
    <header className="flex min-h-16 flex-wrap items-center justify-end gap-x-2 gap-y-2 border-b border-border bg-card/70 px-4 py-3 backdrop-blur md:px-10">
      <Suspense fallback={<span className="me-auto" />}>
        <SiteSwitcher locale={locale} />
      </Suspense>
      <LocaleSwitch />
      <ThemeToggle />
    </header>
  );
}
