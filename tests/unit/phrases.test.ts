import { describe, expect, it } from "vitest";
import { KEYWORD_LIMITS, normalizePhrase, parsePhrases, phraseProblem, skippedPhrases } from "@/lib/keywords/phrases";

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

describe("phraseProblem (M3a follow-up)", () => {
  it("says when there are more phrases than one request takes, or one is too long", () => {
    expect(phraseProblem(Array.from({ length: KEYWORD_LIMITS.maxPhrases }, (_, i) => `k${i}`))).toBeNull();
    expect(phraseProblem(Array.from({ length: KEYWORD_LIMITS.maxPhrases + 1 }, (_, i) => `k${i}`))).toBe("tooMany");
    expect(phraseProblem(["ok", "x".repeat(KEYWORD_LIMITS.maxLength + 1)])).toBe("tooLong");
  });
});
