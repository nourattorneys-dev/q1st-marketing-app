import { and, asc, DrizzleQueryError, eq, gt, lte, ne, sql, TransactionRollbackError, type SQL } from "drizzle-orm";
import type { MysqlConnection } from "@/lib/db/mysql";
import { invitations, passwordResets, sessions, signInLimits, users } from "@/lib/db/schema";
import type { Account, AccountStore, Invitation } from "./store";

/** MySQL's "Duplicate entry" (1062), as mysql2 reports it; Drizzle wraps query errors with the original as `cause`. */
function isDuplicate(error: unknown): boolean {
  const original = error instanceof DrizzleQueryError ? error.cause : error;
  return typeof original === "object" && original !== null && (original as { code?: unknown }).code === "ER_DUP_ENTRY";
}

const toAccount = (row: typeof users.$inferSelect): Account => ({
  id: row.id,
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
  email: row.email,
  role: row.role,
  tokenHash: row.tokenHash,
  invitedBy: row.invitedBy ?? null,
  createdAt: row.createdAt,
  expiresAt: row.expiresAt,
});

/** DB_MODE=mysql (spec M5c): the accounts in the client's MySQL. Every call first makes sure the tables are prepared. */
export function createMysqlAccountStore(connection: Pick<MysqlConnection, "db" | "ready">): AccountStore {
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
    async accounts() {
      await connection.ready();
      return (await db.select().from(users).orderBy(asc(users.createdAt), asc(users.id))).map(toAccount);
    },
    async hasAdmin() {
      await connection.ready();
      const [row] = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin")).limit(1);
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

    async invitations() {
      await connection.ready();
      return (await db.select().from(invitations).orderBy(asc(invitations.createdAt), asc(invitations.id))).map(toInvitation);
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
      const [header] = await db.update(invitations).set(renewal).where(eq(invitations.id, id));
      return header.affectedRows > 0;
    },
    async deleteInvitation(id) {
      await connection.ready();
      const [header] = await db.delete(invitations).where(eq(invitations.id, id));
      return header.affectedRows > 0;
    },
    async acceptInvitation(id, created) {
      await connection.ready();
      try {
        // One transaction: the invitation is used up exactly when the account appears.
        await db.transaction(async (tx) => {
          const [header] = await tx.delete(invitations).where(eq(invitations.id, id));
          if (header.affectedRows === 0) tx.rollback();
          await tx.insert(users).values(created);
        });
        return true;
      } catch (error) {
        if (error instanceof TransactionRollbackError || isDuplicate(error)) return false;
        throw error;
      }
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
      // One statement: a window that has passed starts again at 1. MySQL applies the SET list left to right, so the
      // count reads window_start before it changes.
      await db
        .insert(signInLimits)
        .values({ key, count: 1, windowStart: now })
        .onDuplicateKeyUpdate({
          set: {
            count: sql`IF(${signInLimits.windowStart} <= ${cutoff}, 1, ${signInLimits.count} + 1)`,
            windowStart: sql`IF(${signInLimits.windowStart} <= ${cutoff}, ${now}, ${signInLimits.windowStart})`,
          },
        });
      const [row] = await db.select({ count: signInLimits.count }).from(signInLimits).where(eq(signInLimits.key, key)).limit(1);
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
