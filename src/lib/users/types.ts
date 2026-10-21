import type { ActionResult } from "@/lib/actions/result";
import type { Role } from "@/lib/auth/roles";

/** Someone who can sign in (design §5): the role lives with their sign-in account; null means no access. */
export type DirectoryUser = { id: string; name: string; email: string; role: Role | null; twoFactor: boolean; lastSignInAt: string | null };
export type DirectoryInvite = { id: string; email: string; role: Role | null; createdAt: string };

export interface UserDirectory {
  list(): Promise<{ users: DirectoryUser[]; invites: DirectoryInvite[] }>;
  invite(email: string, role: Role): Promise<DirectoryInvite>;
  revokeInvite(id: string): Promise<{ revoked: true }>;
  setRole(userId: string, role: Role | null): Promise<DirectoryUser>;
}

export type DirectoryErrorCode = "invalid_input" | "conflict" | "not_found" | "unavailable";
const STATUS: Record<DirectoryErrorCode, number> = { invalid_input: 400, conflict: 409, not_found: 404, unavailable: 503 };

export class DirectoryError extends Error {
  constructor(
    readonly code: DirectoryErrorCode,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
  }
}

/** Directory failures become action results, shaped like the engine's, so the same error display works. */
export async function tryDirectory<T>(run: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await run() };
  } catch (error) {
    if (!(error instanceof DirectoryError)) throw error;
    return { ok: false, error: { status: STATUS[error.code], code: error.code, message: error.message, ...(error.fields ? { fields: error.fields } : {}) } };
  }
}
