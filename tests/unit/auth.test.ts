import { describe, expect, it } from "vitest";
import { roleFromClaims, sessionFromClerkUser } from "@/lib/auth/clerk-session";
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

describe("sessionFromClerkUser", () => {
  const base = { id: "user_1", fullName: "Sara Ali", primaryEmailAddress: { emailAddress: "sara@example.com" }, twoFactorEnabled: true };

  it("reads the role from public metadata", () => {
    expect(sessionFromClerkUser({ ...base, publicMetadata: { role: "admin" } })).toEqual({
      userId: "user_1",
      email: "sara@example.com",
      name: "Sara Ali",
      role: "admin",
      twoFactor: true,
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

  it("reads whether two-factor login is on (design §5)", () => {
    expect(sessionFromClerkUser({ ...base, twoFactorEnabled: false, publicMetadata: { role: "admin" } }).twoFactor).toBe(false);
  });
});

describe("roleFromClaims (M3a follow-up: no Clerk API call per job poll)", () => {
  it("reads the role the session token carries in its metadata claim", () => {
    expect([roleFromClaims({ metadata: { role: "reviewer" } }), roleFromClaims({ metadata: { role: "owner" } }), roleFromClaims({ metadata: {} })]).toEqual([
      "reviewer",
      null,
      null,
    ]);
  });

  it("says nothing when the token has no metadata claim, so the caller asks Clerk instead", () => {
    expect([roleFromClaims({}), roleFromClaims(null), roleFromClaims({ metadata: "x" })]).toEqual([undefined, undefined, undefined]);
  });
});
