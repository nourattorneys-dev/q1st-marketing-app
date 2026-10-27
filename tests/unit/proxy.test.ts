import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import proxy, { config } from "@/proxy";

// Next compiles each matcher as a path pattern; this one is a plain regular expression.
const proxied = (path: string) => config.matcher.some((pattern) => new RegExp(`^${pattern}$`).test(path));

describe("the proxy (spec M5c: languages only)", () => {
  it("runs for pages, not for API routes or build assets", () => {
    expect([proxied("/en/review"), proxied("/api/jobs/j_1"), proxied("/api/health"), proxied("/_next/static/app.js")]).toEqual([true, false, false, false]);
  });

  it("sends a page without a locale to its locale", () => {
    expect(proxy(new NextRequest("http://localhost/review")).headers.get("location")).toMatch(/\/en\/review$/);
  });
});
