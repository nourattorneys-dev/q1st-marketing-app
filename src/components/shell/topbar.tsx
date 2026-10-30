import { Suspense } from "react";
import type { AppLocale } from "@/i18n/locales";
import { LocaleSwitch } from "./locale-switch";
import { SiteSwitcher } from "./site-switcher";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

export function Topbar({ locale }: { locale: AppLocale }) {
  return (
    <header className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2 border-b border-border bg-card px-4 py-3 md:px-6">
      <Suspense fallback={null}>
        <SiteSwitcher locale={locale} />
      </Suspense>
      <ThemeToggle />
      <LocaleSwitch />
      <Suspense fallback={null}>
        <UserMenu locale={locale} />
      </Suspense>
    </header>
  );
}
