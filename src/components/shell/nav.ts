import { can, type Permission, type Role } from "@/lib/auth/roles";

/** The page list's groups (P2b): the daily work, the website, the team. */
export type NavGroup = "work" | "website" | "team";
export type NavItem = { key: string; href: string; permission: Permission; group: NavGroup; match?: string };

/** Later milestones append their screens here, each with the permission that gates it. */
export const NAV_ITEMS: readonly NavItem[] = [
  { key: "dashboard", href: "/", permission: "content.work", group: "work" },
  { key: "review", href: "/review", permission: "content.work", group: "work" },
  { key: "ideas", href: "/ideas", permission: "content.work", group: "work" },
  { key: "keywords", href: "/keywords", permission: "content.work", group: "work" },
  { key: "scheduled", href: "/scheduled", permission: "content.work", group: "work" },
  { key: "history", href: "/history", permission: "content.work", group: "work" },
  { key: "siteHealth", href: "/site-health", permission: "siteHealth.view", group: "website" },
  { key: "plan", href: "/plan", permission: "plan.manage", group: "website" },
  { key: "users", href: "/users", permission: "users.manage", group: "team" },
  // The four settings pages share one item; it's highlighted on any of them.
  { key: "settings", href: "/settings/seo", match: "/settings", permission: "settings.manage", group: "team" },
];

export const NAV_GROUPS: readonly NavGroup[] = ["work", "website", "team"];

export function visibleNavItems(role: Role, items: readonly NavItem[] = NAV_ITEMS): NavItem[] {
  return items.filter((item) => can(role, item.permission));
}
