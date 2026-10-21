import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import ar from "../../messages/ar.json";
import en from "../../messages/en.json";

const keysOf = (value: unknown, prefix = ""): string[] =>
  typeof value === "object" && value !== null
    ? Object.entries(value).flatMap(([key, child]) => keysOf(child, prefix ? `${prefix}.${key}` : key))
    : [prefix];

describe("messages", () => {
  it("every message exists in both languages", () => {
    expect(keysOf(ar).sort()).toEqual(keysOf(en).sort());
  });

  it("finding counts read naturally in English", () => {
    const t = createTranslator({ locale: "en", messages: en, namespace: "Review" });
    expect([t("warn", { count: 1, n: "1" }), t("warn", { count: 3, n: "3" }), t("critical", { count: 2, n: "2" })]).toEqual([
      "1 warning",
      "3 warnings",
      "2 critical",
    ]);
  });

  it("finding counts use Arabic plural forms with Latin digits", () => {
    const t = createTranslator({ locale: "ar", messages: ar, namespace: "Review" });
    expect([1, 2, 3, 11].map((count) => t("warn", { count, n: String(count) }))).toEqual(["تحذير واحد", "تحذيران", "3 تحذيرات", "11 تحذيراً"]);
  });

  it("counts with plural forms in both languages, with Latin digits (M2a follow-up; Review Focus 3)", () => {
    const tEn = createTranslator({ locale: "en", messages: en, namespace: "Review" });
    const tAr = createTranslator({ locale: "ar", messages: ar, namespace: "Review" });
    expect([tEn("count", { shown: "1", total: 1, n: "1" }), tEn("count", { shown: "9", total: 9, n: "9" })]).toEqual(["1 of 1 post", "9 of 9 posts"]);
    const arabic = [1, 2, 3, 11, 100].map((total) => tAr("count", { shown: "1", total, n: String(total) }));
    expect(new Set(arabic).size).toBe(5);
    expect(arabic.join(" ")).not.toMatch(/[٠-٩]/);
    const editor = createTranslator({ locale: "ar", messages: ar, namespace: "Editor" });
    expect(editor("structureMatches", { count: 2, n: "2" })).toBe("البنية متطابقة (قسمان).");
    expect(editor("structureMismatchMany", { count: 2, n: "2" })).toMatch(/^قسمان غير متطابقين/);
  });

  it("says plainly when no keyword was new (M3a follow-up)", () => {
    const tEn = createTranslator({ locale: "en", messages: en, namespace: "Keywords.add" });
    const tAr = createTranslator({ locale: "ar", messages: ar, namespace: "Keywords.add" });
    expect(tEn("added", { count: 0, n: "0" })).toBe("No new keywords: they're all in the list already.");
    expect(tAr("added", { count: 0, n: "0" })).not.toMatch(/0/);
  });
});
