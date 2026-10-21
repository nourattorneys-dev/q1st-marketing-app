import { describe, expect, it } from "vitest";
import { findingActions, findingTab, tabStatuses } from "@/lib/site-health/findings";

describe("finding tabs (spec v1.1 §4 SiteFinding.status)", () => {
  it("To do holds open and prepared findings; Applied and Dismissed hold their own", () => {
    expect([tabStatuses("todo"), tabStatuses("applied"), tabStatuses("dismissed")]).toEqual([["open", "prepared"], ["applied"], ["dismissed"]]);
  });

  it("an unknown or missing tab falls back to To do, even one named like an object property", () => {
    expect([findingTab(undefined), findingTab("constructor"), findingTab(["applied"]), findingTab("x")]).toEqual(["todo", "todo", "applied", "todo"]);
  });
});

describe("findingActions (design §5; Review Focus 1)", () => {
  it("a reviewer can choose open findings and dismiss, but never apply", () => {
    expect(findingActions({ status: "prepared" }, false)).toEqual({ select: false, apply: false, dismiss: true });
    expect(findingActions({ status: "open" }, false)).toEqual({ select: true, apply: false, dismiss: true });
  });

  it("an admin applies only a prepared fix; an applied or dismissed finding offers nothing", () => {
    expect(findingActions({ status: "open" }, true).apply).toBe(false);
    expect(findingActions({ status: "prepared" }, true).apply).toBe(true);
    expect(findingActions({ status: "applied" }, true)).toEqual({ select: false, apply: false, dismiss: false });
    expect(findingActions({ status: "dismissed" }, true)).toEqual({ select: false, apply: false, dismiss: false });
  });
});
