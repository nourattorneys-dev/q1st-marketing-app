# M5c: the dashboard's own sign-in (Clerk → accounts in the dashboard's database) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The dashboard signs people in by itself, with email and password. Accounts, sessions, invitations and password resets live in its own database; links go out through its own mailer; nothing depends on Clerk.

**Architecture:**
- **Tools:** `src/lib/accounts/` holds small pure tools (passwords with scrypt, random tokens, the visitor's address) and an `AccountStore` (memory and MySQL, five new tables).
- **Account services** use the store and the mailer:
  - signing in with guessing limits
  - sessions
  - invitations with resend
  - password resets
  - the first Admin
  - the Users-page directory
- **Settings:** `AUTH_MODE` becomes `password|mock`.
- **Session:** in password mode, `getSession()` reads a `__Host-session` cookie (`session` on http://localhost) and the account behind it on every request.
- **Pages:** sign-in, invitation, forgot-password and reset-password are our own, outside the signed-in shell. The Security page becomes the Account page, with Change password.
- **Removed:** Clerk and the Vercel leftovers.
- **Tests:** a second Playwright server runs the same build in password mode, on the local MySQL.

**Tech Stack:**
- Next.js 16.4 (App Router, Cache Components, standalone build for cPanel), React 19.3 (`useActionState`), TypeScript 5, Zod 4.6, next-intl 4.14
- Drizzle ORM 0.45.4 over mysql2 3.24.6, nodemailer 10.2.1 (M5b)
- `node:crypto` (scrypt, random bytes, sha256) and `node:net` (`isIP`): no new packages
- Vitest 5, Playwright 1.64, pnpm 10; local MySQL 8.4 for the tests

**Spec:** `docs/specs/2026-10-27-m5c-own-sign-in-design.md`

**Checked while writing this plan (2026-10-27):**
- **The visitor's address on the cPanel host:** Passenger hands each request to the Node app over its own HTTP, adding an `X-Forwarded-For` line with Apache's `REMOTE_ADDR` after any line the browser sent (Passenger `SendRequest.cpp`; its `node-loader.js` makes `req.connection.remoteAddress` always `127.0.0.1`). Node joins repeated `X-Forwarded-For` lines with ", ", so the **last** entry is the trustworthy one. `dashboard.fakhernco.com` is "DNS only" in Cloudflare, so Apache sees the real visitor.
- **Playwright order:** Playwright 1.64 starts the `webServer` before `globalSetup` (`createGlobalSetupTasks`: plugin setup, then global setups). `/api/health` doesn't touch the database, so `globalSetup` may drop and recreate the test database after the server is up.
- **Drizzle 0.45.4:**
  - mysql2 results are `[ResultSetHeader, FieldPacket[]]`, so `affectedRows` is on the first element.
  - `DrizzleQueryError` (with `.cause`) and `TransactionRollbackError` are exported from `drizzle-orm`.
  - `char`, `index` and `uniqueIndex` exist in `drizzle-orm/mysql-core`.
- **Scrypt memory:** scrypt with N=2^15, r=8 needs 32 MiB (128·N·r), which is exactly Node's default `maxmem`, so `maxmem` must be raised.
- **Spec correction (committed with this plan):** "return to the page you were trying to open" is dropped. Server pages can't see the address they were opened from without relying on Next.js internals, so after signing in the browser goes to the dashboard's home page.

## Global Constraints

**Packages**
- No new packages.
- Remove `@clerk/nextjs` (7.9.18) and `@clerk/localizations` (4.24.0).
- Nothing in `src/` or `tests/` imports `@clerk/*` at the end.

**Settings (spec "Settings")**
- `AUTH_MODE=password|mock`, default `mock`. `clerk` is refused with: `AUTH_MODE=clerk is no longer supported: the dashboard signs people in itself. Set AUTH_MODE=password, APP_URL and ADMIN_EMAIL.`
- `APP_URL` is required with `password`.
  - It must be `https://`, except `http://localhost` or `http://127.0.0.1`.
  - It's kept as its origin.
  - Every emailed link is built from it, never from the `Host` header.
- `ADMIN_EMAIL` is optional; when set, it's one email of at most 254 characters, trimmed and lowercased.
- `TWO_FACTOR` with `password`:
  - unset means `off`
  - `required` is refused with `Two-factor login arrives in M5d; set TWO_FACTOR=off.`
  - Mock mode keeps today's behaviour (default `required`).
- **A test server** is a development build, or a production build with `ALLOW_TEST_LOGINS=1`. The dev outbox opens on a test server with `EMAIL_MODE=log`, in either sign-in mode.

**Accounts (spec "Accounts", "Passwords and links")**
- **Passwords:**
  - scrypt from `node:crypto`: N=2^15, r=8, p=1, a 64-byte key, a 16-byte random salt and `maxmem` of 64 MiB
  - the password is NFKC-normalised before hashing
  - stored as `scrypt$15$8$1$<salt base64url>$<hash base64url>`
  - checked with `timingSafeEqual`
- **Password rules:**
  - 10 to 200 characters, counted as Unicode code points
  - never trimmed
  - not the account's email (compared trimmed and lowercased)
- **Tokens:** 32 random bytes in base64url. Only their sha256 (64 hex characters) is stored.
- **Ids:** `usr_` or `inv_` followed by 16 random bytes in base64url (22 characters).
- **The session cookie:**
  - `__Host-session` when `APP_URL` is https, `session` otherwise
  - `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` on https
  - lasts 30 days
- **Limits:**
  - 5 failures per email in 15 minutes, and 30 per address in 15 minutes
  - 3 reset emails per email per hour
  - 3 first-Admin emails per 15 minutes
- **Expiry:** invitations last 7 days, reset links 1 hour.
- **The visitor's address:** the last `X-Forwarded-For` entry, if it's a valid IP and not loopback (`127.*`, `::1`). Otherwise there's no address, and only the email limit applies.
- **Log lines** (never passwords or tokens; control characters in emails replaced by `?`):
  - `Signed in: <email> from <address|unknown address>`
  - `Sign-in refused (wrong password): <email> from <address|unknown address>`
  - `Sign-in refused (locked): <email> from <address|unknown address>`
- **New tables:**
  - `ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci` and `CREATE TABLE IF NOT EXISTS`
  - indexes are declared inside `CREATE TABLE`, since MySQL has no `CREATE INDEX IF NOT EXISTS`, so a cut-off first preparation still finishes on the next attempt

**Copy (English, word for word; each has an Arabic version)**
- **Sign-in errors:**
  - wrong details: `Email or password is incorrect.`
  - after the limit: `Too many attempts. Try again in 15 minutes.`
- **Invitation page:**
  - unknown or used link: `This invitation link isn't valid.`
  - expired link: `This invitation has expired. Ask your Admin for a new one.`
- **Forgot password:** `If this email has an account, we've sent a link to reset its password.`
- **Reset link no longer valid:** `This link isn't valid any more. Ask for a new one.`
- **First Admin (sign-in page):**
  - `This dashboard has no Admin yet. An invitation was emailed to {email}.`
  - `This dashboard has no Admin yet. Set ADMIN_EMAIL in the server's settings to create the first Admin.`
  - `This dashboard has no Admin yet, and the setup email couldn't be sent. See the server log.`
- Fakher & Co is a "legal consultancy", never a "law firm".

**Secrets**
- Secrets never go in git, the chat or a build. `.env*` files stay git-ignored.

**How to work**
- Commit only after lint passes: `RC=0; pnpm lint >/dev/null 2>&1 || RC=$?; if [ $RC -eq 0 ]; then git commit …; fi`. Never chain a commit after checks with `;`.
- **Next 16.4 gotcha:** `next build` type-checks every `.ts` file, tests included. Any build or e2e run must happen while every test file's imports exist. The e2e RED steps come before the unit tests that import missing modules.
- `pnpm test` needs the local MySQL (`brew services start mysql@8.4`).
- **Two e2e suites:**
  - `pnpm e2e` runs the existing mock-mode suite (it builds), then the password-mode suite (`playwright.password.config.ts`, port 3101, same build, MySQL database `articles_ai_test_e2e_password`).
  - To run only the password suite: `pnpm e2e:password`, after a build.

## Review Focus

1. **Someone's role is removed while they're signed in:** their very next page sends them to No access (the role is read from the database on each request). Tests: Task 5's session test "reads the person from the session cookie, with the role from their account on each request", and the e2e "removing someone's role takes effect on their next page".
2. **An email typed with capitals or spaces** at sign-in, at "Forgot password" and when inviting: it finds the same account (emails are stored trimmed and lowercased). Tests: Task 3 "signs in whatever the email's case and spaces", Task 4 "asks for a reset whatever the email's case and spaces", Task 5's e2e signs in with `Admin@Example.com`.
3. **An invitation link used a second time, or for an email that meanwhile got an account:** no second account is made, and the page says why. Tests: Task 2's store contract "accepting creates the account once…", Task 4 "an invitation can't be accepted twice, or for an email that already has an account", and Task 6's e2e "the link works once".
4. **A password typed with differently composed characters** (Arabic, or an accented letter typed as letter + accent): it still matches, because passwords are NFKC-normalised. Test: Task 1 "accepts the same password however its characters are composed".
5. **Signing out over HTTPS:** the `__Host-session` cookie is really cleared. A browser only drops a `__Host-` cookie when the clearing cookie has the same `Secure` and `Path=/`. Test: Task 5's sign-out route "clears the __Host-session cookie with Secure and Path=/".

---

## File map

| File | Task | Responsibility |
|---|---|---|
| `src/lib/accounts/passwords.ts` (new) | 1 | `hashPassword`, `verifyPassword`, `dummyHash`, `passwordProblem`, `PASSWORD_MIN/MAX` |
| `src/lib/accounts/tokens.ts` (new) | 1 | `newToken`, `hashToken`, `newId` |
| `src/lib/accounts/request.ts` (new) | 1 | `clientAddress(forwardedFor)` |
| `src/lib/accounts/store.ts` (new) | 2 | `Account`, `Invitation`, `PasswordReset`, `SessionRecord`, `AccountStore` |
| `src/lib/accounts/memory-store.ts` (new) | 2 | `createMemoryAccountStore()` |
| `src/lib/accounts/mysql-store.ts` (new) | 2 | `createMysqlAccountStore(connection)` |
| `src/lib/db/schema.ts`, `drizzle/0001_accounts.sql`, `drizzle/meta/*` | 2 | the five tables and their migration |
| `src/lib/db/index.ts` | 2 | `getAccountStore()`, sharing the MySQL pool with `getStore()` |
| `src/lib/accounts/sign-in.ts` (new) | 3 | `signIn`, `startSession`, `sessionAccount`, `endSession`, `changePassword`, limits |
| `src/lib/notifications/render.ts`, `messages/*.json` (`Email.invitation`, `Email.reset`) | 4 | `renderAccountEmail` |
| `src/lib/notifications/mail-error.ts` | 4 | `describeMailFailure` |
| `src/lib/accounts/invitations.ts` (new) | 4 | `lookUpInvitation`, `acceptInvitation`, `emailInvitation`, `INVITATION_DAYS` |
| `src/lib/accounts/resets.ts` (new) | 4 | `requestReset`, `resetLinkValid`, `completeReset` |
| `src/lib/accounts/first-admin.ts` (new) | 4 | `ensureFirstAdmin`, `maskEmail` |
| `src/lib/accounts/accounts-directory.ts` (new) | 4 | `createAccountsDirectory` (the Users page in password mode) |
| `src/lib/users/types.ts`, `mock-directory.ts`, `directory.ts` | 4, 5 | `resendInvite`, `invitedBy`, `expiresAt`, `mail_failed` (4); the password-mode directory (5) |
| `src/lib/env.ts`, `.env.example` | 5 | `AUTH_MODE=password\|mock`, `APP_URL`, `ADMIN_EMAIL`, `TWO_FACTOR`, `testServer`, `passwordEnv()` |
| `src/lib/accounts/cookie.ts` (new) | 5 | the session cookie's name and options |
| `src/lib/auth/session.ts` | 5 | password-mode `getSession`; `getRole` without Clerk |
| `src/app/[locale]/sign-in/*`, `src/components/auth/sign-in-view.tsx`, `sign-in-form.tsx`, `auth-page.tsx` (new) | 5, 6 | our sign-in page and action |
| `src/app/api/auth/sign-out/route.ts`, `src/components/shell/sign-out-control.tsx` | 5 | sign-out in both modes |
| `src/proxy.ts`, `src/app/[locale]/layout.tsx` | 5 | Clerk removed |
| `src/app/api/dev/outbox/route.ts` | 5 | opens on any test server with `EMAIL_MODE=log` |
| `scripts/cpanel-build.sh`, `scripts/cpanel-deploy.sh` | 5 | `password\|mock` |
| `playwright.password.config.ts`, `tests/e2e-password/*` (new) | 5, 6, 7 | the password-mode e2e suite |
| `src/app/[locale]/invitation/*`, `forgot-password/*`, `reset-password/*` (new), `src/components/auth/*-form.tsx` (new) | 6 | invitation, forgot and reset pages |
| `src/app/[locale]/security/actions.ts` (new), `src/components/security/security-view.tsx`, `change-password-form.tsx` (new) | 6 | the Account page |
| `src/lib/actions/form.ts` (new) | 5 | `formText` |
| `src/app/[locale]/(app)/users/actions.ts`, `src/components/users/*` | 7 | resend, expiry, `notSent`, mail failures |
| `README.md`, `vercel.json`, `tests/unit/vercel-config.test.ts` | 8 | docs; Vercel leftovers removed |

---

### Task 1: Passwords, tokens and the visitor's address

**Files:**
- Create: `src/lib/accounts/passwords.ts`, `src/lib/accounts/tokens.ts`, `src/lib/accounts/request.ts`
- Test: `tests/unit/accounts-tools.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `PASSWORD_MIN = 10`, `PASSWORD_MAX = 200`
  - `type PasswordProblem = "short" | "long" | "email"`
  - `hashPassword(password: string): Promise<string>`
  - `verifyPassword(password: string, stored: string): Promise<boolean>`
  - `dummyHash(): Promise<string>`
  - `passwordProblem(password: string, email: string): PasswordProblem | null`
  - `newToken(): string`, `hashToken(token: string): string`, `newId(prefix: "usr" | "inv"): string`
  - `clientAddress(forwardedFor: string | null): string | null`

None of these files imports `server-only`: the e2e helpers (Task 5) use them outside Next.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/accounts-tools.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { dummyHash, hashPassword, passwordProblem, verifyPassword } from "@/lib/accounts/passwords";
import { clientAddress } from "@/lib/accounts/request";
import { hashToken, newId, newToken } from "@/lib/accounts/tokens";

describe("passwords (spec M5c: scrypt from node:crypto)", () => {
  it("stores a salted scrypt hash that names its settings, and checks it", async () => {
    const stored = await hashPassword("correct horse battery");
    expect(stored).toMatch(/^scrypt\$15\$8\$1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{86}$/);
    expect(await verifyPassword("correct horse battery", stored)).toBe(true);
    expect(await verifyPassword("correct horse batterY", stored)).toBe(false);
    expect(await hashPassword("correct horse battery")).not.toBe(stored);
  });

  it("accepts the same password however its characters are composed (Review Focus 4)", async () => {
    const composed = "مرحبا café 2026!";
    const decomposed = "مرحبا café 2026!";
    expect(decomposed).not.toBe(composed);
    expect(await verifyPassword(decomposed, await hashPassword(composed))).toBe(true);
  });

  it("refuses anything that isn't one of its hashes", async () => {
    for (const stored of ["", "plain-text", "bcrypt$10$abc", "scrypt$15$8$1$", "scrypt$99$8$1$AAAA$BBBB"]) {
      expect(await verifyPassword("anything", stored)).toBe(false);
    }
  });

  it("has a dummy hash that no password matches, for unknown emails", async () => {
    expect(await dummyHash()).toBe(await dummyHash());
    expect(await verifyPassword("", await dummyHash())).toBe(false);
  });

  it("asks for 10 to 200 characters, counted as characters, never trimmed, and not the email", () => {
    expect(passwordProblem("123456789", "a@example.com")).toBe("short");
    expect(passwordProblem("1234567890", "a@example.com")).toBeNull();
    expect(passwordProblem(" 12345678 ", "a@example.com")).toBeNull();
    expect(passwordProblem("🙂".repeat(10), "a@example.com")).toBeNull();
    expect(passwordProblem("x".repeat(200), "a@example.com")).toBeNull();
    expect(passwordProblem("x".repeat(201), "a@example.com")).toBe("long");
    expect(passwordProblem(" Sara.Ali@Example.com ", "sara.ali@example.com")).toBe("email");
  });
});

describe("tokens", () => {
  it("makes 256-bit URL-safe tokens and stores only their sha256", () => {
    const token = newToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newToken()).not.toBe(token);
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toContain(token);
  });

  it("makes ids the Users page accepts", () => {
    expect(newId("usr")).toMatch(/^usr_[A-Za-z0-9_-]{22}$/);
    expect(newId("inv")).toMatch(/^inv_[A-Za-z0-9_-]{22}$/);
  });
});

describe("the visitor's address (Passenger appends the real one last)", () => {
  it("takes the last X-Forwarded-For entry, so a forged first entry is ignored", () => {
    expect(clientAddress("203.0.113.5")).toBe("203.0.113.5");
    expect(clientAddress("198.51.100.1, 203.0.113.5")).toBe("203.0.113.5");
    expect(clientAddress("2001:db8::1")).toBe("2001:db8::1");
    expect(clientAddress("::ffff:203.0.113.5")).toBe("203.0.113.5");
  });

  it("has no address for this machine, junk or nothing, so the per-address limit can't lock everyone at once", () => {
    for (const value of [null, "", "127.0.0.1", "198.51.100.1, 127.0.0.1", "::1", "not-an-address", "203.0.113.5:443"]) {
      expect(clientAddress(value)).toBeNull();
    }
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
pnpm vitest run tests/unit/accounts-tools.test.ts 2>&1 | tail -8
```

Expected: FAIL. The suite can't resolve `@/lib/accounts/passwords`, so no test runs.

- [ ] **Step 3: Write the tools**

Create `src/lib/accounts/passwords.ts`:

```ts
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// Spec M5c: scrypt from node:crypto (no package, no native module for the cPanel host). The stored form names its
// settings, so they can be raised later without breaking existing passwords.
const COST_LOG2 = 15;
const BLOCK_SIZE = 8;
const PARALLEL = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
// 128 × N × r = 32 MiB for N = 2^15 and r = 8: exactly Node's default ceiling, so it's raised.
const MAX_MEMORY = 64 * 1024 * 1024;

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 200;
export type PasswordProblem = "short" | "long" | "email";

type Settings = { logN: number; r: number; p: number };

function derive(password: string, salt: Buffer, settings: Settings, length: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // NFKC: the same password typed on another keyboard (a letter plus an accent, Arabic forms) gives the same bytes.
    scrypt(password.normalize("NFKC"), salt, length, { N: 2 ** settings.logN, r: settings.r, p: settings.p, maxmem: MAX_MEMORY }, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(password, salt, { logN: COST_LOG2, r: BLOCK_SIZE, p: PARALLEL }, KEY_LENGTH);
  return ["scrypt", COST_LOG2, BLOCK_SIZE, PARALLEL, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, logN, r, p, salt, key] = stored.split("$");
  const settings = { logN: Number(logN), r: Number(r), p: Number(p) };
  if (scheme !== "scrypt" || !salt || !key) return false;
  if (![settings.logN, settings.r, settings.p].every(Number.isInteger) || settings.logN < 10 || settings.logN > 20 || settings.r < 1 || settings.r > 32 || settings.p !== 1) return false;
  const expected = Buffer.from(key, "base64url");
  if (expected.length !== KEY_LENGTH) return false;
  return timingSafeEqual(await derive(password, Buffer.from(salt, "base64url"), settings, expected.length), expected);
}

let dummy: Promise<string> | null = null;

/** A real hash of a random password: an unknown email is checked against it, so the time taken gives nothing away. */
export function dummyHash(): Promise<string> {
  return (dummy ??= hashPassword(randomBytes(24).toString("base64url")));
}

/** 10 to 200 characters (code points: an emoji or an Arabic letter is one), never trimmed, and not the email. */
export function passwordProblem(password: string, email: string): PasswordProblem | null {
  const length = [...password].length;
  if (length < PASSWORD_MIN) return "short";
  if (length > PASSWORD_MAX) return "long";
  if (password.trim().toLowerCase() === email.trim().toLowerCase()) return "email";
  return null;
}
```

Create `src/lib/accounts/tokens.ts`:

```ts
import { createHash, randomBytes } from "node:crypto";

/** 32 random bytes (256 bits), URL-safe: invitation and reset links, and session cookies. */
export const newToken = (): string => randomBytes(32).toString("base64url");

/** Only this is stored, so a copy of the database holds no working link or session. */
export const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");

/** `usr_…` or `inv_…`: 16 random bytes, URL-safe (22 characters), within the Users page's id rule. */
export const newId = (prefix: "usr" | "inv"): string => `${prefix}_${randomBytes(16).toString("base64url")}`;
```

Create `src/lib/accounts/request.ts`:

```ts
import { isIP } from "node:net";

/**
 * The visitor's internet address, for the per-address sign-in limit and the sign-in log. On the cPanel host Passenger
 * adds its own X-Forwarded-For line, after any the browser sent, carrying Apache's REMOTE_ADDR; Node joins repeated
 * lines with ", ", so only the last entry is trusted. Null when there's none, or it's this machine (a local run, where
 * every visitor would share one address and the limit would lock everyone at once).
 */
export function clientAddress(forwardedFor: string | null): string | null {
  const last = forwardedFor?.split(",").at(-1)?.trim() ?? "";
  const address = last.toLowerCase().startsWith("::ffff:") ? last.slice(7) : last;
  if (!isIP(address)) return null;
  if (address === "::1" || address.startsWith("127.")) return null;
  return address;
}
```

- [ ] **Step 4: Run them and watch them pass**

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
pnpm vitest run tests/unit/accounts-tools.test.ts 2>&1 | tail -6
```

Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
RC=0; pnpm lint >/dev/null 2>&1 || RC=$?
if [ $RC -eq 0 ]; then
  git add src/lib/accounts/passwords.ts src/lib/accounts/tokens.ts src/lib/accounts/request.ts tests/unit/accounts-tools.test.ts
  git commit -m "feat(accounts): scrypt passwords, hashed tokens and the visitor's address (M5c)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
else echo "lint failed: RC=$RC"; fi
```

Task test command: `pnpm vitest run tests/unit/accounts-tools.test.ts`

---

### Task 2: The account tables and `AccountStore`

**Files:**
- Create: `src/lib/accounts/store.ts`, `src/lib/accounts/memory-store.ts`, `src/lib/accounts/mysql-store.ts`
- Modify: `src/lib/db/schema.ts` (five tables), `src/lib/db/index.ts` (`getAccountStore`)
- Create: `drizzle/0001_accounts.sql` (generated, then replaced with the SQL below), with `drizzle/meta/_journal.json` and `drizzle/meta/0001_snapshot.json` from the generator
- Test: `tests/unit/account-store.test.ts` (new); modify `tests/unit/mysql-store.test.ts` (table list and counts)

**Interfaces:**
- Consumes: `Role` (`@/lib/auth/roles`), `MysqlConnection` (`@/lib/db/mysql`).
- Produces (in `src/lib/accounts/store.ts`):

```ts
export type Account = { id: string; email: string; name: string; role: Role | null; passwordHash: string; createdAt: Date; passwordChangedAt: Date; lastSignInAt: Date | null };
export type Invitation = { id: string; email: string; role: Role; tokenHash: string; invitedBy: string | null; createdAt: Date; expiresAt: Date };
export type PasswordReset = { tokenHash: string; userId: string; createdAt: Date; expiresAt: Date };
export type SessionRecord = { tokenHash: string; userId: string; createdAt: Date; expiresAt: Date };
export interface AccountStore { /* the methods in Step 3 */ }
```

- Also produced:
  - `createMemoryAccountStore(): AccountStore`
  - `createMysqlAccountStore(connection: Pick<MysqlConnection, "db" | "ready">): AccountStore`
  - `getAccountStore(): AccountStore` in `@/lib/db`

- [ ] **Step 1: Write the failing contract tests**

Create `tests/unit/account-store.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMemoryAccountStore } from "@/lib/accounts/memory-store";
import { createMysqlAccountStore } from "@/lib/accounts/mysql-store";
import type { Account, AccountStore, Invitation } from "@/lib/accounts/store";
import { connectMysql, type MysqlConnection } from "@/lib/db/mysql";
import { freshTestDatabase } from "./mysql-test-db";

const at = (minute: number) => new Date(Date.UTC(2026, 9, 27, 8, minute, 0, 123));
let sequence = 0;
const account = (email: string, changes: Partial<Account> = {}): Account => ({
  id: `usr_test${++sequence}`,
  email,
  name: "Sara Ali",
  role: "reviewer",
  passwordHash: "scrypt$15$8$1$salt$hash",
  createdAt: at(sequence),
  passwordChangedAt: at(sequence),
  lastSignInAt: null,
  ...changes,
});
const invitation = (email: string, changes: Partial<Invitation> = {}): Invitation => ({
  id: `inv_test${++sequence}`,
  email,
  role: "reviewer",
  tokenHash: `${sequence}`.padStart(64, "a"),
  invitedBy: null,
  createdAt: at(sequence),
  expiresAt: at(sequence + 60),
  ...changes,
});

const TABLES = ["users", "sessions", "invitations", "password_resets", "sign_in_limits"];
let mysql: MysqlConnection;

beforeAll(async () => {
  mysql = connectMysql(await freshTestDatabase("account_store"));
  await mysql.ready();
});

afterAll(async () => {
  await mysql?.close();
});

async function emptyMysqlStore(): Promise<AccountStore> {
  for (const table of TABLES) await mysql.pool.query(`DELETE FROM \`${table}\``);
  return createMysqlAccountStore(mysql);
}

