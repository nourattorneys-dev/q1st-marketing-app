# M5a: the dashboard's own database (Neon → the client's MySQL) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The dashboard keeps its small database in the client's MySQL 8 (on cPanel for Fakher & Co) instead of Neon, creating its own tables on first use, with nothing left that needs Neon or Vercel.

**Architecture:**
- `AppStore` (12 methods) keeps its interface. `createMysqlStore` replaces `createNeonStore`.
- `connectMysql` owns the pool (3 connections, UTC, utf8mb4). Its `ready()` applies Drizzle migrations once per process, under the MySQL lock `articles_ai_migrations`, and retries after a failure.
- `DB_MODE` becomes `memory|mysql`. Memory is refused on production servers.
- The cPanel build ships the `drizzle/` folder, and `mysql2` stays an external package in the standalone server.

**Tech Stack:**
- Next.js 16.4 (standalone build for cPanel), TypeScript 5, Zod 4.6
- Drizzle ORM 0.45.4 (`drizzle-orm/mysql2`, `mysql-core`, `mysql2/migrator`), drizzle-kit 0.31.11
- **mysql2 3.24.6 (new)**
- Vitest, Playwright, pnpm 10
- Local MySQL 8.4 (Homebrew); the server runs MySQL 8.0.46

**Spec:** `docs/specs/2026-10-25-m5a-own-database-design.md`

## Global Constraints

**Packages and compatibility**
- New package: `mysql2` **3.24.6**, pinned exactly, like every other dependency. Remove `@neondatabase/serverless`. No other package changes.
- MySQL 8.0 compatible (the server is `8.0.46-cll-lve`): use only JSON, `datetime(3)`, `GET_LOCK`/`RELEASE_LOCK`, `INSERT IGNORE` and `ON DUPLICATE KEY UPDATE`. Nothing 8.4-only.

**Database rules**
- Pool: at most **3** connections, `enableKeepAlive: true`, `timezone: "Z"`, `charset: "utf8mb4"`.
- Every table is `ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`, whatever the database's default.
- Column lengths:
  - key columns (`id`, `event_id`, `user_id`) are `varchar(191)`
  - `email` is `varchar(255)`
  - `kind` and `audience` are `varchar(64)`
  - `event`, `url` and `secret_cipher` are `text`
  - an id longer than 191 or an email longer than 255 is refused before the insert, never cut
- Migration lock name: `articles_ai_migrations`, waiting up to 30 s.
- `DB_MODE` accepts `memory` or `mysql`.
  - `neon` fails with a message naming `DB_MODE=mysql`.
  - `mysql` needs `DATABASE_URL` starting `mysql://`.
  - `memory` is refused when `NODE_ENV=production` unless `ALLOW_TEST_LOGINS=1`.
- Test database: `TEST_DATABASE_URL`, default `mysql://root@127.0.0.1:3306/articles_ai_test`. Each test file uses its own database, `articles_ai_test_<name>`. If MySQL isn't reachable, fail with `brew services start mysql@8.4` in the message; never skip.

**Copy and secrets**
- Copy rule: Fakher & Co is a "legal consultancy", never a "law firm".
- Secrets never go in git, chat or a build. `.env*` files stay git-ignored.

**How to work**
- Commit only after lint passes: `RC=0; pnpm lint >/dev/null 2>&1 || RC=$?; if [ $RC -eq 0 ]; then git commit …; fi`. Never chain a commit after checks with `;`.
- Next 16.4 gotcha: `next build` type-checks test files, so any build or e2e run must happen when every test file's imports exist.

## Review Focus

1. **A database whose default charset is latin1:** a cPanel MySQL may be set up that way. The tables must still be utf8mb4, with Arabic intact. Test: Task 2, "creates utf8mb4 tables even where the database defaults to latin1".
2. **A `DATABASE_URL` password with special characters:** cPanel's password generator uses them. URL-encoded, it must connect. Test: Task 1, "connects with a password whose special characters are URL-encoded".
3. **The database missing or unreachable at first use, then fixed:** the next request must work without restarting the app. Test: Task 1, "tries again on the next use after a failure, without a restart".
4. **An email at the RFC maximum (254 characters), or an engine id longer than its column:** the email is kept, and the over-long value is refused with an error rather than cut by `INSERT IGNORE`. Tests: Task 2, "keeps an email of 254 characters…" and "refuses an id longer than its column…".
5. **A release missing its `drizzle/` folder:** the error must name the folder, not just say "Can't find meta/_journal.json file". Tests: Task 1, "names the migrations folder when a release lacks it", and Task 4's standalone smoke run.

---

## File map

| File | Task | Responsibility |
|---|---|---|
| `package.json`, `pnpm-lock.yaml` | 1, 2 | add `mysql2` 3.24.6 (Task 1); remove `@neondatabase/serverless` (Task 2) |
| `src/lib/db/mysql.ts` (new) | 1 | `connectMysql(url, migrationsFolder?)`: the pool, Drizzle over it, `ready()` (migrations under a lock, retried after failure), `close()` |
| `tests/unit/mysql-test-db.ts` (new) | 1 | test helper: per-file test databases on the local MySQL |
| `tests/unit/fixtures/mysql-migrations/` (new) | 1 | a one-table migration in Drizzle's format |
| `tests/unit/mysql-prepare.test.ts` (new) | 1 | preparing a database: once, again, at the same time, after failure, missing folder, dropped connections, encoded password |
| `src/lib/db/schema.ts` | 2 | the five tables in `mysql-core` |
| `drizzle.config.ts` | 2 | `dialect: "mysql"` |
| `drizzle/` | 2 | a fresh MySQL baseline migration (the Postgres ones removed) |
| `src/lib/db/mysql-store.ts` (new) | 2 | `queries`, `createMysqlStore`, `MAX_KEY_LENGTH`, `MAX_EMAIL_LENGTH` |
| `src/lib/db/index.ts` | 2 | `getStore()`: MySQL when not memory |
| `src/lib/db/store.ts` | 2 | doc comment |
| `src/lib/db/neon-store.ts`, `tests/unit/neon-store.test.ts` | 2 | deleted |
| `tests/unit/store.test.ts` | 2 | the same cases against both stores |
| `tests/unit/mysql-store.test.ts` (new) | 2 | MySQL SQL and real-database cases |
| `src/lib/services-env.ts` | 3 | `DB_MODE=memory\|mysql` rules |
| `src/lib/webhooks/secret.ts` | 3 | `dbMode: "memory" \| "mysql"` |
| `src/lib/db/memory-store.ts` | 3 | doc comment |
| `.env.example` | 3 | database settings text |
| `tests/unit/services-env.test.ts`, `webhooks.test.ts`, `webhook-settings.test.ts` | 3 | neon → mysql |
| `next.config.ts` | 4 | `serverExternalPackages: ["mysql2"]` |
| `scripts/cpanel-build.sh` | 4 | copy `drizzle/` into the release and check it's there |
| `README.md` | 4 | database section, cPanel MySQL step, "Decisions in M5a" |

---

