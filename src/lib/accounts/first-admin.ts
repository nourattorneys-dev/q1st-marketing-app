import type { AppStore } from "@/lib/db/store";
import { describeMailFailure } from "@/lib/notifications/mail-error";
import type { Mailer } from "@/lib/notifications/mailer";
import { addDays, emailInvitation, INVITATION_DAYS } from "./invitations";
import type { AccountStore, Invitation } from "./store";
import { hashToken, newId, newToken } from "./tokens";

export type FirstAdmin = { state: "ready" } | { state: "invited"; to: string } | { state: "unset" } | { state: "failed" };

const SETUP_ATTEMPTS = 3;
const SETUP_WINDOW_MS = 15 * 60_000;

/** "o•••@example.com": enough for the owner to recognise, on a page anyone can open. */
export function maskEmail(email: string): string {
  return `${email.slice(0, 1)}•••${email.slice(email.lastIndexOf("@"))}`;
}

/**
 * Spec M5c "The first Admin": while there's no Admin, ADMIN_EMAIL gets an Admin invitation, sent once and again only
 * after it expired, under a lock so two visitors at once send one email. An existing account at that address becomes
 * the Admin instead. Visitors can't choose the address, and at most 3 attempts go out per 15 minutes.
 */
export async function ensureFirstAdmin(deps: {
  store: AccountStore;
  /** P1b: the first client (made from the settings file), whose first Admin this is; null while there is none. */
  clientId: string | null;
  exclusive: AppStore["exclusive"];
  mailer: Mailer;
  appUrl: string;
  adminEmail: string | null;
  now: Date;
}): Promise<FirstAdmin> {
  const { store, adminEmail, now, clientId } = deps;
  if (!clientId) return { state: "unset" };
  if (await store.hasAdmin(clientId)) return { state: "ready" };
  if (!adminEmail) return { state: "unset" };
  const invited: FirstAdmin = { state: "invited", to: maskEmail(adminEmail) };

  const outcome = await deps.exclusive("articles_ai_first_admin", async (): Promise<FirstAdmin> => {
    if (await store.hasAdmin(clientId)) return { state: "ready" };
    // A corrected ADMIN_EMAIL: an invitation sent to an earlier address must not make someone else the Admin.
    for (const earlier of await store.invitations(clientId)) {
      if (earlier.role !== "admin" || earlier.invitedBy !== null || earlier.email === adminEmail) continue;
      await store.deleteInvitation(earlier.id);
      console.info(`First Admin: withdrew the invitation to ${earlier.email} (ADMIN_EMAIL changed)`);
    }
    const existing = await store.accountByEmail(adminEmail);
    if (existing) {
      if (!(await store.setRole(existing.id, clientId, "admin"))) await store.addMember(existing.id, clientId, "admin", null, now);
      console.info(`First Admin: ${adminEmail} already had an account, now Admin`);
      return { state: "ready" };
    }
    const pending = await store.invitationByEmail(adminEmail, clientId);
    if (pending && pending.role === "admin" && pending.expiresAt.getTime() > now.getTime()) return invited;
    if ((await store.hit(`setup:${adminEmail}`, now, SETUP_WINDOW_MS)) > SETUP_ATTEMPTS) return { state: "failed" };
    if (pending) await store.deleteInvitation(pending.id);

    const token = newToken();
    const invitation: Invitation = {
      id: newId("inv"),
      email: adminEmail,
      role: "admin",
      clientId,
      siteIds: null,
      tokenHash: hashToken(token),
      invitedBy: null,
      createdAt: now,
      expiresAt: addDays(now, INVITATION_DAYS),
    };
    await store.addInvitation(invitation);
    try {
      await emailInvitation(deps.mailer, deps.appUrl, invitation, token);
    } catch (error) {
      await store.deleteInvitation(invitation.id);
      const { kind, reply } = describeMailFailure(error);
      console.error(`First Admin invitation failed (${kind}): ${reply}`);
      return { state: "failed" };
    }
    console.info(`First Admin: invitation emailed to ${adminEmail}`);
    return invited;
  });
  // Another visitor holds the lock and is sending it right now.
  return outcome.ran ? outcome.value : invited;
}