describe.each([
  { name: "the in-memory account store", createStore: async (): Promise<AccountStore> => createMemoryAccountStore() },
  { name: "the MySQL account store", createStore: emptyMysqlStore },
])("$name (spec M5c)", ({ createStore }) => {
  it("keeps one account per email, finds it by id and email, and lists them oldest first", async () => {
    const store = await createStore();
    const omar = account("omar@example.com");
    const sara = account("sara@example.com", { name: "سارة علي 👋", role: "admin" });
    expect(await store.createAccount(omar)).toBe(true);
    expect(await store.createAccount(sara)).toBe(true);
    expect(await store.createAccount(account("sara@example.com"))).toBe(false);
    expect(await store.account(sara.id)).toEqual(sara);
    expect(await store.accountByEmail("sara@example.com")).toEqual(sara);
    expect(await store.accountByEmail("nobody@example.com")).toBeNull();
    expect((await store.accounts()).map((a) => a.email)).toEqual(["omar@example.com", "sara@example.com"]);
    expect(await store.hasAdmin()).toBe(true);
  });

  it("changes a role, a password and the last sign-in", async () => {
    const store = await createStore();
    const omar = account("omar@example.com");
    await store.createAccount(omar);
    expect(await store.hasAdmin()).toBe(false);
    expect(await store.setRole(omar.id, "admin")).toMatchObject({ id: omar.id, role: "admin" });
    expect(await store.setRole("usr_missing", "admin")).toBeNull();
    await store.setPassword(omar.id, "scrypt$15$8$1$new$hash", at(30));
    await store.recordSignIn(omar.id, at(31));
    expect(await store.account(omar.id)).toMatchObject({ passwordHash: "scrypt$15$8$1$new$hash", passwordChangedAt: at(30), lastSignInAt: at(31), role: "admin" });
  });

  it("finds an account through a live session only, and ends one or all of someone's sessions", async () => {
    const store = await createStore();
    const omar = account("omar@example.com");
    await store.createAccount(omar);
    for (const hash of ["a", "b", "c"]) await store.createSession({ tokenHash: hash.repeat(64), userId: omar.id, createdAt: at(0), expiresAt: at(30) });
    expect(await store.sessionAccount("a".repeat(64), at(10))).toEqual(omar);
    expect(await store.sessionAccount("a".repeat(64), at(30))).toBeNull();
    expect(await store.sessionAccount("z".repeat(64), at(10))).toBeNull();
    await store.deleteSession("a".repeat(64));
    expect(await store.sessionAccount("a".repeat(64), at(10))).toBeNull();
    await store.deleteSessionsOf(omar.id, "b".repeat(64));
    expect(await store.sessionAccount("b".repeat(64), at(10))).toEqual(omar);
    expect(await store.sessionAccount("c".repeat(64), at(10))).toBeNull();
    await store.deleteSessionsOf(omar.id);
    expect(await store.sessionAccount("b".repeat(64), at(10))).toBeNull();
  });

  it("keeps one invitation per email, finds it by id, email and token, renews and deletes it", async () => {
    const store = await createStore();
    const first = invitation("new@example.com");
    expect(await store.addInvitation(first)).toBe(true);
    expect(await store.addInvitation(invitation("new@example.com"))).toBe(false);
    expect(await store.invitation(first.id)).toEqual(first);
    expect(await store.invitationByEmail("new@example.com")).toEqual(first);
    expect(await store.invitationByToken(first.tokenHash)).toEqual(first);
    const renewal = { tokenHash: "f".repeat(64), createdAt: at(40), expiresAt: at(100) };
    expect(await store.renewInvitation(first.id, renewal)).toBe(true);
    expect(await store.invitationByToken(first.tokenHash)).toBeNull();
    expect(await store.invitationByToken("f".repeat(64))).toEqual({ ...first, ...renewal });
    expect(await store.renewInvitation("inv_missing", renewal)).toBe(false);
    expect((await store.invitations()).map((i) => i.id)).toEqual([first.id]);
    expect(await store.deleteInvitation(first.id)).toBe(true);
    expect(await store.deleteInvitation(first.id)).toBe(false);
  });

  it("accepting creates the account once and removes the invitation; never for an email that already has an account (Review Focus 3)", async () => {
    const store = await createStore();
    const invite = invitation("new@example.com");
    await store.addInvitation(invite);
    const created = account("new@example.com");
    expect(await store.acceptInvitation(invite.id, created)).toBe(true);
    expect(await store.accountByEmail("new@example.com")).toEqual(created);
    expect(await store.invitation(invite.id)).toBeNull();
    expect(await store.acceptInvitation(invite.id, account("new@example.com"))).toBe(false);

    const second = invitation("taken@example.com");
    await store.addInvitation(second);
    await store.createAccount(account("taken@example.com"));
    expect(await store.acceptInvitation(second.id, account("taken@example.com"))).toBe(false);
    expect(await store.invitation(second.id)).toEqual(second);
    expect((await store.accounts()).filter((a) => a.email === "taken@example.com")).toHaveLength(1);
  });

  it("keeps password resets by token and deletes all of someone's", async () => {
    const store = await createStore();
    const reset = { tokenHash: "d".repeat(64), userId: "usr_x", createdAt: at(0), expiresAt: at(60) };
    await store.createReset(reset);
    await store.createReset({ ...reset, tokenHash: "e".repeat(64) });
    expect(await store.resetByToken("d".repeat(64))).toEqual(reset);
    await store.deleteResetsOf("usr_x");
    expect(await store.resetByToken("d".repeat(64))).toBeNull();
    expect(await store.resetByToken("e".repeat(64))).toBeNull();
  });

  it("counts hits within a window, starts a new window once it has passed, and clears", async () => {
    const store = await createStore();
    const window = 15 * 60_000;
    expect(await store.hits("email:a@example.com", at(0), window)).toBe(0);
    expect(await store.hit("email:a@example.com", at(0), window)).toBe(1);
    expect(await store.hit("email:a@example.com", at(5), window)).toBe(2);
    expect(await store.hit("email:a@example.com", at(14), window)).toBe(3);
    expect(await store.hits("email:a@example.com", at(14), window)).toBe(3);
    expect(await store.hits("email:a@example.com", at(15), window)).toBe(0);
    expect(await store.hit("email:a@example.com", at(15), window)).toBe(1);
    await store.clearHits("email:a@example.com");
    expect(await store.hits("email:a@example.com", at(15), window)).toBe(0);
  });

  it("forgets expired sessions and resets, old invitations and old limit windows, and keeps the rest", async () => {
    const store = await createStore();
    const omar = account("omar@example.com");
    await store.createAccount(omar);
    await store.createSession({ tokenHash: "1".repeat(64), userId: omar.id, createdAt: at(0), expiresAt: at(10) });
    await store.createSession({ tokenHash: "2".repeat(64), userId: omar.id, createdAt: at(0), expiresAt: at(50) });
    await store.createReset({ tokenHash: "3".repeat(64), userId: omar.id, createdAt: at(0), expiresAt: at(10) });
    await store.addInvitation(invitation("old@example.com", { expiresAt: at(5) }));
    await store.addInvitation(invitation("recent@example.com", { expiresAt: at(15) }));
    await store.hit("ip:203.0.113.5", at(0), 60_000);
    await store.hit("ip:198.51.100.1", at(25), 60_000);
    await store.forgetExpired({ now: at(20), invitationsBefore: at(10), limitsBefore: at(20) });
    expect(await store.sessionAccount("1".repeat(64), at(5))).toBeNull();
    expect(await store.sessionAccount("2".repeat(64), at(20))).toEqual(omar);
    expect(await store.resetByToken("3".repeat(64))).toBeNull();
    expect((await store.invitations()).map((i) => i.email)).toEqual(["recent@example.com"]);
    expect(await store.hits("ip:203.0.113.5", at(0), 3_600_000)).toBe(0);
    expect(await store.hits("ip:198.51.100.1", at(25), 60_000)).toBe(1);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
pnpm vitest run tests/unit/account-store.test.ts 2>&1 | tail -8
```

Expected: FAIL. The suite can't resolve `@/lib/accounts/memory-store`, so no test runs.

- [ ] **Step 3: Write the store interface and the memory store**

Create `src/lib/accounts/store.ts`:

```ts
import type { Role } from "@/lib/auth/roles";

/** Someone who can sign in (spec M5c). The email is stored trimmed and lowercased, at most 254 characters. */
export type Account = {
  id: string;
  email: string;
  name: string;
  role: Role | null;
  passwordHash: string;
  createdAt: Date;
  passwordChangedAt: Date;
  lastSignInAt: Date | null;
};
export type Invitation = { id: string; email: string; role: Role; tokenHash: string; invitedBy: string | null; createdAt: Date; expiresAt: Date };
export type PasswordReset = { tokenHash: string; userId: string; createdAt: Date; expiresAt: Date };
export type SessionRecord = { tokenHash: string; userId: string; createdAt: Date; expiresAt: Date };

/** The accounts behind this dashboard and their sign-in state: in memory locally and in tests, in the client's MySQL on a server. */
export interface AccountStore {
  account(id: string): Promise<Account | null>;
  accountByEmail(email: string): Promise<Account | null>;
  /** Oldest first. */
  accounts(): Promise<Account[]>;
  hasAdmin(): Promise<boolean>;
  /** False when the email already has an account. */
  createAccount(account: Account): Promise<boolean>;
  setRole(id: string, role: Role | null): Promise<Account | null>;
  setPassword(id: string, passwordHash: string, at: Date): Promise<void>;
  recordSignIn(id: string, at: Date): Promise<void>;

  createSession(session: SessionRecord): Promise<void>;
  /** The account behind a live session; null when the session is unknown or has expired. */
  sessionAccount(tokenHash: string, now: Date): Promise<Account | null>;
  deleteSession(tokenHash: string): Promise<void>;
  /** Ends someone's sessions: all of them, or all but `except`. */
  deleteSessionsOf(userId: string, except?: string): Promise<void>;

  /** Oldest first. */
  invitations(): Promise<Invitation[]>;
  invitation(id: string): Promise<Invitation | null>;
  invitationByEmail(email: string): Promise<Invitation | null>;
  invitationByToken(tokenHash: string): Promise<Invitation | null>;
  /** False when the email already has an invitation. */
  addInvitation(invitation: Invitation): Promise<boolean>;
  /** A resend: a new link and expiry for the same invitation. False when it no longer exists. */
  renewInvitation(id: string, renewal: { tokenHash: string; createdAt: Date; expiresAt: Date }): Promise<boolean>;
  deleteInvitation(id: string): Promise<boolean>;
  /** Creates the account and deletes the invitation together. False when the invitation is gone or the email already has an account. */
  acceptInvitation(id: string, account: Account): Promise<boolean>;

  createReset(reset: PasswordReset): Promise<void>;
  resetByToken(tokenHash: string): Promise<PasswordReset | null>;
  deleteResetsOf(userId: string): Promise<void>;

  /** One more within the window that started at the first hit (a new window once it has passed); returns the count. */
  hit(key: string, now: Date, windowMs: number): Promise<number>;
  /** The current window's count, 0 once it has passed. */
  hits(key: string, now: Date, windowMs: number): Promise<number>;
  clearHits(key: string): Promise<void>;

  /** Deletes expired sessions and resets, invitations that expired before `invitationsBefore`, and limit windows that started before `limitsBefore`. */
  forgetExpired(cutoffs: { now: Date; invitationsBefore: Date; limitsBefore: Date }): Promise<void>;
}
```

Create `src/lib/accounts/memory-store.ts`:

```ts
import type { Account, AccountStore, Invitation, PasswordReset, SessionRecord } from "./store";

const copy = <T>(value: T): T => structuredClone(value);
const oldestFirst = (a: { createdAt: Date; id: string }, b: { createdAt: Date; id: string }) =>
  a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id);

/** DB_MODE=memory: the accounts in this server process's memory (local development and tests). */
export function createMemoryAccountStore(): AccountStore {
  const accounts = new Map<string, Account>();
  const sessions = new Map<string, SessionRecord>();
  const invitations = new Map<string, Invitation>();
  const resets = new Map<string, PasswordReset>();
  const limits = new Map<string, { count: number; windowStart: Date }>();
  const byEmail = (email: string) => [...accounts.values()].find((account) => account.email === email);
  const live = (key: string, now: Date, windowMs: number) => {
    const entry = limits.get(key);
    return entry && entry.windowStart.getTime() > now.getTime() - windowMs ? entry : undefined;
  };

  return {
    async account(id) {
      const found = accounts.get(id);
      return found ? copy(found) : null;
    },
    async accountByEmail(email) {
      const found = byEmail(email);
      return found ? copy(found) : null;
    },
    async accounts() {
      return [...accounts.values()].sort(oldestFirst).map(copy);
    },
    async hasAdmin() {
      return [...accounts.values()].some((account) => account.role === "admin");
    },
    async createAccount(account) {
      if (byEmail(account.email)) return false;
      accounts.set(account.id, copy(account));
      return true;
    },
    async setRole(id, role) {
      const found = accounts.get(id);
      if (!found) return null;
      found.role = role;
      return copy(found);
    },
    async setPassword(id, passwordHash, at) {
      const found = accounts.get(id);
      if (found) Object.assign(found, { passwordHash, passwordChangedAt: new Date(at) });
    },
    async recordSignIn(id, at) {
      const found = accounts.get(id);
      if (found) found.lastSignInAt = new Date(at);
    },

    async createSession(session) {
      sessions.set(session.tokenHash, copy(session));
    },
    async sessionAccount(tokenHash, now) {
      const session = sessions.get(tokenHash);
      if (!session || session.expiresAt.getTime() <= now.getTime()) return null;
      const found = accounts.get(session.userId);
      return found ? copy(found) : null;
    },
    async deleteSession(tokenHash) {
      sessions.delete(tokenHash);
    },
    async deleteSessionsOf(userId, except) {
      for (const [hash, session] of sessions) if (session.userId === userId && hash !== except) sessions.delete(hash);
    },

    async invitations() {
      return [...invitations.values()].sort(oldestFirst).map(copy);
    },
    async invitation(id) {
      const found = invitations.get(id);
      return found ? copy(found) : null;
    },
    async invitationByEmail(email) {
      const found = [...invitations.values()].find((invitation) => invitation.email === email);
      return found ? copy(found) : null;
    },
    async invitationByToken(tokenHash) {
      const found = [...invitations.values()].find((invitation) => invitation.tokenHash === tokenHash);
      return found ? copy(found) : null;
    },
    async addInvitation(invitation) {
      if ([...invitations.values()].some((existing) => existing.email === invitation.email)) return false;
      invitations.set(invitation.id, copy(invitation));
      return true;
    },
    async renewInvitation(id, renewal) {
      const found = invitations.get(id);
      if (!found) return false;
      invitations.set(id, { ...found, ...copy(renewal) });
      return true;
    },
    async deleteInvitation(id) {
      return invitations.delete(id);
    },
    async acceptInvitation(id, account) {
      if (!invitations.has(id) || byEmail(account.email)) return false;
      invitations.delete(id);
      accounts.set(account.id, copy(account));
      return true;
    },

    async createReset(reset) {
      resets.set(reset.tokenHash, copy(reset));
    },
    async resetByToken(tokenHash) {
      const found = resets.get(tokenHash);
      return found ? copy(found) : null;
    },
    async deleteResetsOf(userId) {
      for (const [hash, reset] of resets) if (reset.userId === userId) resets.delete(hash);
    },

    async hit(key, now, windowMs) {
      const entry = live(key, now, windowMs);
      if (!entry) {
        limits.set(key, { count: 1, windowStart: new Date(now) });
        return 1;
      }
      entry.count += 1;
      return entry.count;
    },
    async hits(key, now, windowMs) {
      return live(key, now, windowMs)?.count ?? 0;
    },
    async clearHits(key) {
      limits.delete(key);
    },

    async forgetExpired({ now, invitationsBefore, limitsBefore }) {
      for (const [hash, session] of sessions) if (session.expiresAt.getTime() <= now.getTime()) sessions.delete(hash);
      for (const [hash, reset] of resets) if (reset.expiresAt.getTime() <= now.getTime()) resets.delete(hash);
      for (const [id, invitation] of invitations) if (invitation.expiresAt.getTime() <= invitationsBefore.getTime()) invitations.delete(id);
      for (const [key, entry] of limits) if (entry.windowStart.getTime() <= limitsBefore.getTime()) limits.delete(key);
    },
  };
}
```

- [ ] **Step 4: Add the tables to the schema, and generate the migration**

In `src/lib/db/schema.ts`:

1. Change the first import line to:

```ts
import { boolean, char, datetime, index, int, json, mysqlTable, primaryKey, text, varchar } from "drizzle-orm/mysql-core";
import type { Role } from "@/lib/auth/roles";
```

2. Append at the end of the file:

```ts
// M5c: the dashboard's own sign-in. Emails are stored trimmed and lowercased (at most 254 characters, as everywhere);
// tokens only as their sha256 (64 hex characters), so a copy of the database holds no working link or session.

/** Someone who can sign in. role null = No access (the account stays). */
export const users = mysqlTable("users", {
  id: key("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique("users_email"),
  name: varchar("name", { length: 200 }).notNull(),
  role: varchar("role", { length: 16 }).$type<Role>(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  createdAt: at("created_at").notNull(),
  passwordChangedAt: at("password_changed_at").notNull(),
  lastSignInAt: at("last_sign_in_at"),
});

/** A signed-in browser: the session cookie's hash (30 days). */
export const sessions = mysqlTable(
  "sessions",
  {
    tokenHash: char("token_hash", { length: 64 }).primaryKey(),
    userId: key("user_id").notNull(),
    createdAt: at("created_at").notNull(),
    expiresAt: at("expires_at").notNull(),
  },
  (table) => [index("sessions_user_id").on(table.userId)],
);

/** At most one pending invitation per email (7 days); deleted when accepted or revoked. */
export const invitations = mysqlTable("invitations", {
  id: key("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique("invitations_email"),
  role: varchar("role", { length: 16 }).$type<Role>().notNull(),
  tokenHash: char("token_hash", { length: 64 }).notNull().unique("invitations_token_hash"),
  invitedBy: key("invited_by"),
  createdAt: at("created_at").notNull(),
  expiresAt: at("expires_at").notNull(),
});

/** A "Forgot password" link (1 hour); all of someone's are deleted when one is used. */
export const passwordResets = mysqlTable(
  "password_resets",
  {
    tokenHash: char("token_hash", { length: 64 }).primaryKey(),
    userId: key("user_id").notNull(),
    createdAt: at("created_at").notNull(),
    expiresAt: at("expires_at").notNull(),
  },
  (table) => [index("password_resets_user_id").on(table.userId)],
);

/** Guessing limits: `email:<address>`, `ip:<address>`, `reset:<address>`, `setup:<address>`, each a count in a window. */
export const signInLimits = mysqlTable("sign_in_limits", {
  key: varchar("key", { length: 300 }).primaryKey(),
  count: int("count").notNull(),
  windowStart: at("window_start").notNull(),
});
```

Then generate the migration, which writes the snapshot and the journal entry:

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
pnpm db:generate --name accounts 2>&1 | tail -3
ls drizzle drizzle/meta
```

Expected: `drizzle/0001_accounts.sql`, `drizzle/meta/0001_snapshot.json`, and `_journal.json` with a second entry tagged `0001_accounts`.

Replace the whole content of `drizzle/0001_accounts.sql` with this. It keeps drizzle-kit's tables, with `IF NOT EXISTS`, the utf8mb4 options, and the indexes inside each `CREATE TABLE`:

```sql
CREATE TABLE IF NOT EXISTS `invitations` (
	`id` varchar(191) NOT NULL,
	`email` varchar(255) NOT NULL,
	`role` varchar(16) NOT NULL,
	`token_hash` char(64) NOT NULL,
	`invited_by` varchar(191),
	`created_at` datetime(3) NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	CONSTRAINT `invitations_id` PRIMARY KEY(`id`),
	CONSTRAINT `invitations_email` UNIQUE(`email`),
	CONSTRAINT `invitations_token_hash` UNIQUE(`token_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `password_resets` (
	`token_hash` char(64) NOT NULL,
	`user_id` varchar(191) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	CONSTRAINT `password_resets_token_hash` PRIMARY KEY(`token_hash`),
	INDEX `password_resets_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sessions` (
	`token_hash` char(64) NOT NULL,
	`user_id` varchar(191) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	CONSTRAINT `sessions_token_hash` PRIMARY KEY(`token_hash`),
	INDEX `sessions_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sign_in_limits` (
	`key` varchar(300) NOT NULL,
	`count` int NOT NULL,
	`window_start` datetime(3) NOT NULL,
	CONSTRAINT `sign_in_limits_key` PRIMARY KEY(`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `users` (
	`id` varchar(191) NOT NULL,
	`email` varchar(255) NOT NULL,
	`name` varchar(200) NOT NULL,
	`role` varchar(16),
	`password_hash` varchar(255) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`password_changed_at` datetime(3) NOT NULL,
	`last_sign_in_at` datetime(3),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email` UNIQUE(`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

**If drizzle-kit names the constraints or keys differently** in its own output (for example `users_email_unique`): keep its names. Only the `IF NOT EXISTS`, the utf8mb4 tail and the inline `INDEX` lines are this plan's edits.

- [ ] **Step 5: Write the MySQL store**

Create `src/lib/accounts/mysql-store.ts`:

```ts
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
```

- [ ] **Step 6: Share the MySQL pool with `getStore()`**

Replace the body of `src/lib/db/index.ts` after its imports with the following, and add the two account imports:

```ts
import { createMemoryAccountStore } from "@/lib/accounts/memory-store";
import { createMysqlAccountStore } from "@/lib/accounts/mysql-store";
import type { AccountStore } from "@/lib/accounts/store";
```

```ts
const MEMORY = Symbol.for("articles-ai.memory-store");
const MEMORY_ACCOUNTS = Symbol.for("articles-ai.memory-accounts");
// Kept on globalThis, like the memory store: the server build loads this module in more than one runtime (route
// handlers and pages), and each copy would otherwise open its own pool: 6 connections instead of 3 (M5a final review).
// The account store shares the same pool (spec M5c).
const MYSQL = Symbol.for("articles-ai.mysql-store");

type MysqlStores = { url: string; store: AppStore; accounts: AccountStore };

function mysqlStores(url: string): MysqlStores {
  const holder = globalThis as unknown as Record<symbol, MysqlStores | undefined>;
  let current = holder[MYSQL];
  if (current?.url !== url) {
    const connection = connectMysql(url);
    holder[MYSQL] = current = { url, store: createMysqlStore(connection), accounts: createMysqlAccountStore(connection) };
  }
  return current;
}

/** The dashboard's store: the client's MySQL (DB_MODE=mysql), or one in-memory store per server process (local and tests). */
export function getStore(): AppStore {
  const env = servicesEnv();
  if (env.dbMode === "memory") {
    const holder = globalThis as unknown as Record<symbol, AppStore | undefined>;
    return (holder[MEMORY] ??= createMemoryStore());
  }
  return mysqlStores(env.databaseUrl ?? "").store;
}

/** The accounts (spec M5c), beside getStore() and on the same MySQL pool. */
export function getAccountStore(): AccountStore {
  const env = servicesEnv();
  if (env.dbMode === "memory") {
    const holder = globalThis as unknown as Record<symbol, AccountStore | undefined>;
    return (holder[MEMORY_ACCOUNTS] ??= createMemoryAccountStore());
  }
  return mysqlStores(env.databaseUrl ?? "").accounts;
}
```

In `tests/unit/get-store.test.ts`, add this case inside the `describe`:

```ts
  it("gives the account store the same MySQL pool, once per process (spec M5c)", async () => {
    vi.stubEnv("DB_MODE", "mysql");
    vi.stubEnv("DATABASE_URL", "mysql://nobody@127.0.0.1:1/never");
    const first = (await import("@/lib/db")).getAccountStore();
    vi.resetModules();
    expect((await import("@/lib/db")).getAccountStore()).toBe(first);
  });
```

- [ ] **Step 7: Update the table lists in the M5a tests**

In `tests/unit/mysql-store.test.ts`:
- In "creates utf8mb4 tables even where the database defaults to latin1", replace the expected list with `["invitations", "notification_deliveries", "notification_prefs", "notifications", "password_resets", "sessions", "sign_in_limits", "users", "webhook_config", "webhook_events"]`.
- In "finishes the job when a first attempt was cut off after some tables", change `toBe(5)` to `toBe(10)` and the migrations count `toBe(1)` to `toBe(2)`.

- [ ] **Step 8: Run the tests and watch them pass**

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
pnpm vitest run tests/unit/account-store.test.ts tests/unit/mysql-store.test.ts tests/unit/get-store.test.ts tests/unit/store.test.ts 2>&1 | tail -6
pnpm typecheck 2>&1 | tail -3
```

Expected:
- PASS for all four files: `account-store.test.ts` has 16 tests (8 cases × 2 stores), and the latin1 test lists ten utf8mb4 tables.
- No type errors.

If a MySQL case fails only on the `hit` window arithmetic, print the row and check that `IF(window_start <= cutoff, …)` runs before `window_start` is reassigned (the order of the `set` keys). Ledger the fix as a ruling.

- [ ] **Step 9: Commit**

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
RC=0; pnpm lint >/dev/null 2>&1 || RC=$?
if [ $RC -eq 0 ]; then
  git add src/lib/accounts/store.ts src/lib/accounts/memory-store.ts src/lib/accounts/mysql-store.ts src/lib/db/schema.ts src/lib/db/index.ts drizzle tests/unit/account-store.test.ts tests/unit/mysql-store.test.ts tests/unit/get-store.test.ts
  git commit -m "feat(accounts): five account tables and AccountStore on memory and MySQL, sharing the pool (M5c)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
else echo "lint failed: RC=$RC"; fi
```

Task test command: `pnpm vitest run tests/unit/account-store.test.ts tests/unit/mysql-store.test.ts tests/unit/get-store.test.ts tests/unit/store.test.ts`

---
### Task 3: Signing in, sessions and changing a password

**Files:**
- Create: `src/lib/accounts/sign-in.ts`
- Test: `tests/unit/accounts-sign-in.test.ts`

**Interfaces:**
- Consumes:
  - Task 1: `hashPassword`, `verifyPassword`, `dummyHash`, `passwordProblem`, `newToken` and `hashToken`
  - Task 2: `AccountStore` and `Account`
  - `normalizeEmail` from `@/lib/users/rules`
- Produces:
  - `SESSION_DAYS = 30`, `SIGN_IN_WINDOW_MS = 900_000`, `EMAIL_ATTEMPTS = 5`, `ADDRESS_ATTEMPTS = 30`
  - `type NewSession = { token: string; expiresAt: Date }`
  - `startSession(store, userId, now): Promise<NewSession>`
  - `sessionAccount(store, token, now): Promise<Account | null>`
  - `endSession(store, token): Promise<void>`
  - `type SignInResult = ({ ok: true; account: Account } & NewSession) | { ok: false; reason: "wrong" | "locked" }`
  - `signIn(store, { email, password, address, now }): Promise<SignInResult>`
  - `type ChangeResult = { ok: true } | { ok: false; problem: "current" | PasswordProblem }`
  - `changePassword(store, { account, current, next, keepToken, now }): Promise<ChangeResult>`
  - `printable(text: string): string`, which replaces control characters for log lines

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/accounts-sign-in.test.ts`:

```ts
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryAccountStore } from "@/lib/accounts/memory-store";
import { hashPassword } from "@/lib/accounts/passwords";
import { ADDRESS_ATTEMPTS, changePassword, EMAIL_ATTEMPTS, endSession, sessionAccount, signIn, startSession } from "@/lib/accounts/sign-in";
import type { Account, AccountStore } from "@/lib/accounts/store";

const at = (minute: number) => new Date(Date.UTC(2026, 9, 27, 8, minute));
const PASSWORD = "correct horse battery";
let passwordHash: string;
let store: AccountStore;
let sara: Account;
let info: ReturnType<typeof vi.spyOn>;
let warn: ReturnType<typeof vi.spyOn>;

beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
});

beforeEach(async () => {
  info = vi.spyOn(console, "info").mockImplementation(() => {});
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  store = createMemoryAccountStore();
  sara = { id: "usr_sara", email: "sara@example.com", name: "Sara", role: "admin", passwordHash, createdAt: at(0), passwordChangedAt: at(0), lastSignInAt: null };
  await store.createAccount(sara);
});

afterEach(() => vi.restoreAllMocks());

const attempt = (email: string, password: string, minute: number, address: string | null = "203.0.113.5") =>
  signIn(store, { email, password, address, now: at(minute) });

describe("signing in (spec M5c)", () => {
  it("signs in with the right password, starts a 30-day session, records the sign-in and logs it", async () => {
    const result = await attempt("sara@example.com", PASSWORD, 1);
    if (!result.ok) throw new Error("expected a sign-in");
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.expiresAt).toEqual(new Date(at(1).getTime() + 30 * 86_400_000));
    expect(await sessionAccount(store, result.token, at(2))).toMatchObject({ id: "usr_sara" });
    expect(await store.account("usr_sara")).toMatchObject({ lastSignInAt: at(1) });
    expect(info).toHaveBeenCalledWith("Signed in: sara@example.com from 203.0.113.5");
  });

  it("signs in whatever the email's case and spaces (Review Focus 2)", async () => {
    expect((await attempt("  Sara@Example.COM ", PASSWORD, 1)).ok).toBe(true);
  });

  it("gives the same answer for a wrong password and an unknown email, and logs both", async () => {
    expect(await attempt("sara@example.com", "wrong password!", 1)).toEqual({ ok: false, reason: "wrong" });
    expect(await attempt("nobody@example.com", PASSWORD, 1, null)).toEqual({ ok: false, reason: "wrong" });
    expect(warn.mock.calls).toEqual([
      ["Sign-in refused (wrong password): sara@example.com from 203.0.113.5"],
      ["Sign-in refused (wrong password): nobody@example.com from unknown address"],
    ]);
  });

  it("locks an email after 5 failures in 15 minutes, even for the right password, then lets it in again", async () => {
    for (let minute = 0; minute < EMAIL_ATTEMPTS; minute += 1) await attempt("sara@example.com", "wrong password!", minute);
    expect(await attempt("sara@example.com", PASSWORD, 5)).toEqual({ ok: false, reason: "locked" });
    expect(warn).toHaveBeenLastCalledWith("Sign-in refused (locked): sara@example.com from 203.0.113.5");
    expect((await attempt("sara@example.com", PASSWORD, 15)).ok).toBe(true);
  });

  it("a successful sign-in clears that email's count", async () => {
    for (let minute = 0; minute < EMAIL_ATTEMPTS - 1; minute += 1) await attempt("sara@example.com", "wrong password!", minute);
    expect((await attempt("sara@example.com", PASSWORD, 4)).ok).toBe(true);
    for (let minute = 5; minute < 9; minute += 1) await attempt("sara@example.com", "wrong password!", minute);
    expect((await attempt("sara@example.com", PASSWORD, 9)).ok).toBe(true);
  });

  it("locks an address after 30 failures with any emails; with no trustworthy address, only the email limit applies", async () => {
    for (let i = 0; i < ADDRESS_ATTEMPTS; i += 1) await attempt(`guess${i}@example.com`, "wrong password!", 0);
    expect(await attempt("sara@example.com", PASSWORD, 1)).toEqual({ ok: false, reason: "locked" });
    for (let i = 0; i < ADDRESS_ATTEMPTS; i += 1) await attempt(`guess${i}@example.com`, "wrong password!", 0, null);
    expect((await attempt("sara@example.com", PASSWORD, 1, null)).ok).toBe(true);
  });

  it("can't be made to write a forged log line through the email", async () => {
    await attempt("x@example.com\nSigned in: sara@example.com", "wrong password!", 1);
    expect(warn).toHaveBeenLastCalledWith("Sign-in refused (wrong password): x@example.com?signed in: sara@example.com from 203.0.113.5");
  });
});

describe("sessions", () => {
  it("ends a session; an unknown token finds nobody", async () => {
    const { token } = await startSession(store, "usr_sara", at(0));
    await endSession(store, token);
    expect(await sessionAccount(store, token, at(1))).toBeNull();
    expect(await sessionAccount(store, "not-a-token", at(1))).toBeNull();
  });
});

describe("changing a password", () => {
  it("needs the current password, applies the rules, and ends the person's other sessions but not this one", async () => {
    const here = await startSession(store, "usr_sara", at(0));
    const elsewhere = await startSession(store, "usr_sara", at(0));
    const change = (current: string, next: string) => changePassword(store, { account: sara, current, next, keepToken: here.token, now: at(5) });
    expect(await change("wrong password!", "a brand new password")).toEqual({ ok: false, problem: "current" });
    expect(await change(PASSWORD, "too short")).toEqual({ ok: false, problem: "short" });
    expect(await change(PASSWORD, "Sara@example.com")).toEqual({ ok: false, problem: "email" });
    expect(await change(PASSWORD, "a brand new password")).toEqual({ ok: true });
    expect(await sessionAccount(store, here.token, at(6))).toMatchObject({ id: "usr_sara" });
    expect(await sessionAccount(store, elsewhere.token, at(6))).toBeNull();
    expect((await attempt("sara@example.com", PASSWORD, 7)).ok).toBe(false);
    expect((await attempt("sara@example.com", "a brand new password", 8)).ok).toBe(true);
    expect(await store.account("usr_sara")).toMatchObject({ passwordChangedAt: at(5) });
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
pnpm vitest run tests/unit/accounts-sign-in.test.ts 2>&1 | tail -8
```

Expected: FAIL. The suite can't resolve `@/lib/accounts/sign-in`.

- [ ] **Step 3: Write the sign-in service**

Create `src/lib/accounts/sign-in.ts`:

```ts
import { normalizeEmail } from "@/lib/users/rules";
import { dummyHash, hashPassword, passwordProblem, verifyPassword, type PasswordProblem } from "./passwords";
import type { Account, AccountStore } from "./store";
import { hashToken, newToken } from "./tokens";

export const SESSION_DAYS = 30;
export const SIGN_IN_WINDOW_MS = 15 * 60_000;
export const EMAIL_ATTEMPTS = 5;
export const ADDRESS_ATTEMPTS = 30;
// No account's email is longer (validated at invitation); cutting here keeps the limit keys within their column.
const MAX_EMAIL = 254;

export type NewSession = { token: string; expiresAt: Date };
export type SignInResult = ({ ok: true; account: Account } & NewSession) | { ok: false; reason: "wrong" | "locked" };
export type ChangeResult = { ok: true } | { ok: false; problem: "current" | PasswordProblem };

/** For log lines: a line break in a typed email can't start a forged line of its own. */
export const printable = (text: string): string => text.replace(/[\u0000-\u001f\u007f]/g, "?");

export async function startSession(store: AccountStore, userId: string, now: Date): Promise<NewSession> {
  const token = newToken();
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 86_400_000);
  await store.createSession({ tokenHash: hashToken(token), userId, createdAt: now, expiresAt });
  return { token, expiresAt };
}

export const sessionAccount = (store: AccountStore, token: string, now: Date): Promise<Account | null> => store.sessionAccount(hashToken(token), now);

export const endSession = (store: AccountStore, token: string): Promise<void> => store.deleteSession(hashToken(token));

/**
 * Spec M5c "Signing in": the same answer for a wrong password and an unknown email (checked against a dummy hash, so
 * the time taken says nothing either); 5 failures per email and 30 per address in 15 minutes lock them; each sign-in
 * and refusal is logged with the email and address, never the password.
 */
export async function signIn(store: AccountStore, attempt: { email: string; password: string; address: string | null; now: Date }): Promise<SignInResult> {
  const { address, now } = attempt;
  const email = normalizeEmail(attempt.email).slice(0, MAX_EMAIL + 1);
  const where = address ?? "unknown address";
  const emailKey = `email:${email}`;
  const addressKey = address ? `ip:${address}` : null;

  const locked =
    (await store.hits(emailKey, now, SIGN_IN_WINDOW_MS)) >= EMAIL_ATTEMPTS ||
    (addressKey !== null && (await store.hits(addressKey, now, SIGN_IN_WINDOW_MS)) >= ADDRESS_ATTEMPTS);
  if (locked) {
    console.warn(`Sign-in refused (locked): ${printable(email)} from ${where}`);
    return { ok: false, reason: "locked" };
  }

  const account = await store.accountByEmail(email);
  const matches = await verifyPassword(attempt.password, account?.passwordHash ?? (await dummyHash()));
  if (!account || !matches) {
    await store.hit(emailKey, now, SIGN_IN_WINDOW_MS);
    if (addressKey) await store.hit(addressKey, now, SIGN_IN_WINDOW_MS);
    console.warn(`Sign-in refused (wrong password): ${printable(email)} from ${where}`);
    return { ok: false, reason: "wrong" };
  }

  await store.clearHits(emailKey);
  await store.recordSignIn(account.id, now);
  const session = await startSession(store, account.id, now);
  console.info(`Signed in: ${email} from ${where}`);
  return { ok: true, account: { ...account, lastSignInAt: now }, ...session };
}

/** The Account page: the current password first, the rules, then every other session of this person ends. */
export async function changePassword(
  store: AccountStore,
  change: { account: Account; current: string; next: string; keepToken: string; now: Date },
): Promise<ChangeResult> {
  const { account } = change;
  if (!(await verifyPassword(change.current, account.passwordHash))) return { ok: false, problem: "current" };
  const problem = passwordProblem(change.next, account.email);
  if (problem) return { ok: false, problem };
  await store.setPassword(account.id, await hashPassword(change.next), change.now);
  await store.deleteSessionsOf(account.id, hashToken(change.keepToken));
  console.info(`Password changed: ${account.email}`);
  return { ok: true };
}
```

- [ ] **Step 4: Run them and watch them pass**

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
pnpm vitest run tests/unit/accounts-sign-in.test.ts 2>&1 | tail -6
```

Expected: PASS, 9 tests.

The forged-log-line test expects the email lowercased, because `normalizeEmail` lowercases. If it fails only on the case of that string, the test's expectation is what's wrong; ledger it.

- [ ] **Step 5: Commit**

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
RC=0; pnpm lint >/dev/null 2>&1 || RC=$?
if [ $RC -eq 0 ]; then
  git add src/lib/accounts/sign-in.ts tests/unit/accounts-sign-in.test.ts
  git commit -m "feat(accounts): sign-in with per-email and per-address limits, sessions, password change (M5c)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
else echo "lint failed: RC=$RC"; fi
```

Task test command: `pnpm vitest run tests/unit/accounts-sign-in.test.ts`

---

### Task 4: Invitations, password resets, the first Admin and the Users-page directory

**Files:**
- Modify: `messages/en.json`, `messages/ar.json` (`Email.invitation`, `Email.reset`)
- Modify: `src/lib/notifications/render.ts` (`renderAccountEmail`), `src/lib/notifications/mail-error.ts` (`describeMailFailure`)
- Create: `src/lib/accounts/invitations.ts`, `src/lib/accounts/resets.ts`, `src/lib/accounts/first-admin.ts`, `src/lib/accounts/accounts-directory.ts`
- Modify:
  - `src/lib/users/types.ts`: `invite(…, invitedBy)`, `resendInvite`, `DirectoryInvite.expiresAt`, `mail_failed`, `details`
  - `src/lib/users/mock-directory.ts`
  - `src/lib/users/directory.ts`: the unreachable directory gets `resendInvite`
  - `src/app/[locale]/(app)/users/actions.ts`: passes `invitedBy`
- Test:
  - `tests/unit/accounts-links.test.ts` (new)
  - `tests/unit/users.test.ts` (mock resend and `details`) and `tests/unit/users-actions.test.ts` (`invitedBy`)

**Interfaces:**
- Consumes: Tasks 1–3 (`newToken`, `hashToken`, `newId`, `hashPassword`, `passwordProblem`, `AccountStore`, `startSession`, `NewSession`, `printable`); `Mailer` and `Email` (M5b); `MailError`; `AppStore["exclusive"]` (M5b).
- Produces:
  - **Rendering (`render.ts`, `mail-error.ts`):**
    - `renderAccountEmail(kind: "invitation" | "reset", input: { appUrl: string; token: string; role?: Role }): { subject; html; text }`
    - `describeMailFailure(error: unknown): { kind: MailErrorKind; reply: string }`
  - **Invitations (`invitations.ts`):**
    - `INVITATION_DAYS = 7`
    - `lookUpInvitation(store, token, now): Promise<{ state: "valid"; invitation: Invitation } | { state: "invalid" } | { state: "expired" }>`
    - `type AcceptProblem = "invalid" | "expired" | "taken" | "name" | PasswordProblem`
    - `acceptInvitation(store, { token, name, password, now }): Promise<({ ok: true; account: Account } & NewSession) | { ok: false; problem: AcceptProblem }>`
    - `emailInvitation(mailer, appUrl, invitation, token): Promise<void>`
  - **Resets (`resets.ts`):**
    - `RESET_MINUTES = 60`, `RESETS_PER_HOUR = 3`
    - `requestReset(deps: { store; mailer; appUrl; later: (task: () => Promise<void>) => void }, input: { email; now }): Promise<void>`
    - `resetLinkValid(store, token, now): Promise<boolean>`
    - `type ResetProblem = "invalid" | PasswordProblem`
    - `completeReset(store, { token, password, now }): Promise<({ ok: true; account: Account } & NewSession) | { ok: false; problem: ResetProblem }>`
  - **First Admin (`first-admin.ts`):**
    - `type FirstAdmin = { state: "ready" } | { state: "invited"; to: string } | { state: "unset" } | { state: "failed" }`
    - `ensureFirstAdmin(deps: { store; exclusive; mailer; appUrl; adminEmail: string | null; now }): Promise<FirstAdmin>`
    - `maskEmail(email): string`
  - **The Users-page directory:** `createAccountsDirectory({ store, mailer, appUrl, now? }): UserDirectory`
  - **`UserDirectory` changes:**
    - `invite(email, role, invitedBy: string | null)`
    - `resendInvite(id): Promise<DirectoryInvite>`
    - `DirectoryInvite` gets `expiresAt: string | null`
    - `DirectoryError` gets the code `"mail_failed"` (502) and a 4th constructor argument `details`
    - `tryDirectory` passes `details` through

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/accounts-links.test.ts`:

```ts
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createAccountsDirectory } from "@/lib/accounts/accounts-directory";
import { ensureFirstAdmin, maskEmail } from "@/lib/accounts/first-admin";
import { acceptInvitation, INVITATION_DAYS, lookUpInvitation } from "@/lib/accounts/invitations";
import { createMemoryAccountStore } from "@/lib/accounts/memory-store";
import { hashPassword } from "@/lib/accounts/passwords";
import { completeReset, requestReset, resetLinkValid } from "@/lib/accounts/resets";
import { sessionAccount, signIn, startSession } from "@/lib/accounts/sign-in";
import type { Account, AccountStore } from "@/lib/accounts/store";
import { hashToken } from "@/lib/accounts/tokens";
import { createMemoryStore } from "@/lib/db/memory-store";
import { MailError } from "@/lib/notifications/mail-error";
import type { Email, Mailer } from "@/lib/notifications/mailer";

const APP_URL = "https://dashboard.example.com";
const PASSWORD = "correct horse battery";
const DAY = 86_400_000;
const at = (minute: number) => new Date(Date.UTC(2026, 9, 27, 8, minute));
let passwordHash: string;
let store: AccountStore;
let sent: Email[];
let failure: Error | null;
let now: Date;
const mailer: Mailer = {
  async send(email) {
    if (failure) throw failure;
    sent.push(email);
  },
};
const directory = () => createAccountsDirectory({ store, mailer, appUrl: APP_URL, now: () => now });
/** The token in an email's link to `path`, English half. */
const tokenIn = (email: Email | undefined, path: string) => new RegExp(`${APP_URL}/en/${path}\\?token=([A-Za-z0-9_-]+)`).exec(email?.text ?? "")?.[1] ?? "";
const sara = (): Account => ({ id: "usr_sara", email: "sara@example.com", name: "Sara", role: "admin", passwordHash, createdAt: at(0), passwordChangedAt: at(0), lastSignInAt: at(1) });

beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
});

beforeEach(async () => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  store = createMemoryAccountStore();
  sent = [];
  failure = null;
  now = at(10);
  await store.createAccount(sara());
});

afterEach(() => vi.restoreAllMocks());

describe("invitations on the Users page (spec M5c)", () => {
  it("emails a 7-day link in both languages to the invited email, and lists it", async () => {
    const invite = await directory().invite(" New@Example.com ", "reviewer", "usr_sara");
    expect(invite).toMatchObject({ email: "new@example.com", role: "reviewer", expiresAt: new Date(now.getTime() + INVITATION_DAYS * DAY).toISOString() });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "new@example.com", subject: "You're invited to Articles AI · دعوة إلى Articles AI" });
    expect(sent[0].text).toContain("You're invited to the Articles AI dashboard as Reviewer.");
    expect(sent[0].text).toContain("بصفة مراجع");
    expect(sent[0].text).toContain(`${APP_URL}/ar/invitation?token=`);
    const token = tokenIn(sent[0], "invitation");
    expect(await store.invitationByToken(hashToken(token))).toMatchObject({ id: invite.id, invitedBy: "usr_sara" });
    expect((await directory().list()).invites).toEqual([invite]);
  });

  it("refuses an email that already has an account or an invitation, in any case, or that isn't an email", async () => {
    await expect(directory().invite("SARA@example.com", "reviewer", "usr_sara")).rejects.toMatchObject({ code: "conflict" });
    await directory().invite("new@example.com", "reviewer", "usr_sara");
    await expect(directory().invite(" NEW@example.com", "admin", "usr_sara")).rejects.toMatchObject({ code: "conflict" });
    await expect(directory().invite("not-an-email", "reviewer", "usr_sara")).rejects.toMatchObject({ code: "invalid_input" });
    await expect(directory().invite(`${"a".repeat(250)}@example.com`, "reviewer", "usr_sara")).rejects.toMatchObject({ code: "invalid_input" });
    expect(sent).toHaveLength(1);
  });

  it("keeps nothing when the email can't be sent, and says why", async () => {
    failure = new MailError("login", "535 Incorrect authentication data");
    await expect(directory().invite("new@example.com", "reviewer", "usr_sara")).rejects.toMatchObject({
      code: "mail_failed",
      details: { kind: "login", reply: "535 Incorrect authentication data" },
    });
    expect((await directory().list()).invites).toEqual([]);
  });

  it("resend emails a new link and only then retires the old one; a failed resend changes nothing", async () => {
    const invite = await directory().invite("new@example.com", "reviewer", "usr_sara");
    const first = tokenIn(sent[0], "invitation");
    now = at(20);
    failure = new MailError("connect", null);
    await expect(directory().resendInvite(invite.id)).rejects.toMatchObject({ code: "mail_failed" });
    expect((await lookUpInvitation(store, first, now)).state).toBe("valid");
    failure = null;
    const renewed = await directory().resendInvite(invite.id);
    const second = tokenIn(sent.at(-1), "invitation");
    expect(second).not.toBe(first);
    expect(renewed.expiresAt).toBe(new Date(at(20).getTime() + 7 * DAY).toISOString());
    expect((await lookUpInvitation(store, first, now)).state).toBe("invalid");
    expect((await lookUpInvitation(store, second, now)).state).toBe("valid");
    await expect(directory().resendInvite("inv_missing")).rejects.toMatchObject({ code: "not_found" });
  });

  it("revokes, changes roles, and lists people with their last sign-in", async () => {
    const invite = await directory().invite("new@example.com", "reviewer", "usr_sara");
    expect(await directory().revokeInvite(invite.id)).toEqual({ revoked: true });
    await expect(directory().revokeInvite(invite.id)).rejects.toMatchObject({ code: "not_found" });
    expect(await directory().setRole("usr_sara", "reviewer")).toMatchObject({ id: "usr_sara", role: "reviewer", twoFactor: false });
    await expect(directory().setRole("usr_missing", null)).rejects.toMatchObject({ code: "not_found" });
    expect((await directory().list()).users).toEqual([
      { id: "usr_sara", name: "Sara", email: "sara@example.com", role: "reviewer", twoFactor: false, lastSignInAt: at(1).toISOString() },
    ]);
  });
});

describe("accepting an invitation", () => {
  async function invited(email = "new@example.com") {
    await directory().invite(email, "reviewer", "usr_sara");
    return tokenIn(sent.at(-1), "invitation");
  }

  it("creates the account with the invited role and signs in, once (Review Focus 3)", async () => {
    const token = await invited();
    const result = await acceptInvitation(store, { token, name: "  Omar  ", password: PASSWORD, now: at(11) });
    if (!result.ok) throw new Error(result.problem);
    expect(result.account).toMatchObject({ email: "new@example.com", name: "Omar", role: "reviewer", lastSignInAt: at(11) });
    expect(await sessionAccount(store, result.token, at(12))).toMatchObject({ email: "new@example.com" });
    expect(await acceptInvitation(store, { token, name: "Omar", password: PASSWORD, now: at(12) })).toEqual({ ok: false, problem: "invalid" });
  });

  it("an expired invitation says so, from the exact moment it expires", async () => {
    const token = await invited();
    const expiry = new Date(now.getTime() + 7 * DAY);
    expect((await lookUpInvitation(store, token, new Date(expiry.getTime() - 1))).state).toBe("valid");
    expect(await acceptInvitation(store, { token, name: "Omar", password: PASSWORD, now: expiry })).toEqual({ ok: false, problem: "expired" });
  });

  it("checks the name and the password rules, and creates nothing until they pass", async () => {
    const token = await invited();
    expect(await acceptInvitation(store, { token, name: "   ", password: PASSWORD, now: at(11) })).toEqual({ ok: false, problem: "name" });
    expect(await acceptInvitation(store, { token, name: "Omar", password: "too short", now: at(11) })).toEqual({ ok: false, problem: "short" });
    expect(await acceptInvitation(store, { token, name: "Omar", password: "New@Example.com", now: at(11) })).toEqual({ ok: false, problem: "email" });
    expect(await store.accountByEmail("new@example.com")).toBeNull();
  });

  it("can't be accepted for an email that meanwhile got an account (Review Focus 3)", async () => {
    const token = await invited();
    await store.createAccount({ ...sara(), id: "usr_other", email: "new@example.com", role: "reviewer" });
    expect(await acceptInvitation(store, { token, name: "Omar", password: PASSWORD, now: at(11) })).toEqual({ ok: false, problem: "taken" });
    expect((await store.accounts()).filter((account) => account.email === "new@example.com")).toHaveLength(1);
  });
});

describe("forgot password", () => {
  const later: Array<Promise<void>> = [];
  const deps = () => ({ store, mailer, appUrl: APP_URL, later: (task: () => Promise<void>) => void later.push(task()) });
  const settle = async () => {
    await Promise.all(later.splice(0));
  };

  it("asks for a reset whatever the email's case and spaces, and emails a 1-hour link (Review Focus 2)", async () => {
    await requestReset(deps(), { email: "  SARA@example.com ", now });
    await settle();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "sara@example.com", subject: "Reset your Articles AI password · إعادة تعيين كلمة مرور Articles AI" });
    const token = tokenIn(sent[0], "reset-password");
    expect(await resetLinkValid(store, token, new Date(now.getTime() + 59 * 60_000))).toBe(true);
    expect(await resetLinkValid(store, token, new Date(now.getTime() + 60 * 60_000))).toBe(false);
  });

  it("answers an unknown email the same way, sending nothing", async () => {
    await expect(requestReset(deps(), { email: "nobody@example.com", now })).resolves.toBeUndefined();
    await settle();
    expect(sent).toEqual([]);
  });

  it("sends at most 3 reset emails to one address per hour", async () => {
    for (let i = 0; i < 5; i += 1) await requestReset(deps(), { email: "sara@example.com", now });
    await settle();
    expect(sent).toHaveLength(3);
  });

  it("logs a failed reset email with its kind, without telling the visitor", async () => {
    failure = new MailError("connect", "connect ECONNREFUSED 127.0.0.1:587");
    await requestReset(deps(), { email: "sara@example.com", now });
    await settle();
    expect(console.error).toHaveBeenCalledWith("Password reset email failed (connect): connect ECONNREFUSED 127.0.0.1:587");
  });

  it("a reset link sets the password, ends every session, signs in, and works once", async () => {
    const before = await startSession(store, "usr_sara", now);
    await requestReset(deps(), { email: "sara@example.com", now });
    await settle();
    const token = tokenIn(sent[0], "reset-password");
    expect(await completeReset(store, { token, password: "short", now: at(11) })).toEqual({ ok: false, problem: "short" });
    const result = await completeReset(store, { token, password: "a brand new password", now: at(11) });
    if (!result.ok) throw new Error(result.problem);
    expect(await sessionAccount(store, before.token, at(12))).toBeNull();
    expect(await sessionAccount(store, result.token, at(12))).toMatchObject({ id: "usr_sara" });
    expect(await completeReset(store, { token, password: "another new password", now: at(12) })).toEqual({ ok: false, problem: "invalid" });
    expect((await signIn(store, { email: "sara@example.com", password: PASSWORD, address: null, now: at(13) })).ok).toBe(false);
    expect((await signIn(store, { email: "sara@example.com", password: "a brand new password", address: null, now: at(14) })).ok).toBe(true);
  });
});

describe("the first Admin", () => {
  const appStore = createMemoryStore();
  const ensure = (adminEmail: string | null = "owner@example.com") =>
    ensureFirstAdmin({ store, exclusive: appStore.exclusive, mailer, appUrl: APP_URL, adminEmail, now });

  beforeEach(async () => {
    await store.setRole("usr_sara", "reviewer");
  });

  it("with no Admin, invites ADMIN_EMAIL once, and again only after that link expired", async () => {
    expect(await ensure()).toEqual({ state: "invited", to: "o•••@example.com" });
    expect(sent.map((email) => email.to)).toEqual(["owner@example.com"]);
    expect(sent[0].text).toContain("as Admin.");
    expect(await ensure()).toEqual({ state: "invited", to: "o•••@example.com" });
    expect(sent).toHaveLength(1);
    now = new Date(now.getTime() + 7 * DAY);
    await ensure();
    expect(sent).toHaveLength(2);
  });

  it("does nothing once an Admin exists, and makes an existing account at ADMIN_EMAIL the Admin", async () => {
    expect(await ensure("sara@example.com")).toEqual({ state: "ready" });
    expect(await store.account("usr_sara")).toMatchObject({ role: "admin" });
    expect(await ensure()).toEqual({ state: "ready" });
    expect(sent).toEqual([]);
  });

  it("without ADMIN_EMAIL, says so", async () => {
    expect(await ensure(null)).toEqual({ state: "unset" });
  });

  it("a mail failure leaves no invitation, and it stops trying after 3 attempts in 15 minutes", async () => {
    let attempts = 0;
    failure = new MailError("login", "535 Incorrect authentication data");
    const counting: Mailer = {
      async send(email) {
        attempts += 1;
        return mailer.send(email);
      },
    };
    const attempt = () => ensureFirstAdmin({ store, exclusive: appStore.exclusive, mailer: counting, appUrl: APP_URL, adminEmail: "owner@example.com", now });
    for (let i = 0; i < 4; i += 1) expect(await attempt()).toEqual({ state: "failed" });
    expect(attempts).toBe(3);
    expect(await store.invitations()).toEqual([]);
  });

  it("two visitors at once send one email", async () => {
    await Promise.all([ensure(), ensure()]);
    expect(sent).toHaveLength(1);
  });

  it("hides most of the address on the sign-in page", () => {
    expect(maskEmail("owner@example.com")).toBe("o•••@example.com");
  });
});
```

In `tests/unit/users.test.ts`:

1. In "invites an email once, ignoring case and spaces…", pass a third argument `null` to each `directory.invite(…)` call. Add this after the first `expect(invite)…` line:

```ts
    expect(new Date(invite.expiresAt ?? 0).getTime() - new Date(invite.createdAt).getTime()).toBe(7 * 86_400_000);
```

2. Add this case to the test directory's `describe`:

```ts
  it("resends a test invitation with a new 7-day expiry, and knows a missing one", async () => {
    const directory = fresh();
    const invite = await directory.invite("new@example.com", "reviewer", null);
    const renewed = await directory.resendInvite(invite.id);
    expect(renewed).toMatchObject({ id: invite.id, email: "new@example.com" });
    expect(new Date(renewed.expiresAt ?? 0).getTime() - new Date(renewed.createdAt).getTime()).toBe(7 * 86_400_000);
    await expect(directory.resendInvite("inv_missing")).rejects.toMatchObject({ code: "not_found" });
  });
```

3. In the `tryDirectory` test, add:

```ts
    expect(
      await tryDirectory(async () => {
        throw new DirectoryError("mail_failed", "The email couldn't be sent (login).", undefined, { kind: "login", reply: "535 x" });
      }),
    ).toEqual({ ok: false, error: { status: 502, code: "mail_failed", message: "The email couldn't be sent (login).", details: { kind: "login", reply: "535 x" } } });
```

In `tests/unit/users-actions.test.ts`, change `expect(directory.invite).toHaveBeenCalledWith("new@example.com", "reviewer");` to `expect(directory.invite).toHaveBeenCalledWith("new@example.com", "reviewer", "user_admin");`.

- [ ] **Step 2: Run them and watch them fail**

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
pnpm vitest run tests/unit/accounts-links.test.ts tests/unit/users.test.ts tests/unit/users-actions.test.ts 2>&1 | grep -E "×|Tests  |Error:" | head -20
```

Expected: FAIL.
- `accounts-links.test.ts` can't resolve `@/lib/accounts/accounts-directory`.
- In `users.test.ts`, the resend case fails (`directory.resendInvite is not a function`), the `expiresAt` check fails, and the `details` check fails.
- `users-actions.test.ts` fails on the `invitedBy` argument.

- [ ] **Step 3: Add the email texts**

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
SCRATCH=$(mktemp -d)
cat > "$SCRATCH/m5c-emails.mjs" <<'EOF'
import fs from "node:fs";

const ADD = {
  en: {
    invitation: {
      subject: "You're invited to Articles AI",
      heading: "You're invited to the Articles AI dashboard as {role}.",
      link: "Set your password and sign in",
      footer: "The link works once and expires in 7 days. If you didn't expect this email, you can ignore it.",
    },
    reset: {
      subject: "Reset your Articles AI password",
      heading: "Someone asked to reset the password of your Articles AI account.",
      link: "Choose a new password",
      footer: "The link works once and expires in 1 hour. If you didn't ask for this, ignore this email: your password stays as it is.",
    },
  },
  ar: {
    invitation: {
      subject: "دعوة إلى Articles AI",
      heading: "دُعيت إلى لوحة Articles AI بصفة {role}.",
      link: "اختر كلمة مرورك وسجّل الدخول",
      footer: "يعمل الرابط مرة واحدة وتنتهي صلاحيته خلال 7 أيام. إن لم تكن تتوقع هذه الرسالة فيمكنك تجاهلها.",
    },
    reset: {
      subject: "إعادة تعيين كلمة مرور Articles AI",
      heading: "طُلبت إعادة تعيين كلمة مرور حسابك في Articles AI.",
      link: "اختر كلمة مرور جديدة",
      footer: "يعمل الرابط مرة واحدة وتنتهي صلاحيته خلال ساعة. إن لم تطلب ذلك فتجاهل هذه الرسالة: تبقى كلمة مرورك كما هي.",
    },
  },
};

for (const [locale, emails] of Object.entries(ADD)) {
  const file = `messages/${locale}.json`;
  const messages = JSON.parse(fs.readFileSync(file, "utf8"));
  Object.assign(messages.Email, emails);
  fs.writeFileSync(file, `${JSON.stringify(messages, null, 2)}\n`);
}
EOF
node "$SCRATCH/m5c-emails.mjs" && git diff --stat messages/
```

Expected: both message files gain about 12 lines each, and nothing else changes.

- [ ] **Step 4: Render the account emails, and describe mail failures**

At the end of `src/lib/notifications/render.ts`, add this. Also add `import type { Role } from "@/lib/auth/roles";` to the imports.

```ts
/**
 * M5c: an invitation or a password-reset email, in the notification format. Each language's half links to that
 * language's page; the links come from APP_URL only, never from a request.
 */
export function renderAccountEmail(kind: "invitation" | "reset", input: { appUrl: string; token: string; role?: Role }): { subject: string; html: string; text: string } {
  const path = kind === "invitation" ? "invitation" : "reset-password";
  return compose(
    LOCALES.map((locale) => {
      const t = translator(locale, `Email.${kind}`);
      const role = input.role ? translator(locale, "Shell.role")(input.role) : "";
      const href = `${input.appUrl}/${locale}/${path}?token=${encodeURIComponent(input.token)}`;
      return { locale, subject: t("subject"), heading: t("heading", { role }), lines: [{ text: t("link"), href }], footer: t("footer"), settings: null };
    }),
  );
}
```

At the end of `src/lib/notifications/mail-error.ts`, add:

```ts
/** What a log line says about any failed send: a MailError's kind and reply, or "other" and the error's message. */
export function describeMailFailure(error: unknown): { kind: MailErrorKind; reply: string } {
  if (error instanceof MailError) return { kind: error.kind, reply: error.reply ?? "no reply" };
  return { kind: "other", reply: error instanceof Error ? error.message : "no reply" };
}
```

- [ ] **Step 5: Extend the directory interface, the test directory and the invite action**

In `src/lib/users/types.ts`:

1. Replace the `DirectoryInvite` type and the `UserDirectory` interface with:

```ts
export type DirectoryInvite = { id: string; email: string; role: Role | null; createdAt: string; expiresAt: string | null };

export interface UserDirectory {
  list(): Promise<{ users: DirectoryUser[]; invites: DirectoryInvite[] }>;
  /** `invitedBy`: the Admin's user id (spec M5c), kept with the invitation. */
  invite(email: string, role: Role, invitedBy: string | null): Promise<DirectoryInvite>;
  /** A new link and a new 7-day expiry (spec M5c). */
  resendInvite(id: string): Promise<DirectoryInvite>;
  revokeInvite(id: string): Promise<{ revoked: true }>;
  setRole(userId: string, role: Role | null): Promise<DirectoryUser>;
}
```

2. Replace the code type, the status map, the error class and `tryDirectory` with:

```ts
export type DirectoryErrorCode = "invalid_input" | "conflict" | "not_found" | "refused" | "unavailable" | "mail_failed";
const STATUS: Record<DirectoryErrorCode, number> = { invalid_input: 400, conflict: 409, not_found: 404, refused: 422, unavailable: 503, mail_failed: 502 };

export class DirectoryError extends Error {
  constructor(
    readonly code: DirectoryErrorCode,
    message: string,
    readonly fields?: Record<string, string>,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

/** Directory failures become action results, shaped like the engine's, so the same error display works. */
export async function tryDirectory<T>(run: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await run() };
  } catch (error) {
    if (!(error instanceof DirectoryError)) throw error;
    return {
      ok: false,
      error: {
        status: STATUS[error.code],
        code: error.code,
        message: error.message,
        ...(error.fields ? { fields: error.fields } : {}),
        ...(error.details ? { details: error.details } : {}),
      },
    };
  }
}
```

In `src/lib/users/mock-directory.ts`:

1. Add `const INVITE_DAYS_MS = 7 * 86_400_000;` below `SIGNED_IN_BEFORE`.
2. Keep `async invite(email: string, role: Role) {` as it is: the test directory ignores `invitedBy`, and a method with fewer parameters still fits the interface. In that method, replace the `const invite: DirectoryInvite = …` line with:

```ts
      const createdAt = new Date();
      const invite: DirectoryInvite = {
        id: `inv_${++state.sequence}`,
        email: tidy,
        role,
        createdAt: createdAt.toISOString(),
        expiresAt: new Date(createdAt.getTime() + INVITE_DAYS_MS).toISOString(),
      };
```

3. Add this method after `invite`:

```ts
    async resendInvite(id: string) {
      const invite = state.invites.get(id);
      if (!invite) throw new DirectoryError("not_found", "This invitation no longer exists.");
      const createdAt = new Date();
      Object.assign(invite, { createdAt: createdAt.toISOString(), expiresAt: new Date(createdAt.getTime() + INVITE_DAYS_MS).toISOString() });
      return structuredClone(invite);
    },
```

In `src/lib/users/directory.ts`, change the unreachable directory's return line to `return { list: fail, invite: fail, resendInvite: fail, revokeInvite: fail, setRole: fail };`.

In `src/lib/users/clerk-directory.ts` (deleted in Task 5), add this method beside `revokeInvite`, so the type check stays clean until then:

```ts
    async resendInvite() {
      throw new DirectoryError("refused", "Resend isn't available with Clerk.");
    },
```

In `src/app/[locale]/(app)/users/actions.ts`, in `inviteUserAction`, replace:

```ts
  await requirePermission(locale, "users.manage");
  const result = await tryDirectory(async () => (await getDirectory()).invite(email, role));
```

with:

```ts
  const session = await requirePermission(locale, "users.manage");
  const result = await tryDirectory(async () => (await getDirectory()).invite(email, role, session.userId));
```

- [ ] **Step 6: Write the invitations, resets and first-Admin services**

Create `src/lib/accounts/invitations.ts`:

```ts
import type { Mailer } from "@/lib/notifications/mailer";
import { renderAccountEmail } from "@/lib/notifications/render";
import { hashPassword, passwordProblem, type PasswordProblem } from "./passwords";
import { startSession, type NewSession } from "./sign-in";
import type { Account, AccountStore, Invitation } from "./store";
import { hashToken, newId } from "./tokens";

export const INVITATION_DAYS = 7;
const NAME_MAX = 200;

export type AcceptProblem = "invalid" | "expired" | "taken" | "name" | PasswordProblem;
export type InvitationLookup = { state: "valid"; invitation: Invitation } | { state: "invalid" } | { state: "expired" };

/** An unknown or used link is "invalid"; from its expiry moment on, a link is "expired". */
export async function lookUpInvitation(store: AccountStore, token: string, now: Date): Promise<InvitationLookup> {
  const invitation = await store.invitationByToken(hashToken(token));
  if (!invitation) return { state: "invalid" };
  return invitation.expiresAt.getTime() <= now.getTime() ? { state: "expired" } : { state: "valid", invitation };
}

/** The invitation page: the account gets the invited role and signs in at once; the link is used up (spec M5c). */
export async function acceptInvitation(
  store: AccountStore,
  input: { token: string; name: string; password: string; now: Date },
): Promise<({ ok: true; account: Account } & NewSession) | { ok: false; problem: AcceptProblem }> {
  const found = await lookUpInvitation(store, input.token, input.now);
  if (found.state !== "valid") return { ok: false, problem: found.state };
  const { invitation } = found;
  const name = input.name.trim();
  if (!name || [...name].length > NAME_MAX) return { ok: false, problem: "name" };
  const problem = passwordProblem(input.password, invitation.email);
  if (problem) return { ok: false, problem };
  const account: Account = {
    id: newId("usr"),
    email: invitation.email,
    name,
    role: invitation.role,
    passwordHash: await hashPassword(input.password),
    createdAt: input.now,
    passwordChangedAt: input.now,
    lastSignInAt: input.now,
  };
  if (!(await store.acceptInvitation(invitation.id, account))) {
    // Still there: the email got an account meanwhile. Gone: the link was used at the same moment.
    return { ok: false, problem: (await store.invitation(invitation.id)) ? "taken" : "invalid" };
  }
  console.info(`Account created: ${account.email} (${account.role}) from an invitation`);
  return { ok: true, account, ...(await startSession(store, account.id, input.now)) };
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/** The invitation email (bilingual), to the invited address. A failure is the mailer's MailError, for the caller. */
export async function emailInvitation(mailer: Mailer, appUrl: string, invitation: Invitation, token: string): Promise<void> {
  await mailer.send({
    ...renderAccountEmail("invitation", { appUrl, token, role: invitation.role }),
    to: invitation.email,
    idempotencyKey: `invitation-${invitation.tokenHash.slice(0, 32)}`,
  });
}
```

Create `src/lib/accounts/resets.ts`:

```ts
import { describeMailFailure } from "@/lib/notifications/mail-error";
import type { Mailer } from "@/lib/notifications/mailer";
import { renderAccountEmail } from "@/lib/notifications/render";
import { normalizeEmail } from "@/lib/users/rules";
import { hashPassword, passwordProblem, type PasswordProblem } from "./passwords";
import { printable, startSession, type NewSession } from "./sign-in";
import type { Account, AccountStore } from "./store";
import { hashToken, newToken } from "./tokens";

export const RESET_MINUTES = 60;
export const RESETS_PER_HOUR = 3;
const HOUR_MS = 3_600_000;

export type ResetProblem = "invalid" | PasswordProblem;

/**
 * "Forgot password" (spec M5c): the visitor always gets the same answer, so it never says whether an account exists.
 * The email goes out through `later` (Next's after(): once the answer has been sent), so the time taken says nothing
 * either. At most 3 per address per hour; a failed send is logged, not shown.
 */
export async function requestReset(
  deps: { store: AccountStore; mailer: Mailer; appUrl: string; later: (task: () => Promise<void>) => void },
  input: { email: string; now: Date },
): Promise<void> {
  const { store } = deps;
  const { now } = input;
  const email = normalizeEmail(input.email).slice(0, 255);
  if ((await store.hit(`reset:${email}`, now, HOUR_MS)) > RESETS_PER_HOUR) return;
  const account = await store.accountByEmail(email);
  if (!account) return;
  const token = newToken();
  await store.createReset({ tokenHash: hashToken(token), userId: account.id, createdAt: now, expiresAt: new Date(now.getTime() + RESET_MINUTES * 60_000) });
  deps.later(async () => {
    try {
      await deps.mailer.send({ ...renderAccountEmail("reset", { appUrl: deps.appUrl, token }), to: account.email, idempotencyKey: `reset-${hashToken(token).slice(0, 32)}` });
      console.info(`Password reset email sent: ${printable(email)}`);
    } catch (error) {
      const { kind, reply } = describeMailFailure(error);
      console.error(`Password reset email failed (${kind}): ${reply}`);
    }
  });
}

/** Whether the reset page should show its form for this link. */
export async function resetLinkValid(store: AccountStore, token: string, now: Date): Promise<boolean> {
  const reset = await store.resetByToken(hashToken(token));
  return Boolean(reset && reset.expiresAt.getTime() > now.getTime());
}

/** Sets the new password, ends every session of that person, uses up their reset links, and signs them in here. */
export async function completeReset(
  store: AccountStore,
  input: { token: string; password: string; now: Date },
): Promise<({ ok: true; account: Account } & NewSession) | { ok: false; problem: ResetProblem }> {
  const reset = await store.resetByToken(hashToken(input.token));
  if (!reset || reset.expiresAt.getTime() <= input.now.getTime()) return { ok: false, problem: "invalid" };
  const account = await store.account(reset.userId);
  if (!account) return { ok: false, problem: "invalid" };
  const problem = passwordProblem(input.password, account.email);
  if (problem) return { ok: false, problem };
  await store.setPassword(account.id, await hashPassword(input.password), input.now);
  await store.deleteResetsOf(account.id);
  await store.deleteSessionsOf(account.id);
  await store.recordSignIn(account.id, input.now);
  console.info(`Password reset: ${account.email}`);
  return { ok: true, account: { ...account, lastSignInAt: input.now }, ...(await startSession(store, account.id, input.now)) };
}
```

Create `src/lib/accounts/first-admin.ts`:

```ts
import type { AppStore } from "@/lib/db/store";
import { describeMailFailure } from "@/lib/notifications/mail-error";
import type { Mailer } from "@/lib/notifications/mailer";
import { addDays, emailInvitation, INVITATION_DAYS } from "./invitations";
import type { AccountStore, Invitation } from "./store";
import { hashToken, newId, newToken } from "./tokens";

export type FirstAdmin = { state: "ready" } | { state: "invited"; to: string } | { state: "unset" } | { state: "failed" };

const SETUP_ATTEMPTS = 3;
const SETUP_WINDOW_MS = 15 * 60_000;

/** "o•••@example.com": enough for the owner to recognise, on a page anyone can open. */
export function maskEmail(email: string): string {
  return `${email.slice(0, 1)}•••${email.slice(email.lastIndexOf("@"))}`;
}

/**
 * Spec M5c "The first Admin": while there's no Admin, ADMIN_EMAIL gets an Admin invitation, sent once and again only
 * after it expired, under a lock so two visitors at once send one email. An existing account at that address becomes
 * the Admin instead. Visitors can't choose the address, and at most 3 attempts go out per 15 minutes.
 */
export async function ensureFirstAdmin(deps: {
  store: AccountStore;
  exclusive: AppStore["exclusive"];
  mailer: Mailer;
  appUrl: string;
  adminEmail: string | null;
  now: Date;
}): Promise<FirstAdmin> {
  const { store, adminEmail, now } = deps;
  if (await store.hasAdmin()) return { state: "ready" };
  if (!adminEmail) return { state: "unset" };
  const invited: FirstAdmin = { state: "invited", to: maskEmail(adminEmail) };

  const outcome = await deps.exclusive("articles_ai_first_admin", async (): Promise<FirstAdmin> => {
    if (await store.hasAdmin()) return { state: "ready" };
    const existing = await store.accountByEmail(adminEmail);
    if (existing) {
      await store.setRole(existing.id, "admin");
      console.info(`First Admin: ${adminEmail} already had an account, now Admin`);
      return { state: "ready" };
    }
    const pending = await store.invitationByEmail(adminEmail);
    if (pending && pending.role === "admin" && pending.expiresAt.getTime() > now.getTime()) return invited;
    if ((await store.hit(`setup:${adminEmail}`, now, SETUP_WINDOW_MS)) > SETUP_ATTEMPTS) return { state: "failed" };
    if (pending) await store.deleteInvitation(pending.id);

    const token = newToken();
    const invitation: Invitation = {
      id: newId("inv"),
      email: adminEmail,
      role: "admin",
      tokenHash: hashToken(token),
      invitedBy: null,
      createdAt: now,
      expiresAt: addDays(now, INVITATION_DAYS),
    };
    await store.addInvitation(invitation);
    try {
      await emailInvitation(deps.mailer, deps.appUrl, invitation, token);
    } catch (error) {
      await store.deleteInvitation(invitation.id);
      const { kind, reply } = describeMailFailure(error);
      console.error(`First Admin invitation failed (${kind}): ${reply}`);
      return { state: "failed" };
    }
    console.info(`First Admin: invitation emailed to ${adminEmail}`);
    return invited;
  });
  // Another visitor holds the lock and is sending it right now.
  return outcome.ran ? outcome.value : invited;
}
```

- [ ] **Step 7: Write the accounts directory (the Users page in password mode)**

Create `src/lib/accounts/accounts-directory.ts`:

```ts
import { MailError } from "@/lib/notifications/mail-error";
import type { Mailer } from "@/lib/notifications/mailer";
import { validInviteEmail } from "@/lib/users/rules";
import { DirectoryError, type DirectoryInvite, type DirectoryUser, type UserDirectory } from "@/lib/users/types";
import { addDays, emailInvitation, INVITATION_DAYS } from "./invitations";
import type { Account, AccountStore, Invitation } from "./store";
import { hashToken, newId, newToken } from "./tokens";

const toUser = (account: Account): DirectoryUser => ({
  id: account.id,
  name: account.name,
  email: account.email,
  role: account.role,
  twoFactor: false,
  lastSignInAt: account.lastSignInAt?.toISOString() ?? null,
});

const toInvite = (invitation: Invitation): DirectoryInvite => ({
  id: invitation.id,
  email: invitation.email,
  role: invitation.role,
  createdAt: invitation.createdAt.toISOString(),
  expiresAt: invitation.expiresAt.toISOString(),
});

const CONFLICT = "This person already has an account or an invitation.";

/** AUTH_MODE=password (spec M5c): the Users page on the dashboard's own accounts; invitations go out by email. */
export function createAccountsDirectory(deps: { store: AccountStore; mailer: Mailer; appUrl: string; now?: () => Date }): UserDirectory {
  const { store } = deps;
  const now = deps.now ?? (() => new Date());

  /** A failed send becomes the page's mail_failed answer, with the kind and the server's reply. */
  async function send(invitation: Invitation, token: string): Promise<void> {
    try {
      await emailInvitation(deps.mailer, deps.appUrl, invitation, token);
    } catch (error) {
      if (error instanceof MailError) throw new DirectoryError("mail_failed", error.message, undefined, { kind: error.kind, reply: error.reply });
      throw error;
    }
  }

  return {
    async list() {
      return { users: (await store.accounts()).map(toUser), invites: (await store.invitations()).map(toInvite) };
    },

    async invite(email, role, invitedBy) {
      const tidy = validInviteEmail(email);
      if ((await store.accountByEmail(tidy)) || (await store.invitationByEmail(tidy))) throw new DirectoryError("conflict", CONFLICT);
      const at = now();
      const token = newToken();
      const invitation: Invitation = { id: newId("inv"), email: tidy, role, tokenHash: hashToken(token), invitedBy, createdAt: at, expiresAt: addDays(at, INVITATION_DAYS) };
      if (!(await store.addInvitation(invitation))) throw new DirectoryError("conflict", CONFLICT);
      try {
        await send(invitation, token);
      } catch (error) {
        // Nothing is kept for an invitation nobody received: the Admin can simply try again.
        await store.deleteInvitation(invitation.id);
        throw error;
      }
      return toInvite(invitation);
    },

    async resendInvite(id) {
      const invitation = await store.invitation(id);
      if (!invitation) throw new DirectoryError("not_found", "This invitation no longer exists.");
      const at = now();
      const token = newToken();
      const renewed: Invitation = { ...invitation, tokenHash: hashToken(token), createdAt: at, expiresAt: addDays(at, INVITATION_DAYS) };
      // Sent first: if it fails, the old link keeps working and nothing changes.
      await send(renewed, token);
      if (!(await store.renewInvitation(id, { tokenHash: renewed.tokenHash, createdAt: at, expiresAt: renewed.expiresAt }))) {
        throw new DirectoryError("not_found", "This invitation no longer exists.");
      }
      return toInvite(renewed);
    },

    async revokeInvite(id) {
      if (!(await store.deleteInvitation(id))) throw new DirectoryError("not_found", "This invitation no longer exists.");
      return { revoked: true as const };
    },

    async setRole(userId, role) {
      const account = await store.setRole(userId, role);
      if (!account) throw new DirectoryError("not_found", "This person no longer exists.");
      return toUser(account);
    },
  };
}
```

- [ ] **Step 8: Run the tests and the type check, and watch them pass**

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
pnpm vitest run tests/unit/accounts-links.test.ts tests/unit/users.test.ts tests/unit/users-actions.test.ts tests/unit/messages.test.ts tests/unit/notifications.test.ts tests/unit/test-email.test.ts 2>&1 | tail -6
pnpm typecheck 2>&1 | tail -3
```

Expected:
- **Tests:** PASS for all six files.
  - `accounts-links.test.ts` has 20 tests.
  - `messages.test.ts` still finds every key in both languages.
  - The rendering tests show `renderBatch` and `renderTestEmail` unchanged.
- **Type check:** no errors.

- [ ] **Step 9: Commit**

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
RC=0; pnpm lint >/dev/null 2>&1 || RC=$?
if [ $RC -eq 0 ]; then
  git add messages/en.json messages/ar.json src/lib/notifications/render.ts src/lib/notifications/mail-error.ts src/lib/accounts/invitations.ts src/lib/accounts/resets.ts src/lib/accounts/first-admin.ts src/lib/accounts/accounts-directory.ts src/lib/users "src/app/[locale]/(app)/users/actions.ts" tests/unit/accounts-links.test.ts tests/unit/users.test.ts tests/unit/users-actions.test.ts
  git commit -m "feat(accounts): invitations with resend, password resets, the first Admin, and the accounts directory (M5c)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
else echo "lint failed: RC=$RC"; fi
```

Task test command: `pnpm vitest run tests/unit/accounts-links.test.ts tests/unit/users.test.ts tests/unit/users-actions.test.ts tests/unit/messages.test.ts tests/unit/notifications.test.ts tests/unit/test-email.test.ts`

---
### Task 5: Password mode in the app, and Clerk removed

**Files:**
- **Settings, cookie and helpers:**
  - Modify: `src/lib/env.ts`, `.env.example`
  - Create: `src/lib/accounts/cookie.ts`, `src/lib/actions/form.ts`
- **Session, directory and cron:** modify `src/lib/auth/session.ts`, `src/lib/users/directory.ts`, `src/app/api/cron/notifications/route.ts`
- **Sign-in:**
  - Modify: `src/app/[locale]/sign-in/page.tsx`
  - Create: `src/app/[locale]/sign-in/actions.ts`, `src/components/auth/auth-page.tsx`, `src/components/auth/sign-in-view.tsx`, `src/components/auth/sign-in-form.tsx`
- **Sign-out, proxy, layout and the rest of the app:** modify
  - `src/app/api/auth/sign-out/route.ts`, `src/components/shell/sign-out-control.tsx`, `src/proxy.ts`, `src/app/[locale]/layout.tsx`
  - `src/components/security/security-view.tsx`, `src/app/api/dev/outbox/route.ts`
  - `src/app/[locale]/(app)/users/actions.ts` (comments only), `src/lib/auth/two-factor.ts` (comment only)
  - `messages/en.json`, `messages/ar.json` (`SignIn`)
- **Delete:**
  - `src/lib/auth/clerk-session.ts`, `src/lib/auth/clerk-localization.ts`
  - `src/app/[locale]/sign-in/clerk-sign-in.tsx`, `src/components/security/clerk-security.tsx`, `src/components/shell/clerk-sign-out.tsx`
  - `src/lib/users/clerk-directory.ts`, `tests/unit/clerk-localization.test.ts`
- **Packages, scripts and the password e2e suite:**
  - Modify: `package.json`, `pnpm-lock.yaml` (Clerk removed; e2e scripts), `scripts/cpanel-build.sh`, `scripts/cpanel-deploy.sh`
  - Create: `playwright.password.config.ts`, `tests/e2e-password/constants.ts`, `tests/e2e-password/global-setup.ts`, `tests/e2e-password/helpers.ts`, `tests/e2e-password/sign-in.spec.ts`
- **Unit tests:**
  - Create: `tests/unit/sign-in-action.test.ts`
  - Modify: `tests/unit/env.test.ts`, `session.test.ts`, `session-cache.test.ts`, `sign-out-route.test.ts`, `proxy.test.ts`, `auth.test.ts`, `users.test.ts`, `cron-route.test.ts`, `two-factor.test.ts`

**Interfaces:**
- Consumes:
  - Task 2: `getAccountStore`
  - Task 3: `signIn`, `startSession`, `sessionAccount`, `endSession`
  - Task 4: `createAccountsDirectory`
  - Task 1: `clientAddress`
- Produces:
  - **Settings:**
    - `ServerEnv` = `{ engineMode; engineBaseUrl; engineApiKey; authMode: "mock" | "password"; twoFactor: TwoFactorPolicy; appUrl: string | null; adminEmail: string | null; testServer: boolean }`
    - `passwordEnv(): ServerEnv & { appUrl: string }`, which throws `This page needs AUTH_MODE=password.` otherwise
  - **Cookie and forms:**
    - `sessionCookieName(appUrl)`, `sessionCookieOptions(appUrl, expiresAt)`, `clearedSessionCookie(appUrl)`
    - `formText(form: FormData, name: string, max = 1000): string`
  - **Sign-in:**
    - `type SignInState = { error: "wrong" | "locked" | "invalid"; email: string } | null`
    - `signInAction(previous: SignInState, form: FormData): Promise<SignInState>`
  - **Components:** `<AuthPage>` (the frame of the signed-out pages), `<SignInView locale>` (under `<Suspense>`) and `<SignInForm locale>`
  - **e2e helpers:** `PASSWORD`, `withAccounts`, `resetAccounts`, `seedAccount`, `signInWithPassword` and `linkIn` (in `tests/e2e-password/helpers.ts`)

- [ ] **Step 1: Write the password-mode e2e suite (RED first: the build type-checks it, and everything it imports exists)**

In `package.json`, change the `e2e` script and add `e2e:password`:

```json
    "e2e": "playwright test && playwright test -c playwright.password.config.ts",
    "e2e:password": "playwright test -c playwright.password.config.ts",
```

Create `tests/e2e-password/constants.ts`:

```ts
export const E2E_PASSWORD_PORT = 3101;
export const E2E_PASSWORD_URL = `http://localhost:${E2E_PASSWORD_PORT}`;
/** The MySQL test database this suite recreates: articles_ai_test_e2e_password with the default TEST_DATABASE_URL. */
export const E2E_PASSWORD_DB = "e2e_password";
/** ADMIN_EMAIL on this suite's server. */
export const OWNER_EMAIL = "owner@example.com";
```

Create `playwright.password.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";
import { E2E_PASSWORD_DB, E2E_PASSWORD_PORT, E2E_PASSWORD_URL, OWNER_EMAIL } from "./tests/e2e-password/constants";
import { testDatabaseUrl } from "./tests/unit/mysql-test-db";

/**
 * The password-mode suite (spec M5c): the production build the main suite made (pnpm e2e runs that one first; alone,
 * run pnpm build before pnpm e2e:password), started with AUTH_MODE=password on the local MySQL. Playwright starts the
 * server before globalSetup, which recreates the database: /api/health, which Playwright polls, never touches it.
 */
export default defineConfig({
  testDir: "tests/e2e-password",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  expect: { timeout: 10_000 },
  globalSetup: "./tests/e2e-password/global-setup.ts",
  use: { baseURL: E2E_PASSWORD_URL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm start -p ${E2E_PASSWORD_PORT}`,
    url: `${E2E_PASSWORD_URL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      AUTH_MODE: "password",
      APP_URL: E2E_PASSWORD_URL,
      ADMIN_EMAIL: OWNER_EMAIL,
      TWO_FACTOR: "off",
      DB_MODE: "mysql",
      DATABASE_URL: testDatabaseUrl(E2E_PASSWORD_DB),
      EMAIL_MODE: "log",
      // A test server: the dev outbox, which these tests read invitation and reset links from, opens only on one.
      ALLOW_TEST_LOGINS: "1",
      ENGINE_MODE: "mock",
    },
  },
});
```

Create `tests/e2e-password/global-setup.ts`:

```ts
import { connectMysql } from "../../src/lib/db/mysql";
import { freshTestDatabase } from "../unit/mysql-test-db";
import { E2E_PASSWORD_DB } from "./constants";

/** A fresh database with the dashboard's tables, before any test. The server is up already but hasn't touched it. */
export default async function globalSetup(): Promise<void> {
  const connection = connectMysql(await freshTestDatabase(E2E_PASSWORD_DB));
  try {
    await connection.ready();
  } finally {
    await connection.close();
  }
}
```

Create `tests/e2e-password/helpers.ts`:

```ts
import { expect, type Page } from "@playwright/test";
import { createMysqlAccountStore } from "../../src/lib/accounts/mysql-store";
import { hashPassword } from "../../src/lib/accounts/passwords";
import type { Account, AccountStore } from "../../src/lib/accounts/store";
import { newId } from "../../src/lib/accounts/tokens";
import type { Role } from "../../src/lib/auth/roles";
import { connectMysql } from "../../src/lib/db/mysql";
import { adminQuery, testDatabaseName, testDatabaseUrl } from "../unit/mysql-test-db";
import { E2E_PASSWORD_DB } from "./constants";

export const PASSWORD = "correct horse battery";
const ACCOUNT_TABLES = ["users", "sessions", "invitations", "password_resets", "sign_in_limits"];

/** Runs `use` on the suite's accounts, in the database the server uses. */
export async function withAccounts<T>(use: (store: AccountStore) => Promise<T>): Promise<T> {
  const connection = connectMysql(testDatabaseUrl(E2E_PASSWORD_DB));
  try {
    return await use(createMysqlAccountStore(connection));
  } finally {
    await connection.close();
  }
}

/** No accounts, invitations, sessions or limits: every test starts from the same place. */
export async function resetAccounts(): Promise<void> {
  for (const table of ACCOUNT_TABLES) await adminQuery(`DELETE FROM \`${testDatabaseName(E2E_PASSWORD_DB)}\`.\`${table}\``);
}

export async function seedAccount(input: { email: string; role: Role | null; name?: string; password?: string }): Promise<Account> {
  const now = new Date();
  const account: Account = {
    id: newId("usr"),
    email: input.email,
    name: input.name ?? input.email,
    role: input.role,
    passwordHash: await hashPassword(input.password ?? PASSWORD),
    createdAt: now,
    passwordChangedAt: now,
    lastSignInAt: null,
  };
  await withAccounts(async (store) => {
    expect(await store.createAccount(account)).toBe(true);
  });
  return account;
}

export async function signInWithPassword(page: Page, email: string, password = PASSWORD, locale = "en"): Promise<void> {
  await page.goto(`/${locale}/sign-in`);
  await page.getByTestId("sign-in-email").fill(email);
  await page.getByTestId("sign-in-password").fill(password);
  await page.getByTestId("sign-in-submit").click();
}

/** The path of an emailed link (its English half), ready for page.goto. */
export function linkIn(text: string, path: "invitation" | "reset-password"): string {
  const match = new RegExp(`https?://[^/\\s]+(/en/${path}\\?token=[A-Za-z0-9_%-]+)`).exec(text);
  expect(match, `no /en/${path} link in the email`).not.toBeNull();
  return match?.[1] ?? "";
}
```

Create `tests/e2e-password/sign-in.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { PASSWORD, resetAccounts, seedAccount, signInWithPassword, withAccounts } from "./helpers";

test.beforeEach(async () => {
  await resetAccounts();
});

test("signs in with email and password, stays signed in, and signs out (spec M5c; Review Focus 2)", async ({ page, context }) => {
  await seedAccount({ email: "admin@example.com", role: "admin", name: "Sara Admin" });
  await page.goto("/en");
  await expect(page).toHaveURL(/\/en\/sign-in$/);
  await signInWithPassword(page, "Admin@Example.com");
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.getByTestId("user-name")).toHaveText("Sara Admin");
  expect((await context.cookies()).find((cookie) => cookie.name === "session")).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/" });
  await page.reload();
  await expect(page.getByTestId("user-name")).toHaveText("Sara Admin");
  await page.getByTestId("sign-out").click();
  await expect(page).toHaveURL(/\/en\/sign-in$/);
  await page.goto("/en");
  await expect(page).toHaveURL(/\/en\/sign-in$/);
});

test("a wrong password and an unknown email get the same answer, and the email stays in the form", async ({ page }) => {
  await seedAccount({ email: "admin@example.com", role: "admin" });
  await signInWithPassword(page, "admin@example.com", "not the password");
  await expect(page.getByTestId("sign-in-error")).toHaveText("Email or password is incorrect.");
  await expect(page.getByTestId("sign-in-email")).toHaveValue("admin@example.com");
  await signInWithPassword(page, "nobody@example.com");
  await expect(page.getByTestId("sign-in-error")).toHaveText("Email or password is incorrect.");
});

test("five wrong passwords lock the email for 15 minutes, even for the right one", async ({ page }) => {
  await seedAccount({ email: "admin@example.com", role: "admin" });
  for (let i = 0; i < 5; i += 1) {
    await signInWithPassword(page, "admin@example.com", "not the password");
    await expect(page.getByTestId("sign-in-error")).toHaveAttribute("data-reason", "wrong");
  }
  await signInWithPassword(page, "admin@example.com");
  await expect(page.getByTestId("sign-in-error")).toHaveText("Too many attempts. Try again in 15 minutes.");
});

test("someone without a role signs in to the No access page", async ({ page }) => {
  await seedAccount({ email: "pending@example.com", role: null });
  await signInWithPassword(page, "pending@example.com");
  await expect(page).toHaveURL(/\/en\/no-access$/);
});

test("removing someone's role takes effect on their next page (Review Focus 1)", async ({ page }) => {
  const reviewer = await seedAccount({ email: "reviewer@example.com", role: "reviewer" });
  await signInWithPassword(page, "reviewer@example.com");
  await expect(page).toHaveURL(/\/en$/);
  await withAccounts((store) => store.setRole(reviewer.id, null));
  await page.goto("/en/keywords");
  await expect(page).toHaveURL(/\/en\/no-access$/);
});

test("the sign-in page in Arabic", async ({ page }) => {
  await signInWithPassword(page, "nobody@example.com", PASSWORD, "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByText("كلمة المرور", { exact: true })).toBeVisible();
  await expect(page.getByTestId("sign-in-error")).toHaveText("البريد الإلكتروني أو كلمة المرور غير صحيحة.");
});
```

- [ ] **Step 2: Run the password suite and watch it fail**

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
pnpm build > /dev/null 2>&1; echo "build exit $?"
pnpm e2e:password 2>&1 | tail -12
```

Expected:
- `build exit 0`: the new files only import modules from Tasks 1–3.
- FAIL, all 6 tests. `AUTH_MODE=password` isn't accepted yet, so the pages answer with an error and `sign-in-email` is never found.

- [ ] **Step 3: Write the failing unit tests**

Replace the whole of `tests/unit/env.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import { MOCK_ENGINE_BASE_URL, parseServerEnv } from "@/lib/env";

const PASSWORD_MODE = { AUTH_MODE: "password", APP_URL: "https://dashboard.example.com/some/path" };

describe("parseServerEnv", () => {
  it("defaults to the mock engine and test logins, on a test server", () => {
    expect(parseServerEnv({})).toEqual({
      engineMode: "mock",
      engineBaseUrl: MOCK_ENGINE_BASE_URL,
      engineApiKey: "mock-key",
      authMode: "mock",
      twoFactor: "required",
      appUrl: null,
      adminEmail: null,
      testServer: true,
    });
  });

  it("signs people in itself with AUTH_MODE=password, keeping APP_URL's origin and a tidy ADMIN_EMAIL (spec M5c)", () => {
    expect(parseServerEnv({ ...PASSWORD_MODE, ADMIN_EMAIL: " Owner@Example.com " })).toMatchObject({
      authMode: "password",
      appUrl: "https://dashboard.example.com",
      adminEmail: "owner@example.com",
      twoFactor: "off",
    });
    expect(parseServerEnv({ AUTH_MODE: "password", APP_URL: "http://localhost:3101" }).appUrl).toBe("http://localhost:3101");
  });

  it("refuses the retired Clerk mode, naming password", () => {
    expect(() => parseServerEnv({ AUTH_MODE: "clerk" })).toThrow(/AUTH_MODE=password, APP_URL and ADMIN_EMAIL/);
  });

  it("needs an https APP_URL in password mode, except on this machine", () => {
    expect(() => parseServerEnv({ AUTH_MODE: "password" })).toThrow(/needs APP_URL/);
    expect(() => parseServerEnv({ AUTH_MODE: "password", APP_URL: "dashboard.example.com" })).toThrow(/needs APP_URL/);
    expect(() => parseServerEnv({ AUTH_MODE: "password", APP_URL: "http://dashboard.example.com" })).toThrow(/https/);
  });

  it("refuses an ADMIN_EMAIL that isn't one address", () => {
    for (const email of ["owner", "a@example.com, b@example.com", `${"a".repeat(250)}@example.com`]) {
      expect(() => parseServerEnv({ ...PASSWORD_MODE, ADMIN_EMAIL: email })).toThrow(/ADMIN_EMAIL/);
    }
  });

  it("keeps two-factor login off in password mode until M5d, refusing a request for it", () => {
    expect(parseServerEnv({ ...PASSWORD_MODE, TWO_FACTOR: "off" }).twoFactor).toBe("off");
    expect(() => parseServerEnv({ ...PASSWORD_MODE, TWO_FACTOR: "required" })).toThrow("Two-factor login arrives in M5d; set TWO_FACTOR=off.");
  });

  it("lets test logins switch two-factor login off, and treats empty strings as unset", () => {
    expect(parseServerEnv({ TWO_FACTOR: "off" }).twoFactor).toBe("off");
    expect(parseServerEnv({ TWO_FACTOR: "" }).twoFactor).toBe("required");
    expect(parseServerEnv({ ENGINE_BASE_URL: "", ENGINE_API_KEY: "", AUTH_MODE: "" }).authMode).toBe("mock");
    expect(() => parseServerEnv({ TWO_FACTOR: "optional" })).toThrow();
  });

  it("refuses test logins on Vercel and in a production build unless explicitly allowed", () => {
    expect(() => parseServerEnv({ VERCEL: "1" })).toThrow(/refused on Vercel/);
    expect(() => parseServerEnv({ NODE_ENV: "production" })).toThrow(/refused in production builds/);
    expect(parseServerEnv({ NODE_ENV: "production", ALLOW_TEST_LOGINS: "1" })).toMatchObject({ authMode: "mock", testServer: true });
    expect(parseServerEnv({ NODE_ENV: "production", ...PASSWORD_MODE })).toMatchObject({ authMode: "password", testServer: false });
  });

  it("requires a base URL and key for the live engine, and passes a provided key to the mock engine", () => {
    expect(() => parseServerEnv({ ENGINE_MODE: "live" })).toThrow(/ENGINE_BASE_URL and ENGINE_API_KEY/);
    expect(parseServerEnv({ ENGINE_MODE: "live", ENGINE_BASE_URL: "https://api.example.com/api/v1", ENGINE_API_KEY: "k" })).toMatchObject({
      engineMode: "live",
      engineBaseUrl: "https://api.example.com/api/v1",
      engineApiKey: "k",
    });
    expect(parseServerEnv({ ENGINE_API_KEY: "e2e-key" }).engineApiKey).toBe("e2e-key");
  });
});
```

In `tests/unit/session.test.ts`:

1. Add these imports below the existing session import:

```ts
import { endSession, startSession } from "@/lib/accounts/sign-in";
import { newId } from "@/lib/accounts/tokens";
import { getAccountStore } from "@/lib/db";
```

and add `getRole` to the `@/lib/auth/session` import.

2. Delete the test `it("ignores the twofactor_off scenario with real sign-in", …)`.

3. Add at the end of the file:

```ts
describe("password sessions (AUTH_MODE=password, spec M5c)", () => {
  beforeEach(() => {
    cookieJar.clear();
    vi.stubEnv("AUTH_MODE", "password");
    vi.stubEnv("APP_URL", "http://localhost:3000");
    vi.stubEnv("DB_MODE", "memory");
    vi.stubEnv("ENGINE_MODE", "mock");
  });
  afterEach(() => vi.unstubAllEnvs());

  async function signedIn(role: "admin" | "reviewer" | null): Promise<string> {
    const store = getAccountStore();
    const id = newId("usr");
    const now = new Date();
    await store.createAccount({ id, email: `${id}@example.com`.toLowerCase(), name: "Omar", role, passwordHash: "scrypt$x", createdAt: now, passwordChangedAt: now, lastSignInAt: null });
    cookieJar.set("session", (await startSession(store, id, now)).token);
    return id;
  }

  it("reads the person from the session cookie, with the role from their account on each request (Review Focus 1)", async () => {
    const id = await signedIn("reviewer");
    await expect(requireSession("en")).resolves.toMatchObject({ userId: id, role: "reviewer", twoFactor: false });
    await getAccountStore().setRole(id, null);
    await expect(requireSession("en")).rejects.toThrow("REDIRECT:/en/no-access");
    await expect(getRole()).resolves.toBeNull();
  });

  it("treats a missing, unknown or ended session as signed out", async () => {
    await expect(requireSession("ar")).rejects.toThrow("REDIRECT:/ar/sign-in");
    cookieJar.set("session", "not-a-token");
    await expect(getSession()).resolves.toBeNull();
    await signedIn("admin");
    await endSession(getAccountStore(), cookieJar.get("session") ?? "");
    await expect(getSession()).resolves.toBeNull();
  });

  it("never asks for two-factor login, whatever the test-login scenario cookie says", async () => {
    await signedIn("admin");
    cookieJar.set("mock_scenario", "twofactor_off");
    await expect(getTwoFactorPolicy()).resolves.toBe("off");
    await expect(requireSession("en")).resolves.toMatchObject({ role: "admin" });
  });
});
```

Replace the whole of `tests/unit/session-cache.test.ts` with:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryAccountStore } from "@/lib/accounts/memory-store";
import { startSession } from "@/lib/accounts/sign-in";

const state = vi.hoisted(() => ({ memo: new Map<unknown, unknown>(), cookie: "" }));

// React's cache memoises per request on the server; here, per test.
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache:
    (fn: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) => {
      if (!state.memo.has(fn)) state.memo.set(fn, fn(...args));
      return state.memo.get(fn);
    },
}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "session" && state.cookie ? { name, value: state.cookie } : undefined) }),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));
const accounts = createMemoryAccountStore();
const lookup = vi.spyOn(accounts, "sessionAccount");
vi.mock("@/lib/db", () => ({ getAccountStore: () => accounts }));

