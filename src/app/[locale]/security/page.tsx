import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";
import { SecurityView } from "@/components/security/security-view";
import { LocaleSwitch } from "@/components/shell/locale-switch";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { asAppLocale } from "@/i18n/locales";

/** Outside the (app) shell, like /no-access: the shell sends an Admin without two-factor login here. */
export default async function SecurityPage({ params }: PageProps<"/[locale]/security">) {
  const locale = asAppLocale((await params).locale);
  setRequestLocale(locale);

  return (
    <main className="relative flex min-h-dvh items-center justify-center p-6">
      <div className="absolute end-4 top-4 flex gap-2">
        <ThemeToggle />
        <LocaleSwitch />
      </div>
      <Suspense fallback={null}>
        <SecurityView locale={locale} />
      </Suspense>
    </main>
  );
}
