import { describe, expect, it } from "vitest";
import { twoFactorStatus } from "@/lib/auth/two-factor";

describe("twoFactorStatus", () => {
  it("requires it of an Admin and recommends it to a Reviewer while it's off (design §5)", () => {
    expect(twoFactorStatus("required", { role: "admin", twoFactor: false })).toBe("required");
    expect(twoFactorStatus("required", { role: "reviewer", twoFactor: false })).toBe("recommended");
    expect(twoFactorStatus("required", { role: "admin", twoFactor: true })).toBe("on");
    expect(twoFactorStatus("required", { role: "reviewer", twoFactor: true })).toBe("on");
  });

  it("says nothing when the dashboard runs without two-factor login (TWO_FACTOR=off, Clerk's free plan)", () => {
    expect(twoFactorStatus("off", { role: "admin", twoFactor: false })).toBeNull();
    expect(twoFactorStatus("off", { role: "reviewer", twoFactor: false })).toBeNull();
    expect(twoFactorStatus("off", { role: "admin", twoFactor: true })).toBeNull();
  });
});
