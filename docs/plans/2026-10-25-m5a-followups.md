# M5a follow-ups (own database)

## Going live on dashboard.fakhernco.com

The steps are in the plan's "Going live" section. A note from the final review:

- **If the first request logs `Access denied for user '…'@'127.0.0.1'`:** mysql2 connects over TCP even for `localhost`. A cPanel user created only as `'user'@'localhost'`, on a server with `skip_name_resolve`, then doesn't match.
  - Append `?socketPath=/var/lib/mysql/mysql.sock` to `DATABASE_URL`. mysql2 reads it from the address, so no code change is needed.
- **Connection check:** phpMyAdmin → Status → Processes (or `information_schema.processlist`) should show at most 3 connections per server process for the dashboard's user.

## Carry into later milestones

- **M5c (own sign-in):**
  - Cap email addresses at 254 characters when inviting and signing up. `recordDelivery` refuses longer ones (`varchar(255)` column), and a refused address would stop every notification flush.
  - New tables need the baseline's care, because drizzle-kit doesn't add either by itself (see the `drizzle.config.ts` comment):
    - `ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`
    - `CREATE TABLE IF NOT EXISTS`
  - Hint: the latin1 test lists every table, so a missed one fails loudly.
- **M4e (data and robustness):** webhook setup rotates the engine's secret before saving it (since M4c). If the database fails at that moment, signed deliveries are refused until an Admin presses **Set up webhook** again.
- **Another client on MariaDB:** MariaDB lacks `utf8mb4_0900_ai_ci` before 11.4. The first migration would fail with an unknown-collation error. Document it, or switch the collation, when such a client appears.

## Deferred minor findings (final review)

- **Id columns use `utf8mb4_0900_ai_ci`,** which ignores case and accents. `evt_AbC` and `evt_abc` are one row in MySQL (two in the memory store), so a false duplicate is dropped silently. That's very unlikely with the engine's random ids. Use `utf8mb4_bin` on the id columns if it ever matters.
- **The migration lock name `articles_ai_migrations` is shared across a MySQL server,** so copies on one shared MySQL wait for each other's migrations. A per-database name would be cleaner.
- **mysql2 `maxIdle: 1`** would close idle pool connections after `idleTimeout`. Passenger's idle shutdown already closes them with the process.
- **Test nits:**
  - `tests/unit/vercel-config.test.ts:5` still cites Neon's free compute.
  - `tests/unit/mysql-prepare.test.ts` leaves the MySQL user `articles_ai_test_pw@%` in the local MySQL.
  - The `KILL` test relies on a 300 ms sleep.