### Task 1: The MySQL connection and its migration runner

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml` (add `mysql2`)
- Create: `src/lib/db/mysql.ts`
- Create: `tests/unit/mysql-test-db.ts`
- Create: `tests/unit/fixtures/mysql-migrations/meta/_journal.json`, `tests/unit/fixtures/mysql-migrations/0000_fixture.sql`
- Test: `tests/unit/mysql-prepare.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  - `type MysqlDb = MySql2Database` (from `drizzle-orm/mysql2`, no schema attached)
  - `type MysqlConnection = { db: MysqlDb; pool: Pool; ready(): Promise<void>; close(): Promise<void> }`
  - `connectMysql(url: string, migrationsFolder?: string): MysqlConnection`. The default folder is `path.join(process.cwd(), "drizzle")`.
  - `ready()` rejects with `Error("The database couldn't be prepared from <folder>.")`, with the cause attached.
  - Test helpers in `tests/unit/mysql-test-db.ts`: `testDatabaseName(name)`, `testDatabaseUrl(name)`, `adminQuery(sql, params?)`, `freshTestDatabase(name, { charset? })`, `dropTestDatabase(name)`

- [ ] **Step 1: Add mysql2, pinned exactly**

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
pnpm add --save-exact mysql2@3.24.6
grep -n '"mysql2"' package.json
```

Expected: `"mysql2": "3.24.6",`, with no caret.

- [ ] **Step 2: Write the test helper**

Create `tests/unit/mysql-test-db.ts`:

```ts
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
```

- [ ] **Step 3: Write the fixture migration (Drizzle's format)**

Create `tests/unit/fixtures/mysql-migrations/meta/_journal.json`:

```json
{
  "version": "7",
  "dialect": "mysql",
  "entries": [{ "idx": 0, "version": "5", "when": 1792900000000, "tag": "0000_fixture", "breakpoints": true }]
}
```

Create `tests/unit/fixtures/mysql-migrations/0000_fixture.sql` with exactly this content:

```sql
CREATE TABLE `fixture_items` (
	`id` varchar(191) NOT NULL,
	`label` text NOT NULL,
	CONSTRAINT `fixture_items_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

- [ ] **Step 4: Write the failing tests**

Create `tests/unit/mysql-prepare.test.ts`:

```ts
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
```

- [ ] **Step 5: Run the tests and watch them fail**

Run: `pnpm vitest run tests/unit/mysql-prepare.test.ts`
Expected: FAIL. The import `@/lib/db/mysql` can't be resolved, because the module doesn't exist yet.

- [ ] **Step 6: Write the connection module**

Create `src/lib/db/mysql.ts`:

```ts
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
```

- [ ] **Step 7: Run the tests and watch them pass**

Run: `pnpm vitest run tests/unit/mysql-prepare.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 8: Check types and lint, then commit**

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
RC=0; pnpm typecheck >/dev/null 2>&1 || RC=$?; pnpm lint >/dev/null 2>&1 || RC=$?
if [ $RC -eq 0 ]; then
  git add package.json pnpm-lock.yaml src/lib/db/mysql.ts tests/unit/mysql-test-db.ts tests/unit/fixtures tests/unit/mysql-prepare.test.ts
  git commit -m "feat(db): connect to the client's MySQL and apply migrations on first use, under a lock (M5a)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
else echo "checks failed: RC=$RC"; fi
```

---

### Task 2: The MySQL store replaces the Neon store

**Files:**
- Modify: `src/lib/db/schema.ts` (full replacement)
- Modify: `drizzle.config.ts` (full replacement)
- Replace: `drizzle/` (delete the Postgres migrations and `drizzle/meta/`; generate a MySQL baseline)
- Create: `src/lib/db/mysql-store.ts`
- Modify: `src/lib/db/index.ts` (full replacement), `src/lib/db/store.ts:9`
- Delete: `src/lib/db/neon-store.ts`, `tests/unit/neon-store.test.ts`
- Modify: `package.json`, `pnpm-lock.yaml` (remove `@neondatabase/serverless`)
- Test: `tests/unit/store.test.ts` (full replacement), `tests/unit/mysql-store.test.ts` (new)

**Interfaces:**
- Consumes (Task 1):
  - `connectMysql`, `MysqlConnection`, `MysqlDb` from `@/lib/db/mysql`
  - `freshTestDatabase` from `./mysql-test-db`
- Produces:
  - `createMysqlStore(connection: Pick<MysqlConnection, "db" | "ready">): AppStore`
  - `queries` (same keys as the Neon store's)
  - `MAX_KEY_LENGTH = 191`, `MAX_EMAIL_LENGTH = 255`
  - `getStore()` returns the MySQL store whenever `dbMode` isn't `"memory"`. Until Task 3 the setting is still named `neon`; Task 3 renames it to `mysql`.

- [ ] **Step 1: Write the failing tests: one set of store cases for both stores**

Replace `tests/unit/store.test.ts` with:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMemoryStore } from "@/lib/db/memory-store";
import { connectMysql, type MysqlConnection } from "@/lib/db/mysql";
import { createMysqlStore } from "@/lib/db/mysql-store";
import type { AppStore } from "@/lib/db/store";
import { freshTestDatabase } from "./mysql-test-db";

const at = (minute: number) => new Date(Date.UTC(2026, 9, 22, 8, minute));
const drafted = (eventId: string, minute: number) => ({
  eventId,
  kind: "drafted",
  audience: "reviewers" as const,
  data: { postId: `p_${eventId}` },
  createdAt: at(minute),
});

const TABLES = ["webhook_events", "webhook_config", "notifications", "notification_deliveries", "notification_prefs"];
let mysql: MysqlConnection;

beforeAll(async () => {
  mysql = connectMysql(await freshTestDatabase("store"));
  await mysql.ready();
});

afterAll(async () => {
  await mysql?.close();
});

/** A MySQL store over emptied tables, so each case starts clean, as a new in-memory store does. */
async function emptyMysqlStore(): Promise<AppStore> {
  for (const table of TABLES) await mysql.pool.query(`DELETE FROM \`${table}\``);
  return createMysqlStore(mysql);
}

