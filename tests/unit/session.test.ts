import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { cookieJar } = vi.hoisted(() => ({ cookieJar: new Map<string, string>() }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined),
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));

import { getSession, getTwoFactorPolicy, requirePermission, requireSession } from "@/lib/auth/session";
import { enableMockTwoFactor } from "@/lib/auth/mock-actions";

describe("session guards (test logins)", () => {
  beforeEach(() => {
    cookieJar.clear();
    vi.stubEnv("AUTH_MODE", "mock");
    vi.stubEnv("ENGINE_MODE", "mock");
    vi.stubEnv("VERCEL", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("sends signed-out visitors to sign-in", async () => {
    await expect(requireSession("en")).rejects.toThrow("REDIRECT:/en/sign-in");
  });

  it("sends people without a role to the no-access page", async () => {
    cookieJar.set("dev_session", "dev_norole");
    await expect(requireSession("ar")).rejects.toThrow("REDIRECT:/ar/no-access");
  });

  it("returns the signed-in reviewer", async () => {
    cookieJar.set("dev_session", "dev_reviewer");
    await expect(requireSession("en")).resolves.toMatchObject({ userId: "dev_reviewer", role: "reviewer" });
  });

  it("sends a reviewer away from admin-only screens", async () => {
    cookieJar.set("dev_session", "dev_reviewer");
    await expect(requirePermission("en", "settings.manage")).rejects.toThrow("REDIRECT:/en");
  });

  it("lets an admin into admin-only screens", async () => {
    cookieJar.set("dev_session", "dev_admin");
    await expect(requirePermission("en", "settings.manage")).resolves.toMatchObject({ role: "admin" });
  });

  it("refuses test logins on Vercel", async () => {
    vi.stubEnv("VERCEL", "1");
    await expect(getSession()).rejects.toThrow(/refused on Vercel/);
  });

  it("sends an admin without two-factor login to set it up first (design §5; Review Focus 2)", async () => {
    cookieJar.set("dev_session", "dev_admin_no2fa");
    await expect(requireSession("en")).rejects.toThrow("REDIRECT:/en/security");
    await expect(requirePermission("ar", "settings.manage")).rejects.toThrow("REDIRECT:/ar/security");
  });

  it("only reminds a reviewer: one without two-factor login may continue", async () => {
    cookieJar.set("dev_session", "dev_reviewer");
    await expect(requireSession("en")).resolves.toMatchObject({ role: "reviewer", twoFactor: false });
  });

  it("lets the admin in once two-factor login is on, in that test store only (design §5)", async () => {
    cookieJar.set("mock_store", `twofactor${Date.now().toString(36)}`);
    cookieJar.set("dev_session", "dev_admin_no2fa");
    const form = new FormData();
    form.set("locale", "ar");
    await expect(enableMockTwoFactor(form)).rejects.toThrow("REDIRECT:/ar");
    await expect(requireSession("ar")).resolves.toMatchObject({ userId: "dev_admin_no2fa", role: "admin", twoFactor: true });
    cookieJar.set("mock_store", `other${Date.now().toString(36)}`);
    await expect(requireSession("ar")).rejects.toThrow("REDIRECT:/ar/security");
  });

  it("lets an admin without two-factor login straight in when it's switched off (TWO_FACTOR=off)", async () => {
    vi.stubEnv("TWO_FACTOR", "off");
    cookieJar.set("dev_session", "dev_admin_no2fa");
    await expect(requireSession("en")).resolves.toMatchObject({ userId: "dev_admin_no2fa", role: "admin", twoFactor: false });
    await expect(requirePermission("ar", "settings.manage")).resolves.toMatchObject({ role: "admin" });
  });

  it("lets test logins try the switched-off mode through the twofactor_off scenario", async () => {
    cookieJar.set("dev_session", "dev_admin_no2fa");
    cookieJar.set("mock_scenario", "twofactor_off");
    await expect(requireSession("en")).resolves.toMatchObject({ role: "admin", twoFactor: false });
    await expect(getTwoFactorPolicy()).resolves.toBe("off");
    cookieJar.delete("mock_scenario");
    await expect(getTwoFactorPolicy()).resolves.toBe("required");
  });

  it("ignores the twofactor_off scenario with real sign-in", async () => {
    vi.stubEnv("AUTH_MODE", "clerk");
    cookieJar.set("mock_scenario", "twofactor_off");
    await expect(getTwoFactorPolicy()).resolves.toBe("required");
  });
});
