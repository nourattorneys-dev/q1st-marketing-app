import { describe, expect, it } from "vitest";
import { asAppLocale, directionOf, isAppLocale } from "@/i18n/locales";
import { formatDate, formatDateTime, formatMonth } from "@/lib/format/datetime";
import { formatNumber } from "@/lib/format/number";

// ICU puts a narrow no-break space before AM/PM; compare with plain spaces.
const norm = (s: string) => s.replace(/\s+/gu, " ");

describe("locales", () => {
  it("recognises the two interface languages", () => {
    expect(isAppLocale("en")).toBe(true);
    expect(isAppLocale("ar")).toBe(true);
    expect(isAppLocale("de")).toBe(false);
    expect(asAppLocale("de")).toBe("en");
    expect(directionOf("ar")).toBe("rtl");
    expect(directionOf("en")).toBe("ltr");
  });
});

describe("formatDateTime", () => {
  it("renders 12-hour time in the site's timezone (06:00 UTC = 10:00 AM Dubai)", () => {
    const out = norm(formatDateTime("2026-10-21T06:00:00Z", { timeZone: "Asia/Dubai", locale: "en" }));
    expect(out).toContain("Oct 21");
    expect(out).toContain("10:00 AM");
  });

  it("uses the Dubai calendar date when UTC is still the previous day", () => {
    const out = norm(formatDateTime("2026-10-21T21:30:00Z", { timeZone: "Asia/Dubai", locale: "en" }));
    expect(out).toContain("Oct 22");
    expect(out).toContain("1:30 AM");
  });

  it("respects the offset in the input", () => {
    const out = norm(formatDateTime("2026-10-22T10:00:00+04:00", { timeZone: "Asia/Dubai", locale: "en" }));
    expect(out).toContain("Oct 22");
    expect(out).toContain("10:00 AM");
  });

  it("formats Arabic with Latin digits and the Arabic morning marker", () => {
    const out = norm(formatDateTime("2026-10-21T06:00:00Z", { timeZone: "Asia/Dubai", locale: "ar" }));
    expect(out).toContain("10:00");
    expect(out).toContain("ص");
    expect(out).not.toMatch(/[٠-٩]/u);
  });

  it("returns the input unchanged when it is not a date", () => {
    expect(formatDateTime("not-a-date", { timeZone: "Asia/Dubai", locale: "en" })).toBe("not-a-date");
  });

  it("falls back to UTC, and says so, when the timezone is unknown", () => {
    const out = norm(formatDateTime("2026-10-21T06:00:00Z", { timeZone: "Mars/Olympus", locale: "en" }));
    expect(out).toContain("6:00 AM");
    expect(out.endsWith(" UTC")).toBe(true);
  });
});

describe("formatNumber", () => {
  it("groups thousands", () => {
    expect(formatNumber(812000, "en")).toBe("812,000");
  });

  it("uses Latin digits in Arabic", () => {
    const out = formatNumber(812000, "ar");
    expect(out).toMatch(/^812\D000$/u);
    expect(out).not.toMatch(/[٠-٩]/u);
  });
});

describe("formatDate and formatMonth (spec v1.1 §6 Plan & usage)", () => {
  it("shows a plan period's dates in the site's timezone, without the time", () => {
    expect(formatDate("2026-10-31T23:59:59+04:00", { timeZone: "Asia/Dubai", locale: "en" })).toBe("Oct 31, 2026");
    expect(formatDate("not a date", { timeZone: "Asia/Dubai", locale: "en" })).toBe("not a date");
  });

  it("names a YYYY-MM month in the interface language with Latin digits (Review Focus 5)", () => {
    expect([formatMonth("2026-10", "en"), formatMonth("2026-10", "en", { year: false })]).toEqual(["Oct 2026", "Oct"]);
    const arabic = formatMonth("2026-10", "ar");
    expect(arabic).toContain("2026");
    expect(arabic).not.toMatch(/[٠-٩]/);
    expect(arabic).not.toBe("Oct 2026");
    expect(formatMonth("2026-13", "en")).toBe("2026-13");
  });
});