const { getRole, getSession, requirePermission, requireSession } = await import("@/lib/auth/session");

beforeEach(() => {
  state.memo.clear();
  state.cookie = "";
  lookup.mockClear();
  vi.stubEnv("AUTH_MODE", "password");
  vi.stubEnv("APP_URL", "http://localhost:3000");
  vi.stubEnv("ENGINE_MODE", "mock");
});

describe("password sessions are read once per request (spec M5c)", () => {
  it("every guard on a page, and a job poll's role, share one session lookup", async () => {
    const now = new Date();
    await accounts.createAccount({ id: "usr_admin", email: "admin@example.com", name: "Admin", role: "admin", passwordHash: "x", createdAt: now, passwordChangedAt: now, lastSignInAt: null });
    state.cookie = (await startSession(accounts, "usr_admin", now)).token;
    await requireSession("en");
    await requirePermission("en", "settings.manage");
    await getSession();
    expect(await getRole()).toBe("admin");
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it("a signed-out request makes no lookup", async () => {
    expect(await getRole()).toBeNull();
    expect(lookup).not.toHaveBeenCalled();
  });
});
```

Replace the whole of `tests/unit/sign-out-route.test.ts` with:

```ts
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sessionAccount, startSession } from "@/lib/accounts/sign-in";
import { getAccountStore } from "@/lib/db";

const { POST } = await import("@/app/api/auth/sign-out/route");

function signOutRequest(locale: string, headers: Record<string, string>) {
  const body = new FormData();
  body.set("locale", locale);
  return new NextRequest("http://localhost:3000/api/auth/sign-out", { method: "POST", body, headers });
}

describe("test-login sign-out (M1 follow-up: a full page load, so no hidden copy of the previous pages stays)", () => {
  beforeEach(() => {
    vi.stubEnv("AUTH_MODE", "mock");
    vi.stubEnv("ENGINE_MODE", "mock");
    vi.stubEnv("VERCEL", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("clears the test login and sends the browser to sign-in with a 303", async () => {
    const response = await POST(signOutRequest("ar", { cookie: "dev_session=dev_admin" }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost:3000/ar/sign-in");
    expect(response.headers.get("set-cookie")).toMatch(/^dev_session=;/);
  });

  it("uses the default language for one it doesn't know", async () => {
    expect((await POST(signOutRequest("xx", { cookie: "dev_session=dev_admin" }))).headers.get("location")).toBe("http://localhost:3000/en/sign-in");
  });
});

describe("password sign-out (spec M5c)", () => {
  beforeEach(() => {
    vi.stubEnv("AUTH_MODE", "password");
    vi.stubEnv("APP_URL", "https://dashboard.example.com");
    vi.stubEnv("DB_MODE", "memory");
    vi.stubEnv("ENGINE_MODE", "mock");
  });
  afterEach(() => vi.unstubAllEnvs());

  async function sessionToken(): Promise<string> {
    const store = getAccountStore();
    const now = new Date();
    await store.createAccount({ id: "usr_out", email: "out@example.com", name: "Out", role: "reviewer", passwordHash: "x", createdAt: now, passwordChangedAt: now, lastSignInAt: null });
    return (await startSession(store, "usr_out", now)).token;
  }

  it("ends the session and clears the __Host-session cookie with Secure and Path=/ (Review Focus 5)", async () => {
    const token = await sessionToken();
    const response = await POST(signOutRequest("ar", { origin: "https://dashboard.example.com", cookie: `__Host-session=${token}` }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://dashboard.example.com/ar/sign-in");
    const cleared = response.headers.get("set-cookie") ?? "";
    expect(cleared).toMatch(/^__Host-session=;/);
    expect(cleared).toMatch(/Path=\//);
    expect(cleared).toMatch(/Secure/);
    expect(cleared).toMatch(/HttpOnly/);
    expect(cleared).toMatch(/Max-Age=0/i);
    expect(await sessionAccount(getAccountStore(), token, new Date())).toBeNull();
  });

  it("refuses a sign-out posted from another site, and the session stays", async () => {
    const token = await sessionToken();
    const response = await POST(signOutRequest("en", { origin: "https://elsewhere.example", cookie: `__Host-session=${token}` }));
    expect(response.status).toBe(403);
    expect(await sessionAccount(getAccountStore(), token, new Date())).not.toBeNull();
  });
});
```

Replace the whole of `tests/unit/proxy.test.ts` with:

```ts
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import proxy, { config } from "@/proxy";

// Next compiles each matcher as a path pattern; this one is a plain regular expression.
const proxied = (path: string) => config.matcher.some((pattern) => new RegExp(`^${pattern}$`).test(path));

describe("the proxy (spec M5c: languages only)", () => {
  it("runs for pages, not for API routes or build assets", () => {
    expect([proxied("/en/review"), proxied("/api/jobs/j_1"), proxied("/api/health"), proxied("/_next/static/app.js")]).toEqual([true, false, false, false]);
  });

  it("sends a page without a locale to its locale", () => {
    expect(proxy(new NextRequest("http://localhost/review")).headers.get("location")).toMatch(/\/en\/review$/);
  });
});
```

Create `tests/unit/sign-in-action.test.ts`:

```ts
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword } from "@/lib/accounts/passwords";
import { getAccountStore } from "@/lib/db";

const state = vi.hoisted(() => ({ set: [] as Array<[string, string, Record<string, unknown>]>, forwardedFor: null as string | null }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: (name: string, value: string, options: Record<string, unknown>) => void state.set.push([name, value, options]) }),
  headers: async () => ({ get: (name: string) => (name === "x-forwarded-for" ? state.forwardedFor : null) }),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));

const { signInAction } = await import("@/app/[locale]/sign-in/actions");

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
};

beforeAll(async () => {
  vi.stubEnv("DB_MODE", "memory");
  const now = new Date();
  await getAccountStore().createAccount({
    id: "usr_action",
    email: "action@example.com",
    name: "Action",
    role: "admin",
    passwordHash: await hashPassword("correct horse battery"),
    createdAt: now,
    passwordChangedAt: now,
    lastSignInAt: null,
  });
});

beforeEach(() => {
  state.set = [];
  state.forwardedFor = "198.51.100.1, 203.0.113.9";
  vi.stubEnv("AUTH_MODE", "password");
  vi.stubEnv("APP_URL", "https://dashboard.example.com");
  vi.stubEnv("DB_MODE", "memory");
  vi.stubEnv("ENGINE_MODE", "mock");
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("the sign-in action (spec M5c)", () => {
  it("sets the __Host-session cookie, logs the trusted address, and opens the dashboard in the form's language", async () => {
    await expect(signInAction(null, form({ locale: "ar", email: "Action@example.com", password: "correct horse battery" }))).rejects.toThrow("REDIRECT:/ar");
    expect(state.set).toHaveLength(1);
    const [name, value, options] = state.set[0];
    expect(name).toBe("__Host-session");
    expect(value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(options).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/" });
    expect(console.info).toHaveBeenCalledWith("Signed in: action@example.com from 203.0.113.9");
  });

  it("answers a wrong password on the form, keeping the email, and sets no cookie", async () => {
    expect(await signInAction(null, form({ locale: "en", email: "action@example.com", password: "not the password" }))).toEqual({ error: "wrong", email: "action@example.com" });
    expect(state.set).toEqual([]);
  });

  it("asks for both fields", async () => {
    expect(await signInAction(null, form({ locale: "en", email: " ", password: "" }))).toEqual({ error: "invalid", email: " " });
  });

  it("refuses to run with test logins", async () => {
    vi.stubEnv("AUTH_MODE", "mock");
    await expect(signInAction(null, form({ locale: "en", email: "action@example.com", password: "x" }))).rejects.toThrow("This page needs AUTH_MODE=password.");
  });
});
```

In `tests/unit/cron-route.test.ts`:

1. Add the imports:

```ts
import { createMemoryAccountStore } from "@/lib/accounts/memory-store";
import type { AccountStore } from "@/lib/accounts/store";
```

2. Add `let accounts: AccountStore;` beside `let store`.
3. Change the db mock to `vi.mock("@/lib/db", () => ({ getStore: () => store, getAccountStore: () => accounts }));`.
4. In `beforeEach`, add `accounts = createMemoryAccountStore();`.
5. Add this case at the end of the `describe`:

```ts
  it("also forgets old sign-in records: invitations that expired over 30 days ago go (spec M5c)", async () => {
    const longAgo = new Date(Date.now() - 31 * 86_400_000);
    const inv = (id: string, expiresAt: Date) => ({ id, email: `${id}@example.com`, role: "reviewer" as const, tokenHash: id.padEnd(64, "a"), invitedBy: null, createdAt: longAgo, expiresAt });
    await accounts.addInvitation(inv("inv_old", longAgo));
    await accounts.addInvitation(inv("inv_new", new Date(Date.now() + 86_400_000)));
    await call("Bearer cron-secret");
    expect((await accounts.invitations()).map((invitation) => invitation.id)).toEqual(["inv_new"]);
  });
```

- [ ] **Step 4: Run them and watch them fail**

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
pnpm vitest run tests/unit/env.test.ts tests/unit/session.test.ts tests/unit/session-cache.test.ts tests/unit/sign-out-route.test.ts tests/unit/proxy.test.ts tests/unit/sign-in-action.test.ts tests/unit/cron-route.test.ts 2>&1 | grep -E "×|Tests  |FAIL" | head -30
```

Expected: FAIL.
- **`env.test.ts`:** the password, Clerk-refusal, `APP_URL`, `ADMIN_EMAIL` and two-factor cases fail, and so does the default (it lacks `appUrl`, `adminEmail` and `testServer`).
- **The session and sign-out password cases** fail, because the session is never read from the cookie.
- **`session-cache.test.ts`** fails: no lookup happens.
- **`proxy.test.ts`** fails on the matcher, which still includes `/api`.
- **`sign-in-action.test.ts`** can't resolve the action.
- **The cron case** fails, because the old invitation stays.

- [ ] **Step 5: Write the settings, the cookie and the form helper**

Replace the whole of `src/lib/env.ts` with:

```ts
import "server-only";
import { z } from "zod";
import type { TwoFactorPolicy } from "@/lib/auth/two-factor";

export const MOCK_ENGINE_BASE_URL = "https://mock.engine.local/api/v1";
const MOCK_ENGINE_DEFAULT_KEY = "mock-key";

const EnvSchema = z.object({
  ENGINE_MODE: z.enum(["mock", "live"]).default("mock"),
  ENGINE_BASE_URL: z.url().optional(),
  ENGINE_API_KEY: z.string().min(1).optional(),
  AUTH_MODE: z.enum(["mock", "password"]).default("mock"),
  APP_URL: z.string().optional(),
  ADMIN_EMAIL: z.string().optional(),
  VERCEL: z.string().optional(),
  NODE_ENV: z.string().optional(),
  ALLOW_TEST_LOGINS: z.string().optional(),
  TWO_FACTOR: z.enum(["required", "off"]).optional(),
});

export type ServerEnv = {
  engineMode: "mock" | "live";
  engineBaseUrl: string;
  engineApiKey: string;
  authMode: "mock" | "password";
  twoFactor: TwoFactorPolicy;
  /** The dashboard's own address (AUTH_MODE=password): every emailed link is built from it, never from a request. */
  appUrl: string | null;
  /** Spec M5c: while there's no Admin, this address gets the first Admin invitation. */
  adminEmail: string | null;
  /** A development build, or a production build with ALLOW_TEST_LOGINS=1: test logins, the in-memory store and the dev outbox may run. */
  testServer: boolean;
};

const THIS_MACHINE = new Set(["localhost", "127.0.0.1"]);
const OneEmail = z.email().max(254);

/** APP_URL as its origin: https, except on this machine (spec M5c). */
function appOrigin(value: string | undefined): string {
  if (!value || !URL.canParse(value)) {
    throw new Error("AUTH_MODE=password needs APP_URL, the dashboard's address, for example https://dashboard.example.com.");
  }
  const url = new URL(value);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && THIS_MACHINE.has(url.hostname))) {
    throw new Error("APP_URL must start with https:// (only http://localhost may use http).");
  }
  return url.origin;
}

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const cleaned = Object.fromEntries(Object.entries(source).map(([key, value]) => [key, value === "" ? undefined : value]));
  if (cleaned.AUTH_MODE === "clerk") {
    throw new Error("AUTH_MODE=clerk is no longer supported: the dashboard signs people in itself. Set AUTH_MODE=password, APP_URL and ADMIN_EMAIL.");
  }
  const env = EnvSchema.parse(cleaned);
  const testServer = env.NODE_ENV !== "production" || env.ALLOW_TEST_LOGINS === "1";

  if (env.AUTH_MODE === "mock") {
    if (env.VERCEL === "1") throw new Error("AUTH_MODE=mock is for local development only and is refused on Vercel. Set AUTH_MODE=password.");
    if (!testServer) {
      throw new Error("AUTH_MODE=mock is refused in production builds. Set AUTH_MODE=password, or ALLOW_TEST_LOGINS=1 for a local test build.");
    }
  }

  let appUrl: string | null = null;
  let adminEmail: string | null = null;
  let twoFactor: TwoFactorPolicy = env.TWO_FACTOR ?? "required";
  if (env.AUTH_MODE === "password") {
    appUrl = appOrigin(env.APP_URL);
    if (env.TWO_FACTOR === "required") throw new Error("Two-factor login arrives in M5d; set TWO_FACTOR=off.");
    twoFactor = "off";
    if (env.ADMIN_EMAIL) {
      const tidy = env.ADMIN_EMAIL.trim().toLowerCase();
      if (!OneEmail.safeParse(tidy).success) throw new Error("ADMIN_EMAIL must be one email address of at most 254 characters.");
      adminEmail = tidy;
    }
  }

  const auth = { authMode: env.AUTH_MODE, twoFactor, appUrl, adminEmail, testServer };
  if (env.ENGINE_MODE === "live") {
    if (!env.ENGINE_BASE_URL || !env.ENGINE_API_KEY) {
      throw new Error("ENGINE_MODE=live needs ENGINE_BASE_URL and ENGINE_API_KEY.");
    }
    return { engineMode: "live", engineBaseUrl: env.ENGINE_BASE_URL, engineApiKey: env.ENGINE_API_KEY, ...auth };
  }
  return { engineMode: "mock", engineBaseUrl: MOCK_ENGINE_BASE_URL, engineApiKey: env.ENGINE_API_KEY ?? MOCK_ENGINE_DEFAULT_KEY, ...auth };
}

/** Parsed on every call (cheap), so tests and runtime always see the current environment. */
export function serverEnv(): ServerEnv {
  return parseServerEnv(process.env);
}

/** For pages and actions that only exist in password mode: the settings, with APP_URL. */
export function passwordEnv(): ServerEnv & { appUrl: string } {
  const env = serverEnv();
  if (env.authMode !== "password" || !env.appUrl) throw new Error("This page needs AUTH_MODE=password.");
  return { ...env, appUrl: env.appUrl };
}
```

Create `src/lib/accounts/cookie.ts`:

```ts
const secure = (appUrl: string) => appUrl.startsWith("https:");

/**
 * Spec M5c: the session cookie. On HTTPS it's `__Host-session`: Secure, Path=/ and no Domain, so no other subdomain
 * can set or read it. On http://localhost (tests), where Secure isn't possible, it's plain `session`.
 */
export const sessionCookieName = (appUrl: string): string => (secure(appUrl) ? "__Host-session" : "session");

export function sessionCookieOptions(appUrl: string, expiresAt: Date) {
  return { httpOnly: true, secure: secure(appUrl), sameSite: "lax" as const, path: "/", expires: expiresAt };
}

/** What clears it: a browser drops a __Host- cookie only when the clearing one has the same Secure and Path=/. */
export function clearedSessionCookie(appUrl: string) {
  return { ...sessionCookieOptions(appUrl, new Date(0)), maxAge: 0 };
}
```

Create `src/lib/actions/form.ts`:

```ts
/** A form field as text, cut to `max` characters; a missing field or a file is "". */
export function formText(form: FormData, name: string, max = 1000): string {
  const value = form.get(name);
  return typeof value === "string" ? value.slice(0, max) : "";
}
```

In `.env.example`, replace the lines from `# Sign-in: "mock" = local test logins…` through `TWO_FACTOR=` with:

```
# Sign-in (spec M5c): "password" = the dashboard's own accounts; "mock" = local test logins (development only).
AUTH_MODE=mock
# Test logins are also refused in production builds (next build / next start) unless this is 1.
# Only for local test builds — never set it on a server people can reach.
ALLOW_TEST_LOGINS=
# AUTH_MODE=password: the dashboard's address, for example https://dashboard.fakhernco.com. Every emailed link is built
# from it (https, or http://localhost for local runs).
APP_URL=
# AUTH_MODE=password: while the dashboard has no Admin, this address gets the first Admin invitation.
ADMIN_EMAIL=
# Test logins: "required" (default) makes Admins turn on two-factor login; "off" asks nobody.
# AUTH_MODE=password: always off until two-factor login arrives (M5d).
TWO_FACTOR=
```

- [ ] **Step 6: Read password sessions, and point the directory and the cron at the accounts**

In `src/lib/auth/session.ts`:

1. Replace the import `import { roleFromClaims, sessionFromClerkUser } from "./clerk-session";` with:

```ts
import { sessionCookieName } from "@/lib/accounts/cookie";
import { sessionAccount } from "@/lib/accounts/sign-in";
import { getAccountStore } from "@/lib/db";
```

2. Replace the whole `getSession` declaration with:

```ts
/** Reads the signed-in person once per request (React cache), so a page's many guards make one lookup. Call only under <Suspense>. */
export const getSession = cache(async (): Promise<Session | null> => {
  const env = serverEnv();
  const jar = await cookies();
  if (env.authMode === "mock") {
    // The cookie names a fixed test user; their current role and two-factor status come from the test directory,
    // so a change on /users takes effect on the person's next request.
    // Test logins only: the "auth_crash" scenario stands in for a sign-in that fails while reading the session.
    if (jar.get(MOCK_SCENARIO_COOKIE)?.value === "auth_crash") throw new Error("Simulated sign-in outage (mock scenario auth_crash).");
    const user = decodeMockSession(jar.get(MOCK_SESSION_COOKIE)?.value);
    return user ? createMockDirectory(jar.get(MOCK_STORE_COOKIE)?.value).sessionOf(user.userId) : null;
  }
  // Spec M5c: the cookie names a session in the database, and the account's current role comes with it, so a change on
  // /users takes effect on the next request.
  const token = env.appUrl ? jar.get(sessionCookieName(env.appUrl))?.value : undefined;
  if (!token) return null;
  const account = await sessionAccount(getAccountStore(), token, new Date());
  return account ? { userId: account.id, email: account.email, name: account.name, role: account.role, twoFactor: false } : null;
});
```

3. Replace `getRole` (with its comment) by:

```ts
/** Just the role, for a route polled every few seconds (/api/jobs): the same one-query session lookup. */
export async function getRole(): Promise<Role | null> {
  return (await getSession())?.role ?? null;
}
```

In `src/lib/users/directory.ts`:

1. Replace the Clerk import with:

```ts
import { createAccountsDirectory } from "@/lib/accounts/accounts-directory";
import { getAccountStore } from "@/lib/db";
import { mailerFor } from "@/lib/notifications/mailer";
import { servicesEnv } from "@/lib/services-env";
```

2. Replace `getDirectory` with:

```ts
/** The users behind this dashboard: its own accounts (AUTH_MODE=password), or the test directory (per mock_store namespace). */
export async function getDirectory(): Promise<UserDirectory> {
  const env = serverEnv();
  if (env.authMode === "mock") {
    const jar = await cookies();
    if (jar.get(MOCK_SCENARIO_COOKIE)?.value === SIGNIN_DOWN) return unreachableDirectory();
    return createMockDirectory(jar.get(MOCK_STORE_COOKIE)?.value);
  }
  return createAccountsDirectory({ store: getAccountStore(), mailer: mailerFor(servicesEnv()), appUrl: env.appUrl ?? "" });
}
```

In `src/app/api/cron/notifications/route.ts`:

1. Add `getAccountStore` to the `@/lib/db` import, and `KEEP_DAYS` to the `@/lib/notifications/flush` import.
2. Replace the `exclusive(…)` call's callback with:

```ts
    const outcome = await store.exclusive("articles_ai_flush", async () => {
      const result = await flushNotifications({
        store,
        mailer: mailerFor(env),
        users: async () => (await (await getDirectory()).list()).users,
        origin: config ? new URL(config.url).origin : null,
        now: new Date(),
        quietMs: env.notifyQuietMs,
      });
      // Spec M5c: the same run tidies the sign-in tables. Expired invitations stay listed (as Expired) for 30 days.
      const now = new Date();
      await getAccountStore().forgetExpired({
        now,
        invitationsBefore: new Date(now.getTime() - KEEP_DAYS * 86_400_000),
        limitsBefore: new Date(now.getTime() - 86_400_000),
      });
      return result;
    });
```

- [ ] **Step 7: Our sign-in page, and sign-out in both modes**

Add the sign-in texts. They go under `SignIn`, keeping the existing `title` and `signInAs`:

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
SCRATCH=$(mktemp -d)
cat > "$SCRATCH/m5c-sign-in.mjs" <<'EOF'
import fs from "node:fs";

const ADD = {
  en: {
    devNotice: "Local test logins: they only work on a test server.",
    email: "Email",
    password: "Password",
    submit: "Sign in",
    signingIn: "Signing in…",
    errors: {
      wrong: "Email or password is incorrect.",
      locked: "Too many attempts. Try again in 15 minutes.",
      invalid: "Enter your email and password.",
    },
  },
  ar: {
    devNotice: "تسجيلات دخول تجريبية محلية: تعمل على خادم الاختبار فقط.",
    email: "البريد الإلكتروني",
    password: "كلمة المرور",
    submit: "تسجيل الدخول",
    signingIn: "جارٍ تسجيل الدخول…",
    errors: {
      wrong: "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
      locked: "محاولات كثيرة جدًا. حاول مرة أخرى بعد 15 دقيقة.",
      invalid: "أدخل بريدك الإلكتروني وكلمة المرور.",
    },
  },
};
for (const [locale, texts] of Object.entries(ADD)) {
  const file = `messages/${locale}.json`;
  const messages = JSON.parse(fs.readFileSync(file, "utf8"));
  Object.assign(messages.SignIn, texts);
  fs.writeFileSync(file, `${JSON.stringify(messages, null, 2)}\n`);
}
EOF
node "$SCRATCH/m5c-sign-in.mjs" && git diff --stat messages/
```

Create `src/components/auth/auth-page.tsx`:

```tsx
import type { ReactNode } from "react";
import { LocaleSwitch } from "@/components/shell/locale-switch";
import { ThemeToggle } from "@/components/shell/theme-toggle";

/** The frame of the pages outside the signed-in shell: sign-in, invitation, forgot and reset password. */
export function AuthPage({ children }: { children: ReactNode }) {
  return (
    <main className="relative flex min-h-dvh items-center justify-center p-6">
      <div className="absolute end-4 top-4 flex gap-2">
        <ThemeToggle />
        <LocaleSwitch />
      </div>
      {children}
    </main>
  );
}
```

Create `src/app/[locale]/sign-in/actions.ts`:

```ts
"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { asAppLocale } from "@/i18n/locales";
import { sessionCookieName, sessionCookieOptions } from "@/lib/accounts/cookie";
import { clientAddress } from "@/lib/accounts/request";
import { signIn } from "@/lib/accounts/sign-in";
import { formText } from "@/lib/actions/form";
import { getAccountStore } from "@/lib/db";
import { passwordEnv } from "@/lib/env";

export type SignInState = { error: "wrong" | "locked" | "invalid"; email: string } | null;

/** Spec M5c: our sign-in form. A refusal comes back to the form, keeping the email; success sets the session cookie and opens the dashboard. */
export async function signInAction(_previous: SignInState, form: FormData): Promise<SignInState> {
  const env = passwordEnv();
  const locale = asAppLocale(formText(form, "locale"));
  const email = formText(form, "email", 320);
  const password = formText(form, "password");
  if (!email.trim() || !password) return { error: "invalid", email };
  const address = clientAddress((await headers()).get("x-forwarded-for"));
  const result = await signIn(getAccountStore(), { email, password, address, now: new Date() });
  if (!result.ok) return { error: result.reason, email };
  (await cookies()).set(sessionCookieName(env.appUrl), result.token, sessionCookieOptions(env.appUrl, result.expiresAt));
  redirect(`/${locale}`);
}
```

Create `src/components/auth/sign-in-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { signInAction, type SignInState } from "@/app/[locale]/sign-in/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Spec M5c: email and password. A refusal shows here; the email stays in its field (React resets the form after an action). */
export function SignInForm({ locale }: { locale: string }) {
  const t = useTranslations("SignIn");
  const [state, action, pending] = useActionState<SignInState, FormData>(signInAction, null);

  return (
    <form action={action} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="locale" value={locale} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sign-in-email">{t("email")}</Label>
        <Input id="sign-in-email" name="email" type="email" dir="ltr" autoComplete="username" defaultValue={state?.email} data-testid="sign-in-email" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sign-in-password">{t("password")}</Label>
        <Input id="sign-in-password" name="password" type="password" dir="ltr" autoComplete="current-password" data-testid="sign-in-password" />
      </div>
      {state?.error && (
        <p role="alert" data-testid="sign-in-error" data-reason={state.error} className="rounded-md bg-bad-bg px-3 py-2 text-sm text-bad-fg">
          {t(`errors.${state.error}`)}
        </p>
      )}
      <Button type="submit" disabled={pending} data-testid="sign-in-submit">
        {pending ? t("signingIn") : t("submit")}
      </Button>
    </form>
  );
}
```

Create `src/components/auth/sign-in-view.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import { connection } from "next/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AppLocale } from "@/i18n/locales";
import { signInAsMockUser } from "@/lib/auth/mock-actions";
import { MOCK_USERS } from "@/lib/auth/mock-session";
import { serverEnv } from "@/lib/env";
import { SignInForm } from "./sign-in-form";

/** Read at request time: the sign-in mode is a runtime setting, so one build serves both modes. Call only under <Suspense>. */
export async function SignInView({ locale }: { locale: AppLocale }) {
  await connection();
  const t = await getTranslations("SignIn");
  if (serverEnv().authMode === "mock") {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="font-heading text-2xl">{t("title")}</CardTitle>
          <CardDescription>{t("devNotice")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {MOCK_USERS.map((user) => (
            <form key={user.userId} action={signInAsMockUser}>
              <input type="hidden" name="userId" value={user.userId} />
              <input type="hidden" name="locale" value={locale} />
              <Button type="submit" variant="outline" className="w-full" data-testid={`sign-in-${user.userId}`}>
                {t("signInAs", { name: user.name })}
              </Button>
            </form>
          ))}
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="font-heading text-2xl">{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <SignInForm locale={locale} />
      </CardContent>
    </Card>
  );
}
```

Replace the whole of `src/app/[locale]/sign-in/page.tsx` with:

```tsx
import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";
import { AuthPage } from "@/components/auth/auth-page";
import { SignInView } from "@/components/auth/sign-in-view";
import { asAppLocale } from "@/i18n/locales";

export default async function SignInPage({ params }: PageProps<"/[locale]/sign-in">) {
  const locale = asAppLocale((await params).locale);
  setRequestLocale(locale);
  return (
    <AuthPage>
      <Suspense fallback={null}>
        <SignInView locale={locale} />
      </Suspense>
    </AuthPage>
  );
}
```

Replace the whole of `src/app/api/auth/sign-out/route.ts` with:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { asAppLocale } from "@/i18n/locales";
import { clearedSessionCookie, sessionCookieName } from "@/lib/accounts/cookie";
import { endSession } from "@/lib/accounts/sign-in";
import { MOCK_SESSION_COOKIE } from "@/lib/auth/mock-session";
import { getAccountStore } from "@/lib/db";
import { serverEnv } from "@/lib/env";

/**
 * Sign-out as a plain form POST answered with a redirect: the browser loads the sign-in page itself, so no hidden copy
 * of the previous person's pages stays in the DOM (Next keeps recent pages hidden after in-app navigation). In password
 * mode it ends the session in the database, and refuses a form posted from another site (spec M5c).
 */
export async function POST(request: NextRequest) {
  const env = serverEnv();
  const form = await request.formData();
  const locale = asAppLocale(String(form.get("locale") ?? ""));
  if (env.authMode === "password" && env.appUrl) {
    if (request.headers.get("origin") !== env.appUrl) return new NextResponse(null, { status: 403 });
    const name = sessionCookieName(env.appUrl);
    const token = request.cookies.get(name)?.value;
    if (token) await endSession(getAccountStore(), token);
    const response = NextResponse.redirect(new URL(`/${locale}/sign-in`, env.appUrl), 303);
    response.cookies.set(name, "", clearedSessionCookie(env.appUrl));
    return response;
  }
  const response = NextResponse.redirect(new URL(`/${locale}/sign-in`, request.url), 303);
  response.cookies.delete(MOCK_SESSION_COOKIE);
  return response;
}
```

Replace the whole of `src/components/shell/sign-out-control.tsx` with:

```tsx
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import type { AppLocale } from "@/i18n/locales";

/** Both modes: a plain form POST, not a server action, so the browser loads the sign-in page itself (M1 follow-up). */
export async function SignOutControl({ locale }: { locale: AppLocale }) {
  const t = await getTranslations("Shell");
  return (
    <form method="post" action="/api/auth/sign-out">
      <input type="hidden" name="locale" value={locale} />
      <Button type="submit" variant="ghost" size="sm" data-testid="sign-out">
        {t("signOut")}
      </Button>
    </form>
  );
}
```

- [ ] **Step 8: Remove Clerk everywhere else**

Replace the whole of `src/proxy.ts` with:

```ts
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

/** Languages only (spec M5c): pages and routes check access themselves, and API routes don't come through here. */
export default createMiddleware(routing);

export const config = { matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"] };
```

In `src/app/[locale]/layout.tsx`:
- Remove the imports of `ClerkProvider`, `clerkLocalizationFor` and `serverEnv`.
- Replace the whole `{serverEnv().authMode === "clerk" ? (…) : (content)}` expression in `<body>` with `{content}`.

In `src/components/security/security-view.tsx`:
- Remove the imports of `ClerkSecurity` and `serverEnv`, and the line `const clerk = …`.
- Replace `{clerk && <ClerkSecurity />}` with nothing.
- Change `{!clerk && (status === "required" || status === "recommended") && (` to `{(status === "required" || status === "recommended") && (`.
- Change `{(status !== "required" || clerk) && (` to `{status !== "required" && (`.
- Delete the comment line above it about Clerk.

In `src/app/api/dev/outbox/route.ts`, replace the guard line and its comment with:

```ts
/** Test servers with EMAIL_MODE=log only (spec M5c: in either sign-in mode): the emails this server would have sent. 404 anywhere else. */
export async function GET() {
  await connection(); // read at request time: a GET that reads no request would be prerendered at build (Cache Components)
  if (!serverEnv().testServer || servicesEnv().emailMode !== "log") return new Response(null, { status: 404 });
```

with the rest of the function unchanged.

In `src/app/[locale]/(app)/users/actions.ts`, replace the two Clerk comments:
- `// Ids go into Clerk API paths: letters, digits, "_" and "-" only.` becomes `// Ids go into database lookups: letters, digits, "_" and "-" only, like the ids the dashboard makes.`
- The two lines starting `// The idempotency key from useEngineAction is checked but not sent: Clerk takes none…` become:

```ts
// The idempotency key from useEngineAction is checked but not used: each change here is safe to repeat (a second
// invitation to the same email is refused as a duplicate; setting the same role twice changes nothing).
```

In `src/lib/auth/two-factor.ts`, change the comment's `(Clerk's free plan has no two-factor login)` to `(always, with AUTH_MODE=password, until M5d)`. In `tests/unit/two-factor.test.ts`, change the test title's `Clerk's free plan` to `password sign-in until M5d`.

Delete the Clerk code and its tests:

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
git rm -q src/lib/auth/clerk-session.ts src/lib/auth/clerk-localization.ts "src/app/[locale]/sign-in/clerk-sign-in.tsx" src/components/security/clerk-security.tsx src/components/shell/clerk-sign-out.tsx src/lib/users/clerk-directory.ts tests/unit/clerk-localization.test.ts
pnpm remove @clerk/nextjs @clerk/localizations 2>&1 | tail -2
```

In `tests/unit/auth.test.ts`:
- Delete the import of `@/lib/auth/clerk-session`.
- Delete the two `describe` blocks `sessionFromClerkUser` and `roleFromClaims (…)`.

In `tests/unit/users.test.ts`:
- Delete the import of `@/lib/users/clerk-directory`.
- Delete everything from the line `type Call = [string, ...unknown[]];` up to the line before `describe("tryDirectory", …)`. That's the fake Clerk client and the `describe("the Clerk directory …")` block.

In `scripts/cpanel-build.sh`:
- Change the header's "Reads AUTH_MODE, ENGINE_MODE, TWO_FACTOR, ALLOW_TEST_LOGINS and NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY" to "Reads AUTH_MODE, ENGINE_MODE, TWO_FACTOR and ALLOW_TEST_LOGINS".
- Delete the line `PUBLISHABLE_KEY=$(setting NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)`.
- Replace the `clerk)` case with:

```bash
  password)
    SUFFIX=""
    ;;
```

- Change the error message to `echo "AUTH_MODE must be password or mock in $SETTINGS." >&2`.
- Delete the line `  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="$PUBLISHABLE_KEY" \` from the `env -i …` build command.

In `scripts/cpanel-deploy.sh`:
- Change `  clerk) HTACCESS=deploy/cpanel/htaccess ;;` to `  password) HTACCESS=deploy/cpanel/htaccess ;;`.
- Change the comment `# The password goes up before a preview is live, and comes off only once a Clerk build is.` to `# The password goes up before a preview is live, and comes off only once a password-mode build is.`

Then check that no Clerk is left:

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
grep -rni "clerk" src tests scripts package.json playwright.config.ts playwright.password.config.ts .env.example || echo "no Clerk left"
bash -n scripts/cpanel-build.sh && bash -n scripts/cpanel-deploy.sh && echo "scripts parse"
```

Expected: `no Clerk left`, then `scripts parse`.

- [ ] **Step 9: Run the unit tests and the type check, and watch them pass**

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
pnpm test > /tmp/m5c-task5-unit.log 2>&1; echo "unit exit $?"; grep -E "Test Files|Tests  " /tmp/m5c-task5-unit.log
pnpm typecheck 2>&1 | tail -3
```

Expected: `unit exit 0`, with every file passing, and no type errors.

- [ ] **Step 10: Run both e2e suites and watch them pass**

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
pnpm e2e > /tmp/m5c-task5-e2e.log 2>&1; echo "e2e exit $?"; grep -E "passed|failed" /tmp/m5c-task5-e2e.log
```

Expected: `e2e exit 0`. The mock suite passes in full: the test-login sign-in page and sign-out are unchanged for it. Then the password suite passes, 6 tests.

- [ ] **Step 11: Commit**

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
RC=0; pnpm lint >/dev/null 2>&1 || RC=$?
if [ $RC -eq 0 ]; then
  git add -A src tests messages scripts package.json pnpm-lock.yaml .env.example playwright.password.config.ts
  git commit -m "feat(auth): AUTH_MODE=password — our own sign-in page, sessions and sign-out; Clerk removed (M5c)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
else echo "lint failed: RC=$RC"; fi
```

Task test command: `pnpm test`

---
### Task 6: Invitation, forgot-password and reset pages, the first Admin, and the Account page

**Files:**
- Modify: `messages/en.json`, `messages/ar.json` (`SignIn.forgot`, `SignIn.firstAdmin`, `Password`, `Invitation`, `ForgotPassword`, `ResetPassword`, `Account`, `Shell.security`)
- Create pages and actions:
  - `src/app/[locale]/invitation/page.tsx` and `actions.ts`
  - `src/app/[locale]/forgot-password/page.tsx` and `actions.ts`
  - `src/app/[locale]/reset-password/page.tsx` and `actions.ts`
  - `src/app/[locale]/security/actions.ts`
- Create components:
  - in `src/components/auth/`: `link-token.ts`, `new-password-fields.tsx`, `invitation-view.tsx`, `accept-invitation-form.tsx`, `forgot-password-view.tsx`, `forgot-password-form.tsx`, `reset-password-view.tsx`, `reset-password-form.tsx`, `first-admin-notice.tsx`
  - `src/components/security/change-password-form.tsx`
- Modify: `src/components/auth/sign-in-view.tsx` (the notice and "Forgot password?"), `src/components/security/security-view.tsx` (the Account page in password mode)
- Test:
  - `tests/e2e-password/accounts.spec.ts` (RED first)
  - `tests/unit/account-actions.test.ts`
  - `tests/e2e/security.spec.ts` (the menu label is now "Account")

**Interfaces:**
- Consumes:
  - Task 4: `lookUpInvitation`, `acceptInvitation`, `AcceptProblem`, `requestReset`, `resetLinkValid`, `completeReset`, `ResetProblem`, `ensureFirstAdmin`
  - Task 3: `changePassword`
  - Task 5: `passwordEnv`, `sessionCookieName`, `sessionCookieOptions`, `formText`, `AuthPage`, `SignInView`
  - Task 1: `PasswordProblem`
- Produces:
  - **Actions:**
    - `acceptInvitationAction(prev: AcceptState, form): Promise<AcceptState>`, with `AcceptState = { problem: AcceptProblem | "mismatch"; name: string } | null`
    - `requestResetAction(prev: ForgotState, form): Promise<ForgotState>`, with `ForgotState = { sent: true } | { problem: "empty" } | null`
    - `resetPasswordAction(prev: ResetState, form): Promise<ResetState>`, with `ResetState = { problem: ResetProblem | "mismatch" } | null`
    - `changePasswordAction(prev: ChangeState, form): Promise<ChangeState>`, with `ChangeState = { changed: true } | { problem: "current" | "mismatch" | PasswordProblem } | null`
  - **Test ids:**
    - **Invitation page:** `invitation-email`, `invitation-name`, `invitation-password`, `invitation-confirm`, `invitation-submit`, `invitation-error` (a form problem), `invitation-problem` (an unusable link) and `invitation-intro`
    - **Forgot password:** `forgot-email`, `forgot-submit`, `forgot-sent`, `forgot-error`
    - **Reset page:** `reset-password`, `reset-confirm`, `reset-submit`, `reset-error`, `reset-invalid`
    - **Account page:** `account-details`, `account-current`, `account-password`, `account-confirm`, `account-submit`, `account-changed`, `account-error`
    - **Sign-in page:** `first-admin` (with `data-state`), `sign-in-forgot`

- [ ] **Step 1: Write the failing e2e tests (password suite)**

Create `tests/e2e-password/accounts.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { hashToken, newToken } from "../../src/lib/accounts/tokens";
import { newEmails, readOutbox } from "../e2e/helpers";
import { OWNER_EMAIL } from "./constants";
import { linkIn, PASSWORD, resetAccounts, seedAccount, signInWithPassword, withAccounts } from "./helpers";

test.beforeEach(async () => {
  await resetAccounts();
});

test("the first Admin: with no Admin, the sign-in page emails ADMIN_EMAIL an invitation, once; following it makes the Admin (spec M5c)", async ({ page }) => {
  const before = await readOutbox(page);
  await page.goto("/en/sign-in");
  await expect(page.getByTestId("first-admin")).toHaveAttribute("data-state", "invited");
  await expect(page.getByTestId("first-admin")).toContainText("o•••@example.com");
  await page.reload();
  const sent = newEmails(before, await readOutbox(page));
  expect(sent.map((email) => email.to)).toEqual([OWNER_EMAIL]);
  expect(sent[0].subject).toBe("You're invited to Articles AI · دعوة إلى Articles AI");

  await page.goto(linkIn(sent[0].text, "invitation"));
  await expect(page.getByTestId("invitation-email")).toHaveValue(OWNER_EMAIL);
  await expect(page.getByTestId("invitation-intro")).toContainText("as Admin");
  await page.getByTestId("invitation-name").fill("Nour Owner");
  await page.getByTestId("invitation-password").fill(PASSWORD);
  await page.getByTestId("invitation-confirm").fill(PASSWORD);
  await page.getByTestId("invitation-submit").click();
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.getByTestId("user-role")).toHaveText("Admin");
  await page.getByTestId("sign-out").click();
  await expect(page).toHaveURL(/\/en\/sign-in$/);
  await expect(page.getByTestId("first-admin")).toHaveCount(0);
});

test("an Admin invites a Reviewer, who sets a password and signs in; the link works once (Review Focus 3)", async ({ page, browser }) => {
  await seedAccount({ email: "admin@example.com", role: "admin" });
  await signInWithPassword(page, "admin@example.com");
  await expect(page).toHaveURL(/\/en$/);
  const before = await readOutbox(page);
  await page.goto("/en/users");
  await page.getByTestId("invite-email").fill("New.Reviewer@Example.com");
  await page.getByTestId("invite-submit").click();
  await expect(page.locator('[data-testid^="pending-invite-"]')).toContainText("new.reviewer@example.com");
  const [invitation] = newEmails(before, await readOutbox(page));
  expect(invitation.to).toBe("new.reviewer@example.com");
  const link = linkIn(invitation.text, "invitation");

  const invitee = await (await browser.newContext()).newPage();
  await invitee.goto(link);
  await invitee.getByTestId("invitation-name").fill("Omar");
  await invitee.getByTestId("invitation-password").fill(PASSWORD);
  await invitee.getByTestId("invitation-confirm").fill(PASSWORD);
  await invitee.getByTestId("invitation-submit").click();
  await expect(invitee).toHaveURL(/\/en$/);
  await expect(invitee.getByTestId("user-role")).toHaveText("Reviewer");

  const again = await (await browser.newContext()).newPage();
  await again.goto(link);
  await expect(again.getByTestId("invitation-problem")).toHaveText("This invitation link isn't valid.");
});

test("an expired invitation says so; the form checks the two passwords match; Arabic", async ({ page }) => {
  const expiredToken = newToken();
  const liveToken = newToken();
  const past = new Date(Date.now() - 60_000);
  await withAccounts(async (store) => {
    await store.addInvitation({ id: "inv_e2e_expired", email: "late@example.com", role: "reviewer", tokenHash: hashToken(expiredToken), invitedBy: null, createdAt: past, expiresAt: past });
    await store.addInvitation({ id: "inv_e2e_live", email: "live@example.com", role: "reviewer", tokenHash: hashToken(liveToken), invitedBy: null, createdAt: new Date(), expiresAt: new Date(Date.now() + 86_400_000) });
  });
  await page.goto(`/en/invitation?token=${expiredToken}`);
  await expect(page.getByTestId("invitation-problem")).toHaveText("This invitation has expired. Ask your Admin for a new one.");

  await page.goto(`/en/invitation?token=${liveToken}`);
  await page.getByTestId("invitation-name").fill("Live");
  await page.getByTestId("invitation-password").fill(PASSWORD);
  await page.getByTestId("invitation-confirm").fill("something else entirely");
  await page.getByTestId("invitation-submit").click();
  await expect(page.getByTestId("invitation-error")).toHaveText("The two passwords don't match.");
  await expect(page.getByTestId("invitation-name")).toHaveValue("Live");

  await page.goto("/ar/invitation?token=nonsense");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByTestId("invitation-problem")).toHaveText("رابط الدعوة هذا غير صالح.");
});

test("forgot password: the same answer for any email; the link sets a new password, signs out everywhere else, and works once (Review Focus 2)", async ({ page, browser }) => {
  await seedAccount({ email: "reviewer@example.com", role: "reviewer" });
  const elsewhere = await (await browser.newContext()).newPage();
  await signInWithPassword(elsewhere, "reviewer@example.com");
  await expect(elsewhere).toHaveURL(/\/en$/);

  const before = await readOutbox(page);
  await page.goto("/en/sign-in");
  await page.getByTestId("sign-in-forgot").click();
  await expect(page).toHaveURL(/\/en\/forgot-password$/);
  await page.getByTestId("forgot-email").fill("nobody@example.com");
  await page.getByTestId("forgot-submit").click();
  await expect(page.getByTestId("forgot-sent")).toHaveText("If this email has an account, we've sent a link to reset its password.");
  await page.getByTestId("forgot-email").fill("Reviewer@Example.com");
  await page.getByTestId("forgot-submit").click();
  await expect(page.getByTestId("forgot-sent")).toBeVisible();
  await expect.poll(async () => newEmails(before, await readOutbox(page)).length).toBe(1);
  const [reset] = newEmails(before, await readOutbox(page));
  expect(reset.to).toBe("reviewer@example.com");
  const link = linkIn(reset.text, "reset-password");

  await page.goto(link);
  await page.getByTestId("reset-password").fill("a brand new password");
  await page.getByTestId("reset-confirm").fill("a brand new password");
  await page.getByTestId("reset-submit").click();
  await expect(page).toHaveURL(/\/en$/);
  await elsewhere.reload();
  await expect(elsewhere).toHaveURL(/\/en\/sign-in$/);
  await page.goto(link);
  await expect(page.getByTestId("reset-invalid")).toHaveText("This link isn't valid any more. Ask for a new one.");
  await signInWithPassword(elsewhere, "reviewer@example.com", PASSWORD);
  await expect(elsewhere.getByTestId("sign-in-error")).toHaveAttribute("data-reason", "wrong");
  await signInWithPassword(elsewhere, "reviewer@example.com", "a brand new password");
  await expect(elsewhere).toHaveURL(/\/en$/);
});

test("changing the password on the Account page keeps this session and ends the others", async ({ page, browser }) => {
  await seedAccount({ email: "reviewer@example.com", role: "reviewer", name: "Omar" });
  const elsewhere = await (await browser.newContext()).newPage();
  await signInWithPassword(elsewhere, "reviewer@example.com");
  await expect(elsewhere).toHaveURL(/\/en$/);
  await signInWithPassword(page, "reviewer@example.com");
  await expect(page.getByTestId("user-security")).toHaveText("Account");
  await page.getByTestId("user-security").click();
  await expect(page).toHaveURL(/\/en\/security$/);
  await expect(page.getByTestId("account-details")).toContainText("reviewer@example.com");

  await page.getByTestId("account-current").fill("not the password");
  await page.getByTestId("account-password").fill("a brand new password");
  await page.getByTestId("account-confirm").fill("a brand new password");
  await page.getByTestId("account-submit").click();
  await expect(page.getByTestId("account-error")).toHaveText("Your current password is incorrect.");

  await page.getByTestId("account-current").fill(PASSWORD);
  await page.getByTestId("account-password").fill("a brand new password");
  await page.getByTestId("account-confirm").fill("a brand new password");
  await page.getByTestId("account-submit").click();
  await expect(page.getByTestId("account-changed")).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/\/en\/security$/);
  await elsewhere.reload();
  await expect(elsewhere).toHaveURL(/\/en\/sign-in$/);
});

test("the forgot-password page in Arabic", async ({ page }) => {
  await page.goto("/ar/forgot-password");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByText("نسيت كلمة المرور؟", { exact: true })).toBeVisible();
});
```

In `tests/e2e/security.spec.ts`, change both `toHaveText("Security")` expectations on `user-security` to `toHaveText("Account")`. The menu link is the Account page now.

- [ ] **Step 2: Run the password suite and watch it fail**

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
pnpm build > /dev/null 2>&1; echo "build exit $?"
pnpm e2e:password 2>&1 | grep -E "✓|✘|passed|failed" | tail -14
```

Expected:
- `build exit 0`.
- **The 6 sign-in tests from Task 5 pass.**
- **The 6 new tests fail:**
  - the first-Admin notice, `sign-in-forgot`, the invitation page and `forgot-password` don't exist yet
  - the Account test fails on the menu label (`Security`)

- [ ] **Step 3: Write the failing unit tests**

Create `tests/unit/account-actions.test.ts`:

```ts
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword } from "@/lib/accounts/passwords";
import { sessionAccount, startSession } from "@/lib/accounts/sign-in";
import { hashToken, newToken } from "@/lib/accounts/tokens";
import { getAccountStore } from "@/lib/db";
import { createLogMailer } from "@/lib/notifications/mailer";

const state = vi.hoisted(() => ({ jar: new Map<string, string>(), set: [] as string[] }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (state.jar.has(name) ? { name, value: state.jar.get(name) } : undefined),
    set: (name: string, value: string) => {
      state.set.push(name);
      state.jar.set(name, value);
    },
  }),
  headers: async () => ({ get: () => null }),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => Promise<void>) => void task(),
}));
const requireSession = vi.fn();
vi.mock("@/lib/auth/session", () => ({ requireSession }));

