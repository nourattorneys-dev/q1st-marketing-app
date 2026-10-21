import { describe, expect, it } from "vitest";
import { NAV_ITEMS, visibleNavItems, type NavItem } from "@/components/shell/nav";

const items: NavItem[] = [
  { key: "dashboard", href: "/", permission: "content.work" },
  { key: "settings", href: "/settings", permission: "settings.manage" },
  { key: "users", href: "/users", permission: "users.manage" },
];

describe("visibleNavItems", () => {
  it("shows reviewers only content screens", () => {
    expect(visibleNavItems("reviewer", items).map((i) => i.key)).toEqual(["dashboard"]);
  });

  it("shows admins every screen", () => {
    expect(visibleNavItems("admin", items).map((i) => i.key)).toEqual(["dashboard", "settings", "users"]);
  });

  it("gives reviewers every content screen, and admins the settings too (design §5)", () => {
    expect(visibleNavItems("reviewer").map((item) => item.key)).not.toContain("settings");
    expect(visibleNavItems("admin")).toEqual(NAV_ITEMS);
    expect(NAV_ITEMS.find((item) => item.key === "settings")).toEqual({ key: "settings", href: "/settings/seo", match: "/settings", permission: "settings.manage" });
  });

  it("shows Site health to both roles", () => {
    expect(visibleNavItems("reviewer").map((item) => item.key)).toContain("siteHealth");
    expect(NAV_ITEMS.find((item) => item.key === "siteHealth")).toEqual({ key: "siteHealth", href: "/site-health", permission: "siteHealth.view" });
  });

  it("shows Plan & usage to admins only", () => {
    expect(visibleNavItems("reviewer").map((item) => item.key)).not.toContain("plan");
    expect(NAV_ITEMS.find((item) => item.key === "plan")).toEqual({ key: "plan", href: "/plan", permission: "plan.manage" });
  });

  it("shows Users to admins only, before Settings (design §7 /users)", () => {
    expect(visibleNavItems("reviewer").map((item) => item.key)).not.toContain("users");
    expect(NAV_ITEMS.find((item) => item.key === "users")).toEqual({ key: "users", href: "/users", permission: "users.manage" });
    const keys = NAV_ITEMS.map((item) => item.key);
    expect(keys.indexOf("users")).toBe(keys.indexOf("settings") - 1);
  });
});
