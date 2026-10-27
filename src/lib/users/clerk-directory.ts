import { isRole, type Role } from "@/lib/auth/roles";
import { alreadyKnown, validInviteEmail } from "./rules";
import { DirectoryError, type DirectoryInvite, type DirectoryUser, type UserDirectory } from "./types";

type ClerkUserRecord = {
  id: string;
  fullName: string | null;
  primaryEmailAddress: { emailAddress: string } | null;
  publicMetadata: Record<string, unknown> | null | undefined;
  twoFactorEnabled: boolean;
  lastSignInAt: number | null;
};
type ClerkInvitationRecord = { id: string; emailAddress: string; publicMetadata: Record<string, unknown> | null; createdAt: number };

/** The parts of Clerk's backend client the directory uses; `await clerkClient()` satisfies it structurally. */
export type ClerkDirectoryClient = {
  users: {
    getUserList(params: { limit: number; orderBy: "-created_at" }): Promise<{ data: ClerkUserRecord[] }>;
    updateUserMetadata(userId: string, params: { publicMetadata: Record<string, unknown> }): Promise<ClerkUserRecord>;
  };
  invitations: {
    getInvitationList(params: { status: "pending"; limit: number }): Promise<{ data: ClerkInvitationRecord[] }>;
    createInvitation(params: { emailAddress: string; publicMetadata: Record<string, unknown>; notify: boolean }): Promise<ClerkInvitationRecord>;
    revokeInvitation(invitationId: string): Promise<ClerkInvitationRecord>;
  };
};

const roleOf = (metadata: Record<string, unknown> | null | undefined): Role | null => (isRole(metadata?.role) ? (metadata?.role as Role) : null);
const isoOf = (ms: number | null) => (ms ? new Date(ms).toISOString() : null);

function toUser(user: ClerkUserRecord): DirectoryUser {
  const email = user.primaryEmailAddress?.emailAddress ?? "";
  return { id: user.id, name: user.fullName || email, email, role: roleOf(user.publicMetadata), twoFactor: user.twoFactorEnabled === true, lastSignInAt: isoOf(user.lastSignInAt) };
}

function toInvite(invitation: ClerkInvitationRecord): DirectoryInvite {
  return { id: invitation.id, email: invitation.emailAddress, role: roleOf(invitation.publicMetadata), createdAt: new Date(invitation.createdAt).toISOString(), expiresAt: null };
}

/** Clerk's API errors carry `status` and `errors[].code` (ClerkAPIResponseError); a thrown TypeError means no answer. */
function fromClerk(error: unknown): DirectoryError {
  if (error instanceof DirectoryError) return error;
  const record = (typeof error === "object" && error !== null ? error : {}) as { status?: unknown; errors?: { code?: unknown }[] };
  const code = record.errors?.[0]?.code;
  if (code === "duplicate_record" || code === "form_identifier_exists") {
    return new DirectoryError("conflict", "This person already has an account or an invitation.");
  }
  if (record.status === 404) return new DirectoryError("not_found", "This person or invitation no longer exists.");
  // A refusal (bad input, not allowed) is not an outage: retrying won't help, so say so (M4b follow-up).
  if (record.status === 400 || record.status === 403 || record.status === 422) {
    return new DirectoryError("refused", "The sign-in service refused this. Check the details and try again.");
  }
  return new DirectoryError("unavailable", "The sign-in service can't be reached right now. Try again shortly.");
}

async function guarded<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw fromClerk(error);
  }
}

/** Users and roles in Clerk (design §5: the role lives in public metadata; invitations carry it to the new account). */
export function createClerkDirectory(client: ClerkDirectoryClient): UserDirectory {
  async function list() {
    return guarded(async () => {
      const [users, invites] = await Promise.all([
        client.users.getUserList({ limit: 100, orderBy: "-created_at" }),
        client.invitations.getInvitationList({ status: "pending", limit: 100 }),
      ]);
      return { users: users.data.map(toUser), invites: invites.data.map(toInvite) };
    });
  }

  return {
    list,

    async invite(email: string, role: Role) {
      const tidy = validInviteEmail(email);
      const { users, invites } = await list();
      if (alreadyKnown(tidy, users, invites)) throw new DirectoryError("conflict", "This person already has an account or an invitation.");
      return guarded(async () => toInvite(await client.invitations.createInvitation({ emailAddress: tidy, publicMetadata: { role }, notify: true })));
    },

    async resendInvite() {
      throw new DirectoryError("refused", "Resend isn't available with Clerk.");
    },

    async revokeInvite(id: string) {
      return guarded(async () => {
        await client.invitations.revokeInvitation(id);
        return { revoked: true as const };
      });
    },

    async setRole(userId: string, role: Role | null) {
      // Clerk deep-merges metadata; a null value removes the key.
      return guarded(async () => toUser(await client.users.updateUserMetadata(userId, { publicMetadata: { role } })));
    },
  };
}
