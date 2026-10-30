"use client";

import { Suspense } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { getPathname, usePathname } from "@/i18n/navigation";

// On routes with a segment unknown at build time (e.g. /review/[postId]) the pathname is request data,
// so the path-aware button streams in; until then an inert button of the same size holds its place.
export function LocaleSwitch() {
  return (
    <Suspense fallback={<SwitchButton />}>
      <PathAwareSwitch />
    </Suspense>
  );
}

function PathAwareSwitch() {
  const locale = useLocale();
  const pathname = usePathname();
  const other = locale === "ar" ? "en" : "ar";

  // A full page load, not a client navigation: switching language replaces the root <html> element,
  // and only a fresh load re-runs the pre-paint theme script (and remounts the auth provider cleanly).
  function switchLanguage() {
    window.location.assign(getPathname({ href: pathname, locale: other }));
  }

  return <SwitchButton onClick={switchLanguage} />;
}

function SwitchButton({ onClick }: { onClick?: () => void }) {
  const locale = useLocale();
  const t = useTranslations("Shell");
  const other = locale === "ar" ? "en" : "ar";
  return (
    <Button
      variant="outline"
      size="icon"
      lang={other}
      data-testid="locale-switch"
      aria-label={t("language")}
      title={t("language")}
      onClick={onClick}
      disabled={!onClick}
      className="size-10 rounded-xl text-[15px] font-semibold"
    >
      {other === "ar" ? "ع" : "EN"}
    </Button>
  );
}
