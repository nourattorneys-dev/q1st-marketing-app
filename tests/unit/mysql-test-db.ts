import mysql, { type Connection, type RowDataPacket } from "mysql2/promise";

// The MySQL the tests use (spec M5a): TEST_DATABASE_URL, by default this Mac's Homebrew mysql@8.4. Each test file
// works in its own database, `<base>_<name>`, so files running in parallel never share tables.
const BASE = new URL(process.env.TEST_DATABASE_URL ?? "mysql://root@127.0.0.1:3306/articles_ai_test");

export function testDatabaseName(name: string): string {
  return `${BASE.pathname.slice(1) || "articles_ai_test"}_${name}`;
}

export function testDatabaseUrl(name: string): string {
  const url = new URL(BASE);
  url.pathname = `/${testDatabaseName(name)}`;
  return url.toString();
}

/** Runs one statement on the test server, outside any database. */
export async function adminQuery(sql: string, params: unknown[] = []): Promise<RowDataPacket[]> {
  const server = new URL(BASE);
  server.pathname = "/";
  let connection: Connection;
  try {
    connection = await mysql.createConnection({ uri: server.toString() });
  } catch (error) {
    throw new Error(`MySQL isn't reachable at ${server.host} (TEST_DATABASE_URL). Start it with: brew services start mysql@8.4`, { cause: error });
  }
  try {
    const [rows] = await connection.query(sql, params);
    return rows as RowDataPacket[];
  } finally {
    await connection.end();
  }
}

/** An empty database for one test file, dropped and created again; `charset` copies a host whose default isn't utf8mb4. */
export async function freshTestDatabase(name: string, options: { charset?: "utf8mb4" | "latin1" } = {}): Promise<string> {
  const database = testDatabaseName(name);
  await adminQuery(`DROP DATABASE IF EXISTS \`${database}\``);
  await adminQuery(`CREATE DATABASE \`${database}\` CHARACTER SET ${options.charset ?? "utf8mb4"}`);
  return testDatabaseUrl(name);
}

export async function dropTestDatabase(name: string): Promise<void> {
  await adminQuery(`DROP DATABASE IF EXISTS \`${testDatabaseName(name)}\``);
}
