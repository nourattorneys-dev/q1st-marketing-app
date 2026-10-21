import { can, type Permission, type Role } from "@/lib/auth/roles";

export type NavItem = { key: string; href: string; permission: Permission };

/** Later milestones append their screens here, each with the permission that gates it. */
export const NAV_ITEMS: readonly NavItem[] = [
  { key: "dashboard", href: "/", permission: "content.work" },
  { key: "keywords", href: "/keywords", permission: "content.work" },
  { key: "review", href: "/review", permission: "content.work" },
  { key: "scheduled", href: "/scheduled", permission: "content.work" },
  { key: "history", href: "/history", permission: "content.work" },
];

export function visibleNavItems(role: Role, items: readonly NavItem[] = NAV_ITEMS): NavItem[] {
  return items.filter((item) => can(role, item.permission));
}
