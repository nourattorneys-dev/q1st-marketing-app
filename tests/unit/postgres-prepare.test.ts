import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { connectPostgres, type PostgresConnection } from "@/lib/db/postgres";
import { adminQuery, dropTestDatabase, freshTestDatabase, testDatabaseName, testDatabaseUrl } from "./postgres-test-db";

// A one-table migration in Drizzle's format: these cases test preparing a database, not the dashboard's tables.
const FIXTURE = fileURLToPath(new URL("./fixtures/postgres-migrations", import.meta.url));
const open: PostgresConnection[] = [];

function connect(url: string, folder = FIXTURE): PostgresConnection {
  const connection = connectPostgres(url, { migrationsFolder: folder });
  open.push(connection);
  return connection;
}

async function count(connection: PostgresConnection, sql: string): Promise<number> {
  const { rows } = await connection.pool.query<{ n: string }>(sql);
  return Number(rows[0]?.n);
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((connection) => connection.close()));
  vi.restoreAllMocks();
});

describe("preparing the dashboard's Postgres (the app applies its own migrations on first use)", () => {
  it("applies pending migrations before first use, once", async () => {
    const connection = connect(await freshTestDatabase("prepare_once"));
    await connection.ready();
    await connection.ready();
    expect(await count(connection, "SELECT COUNT(*) AS n FROM drizzle.__drizzle_migrations")).toBe(1);
    expect(await count(connection, "SELECT COUNT(*) AS n FROM fixture_items")).toBe(0);
  });

  it("changes nothing when another process finds the database already prepared", async () => {
    const url = await freshTestDatabase("prepare_again");
    const first = connect(url);
    await first.ready();
    await first.pool.query("INSERT INTO fixture_items (id, label) VALUES ('a', 'kept')");
    const second = connect(url);
    await second.ready();
    expect(await count(second, "SELECT COUNT(*) AS n FROM drizzle.__drizzle_migrations")).toBe(1);
    expect(await count(second, "SELECT COUNT(*) AS n FROM fixture_items")).toBe(1);
  });

  it("applies them once when two server processes start together", async () => {
    const url = await freshTestDatabase("prepare_race");
    const [a, b] = [connect(url), connect(url)];
    await Promise.all([a.ready(), b.ready()]);
    expect(await count(a, "SELECT COUNT(*) AS n FROM drizzle.__drizzle_migrations")).toBe(1);
  });

  it("tries again on the next use after a failure, without a restart (Review Focus 3)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await dropTestDatabase("prepare_later");
    const connection = connect(testDatabaseUrl("prepare_later"));
    await expect(connection.ready()).rejects.toThrow(/couldn't be prepared/);
    await freshTestDatabase("prepare_later");
    await expect(connection.ready()).resolves.toBeUndefined();
  });

  it("names the migrations folder when a release lacks it (Review Focus 5)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const connection = connect(await freshTestDatabase("prepare_no_folder"), "/nowhere/drizzle");
    await expect(connection.ready()).rejects.toThrow("The database couldn't be prepared from /nowhere/drizzle.");
  });

  it("keeps working after the server drops its connections, as an idle timeout does (spec M5a risks)", async () => {
    const connection = connect(await freshTestDatabase("prepare_dropped"));
    await connection.ready();
    const sessions = await adminQuery<{ pid: number }>("SELECT pid FROM pg_stat_activity WHERE datname = $1", [testDatabaseName("prepare_dropped")]);
    expect(sessions.length).toBeGreaterThan(0);
    for (const session of sessions) await adminQuery("SELECT pg_terminate_backend($1)", [session.pid]);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(await count(connection, "SELECT COUNT(*) AS n FROM fixture_items")).toBe(0);
  });

  it("connects with a password whose special characters are URL-encoded (Review Focus 2)", async () => {
    await freshTestDatabase("prepare_password");
    const database = testDatabaseName("prepare_password");
    const password = "p@ss:w/rd#1?&";
    await adminQuery(`ALTER DATABASE "${database}" OWNER TO postgres`);
    await adminQuery("DROP ROLE IF EXISTS articles_ai_test_pw");
    await adminQuery(`CREATE ROLE articles_ai_test_pw LOGIN PASSWORD '${password.replace(/'/g, "''")}'`);
    await adminQuery(`ALTER DATABASE "${database}" OWNER TO articles_ai_test_pw`);
    const url = new URL(testDatabaseUrl("prepare_password"));
    url.username = "articles_ai_test_pw";
    url.password = encodeURIComponent(password);
    const connection = connect(url.toString());
    await connection.ready();
    expect(await count(connection, "SELECT COUNT(*) AS n FROM drizzle.__drizzle_migrations")).toBe(1);
  });
});
