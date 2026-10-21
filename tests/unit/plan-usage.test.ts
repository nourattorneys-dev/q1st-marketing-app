import { describe, expect, it } from "vitest";
import { lastMonths, metricSeries, periodMonth, siteMetrics, siteResults } from "@/lib/plan/usage";

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
  it("reads this site's numbers for a month, or null when there are none", () => {
    expect(siteMetrics(USAGE, "site_fakher", "2026-10")).toEqual({ articles: 24 });
    expect([siteMetrics(USAGE, "site_fakher", "2026-09"), siteMetrics(USAGE, "site_fakher", "2026-01")]).toEqual([null, null]);
  });
});

describe("the usage chart's numbers (Review Focus 3)", () => {
  it("takes the months ending with the plan's month, oldest first, across a year boundary", () => {
    expect(lastMonths("2026-02", 4)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(lastMonths("someday", 3)).toEqual([]);
  });

  it("reads one metric per month for this site, with 0 for a month that has no numbers", () => {
    expect(metricSeries(USAGE, "site_fakher", ["2026-09", "2026-10"], "articles")).toEqual([
      { month: "2026-09", value: 0 },
      { month: "2026-10", value: 24 },
    ]);
    expect(metricSeries(USAGE, "site_fakher", ["2026-10"], "videoMinutes")).toEqual([{ month: "2026-10", value: 0 }]);
  });

  it("reads this site's results, or zeros", () => {
    expect([siteResults(USAGE, "site_fakher"), siteResults(USAGE, "site_other")]).toEqual([
      { published: 41, keywordsCovered: 12 },
      { published: 0, keywordsCovered: 0 },
    ]);
  });
});

describe("the plan period's month (final review)", () => {
  it("is the month the period covers, however the engine writes its offset (+04:00 or Z)", () => {
    expect([
      periodMonth({ start: "2026-10-01T00:00:00+04:00", end: "2026-10-31T23:59:59+04:00" }),
      periodMonth({ start: "2026-09-30T20:00:00Z", end: "2026-10-31T19:59:59Z" }),
      periodMonth({ start: "2026-09-30T20:00:00+00:00", end: "2026-10-31T19:59:59+00:00" }),
    ]).toEqual(["2026-10", "2026-10", "2026-10"]);
  });

  it("falls back to the start as written when the dates can't be read", () => {
    expect(periodMonth({ start: "2026-10-01", end: "not a date" })).toBe("2026-10");
  });
});
