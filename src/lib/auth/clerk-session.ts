import { isRole } from "./roles";
import type { Session } from "./types";

/** The parts of Clerk's User we read; `currentUser()`'s result satisfies this structurally. */
export type ClerkUserLike = {
  id: string;
  fullName: string | null;
  primaryEmailAddress: { emailAddress: string } | null;
  publicMetadata: Record<string, unknown> | null | undefined;
};

export function sessionFromClerkUser(user: ClerkUserLike): Session {
  const email = user.primaryEmailAddress?.emailAddress ?? "";
  const role = user.publicMetadata?.role;
  return { userId: user.id, email, name: user.fullName || email, role: isRole(role) ? role : null };
}
