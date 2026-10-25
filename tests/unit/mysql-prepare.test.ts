import { fileURLToPath } from "node:url";
import type { RowDataPacket } from "mysql2/promise";
import { afterEach, describe, expect, it, vi } from "vitest";
import { connectMysql, type MysqlConnection } from "@/lib/db/mysql";
import { adminQuery, dropTestDatabase, freshTestDatabase, testDatabaseName, testDatabaseUrl } from "./mysql-test-db";

// A one-table migration in Drizzle's format: these cases test preparing a database, not the dashboard's tables.
const FIXTURE = fileURLToPath(new URL("./fixtures/mysql-migrations", import.meta.url));
const open: MysqlConnection[] = [];

function connect(url: string, folder = FIXTURE): MysqlConnection {
  const connection = connectMysql(url, folder);
  open.push(connection);
  return connection;
}

async function count(connection: MysqlConnection, sql: string): Promise<number> {
  const [rows] = await connection.pool.query<RowDataPacket[]>(sql);
  return Number(rows[0]?.n);
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((connection) => connection.close()));
  vi.restoreAllMocks();
});

describe("preparing the client's MySQL (spec M5a: no shell on the server, so the app applies its own migrations)", () => {
  it("applies pending migrations before first use, once", async () => {
    const connection = connect(await freshTestDatabase("prepare_once"));
    await connection.ready();
    await connection.ready();
    expect(await count(connection, "SELECT COUNT(*) AS n FROM __drizzle_migrations")).toBe(1);
    expect(await count(connection, "SELECT COUNT(*) AS n FROM fixture_items")).toBe(0);
  });

  it("changes nothing when another process finds the database already prepared", async () => {
    const url = await freshTestDatabase("prepare_again");
    const first = connect(url);
    await first.ready();
    await first.pool.query("INSERT INTO fixture_items (id, label) VALUES ('a', 'kept')");
    const second = connect(url);
    await second.ready();
    expect(await count(second, "SELECT COUNT(*) AS n FROM __drizzle_migrations")).toBe(1);
    expect(await count(second, "SELECT COUNT(*) AS n FROM fixture_items")).toBe(1);
  });

  it("applies them once when two server processes start together (Passenger can start several)", async () => {
    const url = await freshTestDatabase("prepare_race");
    const [a, b] = [connect(url), connect(url)];
    await Promise.all([a.ready(), b.ready()]);
    expect(await count(a, "SELECT COUNT(*) AS n FROM __drizzle_migrations")).toBe(1);
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
    const sessions = await adminQuery("SELECT id FROM information_schema.processlist WHERE db = ?", [testDatabaseName("prepare_dropped")]);
    expect(sessions.length).toBeGreaterThan(0);
    for (const session of sessions) await adminQuery(`KILL ${Number(session.id)}`);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(await count(connection, "SELECT COUNT(*) AS n FROM fixture_items")).toBe(0);
  });

  it("connects with a password whose special characters are URL-encoded (Review Focus 2)", async () => {
    await freshTestDatabase("prepare_password");
    const database = testDatabaseName("prepare_password");
    const password = "p@ss:w/rd#1?&";
    await adminQuery("DROP USER IF EXISTS 'articles_ai_test_pw'@'%'");
    await adminQuery("CREATE USER 'articles_ai_test_pw'@'%' IDENTIFIED BY ?", [password]);
    await adminQuery(`GRANT ALL ON \`${database}\`.* TO 'articles_ai_test_pw'@'%'`);
    const host = new URL(testDatabaseUrl("prepare_password")).host;
    const connection = connect(`mysql://articles_ai_test_pw:${encodeURIComponent(password)}@${host}/${database}`);
    await connection.ready();
    expect(await count(connection, "SELECT COUNT(*) AS n FROM __drizzle_migrations")).toBe(1);
  });
});
