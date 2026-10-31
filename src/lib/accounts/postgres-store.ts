import { and, asc, DrizzleQueryError, eq, gt, inArray, isNull, lte, ne, sql, TransactionRollbackError, type SQL } from "drizzle-orm";
import type { PostgresConnection } from "@/lib/db/postgres";
import type { Role } from "@/lib/auth/roles";
import { clientLogos, clients, invitations, memberships, passwordResets, sessions, signInLimits, sites, userSites, users } from "@/lib/db/schema";
import type { Account, AccountStore, Client, Invitation, Membership, Site } from "./store";

/** Postgres's unique_violation (23505); Drizzle wraps query errors with the original as `cause`. */
function isDuplicate(error: unknown): boolean {
  const original = error instanceof DrizzleQueryError ? error.cause : error;
  return typeof original === "object" && original !== null && (original as { code?: unknown }).code === "23505";
}

/** The person alone, or (with their membership) the person in that client. */
const toAccount = (row: typeof users.$inferSelect, place?: { clientId: string; role: Role | null }): Account => ({
  id: row.id,
  clientId: place?.clientId ?? null,
  email: row.email,
  name: row.name,
  role: place?.role ?? null,
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

  async function member(userId: string, clientId: string): Promise<Account | null> {
    await connection.ready();
    const [row] = await db
      .select({ user: users, role: memberships.role })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.userId, userId), eq(memberships.clientId, clientId)))
      .limit(1);
    return row ? toAccount(row.user, { clientId, role: row.role ?? null }) : null;
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
    member,
    async accounts(clientId) {
      await connection.ready();
      const rows = await db
        .select({ user: users, role: memberships.role })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(eq(memberships.clientId, clientId))
        .orderBy(asc(memberships.createdAt), asc(users.id));
      return rows.map((row) => toAccount(row.user, { clientId, role: row.role ?? null }));
    },
    async memberships(userId) {
      await connection.ready();
      const rows = await db.select().from(memberships).where(eq(memberships.userId, userId)).orderBy(asc(memberships.createdAt), asc(memberships.clientId));
      return rows.map((row): Membership => ({ clientId: row.clientId, role: row.role ?? null, createdAt: row.createdAt }));
    },
    async addMember(userId, clientId, role, siteIds, at) {
      await connection.ready();
      try {
        await db.transaction(async (tx) => {
          await tx.insert(memberships).values({ userId, clientId, role, createdAt: at });
          const unique = [...new Set(siteIds ?? [])];
          if (unique.length) await tx.insert(userSites).values(unique.map((siteId) => ({ userId, clientId, siteId })));
        });
        return true;
      } catch (error) {
        if (isDuplicate(error)) return false;
        throw error;
      }
    },
    async createAccount(created) {
      await connection.ready();
      const { clientId, role, ...person } = created;
      try {
        await db.transaction(async (tx) => {
          await tx.insert(users).values(person);
          if (clientId) await tx.insert(memberships).values({ userId: created.id, clientId, role, createdAt: created.createdAt });
        });
        return true;
      } catch (error) {
        if (isDuplicate(error)) return false;
        throw error;
      }
    },
    async hasAdmin(clientId) {
      await connection.ready();
      const [row] = await db
        .select({ id: memberships.userId })
        .from(memberships)
        .where(and(eq(memberships.clientId, clientId), eq(memberships.role, "admin")))
        .limit(1);
      return Boolean(row);
    },
    async setRole(userId, clientId, role) {
      await connection.ready();
      await db.update(memberships).set({ role }).where(and(eq(memberships.userId, userId), eq(memberships.clientId, clientId)));
      return member(userId, clientId);
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
    async sessionClient(tokenHash) {
      await connection.ready();
      const [row] = await db.select({ clientId: sessions.clientId }).from(sessions).where(eq(sessions.tokenHash, tokenHash)).limit(1);
      return row?.clientId ?? null;
    },
    async setSessionClient(tokenHash, clientId) {
      await connection.ready();
      await db.update(sessions).set({ clientId }).where(eq(sessions.tokenHash, tokenHash));
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
    invitationByEmail: (email, clientId) =>
      oneInvitation(and(eq(invitations.email, email), clientId === null ? isNull(invitations.clientId) : eq(invitations.clientId, clientId))!),
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
          const [used] = await tx
            .delete(invitations)
            .where(eq(invitations.id, id))
            .returning({ siteIds: invitations.siteIds, clientId: invitations.clientId, role: invitations.role });
          if (!used) tx.rollback();
          const { clientId: _client, role: _role, ...person } = created;
          await tx.insert(users).values(person);
          if (used.clientId) {
            await tx.insert(memberships).values({ userId: created.id, clientId: used.clientId, role: used.role, createdAt: created.createdAt });
            if (used.siteIds?.length) await tx.insert(userSites).values(used.siteIds.map((siteId) => ({ userId: created.id, clientId: used.clientId, siteId })));
          }
        });
        return true;
      } catch (error) {
        if (error instanceof TransactionRollbackError || isDuplicate(error)) return false;
        throw error;
      }
    },

    async userSites(userId, clientId) {
      await connection.ready();
      const rows = await db
        .select({ siteId: userSites.siteId })
        .from(userSites)
        .where(and(eq(userSites.userId, userId), eq(userSites.clientId, clientId)))
        .orderBy(asc(userSites.siteId));
      return rows.map((row) => row.siteId);
    },
    async setUserSites(userId, clientId, siteIds) {
      await connection.ready();
      await db.transaction(async (tx) => {
        await tx.delete(userSites).where(and(eq(userSites.userId, userId), eq(userSites.clientId, clientId)));
        const unique = [...new Set(siteIds)];
        if (unique.length) await tx.insert(userSites).values(unique.map((siteId) => ({ userId, clientId, siteId })));
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
    async clientByEngineAccount(engineAccountId) {
      await connection.ready();
      const [row] = await db.select().from(clients).where(eq(clients.engineAccountId, engineAccountId)).limit(1);
      return row ?? null;
    },
    async clientBySlug(slug) {
      await connection.ready();
      const [row] = await db.select().from(clients).where(eq(clients.slug, slug)).limit(1);
      return row ?? null;
    },
    async updateClient(id, change) {
      await connection.ready();
      if (!Object.keys(change).length) return true;
      try {
        await db.update(clients).set(change).where(eq(clients.id, id));
        return true;
      } catch (error) {
        if (isDuplicate(error)) return false;
        throw error;
      }
    },
    async setClientLogo(id, logo) {
      await connection.ready();
      await db.transaction(async (tx) => {
        if (logo) {
          const row = { clientId: id, contentType: logo.contentType, data: logo.data.toString("base64"), updatedAt: logo.updatedAt };
          await tx.insert(clientLogos).values(row).onConflictDoUpdate({ target: clientLogos.clientId, set: row });
        } else {
          await tx.delete(clientLogos).where(eq(clientLogos.clientId, id));
        }
        await tx.update(clients).set({ logoAt: logo ? logo.updatedAt : null }).where(eq(clients.id, id));
      });
    },
    async clientLogo(id) {
      await connection.ready();
      const [row] = await db.select().from(clientLogos).where(eq(clientLogos.clientId, id)).limit(1);
      return row ? { contentType: row.contentType, data: Buffer.from(row.data, "base64"), updatedAt: row.updatedAt } : null;
    },
    async deleteClient(id) {
      await connection.ready();
      await db.transaction(async (tx) => {
        await tx.delete(clientLogos).where(eq(clientLogos.clientId, id));
        await tx.delete(userSites).where(eq(userSites.clientId, id));
        await tx.delete(memberships).where(eq(memberships.clientId, id));
        await tx.update(sessions).set({ clientId: null }).where(eq(sessions.clientId, id));
        // People who now work for no client are removed with their sessions and reset links.
        const alone = tx
          .select({ id: users.id })
          .from(users)
          .where(sql`NOT EXISTS (SELECT 1 FROM ${memberships} WHERE ${memberships.userId} = ${users.id})`);
        await tx.delete(sessions).where(inArray(sessions.userId, alone));
        await tx.delete(passwordResets).where(inArray(passwordResets.userId, alone));
        await tx.delete(users).where(sql`NOT EXISTS (SELECT 1 FROM ${memberships} WHERE ${memberships.userId} = ${users.id})`);
        await tx.delete(invitations).where(eq(invitations.clientId, id));
        await tx.delete(sites).where(eq(sites.clientId, id));
        await tx.delete(clients).where(eq(clients.id, id));
      });
    },
    async updateSite(id, change) {
      await connection.ready();
      if (Object.keys(change).length) await db.update(sites).set(change).where(eq(sites.id, id));
    },
    async deleteSite(id) {
      await connection.ready();
      return (await db.delete(sites).where(eq(sites.id, id)).returning({ id: sites.id })).length > 0;
    },
    async adoptUnassigned(clientId) {
      await connection.ready();
      await db.transaction(async (tx) => {
        await tx.execute(
          sql`INSERT INTO ${memberships} (user_id, client_id, role, created_at) SELECT u.id, ${clientId}, NULL, u.created_at FROM ${users} u
              WHERE NOT EXISTS (SELECT 1 FROM ${memberships} m WHERE m.user_id = u.id)`,
        );
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
      await db.delete(passwordResets).where(lte(passwordResets.expiresAt, now));
      await db.delete(invitations).where(lte(invitations.expiresAt, invitationsBefore));
      await db.delete(signInLimits).where(lte(signInLimits.windowStart, limitsBefore));
    },
  };
}