const { acceptInvitationAction } = await import("@/app/[locale]/invitation/actions");
const { requestResetAction } = await import("@/app/[locale]/forgot-password/actions");
const { resetPasswordAction } = await import("@/app/[locale]/reset-password/actions");
const { changePasswordAction } = await import("@/app/[locale]/security/actions");

const PASSWORD = "correct horse battery";
const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
};
let passwordHash: string;
let sequence = 0;

beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
});

beforeEach(() => {
  state.jar.clear();
  state.set = [];
  requireSession.mockReset();
  vi.stubEnv("AUTH_MODE", "password");
  vi.stubEnv("APP_URL", "http://localhost:3000");
  vi.stubEnv("DB_MODE", "memory");
  vi.stubEnv("EMAIL_MODE", "log");
  vi.stubEnv("ENGINE_MODE", "mock");
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function account(): Promise<{ id: string; email: string }> {
  const id = `usr_actions${++sequence}`;
  const now = new Date();
  await getAccountStore().createAccount({ id, email: `${id}@example.com`, name: "Omar", role: "reviewer", passwordHash, createdAt: now, passwordChangedAt: now, lastSignInAt: null });
  return { id, email: `${id}@example.com` };
}

describe("accepting an invitation (spec M5c)", () => {
  it("refuses two different passwords first, keeping the name", async () => {
    expect(await acceptInvitationAction(null, form({ locale: "en", token: "x", name: "Omar", password: PASSWORD, confirm: "something else" }))).toEqual({
      problem: "mismatch",
      name: "Omar",
    });
  });

  it("creates the account, sets the session cookie and opens the dashboard", async () => {
    const token = newToken();
    const now = new Date();
    const email = `new${++sequence}@example.com`;
    await getAccountStore().addInvitation({ id: `inv_actions${sequence}`, email, role: "reviewer", tokenHash: hashToken(token), invitedBy: null, createdAt: now, expiresAt: new Date(now.getTime() + 86_400_000) });
    await expect(acceptInvitationAction(null, form({ locale: "ar", token, name: "Omar", password: PASSWORD, confirm: PASSWORD }))).rejects.toThrow("REDIRECT:/ar");
    expect(state.set).toEqual(["session"]);
    expect(await getAccountStore().accountByEmail(email)).toMatchObject({ name: "Omar", role: "reviewer" });
  });
});

describe("forgot password", () => {
  it("gives the same answer for a known and an unknown email, emails only the known one, and asks for an email", async () => {
    const known = await account();
    const before = createLogMailer().outbox().length;
    expect(await requestResetAction(null, form({ email: known.email }))).toEqual({ sent: true });
    expect(await requestResetAction(null, form({ email: "nobody@example.com" }))).toEqual({ sent: true });
    await vi.waitFor(() => expect(createLogMailer().outbox().length - before).toBe(1));
    expect(createLogMailer().outbox().at(-1)?.to).toBe(known.email);
    expect(await requestResetAction(null, form({ email: "  " }))).toEqual({ problem: "empty" });
  });
});

describe("resetting a password", () => {
  it("refuses an unknown link and two different passwords", async () => {
    expect(await resetPasswordAction(null, form({ locale: "en", token: "nonsense", password: "a brand new password", confirm: "a brand new password" }))).toEqual({ problem: "invalid" });
    expect(await resetPasswordAction(null, form({ locale: "en", token: "nonsense", password: "a brand new password", confirm: "different" }))).toEqual({ problem: "mismatch" });
  });
});

describe("changing a password on the Account page", () => {
  it("needs the current password, keeps this session and ends the others", async () => {
    const me = await account();
    const store = getAccountStore();
    const here = await startSession(store, me.id, new Date());
    const elsewhere = await startSession(store, me.id, new Date());
    state.jar.set("session", here.token);
    requireSession.mockResolvedValue({ userId: me.id, email: me.email, name: "Omar", role: "reviewer", twoFactor: false });
    const change = (current: string, password: string, confirm = password) => changePasswordAction(null, form({ locale: "en", current, password, confirm }));
    expect(await change("wrong password!", "a brand new password")).toEqual({ problem: "current" });
    expect(await change(PASSWORD, "a brand new password", "different")).toEqual({ problem: "mismatch" });
    expect(await change(PASSWORD, "a brand new password")).toEqual({ changed: true });
    expect(await sessionAccount(store, here.token, new Date())).not.toBeNull();
    expect(await sessionAccount(store, elsewhere.token, new Date())).toBeNull();
    expect(requireSession).toHaveBeenCalledWith("en");
  });
});
```

- [ ] **Step 4: Run them and watch them fail**

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
pnpm vitest run tests/unit/account-actions.test.ts 2>&1 | tail -6
```

Expected: FAIL. The suite can't resolve `@/app/[locale]/invitation/actions`.

- [ ] **Step 5: Add the texts**

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
SCRATCH=$(mktemp -d)
cat > "$SCRATCH/m5c-pages.mjs" <<'EOF'
import fs from "node:fs";

const ADD = {
  en: {
    SignIn: {
      forgot: "Forgot password?",
      firstAdmin: {
        invited: "This dashboard has no Admin yet. An invitation was emailed to {email}.",
        unset: "This dashboard has no Admin yet. Set ADMIN_EMAIL in the server's settings to create the first Admin.",
        failed: "This dashboard has no Admin yet, and the setup email couldn't be sent. See the server log.",
      },
    },
    Password: {
      hint: "At least 10 characters.",
      confirm: "Repeat the password",
      short: "Use at least 10 characters.",
      long: "Use at most 200 characters.",
      email: "Don't use your email as your password.",
      mismatch: "The two passwords don't match.",
      current: "Your current password is incorrect.",
      name: "Enter your name.",
    },
    Invitation: {
      title: "Create your account",
      intro: "You're invited to Articles AI as {role}. Choose your name and a password.",
      email: "Email",
      name: "Your name",
      password: "Password",
      submit: "Create account",
      working: "Creating…",
      invalid: "This invitation link isn't valid.",
      expired: "This invitation has expired. Ask your Admin for a new one.",
      taken: "This email already has an account. Sign in instead.",
      goToSignIn: "Go to sign-in",
    },
    ForgotPassword: {
      title: "Forgot your password?",
      intro: "Enter your email. If it has an account, we'll send a link to choose a new password.",
      email: "Email",
      submit: "Send the link",
      sending: "Sending…",
      sent: "If this email has an account, we've sent a link to reset its password.",
      empty: "Enter your email.",
      back: "Back to sign-in",
    },
    ResetPassword: {
      title: "Choose a new password",
      password: "New password",
      submit: "Save and sign in",
      saving: "Saving…",
      invalid: "This link isn't valid any more. Ask for a new one.",
      askAgain: "Ask for a new link",
    },
    Account: {
      title: "Account",
      name: "Name",
      email: "Email",
      role: "Role",
      change: "Change password",
      current: "Current password",
      password: "New password",
      submit: "Change password",
      saving: "Saving…",
      changed: "Your password is changed. You've been signed out on your other devices.",
    },
    Shell: { security: "Account" },
  },
  ar: {
    SignIn: {
      forgot: "نسيت كلمة المرور؟",
      firstAdmin: {
        invited: "لا يوجد مسؤول لهذه اللوحة بعد. أُرسلت دعوة بالبريد إلى {email}.",
        unset: "لا يوجد مسؤول لهذه اللوحة بعد. اضبط ADMIN_EMAIL في إعدادات الخادم لإنشاء المسؤول الأول.",
        failed: "لا يوجد مسؤول لهذه اللوحة بعد، وتعذّر إرسال رسالة الإعداد. راجع سجل الخادم.",
      },
    },
    Password: {
      hint: "10 أحرف على الأقل.",
      confirm: "أعد كتابة كلمة المرور",
      short: "استخدم 10 أحرف على الأقل.",
      long: "استخدم 200 حرف كحد أقصى.",
      email: "لا تستخدم بريدك الإلكتروني كلمةً للمرور.",
      mismatch: "كلمتا المرور غير متطابقتين.",
      current: "كلمة المرور الحالية غير صحيحة.",
      name: "أدخل اسمك.",
    },
    Invitation: {
      title: "أنشئ حسابك",
      intro: "دُعيت إلى Articles AI بصفة {role}. اختر اسمك وكلمة مرور.",
      email: "البريد الإلكتروني",
      name: "اسمك",
      password: "كلمة المرور",
      submit: "إنشاء الحساب",
      working: "جارٍ الإنشاء…",
      invalid: "رابط الدعوة هذا غير صالح.",
      expired: "انتهت صلاحية هذه الدعوة. اطلب دعوة جديدة من المسؤول.",
      taken: "لهذا البريد حساب بالفعل. سجّل الدخول بدلًا من ذلك.",
      goToSignIn: "الانتقال إلى تسجيل الدخول",
    },
    ForgotPassword: {
      title: "نسيت كلمة المرور؟",
      intro: "أدخل بريدك الإلكتروني. إن كان له حساب، فسنرسل رابطًا لاختيار كلمة مرور جديدة.",
      email: "البريد الإلكتروني",
      submit: "إرسال الرابط",
      sending: "جارٍ الإرسال…",
      sent: "إن كان لهذا البريد حساب، فقد أرسلنا رابطًا لإعادة تعيين كلمة مروره.",
      empty: "أدخل بريدك الإلكتروني.",
      back: "العودة إلى تسجيل الدخول",
    },
    ResetPassword: {
      title: "اختر كلمة مرور جديدة",
      password: "كلمة المرور الجديدة",
      submit: "حفظ وتسجيل الدخول",
      saving: "جارٍ الحفظ…",
      invalid: "لم يعد هذا الرابط صالحًا. اطلب رابطًا جديدًا.",
      askAgain: "طلب رابط جديد",
    },
    Account: {
      title: "الحساب",
      name: "الاسم",
      email: "البريد الإلكتروني",
      role: "الدور",
      change: "تغيير كلمة المرور",
      current: "كلمة المرور الحالية",
      password: "كلمة المرور الجديدة",
      submit: "تغيير كلمة المرور",
      saving: "جارٍ الحفظ…",
      changed: "تم تغيير كلمة المرور، وسُجّل خروجك من أجهزتك الأخرى.",
    },
    Shell: { security: "الحساب" },
  },
};

for (const [locale, groups] of Object.entries(ADD)) {
  const file = `messages/${locale}.json`;
  const messages = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const [group, texts] of Object.entries(groups)) messages[group] = { ...(messages[group] ?? {}), ...texts };
  fs.writeFileSync(file, `${JSON.stringify(messages, null, 2)}\n`);
}
EOF
node "$SCRATCH/m5c-pages.mjs" && git diff --stat messages/
```

Expected: both files grow by about 80 lines. `Shell.security` changes in place, and no other line changes.

- [ ] **Step 6: Write the actions**

Create `src/app/[locale]/invitation/actions.ts`:

```ts
"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { asAppLocale } from "@/i18n/locales";
import { sessionCookieName, sessionCookieOptions } from "@/lib/accounts/cookie";
import { acceptInvitation, type AcceptProblem } from "@/lib/accounts/invitations";
import { formText } from "@/lib/actions/form";
import { getAccountStore } from "@/lib/db";
import { passwordEnv } from "@/lib/env";

export type AcceptState = { problem: AcceptProblem | "mismatch"; name: string } | null;

/** Spec M5c: the invitation page's form. Success creates the account, signs the person in and opens the dashboard. */
export async function acceptInvitationAction(_previous: AcceptState, form: FormData): Promise<AcceptState> {
  const env = passwordEnv();
  const locale = asAppLocale(formText(form, "locale"));
  const name = formText(form, "name", 400);
  const password = formText(form, "password");
  if (password !== formText(form, "confirm")) return { problem: "mismatch", name };
  const result = await acceptInvitation(getAccountStore(), { token: formText(form, "token", 200), name, password, now: new Date() });
  if (!result.ok) return { problem: result.problem, name };
  (await cookies()).set(sessionCookieName(env.appUrl), result.token, sessionCookieOptions(env.appUrl, result.expiresAt));
  redirect(`/${locale}`);
}
```

Create `src/app/[locale]/forgot-password/actions.ts`:

```ts
"use server";

import { after } from "next/server";
import { requestReset } from "@/lib/accounts/resets";
import { formText } from "@/lib/actions/form";
import { getAccountStore } from "@/lib/db";
import { passwordEnv } from "@/lib/env";
import { mailerFor } from "@/lib/notifications/mailer";
import { servicesEnv } from "@/lib/services-env";

export type ForgotState = { sent: true } | { problem: "empty" } | null;

/** Spec M5c: always the same answer. The email goes out after it (Next's after()), so the time taken says nothing either. */
export async function requestResetAction(_previous: ForgotState, form: FormData): Promise<ForgotState> {
  const env = passwordEnv();
  const email = formText(form, "email", 320);
  if (!email.trim()) return { problem: "empty" };
  await requestReset(
    { store: getAccountStore(), mailer: mailerFor(servicesEnv()), appUrl: env.appUrl, later: (task) => after(task) },
    { email, now: new Date() },
  );
  return { sent: true };
}
```

Create `src/app/[locale]/reset-password/actions.ts`:

```ts
"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { asAppLocale } from "@/i18n/locales";
import { sessionCookieName, sessionCookieOptions } from "@/lib/accounts/cookie";
import { completeReset, type ResetProblem } from "@/lib/accounts/resets";
import { formText } from "@/lib/actions/form";
import { getAccountStore } from "@/lib/db";
import { passwordEnv } from "@/lib/env";

export type ResetState = { problem: ResetProblem | "mismatch" } | null;

/** Spec M5c: sets the new password, ends every other session, and signs the person in here. */
export async function resetPasswordAction(_previous: ResetState, form: FormData): Promise<ResetState> {
  const env = passwordEnv();
  const locale = asAppLocale(formText(form, "locale"));
  const password = formText(form, "password");
  if (password !== formText(form, "confirm")) return { problem: "mismatch" };
  const result = await completeReset(getAccountStore(), { token: formText(form, "token", 200), password, now: new Date() });
  if (!result.ok) return { problem: result.problem };
  (await cookies()).set(sessionCookieName(env.appUrl), result.token, sessionCookieOptions(env.appUrl, result.expiresAt));
  redirect(`/${locale}`);
}
```

Create `src/app/[locale]/security/actions.ts`:

```ts
"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { asAppLocale } from "@/i18n/locales";
import { sessionCookieName } from "@/lib/accounts/cookie";
import type { PasswordProblem } from "@/lib/accounts/passwords";
import { changePassword } from "@/lib/accounts/sign-in";
import { formText } from "@/lib/actions/form";
import { requireSession } from "@/lib/auth/session";
import { getAccountStore } from "@/lib/db";
import { passwordEnv } from "@/lib/env";

export type ChangeState = { changed: true } | { problem: "current" | "mismatch" | PasswordProblem } | null;

/** Spec M5c, the Account page: the current password, then the new one twice. This session stays; every other one ends. */
export async function changePasswordAction(_previous: ChangeState, form: FormData): Promise<ChangeState> {
  const env = passwordEnv();
  const locale = asAppLocale(formText(form, "locale"));
  const session = await requireSession(locale);
  const next = formText(form, "password");
  if (next !== formText(form, "confirm")) return { problem: "mismatch" };
  const store = getAccountStore();
  const account = await store.account(session.userId);
  if (!account) redirect(`/${locale}/sign-in`);
  const keepToken = (await cookies()).get(sessionCookieName(env.appUrl))?.value ?? "";
  const result = await changePassword(store, { account, current: formText(form, "current"), next, keepToken, now: new Date() });
  return result.ok ? { changed: true } : { problem: result.problem };
}
```

- [ ] **Step 7: Write the forms, the views and the pages**

Create `src/components/auth/link-token.ts`:

```ts
/** The `token` of an emailed link as the page received it: one value, at most 200 characters. */
export function linkToken(value: string | string[] | undefined): string {
  return typeof value === "string" ? value.slice(0, 200) : "";
}
```

Create `src/components/auth/new-password-fields.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** A new password and its repetition, with the rule underneath (spec M5c: at least 10 characters). */
export function NewPasswordFields({ idPrefix, label }: { idPrefix: string; label: string }) {
  const t = useTranslations("Password");
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-password`}>{label}</Label>
        <Input
          id={`${idPrefix}-password`}
          name="password"
          type="password"
          dir="ltr"
          autoComplete="new-password"
          aria-describedby={`${idPrefix}-hint`}
          data-testid={`${idPrefix}-password`}
        />
        <p id={`${idPrefix}-hint`} className="text-xs text-muted-foreground">
          {t("hint")}
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-confirm`}>{t("confirm")}</Label>
        <Input id={`${idPrefix}-confirm`} name="confirm" type="password" dir="ltr" autoComplete="new-password" data-testid={`${idPrefix}-confirm`} />
      </div>
    </>
  );
}
```

Create `src/components/auth/accept-invitation-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { acceptInvitationAction, type AcceptState } from "@/app/[locale]/invitation/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NewPasswordFields } from "./new-password-fields";