describe.each([
  { name: "the in-memory store (DB_MODE=memory)", createStore: async (): Promise<AppStore> => createMemoryStore() },
  { name: "the MySQL store (DB_MODE=mysql)", createStore: emptyMysqlStore },
])("$name", ({ createStore }) => {
  it("remembers a delivery once, with its notification, however often it's recorded (spec v1.1 §8: deliveries are retried)", async () => {
    const store = await createStore();
    expect(await store.hasEvent("evt_1")).toBe(false);
    await store.recordEvent({ id: "evt_1", event: "post.drafted", receivedAt: at(0) }, drafted("evt_1", 0));
    await store.recordEvent({ id: "evt_1", event: "post.drafted", receivedAt: at(5) }, { ...drafted("evt_1", 5), data: { postId: "other" } });
    expect(await store.hasEvent("evt_1")).toBe(true);
    expect(await store.pendingNotifications()).toEqual([drafted("evt_1", 0)]);
    expect(await store.lastEventAt()).toEqual(at(0));
  });

  it("lists pending notifications oldest first and marks them sent once", async () => {
    const store = await createStore();
    await store.recordEvent({ id: "evt_2", event: "post.drafted", receivedAt: at(2) }, drafted("evt_2", 2));
    await store.recordEvent({ id: "evt_1", event: "post.drafted", receivedAt: at(1) }, drafted("evt_1", 1));
    await store.recordEvent({ id: "evt_3", event: "post.published", receivedAt: at(3) }, null);
    expect((await store.pendingNotifications()).map((item) => item.eventId)).toEqual(["evt_1", "evt_2"]);
    await store.markSent(["evt_1"], ["reviewer@example.com"], at(4));
    expect((await store.pendingNotifications()).map((item) => item.eventId)).toEqual(["evt_2"]);
    expect(await store.lastEventAt()).toEqual(at(3));
  });

  it("forgets deliveries and sent notifications older than the cutoff, but never an unsent one", async () => {
    const store = await createStore();
    await store.recordEvent({ id: "evt_old", event: "post.drafted", receivedAt: at(0) }, drafted("evt_old", 0));
    await store.recordEvent({ id: "evt_sent", event: "post.drafted", receivedAt: at(1) }, drafted("evt_sent", 1));
    await store.markSent(["evt_sent"], [], at(2));
    await store.forgetBefore(at(10));
    expect(await store.hasEvent("evt_old")).toBe(false);
    expect((await store.pendingNotifications()).map((item) => item.eventId)).toEqual(["evt_old"]);
  });

  it("keeps one webhook registration and each person's email choice", async () => {
    const store = await createStore();
    expect(await store.webhook()).toBeNull();
    await store.saveWebhook({ url: "https://portal.example/api/hooks/marketing", secretCipher: "v1:a", updatedAt: at(0) });
    await store.saveWebhook({ url: "https://portal.example/api/hooks/marketing", secretCipher: "v1:b", updatedAt: at(1) });
    expect(await store.webhook()).toEqual({ url: "https://portal.example/api/hooks/marketing", secretCipher: "v1:b", updatedAt: at(1) });
    await store.setEmailOff("user_1", true, at(0));
    await store.setEmailOff("user_2", true, at(0));
    await store.setEmailOff("user_2", false, at(1));
    expect([...(await store.emailOffUsers())]).toEqual(["user_1"]);
  });

  it("records who got which notification, once each (final review: no one is emailed twice)", async () => {
    const store = await createStore();
    expect(await store.deliveries(["evt_1"])).toEqual(new Map());
    await store.recordDelivery(["evt_1", "evt_2"], "a@example.com", at(1));
    await store.recordDelivery(["evt_1"], "b@example.com", at(2));
    await store.recordDelivery(["evt_1"], "a@example.com", at(3));
    expect(await store.deliveries(["evt_1", "evt_2", "evt_3"])).toEqual(
      new Map([
        ["evt_1", new Set(["a@example.com", "b@example.com"])],
        ["evt_2", new Set(["a@example.com"])],
      ]),
    );
    await store.forgetBefore(at(2));
    expect(await store.deliveries(["evt_1", "evt_2"])).toEqual(new Map([["evt_1", new Set(["b@example.com"])]]));
  });
});
```

Create `tests/unit/mysql-store.test.ts`:

```ts
import type { RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectMysql, type MysqlConnection } from "@/lib/db/mysql";
import { createMysqlStore, MAX_EMAIL_LENGTH, MAX_KEY_LENGTH, queries } from "@/lib/db/mysql-store";
import { freshTestDatabase } from "./mysql-test-db";

const AT = new Date("2026-10-22T08:00:00.123Z");

describe("the MySQL store's SQL (DB_MODE=mysql)", () => {
  // toSQL() only builds the statement: this pool never connects.
  const { db } = connectMysql("mysql://nobody@127.0.0.1:1/never");

  it("records a delivery, its notification and who got it with INSERT IGNORE, so a retry changes nothing", () => {
    const notification = queries.insertNotification(db, { eventId: "evt_1", kind: "drafted", audience: "reviewers", data: { postId: "p_1" }, createdAt: AT });
    expect(notification.toSQL().sql).toMatch(/^insert ignore into `notifications`/);
    expect(queries.insertEvent(db, { id: "evt_1", event: "post.drafted", receivedAt: AT }).toSQL().sql).toMatch(/^insert ignore into `webhook_events`/);
    expect(queries.recordDelivery(db, ["evt_1"], "a@example.com", AT).toSQL().sql).toMatch(/^insert ignore into `notification_deliveries`/);
  });

  it("keeps one webhook row and one preference row per person, updating them in place", () => {
    expect(queries.saveWebhook(db, { url: "https://p.example/api/hooks/marketing", secretCipher: "v1:x", updatedAt: AT }).toSQL().sql).toMatch(/on duplicate key update/);
    expect(queries.setEmailOff(db, "user_1", true, AT).toSQL().sql).toMatch(/on duplicate key update/);
  });

  it("marks only unsent notifications sent, and forgets only sent ones", () => {
    expect(queries.markSent(db, ["evt_1"], [], AT).toSQL().sql).toMatch(/`sent_at` is null/);
    const forget = queries.forgetSent(db, AT).toSQL().sql;
    expect(forget).toMatch(/`sent_at` is not null/);
    expect(forget).toMatch(/`sent_at` < \?/);
  });
});

