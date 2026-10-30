import path from "node:path";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

/** Drizzle over the dashboard's Postgres. The store uses no relational queries, so no schema is attached. */
export type PostgresDb = NodePgDatabase;

/** One server process's way into Postgres: a pool, Drizzle over it, and ready(), which prepares the tables once. */
export type PostgresConnection = { db: PostgresDb; pool: pg.Pool; ready(): Promise<void>; close(): Promise<void> };

// Several app processes may start at once after a release: the lock lets one apply the migrations while the others wait,
// then find nothing left to do. Advisory locks belong to one database, so other databases on the server never clash.
const LOCK = "articles_ai_migrations";
const LOCK_WAIT = "30s";

/** A stable 64-bit advisory lock key for a name (Postgres hashes it; the same name is the same lock). */
export const lockKey = (name: string) => ({ text: "SELECT hashtextextended($1, 0) AS key", values: [name] });

/**
 * Connects to DATABASE_URL (postgres://user:password@host:5432/database, special characters URL-encoded).
 * `poolSize` comes from DB_POOL_MAX. `migrationsFolder` is ./drizzle in the app's working folder.
 */
export function connectPostgres(url: string, options: { poolSize?: number; migrationsFolder?: string } = {}): PostgresConnection {
  const migrationsFolder = options.migrationsFolder ?? path.join(process.cwd(), "drizzle");
  const pool = new pg.Pool({ connectionString: url, max: options.poolSize ?? 5 });
  // An idle connection the server closes (a restart, an idle timeout) reports here; without a listener the process would
  // stop. The pool drops that connection and opens a new one on the next query.
  pool.on("error", (error) => console.error("A database connection was closed by the server; a new one opens on the next query:", error.message));
  const db = drizzle(pool);
  let preparing: Promise<void> | null = null;

  async function prepare(): Promise<void> {
    const client = await pool.connect();
    try {
      const { rows } = await client.query<{ key: string }>(lockKey(LOCK));
      await client.query(`SET lock_timeout = '${LOCK_WAIT}'`);
      try {
        await client.query("SELECT pg_advisory_lock($1)", [rows[0].key]);
      } catch (error) {
        throw new Error(`Another server process kept the migration lock for ${LOCK_WAIT}.`, { cause: error });
      }
      try {
        await migrate(db, { migrationsFolder });
      } finally {
        await client.query("SELECT pg_advisory_unlock($1)", [rows[0].key]);
        await client.query("RESET lock_timeout");
      }
    } finally {
      client.release();
    }
  }

  return {
    db,
    pool,
    ready() {
      // One attempt at a time per process; a failed one is forgotten, so the next use tries again without a restart.
      preparing ??= prepare().catch((error: unknown) => {
        preparing = null;
        console.error(`The database couldn't be prepared from ${migrationsFolder}:`, error);
        throw new Error(`The database couldn't be prepared from ${migrationsFolder}.`, { cause: error });
      });
      return preparing;
    },
    close: () => pool.end(),
  };
}