const LINK_PROBLEMS = new Set(["invalid", "expired", "taken"]);

/** Spec M5c: the invited email is shown, not editable; the person chooses a name and a password. */
export function AcceptInvitationForm({ locale, token, email }: { locale: string; token: string; email: string }) {
  const t = useTranslations("Invitation");
  const tPassword = useTranslations("Password");
  const [state, action, pending] = useActionState<AcceptState, FormData>(acceptInvitationAction, null);
  const problem = state?.problem;

  return (
    <form action={action} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="token" value={token} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invitation-email">{t("email")}</Label>
        <Input id="invitation-email" type="email" dir="ltr" autoComplete="username" value={email} readOnly data-testid="invitation-email" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invitation-name">{t("name")}</Label>
        <Input id="invitation-name" name="name" autoComplete="name" defaultValue={state?.name} data-testid="invitation-name" />
      </div>
      <NewPasswordFields idPrefix="invitation" label={t("password")} />
      {problem && (
        <p role="alert" data-testid="invitation-error" data-problem={problem} className="rounded-md bg-bad-bg px-3 py-2 text-sm text-bad-fg">
          {LINK_PROBLEMS.has(problem) ? t(problem) : tPassword(problem)}
        </p>
      )}
      <Button type="submit" disabled={pending} data-testid="invitation-submit">
        {pending ? t("working") : t("submit")}
      </Button>
    </form>
  );
}
```

Create `src/components/auth/invitation-view.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/locales";
import { lookUpInvitation } from "@/lib/accounts/invitations";
import { getAccountStore } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { AcceptInvitationForm } from "./accept-invitation-form";
import { linkToken } from "./link-token";

