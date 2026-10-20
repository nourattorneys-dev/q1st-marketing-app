import { Suspense } from "react";
import type { AppLocale } from "@/i18n/locales";
import { LocaleSwitch } from "./locale-switch";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

export function Topbar({ locale }: { locale: AppLocale }) {
  return (
    <header className="flex items-center justify-end gap-2 border-b border-border bg-card px-6 py-3">
      <ThemeToggle />
      <LocaleSwitch />
      <Suspense fallback={null}>
        <UserMenu locale={locale} />
      </Suspense>
    </header>
  );
}
