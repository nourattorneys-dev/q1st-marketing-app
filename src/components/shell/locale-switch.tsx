"use client";

import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { usePathname, useRouter } from "@/i18n/navigation";

export function LocaleSwitch() {
  const locale = useLocale();
  const t = useTranslations("Shell");
  const router = useRouter();
  const pathname = usePathname();
  const other = locale === "ar" ? "en" : "ar";

  return (
    <Button
      variant="ghost"
      size="sm"
      lang={other}
      data-testid="locale-switch"
      onClick={() => router.replace(pathname, { locale: other })}
    >
      {t("language")}
    </Button>
  );
}
