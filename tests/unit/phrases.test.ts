import { describe, expect, it } from "vitest";
import { normalizePhrase, parsePhrases, skippedPhrases } from "@/lib/keywords/phrases";

describe("keyword phrases (spec v1.1 §6: comma or line separated)", () => {
  it("splits on commas and new lines, tidies spaces and drops repeats ignoring case", () => {
    expect(parsePhrases(" labour court dubai,\nLabour  Court Dubai , مكافأة نهاية الخدمة\n\n,")).toEqual(["labour court dubai", "مكافأة نهاية الخدمة"]);
  });

  it("compares phrases ignoring case and spacing", () => {
    expect(normalizePhrase("  Commission   UAE Labour Law ")).toBe("commission uae labour law");
  });

  it("lists the phrases the engine didn't add (Review Focus 3)", () => {
    expect(skippedPhrases(["laser hair removal", "Commission UAE labour law"], [{ phrase: "laser hair removal" }])).toEqual(["Commission UAE labour law"]);
  });
});

describe("Arabic separators (final review)", () => {
  it("splits on the Arabic comma too", () => {
    expect(parsePhrases("دعوى عمالية، تعويض الفصل\nnon-compete")).toEqual(["دعوى عمالية", "تعويض الفصل", "non-compete"]);
  });
});
