import path from "node:path";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql, { type Pool, type RowDataPacket } from "mysql2/promise";

/** Drizzle over the client's MySQL (spec M5a). The store uses no relational queries, so no schema is attached. */
export type MysqlDb = MySql2Database;

/** One server process's way into MySQL: a pool, Drizzle over it, and ready(), which prepares the tables once. */
export type MysqlConnection = { db: MysqlDb; pool: Pool; ready(): Promise<void>; close(): Promise<void> };

// Passenger may start several processes at once after an upload: the lock lets one apply the migrations while the
// others wait, then find nothing left to do.
const LOCK = "articles_ai_migrations";
const LOCK_WAIT_SECONDS = 30;

/**
 * Connects to DATABASE_URL (mysql://user:password@host:3306/database, special characters URL-encoded).
 * At most 3 connections: the cPanel account shares MySQL and its process limits with WordPress.
 * `migrationsFolder` is ./drizzle in the app's working folder: the repo locally, the release folder on cPanel.
 */
export function connectMysql(url: string, migrationsFolder = path.join(process.cwd(), "drizzle")): MysqlConnection {
  const pool = mysql.createPool({ uri: url, connectionLimit: 3, enableKeepAlive: true, timezone: "Z", charset: "utf8mb4" });
  const db = drizzle(pool, { mode: "default" });
  let preparing: Promise<void> | null = null;

  async function prepare(): Promise<void> {
    const connection = await pool.getConnection();
    try {
      const [rows] = await connection.query<RowDataPacket[]>("SELECT GET_LOCK(?, ?) AS got", [LOCK, LOCK_WAIT_SECONDS]);
      if (rows[0]?.got !== 1) throw new Error(`Another server process kept the migration lock for ${LOCK_WAIT_SECONDS} s.`);
      try {
        await migrate(db, { migrationsFolder });
      } finally {
        await connection.query("SELECT RELEASE_LOCK(?)", [LOCK]);
      }
    } finally {
      connection.release();
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