type Props = { locale: AppLocale; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Spec M5c: an invitation link lands here. An unknown, used or expired link says so. Call only under <Suspense>. */
export async function InvitationView({ locale, searchParams }: Props) {
  await connection();
  if (serverEnv().authMode !== "password") notFound();
  const t = await getTranslations("Invitation");
  const token = linkToken((await searchParams).token);
  const found = token ? await lookUpInvitation(getAccountStore(), token, new Date()) : ({ state: "invalid" } as const);

  if (found.state !== "valid") {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="font-heading text-2xl">{t("title")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <p role="alert" data-testid="invitation-problem" data-problem={found.state}>
            {t(found.state)}
          </p>
          <Link href="/sign-in" className="font-medium text-primary underline">
            {t("goToSignIn")}
          </Link>
        </CardContent>
      </Card>
    );
  }

  const tRole = await getTranslations("Shell.role");
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="font-heading text-2xl">{t("title")}</CardTitle>
        <CardDescription data-testid="invitation-intro">{t("intro", { role: tRole(found.invitation.role) })}</CardDescription>
      </CardHeader>
      <CardContent>
        <AcceptInvitationForm locale={locale} token={token} email={found.invitation.email} />
      </CardContent>
    </Card>
  );
}
```

Create `src/components/auth/forgot-password-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { requestResetAction, type ForgotState } from "@/app/[locale]/forgot-password/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Spec M5c: one email field; the answer is the same whatever the email. */
export function ForgotPasswordForm() {
  const t = useTranslations("ForgotPassword");
  const [state, action, pending] = useActionState<ForgotState, FormData>(requestResetAction, null);

  return (
    <form action={action} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="forgot-email">{t("email")}</Label>
        <Input id="forgot-email" name="email" type="email" dir="ltr" autoComplete="username" data-testid="forgot-email" />
      </div>
      {state && "sent" in state && (
        <p role="status" data-testid="forgot-sent" className="text-sm text-ok-fg">
          {t("sent")}
        </p>
      )}
      {state && "problem" in state && (
        <p role="alert" data-testid="forgot-error" className="rounded-md bg-bad-bg px-3 py-2 text-sm text-bad-fg">
          {t("empty")}
        </p>
      )}
      <Button type="submit" disabled={pending} data-testid="forgot-submit">
        {pending ? t("sending") : t("submit")}
      </Button>
    </form>
  );
}
```

Create `src/components/auth/forgot-password-view.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { serverEnv } from "@/lib/env";
import { ForgotPasswordForm } from "./forgot-password-form";

