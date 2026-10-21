import { describe, expect, it } from "vitest";
import { pageCount, requestedPage } from "@/lib/lists/paging";

describe("list paging (spec v1.1 §3 Lists)", () => {
  it("reads ?page=, treating a missing or bad value as page 1", () => {
    expect([requestedPage(undefined), requestedPage("3"), requestedPage("0"), requestedPage("abc"), requestedPage(["2", "5"])]).toEqual([1, 3, 1, 1, 2]);
  });

  it("counts pages from the engine's list meta", () => {
    expect([pageCount(null), pageCount({ pageSize: 25, total: 0 }), pageCount({ pageSize: 25, total: 25 }), pageCount({ pageSize: 25, total: 26 })]).toEqual([1, 1, 1, 2]);
  });
});
