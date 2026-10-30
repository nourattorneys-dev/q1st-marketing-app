import { and, asc, DrizzleQueryError, eq, gt, isNull, lte, ne, sql, TransactionRollbackError, type SQL } from "drizzle-orm";
import type { PostgresConnection } from "@/lib/db/postgres";
import { clients, invitations, passwordResets, sessions, signInLimits, sites, userSites, users } from "@/lib/db/schema";
import type { Account, AccountStore, Client, Invitation, Site } from "./store";

/** Postgres's unique_violation (23505); Drizzle wraps query errors with the original as `cause`. */
function isDuplicate(error: unknown): boolean {
  const original = error instanceof DrizzleQueryError ? error.cause : error;
  return typeof original === "object" && original !== null && (original as { code?: unknown }).code === "23505";
}

const toAccount = (row: typeof users.$inferSelect): Account => ({
  id: row.id,
  clientId: row.clientId ?? null,
  email: row.email,
  name: row.name,
  role: row.role ?? null,
  passwordHash: row.passwordHash,
  createdAt: row.createdAt,
  passwordChangedAt: row.passwordChangedAt,
  lastSignInAt: row.lastSignInAt ?? null,
});

const toInvitation = (row: typeof invitations.$inferSelect): Invitation => ({
  id: row.id,
  clientId: row.clientId ?? null,
  siteIds: row.siteIds ?? null,
  email: row.email,
  role: row.role,
  tokenHash: row.tokenHash,
  invitedBy: row.invitedBy ?? null,
  createdAt: row.createdAt,
  expiresAt: row.expiresAt,
});

