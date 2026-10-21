import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { POST } = await import("@/app/api/auth/sign-out/route");

function signOutRequest(locale: string) {
  const body = new FormData();
  body.set("locale", locale);
  return new NextRequest("http://localhost:3000/api/auth/sign-out", { method: "POST", body, headers: { cookie: "dev_session=dev_admin" } });
}

describe("test-login sign-out (M1 follow-up: a full page load, so no hidden copy of the previous pages stays)", () => {
  beforeEach(() => {
    vi.stubEnv("AUTH_MODE", "mock");
    vi.stubEnv("ENGINE_MODE", "mock");
    vi.stubEnv("VERCEL", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("clears the test login and sends the browser to sign-in with a 303", async () => {
    const response = await POST(signOutRequest("ar"));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost:3000/ar/sign-in");
    expect(response.headers.get("set-cookie")).toMatch(/^dev_session=;/);
  });

  it("uses the default language for one it doesn't know", async () => {
    expect((await POST(signOutRequest("xx"))).headers.get("location")).toBe("http://localhost:3000/en/sign-in");
  });

  it("does nothing with Clerk sign-in", async () => {
    vi.stubEnv("AUTH_MODE", "clerk");
    const response = await POST(signOutRequest("en"));
    expect(response.status).toBe(404);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
