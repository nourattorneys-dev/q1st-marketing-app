import type { Session } from "./types";

export const MOCK_SESSION_COOKIE = "dev_session";

export const MOCK_USERS: readonly Session[] = [
  { userId: "dev_admin", email: "admin@example.com", name: "Admin (test)", role: "admin" },
  { userId: "dev_reviewer", email: "reviewer@example.com", name: "Reviewer (test)", role: "reviewer" },
  { userId: "dev_norole", email: "pending@example.com", name: "No role (test)", role: null },
];

/** The cookie holds only the id of one of the fixed test users, so it can't be used to invent a role. */
export function decodeMockSession(value: string | undefined): Session | null {
  if (!value) return null;
  return MOCK_USERS.find((user) => user.userId === value) ?? null;
}
