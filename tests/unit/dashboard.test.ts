import { describe, expect, it } from "vitest";
import { connectionWarnings, settingsPageFor } from "@/lib/dashboard/connections";
import { nextSlotView } from "@/lib/dashboard/next-slot";
import { quotaMetric, quotaView } from "@/lib/dashboard/quota";

describe("quotaView", () => {
  it("is ok below the warning line", () => {
    expect(quotaView({ metric: "articles", limit: 40, used: 31, warnAt: 0.8 })).toEqual({
      metric: "articles",
      used: 31,
      limit: 40,
      percent: 78,
      state: "ok",
    });
  });

  it("warns at or above warnAt", () => {
    expect(quotaView({ metric: "socialPosts", limit: 120, used: 110, warnAt: 0.8 })).toMatchObject({ percent: 92, state: "warning" });
  });

  it("is over at or above the limit, and the bar never passes 100%", () => {
    expect(quotaView({ metric: "articles", limit: 40, used: 40, warnAt: 0.8 })).toMatchObject({ percent: 100, state: "over" });
    expect(quotaView({ metric: "socialPosts", limit: 120, used: 150, warnAt: 0.8 })).toMatchObject({ percent: 100, state: "over" });
  });

  it("treats a null limit as unlimited", () => {
    expect(quotaView({ metric: "photos", limit: null, used: 60 })).toEqual({
      metric: "photos",
      used: 60,
      limit: null,
      percent: 0,
      state: "unlimited",
    });
  });

  it("handles a zero limit without NaN or Infinity", () => {
    expect(quotaView({ metric: "sites", limit: 0, used: 0, warnAt: 0.8 })).toMatchObject({ percent: 100, state: "over" });
    expect(quotaView({ metric: "sites", limit: 0, used: 2, warnAt: 0.8 })).toMatchObject({ percent: 100, state: "over" });
  });

  it("never warns when warnAt is missing", () => {
    expect(quotaView({ metric: "aiTokens", limit: 100, used: 99 })).toMatchObject({ percent: 99, state: "ok" });
  });
});

describe("connectionWarnings", () => {
  it("lists every connection that isn't ok, in a fixed order, including unknown statuses", () => {
    expect(
      connectionWarnings({
        website: { type: "wordpress", status: "missing" },
        linkedin: "degraded",
        instagram: "ok",
        searchConsole: "expiring",
      }),
    ).toEqual([
      { key: "website", status: "missing" },
      { key: "linkedin", status: "degraded" },
      { key: "searchConsole", status: "expiring" },
    ]);
  });

  it("ignores a connection the engine doesn't report", () => {
    expect(
      connectionWarnings({ website: { type: "wordpress", status: "ok" }, linkedin: "ok", instagram: "ok", searchConsole: null }),
    ).toEqual([]);
  });
});

describe("nextSlotView", () => {
  it("shows the next slot when auto-publish is on", () => {
    expect(nextSlotView({ autoPublish: true, nextSlotAt: "2026-10-22T10:00:00+04:00", waitingReason: null })).toEqual({
      kind: "slot",
      at: "2026-10-22T10:00:00+04:00",
    });
  });

  it("says auto-publish is off", () => {
    expect(nextSlotView({ autoPublish: false, nextSlotAt: "2026-10-22T10:00:00+04:00" })).toEqual({ kind: "off" });
  });

  it("passes the engine's waiting reason through, even an unknown one", () => {
    expect(nextSlotView({ autoPublish: true, nextSlotAt: null, waitingReason: "holiday" })).toEqual({ kind: "waiting", reason: "holiday" });
    expect(nextSlotView({ autoPublish: true })).toEqual({ kind: "waiting", reason: "queue_empty" });
  });
});

describe("settingsPageFor (design §9 not_connected, M1 follow-up)", () => {
  it("sends the website connection to its own page and every account to Social accounts", () => {
    expect(["website", "linkedin", "instagram", "searchConsole", "tiktok"].map(settingsPageFor)).toEqual([
      "/settings/website",
      "/settings/social",
      "/settings/social",
      "/settings/social",
      "/settings/social",
    ]);
  });
});

describe("quota edge cases (M1 and M3a follow-ups)", () => {
  it("a limit of 0 is already reached, used or not (Review Focus 3)", () => {
    expect(quotaView({ metric: "siteScans", limit: 0, used: 0, mode: "hard" })).toMatchObject({ percent: 100, state: "over" });
  });

  it("reads the 429's metric, or null when the engine didn't say which limit", () => {
    expect([quotaMetric({ metric: "aiTokens", used: 1, limit: 1 }), quotaMetric({ metric: " " }), quotaMetric({}), quotaMetric(undefined)]).toEqual([
      "aiTokens",
      null,
      null,
      null,
    ]);
  });
});
