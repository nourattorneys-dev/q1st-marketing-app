import type { Account, AccountStore, Invitation, PasswordReset, SessionRecord } from "./store";

const copy = <T>(value: T): T => structuredClone(value);
const oldestFirst = (a: { createdAt: Date; id: string }, b: { createdAt: Date; id: string }) =>
  a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id);

/** DB_MODE=memory: the accounts in this server process's memory (local development and tests). */
export function createMemoryAccountStore(): AccountStore {
  const accounts = new Map<string, Account>();
  const sessions = new Map<string, SessionRecord>();
  const invitations = new Map<string, Invitation>();
  const resets = new Map<string, PasswordReset>();
  const limits = new Map<string, { count: number; windowStart: Date }>();
  const byEmail = (email: string) => [...accounts.values()].find((account) => account.email === email);
  const live = (key: string, now: Date, windowMs: number) => {
    const entry = limits.get(key);
    return entry && entry.windowStart.getTime() > now.getTime() - windowMs ? entry : undefined;
  };

  return {
    async account(id) {
      const found = accounts.get(id);
      return found ? copy(found) : null;
    },
    async accountByEmail(email) {
      const found = byEmail(email);
      return found ? copy(found) : null;
    },
    async accounts() {
      return [...accounts.values()].sort(oldestFirst).map(copy);
    },
    async hasAdmin() {
      return [...accounts.values()].some((account) => account.role === "admin");
    },
    async createAccount(account) {
      if (byEmail(account.email)) return false;
      accounts.set(account.id, copy(account));
      return true;
    },
    async setRole(id, role) {
      const found = accounts.get(id);
      if (!found) return null;
      found.role = role;
      return copy(found);
    },
    async setPassword(id, passwordHash, at) {
      const found = accounts.get(id);
      if (found) Object.assign(found, { passwordHash, passwordChangedAt: new Date(at) });
    },
    async recordSignIn(id, at) {
      const found = accounts.get(id);
      if (found) found.lastSignInAt = new Date(at);
    },

    async createSession(session) {
      sessions.set(session.tokenHash, copy(session));
    },
    async sessionAccount(tokenHash, now) {
      const session = sessions.get(tokenHash);
      if (!session || session.expiresAt.getTime() <= now.getTime()) return null;
      const found = accounts.get(session.userId);
      return found ? copy(found) : null;
    },
    async deleteSession(tokenHash) {
      sessions.delete(tokenHash);
    },
    async deleteSessionsOf(userId, except) {
      for (const [hash, session] of sessions) if (session.userId === userId && hash !== except) sessions.delete(hash);
    },

    async invitations() {
      return [...invitations.values()].sort(oldestFirst).map(copy);
    },
    async invitation(id) {
      const found = invitations.get(id);
      return found ? copy(found) : null;
    },
    async invitationByEmail(email) {
      const found = [...invitations.values()].find((invitation) => invitation.email === email);
      return found ? copy(found) : null;
    },
    async invitationByToken(tokenHash) {
      const found = [...invitations.values()].find((invitation) => invitation.tokenHash === tokenHash);
      return found ? copy(found) : null;
    },
    async addInvitation(invitation) {
      if ([...invitations.values()].some((existing) => existing.email === invitation.email)) return false;
      invitations.set(invitation.id, copy(invitation));
      return true;
    },
    async renewInvitation(id, renewal) {
      const found = invitations.get(id);
      if (!found) return false;
      invitations.set(id, { ...found, ...copy(renewal) });
      return true;
    },
    async deleteInvitation(id) {
      return invitations.delete(id);
    },
    async acceptInvitation(id, account) {
      if (!invitations.has(id) || byEmail(account.email)) return false;
      invitations.delete(id);
      accounts.set(account.id, copy(account));
      return true;
    },

    async createReset(reset) {
      resets.set(reset.tokenHash, copy(reset));
    },
    async resetByToken(tokenHash) {
      const found = resets.get(tokenHash);
      return found ? copy(found) : null;
    },
    async deleteResetsOf(userId) {
      for (const [hash, reset] of resets) if (reset.userId === userId) resets.delete(hash);
    },

    async hit(key, now, windowMs) {
      const entry = live(key, now, windowMs);
      if (!entry) {
        limits.set(key, { count: 1, windowStart: new Date(now) });
        return 1;
      }
      entry.count += 1;
      return entry.count;
    },
    async hits(key, now, windowMs) {
      return live(key, now, windowMs)?.count ?? 0;
    },
    async clearHits(key) {
      limits.delete(key);
    },

    async forgetExpired({ now, invitationsBefore, limitsBefore }) {
      for (const [hash, session] of sessions) if (session.expiresAt.getTime() <= now.getTime()) sessions.delete(hash);
      for (const [hash, reset] of resets) if (reset.expiresAt.getTime() <= now.getTime()) resets.delete(hash);
      for (const [id, invitation] of invitations) if (invitation.expiresAt.getTime() <= invitationsBefore.getTime()) invitations.delete(id);
      for (const [key, entry] of limits) if (entry.windowStart.getTime() <= limitsBefore.getTime()) limits.delete(key);
    },
  };
}
