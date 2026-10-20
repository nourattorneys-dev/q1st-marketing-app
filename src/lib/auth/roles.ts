export const ROLES = ["admin", "reviewer"] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export type Permission =
  | "content.work" // keywords, ideas, drafting, import, review, edit, approve, override, schedule, history
  | "siteHealth.view"
  | "siteHealth.apply" // changes the live website
  | "settings.manage" // SEO profile, schedule, website connection, social, webhook
  | "users.manage"
  | "plan.manage";

const PERMISSIONS: Record<Role, readonly Permission[]> = {
  admin: ["content.work", "siteHealth.view", "siteHealth.apply", "settings.manage", "users.manage", "plan.manage"],
  reviewer: ["content.work", "siteHealth.view"],
};

export function can(role: Role, permission: Permission): boolean {
  return PERMISSIONS[role].includes(permission);
}
