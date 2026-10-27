import { MailError } from "@/lib/notifications/mail-error";
import type { Mailer } from "@/lib/notifications/mailer";
import { validInviteEmail } from "@/lib/users/rules";
import { DirectoryError, type DirectoryInvite, type DirectoryUser, type UserDirectory } from "@/lib/users/types";
import { addDays, emailInvitation, INVITATION_DAYS } from "./invitations";
import type { Account, AccountStore, Invitation } from "./store";
import { hashToken, newId, newToken } from "./tokens";

const toUser = (account: Account): DirectoryUser => ({
  id: account.id,
  name: account.name,
  email: account.email,
  role: account.role,
  twoFactor: false,
  lastSignInAt: account.lastSignInAt?.toISOString() ?? null,
});

const toInvite = (invitation: Invitation): DirectoryInvite => ({
  id: invitation.id,
  email: invitation.email,
  role: invitation.role,
  createdAt: invitation.createdAt.toISOString(),
  expiresAt: invitation.expiresAt.toISOString(),
});

const CONFLICT = "This person already has an account or an invitation.";

/** AUTH_MODE=password (spec M5c): the Users page on the dashboard's own accounts; invitations go out by email. */
export function createAccountsDirectory(deps: { store: AccountStore; mailer: Mailer; appUrl: string; now?: () => Date }): UserDirectory {
  const { store } = deps;
  const now = deps.now ?? (() => new Date());

  /** A failed send becomes the page's mail_failed answer, with the kind and the server's reply. */
  async function send(invitation: Invitation, token: string): Promise<void> {
    try {
      await emailInvitation(deps.mailer, deps.appUrl, invitation, token);
    } catch (error) {
      if (error instanceof MailError) throw new DirectoryError("mail_failed", error.message, undefined, { kind: error.kind, reply: error.reply });
      throw error;
    }
  }

  return {
    async list() {
      return { users: (await store.accounts()).map(toUser), invites: (await store.invitations()).map(toInvite) };
    },

    async invite(email, role, invitedBy) {
      const tidy = validInviteEmail(email);
      if ((await store.accountByEmail(tidy)) || (await store.invitationByEmail(tidy))) throw new DirectoryError("conflict", CONFLICT);
      const at = now();
      const token = newToken();
      const invitation: Invitation = { id: newId("inv"), email: tidy, role, tokenHash: hashToken(token), invitedBy, createdAt: at, expiresAt: addDays(at, INVITATION_DAYS) };
      if (!(await store.addInvitation(invitation))) throw new DirectoryError("conflict", CONFLICT);
      try {
        await send(invitation, token);
      } catch (error) {
        // Nothing is kept for an invitation nobody received: the Admin can simply try again.
        await store.deleteInvitation(invitation.id);
        throw error;
      }
      return toInvite(invitation);
    },

    async resendInvite(id) {
      const invitation = await store.invitation(id);
      if (!invitation) throw new DirectoryError("not_found", "This invitation no longer exists.");
      const at = now();
      const token = newToken();
      const renewed: Invitation = { ...invitation, tokenHash: hashToken(token), createdAt: at, expiresAt: addDays(at, INVITATION_DAYS) };
      // Sent first: if it fails, the old link keeps working and nothing changes.
      await send(renewed, token);
      if (!(await store.renewInvitation(id, { tokenHash: renewed.tokenHash, createdAt: at, expiresAt: renewed.expiresAt }))) {
        throw new DirectoryError("not_found", "This invitation no longer exists.");
      }
      return toInvite(renewed);
    },

    async revokeInvite(id) {
      if (!(await store.deleteInvitation(id))) throw new DirectoryError("not_found", "This invitation no longer exists.");
      return { revoked: true as const };
    },

    async setRole(userId, role) {
      const account = await store.setRole(userId, role);
      if (!account) throw new DirectoryError("not_found", "This person no longer exists.");
      return toUser(account);
    },
  };
}
