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

/** A date without the time (a plan period's start or end), in the site's timezone. */
export function formatDate(iso: string, opts: { timeZone: string; locale: AppLocale }): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const format = (timeZone: string) =>
    new Intl.DateTimeFormat(INTL_LOCALE[opts.locale], { day: "numeric", month: "short", year: "numeric", timeZone, numberingSystem: "latn" }).format(date);
  try {
    return format(opts.timeZone);
  } catch (error) {
    if (error instanceof RangeError) return `${format("UTC")} UTC`;
    throw error;
  }
}

/** A YYYY-MM month as a short name ("Oct 2026"; "Oct" without the year), with Latin digits; unchanged if it can't be read. */
export function formatMonth(month: string, locale: AppLocale, options: { year?: boolean } = {}): string {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!match) return month;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    month: "short",
    ...(options.year === false ? {} : { year: "numeric" }),
    timeZone: "UTC",
    numberingSystem: "latn",
  }).format(date);
}
