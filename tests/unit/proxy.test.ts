import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, handle } from "@/proxy";

// Next compiles each matcher as a path pattern; these ones are plain regular expressions.
const proxied = (path: string) => config.matcher.some((pattern) => new RegExp(`^${pattern}$`).test(path));

describe("the proxy (final review: Clerk must run on our API routes)", () => {
  it("runs for pages and for /api routes, so Clerk's auth() works in /api/jobs, but not for build assets", () => {
    expect([proxied("/en/review"), proxied("/api/jobs/j_1"), proxied("/api/health"), proxied("/_next/static/app.js")]).toEqual([true, true, true, false]);
  });

  it("passes /api requests straight through, without a locale redirect", () => {
    const response = handle(new NextRequest("http://localhost/api/jobs/j_1"));
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("still sends a page without a locale to its locale", () => {
    expect(handle(new NextRequest("http://localhost/review")).headers.get("location")).toMatch(/\/en\/review$/);
  });
});