/** Spec M5c: "Forgot password?". Password mode only. Call only under <Suspense>. */
export async function ForgotPasswordView() {
  await connection();
  if (serverEnv().authMode !== "password") notFound();
  const t = await getTranslations("ForgotPassword");
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="font-heading text-2xl">{t("title")}</CardTitle>
        <CardDescription>{t("intro")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ForgotPasswordForm />
        <Link href="/sign-in" data-testid="forgot-back" className="text-sm font-medium text-primary underline">
          {t("back")}
        </Link>
      </CardContent>
    </Card>
  );
}
```

Create `src/components/auth/reset-password-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { resetPasswordAction, type ResetState } from "@/app/[locale]/reset-password/actions";
import { Button } from "@/components/ui/button";
import { NewPasswordFields } from "./new-password-fields";

export function ResetPasswordForm({ locale, token }: { locale: string; token: string }) {
  const t = useTranslations("ResetPassword");
  const tPassword = useTranslations("Password");
  const [state, action, pending] = useActionState<ResetState, FormData>(resetPasswordAction, null);

  return (
    <form action={action} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="token" value={token} />
      <NewPasswordFields idPrefix="reset" label={t("password")} />
      {state && (
        <p role="alert" data-testid="reset-error" data-problem={state.problem} className="rounded-md bg-bad-bg px-3 py-2 text-sm text-bad-fg">
          {state.problem === "invalid" ? t("invalid") : tPassword(state.problem)}
        </p>
      )}
      <Button type="submit" disabled={pending} data-testid="reset-submit">
        {pending ? t("saving") : t("submit")}
      </Button>
    </form>
  );
}
```

Create `src/components/auth/reset-password-view.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/locales";
import { resetLinkValid } from "@/lib/accounts/resets";
import { getAccountStore } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { linkToken } from "./link-token";
import { ResetPasswordForm } from "./reset-password-form";

