import { describe, expect, it } from "vitest";
import { sessionFromClerkUser } from "@/lib/auth/clerk-session";
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
  it("decodes the three fixed test users", () => {
    expect(MOCK_USERS.map((u) => u.userId)).toEqual(["dev_admin", "dev_reviewer", "dev_norole"]);
    expect(decodeMockSession("dev_reviewer")?.role).toBe("reviewer");
    expect(decodeMockSession("dev_norole")?.role).toBeNull();
  });

  it("can't be used to invent a user or role", () => {
    expect(decodeMockSession(undefined)).toBeNull();
    expect(decodeMockSession("admin")).toBeNull();
    expect(decodeMockSession('{"role":"admin"}')).toBeNull();
  });
});

describe("sessionFromClerkUser", () => {
  const base = { id: "user_1", fullName: "Sara Ali", primaryEmailAddress: { emailAddress: "sara@example.com" } };

  it("reads the role from public metadata", () => {
    expect(sessionFromClerkUser({ ...base, publicMetadata: { role: "admin" } })).toEqual({
      userId: "user_1",
      email: "sara@example.com",
      name: "Sara Ali",
      role: "admin",
    });
  });

  it("gives no role for a missing or unknown role", () => {
    expect(sessionFromClerkUser({ ...base, publicMetadata: {} }).role).toBeNull();
    expect(sessionFromClerkUser({ ...base, publicMetadata: { role: "owner" } }).role).toBeNull();
    expect(sessionFromClerkUser({ ...base, publicMetadata: null }).role).toBeNull();
  });

  it("falls back to the email when there is no name", () => {
    expect(sessionFromClerkUser({ ...base, fullName: null, publicMetadata: {} }).name).toBe("sara@example.com");
  });
});
