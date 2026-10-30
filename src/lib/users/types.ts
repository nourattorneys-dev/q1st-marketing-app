import type { ActionResult } from "@/lib/actions/result";
import type { Role } from "@/lib/auth/roles";

/** Someone who can sign in (design §5): the role lives with their sign-in account; null means no access. */
/** `siteIds` (P1b): the sites a Reviewer may open; null = every site of the client (Admins always). */
export type DirectoryUser = {
  id: string;
  name: string;
  email: string;
  role: Role | null;
  twoFactor: boolean;
  siteIds: string[] | null;
  lastSignInAt: string | null;
};
export type DirectoryInvite = { id: string; email: string; role: Role | null; siteIds: string[] | null; createdAt: string; expiresAt: string | null };

export interface UserDirectory {
  list(): Promise<{ users: DirectoryUser[]; invites: DirectoryInvite[] }>;
  /** `invitedBy`: the Admin's user id (spec M5c), kept with the invitation. */
  /** `siteIds` (P1b): the sites a Reviewer will open; null or omitted = every site. */
  invite(email: string, role: Role, invitedBy: string | null, siteIds?: string[] | null): Promise<DirectoryInvite>;
  /** A new link and a new 7-day expiry (spec M5c). */
  resendInvite(id: string): Promise<DirectoryInvite>;
  revokeInvite(id: string): Promise<{ revoked: true }>;
  setRole(userId: string, role: Role | null): Promise<DirectoryUser>;
  /** P1b: the sites a Reviewer may open; null = every site. */
  setSites(userId: string, siteIds: string[] | null): Promise<DirectoryUser>;
}

export type DirectoryErrorCode = "invalid_input" | "conflict" | "not_found" | "refused" | "unavailable" | "mail_failed";
const STATUS: Record<DirectoryErrorCode, number> = { invalid_input: 400, conflict: 409, not_found: 404, refused: 422, unavailable: 503, mail_failed: 502 };

export class DirectoryError extends Error {
  constructor(
    readonly code: DirectoryErrorCode,
    message: string,
    readonly fields?: Record<string, string>,
    readonly details?: Record<string, unknown>,
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
    return {
      ok: false,
      error: {
        status: STATUS[error.code],
        code: error.code,
        message: error.message,
        ...(error.fields ? { fields: error.fields } : {}),
        ...(error.details ? { details: error.details } : {}),
      },
    };
  }
}
