import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sessionAccount, startSession } from "@/lib/accounts/sign-in";
import { getAccountStore } from "@/lib/db";

const { POST } = await import("@/app/api/auth/sign-out/route");

function signOutRequest(locale: string, headers: Record<string, string>) {
  const body = new FormData();
  body.set("locale", locale);
  return new NextRequest("http://localhost:3000/api/auth/sign-out", { method: "POST", body, headers });
}

describe("test-login sign-out (M1 follow-up: a full page load, so no hidden copy of the previous pages stays)", () => {
  beforeEach(() => {
    vi.stubEnv("AUTH_MODE", "mock");
    vi.stubEnv("ENGINE_MODE", "mock");
    vi.stubEnv("VERCEL", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("clears the test login and sends the browser to sign-in with a 303", async () => {
    const response = await POST(signOutRequest("ar", { cookie: "dev_session=dev_admin" }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost:3000/ar/sign-in");
    expect(response.headers.get("set-cookie")).toMatch(/^dev_session=;/);
  });

  it("uses the default language for one it doesn't know", async () => {
    expect((await POST(signOutRequest("xx", { cookie: "dev_session=dev_admin" }))).headers.get("location")).toBe("http://localhost:3000/en/sign-in");
  });
});

describe("password sign-out (spec M5c)", () => {
  beforeEach(() => {
    vi.stubEnv("AUTH_MODE", "password");
    vi.stubEnv("APP_URL", "https://dashboard.example.com");
    vi.stubEnv("DB_MODE", "memory");
    vi.stubEnv("ENGINE_MODE", "mock");
  });
  afterEach(() => vi.unstubAllEnvs());

  async function sessionToken(): Promise<string> {
    const store = getAccountStore();
    const now = new Date();
    await store.createAccount({ id: "usr_out", email: "out@example.com", name: "Out", role: "reviewer", passwordHash: "x", createdAt: now, passwordChangedAt: now, lastSignInAt: null });
    return (await startSession(store, "usr_out", now)).token;
  }

  it("ends the session and clears the __Host-session cookie with Secure and Path=/ (Review Focus 5)", async () => {
    const token = await sessionToken();
    const response = await POST(signOutRequest("ar", { origin: "https://dashboard.example.com", cookie: `__Host-session=${token}` }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://dashboard.example.com/ar/sign-in");
    const cleared = response.headers.get("set-cookie") ?? "";
    expect(cleared).toMatch(/^__Host-session=;/);
    expect(cleared).toMatch(/Path=\//);
    expect(cleared).toMatch(/Secure/);
    expect(cleared).toMatch(/HttpOnly/);
    expect(cleared).toMatch(/Max-Age=0/i);
    expect(await sessionAccount(getAccountStore(), token, new Date())).toBeNull();
  });

  it("refuses a sign-out posted from another site, and the session stays", async () => {
    const token = await sessionToken();
    const response = await POST(signOutRequest("en", { origin: "https://elsewhere.example", cookie: `__Host-session=${token}` }));
    expect(response.status).toBe(403);
    expect(await sessionAccount(getAccountStore(), token, new Date())).not.toBeNull();
  });
});