type Props = { locale: AppLocale; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Spec M5c: a reset link lands here. An unknown, used or expired link sends the person to ask again. Call only under <Suspense>. */
export async function ResetPasswordView({ locale, searchParams }: Props) {
  await connection();
  if (serverEnv().authMode !== "password") notFound();
  const t = await getTranslations("ResetPassword");
  const token = linkToken((await searchParams).token);
  const valid = token !== "" && (await resetLinkValid(getAccountStore(), token, new Date()));
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="font-heading text-2xl">{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {valid ? (
          <ResetPasswordForm locale={locale} token={token} />
        ) : (
          <>
            <p role="alert" data-testid="reset-invalid">
              {t("invalid")}
            </p>
            <Link href="/forgot-password" className="font-medium text-primary underline">
              {t("askAgain")}
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}
```

Create the three pages. Each one follows the sign-in page.

`src/app/[locale]/invitation/page.tsx`:

```tsx
import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";
import { AuthPage } from "@/components/auth/auth-page";
import { InvitationView } from "@/components/auth/invitation-view";
import { asAppLocale } from "@/i18n/locales";

/** searchParams is request data: passed down and awaited inside the Suspense boundary (Cache Components). */
export default async function InvitationPage({ params, searchParams }: PageProps<"/[locale]/invitation">) {
  const locale = asAppLocale((await params).locale);
  setRequestLocale(locale);
  return (
    <AuthPage>
      <Suspense fallback={null}>
        <InvitationView locale={locale} searchParams={searchParams} />
      </Suspense>
    </AuthPage>
  );
}
```

`src/app/[locale]/forgot-password/page.tsx`:

```tsx
import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";
import { AuthPage } from "@/components/auth/auth-page";
import { ForgotPasswordView } from "@/components/auth/forgot-password-view";
import { asAppLocale } from "@/i18n/locales";

export default async function ForgotPasswordPage({ params }: PageProps<"/[locale]/forgot-password">) {
  const locale = asAppLocale((await params).locale);
  setRequestLocale(locale);
  return (
    <AuthPage>
      <Suspense fallback={null}>
        <ForgotPasswordView />
      </Suspense>
    </AuthPage>
  );
}
```

`src/app/[locale]/reset-password/page.tsx`:

```tsx
import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";
import { AuthPage } from "@/components/auth/auth-page";
import { ResetPasswordView } from "@/components/auth/reset-password-view";
import { asAppLocale } from "@/i18n/locales";

/** searchParams is request data: passed down and awaited inside the Suspense boundary (Cache Components). */
export default async function ResetPasswordPage({ params, searchParams }: PageProps<"/[locale]/reset-password">) {
  const locale = asAppLocale((await params).locale);
  setRequestLocale(locale);
  return (
    <AuthPage>
      <Suspense fallback={null}>
        <ResetPasswordView locale={locale} searchParams={searchParams} />
      </Suspense>
    </AuthPage>
  );
}
```

- [ ] **Step 8: The first-Admin notice and "Forgot password?" on the sign-in page**

Create `src/components/auth/first-admin-notice.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import { ensureFirstAdmin } from "@/lib/accounts/first-admin";
import { getAccountStore, getStore } from "@/lib/db";
import { mailerFor } from "@/lib/notifications/mailer";
import { servicesEnv } from "@/lib/services-env";

/** Spec M5c "The first Admin": shown on the sign-in page while the dashboard has no Admin; rendering it sends the invitation. */
export async function FirstAdminNotice({ appUrl, adminEmail }: { appUrl: string; adminEmail: string | null }) {
  const setup = await ensureFirstAdmin({
    store: getAccountStore(),
    exclusive: getStore().exclusive,
    mailer: mailerFor(servicesEnv()),
    appUrl,
    adminEmail,
    now: new Date(),
  });
  if (setup.state === "ready") return null;
  const t = await getTranslations("SignIn.firstAdmin");
  return (
    <p role="status" data-testid="first-admin" data-state={setup.state} className="rounded-md bg-warn-bg px-3 py-2 text-sm text-warn-fg">
      {setup.state === "invited" ? t("invited", { email: setup.to }) : t(setup.state)}
    </p>
  );
}
```

In `src/components/auth/sign-in-view.tsx`:
1. Change the import `import { serverEnv } from "@/lib/env";` to `import { passwordEnv, serverEnv } from "@/lib/env";`.
2. Add these imports:

```tsx
import { Link } from "@/i18n/navigation";
import { FirstAdminNotice } from "./first-admin-notice";
```

3. Replace the final `return (…)` (the password-mode card) with:

```tsx
  const env = passwordEnv();
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="font-heading text-2xl">{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <FirstAdminNotice appUrl={env.appUrl} adminEmail={env.adminEmail} />
        <SignInForm locale={locale} />
        <Link href="/forgot-password" data-testid="sign-in-forgot" className="text-sm font-medium text-primary underline">
          {t("forgot")}
        </Link>
      </CardContent>
    </Card>
  );
```

- [ ] **Step 9: The Account page**

Create `src/components/security/change-password-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { changePasswordAction, type ChangeState } from "@/app/[locale]/security/actions";
import { NewPasswordFields } from "@/components/auth/new-password-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Spec M5c: the current password, then the new one twice. This session stays; the person's other sessions end. */
export function ChangePasswordForm({ locale }: { locale: string }) {
  const t = useTranslations("Account");
  const tPassword = useTranslations("Password");
  const [state, action, pending] = useActionState<ChangeState, FormData>(changePasswordAction, null);

  return (
    <form action={action} noValidate aria-labelledby="account-change" className="flex flex-col gap-4">
      <h2 id="account-change" className="font-medium">
        {t("change")}
      </h2>
      <input type="hidden" name="locale" value={locale} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="account-current">{t("current")}</Label>
        <Input id="account-current" name="current" type="password" dir="ltr" autoComplete="current-password" data-testid="account-current" />
      </div>
      <NewPasswordFields idPrefix="account" label={t("password")} />
      {state && "changed" in state && (
        <p role="status" data-testid="account-changed" className="text-sm text-ok-fg">
          {t("changed")}
        </p>
      )}
      {state && "problem" in state && (
        <p role="alert" data-testid="account-error" data-problem={state.problem} className="rounded-md bg-bad-bg px-3 py-2 text-sm text-bad-fg">
          {tPassword(state.problem)}
        </p>
      )}
      <div>
        <Button type="submit" disabled={pending} data-testid="account-submit">
          {pending ? t("saving") : t("submit")}
        </Button>
      </div>
    </form>
  );
}
```

In `src/components/security/security-view.tsx`:
1. Add the imports:

```tsx
import { serverEnv } from "@/lib/env";
import { ChangePasswordForm } from "./change-password-form";
```

2. Directly after `if (!session.role) redirect(`/${locale}/no-access`);`, add:

```tsx
  if (serverEnv().authMode === "password") {
    const tAccount = await getTranslations("Account");
    const tRole = await getTranslations("Shell.role");
    const tSecurity = await getTranslations("Security");
    return (
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle className="font-heading text-2xl">{tAccount("title")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <dl data-testid="account-details" className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">{tAccount("name")}</dt>
            <dd>{session.name}</dd>
            <dt className="text-muted-foreground">{tAccount("email")}</dt>
            <dd>
              <bdi>{session.email}</bdi>
            </dd>
            <dt className="text-muted-foreground">{tAccount("role")}</dt>
            <dd>{tRole(session.role)}</dd>
          </dl>
          <ChangePasswordForm locale={locale} />
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/" data-testid="security-continue" className="text-sm font-medium text-primary underline">
              {tSecurity("continue")}
            </Link>
            <SignOutControl locale={locale} />
          </div>
        </CardContent>
      </Card>
    );
  }
```

The test-login view below stays as it is: e2e uses its two-factor switch.

- [ ] **Step 10: Run the unit tests and the type check, and watch them pass**

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
pnpm vitest run tests/unit/account-actions.test.ts tests/unit/messages.test.ts 2>&1 | tail -5
pnpm typecheck 2>&1 | tail -3
```

Expected: PASS, with `account-actions.test.ts` 5 tests and every message key in both languages. No type errors.

- [ ] **Step 11: Run both e2e suites and watch them pass**

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
pnpm e2e > /tmp/m5c-task6-e2e.log 2>&1; echo "e2e exit $?"; grep -E "passed|failed" /tmp/m5c-task6-e2e.log
```

Expected: `e2e exit 0`. The mock suite passes, with `security.spec.ts` now expecting "Account". The password suite passes its 12 tests.

- [ ] **Step 12: Commit**

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
RC=0; pnpm lint >/dev/null 2>&1 || RC=$?
if [ $RC -eq 0 ]; then
  git add -A src tests messages
  git commit -m "feat(auth): invitation, forgot and reset pages, the first-Admin invitation, and the Account page (M5c)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
else echo "lint failed: RC=$RC"; fi
```

Task test command: `pnpm test`

---

### Task 7: The Users page: Resend, expiry, mail failures and the log-mode note

**Files:**
- Modify: `src/app/[locale]/(app)/users/actions.ts` (`notSent`, `resendInviteAction`)
- Modify: `src/components/users/users-view.tsx` (expiry), `src/components/users/users-board.tsx` (Resend, expiry, `notSent`, mail failures)
- Modify: `messages/en.json`, `messages/ar.json` (`Users`)
- Test:
  - `tests/unit/users-actions.test.ts`
  - `tests/e2e/users.spec.ts` (mock mode)
  - `tests/e2e-password/users.spec.ts` (new; RED first)

**Interfaces:**
- Consumes:
  - Task 4: `UserDirectory.resendInvite`, `DirectoryInvite.expiresAt`, the `mail_failed` code with `details: { kind; reply }`
  - Task 5: `serverEnv().authMode`, `servicesEnv().emailMode`
  - M5b: `MAIL_ERROR_KINDS`, `Notifications.testEmail.failed.*`
- Produces:
  - `type SentInvite = DirectoryInvite & { notSent: boolean }`
  - `inviteUserAction(…) → ActionResult<SentInvite>`
  - `resendInviteAction({ locale, inviteId, idempotencyKey }) → ActionResult<SentInvite>`
  - **Test ids:**
    - `invite-not-sent`
    - `pending-expiry-<id>`, with `data-expired`
    - `pending-resend-<id>`
    - `invites-resent`, with `data-not-sent`

- [ ] **Step 1: Write the failing e2e tests**

Create `tests/e2e-password/users.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { newEmails, readOutbox } from "../e2e/helpers";
import { linkIn, resetAccounts, seedAccount, signInWithPassword } from "./helpers";

test.beforeEach(async () => {
  await resetAccounts();
});

test("with EMAIL_MODE=log an invitation is kept and marked not sent; Resend makes a new link and the old one stops working (spec M5c)", async ({ page, browser }) => {
  await seedAccount({ email: "admin@example.com", role: "admin" });
  await signInWithPassword(page, "admin@example.com");
  await expect(page).toHaveURL(/\/en$/);
  const before = await readOutbox(page);
  await page.goto("/en/users");
  await page.getByTestId("invite-email").fill("resend.me@example.com");
  await page.getByTestId("invite-submit").click();
  await expect(page.getByTestId("invite-not-sent")).toHaveText("Invitation saved, but not sent: this server doesn't send emails yet.");
  const first = linkIn(newEmails(before, await readOutbox(page))[0].text, "invitation");

  const row = page.locator('[data-testid^="pending-invite-"]', { hasText: "resend.me@example.com" });
  await row.locator('[data-testid^="pending-resend-"]').click();
  await expect(page.getByTestId("invites-resent")).toHaveAttribute("data-not-sent", "true");
  const sent = newEmails(before, await readOutbox(page));
  expect(sent).toHaveLength(2);
  const second = linkIn(sent[1].text, "invitation");
  expect(second).not.toBe(first);

  const invitee = await (await browser.newContext()).newPage();
  await invitee.goto(first);
  await expect(invitee.getByTestId("invitation-problem")).toHaveText("This invitation link isn't valid.");
  await invitee.goto(second);
  await expect(invitee.getByTestId("invitation-name")).toBeVisible();
});
```

In `tests/e2e/users.spec.ts` (mock mode), add:

```ts
test("a pending invitation shows when it expires, and Resend gives it a new link (spec M5c)", async ({ page, context }) => {
  await signInWithCookie(context, "dev_admin");
  await page.goto("/en/users");
  await page.getByTestId("invite-email").fill("resend.me@example.com");
  await page.getByTestId("invite-submit").click();
  await expect(page.getByTestId("invite-sent")).toBeVisible();
  const row = page.locator('[data-testid^="pending-invite-"]', { hasText: "resend.me@example.com" });
  await expect(row.locator('[data-testid^="pending-expiry-"]')).toHaveAttribute("data-expired", "false");
  await expect(row.locator('[data-testid^="pending-expiry-"]')).toContainText("Expires");
  await row.locator('[data-testid^="pending-resend-"]').click();
  await expect(page.getByTestId("invites-resent")).toHaveText("New link sent to resend.me@example.com.");
});
```

- [ ] **Step 2: Run both e2e suites and watch the new tests fail**

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
pnpm e2e > /tmp/m5c-task7-red.log 2>&1; echo "e2e exit $?"; grep -E "✘|passed|failed" /tmp/m5c-task7-red.log | tail -6
```

Expected: FAIL. The two new tests fail on `invite-not-sent` and `pending-expiry-…`, which don't exist yet; everything else passes. `pnpm e2e` stops after the mock suite fails. Run `pnpm e2e:password` too, to see the password test fail.

- [ ] **Step 3: Write the failing unit tests**

In `tests/unit/users-actions.test.ts`:

1. Add `resendInvite: vi.fn()` to the `directory` object.
2. Change the action import to also take `resendInviteAction`.
3. In `beforeEach`, add:

```ts
  directory.resendInvite.mockResolvedValue({ id: "inv_1", email: "new@example.com", role: "reviewer", createdAt: "2026-10-27T08:00:00.000Z", expiresAt: "2026-11-03T08:00:00.000Z" });
```

and add `expiresAt: "2026-10-28T08:00:00.000Z"` to the `directory.invite` resolved value.

4. Add these cases to the `describe`:

```ts
  it("resends an invitation for Admins only, refreshing the page (spec M5c)", async () => {
    expect(await resendInviteAction({ locale: "en", inviteId: "inv_1", idempotencyKey: key })).toMatchObject({ ok: true, data: { id: "inv_1", notSent: false } });
    expect(requirePermission).toHaveBeenCalledWith("en", "users.manage");
    expect(directory.resendInvite).toHaveBeenCalledWith("inv_1");
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(await resendInviteAction({ locale: "en", inviteId: "../x", idempotencyKey: key })).toMatchObject({ ok: false, error: { code: "invalid_input" } });
  });

  it("marks an invitation not sent in password mode while EMAIL_MODE=log", async () => {
    vi.stubEnv("AUTH_MODE", "password");
    vi.stubEnv("APP_URL", "http://localhost:3000");
    vi.stubEnv("EMAIL_MODE", "log");
    expect(await inviteUserAction({ locale: "en", email: "new@example.com", role: "reviewer", idempotencyKey: key })).toMatchObject({ ok: true, data: { notSent: true } });
    vi.unstubAllEnvs();
  });

  it("passes a mail failure through with its kind and the server's reply", async () => {
    directory.invite.mockRejectedValue(new DirectoryError("mail_failed", "The email couldn't be sent (login).", undefined, { kind: "login", reply: "535 x" }));
    expect(await inviteUserAction({ locale: "en", email: "new@example.com", role: "reviewer", idempotencyKey: key })).toEqual({
      ok: false,
      error: { status: 502, code: "mail_failed", message: "The email couldn't be sent (login).", details: { kind: "login", reply: "535 x" } },
    });
  });
```

5. In the first test ("checks users.manage before every change…"), add `await resendInviteAction({ locale: "en", inviteId: "inv_1", idempotencyKey: key });` after the revoke call. Add `["en", "users.manage"]` to the expected permission calls, in that position, and change `toHaveBeenCalledTimes(3)` to `toHaveBeenCalledTimes(4)`.

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
pnpm vitest run tests/unit/users-actions.test.ts 2>&1 | grep -E "×|Tests  " | head
```

Expected: FAIL. The cases using `resendInviteAction` fail (`resendInviteAction is not a function`), and so does the `notSent` case.

- [ ] **Step 4: Write the actions**

In `src/app/[locale]/(app)/users/actions.ts`:

1. Add the imports:

```ts
import { serverEnv } from "@/lib/env";
import { servicesEnv } from "@/lib/services-env";
```

2. Add below `SELF`:

```ts
/** An invitation plus whether its email stayed on this server (password mode with EMAIL_MODE=log, spec M5c). */
export type SentInvite = DirectoryInvite & { notSent: boolean };

function invitationsNotSent(): boolean {
  return serverEnv().authMode === "password" && servicesEnv().emailMode === "log";
}
```

3. In `inviteUserAction`, change the return type to `Promise<ActionResult<SentInvite>>`, and its directory call to:

```ts
  const result = await tryDirectory(async () => ({ ...(await (await getDirectory()).invite(email, role, session.userId)), notSent: invitationsNotSent() }));
```

4. Add after `revokeInviteAction`:

```ts
/** Spec M5c: a new link and a new 7-day expiry for a pending invitation; the old link stops working. */
export async function resendInviteAction(input: { locale: string; inviteId: string; idempotencyKey: string }): Promise<ActionResult<SentInvite>> {
  const parsed = z.object({ locale: Locale, inviteId: DirectoryId, idempotencyKey: IdempotencyKey }).safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, inviteId } = parsed.data;
  await requirePermission(locale, "users.manage");
  const result = await tryDirectory(async () => ({ ...(await (await getDirectory()).resendInvite(inviteId)), notSent: invitationsNotSent() }));
  if (result.ok) refresh();
  return result;
}
```

- [ ] **Step 5: The texts, the view and the board**

Add the Users texts. They merge into `messages.Users`, keeping its other keys; `invite` and `invites` are merged one level deep:

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
SCRATCH=$(mktemp -d)
cat > "$SCRATCH/m5c-users.mjs" <<'EOF'
import fs from "node:fs";

const ADD = {
  en: {
    resendFor: "Resend the invitation to {email}",
    invite: {
      hint: "They get an email with a link to choose a password and sign in, with this role. The link works for 7 days.",
      notSent: "Invitation saved, but not sent: this server doesn't send emails yet.",
    },
    invites: {
      expires: "Expires {date}",
      expired: "Expired",
      resend: "Resend",
      resent: "New link sent to {email}.",
      resentNotSent: "New link saved, but not sent: this server doesn't send emails yet.",
    },
  },
  ar: {
    resendFor: "إعادة إرسال الدعوة إلى {email}",
    invite: {
      hint: "تصله رسالة فيها رابط لاختيار كلمة مرور وتسجيل الدخول بهذا الدور. يعمل الرابط 7 أيام.",
      notSent: "حُفظت الدعوة لكنها لم تُرسل: لا يرسل هذا الخادم رسائل بريد بعد.",
    },
    invites: {
      expires: "تنتهي {date}",
      expired: "منتهية",
      resend: "إعادة الإرسال",
      resent: "أُرسل رابط جديد إلى {email}.",
      resentNotSent: "حُفظ رابط جديد لكنه لم يُرسل: لا يرسل هذا الخادم رسائل بريد بعد.",
    },
  },
};
for (const [locale, texts] of Object.entries(ADD)) {
  const file = `messages/${locale}.json`;
  const messages = JSON.parse(fs.readFileSync(file, "utf8"));
  const users = messages.Users;
  users.resendFor = texts.resendFor;
  Object.assign(users.invite, texts.invite);
  Object.assign(users.invites, texts.invites);
  fs.writeFileSync(file, `${JSON.stringify(messages, null, 2)}\n`);
}
EOF
node "$SCRATCH/m5c-users.mjs" && git diff --stat messages/
```

Expected: both files gain about 8 lines, and `Users.invite.hint` changes in place.

In `src/components/users/users-view.tsx`, replace the `invites={…}` mapping with:

```tsx
      invites={listed.data.invites.map((invite) => ({
        id: invite.id,
        email: invite.email,
        role: invite.role,
        sentOn: formatDate(invite.createdAt, { timeZone, locale }),
        expiresOn: invite.expiresAt ? formatDate(invite.expiresAt, { timeZone, locale }) : null,
        expired: invite.expiresAt !== null && new Date(invite.expiresAt).getTime() <= Date.now(),
      }))}
```

In `src/components/users/users-board.tsx`:

1. Change the actions import to include `resendInviteAction`, and add `import { MAIL_ERROR_KINDS } from "@/lib/notifications/mail-error";`.

2. Change `InviteRow` to:

```ts
export type InviteRow = { id: string; email: string; role: Role | null; sentOn: string; expiresOn: string | null; expired: boolean };
```

3. Replace `useFailureText` with:

```ts
function useFailureText() {
  const t = useTranslations("Users.errors");
  const tMail = useTranslations("Notifications.testEmail");
  return (error: EngineFailure) => {
    // Spec M5c: an invitation the mail server refused says why, in the test email's words, with the server's reply.
    if (error.code === "mail_failed") {
      const kind = MAIL_ERROR_KINDS.find((each) => each === error.details?.kind) ?? "other";
      const reply = typeof error.details?.reply === "string" && error.details.reply ? ` (${error.details.reply})` : "";
      return `${tMail(`failed.${kind}`)}${reply}`;
    }
    return t.has(error.code) ? t(error.code) : error.message;
  };
}
```

4. In `InviteForm`:
   - Replace `const [sentTo, setSentTo] = useState<string | null>(null);` with `const [sent, setSent] = useState<{ email: string; notSent: boolean } | null>(null);`.
   - In `submit`, replace `setSentTo(null);` with `setSent(null);`, and `setSentTo(result.data.email);` with `setSent({ email: result.data.email, notSent: result.data.notSent });`.
   - Replace the `{sentTo && (…)}` block with:

```tsx
        {sent &&
          (sent.notSent ? (
            <p role="status" data-testid="invite-not-sent" className="text-sm text-muted-foreground">
              {t("invite.notSent")}
            </p>
          ) : (
            <p role="status" data-testid="invite-sent" className="text-sm text-ok-fg">
              {t("invite.sent", { email: sent.email })}
            </p>
          ))}
```

5. Replace the whole `PendingInvites` function with:

```tsx
function PendingInvites({ locale, invites }: { locale: string; invites: InviteRow[] }) {
  const t = useTranslations("Users");
  const failureText = useFailureText();
  const revoke = useEngineAction(revokeInviteAction);
  const resend = useEngineAction(resendInviteAction);
  const [error, setError] = useState<EngineFailure | null>(null);
  const [resent, setResent] = useState<{ email: string; notSent: boolean } | null>(null);
  const busy = revoke.pending || resend.pending;

  async function revokeOne(inviteId: string) {
    setError(null);
    setResent(null);
    const result = await revoke.run({ locale, inviteId });
    if (!result.ok) setError(result.error);
  }

  async function resendOne(inviteId: string) {
    setError(null);
    setResent(null);
    const result = await resend.run({ locale, inviteId });
    if (result.ok) setResent({ email: result.data.email, notSent: result.data.notSent });
    else setError(result.error);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("invites.title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        {invites.length === 0 ? (
          <p data-testid="invites-empty" className="text-muted-foreground">
            {t("invites.empty")}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {invites.map((invite) => (
              <li key={invite.id} data-testid={`pending-invite-${invite.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <bdi>{invite.email}</bdi> · {t(`roles.${invite.role ?? NONE}`)} · {t("invites.sentOn", { date: invite.sentOn })}
                  {(invite.expired || invite.expiresOn) && (
                    <>
                      {" · "}
                      <span data-testid={`pending-expiry-${invite.id}`} data-expired={String(invite.expired)} className={invite.expired ? "text-bad-fg" : undefined}>
                        {invite.expired ? t("invites.expired") : t("invites.expires", { date: invite.expiresOn ?? "" })}
                      </span>
                    </>
                  )}
                </span>
                <span className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    data-testid={`pending-resend-${invite.id}`}
                    aria-label={t("resendFor", { email: invite.email })}
                    disabled={busy}
                    onClick={() => void resendOne(invite.id)}
                  >
                    {t("invites.resend")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    data-testid={`pending-revoke-${invite.id}`}
                    aria-label={t("revokeFor", { email: invite.email })}
                    disabled={busy}
                    onClick={() => void revokeOne(invite.id)}
                  >
                    {t("invites.revoke")}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
        {resent && (
          <p role="status" data-testid="invites-resent" data-not-sent={String(resent.notSent)} className="text-sm text-ok-fg">
            {resent.notSent ? t("invites.resentNotSent") : t("invites.resent", { email: resent.email })}
          </p>
        )}
        {error && (
          <p role="alert" data-testid="invites-error" className="text-sm text-bad-fg">
            {failureText(error)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 6: Run the tests and watch them pass**

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
pnpm vitest run tests/unit/users-actions.test.ts tests/unit/messages.test.ts 2>&1 | tail -4
pnpm typecheck 2>&1 | tail -3
pnpm e2e > /tmp/m5c-task7-e2e.log 2>&1; echo "e2e exit $?"; grep -E "passed|failed" /tmp/m5c-task7-e2e.log
```

Expected:
- **Unit:** PASS. No type errors.
- **e2e:** `e2e exit 0`. The mock suite passes, including the Resend test, and the password suite passes its 13 tests.

- [ ] **Step 7: Commit**

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
RC=0; pnpm lint >/dev/null 2>&1 || RC=$?
if [ $RC -eq 0 ]; then
  git add -A src tests messages
  git commit -m "feat(users): Resend, invitation expiry, mail-failure messages and the log-mode note on the Users page (M5c)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
else echo "lint failed: RC=$RC"; fi
```

Task test command: `pnpm vitest run tests/unit/users-actions.test.ts tests/unit/messages.test.ts`

---

### Task 8: The README, the Vercel leftovers, a real server build signing in, and the full checks

**Files:**
- Modify: `README.md`
- Delete: `vercel.json`, `tests/unit/vercel-config.test.ts`
- Test:
  - a standalone smoke run: a password-mode cPanel build started through `deploy/cpanel/app.cjs`, on the local MySQL, sending to a fake mail server
  - the full suites

**Interfaces:**
- Consumes: everything above.
- Produces: the README for a new client's sign-in. The smoke run proves the first Admin can sign in on the real server build.

- [ ] **Step 1: Remove the Vercel leftovers**

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
git rm -q vercel.json tests/unit/vercel-config.test.ts
grep -rn "vercel.json" README.md src tests | cut -c1-120
```

Expected: only the README's two mentions, which Step 2 rewrites.

- [ ] **Step 2: Update the README**

In `README.md`:

1. Replace the bullet starting with `` - `AUTH_MODE=mock`: local test logins `` (under "Run locally") with:

```markdown
- `AUTH_MODE=mock`: local test logins (Admin, Reviewer, a user with no role, and an Admin without two-factor login). Refused in production builds unless `ALLOW_TEST_LOGINS=1` (the e2e suite sets it). The real sign-in is `AUTH_MODE=password` (see "Sign-in").
```

2. Under "Checks", add this line after the command block:

```markdown
`pnpm test` and `pnpm e2e` need the local MySQL (`brew services start mysql@8.4`). `pnpm e2e` runs two suites: test logins, then password mode on the database `articles_ai_test_e2e_password` (`pnpm e2e:password` alone, after `pnpm build`).
```

3. Replace the whole section from `## Real sign-in (Clerk)` up to the line before `## Database, webhook and email` with:

```markdown
## Sign-in

The dashboard signs people in itself (M5c). Accounts, sessions, invitations and password resets live in its own database, and the links go out through its own email (see "Database, webhook and email").

- **Settings:**
  - `AUTH_MODE=password`
  - `APP_URL`: the dashboard's address, https, from which every emailed link is built
  - `ADMIN_EMAIL`
  - `TWO_FACTOR` stays off until two-factor login arrives (M5d).
- **The first Admin:**
  - While the dashboard has no Admin, opening its sign-in page emails `ADMIN_EMAIL` an invitation. It's sent once, and again only after that link expires (7 days).
  - Following it creates the Admin account.
  - If that address already has an account, the account becomes the Admin.
- **Everyone else:**
  - The Admin invites them on `/users`, with a role.
  - The emailed link (English and Arabic) works once, for 7 days. **Resend** makes a new one.
  - With `EMAIL_MODE=log` the invitation is kept but not sent, and the page says so.
- **Passwords:**
  - At least 10 characters, stored only as scrypt hashes.
  - "Forgot password?" emails a 1-hour link.
  - The Account page (`/security`) changes the password and signs the person out everywhere else.
- **Guessing:** 5 wrong passwords for an email, or 30 from one internet address, within 15 minutes lock them for 15 minutes. The address is the last `X-Forwarded-For` entry, which Passenger adds on the cPanel host. Keep the subdomain "DNS only" in Cloudflare, or every visitor would share Cloudflare's addresses.
- **Log:** every sign-in and refusal is in `app.log` (`Signed in: …`, `Sign-in refused (…): …`), with the email and address, never the password.
```

4. In "Database, webhook and email", item 3 (**Cron:**), delete the sentence `` `vercel.json` holds the same schedule for Vercel, which is no longer the hosting path.``

5. In "Hosting on cPanel" → One-time setup → item 4, replace the two sub-bullets `` - `AUTH_MODE=clerk`, with the Clerk keys`` and `` - `TWO_FACTOR=off` on Clerk's free plan`` with:

```markdown
   - `AUTH_MODE=password`, `APP_URL=https://dashboard.fakhernco.com` and `ADMIN_EMAIL` (the first Admin's address)
```

6. In the preview bullet:
   - Change `**Preview before Clerk:**` to `**Preview with test logins:**`.
   - Change `  - The Clerk build takes the password off again, but only once it is live.` to `  - A password-mode build takes the browser password off again, but only once it is live.`

7. In the "Email schedule" bullet, delete the line `` `vercel.json`'s cron applies only on Vercel.``

8. Add at the end of the file:

```markdown
## Decisions in M5c (own sign-in)

- **Our own accounts instead of Clerk** (and the Microsoft sign-in that came through it), so a copy needs no sign-in service. Accounts, sessions, invitations, resets and guessing limits are five tables in the dashboard's MySQL.
- **Email and password:**
  - Passwords are scrypt hashes from Node's own crypto: no package, and nothing native for the cPanel host.
  - Links and session cookies are random 256-bit tokens, and the database keeps only their sha256.
- **Sessions in the database, for 30 days,** in a `__Host-session` cookie:
  - The role is read on every request, so "No access" takes effect on the next page.
  - A password change or reset ends the other sessions.
- **The same answer for a wrong password and an unknown email,** and for "Forgot password" whether or not the account exists. Its email goes out after the answer.
- **Links come from `APP_URL` only,** never from the request, so a forged Host header can't redirect a reset email.
- **The first Admin comes from `ADMIN_EMAIL`,** because the cPanel host has no shell to create one.
- **After signing in, the home page,** not the page first asked for: server pages here can't see their own address without Next.js internals.
- **Two-factor login comes next (M5d):** an authenticator app and backup codes, required for Admins.
- **Two e2e suites:** test logins (port 3100), and password mode on the local MySQL (port 3101), from one build. The sign-in mode is read at request time only.
```

- [ ] **Step 3: Commit (the build uses committed code)**

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
grep -n -i "clerk" README.md | grep -v "Decisions in M4\|^2[0-9][0-9]:" | head
RC=0; pnpm lint >/dev/null 2>&1 || RC=$?
if [ $RC -eq 0 ]; then
  git add -A README.md vercel.json tests/unit/vercel-config.test.ts
  git commit -m "docs: README — the dashboard's own sign-in; Vercel leftovers removed (M5c)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
else echo "lint failed: RC=$RC"; fi
```

Expected: the `grep` lists nothing outside the M4b decision lines, which are history.

- [ ] **Step 4: The smoke run: a real server build, an empty database, the first Admin by email**

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
SMOKE=$PWD/dist/m5c-smoke; rm -rf "$SMOKE"; mkdir -p "$SMOKE"
mysql -u root -h 127.0.0.1 -e "DROP DATABASE IF EXISTS articles_ai_smoke; CREATE DATABASE articles_ai_smoke CHARACTER SET utf8mb4"
cat > "$SMOKE/settings.env" <<EOF
ENGINE_MODE=mock
AUTH_MODE=password
APP_URL=http://localhost:3300
ADMIN_EMAIL=owner@example.com
TWO_FACTOR=off
DB_MODE=mysql
DATABASE_URL=mysql://root@127.0.0.1:3306/articles_ai_smoke
WEBHOOK_ENCRYPTION_KEY=$(openssl rand -base64 32)
EMAIL_MODE=smtp
SMTP_HOST=localhost
SMTP_PORT=2525
SMTP_USER=notifications@dashboard.example.com
SMTP_PASSWORD='sm#ke"pa\$s=1'
EMAIL_FROM=Articles AI <notifications@dashboard.example.com>
CRON_SECRET=smoke
EOF
grep -c "SMTP_PASSWORD='sm#ke\"pa\$s=1'" "$SMOKE/settings.env"
cat > "$SMOKE/fake-smtp.cjs" <<'EOF'
// The smoke run's mail server: the login from settings.env; one JSON line per email received, with its text.
const fs = require("node:fs");
const path = require("node:path");
const { SMTPServer } = require("smtp-server");
const { simpleParser } = require("mailparser");
const out = path.join(__dirname, "received.jsonl");
new SMTPServer({
  logger: false,
  allowInsecureAuth: true,
  disabledCommands: ["STARTTLS"],
  onAuth(auth, _session, done) {
    if (auth.username === "notifications@dashboard.example.com" && auth.password === 'sm#ke"pa$s=1') done(null, { user: auth.username });
    else done(Object.assign(new Error("Incorrect authentication data"), { responseCode: 535 }));
  },
  onData(stream, _session, done) {
    simpleParser(stream).then((mail) => {
      fs.appendFileSync(out, JSON.stringify({ to: mail.to && mail.to.text, subject: mail.subject, text: mail.text }) + "\n");
      done();
    }, done);
  },
}).listen(2525, "127.0.0.1", () => console.log("fake SMTP on 2525"));
EOF
cat > "$SMOKE/first-admin.cjs" <<'EOF'
// Opens the sign-in page of an empty dashboard, follows the emailed first-Admin invitation, signs out, and signs in again.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("@playwright/test");
const base = "http://localhost:3300";
const received = path.join(__dirname, "received.jsonl");
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  await page.goto(`${base}/en/sign-in`);
  console.log("notice:", await page.getByTestId("first-admin").getAttribute("data-state"));
  let mail = null;
  for (let i = 0; i < 30 && !mail; i += 1) {
    if (fs.existsSync(received)) mail = fs.readFileSync(received, "utf8").trim().split("\n").map((line) => JSON.parse(line)).find((m) => m.to === "owner@example.com");
    if (!mail) await new Promise((resolve) => setTimeout(resolve, 500));
  }
  console.log("email:", mail ? mail.subject : "none");
  const link = /http:\/\/localhost:3300(\/en\/invitation\?token=[A-Za-z0-9_-]+)/.exec(mail.text)[1];
  await page.goto(base + link);
  await page.getByTestId("invitation-name").fill("Smoke Owner");
  await page.getByTestId("invitation-password").fill("smoke password 123");
  await page.getByTestId("invitation-confirm").fill("smoke password 123");
  await page.getByTestId("invitation-submit").click();
  await page.waitForURL(`${base}/en`);
  console.log("signed in as:", await page.getByTestId("user-role").innerText());
  await page.getByTestId("sign-out").click();
  await page.waitForURL(`${base}/en/sign-in`);
  await page.getByTestId("sign-in-email").fill("owner@example.com");
  await page.getByTestId("sign-in-password").fill("smoke password 123");
  await page.getByTestId("sign-in-submit").click();
  await page.waitForURL(`${base}/en`);
  console.log("signed in again:", await page.getByTestId("user-name").innerText());
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
EOF
CPANEL_SETTINGS="$SMOKE/settings.env" scripts/cpanel-build.sh > "$SMOKE/build.log" 2>&1; tail -1 "$SMOKE/build.log"
SHA=$(git rev-parse --short HEAD)
(NODE_PATH=$PWD/node_modules node "$SMOKE/fake-smtp.cjs" > "$SMOKE/smtp.log" 2>&1 &)
(cd "dist/cpanel/$SHA" && DASHBOARD_SHARED="$SMOKE" PORT=3300 node app.cjs > /dev/null 2>&1 &)
for i in $(seq 1 30); do curl -s -o /dev/null http://localhost:3300/api/health && break; sleep 1; done
NODE_PATH=$PWD/node_modules node "$SMOKE/first-admin.cjs"
mysql -u root -h 127.0.0.1 -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='articles_ai_smoke' AND table_name <> '__drizzle_migrations'; SELECT COUNT(*) FROM articles_ai_smoke.__drizzle_migrations; SELECT email, role FROM articles_ai_smoke.users"
grep -E "Signed in:|First Admin" "$SMOKE/app.log"
grep -c "smoke password 123\|Error" "$SMOKE/app.log"
kill $(lsof -ti tcp:3300) $(lsof -ti tcp:2525)
```

Expected:
- **Settings file:** `1`. The quoted SMTP password was written correctly.
- **Build:** `Built …/dist/cpanel/<sha> (…)`, without the `-preview` suffix.
- **The browser script:**
  - `notice: invited`
  - `email: You're invited to Articles AI · دعوة إلى Articles AI`
  - `signed in as: Admin`
  - `signed in again: Smoke Owner`
- **MySQL:**
  - `10` tables and `2` migrations
  - one user: `owner@example.com admin`
- **`app.log`:**
  - `First Admin: invitation emailed to owner@example.com`
  - `Signed in: owner@example.com from unknown address`: a local run has no Passenger, so there's no trustworthy address
- **The password and error count:** `0`.

- [ ] **Step 5: The full checks**

```bash
cd ~/Documents/GitHub/articles-ai-dashboard
pnpm lint 2>&1 | tail -2
pnpm typecheck 2>&1 | tail -2
pnpm test > dist/m5c-smoke/unit.log 2>&1; echo "unit exit $?"; grep -E "Test Files|Tests  " dist/m5c-smoke/unit.log
pnpm e2e > dist/m5c-smoke/e2e.log 2>&1; echo "e2e exit $?"; grep -E "passed|failed" dist/m5c-smoke/e2e.log
grep -rln "@clerk" src tests package.json || echo "no Clerk imports"
ls vercel.json 2>/dev/null || echo "no vercel.json"
```

Expected:
- lint and typecheck print no errors.
- `unit exit 0`, `e2e exit 0`, every test passing.
- `no Clerk imports` and `no vercel.json`.

Task test command: `pnpm test`

---

## Going live (with the user, after the final review and the merge)

1. **Me: settings.** Change these in `.env.cpanel`, then check them with the app's own parser (as in M5b):
   - `AUTH_MODE=password`
   - `APP_URL=https://dashboard.fakhernco.com`
   - `ADMIN_EMAIL=<the user's address>`, asked from the user
   - `TWO_FACTOR=off`
   - delete `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`
2. **Me: release.** Run `scripts/cpanel-build.sh`, then `scripts/cpanel-deploy.sh --settings`.
3. **The user:**
   - opens https://dashboard.fakhernco.com
   - the sign-in page says an invitation was emailed
   - follows it, sets a password, and is the Admin
4. **Me: check the address in the log.** `app.log` must show `Signed in: <user's email> from <the user's public IP>`, matching the access log's client address for that request. That confirms the dashboard reads the right `X-Forwarded-For` entry on Passenger. If it shows `unknown address`, only the per-email limit applies. Note that in the follow-ups.
5. **The user invites the colleagues on `/users`.** Their emails are the first to Microsoft 365 inboxes (M5b): check where they land.
6. **Me:** refresh the encrypted settings backup.
7. **With the user's OK:** delete the Clerk application in the user's Clerk dashboard (dashboard.clerk.com). Old Clerk cookies in browsers are simply ignored.
