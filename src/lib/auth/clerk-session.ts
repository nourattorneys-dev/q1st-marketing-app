import { isRole, type Role } from "./roles";
import type { Session } from "./types";

/** The parts of Clerk's User we read; `currentUser()`'s result satisfies this structurally. */
export type ClerkUserLike = {
  id: string;
  fullName: string | null;
  primaryEmailAddress: { emailAddress: string } | null;
  publicMetadata: Record<string, unknown> | null | undefined;
  twoFactorEnabled: boolean;
};

export function sessionFromClerkUser(user: ClerkUserLike): Session {
  const email = user.primaryEmailAddress?.emailAddress ?? "";
  const role = user.publicMetadata?.role;
  return { userId: user.id, email, name: user.fullName || email, role: isRole(role) ? role : null, twoFactor: user.twoFactorEnabled === true };
}

/**
 * The role the session token carries, when the Clerk instance puts public metadata there (Clerk Dashboard → Sessions →
 * Customize session token: {"metadata": "{{user.public_metadata}}"}). Undefined when the token has no metadata claim.
 */
export function roleFromClaims(claims: unknown): Role | null | undefined {
  if (typeof claims !== "object" || claims === null) return undefined;
  const metadata = (claims as Record<string, unknown>).metadata;
  if (typeof metadata !== "object" || metadata === null) return undefined;
  const role = (metadata as Record<string, unknown>).role;
  return isRole(role) ? role : null;
}
