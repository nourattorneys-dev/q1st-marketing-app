import { describe, expect, it } from "vitest";
import { monthOf, siteMetrics } from "@/lib/plan/usage";

const USAGE = {
  months: [
    {
      month: "2026-10",
      sites: [
        { siteId: "site_fakher", metrics: { articles: 24 } },
        { siteId: "site_other", metrics: { articles: 9 } },
      ],
    },
    { month: "2026-09", sites: [] },
  ],
  results: [{ siteId: "site_fakher", published: 41, keywordsCovered: 12 }],
};

describe("this site's usage (spec v1.1 §7 /account/usage)", () => {
  it("takes the plan period's month as the engine wrote it, never the browser's clock", () => {
    expect(monthOf("2026-10-01T00:00:00+04:00")).toBe("2026-10");
  });

  it("reads this site's numbers for a month, or null when there are none", () => {
    expect(siteMetrics(USAGE, "site_fakher", "2026-10")).toEqual({ articles: 24 });
    expect([siteMetrics(USAGE, "site_fakher", "2026-09"), siteMetrics(USAGE, "site_fakher", "2026-01")]).toEqual([null, null]);
  });
});
