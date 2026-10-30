import { MailError } from "@/lib/notifications/mail-error";
import type { Mailer } from "@/lib/notifications/mailer";
import { validInviteEmail } from "@/lib/users/rules";
import { DirectoryError, type DirectoryInvite, type DirectoryUser, type UserDirectory } from "@/lib/users/types";
import { addDays, emailInvitation, INVITATION_DAYS } from "./invitations";
import type { Account, AccountStore, Invitation } from "./store";
import { grantedSites, type SiteRef } from "@/lib/tenancy/access";
import { hashToken, newId, newToken } from "./tokens";

const toUser = (account: Account, granted: string[]): DirectoryUser => ({
  id: account.id,
  name: account.name,
  email: account.email,
  role: account.role,
  twoFactor: false,
  siteIds: account.role === "admin" || granted.length === 0 ? null : granted,
  lastSignInAt: account.lastSignInAt?.toISOString() ?? null,
});

const toInvite = (invitation: Invitation): DirectoryInvite => ({
  id: invitation.id,
  email: invitation.email,
  role: invitation.role,
  siteIds: invitation.siteIds,
  createdAt: invitation.createdAt.toISOString(),
  expiresAt: invitation.expiresAt.toISOString(),
});

const CONFLICT = "This person already has an account or an invitation.";

const GONE_PERSON = "This person no longer exists.";
const GONE_INVITATION = "This invitation no longer exists.";

/**
 * AUTH_MODE=password (spec M5c): the Users page on the dashboard's own accounts; invitations go out by email.
 * P1b: everything is the given client's; another client's people and invitations are answered as not found.
 */
export function createAccountsDirectory(deps: {
  store: AccountStore;
  mailer: Mailer;
  appUrl: string;
  clientId: string;
  sites: SiteRef[];
  now?: () => Date;
}): UserDirectory {
  const { store, clientId } = deps;
  const now = deps.now ?? (() => new Date());

  const ours = async (userId: string) => {
    const account = await store.account(userId);
    if (!account || account.clientId !== clientId) throw new DirectoryError("not_found", GONE_PERSON);
    return account;
  };
  const ourInvitation = async (id: string) => {
    const invitation = await store.invitation(id);
    if (!invitation || invitation.clientId !== clientId) throw new DirectoryError("not_found", GONE_INVITATION);
    return invitation;
  };
  const userOf = async (account: Account) => toUser(account, await store.userSites(account.id));

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
      const users = await Promise.all((await store.accounts(clientId)).map(userOf));
      return { users, invites: (await store.invitations(clientId)).map(toInvite) };
    },

    async invite(email, role, invitedBy, siteIds) {
      const tidy = validInviteEmail(email);
      if ((await store.accountByEmail(tidy)) || (await store.invitationByEmail(tidy))) throw new DirectoryError("conflict", CONFLICT);
      const at = now();
      const token = newToken();
      const invitation: Invitation = {
        id: newId("inv"),
        email: tidy,
        role,
        clientId,
        siteIds: role === "admin" ? null : grantedSites(siteIds, deps.sites),
        tokenHash: hashToken(token),
        invitedBy,
        createdAt: at,
        expiresAt: addDays(at, INVITATION_DAYS),
      };
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
      const invitation = await ourInvitation(id);
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
      await ourInvitation(id);
      if (!(await store.deleteInvitation(id))) throw new DirectoryError("not_found", "This invitation no longer exists.");
      return { revoked: true as const };
    },

    async setRole(userId, role) {
      await ours(userId);
      const account = await store.setRole(userId, role);
      if (!account) throw new DirectoryError("not_found", GONE_PERSON);
      return userOf(account);
    },

    async setSites(userId, siteIds) {
      const account = await ours(userId);
      await store.setUserSites(userId, grantedSites(siteIds, deps.sites) ?? []);
      return userOf(account);
    },
  };
}
