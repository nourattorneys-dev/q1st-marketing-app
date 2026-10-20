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

  it("gives both roles the M1 dashboard", () => {
    expect(visibleNavItems("reviewer")).toEqual(NAV_ITEMS);
    expect(visibleNavItems("admin")).toEqual(NAV_ITEMS);
  });
});
