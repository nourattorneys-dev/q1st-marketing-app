import { describe, expect, it } from "vitest";
import { metricLabel, metricNames, spellOut } from "@/lib/plan/metric-label";

const own = (known: Record<string, string>) => ({ has: (key: string) => key in known, get: (key: string) => known[key] });
const quotas = [
  { metric: "keywordProposals", label: "Keyword research runs", labelAr: "عمليات بحث الكلمات", limit: null, used: 0 },
  { metric: "articles", label: null, labelAr: null, limit: 10, used: 2 },
];

describe("metric names (P2: no metric shows its raw key)", () => {
  it("the engine's name wins, in the page's language", () => {
    expect(metricLabel("keywordProposals", metricNames(quotas, "en"), own({}))).toBe("Keyword research runs");
    expect(metricLabel("keywordProposals", metricNames(quotas, "ar"), own({}))).toBe("عمليات بحث الكلمات");
  });
  it("without one, the app's own wording; without that, the key spelled out", () => {
    expect(metricLabel("articles", metricNames(quotas, "en"), own({ articles: "Articles" }))).toBe("Articles");
    expect(metricLabel("topicSuggestionRuns", {}, own({}))).toBe("Topic suggestion runs");
    expect(spellOut("site_scans")).toBe("Site scans");
  });
});
