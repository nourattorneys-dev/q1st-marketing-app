import pg from "pg";

// The Postgres the tests use: TEST_DATABASE_URL, by default a local server. Each test file works in its own database,
// `<base>_<name>`, so files running in parallel never share tables.
const BASE = new URL(process.env.TEST_DATABASE_URL ?? "postgres://postgres@127.0.0.1:5432/articles_ai_test");

export function testDatabaseName(name: string): string {
  return `${BASE.pathname.slice(1) || "articles_ai_test"}_${name}`;
}

export function testDatabaseUrl(name: string): string {
  const url = new URL(BASE);
  url.pathname = `/${testDatabaseName(name)}`;
  return url.toString();
}

/** Runs one statement on the test server, in its maintenance database. */
export async function adminQuery<R extends pg.QueryResultRow = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<R[]> {
  const server = new URL(BASE);
  server.pathname = "/postgres";
  const client = new pg.Client({ connectionString: server.toString() });
  try {
    await client.connect();
  } catch (error) {
    throw new Error(`Postgres isn't reachable at ${server.host} (TEST_DATABASE_URL).`, { cause: error });
  }
  try {
    return (await client.query<R>(sql, params)).rows;
  } finally {
    await client.end();
  }
}

/** An empty database for one test file, dropped and created again. */
export async function freshTestDatabase(name: string): Promise<string> {
  const database = testDatabaseName(name);
  await adminQuery(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
  await adminQuery(`CREATE DATABASE "${database}" ENCODING 'UTF8' TEMPLATE template0`);
  return testDatabaseUrl(name);
}

export async function dropTestDatabase(name: string): Promise<void> {
  await adminQuery(`DROP DATABASE IF EXISTS "${testDatabaseName(name)}" WITH (FORCE)`);
}
