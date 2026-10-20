import { INTL_LOCALE, type AppLocale } from "@/i18n/locales";

export function formatNumber(value: number, locale: AppLocale): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], { numberingSystem: "latn", maximumFractionDigits: 0 }).format(value);
}
