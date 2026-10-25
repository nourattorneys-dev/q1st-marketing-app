# M5a: the dashboard's own database (Neon → the client's MySQL)

Status: approved in conversation on 2026-10-25, written for review.

## Why

The dashboard will be reused for other clients, one copy per client, and each copy should depend on as few outside services as possible. The user chose to remove four: Neon (database), Resend (email), Clerk (sign-in) and Microsoft sign-in. They come out in three milestones, in this order:

- **M5a, own database (this spec):** Neon → the client's MySQL.
- **M5b, own email:** Resend → the client's mail server over SMTP.
- **M5c, own sign-in:** Clerk and Microsoft sign-in → accounts stored in the dashboard's database.

M5c stores accounts in the database and sends invitations and password resets by email, so it comes last, on its final foundations.

## Goal

Every copy of the dashboard keeps its small database (design §4) in a MySQL 8 database on its own host. For Fakher & Co that's the cPanel account's MySQL, which WordPress already uses. Nothing in the dashboard depends on Neon or Vercel afterwards.

**Not in scope:** email and sign-in (M5b and M5c). There is no data migration: the Neon database is empty (checked on 2026-10-25).

## What exists today

- `src/lib/db/`:
  - `store.ts` (the `AppStore` interface, 12 methods)
  - `memory-store.ts`
  - `neon-store.ts` (Drizzle on `drizzle-orm/neon-http`)
  - `schema.ts` (5 Postgres tables)
  - `index.ts` (`getStore()`)
- `src/lib/services-env.ts`:
  - `DB_MODE=memory|neon` and `DATABASE_URL`
  - memory mode is refused on Vercel
- `drizzle/0000_*.sql`, `drizzle/0001_*.sql` (Postgres), applied with `pnpm db:migrate`.
- `src/lib/webhooks/secret.ts` `secretKeyFor` takes `dbMode: "memory" | "neon"`.
- Tests:
  - `tests/unit/store.test.ts` covers the memory store
  - `tests/unit/neon-store.test.ts` reads the SQL the Neon store would send
  - the e2e suite runs on the memory store
- The server: CloudLinux cPanel, MySQL `8.0.46-cll-lve`. No shell, SFTP only, and 2 GB of memory shared with WordPress.
- This Mac: Homebrew `mysql@8.4`, running, with `root` reachable without a password.

## Design

### Settings

- `DB_MODE=mysql|memory`, default `memory`. `neon` is no longer accepted: it fails with a message that names `mysql`.
- `DB_MODE=mysql` needs `DATABASE_URL` in the form `mysql://user:password@host:3306/database`. Special characters in the password are URL-encoded. Anything not starting with `mysql://` is refused with a clear message.
- Memory mode is refused in production builds (`NODE_ENV=production`) unless `ALLOW_TEST_LOGINS=1`, which the e2e suite sets. This replaces the Vercel-only rule: a copy on any server that forgot `DB_MODE` would otherwise lose its data on every restart.
- `secretKeyFor` takes `dbMode: "memory" | "mysql"`. The rule is unchanged: only the memory store may use a key that lives as long as the process.

### Tables

`schema.ts` moves to `drizzle-orm/mysql-core`. The same five tables and columns, with types MySQL can index:

