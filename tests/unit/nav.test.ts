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
});
