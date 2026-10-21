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
});