| Postgres today | MySQL |
|---|---|
| `text` primary or key columns (`id`, `event_id`, `email`, `user_id`) | `varchar(191)` (utf8mb4 index limit; the two-column key in `notification_deliveries` stays under InnoDB's 3072 bytes) |
| `text` other short columns (`event`, `kind`, `audience`) | `varchar(64)` |
| `text` long columns (`url`, `secret_cipher`) | `text` |
| `jsonb` | `json` |
| `timestamp with time zone` | `datetime(3)`, always UTC |
| `boolean` | `boolean` |
| `integer` | `int` |

The tables are created as `utf8mb4` / `utf8mb4_0900_ai_ci`, so Arabic and emoji are stored intact.

### Connection

- Drizzle on `drizzle-orm/mysql2` over a `mysql2` connection pool:
  - at most **3 connections** (the account shares MySQL and its process limits with WordPress)
  - keep-alive on, so connections the server closes after idling are replaced
  - `timezone: "Z"`, so every `Date` goes in and comes out as UTC
  - `charset: utf8mb4`
- One pool per server process, created on first use (as `getStore()` does for Neon today).

### The MySQL store

`src/lib/db/mysql-store.ts`:
- `createMysqlStore(db)` implements `AppStore` exactly as the Neon store does, with MySQL's forms:
  - "insert, or do nothing if it's there" uses Drizzle's `.ignore()` (`INSERT IGNORE`)
  - "insert or update" uses `.onDuplicateKeyUpdate()`
- `recordEvent` (event and notification) and `forgetBefore` (three deletes) each run in one transaction.
- The queries stay in an exported `queries` object, as in the Neon store, so tests can also read the SQL.

`neon-store.ts`, its test and `@neondatabase/serverless` are removed. `mysql2` is added: the one new package in this milestone.

### Creating and updating tables (no shell on the server)

- **Where migrations live:** `drizzle.config.ts` moves to `dialect: "mysql"`. The Postgres migrations in `drizzle/` are replaced by a fresh MySQL baseline (`pnpm db:generate`). The old ones stay in git history.
- **When they run:** the store applies pending migrations itself, once per server process, before its first query.
  - It takes the MySQL lock `GET_LOCK('articles_ai_migrations', 30)`, runs Drizzle's MySQL migrator on the `drizzle/` folder, and releases the lock.
  - Two processes starting together (Passenger can start more than one) apply them once. The second waits, then finds nothing to do.
- **Failure:** a failed migration is logged, and the request fails with a clear "the database couldn't be prepared" error. The next request tries again, so a fixed database recovers without a restart.
- **Where the files come from:** the migrations folder is found from the app's working folder.
  - In a cPanel release that's the release folder: `scripts/cpanel-build.sh` copies `drizzle/` into it.
  - Locally it's the repo root.
- `pnpm db:migrate` (drizzle-kit, MySQL) still works for a local database, but nothing requires it.

### Local development and tests

- `pnpm dev` and the e2e suite keep the memory store. Nothing changes for them.
- **Store contract tests:** `tests/unit/store.test.ts` becomes one set of cases that runs against both stores: the memory store, and the MySQL store on a real local database.
  - The database comes from `TEST_DATABASE_URL`, default `mysql://root@127.0.0.1:3306/articles_ai_test`.
  - The suite drops and recreates `articles_ai_test` and prepares it through the same migration code the server uses.
  - If MySQL isn't reachable, the suite fails with a message naming the fix (`brew services start mysql@8.4`). It doesn't skip silently.
- **New cases** (MySQL, real database):
  - Arabic text and emoji come back unchanged.
  - A `Date` comes back as the same instant (UTC).
  - Preparing an already-prepared database changes nothing.
  - Two preparations at once both finish, and the tables exist once.
  - `forgetBefore` keeps unsent notifications.
- **Settings tests:**
  - `DB_MODE=mysql` needs a `mysql://` URL.
  - `neon` is refused, naming `mysql`.
  - Memory mode is refused in production unless `ALLOW_TEST_LOGINS=1`.
- `tests/unit/neon-store.test.ts` is replaced by a short check of the MySQL store's SQL: `insert ignore`, `on duplicate key update`, and the `sent_at` conditions.

### Going live on Fakher & Co's server

1. **The user, in cPanel → MySQL Databases:**
   - create the database `fakhernco_dashboard` and a user `fakhernco_dash` (cPanel adds the account prefix)
   - give that user **All Privileges** on the database (the app creates its tables)
   - letters and digits in the password avoid URL-encoding
2. In `.env.cpanel`, set `DB_MODE=mysql` and `DATABASE_URL=mysql://fakhernco_dash:…@localhost:3306/fakhernco_dashboard`. The user pastes the password into the file, not the chat.
3. `scripts/cpanel-build.sh`, then `scripts/cpanel-deploy.sh --settings`.
4. **Checks:**
   - the first request creates the five tables (`app.log` shows the migration)
   - the Notifications page saves a preference
   - the Webhook page shows "Set up"
   - a restart keeps the data
5. Refresh the encrypted settings backup in iCloud Drive with the new `.env.cpanel`.
6. With the user's confirmation, delete the Neon database `articles-ai-dashboard-db` from the Nour Attorneys Vercel team. It's the dashboard's last tie to Vercel.

**Backups:** cPanel's account backups include MySQL databases, as they do WordPress's. The README says so.

### Other clients

Any host with MySQL 8 works the same way, set only through the settings file. The README's "Hosting on cPanel" section gains the database step, and the Vercel/Neon section is reduced to a note that Vercel is no longer the hosting path.

## Risks

- **MySQL 8.0 on the server, 8.4 on this Mac:** the tables and queries use only features both have (JSON, `datetime(3)`, `GET_LOCK`, `INSERT IGNORE`, `ON DUPLICATE KEY UPDATE`). The go-live check runs on the server's 8.0.
- **Connection limits on shared hosting:** the pool caps at 3, which is well under the usual per-user limit.
- **Idle connections closed by the server:** keep-alive, and the pool replaces dead connections. A test kills the pool's connections from a second connection (`KILL`), as an idle timeout would, then checks that the next query still succeeds.
- **`INSERT IGNORE` also hides other errors** (for example data too long for a column): ids are bounded at 191 characters, and an engine id longer than that is refused before the insert with a clear error, not silently cut.

## Done when

- `pnpm lint`, `pnpm typecheck`, `pnpm test` (including the MySQL contract suite), `pnpm e2e` and a cPanel build all pass.
- `dashboard.fakhernco.com` runs on `fakhernco_dashboard`, with the go-live checks above done.
- No file in the repo imports `@neondatabase/serverless`.
- The README describes the database step for a new client.
