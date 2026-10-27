import { describe, expect, it } from "vitest";
import { decodeMockSession, MOCK_USERS } from "@/lib/auth/mock-session";
import { can, isRole } from "@/lib/auth/roles";

describe("roles", () => {
  it("knows exactly two roles", () => {
    expect(isRole("admin")).toBe(true);
    expect(isRole("reviewer")).toBe(true);
    expect(isRole("owner")).toBe(false);
    expect(isRole(undefined)).toBe(false);
  });

  it("gives admins every permission", () => {
    for (const p of ["content.work", "siteHealth.view", "siteHealth.apply", "settings.manage", "users.manage", "plan.manage"] as const) {
      expect(can("admin", p)).toBe(true);
    }
  });

  it("limits reviewers to content work and viewing site health (design §5)", () => {
    expect(can("reviewer", "content.work")).toBe(true);
    expect(can("reviewer", "siteHealth.view")).toBe(true);
    expect(can("reviewer", "siteHealth.apply")).toBe(false);
    expect(can("reviewer", "settings.manage")).toBe(false);
    expect(can("reviewer", "users.manage")).toBe(false);
    expect(can("reviewer", "plan.manage")).toBe(false);
  });
});

describe("mock sessions", () => {
  it("decodes the fixed test users, with their two-factor status", () => {
    expect(MOCK_USERS.map((u) => [u.userId, u.role, u.twoFactor])).toEqual([
      ["dev_admin", "admin", true],
      ["dev_reviewer", "reviewer", false],
      ["dev_norole", null, false],
      ["dev_admin_no2fa", "admin", false],
    ]);
    expect(decodeMockSession("dev_reviewer")?.role).toBe("reviewer");
    expect(decodeMockSession("dev_norole")?.role).toBeNull();
  });

  it("can't be used to invent a user or role", () => {
    expect(decodeMockSession(undefined)).toBeNull();
    expect(decodeMockSession("admin")).toBeNull();
    expect(decodeMockSession('{"role":"admin"}')).toBeNull();
  });
});
