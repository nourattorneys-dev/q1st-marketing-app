import { INTL_LOCALE, type AppLocale } from "@/i18n/locales";

function formatter(locale: AppLocale, timeZone: string) {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
    numberingSystem: "latn",
  });
}

/** Formats an ISO 8601 timestamp as 12-hour time in the site's timezone (spec §2 "Use the times we send"). */
export function formatDateTime(iso: string, opts: { timeZone: string; locale: AppLocale }): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    return formatter(opts.locale, opts.timeZone).format(date);
  } catch (error) {
    if (error instanceof RangeError) return `${formatter(opts.locale, "UTC").format(date)} UTC`;
    throw error;
  }
}
