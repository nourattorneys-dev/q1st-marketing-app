import type { Role } from "@/lib/auth/roles";
import type { Account, AccountStore, Client, ClientLogo, Invitation, Membership, PasswordReset, SessionRecord, Site } from "./store";

const copy = <T>(value: T): T => structuredClone(value);
const oldestFirst = (a: { createdAt: Date; id: string }, b: { createdAt: Date; id: string }) =>
  a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id);

/** DB_MODE=memory: the accounts in this server process's memory (local development and tests). */
export function createMemoryAccountStore(): AccountStore {
  /** People alone (clientId and role null); their places in clients are in `members`. */
  const accounts = new Map<string, Account>();
  const members = new Map<string, Map<string, Membership>>();
  const sessionClients = new Map<string, string>();
  const sessions = new Map<string, SessionRecord>();
  const invitations = new Map<string, Invitation>();
  const resets = new Map<string, PasswordReset>();
  const limits = new Map<string, { count: number; windowStart: Date }>();
  const sessionSites = new Map<string, string>();
  /** The sites a person may open in a client, by "<user id>|<client id>". */
  const placeKey = (userId: string, clientId: string) => `${userId}|${clientId}`;
  const userSites = new Map<string, string[]>();
  const clients = new Map<string, Client>();
  const sites = new Map<string, Site>();
  const logos = new Map<string, ClientLogo>();
  const byEmail = (email: string) => [...accounts.values()].find((account) => account.email === email);
  const person = (account: Account): Account => ({ ...copy(account), clientId: null, role: null });
  const inClient = (userId: string, clientId: string): Account | null => {
    const found = accounts.get(userId);
    const place = members.get(userId)?.get(clientId);
    return found && place ? { ...copy(found), clientId, role: place.role } : null;
  };
  const join = (userId: string, clientId: string, role: Role | null, at: Date) => {
    const places = members.get(userId) ?? new Map<string, Membership>();
    places.set(clientId, { clientId, role, createdAt: new Date(at) });
    members.set(userId, places);
  };
  const forget = (userId: string) => {
    accounts.delete(userId);
    members.delete(userId);
    for (const [hash, session] of sessions) if (session.userId === userId) sessions.delete(hash);
    for (const [hash, reset] of resets) if (reset.userId === userId) resets.delete(hash);
  };
  const live = (key: string, now: Date, windowMs: number) => {
    const entry = limits.get(key);
    return entry && entry.windowStart.getTime() > now.getTime() - windowMs ? entry : undefined;
  };

  return {
    async account(id) {
      const found = accounts.get(id);
      return found ? person(found) : null;
    },
    async accountByEmail(email) {
      const found = byEmail(email);
      return found ? person(found) : null;
    },
    async member(userId, clientId) {
      return inClient(userId, clientId);
    },
    async accounts(clientId) {
      const joined = (id: string) => members.get(id)?.get(clientId)?.createdAt.getTime() ?? 0;
      return [...accounts.keys()]
        .filter((id) => members.get(id)?.has(clientId))
        .sort((a, b) => joined(a) - joined(b) || a.localeCompare(b))
        .map((id) => inClient(id, clientId)!);
    },
    async memberships(userId) {
      return [...(members.get(userId)?.values() ?? [])].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.clientId.localeCompare(b.clientId)).map(copy);
    },
    async addMember(userId, clientId, role, siteIds, at) {
      if (!accounts.has(userId) || members.get(userId)?.has(clientId)) return false;
      join(userId, clientId, role, at);
      if (siteIds?.length) userSites.set(placeKey(userId, clientId), [...new Set(siteIds)]);
      return true;
    },
    async createAccount(account) {
      if (byEmail(account.email)) return false;
      accounts.set(account.id, person(account));
      if (account.clientId) join(account.id, account.clientId, account.role, account.createdAt);
      return true;
    },
    async hasAdmin(clientId) {
      return [...members.values()].some((places) => places.get(clientId)?.role === "admin");
    },
    async setRole(userId, clientId, role) {
      const place = members.get(userId)?.get(clientId);
      if (!place) return null;
      place.role = role;
      return inClient(userId, clientId);
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
      return found ? person(found) : null;
    },
    async sessionClient(tokenHash) {
      return sessions.has(tokenHash) ? (sessionClients.get(tokenHash) ?? null) : null;
    },
    async setSessionClient(tokenHash, clientId) {
      if (sessions.has(tokenHash)) sessionClients.set(tokenHash, clientId);
    },
    async deleteSession(tokenHash) {
      sessions.delete(tokenHash);
      sessionSites.delete(tokenHash);
      sessionClients.delete(tokenHash);
    },
    async sessionSite(tokenHash) {
      return sessions.has(tokenHash) ? (sessionSites.get(tokenHash) ?? null) : null;
    },
    async setSessionSite(tokenHash, siteId) {
      if (sessions.has(tokenHash)) sessionSites.set(tokenHash, siteId);
    },
    async deleteSessionsOf(userId, except) {
      for (const [hash, session] of sessions) {
        if (session.userId === userId && hash !== except) {
          sessions.delete(hash);
          sessionSites.delete(hash);
        }
      }
    },

    async invitations(clientId) {
      return [...invitations.values()].filter((invitation) => invitation.clientId === clientId).sort(oldestFirst).map(copy);
    },
    async invitation(id) {
      const found = invitations.get(id);
      return found ? copy(found) : null;
    },
    async invitationByEmail(email, clientId) {
      const found = [...invitations.values()].find((invitation) => invitation.email === email && invitation.clientId === clientId);
      return found ? copy(found) : null;
    },
    async invitationByToken(tokenHash) {
      const found = [...invitations.values()].find((invitation) => invitation.tokenHash === tokenHash);
      return found ? copy(found) : null;
    },
    async addInvitation(invitation) {
      if ([...invitations.values()].some((existing) => existing.email === invitation.email && existing.clientId === invitation.clientId)) return false;
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
      const invitation = invitations.get(id);
      if (!invitation || byEmail(account.email)) return false;
      invitations.delete(id);
      accounts.set(account.id, person(account));
      if (invitation.clientId) join(account.id, invitation.clientId, invitation.role, account.createdAt);
      if (invitation.siteIds && invitation.clientId) userSites.set(placeKey(account.id, invitation.clientId), [...invitation.siteIds]);
      return true;
    },

    async userSites(userId, clientId) {
      return [...(userSites.get(placeKey(userId, clientId)) ?? [])].sort();
    },
    async setUserSites(userId, clientId, siteIds) {
      if (siteIds.length === 0) userSites.delete(placeKey(userId, clientId));
      else userSites.set(placeKey(userId, clientId), [...new Set(siteIds)]);
    },
    async clients() {
      return [...clients.values()].sort(oldestFirst).map(copy);
    },
    async client(id) {
      const found = clients.get(id);
      return found ? copy(found) : null;
    },
    async createClient(client) {
      clients.set(client.id, { engineAccountId: null, status: "active", brandColor: null, brandColorDark: null, logoAt: null, slug: null, ...copy(client) });
    },
    async sites(clientId) {
      return [...sites.values()].filter((site) => clientId === undefined || site.clientId === clientId).sort(oldestFirst).map(copy);
    },
    async site(id) {
      const found = sites.get(id);
      return found ? copy(found) : null;
    },
    async createSite(site) {
      sites.set(site.id, copy(site));
    },
    async clientByEngineAccount(engineAccountId) {
      const found = [...clients.values()].find((client) => client.engineAccountId === engineAccountId);
      return found ? copy(found) : null;
    },
    async clientBySlug(slug) {
      const found = [...clients.values()].find((client) => client.slug === slug);
      return found ? copy(found) : null;
    },
    async updateClient(id, change) {
      const found = clients.get(id);
      if (!found) return true;
      if (change.slug && [...clients.values()].some((client) => client.id !== id && client.slug === change.slug)) return false;
      clients.set(id, { ...found, ...change });
      return true;
    },
    async setClientLogo(id, logo) {
      const found = clients.get(id);
      if (!found) return;
      if (logo) logos.set(id, { ...logo, data: Buffer.from(logo.data) });
      else logos.delete(id);
      clients.set(id, { ...found, logoAt: logo ? logo.updatedAt : null });
    },
    async clientLogo(id) {
      const found = logos.get(id);
      return found ? { ...found, data: Buffer.from(found.data) } : null;
    },
    async deleteClient(id) {
      logos.delete(id);
      for (const [userId, places] of members) {
        if (!places.delete(id)) continue;
        userSites.delete(placeKey(userId, id));
        if (places.size === 0) forget(userId);
      }
      for (const [hash, clientId] of sessionClients) if (clientId === id) sessionClients.delete(hash);
      for (const [inviteId, invitation] of invitations) if (invitation.clientId === id) invitations.delete(inviteId);
      for (const [siteId, site] of sites) if (site.clientId === id) sites.delete(siteId);
      clients.delete(id);
    },
    async updateSite(id, change) {
      const found = sites.get(id);
      if (found) sites.set(id, { ...found, ...change });
    },
    async deleteSite(id) {
      return sites.delete(id);
    },
    async adoptUnassigned(clientId) {
      for (const account of accounts.values()) if (!members.get(account.id)?.size) join(account.id, clientId, null, account.createdAt);
      for (const invitation of invitations.values()) invitation.clientId ??= clientId;
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
      for (const [hash, session] of sessions) {
        if (session.expiresAt.getTime() <= now.getTime()) {
          sessions.delete(hash);
          sessionSites.delete(hash);
        }
      }
      for (const [hash, reset] of resets) if (reset.expiresAt.getTime() <= now.getTime()) resets.delete(hash);
      for (const [id, invitation] of invitations) if (invitation.expiresAt.getTime() <= invitationsBefore.getTime()) invitations.delete(id);
      for (const [key, entry] of limits) if (entry.windowStart.getTime() <= limitsBefore.getTime()) limits.delete(key);
    },
  };
}