describe("the MySQL store on a real database", () => {
  let connection: MysqlConnection;

  beforeAll(async () => {
    // A host whose databases default to latin1: the tables must still be utf8mb4 (Review Focus 1).
    connection = connectMysql(await freshTestDatabase("mysql_store", { charset: "latin1" }));
    await connection.ready();
  });

  afterAll(async () => {
    await connection?.close();
  });

  it("creates utf8mb4 tables even where the database defaults to latin1 (Review Focus 1)", async () => {
    const [tables] = await connection.pool.query<RowDataPacket[]>(
      "SELECT table_name AS name, table_collation AS collation FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name <> '__drizzle_migrations' ORDER BY table_name",
    );
    expect(tables.map((table) => table.name)).toEqual(["notification_deliveries", "notification_prefs", "notifications", "webhook_config", "webhook_events"]);
    expect(new Set(tables.map((table) => table.collation))).toEqual(new Set(["utf8mb4_0900_ai_ci"]));
  });

  it("returns Arabic text and emoji unchanged, and times as the same instant", async () => {
    const store = createMysqlStore(connection);
    const notification = { eventId: "evt_ar", kind: "drafted", audience: "reviewers" as const, data: { title: "كيف تختار مستشارًا قانونيًا 👋" }, createdAt: AT };
    await store.recordEvent({ id: "evt_ar", event: "post.drafted", receivedAt: AT }, notification);
    expect((await store.pendingNotifications()).find((item) => item.eventId === "evt_ar")).toEqual(notification);
    expect(await store.lastEventAt()).toEqual(AT);
    await store.saveWebhook({ url: "https://مثال.example/api/hooks/marketing", secretCipher: "v1:x", updatedAt: AT });
    expect(await store.webhook()).toEqual({ url: "https://مثال.example/api/hooks/marketing", secretCipher: "v1:x", updatedAt: AT });
  });

  it("refuses an id longer than its column instead of letting INSERT IGNORE cut it (Review Focus 4)", async () => {
    const store = createMysqlStore(connection);
    const long = "e".repeat(MAX_KEY_LENGTH + 1);
    await expect(store.recordEvent({ id: long, event: "post.drafted", receivedAt: AT }, null)).rejects.toThrow(`longer than ${MAX_KEY_LENGTH} characters`);
    expect(await store.hasEvent(long.slice(0, MAX_KEY_LENGTH))).toBe(false);
    await expect(store.setEmailOff("u".repeat(MAX_KEY_LENGTH + 1), true, AT)).rejects.toThrow(`longer than ${MAX_KEY_LENGTH} characters`);
  });

  it("keeps an email of 254 characters, the longest valid, and refuses a longer one (Review Focus 4)", async () => {
    const store = createMysqlStore(connection);
    const longest = `${"a".repeat(64)}@${"b".repeat(185)}.com`;
    expect(longest).toHaveLength(254);
    await store.recordDelivery(["evt_mail"], longest, AT);
    expect(await store.deliveries(["evt_mail"])).toEqual(new Map([["evt_mail", new Set([longest])]]));
    await expect(store.recordDelivery(["evt_mail"], `${"a".repeat(MAX_EMAIL_LENGTH)}@example.com`, AT)).rejects.toThrow(
      `longer than ${MAX_EMAIL_LENGTH} characters`,
    );
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/store.test.ts tests/unit/mysql-store.test.ts`
Expected: FAIL. `@/lib/db/mysql-store` can't be resolved.

- [ ] **Step 3: Move the schema to MySQL**

Replace `src/lib/db/schema.ts` with:

```ts
import { boolean, datetime, int, json, mysqlTable, primaryKey, text, varchar } from "drizzle-orm/mysql-core";
import type { Audience } from "./store";

// Design §4: the dashboard's only database, the client's MySQL (M5a). Articles, keywords, photos and schedules stay in
// Quantum1st's engine. Times are UTC to the millisecond; keys are varchar(191), the utf8mb4 index limit.
const at = (name: string) => datetime(name, { mode: "date", fsp: 3 });
const key = (name: string) => varchar(name, { length: 191 });

/** Webhook deliveries already handled, by X-Event-Id (kept 30 days). */
export const webhookEvents = mysqlTable("webhook_events", {
  id: key("id").primaryKey(),
  event: text("event").notNull(),
  receivedAt: at("received_at").notNull(),
});

/** The one webhook registration (row id 1): our address and the signing secret, encrypted. */
export const webhookConfig = mysqlTable("webhook_config", {
  id: int("id").primaryKey(),
  url: text("url").notNull(),
  secretCipher: text("secret_cipher").notNull(),
  updatedAt: at("updated_at").notNull(),
});

/** The notification log: one row per delivery that emails someone; sent_at stays null until it goes out. */
export const notifications = mysqlTable("notifications", {
  eventId: key("event_id").primaryKey(),
  kind: varchar("kind", { length: 64 }).notNull(),
  audience: varchar("audience", { length: 64 }).$type<Audience>().notNull(),
  data: json("data").$type<Record<string, unknown>>().notNull(),
  createdAt: at("created_at").notNull(),
  sentAt: at("sent_at"),
  recipients: json("recipients").$type<string[]>(),
});

/** Who got which notification: a retried batch emails each person only what they haven't had (no one gets it twice). */
export const notificationDeliveries = mysqlTable(
  "notification_deliveries",
  {
    eventId: key("event_id").notNull(),
    // The longest valid address is 254 characters.
    email: varchar("email", { length: 255 }).notNull(),
    sentAt: at("sent_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.eventId, table.email] })],
);

/** Each person's choice: notification emails are on unless they turned them off. */
export const notificationPrefs = mysqlTable("notification_prefs", {
  userId: key("user_id").primaryKey(),
  emailOff: boolean("email_off").notNull(),
  updatedAt: at("updated_at").notNull(),
});
```

Replace `drizzle.config.ts` with:

```ts
import { defineConfig } from "drizzle-kit";

// pnpm db:generate writes a migration from the schema. The app applies pending ones itself on first use
// (src/lib/db/mysql.ts); pnpm db:migrate does the same for a local MySQL at DATABASE_URL.
export default defineConfig({
  dialect: "mysql",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
```

- [ ] **Step 4: Replace the Postgres migrations with a MySQL baseline, then give every table utf8mb4**

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
git rm -q -r drizzle
pnpm db:generate
ls drizzle drizzle/meta
python3 - <<'EOF'
import glob, re
[path] = glob.glob("drizzle/0000_*.sql")
sql = open(path).read()
fixed, count = re.subn(r"\n\);", "\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;", sql)
assert count == 5, count
open(path, "w").write(fixed)
print(path, "tables:", count)
EOF
grep -c "DEFAULT CHARSET=utf8mb4" drizzle/0000_*.sql
```

Expected: one `drizzle/0000_<name>.sql`, plus `drizzle/meta/_journal.json` and `drizzle/meta/0000_snapshot.json`. The script prints `tables: 5`, and the grep count is `5`.

- [ ] **Step 5: Write the MySQL store**

Create `src/lib/db/mysql-store.ts`:

```ts
import { and, desc, eq, inArray, isNotNull, isNull, lt } from "drizzle-orm";
import type { MysqlConnection, MysqlDb } from "./mysql";
import * as schema from "./schema";
import type { AppStore, StoredNotification, WebhookConfig } from "./store";

const WEBHOOK_ROW = 1;
const { webhookEvents, webhookConfig, notifications, notificationDeliveries, notificationPrefs } = schema;

/**
 * Key columns are varchar(191) and emails varchar(255). A longer value is refused here, before the insert: INSERT
 * IGNORE would otherwise cut it with only a warning (spec M5a risks).
 */
export const MAX_KEY_LENGTH = 191;
export const MAX_EMAIL_LENGTH = 255;

function fits(value: string, max: number, what: string): void {
  if (value.length > max) throw new Error(`${what} is longer than ${max} characters, which the database can't keep.`);
}

/** The database, or a transaction on it: both run these queries. */
type Runner = Pick<MysqlDb, "select" | "insert" | "update" | "delete">;

/** The queries, kept apart from running them so tests can read the SQL they make. */
export const queries = {
  hasEvent: (db: Runner, id: string) => db.select({ id: webhookEvents.id }).from(webhookEvents).where(eq(webhookEvents.id, id)).limit(1),
  insertNotification: (db: Runner, item: StoredNotification) =>
    db
      .insert(notifications)
      .ignore()
      .values({ eventId: item.eventId, kind: item.kind, audience: item.audience, data: item.data, createdAt: item.createdAt }),
  insertEvent: (db: Runner, event: { id: string; event: string; receivedAt: Date }) => db.insert(webhookEvents).ignore().values(event),
  lastEventAt: (db: Runner) => db.select({ at: webhookEvents.receivedAt }).from(webhookEvents).orderBy(desc(webhookEvents.receivedAt)).limit(1),
  webhook: (db: Runner) => db.select().from(webhookConfig).where(eq(webhookConfig.id, WEBHOOK_ROW)).limit(1),
  saveWebhook: (db: Runner, config: WebhookConfig) =>
    db
      .insert(webhookConfig)
      .values({ id: WEBHOOK_ROW, ...config })
      .onDuplicateKeyUpdate({ set: { url: config.url, secretCipher: config.secretCipher, updatedAt: config.updatedAt } }),
  pending: (db: Runner) => db.select().from(notifications).where(isNull(notifications.sentAt)).orderBy(notifications.createdAt),
  markSent: (db: Runner, eventIds: string[], recipients: string[], at: Date) =>
    db
      .update(notifications)
      .set({ sentAt: at, recipients })
      .where(and(inArray(notifications.eventId, eventIds), isNull(notifications.sentAt))),
  deliveries: (db: Runner, eventIds: string[]) =>
    db
      .select({ eventId: notificationDeliveries.eventId, email: notificationDeliveries.email })
      .from(notificationDeliveries)
      .where(inArray(notificationDeliveries.eventId, eventIds)),
  recordDelivery: (db: Runner, eventIds: string[], email: string, at: Date) =>
    db
      .insert(notificationDeliveries)
      .ignore()
      .values(eventIds.map((eventId) => ({ eventId, email, sentAt: at }))),
  forgetDeliveries: (db: Runner, cutoff: Date) => db.delete(notificationDeliveries).where(lt(notificationDeliveries.sentAt, cutoff)),
  forgetEvents: (db: Runner, cutoff: Date) => db.delete(webhookEvents).where(lt(webhookEvents.receivedAt, cutoff)),
  forgetSent: (db: Runner, cutoff: Date) => db.delete(notifications).where(and(isNotNull(notifications.sentAt), lt(notifications.sentAt, cutoff))),
  emailOffUsers: (db: Runner) => db.select({ userId: notificationPrefs.userId }).from(notificationPrefs).where(eq(notificationPrefs.emailOff, true)),
  setEmailOff: (db: Runner, userId: string, off: boolean, at: Date) =>
    db
      .insert(notificationPrefs)
      .values({ userId, emailOff: off, updatedAt: at })
      .onDuplicateKeyUpdate({ set: { emailOff: off, updatedAt: at } }),
};

/** DB_MODE=mysql (spec M5a): the client's MySQL. Every call first makes sure the tables are prepared. */
export function createMysqlStore(connection: Pick<MysqlConnection, "db" | "ready">): AppStore {
  const { db } = connection;

  return {
    async hasEvent(id) {
      await connection.ready();
      return (await queries.hasEvent(db, id)).length > 0;
    },

    async recordEvent(event, notification) {
      fits(event.id, MAX_KEY_LENGTH, "The event id");
      if (notification) fits(notification.eventId, MAX_KEY_LENGTH, "The event id");
      await connection.ready();
      // One transaction: the notification and the event id land together or not at all.
      await db.transaction(async (tx) => {
        if (notification) await queries.insertNotification(tx, notification);
        await queries.insertEvent(tx, event);
      });
    },

    async lastEventAt() {
      await connection.ready();
      return (await queries.lastEventAt(db))[0]?.at ?? null;
    },

    async webhook() {
      await connection.ready();
      const row = (await queries.webhook(db))[0];
      return row ? { url: row.url, secretCipher: row.secretCipher, updatedAt: row.updatedAt } : null;
    },

    async saveWebhook(config) {
      await connection.ready();
      await queries.saveWebhook(db, config);
    },

    async pendingNotifications() {
      await connection.ready();
      return (await queries.pending(db)).map((row) => ({
        eventId: row.eventId,
        kind: row.kind,
        audience: row.audience,
        data: row.data,
        createdAt: row.createdAt,
      }));
    },

    async markSent(eventIds, recipients, at) {
      if (eventIds.length === 0) return;
      await connection.ready();
      await queries.markSent(db, eventIds, recipients, at);
    },

    async deliveries(eventIds) {
      const found = new Map<string, Set<string>>();
      if (eventIds.length === 0) return found;
      await connection.ready();
      for (const row of await queries.deliveries(db, eventIds)) found.set(row.eventId, (found.get(row.eventId) ?? new Set()).add(row.email));
      return found;
    },

    async recordDelivery(eventIds, email, at) {
      fits(email, MAX_EMAIL_LENGTH, "The email address");
      for (const eventId of eventIds) fits(eventId, MAX_KEY_LENGTH, "The event id");
      if (eventIds.length === 0) return;
      await connection.ready();
      await queries.recordDelivery(db, eventIds, email, at);
    },

    async forgetBefore(cutoff) {
      await connection.ready();
      await db.transaction(async (tx) => {
        await queries.forgetEvents(tx, cutoff);
        await queries.forgetSent(tx, cutoff);
        await queries.forgetDeliveries(tx, cutoff);
      });
    },

    async emailOffUsers() {
      await connection.ready();
      return new Set((await queries.emailOffUsers(db)).map((row) => row.userId));
    },

    async setEmailOff(userId, off, at) {
      fits(userId, MAX_KEY_LENGTH, "The user id");
      await connection.ready();
      await queries.setEmailOff(db, userId, off, at);
    },
  };
}
```

- [ ] **Step 6: Point `getStore()` at MySQL; remove the Neon store**

Replace `src/lib/db/index.ts` with:

```ts
import "server-only";
import { servicesEnv } from "@/lib/services-env";
import { createMemoryStore } from "./memory-store";
import { connectMysql } from "./mysql";
import { createMysqlStore } from "./mysql-store";
import type { AppStore } from "./store";

const MEMORY = Symbol.for("articles-ai.memory-store");
let mysql: { url: string; store: AppStore } | null = null;

/** The dashboard's store: the client's MySQL (DB_MODE=mysql), or one in-memory store per server process (local and tests). */
export function getStore(): AppStore {
  const env = servicesEnv();
  if (env.dbMode === "memory") {
    const holder = globalThis as unknown as Record<symbol, AppStore | undefined>;
    return (holder[MEMORY] ??= createMemoryStore());
  }
  const url = env.databaseUrl ?? "";
  if (mysql?.url !== url) mysql = { url, store: createMysqlStore(connectMysql(url)) };
  return mysql.store;
}
```

In `src/lib/db/store.ts`, replace line 9:

```ts
/** What the dashboard keeps (design §4 "Small database"): in memory locally and in tests, in the client's MySQL on a server. */
```

Then:

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
git rm -q src/lib/db/neon-store.ts tests/unit/neon-store.test.ts
pnpm remove @neondatabase/serverless
git grep -n "neondatabase\|neon-store\|neon-http" -- src tests package.json
```

Expected: the grep prints nothing.

- [ ] **Step 7: Run the store tests and watch them pass**

Run: `pnpm vitest run tests/unit/store.test.ts tests/unit/mysql-store.test.ts tests/unit/mysql-prepare.test.ts`
Expected: PASS: 10 store cases (5 per store), 7 MySQL-store cases and 7 preparation cases.

If `Runner` doesn't accept the transaction (`tx`) in `typecheck`, type it as `Pick<MySqlDatabase<any, any>, "select" | "insert" | "update" | "delete">` from `drizzle-orm/mysql-core`, and ledger the ruling.

- [ ] **Step 8: Run the whole unit suite, types and lint, then commit**

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
RC=0; pnpm test >/dev/null 2>&1 || RC=$?; pnpm typecheck >/dev/null 2>&1 || RC=$?; pnpm lint >/dev/null 2>&1 || RC=$?
if [ $RC -eq 0 ]; then
  git add -A src/lib/db drizzle drizzle.config.ts package.json pnpm-lock.yaml tests/unit/store.test.ts tests/unit/mysql-store.test.ts
  git commit -m "feat(db): the MySQL store replaces the Neon store; MySQL migrations with utf8mb4 tables (M5a)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
else echo "checks failed: RC=$RC"; fi
```

---

### Task 3: The settings: `DB_MODE=mysql`

**Files:**
- Modify: `src/lib/services-env.ts` (full replacement)
- Modify: `src/lib/webhooks/secret.ts:31-35`
- Modify: `src/lib/db/memory-store.ts:13`
- Modify: `.env.example:20-24`
- Test: `tests/unit/services-env.test.ts:19-23`, `tests/unit/webhooks.test.ts:26-28`, `tests/unit/webhook-settings.test.ts:56-58`

**Interfaces:**
- Consumes (Task 2): `getStore()`, which treats any `dbMode` other than `"memory"` as MySQL.
- Produces:
  - `ServicesEnv.dbMode: "memory" | "mysql"`
  - `parseServicesEnv` rules:
    - `neon` is refused, with a message naming `DB_MODE=mysql`
    - `mysql` needs `DATABASE_URL` starting `mysql://`
    - `memory` is refused when `NODE_ENV=production` unless `ALLOW_TEST_LOGINS=1`
  - `secretKeyFor({ dbMode: "memory" | "mysql", encryptionKey })`

- [ ] **Step 1: Write the failing tests**

In `tests/unit/services-env.test.ts`, replace the test `"refuses the in-memory store on Vercel, and Neon without its address"` (lines 19–23) with:

```ts
  it("keeps data in MySQL: DB_MODE=mysql needs a mysql:// address, and the retired Neon mode says what to use", () => {
    expect(() => parseServicesEnv({ DB_MODE: "mysql" })).toThrow(/needs DATABASE_URL/);
    expect(() => parseServicesEnv({ DB_MODE: "mysql", DATABASE_URL: "postgres://u:p@host/db" })).toThrow(/must start with mysql:\/\//);
    expect(parseServicesEnv({ DB_MODE: "mysql", DATABASE_URL: "mysql://u:p@localhost:3306/db" })).toMatchObject({
      dbMode: "mysql",
      databaseUrl: "mysql://u:p@localhost:3306/db",
    });
    expect(() => parseServicesEnv({ DB_MODE: "neon", DATABASE_URL: "postgres://u:p@host/db" })).toThrow(/DB_MODE=mysql/);
  });

  it("refuses the in-memory store on a production server, which would lose its data on every restart", () => {
    expect(() => parseServicesEnv({ NODE_ENV: "production" })).toThrow(/refused in production/);
    expect(parseServicesEnv({ NODE_ENV: "production", ALLOW_TEST_LOGINS: "1" }).dbMode).toBe("memory");
    expect(parseServicesEnv({ NODE_ENV: "production", DB_MODE: "mysql", DATABASE_URL: "mysql://u:p@localhost:3306/db" }).dbMode).toBe("mysql");
    expect(parseServicesEnv({ NODE_ENV: "development" }).dbMode).toBe("memory");
  });
```

In `tests/unit/webhooks.test.ts`, replace lines 26–28 with:

```ts
  it("uses WEBHOOK_ENCRYPTION_KEY, or one key per process with the in-memory store, and none for MySQL without it", () => {
    expect(secretKeyFor({ dbMode: "mysql", encryptionKey: KEY })).toBe(KEY);
    expect(secretKeyFor({ dbMode: "mysql", encryptionKey: null })).toBeNull();
```

In `tests/unit/webhook-settings.test.ts`, replace lines 56–58 with:

```ts
  it("doesn't ask for a secret it couldn't keep: MySQL without WEBHOOK_ENCRYPTION_KEY", async () => {
    vi.stubEnv("DB_MODE", "mysql");
    vi.stubEnv("DATABASE_URL", "mysql://u:p@localhost:3306/db");
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run tests/unit/services-env.test.ts tests/unit/webhooks.test.ts tests/unit/webhook-settings.test.ts`
Expected: FAIL.
- `DB_MODE: "mysql"` is rejected as an invalid option.
- `neon` doesn't throw.
- Production memory doesn't throw.
- `webhooks.test.ts` may still pass, because Vitest doesn't type-check. Its `"mysql"` argument is checked by `pnpm typecheck` in Step 5.

- [ ] **Step 3: Write the settings rules**

Replace `src/lib/services-env.ts` with:

```ts
import "server-only";
import { z } from "zod";

const ServicesSchema = z.object({
  DB_MODE: z.enum(["memory", "mysql"]).default("memory"),
  DATABASE_URL: z.string().optional(),
  WEBHOOK_ENCRYPTION_KEY: z.string().optional(),
  EMAIL_MODE: z.enum(["log", "resend"]).default("log"),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  NOTIFY_QUIET_SECONDS: z.coerce.number().int().min(0).max(3600).default(120),
  NODE_ENV: z.string().optional(),
  ALLOW_TEST_LOGINS: z.string().optional(),
});

/** The database, webhook secret, email and cron settings (M4c, M5a). Server-only: none of these may reach the browser. */
export type ServicesEnv = {
  dbMode: "memory" | "mysql";
  databaseUrl: string | null;
  /** 32 bytes for AES-256-GCM, or null when unset (the in-memory store then uses a key that lives as long as the process). */
  encryptionKey: Buffer | null;
  emailMode: "log" | "resend";
  resend: { apiKey: string; from: string } | null;
  cronSecret: string | null;
  notifyQuietMs: number;
};

export function parseServicesEnv(source: Record<string, string | undefined>): ServicesEnv {
  const cleaned = Object.fromEntries(Object.entries(source).map(([key, value]) => [key, value === "" ? undefined : value]));
  if (cleaned.DB_MODE === "neon") {
    throw new Error("DB_MODE=neon is no longer supported: the dashboard keeps its data in the client's MySQL. Set DB_MODE=mysql and DATABASE_URL.");
  }
  const env = ServicesSchema.parse(cleaned);

  if (env.DB_MODE === "memory" && env.NODE_ENV === "production" && env.ALLOW_TEST_LOGINS !== "1") {
    throw new Error(
      "DB_MODE=memory keeps data in one server process's memory and loses it on every restart, so it's refused in production. Set DB_MODE=mysql and DATABASE_URL.",
    );
  }
  if (env.DB_MODE === "mysql") {
    if (!env.DATABASE_URL) throw new Error("DB_MODE=mysql needs DATABASE_URL=mysql://user:password@host:3306/database.");
    if (!env.DATABASE_URL.startsWith("mysql://")) throw new Error("DATABASE_URL must start with mysql:// (DB_MODE=mysql).");
  }

  let encryptionKey: Buffer | null = null;
  if (env.WEBHOOK_ENCRYPTION_KEY) {
    encryptionKey = Buffer.from(env.WEBHOOK_ENCRYPTION_KEY, "base64");
    if (encryptionKey.length !== 32) throw new Error("WEBHOOK_ENCRYPTION_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32).");
  }

  if (env.EMAIL_MODE === "resend" && (!env.RESEND_API_KEY || !env.EMAIL_FROM)) {
    throw new Error("EMAIL_MODE=resend needs RESEND_API_KEY and EMAIL_FROM.");
  }

  return {
    dbMode: env.DB_MODE,
    databaseUrl: env.DATABASE_URL ?? null,
    encryptionKey,
    emailMode: env.EMAIL_MODE,
    resend: env.EMAIL_MODE === "resend" && env.RESEND_API_KEY && env.EMAIL_FROM ? { apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM } : null,
    cronSecret: env.CRON_SECRET ?? null,
    notifyQuietMs: env.NOTIFY_QUIET_SECONDS * 1000,
  };
}

/** Parsed on every call, like serverEnv(), so tests and runtime always see the current environment. */
export function servicesEnv(): ServicesEnv {
  return parseServicesEnv(process.env);
}
```

In `src/lib/webhooks/secret.ts`, replace the doc comment and signature (lines 31–35):

```ts
/**
 * The key for the webhook secret: WEBHOOK_ENCRYPTION_KEY; with the in-memory store, one that lives as long as the
 * process (as the store does); with MySQL and no key, none: the secret can't be kept.
 */
export function secretKeyFor(env: { dbMode: "memory" | "mysql"; encryptionKey: Buffer | null }): Buffer | null {
```

In `src/lib/db/memory-store.ts`, replace line 13:

```ts
/** DB_MODE=memory: the store in this server process's memory (local development and the e2e suite; refused in production). */
```

In `.env.example`, replace lines 20–24 (from `# Dashboard storage` to the `WEBHOOK_ENCRYPTION_KEY` comment):

```bash
# Dashboard storage (design §4): "memory" keeps it in this server's memory (local development and tests; refused in
# production); "mysql" = the client's MySQL 8. The app creates its tables on first use (locally also: pnpm db:migrate).
DB_MODE=memory
# mysql://user:password@host:3306/database (URL-encode special characters in the password)
DATABASE_URL=
# 32 random bytes, base64 (openssl rand -base64 32): encrypts the webhook secret. Required with DB_MODE=mysql.
```

- [ ] **Step 4: Run them and watch them pass**

Run: `pnpm vitest run tests/unit/services-env.test.ts tests/unit/webhooks.test.ts tests/unit/webhook-settings.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the whole unit suite, types and lint, then commit**

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
git grep -n '"neon"' -- src tests
RC=0; pnpm test >/dev/null 2>&1 || RC=$?; pnpm typecheck >/dev/null 2>&1 || RC=$?; pnpm lint >/dev/null 2>&1 || RC=$?
if [ $RC -eq 0 ]; then
  git add src/lib/services-env.ts src/lib/webhooks/secret.ts src/lib/db/memory-store.ts .env.example tests/unit/services-env.test.ts tests/unit/webhooks.test.ts tests/unit/webhook-settings.test.ts
  git commit -m "feat(settings): DB_MODE=mysql; Neon refused by name; the in-memory store refused on production servers (M5a)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
else echo "checks failed: RC=$RC"; fi
```

Expected: the `git grep` prints nothing, and the commit is made.

---

### Task 4: The cPanel build carries the migrations; the README

**Files:**
- Modify: `next.config.ts` (add `serverExternalPackages`)
- Modify: `scripts/cpanel-build.sh` (after line 55, `cp deploy/cpanel/app.cjs …`)
- Modify: `README.md` (Run locally bullet; "Database, webhook and email" section; Hosting on cPanel one-time setup and preview bullet; new "Decisions in M5a" at the end)
- Test: a standalone smoke run against the local MySQL (Steps 1–2 RED, Step 5 GREEN), then the full suites

**Interfaces:**
- Consumes:
  - Task 1: `connectMysql`'s default folder, `path.join(process.cwd(), "drizzle")`. `app.cjs` changes into the release folder before starting.
  - Task 3: the `DB_MODE=mysql` settings.
- Produces: a cPanel release with `drizzle/meta/_journal.json`, with `mysql2` loaded from `node_modules` instead of bundled.

- [ ] **Step 1: Set up the smoke run (a preview build with test logins, on a local MySQL)**

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
SMOKE=$(mktemp -d); echo "$SMOKE" > /tmp/m5a-smoke-dir
mysql -u root -e "DROP DATABASE IF EXISTS articles_ai_smoke; CREATE DATABASE articles_ai_smoke CHARACTER SET utf8mb4"
cat > "$SMOKE/settings.env" <<EOF
ENGINE_MODE=mock
AUTH_MODE=mock
ALLOW_TEST_LOGINS=1
TWO_FACTOR=off
DB_MODE=mysql
DATABASE_URL=mysql://root@127.0.0.1:3306/articles_ai_smoke
WEBHOOK_ENCRYPTION_KEY=$(openssl rand -base64 32)
EMAIL_MODE=log
CRON_SECRET=smoke
EOF
```

- [ ] **Step 2: Run the smoke on the current code and watch it fail**

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
SMOKE=$(cat /tmp/m5a-smoke-dir); SHA=$(git rev-parse --short HEAD)
CPANEL_SETTINGS="$SMOKE/settings.env" scripts/cpanel-build.sh > "$SMOKE/build.log" 2>&1; tail -1 "$SMOKE/build.log"
cd "dist/cpanel/$SHA-preview" && (DASHBOARD_SHARED="$SMOKE" PORT=3300 node app.cjs > /dev/null 2>&1 &)
for i in $(seq 1 20); do curl -s -o /dev/null http://127.0.0.1:3300/en/sign-in && break; sleep 1; done
curl -s -o /dev/null -w "notifications page %{http_code}\n" -b "dev_session=dev_admin" http://127.0.0.1:3300/en/notifications
mysql -u root -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='articles_ai_smoke'"
grep -c "couldn't be prepared\|Error" "$SMOKE/app.log"
kill $(lsof -ti tcp:3300)
```

Expected: FAIL. The release has no `drizzle/` folder, so:
- the table count is `0`
- `app.log` has `The database couldn't be prepared from …/drizzle`

(Or, if Next bundled `mysql2`, a module error in `app.log`.) Either way, no tables.

- [ ] **Step 3: Ship the migrations in the release, and keep mysql2 unbundled**

In `next.config.ts`, add this line right after the `output:` line:

```ts
  // mysql2 is loaded from node_modules, not bundled (it isn't on Next's built-in list, as pg is).
  serverExternalPackages: ["mysql2"],
```

In `scripts/cpanel-build.sh`, add these lines after `cp deploy/cpanel/app.cjs "$OUT/app.cjs"` (line 55):

```bash
# The app creates and updates its MySQL tables from these on first use (src/lib/db/mysql.ts).
cp -R drizzle "$OUT/drizzle"
[ -f "$OUT/drizzle/meta/_journal.json" ] || { echo "The release has no drizzle/meta/_journal.json." >&2; exit 1; }
```

- [ ] **Step 4: Commit (the build uses committed code)**

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
RC=0; pnpm typecheck >/dev/null 2>&1 || RC=$?; pnpm lint >/dev/null 2>&1 || RC=$?; bash -n scripts/cpanel-build.sh || RC=$?
if [ $RC -eq 0 ]; then
  git add next.config.ts scripts/cpanel-build.sh
  git commit -m "build: cPanel releases carry the MySQL migrations; mysql2 stays out of the bundle (M5a)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
else echo "checks failed: RC=$RC"; fi
```

- [ ] **Step 5: Run the smoke again and watch it pass**

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
SMOKE=$(cat /tmp/m5a-smoke-dir); SHA=$(git rev-parse --short HEAD); : > "$SMOKE/app.log"
mysql -u root -e "DROP DATABASE IF EXISTS articles_ai_smoke; CREATE DATABASE articles_ai_smoke CHARACTER SET utf8mb4"
CPANEL_SETTINGS="$SMOKE/settings.env" scripts/cpanel-build.sh > "$SMOKE/build.log" 2>&1; tail -1 "$SMOKE/build.log"
ls "dist/cpanel/$SHA-preview/drizzle/meta/_journal.json" "dist/cpanel/$SHA-preview/node_modules/mysql2/package.json"
cd "dist/cpanel/$SHA-preview" && (DASHBOARD_SHARED="$SMOKE" PORT=3300 node app.cjs > /dev/null 2>&1 &)
for i in $(seq 1 20); do curl -s -o /dev/null http://127.0.0.1:3300/en/sign-in && break; sleep 1; done
curl -s -o /dev/null -w "notifications page %{http_code}\n" -b "dev_session=dev_admin" http://127.0.0.1:3300/en/notifications
curl -s -o /dev/null -w "webhook page %{http_code}\n" -b "dev_session=dev_admin" http://127.0.0.1:3300/en/settings/webhook
mysql -u root -N -e "SELECT table_name, table_collation FROM information_schema.tables WHERE table_schema='articles_ai_smoke' ORDER BY 1"
grep -c "couldn't be prepared\|Error" "$SMOKE/app.log"
kill $(lsof -ti tcp:3300)
```

Expected: PASS.
- Both files exist.
- Both pages return `200`.
- Six tables are listed: `__drizzle_migrations` and the five dashboard tables, all five dashboard ones `utf8mb4_0900_ai_ci`.
- The error count is `0`.

- [ ] **Step 5b: Check the real (Clerk) cPanel build still builds under the new production rule**

The cPanel build passes no `DB_MODE` to `next build`, which runs with `NODE_ENV=production`. If anything read the services settings while building, the in-memory refusal from Task 3 would stop it. This builds with the real `.env.cpanel` (Clerk keys; nothing secret is baked in, as before).

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
scripts/cpanel-build.sh > /tmp/m5a-clerk-build.log 2>&1; echo "exit $?"; tail -1 /tmp/m5a-clerk-build.log
```

Expected: `exit 0`, and `Built …/dist/cpanel/<sha> (…)`. If it fails with "refused in production", find what reads `servicesEnv()` at build time, move that read behind `await connection()` like the other request-time reads, and ledger a ruling.

- [ ] **Step 6: Update the README**

In "Run locally", replace the sentence `Both are for local use; see "Database, webhook and email" for Vercel.` with:

```markdown
Both are for local use; a server keeps its data in MySQL (see "Database, webhook and email").
```

Replace the whole section from `## Database, webhook and email (Vercel)` up to the line before `## Hosting on cPanel (dashboard.fakhernco.com)` with:

```markdown
## Database, webhook and email

1. **Database:** the client's MySQL 8.
   - Settings: `DB_MODE=mysql` and `DATABASE_URL=mysql://user:password@host:3306/database` (URL-encode special characters in the password).
   - **The app creates and updates its own tables** the first time it uses the database after a release, from `drizzle/`, under the MySQL lock `articles_ai_migrations`. Locally, `pnpm db:migrate` does the same for the database in `DATABASE_URL`.
   - Set `WEBHOOK_ENCRYPTION_KEY` to `openssl rand -base64 32`. Keep it: changing it means getting a new webhook secret.
   - **Backups:** the host's backups of the database. cPanel's account backups include MySQL databases.
   - **Tests:** `pnpm test` needs a local MySQL, set by `TEST_DATABASE_URL` (default `mysql://root@127.0.0.1:3306/articles_ai_test`; start it with `brew services start mysql@8.4`). Each test file uses its own `articles_ai_test_<name>` database.
2. **Email:** in Resend, add the sending domain (for example `notifications.fakhernco.com`). Add the DNS records Resend lists (DKIM, and its SPF/MX for the sending subdomain) in **Cloudflare**; the Microsoft 365 mail setup is unaffected. Then set:
   - `EMAIL_MODE=resend`
   - `RESEND_API_KEY`
   - `EMAIL_FROM` (for example `Articles AI <notifications@notifications.fakhernco.com>`)
3. **Cron:** set `CRON_SECRET` (a long random string). The host calls `/api/cron/notifications` every 15 minutes: on cPanel, a cron job (see "Hosting on cPanel"). `vercel.json` holds the same schedule for Vercel, which is no longer the hosting path.
4. **Webhook:** after a release, open **Settings → Webhook** on the live address and press **Set up webhook**. It registers `https://<address>/api/hooks/marketing` with Quantum1st, and keeps the signing secret encrypted.
```

In "Hosting on cPanel", **One-time setup**:
- Insert this as the new step 3. The current steps 3 (`.env.cpanel`) and 4 (SFTP) become 4 and 5.

```markdown
3. **MySQL:** cPanel → **MySQL Databases**: create a database (for example `fakhernco_dashboard`; cPanel adds the account prefix) and a user, and give the user **All Privileges** on it, since the app creates its own tables. Then `DATABASE_URL=mysql://<user>:<password>@localhost:3306/<database>`.
```

- In the `.env.cpanel` list, replace `` - `DB_MODE=neon` with `DATABASE_URL` `` with `` - `DB_MODE=mysql` with `DATABASE_URL` ``.
- In the preview bullet, replace `The preview stores the test users' data in the same Neon database.` with `The preview stores the test users' data in the same MySQL database.`

Append at the end of the README:

```markdown
## Decisions in M5a (own database)

- **The client's MySQL instead of Neon,** so a copy depends on no outside database service. Any host with MySQL 8 works; the settings file is the only difference.
- **The app creates its own tables** on first use after a release, under the MySQL lock `articles_ai_migrations`, because the cPanel account has no shell. A failed attempt is retried on the next request, and its error names the migrations folder.
- **utf8mb4 tables whatever the database's default,** so Arabic and emoji are safe on hosts that default to latin1.
- **At most 3 connections,** leaving room for WordPress on the same account.
- **Ids are capped at 191 characters and emails at 255.** A longer one is refused with an error rather than cut, since `INSERT IGNORE` would cut it silently. The engine's event names are `text`.
- **The in-memory store is refused on production servers,** where it would lose its data on every restart. The exception is `ALLOW_TEST_LOGINS=1`, which the e2e suite sets.
```

- [ ] **Step 7: Run every check, then commit the README**

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
git grep -n -i "neon" -- README.md .env.example src tests scripts deploy | grep -v "Decisions in M4c\|^README.md:2[0-9][0-9]:" 
RC=0; pnpm lint >/dev/null 2>&1 || RC=$?; pnpm typecheck >/dev/null 2>&1 || RC=$?; pnpm test > /tmp/m5a-unit.log 2>&1 || RC=$?; pnpm e2e > /tmp/m5a-e2e.log 2>&1 || RC=$?
tail -4 /tmp/m5a-unit.log; tail -3 /tmp/m5a-e2e.log
if [ $RC -eq 0 ]; then
  git add README.md
  git commit -m "docs: the database is the client's MySQL — settings, the cPanel step, backups, tests, Decisions in M5a

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
else echo "checks failed: RC=$RC"; fi
```

Expected:
- The grep prints only historical lines: the M4c and M4d "Decisions" sections, which record what was decided then.
- Unit tests: all pass, 0 failed.
- e2e: all pass (176).
- The commit is made.

---

## Going live (with the user, after the final review and the merge)

Not executor tasks. Each step needs the user, or changes the live site.

1. **The user:** cPanel → MySQL Databases.
   - Create the database `fakhernco_dashboard` and the user `fakhernco_dash`; cPanel adds the account prefix to both.
   - Give that user **All Privileges** on it.
   - Use letters and digits in the password.
2. **The user:** in `.env.cpanel`, set `DB_MODE=mysql` and `DATABASE_URL=mysql://<prefixed user>:<password>@localhost:3306/<prefixed database>`. The password goes in the file, not the chat.
3. `scripts/cpanel-build.sh`, then `scripts/cpanel-deploy.sh --settings`.
4. **Checks on `dashboard.fakhernco.com`:**
   - The first signed-in page creates the tables: `app.log` has no "couldn't be prepared".
   - The Notifications switch saves.
   - Settings → Webhook shows its state.
   - After a restart (a new `tmp/restart.txt`), the Notifications choice is still there.
5. Refresh the encrypted settings backup in iCloud Drive (same passphrase).
6. **With the user's confirmation:** delete the Neon database `articles-ai-dashboard-db` from the Nour Attorneys Vercel team (`vercel integration resource remove articles-ai-dashboard-db --scope nour-attorneys`). It's the dashboard's last tie to Vercel.
