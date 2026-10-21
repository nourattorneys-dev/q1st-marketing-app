import { can, type Permission, type Role } from "@/lib/auth/roles";

export type NavItem = { key: string; href: string; permission: Permission; match?: string };

/** Later milestones append their screens here, each with the permission that gates it. */
export const NAV_ITEMS: readonly NavItem[] = [
  { key: "dashboard", href: "/", permission: "content.work" },
  { key: "keywords", href: "/keywords", permission: "content.work" },
  { key: "ideas", href: "/ideas", permission: "content.work" },
  { key: "review", href: "/review", permission: "content.work" },
  { key: "scheduled", href: "/scheduled", permission: "content.work" },
  { key: "history", href: "/history", permission: "content.work" },
  { key: "siteHealth", href: "/site-health", permission: "siteHealth.view" },
  { key: "plan", href: "/plan", permission: "plan.manage" },
  // The four settings pages share one item; it's highlighted on any of them.
  { key: "settings", href: "/settings/seo", match: "/settings", permission: "settings.manage" },
];

export function visibleNavItems(role: Role, items: readonly NavItem[] = NAV_ITEMS): NavItem[] {
  return items.filter((item) => can(role, item.permission));
}
