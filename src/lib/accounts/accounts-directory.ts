import { MailError } from "@/lib/notifications/mail-error";
import { renderAccountEmail } from "@/lib/notifications/render";
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

const toInvite = (invitation: Invitation, added = false): DirectoryInvite => ({
  id: invitation.id,
  email: invitation.email,
  role: invitation.role,
  siteIds: invitation.siteIds,
  createdAt: invitation.createdAt.toISOString(),
  expiresAt: invitation.expiresAt.toISOString(),
  ...(added ? { added: true } : {}),
});

const CONFLICT = "This person already works for this client, or has an invitation from it.";

const GONE_PERSON = "This person no longer exists.";
const GONE_INVITATION = "This invitation no longer exists.";

/**
 * AUTH_MODE=password (spec M5c): the Users page on the dashboard's own accounts; invitations go out by email.
 * P1b: everything is the given client's; another client's people and invitations are answered as not found.
 */
export function createAccountsDirectory(deps: {
  store: AccountStore;
  mailer: Mailer;
  /** This client's own address (its emails link there). */
  appUrl: string;
  clientId: string;
  /** For the email to someone who already has an account. */
  clientName: string;
  sites: SiteRef[];
  now?: () => Date;
}): UserDirectory {
  const { store, clientId } = deps;
  const now = deps.now ?? (() => new Date());

  const ours = async (userId: string) => {
    const account = await store.member(userId, clientId);
    if (!account) throw new DirectoryError("not_found", GONE_PERSON);
    return account;
  };
  const ourInvitation = async (id: string) => {
    const invitation = await store.invitation(id);
    if (!invitation || invitation.clientId !== clientId) throw new DirectoryError("not_found", GONE_INVITATION);
    return invitation;
  };
  const userOf = async (account: Account) => toUser(account, await store.userSites(account.id, clientId));

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
      return { users, invites: (await store.invitations(clientId)).map((invitation) => toInvite(invitation)) };
    },

    async invite(email, role, invitedBy, siteIds) {
      const tidy = validInviteEmail(email);
      if (await store.invitationByEmail(tidy, clientId)) throw new DirectoryError("conflict", CONFLICT);
      const at = now();
      const sites = role === "admin" ? null : grantedSites(siteIds, deps.sites);
      // Someone with an account (for another client) joins at once and signs in with the password they have.
      const person = await store.accountByEmail(tidy);
      if (person) {
        if (!(await store.addMember(person.id, clientId, role, sites, at))) throw new DirectoryError("conflict", CONFLICT);
        try {
          await deps.mailer.send({
            ...renderAccountEmail("added", { appUrl: deps.appUrl, role, client: deps.clientName }),
            to: tidy,
            idempotencyKey: `added-${person.id}-${clientId}`,
          });
        } catch (error) {
          // They have their place either way; the Admin is told the email didn't go.
          console.error(`Added ${tidy} to client ${clientId}; the email failed: ${error instanceof Error ? error.message : String(error)}`);
        }
        console.info(`Added ${tidy} to client ${clientId} (${role})`);
        const kept: Invitation = { id: person.id, email: tidy, role, clientId, siteIds: sites, tokenHash: "", invitedBy, createdAt: at, expiresAt: at };
        return toInvite(kept, true);
      }
      const token = newToken();
      const invitation: Invitation = {
        id: newId("inv"),
        email: tidy,
        role,
        clientId,
        siteIds: sites,
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
      const account = await store.setRole(userId, clientId, role);
      if (!account) throw new DirectoryError("not_found", GONE_PERSON);
      return userOf(account);
    },

    async setSites(userId, siteIds) {
      const account = await ours(userId);
      await store.setUserSites(userId, clientId, grantedSites(siteIds, deps.sites) ?? []);
      return userOf(account);
    },
  };
}
