"use client";

import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { getPathname, usePathname } from "@/i18n/navigation";

export function LocaleSwitch() {
  const locale = useLocale();
  const t = useTranslations("Shell");
  const pathname = usePathname();
  const other = locale === "ar" ? "en" : "ar";

  // A full page load, not a client navigation: switching language replaces the root <html> element,
  // and only a fresh load re-runs the pre-paint theme script (and remounts the auth provider cleanly).
  function switchLanguage() {
    window.location.assign(getPathname({ href: pathname, locale: other }));
  }

  return (
    <Button variant="ghost" size="sm" lang={other} data-testid="locale-switch" onClick={switchLanguage}>
      {t("language")}
    </Button>
  );
}