/** DB_MODE=postgres: the accounts in the dashboard's Postgres. Every call first makes sure the tables are prepared. */
export function createPostgresAccountStore(connection: Pick<PostgresConnection, "db" | "ready">): AccountStore {
  const { db } = connection;

  async function account(id: string): Promise<Account | null> {
    await connection.ready();
    const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return row ? toAccount(row) : null;
  }

  async function oneInvitation(where: SQL): Promise<Invitation | null> {
    await connection.ready();
    const [row] = await db.select().from(invitations).where(where).limit(1);
    return row ? toInvitation(row) : null;
  }

  return {
    account,
    async accountByEmail(email) {
      await connection.ready();
      const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      return row ? toAccount(row) : null;
    },
    async accounts(clientId) {
      await connection.ready();
      return (await db.select().from(users).where(eq(users.clientId, clientId)).orderBy(asc(users.createdAt), asc(users.id))).map(toAccount);
    },
    async hasAdmin(clientId) {
      await connection.ready();
      const [row] = await db.select({ id: users.id }).from(users).where(and(eq(users.clientId, clientId), eq(users.role, "admin"))).limit(1);
      return Boolean(row);
    },
    async createAccount(created) {
      await connection.ready();
      try {
        await db.insert(users).values(created);
        return true;
      } catch (error) {
        if (isDuplicate(error)) return false;
        throw error;
      }
    },
    async setRole(id, role) {
      await connection.ready();
      await db.update(users).set({ role }).where(eq(users.id, id));
      return account(id);
    },
    async setPassword(id, passwordHash, at) {
      await connection.ready();
      await db.update(users).set({ passwordHash, passwordChangedAt: at }).where(eq(users.id, id));
    },
    async recordSignIn(id, at) {
      await connection.ready();
      await db.update(users).set({ lastSignInAt: at }).where(eq(users.id, id));
    },

    async createSession(session) {
      await connection.ready();
      await db.insert(sessions).values(session);
    },
    async sessionAccount(tokenHash, now) {
      await connection.ready();
      const [row] = await db
        .select({ user: users })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)))
        .limit(1);
      return row ? toAccount(row.user) : null;
    },
    async deleteSession(tokenHash) {
      await connection.ready();
      await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
    },
    async deleteSessionsOf(userId, except) {
      await connection.ready();
      await db.delete(sessions).where(except ? and(eq(sessions.userId, userId), ne(sessions.tokenHash, except)) : eq(sessions.userId, userId));
    },

    async sessionSite(tokenHash) {
      await connection.ready();
      const [row] = await db.select({ siteId: sessions.siteId }).from(sessions).where(eq(sessions.tokenHash, tokenHash)).limit(1);
      return row?.siteId ?? null;
    },
    async setSessionSite(tokenHash, siteId) {
      await connection.ready();
      await db.update(sessions).set({ siteId }).where(eq(sessions.tokenHash, tokenHash));
    },

    async invitations(clientId) {
      await connection.ready();
      return (
        await db.select().from(invitations).where(eq(invitations.clientId, clientId)).orderBy(asc(invitations.createdAt), asc(invitations.id))
      ).map(toInvitation);
    },
    invitation: (id) => oneInvitation(eq(invitations.id, id)),
    invitationByEmail: (email) => oneInvitation(eq(invitations.email, email)),
    invitationByToken: (tokenHash) => oneInvitation(eq(invitations.tokenHash, tokenHash)),
    async addInvitation(invitation) {
      await connection.ready();
      try {
        await db.insert(invitations).values(invitation);
        return true;
      } catch (error) {
        if (isDuplicate(error)) return false;
        throw error;
      }
    },
    async renewInvitation(id, renewal) {
      await connection.ready();
      const result = await db.update(invitations).set(renewal).where(eq(invitations.id, id));
      return (result.rowCount ?? 0) > 0;
    },
    async deleteInvitation(id) {
      await connection.ready();
      const result = await db.delete(invitations).where(eq(invitations.id, id));
      return (result.rowCount ?? 0) > 0;
    },
    async acceptInvitation(id, created) {
      await connection.ready();
      try {
        // One transaction: the invitation is used up exactly when the account appears.
        await db.transaction(async (tx) => {
          const [used] = await tx.delete(invitations).where(eq(invitations.id, id)).returning({ siteIds: invitations.siteIds });
          if (!used) tx.rollback();
          await tx.insert(users).values(created);
          if (used.siteIds?.length) await tx.insert(userSites).values(used.siteIds.map((siteId) => ({ userId: created.id, siteId })));
        });
        return true;
      } catch (error) {
        if (error instanceof TransactionRollbackError || isDuplicate(error)) return false;
        throw error;
      }
    },

    async userSites(userId) {
      await connection.ready();
      return (await db.select({ siteId: userSites.siteId }).from(userSites).where(eq(userSites.userId, userId)).orderBy(asc(userSites.siteId))).map(
        (row) => row.siteId,
      );
    },
    async setUserSites(userId, siteIds) {
      await connection.ready();
      await db.transaction(async (tx) => {
        await tx.delete(userSites).where(eq(userSites.userId, userId));
        const unique = [...new Set(siteIds)];
        if (unique.length) await tx.insert(userSites).values(unique.map((siteId) => ({ userId, siteId })));
      });
    },
    async clients() {
      await connection.ready();
      return (await db.select().from(clients).orderBy(asc(clients.createdAt), asc(clients.id))) as Client[];
    },
    async client(id) {
      await connection.ready();
      const [row] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
      return row ?? null;
    },
    async createClient(client) {
      await connection.ready();
      await db.insert(clients).values(client);
    },
    async sites(clientId) {
      await connection.ready();
      const query = db.select().from(sites);
      return (await (clientId === undefined ? query : query.where(eq(sites.clientId, clientId))).orderBy(asc(sites.createdAt), asc(sites.id))) as Site[];
    },
    async site(id) {
      await connection.ready();
      const [row] = await db.select().from(sites).where(eq(sites.id, id)).limit(1);
      return row ?? null;
    },
    async createSite(site) {
      await connection.ready();
      await db.insert(sites).values(site);
    },
    async adoptUnassigned(clientId) {
      await connection.ready();
      await db.transaction(async (tx) => {
        await tx.update(users).set({ clientId }).where(isNull(users.clientId));
        await tx.update(invitations).set({ clientId }).where(isNull(invitations.clientId));
      });
    },

    async createReset(reset) {
      await connection.ready();
      await db.insert(passwordResets).values(reset);
    },
    async resetByToken(tokenHash) {
      await connection.ready();
      const [row] = await db.select().from(passwordResets).where(eq(passwordResets.tokenHash, tokenHash)).limit(1);
      return row ?? null;
    },
    async deleteResetsOf(userId) {
      await connection.ready();
      await db.delete(passwordResets).where(eq(passwordResets.userId, userId));
    },

    async hit(key, now, windowMs) {
      await connection.ready();
      const cutoff = new Date(now.getTime() - windowMs);
      // One statement: a window that has passed starts again at 1. In Postgres every expression in SET reads the row
      // as it was before the update, so the count and the window are judged on the same old window_start.
      const [row] = await db
        .insert(signInLimits)
        .values({ key, count: 1, windowStart: now })
        .onConflictDoUpdate({
          target: signInLimits.key,
          set: {
            count: sql`CASE WHEN ${signInLimits.windowStart} <= ${cutoff} THEN 1 ELSE ${signInLimits.count} + 1 END`,
            windowStart: sql`CASE WHEN ${signInLimits.windowStart} <= ${cutoff} THEN ${now} ELSE ${signInLimits.windowStart} END`,
          },
        })
        .returning({ count: signInLimits.count });
      return row?.count ?? 1;
    },
    async hits(key, now, windowMs) {
      await connection.ready();
      const [row] = await db.select().from(signInLimits).where(eq(signInLimits.key, key)).limit(1);
      return row && row.windowStart.getTime() > now.getTime() - windowMs ? row.count : 0;
    },
    async clearHits(key) {
      await connection.ready();
      await db.delete(signInLimits).where(eq(signInLimits.key, key));
    },

    async forgetExpired({ now, invitationsBefore, limitsBefore }) {
      await connection.ready();
      await db.delete(sessions).where(lte(sessions.expiresAt, now));
      // A site removed from the app takes its access rows with it (P1b).
      await db.delete(userSites).where(sql`${userSites.siteId} NOT IN (SELECT ${sites.id} FROM ${sites})`);
      await db.delete(passwordResets).where(lte(passwordResets.expiresAt, now));
      await db.delete(invitations).where(lte(invitations.expiresAt, invitationsBefore));
      await db.delete(signInLimits).where(lte(signInLimits.windowStart, limitsBefore));
    },
  };
}
