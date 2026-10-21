# M4b: Users and Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the users part of design §13 M4:
- **`/users` (Admin):**
  - everyone who can sign in, with role, two-factor status and last sign-in
  - change a role (Admin, Reviewer or No access)
  - invite by email with a role
  - revoke a pending invitation
- **Two-factor login:**
  - required for the Admin: an Admin without it is sent to `/security` to turn it on before anything else (design §5, §11)
  - recommended for Reviewers: a reminder only

It also folds in the Clerk-session follow-ups:
- **M1 follow-ups:**
  - the session is read once per request instead of up to six times
  - signing out loads the sign-in page afresh, so no hidden copy of the previous person's pages stays in the DOM
- **M3a follow-up:** `/api/jobs` reads the role from the session token, so a poll costs no Clerk Backend API call

M4c (database, webhook receiver and setup, email notifications) gets its own plan.

**Architecture:**
- **A `UserDirectory` interface with two implementations:**
  - Clerk mode wraps Clerk's backend client (`clerkClient()`): user list, `publicMetadata.role`, invitations.
  - Mock mode is a namespaced in-memory directory seeded with the test users. Mock sessions read their role and two-factor status from it, so a role change takes effect on the person's next request, as with Clerk.
- **Pages:** `/users` is under the `(app)` shell with `users.manage`. `/security` sits outside the shell (like `/no-access`), so the two-factor redirect can't loop.

**Tech Stack:** Next.js 16.4 (App Router, Cache Components), React 19.3 (`cache`), TypeScript 5, next-intl 4.14, Zod 4.6, `@clerk/nextjs` 7.9 (already installed; backend client via `@clerk/nextjs/server`), shadcn/ui, Vitest 5, Playwright 1.64. No new dependencies.

**Spec:**
- `docs/specs/2026-10-21-marketing-dashboard-design.md`:
  - §5 login & roles: Clerk; the Admin invites users and sets their role, stored in Clerk metadata; two-factor required for the Admin, recommended for Reviewers; every page and action checks the role on the server
  - §7 `/users` (Admin: Clerk user management plus role)
  - §11 security
- `docs/specs/Marketing Portal Build Spec v1.1.html` §6 `/account`: "Your app manages its own users and roles. We never see them."
- Follow-ups: `docs/plans/2026-10-21-m1-followups.md` and `2026-10-22-m3a-followups.md`

## Global Constraints

- **Earlier constraints still hold:** all M1–M4a Global Constraints. In particular:
  - Cache Components: runtime data only inside `<Suspense>`
  - server-side role checks on every page and action
  - Latin digits and logical CSS
  - never "law firm"
  - changes go through server actions via `useEngineAction`
  - every e2e test isolates the mock store
- **No new packages.**
- **Roles (design §5):**
  - Only `admin` and `reviewer`, kept in Clerk `publicMetadata.role`.
  - "No access" means the role is removed (the account stays and can be given a role again).
  - The portal never deletes a Clerk user.
- **Nobody changes their own access:** an Admin's own row can't be changed, so the site can't be locked out of its last Admin.
- **Invitations:**
  - An email is compared trimmed and lower-case.
  - An email that already has an account or a pending invitation is refused.
  - The role travels in the invitation's `publicMetadata`, so it lands on the account when the person signs up (Clerk).
- **Two-factor (design §5, §11):**
  - An Admin with `twoFactor` off is sent to `/{locale}/security` from every `(app)` page and every server action that checks the session.
  - A Reviewer without it is reminded only.
  - In Clerk mode `/security` shows Clerk's `<UserProfile />`; in mock mode a test switch turns it on.
- **Clerk mode can't be run locally (no keys):**
  - The Clerk directory is unit-tested over a fake client with the same method shapes.
  - e2e runs in `AUTH_MODE=mock`.
  - The Clerk Dashboard settings the code relies on are listed in the README by Task 6.
- **Mock-only behaviour:**
  - Test users:
    - `dev_admin` (two-factor on)
    - `dev_reviewer` (off)
    - `dev_norole` (no role)
    - `dev_admin_no2fa`, a new Admin with two-factor off
  - The directory is per `mock_store` namespace, like the mock engine.
  - Invitations are listed but can't be accepted.
  - The mock scenario `signin_down` (the `mock_scenario` cookie) makes the directory unreachable, while the engine stays normal.

## Review Focus

1. **An Admin can't change their own access, and a role change takes effect on the person's next page or action.** Removing a Reviewer's access sends them to "No access"; giving it back lets them in again.
   - *Pinned by:* Task 2 unit tests and Task 3 e2e.
2. **An Admin without two-factor login reaches nothing but the setup page:** every `(app)` page and every server action that checks the session sends them there. Once it's on, they're let in. A Reviewer is only reminded.
   - *Pinned by:* Task 1 unit tests and Task 4 e2e.
3. **Inviting an email that already has an account or a pending invitation is refused with a clear message,** in any capitalisation or with surrounding spaces. An address that isn't an email shows a message next to the field.
   - *Pinned by:* Task 2 unit tests and Task 3 e2e.
4. **When Clerk can't be reached or returns an error,** the Users page and its actions show "The sign-in service can't be reached right now", and the page doesn't crash. A duplicate from Clerk reads as "already has an account or an invitation".
   - *Pinned by:* Task 2 unit tests (the Clerk adapter) and Task 3 (the view's unavailable notice).
5. **Signing out loads the sign-in page afresh:** no hidden copy of the previous person's pages (their name, their keyword list) stays in the DOM.
   - *Pinned by:* Task 5 e2e.

## File map (new unless marked)

```
src/lib/auth/types.ts                          (modify) Session.twoFactor
src/lib/auth/clerk-session.ts                  (modify) twoFactor from Clerk; roleFromClaims
src/lib/auth/mock-session.ts                   (modify) twoFactor on test users; dev_admin_no2fa
src/lib/auth/session.ts                        (modify) cached getSession; two-factor redirect; getRole
src/lib/auth/mock-actions.ts                   (modify) enableMockTwoFactor; signOutMockUser removed
src/app/api/jobs/[id]/route.ts                 (modify) getRole
src/lib/users/types.ts                         DirectoryUser, DirectoryInvite, UserDirectory, DirectoryError, tryDirectory
src/lib/users/rules.ts                         normalizeEmail, validInviteEmail, alreadyKnown, canChangeAccess (pure)
src/lib/users/mock-directory.ts                namespaced test directory
src/lib/users/clerk-directory.ts               the Clerk adapter
src/lib/users/directory.ts                     getDirectory() (server-only)
src/app/[locale]/(app)/users/{page.tsx,actions.ts}
src/components/users/{users-view.tsx,users-board.tsx}
src/app/[locale]/security/page.tsx             outside the (app) shell
src/components/security/{security-view.tsx,clerk-security.tsx}
src/app/api/auth/sign-out/route.ts             test-login sign-out as a plain form POST
src/components/shell/sign-out-control.tsx      (modify) full-reload sign-out in both modes
src/components/shell/clerk-sign-out.tsx        Clerk sign-out with a full reload
src/components/shell/user-menu.tsx             (modify) Security link
src/components/shell/nav.ts                    (modify) Users
src/app/[locale]/sign-in/page.tsx              (unchanged; lists MOCK_USERS, now four)
messages/en.json, messages/ar.json             (modify)
tests/unit/auth.test.ts, session.test.ts, jobs-route.test.ts, nav.test.ts   (modify)
tests/unit/session-cache.test.ts, users.test.ts, users-actions.test.ts, sign-out-route.test.ts
tests/e2e/helpers.ts, auth.spec.ts             (modify)
tests/e2e/users.spec.ts, security.spec.ts
README.md, docs/plans/2026-10-22-m4b-followups.md
```

**Messages:** each task adds its keys to `messages/en.json` and `messages/ar.json` with `python3 .superpowers/tools/merge_messages.py FILE DOTTED.PATH FRAGMENT`. Keep the two files' keys identical. Every task's messages are given in full, in both languages.

---

### Task 1: Sessions: two-factor status, one lookup per request, and the role from the session token

**Files:**
- Modify:
  - `src/lib/auth/types.ts`, `src/lib/auth/clerk-session.ts`, `src/lib/auth/mock-session.ts`, `src/lib/auth/session.ts`
  - `src/app/api/jobs/[id]/route.ts`
  - `tests/e2e/helpers.ts`
- Test:
  - modify: `tests/unit/auth.test.ts`, `tests/unit/session.test.ts`, `tests/unit/jobs-route.test.ts`
  - create: `tests/unit/session-cache.test.ts`

**Interfaces:**
- Consumes: M1 `getSession`, `requireSession`, `requirePermission`, `MOCK_USERS`, `decodeMockSession`, `sessionFromClerkUser`
- Produces:
  - **`Session`:** `{ userId, email, name, role, twoFactor }`
  - **`sessionFromClerkUser(user)`:** reads `user.twoFactorEnabled`
  - **`roleFromClaims(claims)`:** `Role | null`, or `undefined` when the token carries no metadata
  - **`MOCK_USERS`:** four test users, adding `dev_admin_no2fa` (Admin, two-factor off)
  - **`getSession`:** wrapped in React `cache` (one lookup per request)
  - **`requireSession(locale)`:** sends an Admin without two-factor to `/{locale}/security`
  - **`getRole()`:** `Role | null`; in Clerk mode it reads the session token first
  - **`/api/jobs/[id]`:** uses `getRole()`

- [ ] **Step 1: Write the failing tests**

In `tests/unit/auth.test.ts`:
- Import `roleFromClaims` from `@/lib/auth/clerk-session` next to `sessionFromClerkUser`.
- Replace the test `it("decodes the three fixed test users", …)` with:

  ```ts
    it("decodes the fixed test users, with their two-factor status", () => {
      expect(MOCK_USERS.map((u) => [u.userId, u.role, u.twoFactor])).toEqual([
        ["dev_admin", "admin", true],
        ["dev_reviewer", "reviewer", false],
        ["dev_norole", null, false],
        ["dev_admin_no2fa", "admin", false],
      ]);
      expect(decodeMockSession("dev_reviewer")?.role).toBe("reviewer");
      expect(decodeMockSession("dev_norole")?.role).toBeNull();
    });
  ```

- In `describe("sessionFromClerkUser", …)`:
  - change `const base = { id: "user_1", fullName: "Sara Ali", primaryEmailAddress: { emailAddress: "sara@example.com" } };` to `const base = { id: "user_1", fullName: "Sara Ali", primaryEmailAddress: { emailAddress: "sara@example.com" }, twoFactorEnabled: true };`
  - change the expected object of "reads the role from public metadata" to include `twoFactor: true`
  - append:

  ```ts
    it("reads whether two-factor login is on (design §5)", () => {
      expect(sessionFromClerkUser({ ...base, twoFactorEnabled: false, publicMetadata: { role: "admin" } }).twoFactor).toBe(false);
    });
  ```

- Append:

  ```ts
  describe("roleFromClaims (M3a follow-up: no Clerk API call per job poll)", () => {
    it("reads the role the session token carries in its metadata claim", () => {
      expect([roleFromClaims({ metadata: { role: "reviewer" } }), roleFromClaims({ metadata: { role: "owner" } }), roleFromClaims({ metadata: {} })]).toEqual([
        "reviewer",
        null,
        null,
      ]);
    });

    it("says nothing when the token has no metadata claim, so the caller asks Clerk instead", () => {
      expect([roleFromClaims({}), roleFromClaims(null), roleFromClaims({ metadata: "x" })]).toEqual([undefined, undefined, undefined]);
    });
  });
  ```

In `tests/unit/session.test.ts`, append inside `describe("session guards (test logins)", …)`:

```ts
  it("sends an admin without two-factor login to set it up first (design §5; Review Focus 2)", async () => {
    cookieJar.set("dev_session", "dev_admin_no2fa");
    await expect(requireSession("en")).rejects.toThrow("REDIRECT:/en/security");
    await expect(requirePermission("ar", "settings.manage")).rejects.toThrow("REDIRECT:/ar/security");
  });

  it("only reminds a reviewer: one without two-factor login may continue", async () => {
    cookieJar.set("dev_session", "dev_reviewer");
    await expect(requireSession("en")).resolves.toMatchObject({ role: "reviewer", twoFactor: false });
  });
```

Create `tests/unit/session-cache.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ memo: new Map<unknown, unknown>(), currentUser: vi.fn(), auth: vi.fn() }));

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
vi.mock("@clerk/nextjs/server", () => ({ currentUser: state.currentUser, auth: state.auth }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));

const { getRole, getSession, requirePermission, requireSession } = await import("@/lib/auth/session");

const ADMIN = { id: "user_1", fullName: "Sara Ali", primaryEmailAddress: { emailAddress: "sara@example.com" }, publicMetadata: { role: "admin" }, twoFactorEnabled: true };

beforeEach(() => {
  state.memo.clear();
  state.currentUser.mockReset();
  state.auth.mockReset();
  vi.stubEnv("AUTH_MODE", "clerk");
  vi.stubEnv("ENGINE_MODE", "mock");
  vi.stubEnv("VERCEL", "");
});

describe("Clerk sessions (M1 and M3a follow-ups)", () => {
  it("every guard on a page shares one Clerk user lookup", async () => {
    state.currentUser.mockResolvedValue(ADMIN);
    await requireSession("en");
    await requirePermission("en", "settings.manage");
    await getSession();
    expect(state.currentUser).toHaveBeenCalledTimes(1);
  });

  it("a job poll reads the role from the session token, without a Clerk user lookup", async () => {
    state.auth.mockResolvedValue({ userId: "user_2", sessionClaims: { metadata: { role: "reviewer" } } });
    expect(await getRole()).toBe("reviewer");
    expect(state.currentUser).not.toHaveBeenCalled();
  });

  it("falls back to the Clerk user when the token carries no metadata", async () => {
    state.auth.mockResolvedValue({ userId: "user_1", sessionClaims: {} });
    state.currentUser.mockResolvedValue(ADMIN);
    expect(await getRole()).toBe("admin");
  });

  it("has no role for someone signed out", async () => {
    state.auth.mockResolvedValue({ userId: null, sessionClaims: null });
    expect(await getRole()).toBeNull();
  });
});
```

In `tests/unit/jobs-route.test.ts`:
- Replace `const session = vi.fn();` with `const role = vi.fn();`.
- Replace `vi.mock("@/lib/auth/session", () => ({ getSession: () => session() }));` with `vi.mock("@/lib/auth/session", () => ({ getRole: () => role() }));`.
- Replace each `session.mockResolvedValue({ userId: "u", email: "x@example.com", name: "X", role: null });` with `role.mockResolvedValue(null);`.
- Replace each `session.mockResolvedValue({ userId: "u", email: "r@example.com", name: "R", role: "reviewer" });` with `role.mockResolvedValue("reviewer");`.

- [ ] **Step 2: Run the tests to make sure they fail**

Run: `pnpm test tests/unit/auth.test.ts tests/unit/session.test.ts tests/unit/session-cache.test.ts tests/unit/jobs-route.test.ts`
Expected: FAIL.
- `auth.test.ts`: MOCK_USERS has 3 users and no `twoFactor`, and `roleFromClaims` isn't a function.
- `session.test.ts`: `dev_admin_no2fa` isn't a test user yet, so the redirect is to `/en/sign-in`, not `/en/security`.
- `session-cache.test.ts`:
  - `currentUser` is called 3 times
  - `getRole` isn't a function
- `jobs-route.test.ts`: the route calls the `getSession` that the mock no longer provides, so it throws.

- [ ] **Step 3: Implement**

Replace `src/lib/auth/types.ts` with:

```ts
import type { Role } from "./roles";

/** `twoFactor`: the person has two-factor login on (design §5: required for the Admin, recommended for Reviewers). */
export type Session = { userId: string; email: string; name: string; role: Role | null; twoFactor: boolean };
export type AuthedSession = Omit<Session, "role"> & { role: Role };
```

Replace `src/lib/auth/clerk-session.ts` with:

```ts
import { isRole, type Role } from "./roles";
import type { Session } from "./types";

/** The parts of Clerk's User we read; `currentUser()`'s result satisfies this structurally. */
export type ClerkUserLike = {
  id: string;
  fullName: string | null;
  primaryEmailAddress: { emailAddress: string } | null;
  publicMetadata: Record<string, unknown> | null | undefined;
  twoFactorEnabled: boolean;
};

export function sessionFromClerkUser(user: ClerkUserLike): Session {
  const email = user.primaryEmailAddress?.emailAddress ?? "";
  const role = user.publicMetadata?.role;
  return { userId: user.id, email, name: user.fullName || email, role: isRole(role) ? role : null, twoFactor: user.twoFactorEnabled === true };
}

/**
 * The role the session token carries, when the Clerk instance puts public metadata there (Clerk Dashboard → Sessions →
 * Customize session token: {"metadata": "{{user.public_metadata}}"}). Undefined when the token has no metadata claim.
 */
export function roleFromClaims(claims: unknown): Role | null | undefined {
  if (typeof claims !== "object" || claims === null) return undefined;
  const metadata = (claims as Record<string, unknown>).metadata;
  if (typeof metadata !== "object" || metadata === null) return undefined;
  const role = (metadata as Record<string, unknown>).role;
  return isRole(role) ? role : null;
}
```

In `src/lib/auth/mock-session.ts`, replace `MOCK_USERS` with:

```ts
export const MOCK_USERS: readonly Session[] = [
  { userId: "dev_admin", email: "admin@example.com", name: "Admin (test)", role: "admin", twoFactor: true },
  { userId: "dev_reviewer", email: "reviewer@example.com", name: "Reviewer (test)", role: "reviewer", twoFactor: false },
  { userId: "dev_norole", email: "pending@example.com", name: "No role (test)", role: null, twoFactor: false },
  { userId: "dev_admin_no2fa", email: "admin2@example.com", name: "Admin without two-factor (test)", role: "admin", twoFactor: false },
];
```

Replace `src/lib/auth/session.ts` with:

```ts
import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { serverEnv } from "@/lib/env";
import { roleFromClaims, sessionFromClerkUser } from "./clerk-session";
import { decodeMockSession, MOCK_SESSION_COOKIE } from "./mock-session";
import { can, type Permission, type Role } from "./roles";
import type { AuthedSession, Session } from "./types";

/** Reads the signed-in person once per request (React cache), so a page's many guards make one Clerk lookup. Call only under <Suspense>. */
export const getSession = cache(async (): Promise<Session | null> => {
  if (serverEnv().authMode === "mock") {
    return decodeMockSession((await cookies()).get(MOCK_SESSION_COOKIE)?.value);
  }
  const { currentUser } = await import("@clerk/nextjs/server");
  const user = await currentUser();
  return user ? sessionFromClerkUser(user) : null;
});

/** Signed in with a role, or redirected. An Admin without two-factor login is sent to set it up first (design §5, §11). */
export async function requireSession(locale: string): Promise<AuthedSession> {
  const session = await getSession();
  if (!session) redirect(`/${locale}/sign-in`);
  if (!session.role) redirect(`/${locale}/no-access`);
  if (session.role === "admin" && !session.twoFactor) redirect(`/${locale}/security`);
  return { ...session, role: session.role };
}

/** Like requireSession, and redirects to the dashboard when the role lacks the permission. */
export async function requirePermission(locale: string, permission: Permission): Promise<AuthedSession> {
  const session = await requireSession(locale);
  if (!can(session.role, permission)) redirect(`/${locale}`);
  return session;
}

/**
 * Just the role, for a route polled every few seconds (/api/jobs). In Clerk mode it's read from the session token when
 * the instance puts the metadata there, so a poll costs no Clerk Backend API call (M3a follow-up).
 */
export async function getRole(): Promise<Role | null> {
  if (serverEnv().authMode === "clerk") {
    const { auth } = await import("@clerk/nextjs/server");
    const { userId, sessionClaims } = await auth();
    if (!userId) return null;
    const role = roleFromClaims(sessionClaims);
    if (role !== undefined) return role;
  }
  return (await getSession())?.role ?? null;
}
```

In `src/app/api/jobs/[id]/route.ts`:
- Change `import { getSession } from "@/lib/auth/session";` to `import { getRole } from "@/lib/auth/session";`.
- Replace

  ```ts
    const session = await getSession();
    if (!session?.role || !can(session.role, "content.work")) {
  ```

  with

  ```ts
    const role = await getRole();
    if (!role || !can(role, "content.work")) {
  ```

In `tests/e2e/helpers.ts`, change `export type TestUser = "dev_admin" | "dev_reviewer" | "dev_norole";` to `export type TestUser = "dev_admin" | "dev_reviewer" | "dev_norole" | "dev_admin_no2fa";`.

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `pnpm test tests/unit/auth.test.ts tests/unit/session.test.ts tests/unit/session-cache.test.ts tests/unit/jobs-route.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint, typecheck, the whole unit suite and the auth e2e**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm e2e tests/e2e/auth.spec.ts tests/e2e/dashboard.spec.ts`
Expected:
- lint and typecheck exit 0
- every unit test passes
- the auth and dashboard e2e still pass: `dev_admin` has two-factor on, so nothing redirects
- if `typecheck` names a `Session` literal missing `twoFactor` elsewhere, add `twoFactor` there

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth "src/app/api/jobs/[id]/route.ts" tests/unit tests/e2e/helpers.ts
git commit -m "feat: sessions carry two-factor status, are read once per request, and job polls read the role from the token"
```

---

### Task 2: The user directory: rules, the test directory, and the Clerk adapter

**Files:**
- Create: `src/lib/users/types.ts`, `src/lib/users/rules.ts`, `src/lib/users/mock-directory.ts`, `src/lib/users/clerk-directory.ts`, `src/lib/users/directory.ts`
- Modify: `src/lib/auth/session.ts` (mock sessions read the directory)
- Test: `tests/unit/users.test.ts` (create)

**Interfaces:**
- Consumes: Task 1 `Session`, `MOCK_USERS`, `getSession`; M3a `MOCK_STORE_COOKIE`; M2a `ActionResult`
- Produces:
  - **`types.ts`:**
    - `DirectoryUser` (`{ id, name, email, role, twoFactor, lastSignInAt }`) and `DirectoryInvite` (`{ id, email, role, createdAt }`)
    - `interface UserDirectory`:
      - `list()`, which returns `{ users, invites }`
      - `invite(email, role)`, `revokeInvite(id)`
      - `setRole(userId, role | null)`
    - `class DirectoryError(code, message, fields?)`, with codes `invalid_input | conflict | not_found | unavailable`
    - `tryDirectory(fn)`, which returns an `ActionResult`
  - **`rules.ts`:** `normalizeEmail`, `validInviteEmail` (throws `DirectoryError` with `fields.email`), `alreadyKnown(email, users, invites)`, `canChangeAccess(actorId, targetId)`
  - **`createMockDirectory(namespace?)`:** a `UserDirectory`, plus `sessionOf(userId)` and `enableTwoFactor(userId)`
  - **`createClerkDirectory(client: ClerkDirectoryClient)`:** a `UserDirectory`
  - **`getDirectory()`:** server-only; the mock directory or the Clerk one, by `AUTH_MODE`. In mock mode the `mock_scenario` cookie `signin_down` gives a directory whose every call fails with `unavailable`.
  - **Mock `getSession`:** reads the role and two-factor status from the directory of the request's `mock_store` namespace

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/users.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createClerkDirectory, type ClerkDirectoryClient } from "@/lib/users/clerk-directory";
import { createMockDirectory } from "@/lib/users/mock-directory";
import { alreadyKnown, canChangeAccess, normalizeEmail } from "@/lib/users/rules";
import { DirectoryError, tryDirectory } from "@/lib/users/types";

let sequence = 0;
const fresh = () => createMockDirectory(`users${++sequence}${Date.now().toString(36)}`);

describe("user rules (design §5)", () => {
  it("compares emails trimmed and in lower case", () => {
    expect(normalizeEmail("  New.Reviewer@Example.com ")).toBe("new.reviewer@example.com");
  });

  it("knows an email that already has an account or an invitation, in any capitalisation (Review Focus 3)", () => {
    expect(alreadyKnown("ADMIN@example.com", [{ email: "admin@example.com" }], [])).toBe(true);
    expect(alreadyKnown(" x@example.com", [], [{ email: "X@Example.com" }])).toBe(true);
    expect(alreadyKnown("y@example.com", [{ email: "admin@example.com" }], [])).toBe(false);
  });

  it("nobody changes their own access, so the site can't lose its last Admin (Review Focus 1)", () => {
    expect([canChangeAccess("u1", "u1"), canChangeAccess("u1", "u2")]).toEqual([false, true]);
  });
});

describe("the test directory (AUTH_MODE=mock)", () => {
  it("starts with the test users, their roles and two-factor status", async () => {
    const { users, invites } = await fresh().list();
    expect(users.map((user) => [user.id, user.role, user.twoFactor])).toEqual([
      ["dev_admin", "admin", true],
      ["dev_reviewer", "reviewer", false],
      ["dev_norole", null, false],
      ["dev_admin_no2fa", "admin", false],
    ]);
    expect(invites).toEqual([]);
  });

  it("invites an email once, ignoring case and spaces; refuses an existing account or a non-email; revokes (Review Focus 3)", async () => {
    const directory = fresh();
    const invite = await directory.invite(" New.Reviewer@example.com ", "reviewer");
    expect(invite).toMatchObject({ email: "new.reviewer@example.com", role: "reviewer" });
    await expect(directory.invite("NEW.reviewer@example.com", "admin")).rejects.toMatchObject({ code: "conflict" });
    await expect(directory.invite("Reviewer@Example.com", "admin")).rejects.toMatchObject({ code: "conflict" });
    await expect(directory.invite("not-an-email", "reviewer")).rejects.toMatchObject({ code: "invalid_input", fields: { email: expect.any(String) } });
    expect(await directory.revokeInvite(invite.id)).toEqual({ revoked: true });
    expect((await directory.list()).invites).toEqual([]);
    await expect(directory.revokeInvite(invite.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("changes a role, and the person's session follows it (Review Focus 1)", async () => {
    const directory = fresh();
    expect((await directory.setRole("dev_reviewer", null)).role).toBeNull();
    expect(directory.sessionOf("dev_reviewer")).toMatchObject({ role: null });
    expect((await directory.setRole("dev_reviewer", "reviewer")).role).toBe("reviewer");
    await expect(directory.setRole("nobody", "admin")).rejects.toMatchObject({ code: "not_found" });
  });

  it("keeps each mock_store namespace apart, like the mock engine", async () => {
    const stamp = Date.now().toString(36);
    const a = createMockDirectory(`usersA${stamp}`);
    const b = createMockDirectory(`usersB${stamp}`);
    await a.setRole("dev_reviewer", "admin");
    expect(b.sessionOf("dev_reviewer")?.role).toBe("reviewer");
    expect(createMockDirectory(`usersA${stamp}`).sessionOf("dev_reviewer")?.role).toBe("admin");
  });

  it("turns on two-factor login for a test user, and knows no one else", () => {
    const directory = fresh();
    directory.enableTwoFactor("dev_admin_no2fa");
    expect(directory.sessionOf("dev_admin_no2fa")).toMatchObject({ role: "admin", twoFactor: true });
    expect(directory.sessionOf("someone")).toBeNull();
  });
});

type Call = [string, ...unknown[]];

function fakeClerk() {
  const calls: Call[] = [];
  const client: ClerkDirectoryClient = {
    users: {
      getUserList: async (params) => {
        calls.push(["getUserList", params]);
        return {
          data: [
            {
              id: "user_1",
              fullName: "Sara Ali",
              primaryEmailAddress: { emailAddress: "sara@example.com" },
              publicMetadata: { role: "admin" },
              twoFactorEnabled: true,
              lastSignInAt: Date.parse("2026-10-21T05:00:00Z"),
            },
            { id: "user_2", fullName: null, primaryEmailAddress: { emailAddress: "omar@example.com" }, publicMetadata: { role: "owner" }, twoFactorEnabled: false, lastSignInAt: null },
          ],
        };
      },
      updateUserMetadata: async (userId, params) => {
        calls.push(["updateUserMetadata", userId, params]);
        return { id: userId, fullName: "Omar", primaryEmailAddress: { emailAddress: "omar@example.com" }, publicMetadata: params.publicMetadata, twoFactorEnabled: false, lastSignInAt: null };
      },
    },
    invitations: {
      getInvitationList: async (params) => {
        calls.push(["getInvitationList", params]);
        return { data: [{ id: "inv_1", emailAddress: "new@example.com", publicMetadata: { role: "reviewer" }, createdAt: Date.parse("2026-10-20T08:00:00Z") }] };
      },
      createInvitation: async (params) => {
        calls.push(["createInvitation", params]);
        return { id: "inv_2", emailAddress: params.emailAddress, publicMetadata: params.publicMetadata, createdAt: Date.parse("2026-10-21T08:00:00Z") };
      },
      revokeInvitation: async (invitationId) => {
        calls.push(["revokeInvitation", invitationId]);
        return { id: invitationId, emailAddress: "new@example.com", publicMetadata: null, createdAt: 0 };
      },
    },
  };
  return { client, calls };
}

describe("the Clerk directory (AUTH_MODE=clerk), over a fake Clerk client", () => {
  it("lists users with the role from public metadata, and pending invitations", async () => {
    const { client, calls } = fakeClerk();
    expect(await createClerkDirectory(client).list()).toEqual({
      users: [
        { id: "user_1", name: "Sara Ali", email: "sara@example.com", role: "admin", twoFactor: true, lastSignInAt: "2026-10-21T05:00:00.000Z" },
        { id: "user_2", name: "omar@example.com", email: "omar@example.com", role: null, twoFactor: false, lastSignInAt: null },
      ],
      invites: [{ id: "inv_1", email: "new@example.com", role: "reviewer", createdAt: "2026-10-20T08:00:00.000Z" }],
    });
    expect(calls).toContainEqual(["getUserList", { limit: 100, orderBy: "-created_at" }]);
    expect(calls).toContainEqual(["getInvitationList", { status: "pending", limit: 100 }]);
  });

  it("invites with the role in public metadata and Clerk's email; sets and removes a role; revokes", async () => {
    const { client, calls } = fakeClerk();
    const directory = createClerkDirectory(client);
    expect(await directory.invite(" Brand.New@example.com", "reviewer")).toEqual({
      id: "inv_2",
      email: "brand.new@example.com",
      role: "reviewer",
      createdAt: "2026-10-21T08:00:00.000Z",
    });
    await directory.setRole("user_2", "reviewer");
    await directory.setRole("user_2", null);
    expect(await directory.revokeInvite("inv_1")).toEqual({ revoked: true });
    expect(calls.filter(([name]) => name !== "getUserList" && name !== "getInvitationList")).toEqual([
      ["createInvitation", { emailAddress: "brand.new@example.com", publicMetadata: { role: "reviewer" }, notify: true }],
      ["updateUserMetadata", "user_2", { publicMetadata: { role: "reviewer" } }],
      ["updateUserMetadata", "user_2", { publicMetadata: { role: null } }],
      ["revokeInvitation", "inv_1"],
    ]);
  });

  it("refuses an email that already has an account or an invitation before asking Clerk (Review Focus 3)", async () => {
    const { client, calls } = fakeClerk();
    await expect(createClerkDirectory(client).invite("SARA@example.com", "admin")).rejects.toMatchObject({ code: "conflict" });
    await expect(createClerkDirectory(client).invite("New@Example.com", "admin")).rejects.toMatchObject({ code: "conflict" });
    expect(calls.some(([name]) => name === "createInvitation")).toBe(false);
  });

  it("turns Clerk's errors into the portal's: a duplicate is a conflict, a missing record not_found, anything else unavailable (Review Focus 4)", async () => {
    const { client } = fakeClerk();
    client.invitations.createInvitation = async () => {
      throw Object.assign(new Error("duplicate"), { status: 422, errors: [{ code: "duplicate_record" }] });
    };
    await expect(createClerkDirectory(client).invite("x@example.com", "reviewer")).rejects.toMatchObject({ code: "conflict" });
    client.invitations.revokeInvitation = async () => {
      throw Object.assign(new Error("gone"), { status: 404, errors: [{ code: "resource_not_found" }] });
    };
    await expect(createClerkDirectory(client).revokeInvite("inv_9")).rejects.toMatchObject({ code: "not_found" });
    client.users.getUserList = async () => {
      throw new TypeError("fetch failed");
    };
    await expect(createClerkDirectory(client).list()).rejects.toMatchObject({ code: "unavailable" });
  });
});

describe("tryDirectory", () => {
  it("turns a directory error into an action result with a status, and lets other errors through", async () => {
    expect(
      await tryDirectory(async () => {
        throw new DirectoryError("conflict", "Already there.");
      }),
    ).toEqual({ ok: false, error: { status: 409, code: "conflict", message: "Already there." } });
    await expect(
      tryDirectory(async () => {
        throw new Error("bug");
      }),
    ).rejects.toThrow("bug");
  });
});
```

- [ ] **Step 2: Run the test to make sure it fails**

Run: `pnpm test tests/unit/users.test.ts`
Expected: FAIL to resolve `@/lib/users/clerk-directory`.

- [ ] **Step 3: Write the types and rules**

Create `src/lib/users/types.ts`:

```ts
import type { ActionResult } from "@/lib/actions/result";
import type { Role } from "@/lib/auth/roles";

/** Someone who can sign in (design §5): the role lives with their sign-in account; null means no access. */
export type DirectoryUser = { id: string; name: string; email: string; role: Role | null; twoFactor: boolean; lastSignInAt: string | null };
export type DirectoryInvite = { id: string; email: string; role: Role | null; createdAt: string };

export interface UserDirectory {
  list(): Promise<{ users: DirectoryUser[]; invites: DirectoryInvite[] }>;
  invite(email: string, role: Role): Promise<DirectoryInvite>;
  revokeInvite(id: string): Promise<{ revoked: true }>;
  setRole(userId: string, role: Role | null): Promise<DirectoryUser>;
}

export type DirectoryErrorCode = "invalid_input" | "conflict" | "not_found" | "unavailable";
const STATUS: Record<DirectoryErrorCode, number> = { invalid_input: 400, conflict: 409, not_found: 404, unavailable: 503 };

export class DirectoryError extends Error {
  constructor(
    readonly code: DirectoryErrorCode,
    message: string,
    readonly fields?: Record<string, string>,
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
    return { ok: false, error: { status: STATUS[error.code], code: error.code, message: error.message, ...(error.fields ? { fields: error.fields } : {}) } };
  }
}
```

Create `src/lib/users/rules.ts`:

```ts
import { z } from "zod";
import { DirectoryError } from "./types";

/** An email as people mean it: trimmed and lower-case. */
export const normalizeEmail = (email: string) => email.trim().toLowerCase();

const Email = z.email().max(254);

/** The invitation's email, tidied; a DirectoryError with a field message when it isn't an email address. */
export function validInviteEmail(email: string): string {
  const tidy = normalizeEmail(email);
  if (!Email.safeParse(tidy).success) throw new DirectoryError("invalid_input", "Enter an email address.", { email: "Enter an email address." });
  return tidy;
}

/** Already someone's sign-in, or already invited (Review Focus 3). */
export function alreadyKnown(email: string, users: { email: string }[], invites: { email: string }[]): boolean {
  const wanted = normalizeEmail(email);
  return [...users, ...invites].some((entry) => normalizeEmail(entry.email) === wanted);
}

/** Nobody changes their own access, so an Admin can't remove or demote the last Admin: themselves (Review Focus 1). */
export const canChangeAccess = (actorId: string, targetId: string) => actorId !== targetId;
```

- [ ] **Step 4: Write the test directory and the Clerk adapter**

Create `src/lib/users/mock-directory.ts`:

```ts
import type { Role } from "@/lib/auth/roles";
import { MOCK_USERS } from "@/lib/auth/mock-session";
import type { Session } from "@/lib/auth/types";
import { alreadyKnown, validInviteEmail } from "./rules";
import { DirectoryError, type DirectoryInvite, type DirectoryUser, type UserDirectory } from "./types";

type State = { users: Map<string, DirectoryUser>; invites: Map<string, DirectoryInvite>; sequence: number };

const REGISTRY = Symbol.for("articles-ai.mock-directories");
const SIGNED_IN_BEFORE = "2026-10-21T05:00:00.000Z";

/** One test directory per mock_store namespace (e2e tests use a fresh one each), seeded with the test users. */
function stateFor(namespace?: string): State {
  const holder = globalThis as unknown as Record<symbol, Map<string, State> | undefined>;
  const states = (holder[REGISTRY] ??= new Map<string, State>());
  const key = namespace && /^[A-Za-z0-9_-]{1,64}$/.test(namespace) ? namespace : "default";
  let state = states.get(key);
  if (!state) {
    state = {
      users: new Map(
        MOCK_USERS.map((user) => [
          user.userId,
          {
            id: user.userId,
            name: user.name,
            email: user.email,
            role: user.role,
            twoFactor: user.twoFactor,
            lastSignInAt: user.role ? SIGNED_IN_BEFORE : null,
          },
        ]),
      ),
      invites: new Map(),
      sequence: 0,
    };
    states.set(key, state);
  }
  return state;
}

export function createMockDirectory(namespace?: string): UserDirectory & {
  sessionOf(userId: string): Session | null;
  enableTwoFactor(userId: string): void;
} {
  const state = stateFor(namespace);

  return {
    async list() {
      return { users: structuredClone([...state.users.values()]), invites: structuredClone([...state.invites.values()]) };
    },

    async invite(email: string, role: Role) {
      const tidy = validInviteEmail(email);
      if (alreadyKnown(tidy, [...state.users.values()], [...state.invites.values()])) {
        throw new DirectoryError("conflict", "This person already has an account or an invitation.");
      }
      const invite: DirectoryInvite = { id: `inv_${++state.sequence}`, email: tidy, role, createdAt: new Date().toISOString() };
      state.invites.set(invite.id, invite);
      return structuredClone(invite);
    },

    async revokeInvite(id: string) {
      if (!state.invites.delete(id)) throw new DirectoryError("not_found", "This invitation no longer exists.");
      return { revoked: true as const };
    },

    async setRole(userId: string, role: Role | null) {
      const user = state.users.get(userId);
      if (!user) throw new DirectoryError("not_found", "This person no longer exists.");
      user.role = role;
      return structuredClone(user);
    },

    /** The session a test login gets: the directory's current role and two-factor status. */
    sessionOf(userId: string): Session | null {
      const user = state.users.get(userId);
      return user ? { userId: user.id, email: user.email, name: user.name, role: user.role, twoFactor: user.twoFactor } : null;
    },

    /** Stands in for setting up an authenticator app (test logins only). */
    enableTwoFactor(userId: string) {
      const user = state.users.get(userId);
      if (user) user.twoFactor = true;
    },
  };
}
```

Create `src/lib/users/clerk-directory.ts`:

```ts
import { isRole, type Role } from "@/lib/auth/roles";
import { alreadyKnown, validInviteEmail } from "./rules";
import { DirectoryError, type DirectoryInvite, type DirectoryUser, type UserDirectory } from "./types";

type ClerkUserRecord = {
  id: string;
  fullName: string | null;
  primaryEmailAddress: { emailAddress: string } | null;
  publicMetadata: Record<string, unknown> | null | undefined;
  twoFactorEnabled: boolean;
  lastSignInAt: number | null;
};
type ClerkInvitationRecord = { id: string; emailAddress: string; publicMetadata: Record<string, unknown> | null; createdAt: number };

/** The parts of Clerk's backend client the directory uses; `await clerkClient()` satisfies it structurally. */
export type ClerkDirectoryClient = {
  users: {
    getUserList(params: { limit: number; orderBy: "-created_at" }): Promise<{ data: ClerkUserRecord[] }>;
    updateUserMetadata(userId: string, params: { publicMetadata: Record<string, unknown> }): Promise<ClerkUserRecord>;
  };
  invitations: {
    getInvitationList(params: { status: "pending"; limit: number }): Promise<{ data: ClerkInvitationRecord[] }>;
    createInvitation(params: { emailAddress: string; publicMetadata: Record<string, unknown>; notify: boolean }): Promise<ClerkInvitationRecord>;
    revokeInvitation(invitationId: string): Promise<ClerkInvitationRecord>;
  };
};

const roleOf = (metadata: Record<string, unknown> | null | undefined): Role | null => (isRole(metadata?.role) ? (metadata?.role as Role) : null);
const isoOf = (ms: number | null) => (ms ? new Date(ms).toISOString() : null);

function toUser(user: ClerkUserRecord): DirectoryUser {
  const email = user.primaryEmailAddress?.emailAddress ?? "";
  return { id: user.id, name: user.fullName || email, email, role: roleOf(user.publicMetadata), twoFactor: user.twoFactorEnabled === true, lastSignInAt: isoOf(user.lastSignInAt) };
}

function toInvite(invitation: ClerkInvitationRecord): DirectoryInvite {
  return { id: invitation.id, email: invitation.emailAddress, role: roleOf(invitation.publicMetadata), createdAt: new Date(invitation.createdAt).toISOString() };
}

/** Clerk's API errors carry `status` and `errors[].code` (ClerkAPIResponseError); a thrown TypeError means no answer. */
function fromClerk(error: unknown): DirectoryError {
  if (error instanceof DirectoryError) return error;
  const record = (typeof error === "object" && error !== null ? error : {}) as { status?: unknown; errors?: { code?: unknown }[] };
  const code = record.errors?.[0]?.code;
  if (code === "duplicate_record" || code === "form_identifier_exists") {
    return new DirectoryError("conflict", "This person already has an account or an invitation.");
  }
  if (record.status === 404) return new DirectoryError("not_found", "This person or invitation no longer exists.");
  return new DirectoryError("unavailable", "The sign-in service can't be reached right now. Try again shortly.");
}

async function guarded<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw fromClerk(error);
  }
}

/** Users and roles in Clerk (design §5: the role lives in public metadata; invitations carry it to the new account). */
export function createClerkDirectory(client: ClerkDirectoryClient): UserDirectory {
  async function list() {
    return guarded(async () => {
      const [users, invites] = await Promise.all([
        client.users.getUserList({ limit: 100, orderBy: "-created_at" }),
        client.invitations.getInvitationList({ status: "pending", limit: 100 }),
      ]);
      return { users: users.data.map(toUser), invites: invites.data.map(toInvite) };
    });
  }

  return {
    list,

    async invite(email: string, role: Role) {
      const tidy = validInviteEmail(email);
      const { users, invites } = await list();
      if (alreadyKnown(tidy, users, invites)) throw new DirectoryError("conflict", "This person already has an account or an invitation.");
      return guarded(async () => toInvite(await client.invitations.createInvitation({ emailAddress: tidy, publicMetadata: { role }, notify: true })));
    },

    async revokeInvite(id: string) {
      return guarded(async () => {
        await client.invitations.revokeInvitation(id);
        return { revoked: true as const };
      });
    },

    async setRole(userId: string, role: Role | null) {
      // Clerk deep-merges metadata; a null value removes the key.
      return guarded(async () => toUser(await client.users.updateUserMetadata(userId, { publicMetadata: { role } })));
    },
  };
}
```

Create `src/lib/users/directory.ts`:

```ts
import "server-only";
import { cookies } from "next/headers";
import { MOCK_STORE_COOKIE } from "@/lib/engine/mock/registry";
import { MOCK_SCENARIO_COOKIE } from "@/lib/engine/mock/server";
import { serverEnv } from "@/lib/env";
import { createClerkDirectory } from "./clerk-directory";
import { createMockDirectory } from "./mock-directory";
import { DirectoryError, type UserDirectory } from "./types";

/** Test logins only: the mock scenario in which the sign-in service can't be reached (Review Focus 4). The engine stays normal. */
const SIGNIN_DOWN = "signin_down";

/** The users behind this dashboard: Clerk's in Clerk mode, the test directory (per mock_store namespace) otherwise. */
export async function getDirectory(): Promise<UserDirectory> {
  if (serverEnv().authMode === "mock") {
    const jar = await cookies();
    if (jar.get(MOCK_SCENARIO_COOKIE)?.value === SIGNIN_DOWN) return unreachableDirectory();
    return createMockDirectory(jar.get(MOCK_STORE_COOKIE)?.value);
  }
  const { clerkClient } = await import("@clerk/nextjs/server");
  return createClerkDirectory(await clerkClient());
}

function unreachableDirectory(): UserDirectory {
  const fail = async (): Promise<never> => {
    throw new DirectoryError("unavailable", "The sign-in service can't be reached right now. Try again shortly.");
  };
  return { list: fail, invite: fail, revokeInvite: fail, setRole: fail };
}
```

`signin_down` isn't one of the engine's scenarios (`isMockScenario` doesn't know it), so with it set the mock engine runs `normal`. Only the directory changes.

If `typecheck` reports that Clerk's client doesn't match `ClerkDirectoryClient` (for example a narrower `orderBy` union or a differently named field), adjust `ClerkDirectoryClient` to Clerk's exact signatures in `@clerk/backend`, not the other way round. Ledger the change as a ruling.

- [ ] **Step 5: Let mock sessions follow the directory**

In `src/lib/auth/session.ts`:
- Add the imports `import { MOCK_STORE_COOKIE } from "@/lib/engine/mock/registry";` and `import { createMockDirectory } from "@/lib/users/mock-directory";`.
- Replace the mock branch of `getSession`

  ```ts
    if (serverEnv().authMode === "mock") {
      return decodeMockSession((await cookies()).get(MOCK_SESSION_COOKIE)?.value);
    }
  ```

  with

  ```ts
    if (serverEnv().authMode === "mock") {
      // The cookie names a fixed test user; their current role and two-factor status come from the test directory,
      // so a change on /users takes effect on the person's next request, as it does with Clerk.
      const jar = await cookies();
      const user = decodeMockSession(jar.get(MOCK_SESSION_COOKIE)?.value);
      return user ? createMockDirectory(jar.get(MOCK_STORE_COOKIE)?.value).sessionOf(user.userId) : null;
    }
  ```

- [ ] **Step 6: Run the tests to make sure they pass**

Run: `pnpm test tests/unit/users.test.ts tests/unit/session.test.ts tests/unit/auth.test.ts`
Expected: PASS (users 13 tests; the session and auth tests still pass).

- [ ] **Step 7: Lint, typecheck, the whole unit suite and the auth e2e**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm e2e tests/e2e/auth.spec.ts`
Expected: lint and typecheck exit 0; every unit test and the auth e2e pass.

- [ ] **Step 8: Commit**

```bash
git add src/lib/users src/lib/auth/session.ts tests/unit/users.test.ts
git commit -m "feat: the user directory: rules, a namespaced test directory, and the Clerk adapter"
```

---

### Task 3: The Users page: roles, invitations, and the sign-in service being down

**Files:**
- Create:
  - `src/app/[locale]/(app)/users/actions.ts`, `src/app/[locale]/(app)/users/page.tsx`
  - `src/components/users/users-view.tsx`, `src/components/users/users-board.tsx`
- Modify:
  - `src/components/shell/nav.ts`
  - `messages/en.json`, `messages/ar.json`
  - `tests/e2e/helpers.ts`
- Test:
  - create: `tests/unit/users-actions.test.ts`, `tests/e2e/users.spec.ts`
  - modify: `tests/unit/nav.test.ts`

**Interfaces:**
- Consumes:
  - Task 2: `getDirectory`, `tryDirectory`, `canChangeAccess`, `DirectoryUser`, `DirectoryInvite`, the `signin_down` scenario
  - Task 1: `requirePermission` (with `userId` on the session)
  - M2a: `useEngineAction`, `INVALID`, `Locale`, `IdempotencyKey`
  - M1: `formatDateTime`, `formatDate`, `SectionSkeleton`, `ROLES`, `isRole`
- Produces:
  - **Actions:**
    - `inviteUserAction({ locale, email, role, idempotencyKey })` → `ActionResult<DirectoryInvite>`
    - `revokeInviteAction({ locale, inviteId, idempotencyKey })` → `ActionResult<{ revoked: true }>`
    - `setUserRoleAction({ locale, userId, role: Role | null, idempotencyKey })` → `ActionResult<DirectoryUser>`; refused with code `self` for the Admin's own row
    - all three check `users.manage` and refresh the page after a success
  - **Nav:** a `users` item (`/users`, `users.manage`) before Settings
  - **Test ids:**
    - **people:**
      - `user-{id}`, `user-you-{id}`, `user-twofactor-{id}`, `user-last-{id}`
      - `user-role-{id}` (a select: `admin`, `reviewer`, `none`), `user-apply-{id}`, `user-changed-{id}`, `user-error-{id}`
    - **invite form:** `invite-email`, `invite-role`, `invite-submit`, `invite-sent`, `invite-email-error`, `invite-error`
    - **pending invitations:** `pending-invite-{id}`, `pending-revoke-{id}`, `invites-empty`, `invites-error`
    - **page:** `users-unavailable`, `users-test-notice`
  - **`setMockScenario`:** accepts `"signin_down"`

- [ ] **Step 1: Write the failing unit tests**

Create `tests/unit/users-actions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DirectoryError } from "@/lib/users/types";

const directory = { list: vi.fn(), invite: vi.fn(), revokeInvite: vi.fn(), setRole: vi.fn() };
const refresh = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh }));
const requirePermission = vi.fn(async () => ({ userId: "user_admin", email: "admin@example.com", name: "Admin", role: "admin", twoFactor: true }));
vi.mock("@/lib/auth/session", () => ({ requirePermission }));
vi.mock("@/lib/users/directory", () => ({ getDirectory: async () => directory }));

const { inviteUserAction, revokeInviteAction, setUserRoleAction } = await import("@/app/[locale]/(app)/users/actions");

const key = "key-12345678";

beforeEach(() => {
  vi.clearAllMocks();
  directory.invite.mockResolvedValue({ id: "inv_1", email: "new@example.com", role: "reviewer", createdAt: "2026-10-21T08:00:00.000Z" });
  directory.revokeInvite.mockResolvedValue({ revoked: true });
  directory.setRole.mockResolvedValue({ id: "user_2", name: "Omar", email: "omar@example.com", role: null, twoFactor: false, lastSignInAt: null });
});

describe("users actions are for admins (design §5: users.manage)", () => {
  it("checks users.manage before every change, and refreshes the page after a success", async () => {
    await inviteUserAction({ locale: "en", email: "new@example.com", role: "reviewer", idempotencyKey: key });
    await revokeInviteAction({ locale: "en", inviteId: "inv_1", idempotencyKey: key });
    await setUserRoleAction({ locale: "ar", userId: "user_2", role: null, idempotencyKey: key });
    expect(requirePermission.mock.calls).toEqual([
      ["en", "users.manage"],
      ["en", "users.manage"],
      ["ar", "users.manage"],
    ]);
    expect(directory.invite).toHaveBeenCalledWith("new@example.com", "reviewer");
    expect(directory.revokeInvite).toHaveBeenCalledWith("inv_1");
    expect(directory.setRole).toHaveBeenCalledWith("user_2", null);
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it("refuses an Admin's change to their own access, without asking the directory (Review Focus 1)", async () => {
    expect(await setUserRoleAction({ locale: "en", userId: "user_admin", role: "reviewer", idempotencyKey: key })).toEqual({
      ok: false,
      error: { status: 403, code: "self", message: "You can't change your own access." },
    });
    expect(directory.setRole).not.toHaveBeenCalled();
  });

  it("refuses a malformed id or role without asking the directory", async () => {
    for (const userId of ["..", "a/b", "user_1?x=1", ""]) {
      expect(await setUserRoleAction({ locale: "en", userId, role: "admin", idempotencyKey: key })).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    }
    expect(await setUserRoleAction({ locale: "en", userId: "user_2", role: "owner" as never, idempotencyKey: key })).toMatchObject({
      ok: false,
      error: { code: "invalid_input" },
    });
    expect(await revokeInviteAction({ locale: "en", inviteId: "../users", idempotencyKey: key })).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(await inviteUserAction({ locale: "en", email: "x@example.com", role: "owner" as never, idempotencyKey: key })).toMatchObject({
      ok: false,
      error: { code: "invalid_input" },
    });
    expect(directory.setRole).not.toHaveBeenCalled();
    expect(directory.revokeInvite).not.toHaveBeenCalled();
    expect(directory.invite).not.toHaveBeenCalled();
  });

  it("returns the directory's refusal with its status, and doesn't refresh (Review Focus 3 and 4)", async () => {
    directory.invite.mockRejectedValue(new DirectoryError("conflict", "This person already has an account or an invitation."));
    expect(await inviteUserAction({ locale: "en", email: "Omar@example.com", role: "reviewer", idempotencyKey: key })).toEqual({
      ok: false,
      error: { status: 409, code: "conflict", message: "This person already has an account or an invitation." },
    });
    directory.invite.mockRejectedValue(new DirectoryError("invalid_input", "Enter an email address.", { email: "Enter an email address." }));
    expect(await inviteUserAction({ locale: "en", email: "not-an-email", role: "reviewer", idempotencyKey: key })).toMatchObject({
      ok: false,
      error: { status: 400, code: "invalid_input", fields: { email: "Enter an email address." } },
    });
    directory.setRole.mockRejectedValue(new DirectoryError("unavailable", "The sign-in service can't be reached right now. Try again shortly."));
    expect(await setUserRoleAction({ locale: "en", userId: "user_2", role: "reviewer", idempotencyKey: key })).toMatchObject({
      ok: false,
      error: { status: 503, code: "unavailable" },
    });
    expect(refresh).not.toHaveBeenCalled();
  });
});
```

In `tests/unit/nav.test.ts`, append inside `describe("visibleNavItems", …)`:

```ts
  it("shows Users to admins only, before Settings (design §7 /users)", () => {
    expect(visibleNavItems("reviewer").map((item) => item.key)).not.toContain("users");
    expect(NAV_ITEMS.find((item) => item.key === "users")).toEqual({ key: "users", href: "/users", permission: "users.manage" });
    const keys = NAV_ITEMS.map((item) => item.key);
    expect(keys.indexOf("users")).toBe(keys.indexOf("settings") - 1);
  });
```

- [ ] **Step 2: Run the tests to make sure they fail**

Run: `pnpm test tests/unit/users-actions.test.ts tests/unit/nav.test.ts`
Expected: FAIL.
- `users-actions.test.ts` fails to resolve `@/app/[locale]/(app)/users/actions`.
- `nav.test.ts` fails because there's no `users` item.

- [ ] **Step 3: Write the actions and the nav item**

Create `src/app/[locale]/(app)/users/actions.ts`:

```ts
"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/actions/result";
import { IdempotencyKey, INVALID, Locale } from "@/lib/actions/server";
import { ROLES, type Role } from "@/lib/auth/roles";
import { requirePermission } from "@/lib/auth/session";
import { getDirectory } from "@/lib/users/directory";
import { canChangeAccess } from "@/lib/users/rules";
import { tryDirectory, type DirectoryInvite, type DirectoryUser } from "@/lib/users/types";

// Ids go into Clerk API paths: letters, digits, "_" and "-" only.
const DirectoryId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const RoleChoice = z.enum(ROLES);
const SELF = { ok: false as const, error: { status: 403, code: "self", message: "You can't change your own access." } };

// The idempotency key from useEngineAction is checked but not sent: Clerk takes none, and each change here is safe to
// repeat (a second invitation to the same email is refused as a duplicate; setting the same role twice changes nothing).

/** Design §5: the Admin invites someone by email with a role; the role reaches their account when they sign up. */
export async function inviteUserAction(input: { locale: string; email: string; role: Role; idempotencyKey: string }): Promise<ActionResult<DirectoryInvite>> {
  const parsed = z.object({ locale: Locale, email: z.string().max(320), role: RoleChoice, idempotencyKey: IdempotencyKey }).safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, email, role } = parsed.data;
  await requirePermission(locale, "users.manage");
  const result = await tryDirectory(async () => (await getDirectory()).invite(email, role));
  if (result.ok) refresh();
  return result;
}

export async function revokeInviteAction(input: { locale: string; inviteId: string; idempotencyKey: string }): Promise<ActionResult<{ revoked: true }>> {
  const parsed = z.object({ locale: Locale, inviteId: DirectoryId, idempotencyKey: IdempotencyKey }).safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, inviteId } = parsed.data;
  await requirePermission(locale, "users.manage");
  const result = await tryDirectory(async () => (await getDirectory()).revokeInvite(inviteId));
  if (result.ok) refresh();
  return result;
}

/** Admin, Reviewer, or no access (null). Nobody changes their own access (Review Focus 1). */
export async function setUserRoleAction(input: {
  locale: string;
  userId: string;
  role: Role | null;
  idempotencyKey: string;
}): Promise<ActionResult<DirectoryUser>> {
  const parsed = z.object({ locale: Locale, userId: DirectoryId, role: RoleChoice.nullable(), idempotencyKey: IdempotencyKey }).safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, userId, role } = parsed.data;
  const session = await requirePermission(locale, "users.manage");
  if (!canChangeAccess(session.userId, userId)) return SELF;
  const result = await tryDirectory(async () => (await getDirectory()).setRole(userId, role));
  if (result.ok) refresh();
  return result;
}
```

In `src/components/shell/nav.ts`, insert before the comment line `// The four settings pages share one item; it's highlighted on any of them.`:

```ts
  { key: "users", href: "/users", permission: "users.manage" },
```

- [ ] **Step 4: Run the unit tests to make sure they pass**

Run: `pnpm test tests/unit/users-actions.test.ts tests/unit/nav.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the messages**

Merge into `messages/en.json`:
- at `Shell.nav`: `{ "users": "Users" }`
- at the top level:

```json
{
  "Users": {
    "title": "Users",
    "intro": "Everyone who can sign in to this dashboard. Admins manage settings and users; Reviewers work on content.",
    "testNotice": "Test logins: invitations are listed here, but no email is sent and they can't be accepted.",
    "people": "People",
    "table": { "person": "Person", "twoFactor": "Two-factor login", "lastSignIn": "Last sign-in", "access": "Access" },
    "roles": { "admin": "Admin", "reviewer": "Reviewer", "none": "No access" },
    "you": "You",
    "selfHint": "You can't change your own access.",
    "twoFactorOn": "On",
    "twoFactorOff": "Off",
    "never": "Never",
    "apply": "Apply",
    "changed": "Access updated.",
    "invite": {
      "title": "Invite someone",
      "hint": "They get an email from the sign-in service with a link to create their account, with this role.",
      "email": "Email",
      "role": "Role",
      "submit": "Send invitation",
      "sent": "Invitation sent to {email}."
    },
    "invites": { "title": "Pending invitations", "empty": "No pending invitations.", "sentOn": "Sent {date}", "revoke": "Revoke" },
    "errors": {
      "invalidEmail": "Enter an email address.",
      "conflict": "This person already has an account or an invitation.",
      "not_found": "This person or invitation no longer exists. Reload the page.",
      "unavailable": "The sign-in service can't be reached right now. Try again shortly.",
      "self": "You can't change your own access.",
      "network_error": "The server could not be reached. Try again shortly."
    }
  }
}
```

Merge into `messages/ar.json`:
- at `Shell.nav`: `{ "users": "المستخدمون" }`
- at the top level:

```json
{
  "Users": {
    "title": "المستخدمون",
    "intro": "كل من يمكنه تسجيل الدخول إلى لوحة التحكم هذه. يدير المسؤولون الإعدادات والمستخدمين، ويعمل المراجعون على المحتوى.",
    "testNotice": "تسجيلات الدخول التجريبية: تظهر الدعوات هنا، لكن لا يُرسل أي بريد ولا يمكن قبولها.",
    "people": "الأشخاص",
    "table": { "person": "الشخص", "twoFactor": "تسجيل الدخول بخطوتين", "lastSignIn": "آخر تسجيل دخول", "access": "الصلاحية" },
    "roles": { "admin": "مسؤول", "reviewer": "مراجع", "none": "بلا صلاحية" },
    "you": "أنت",
    "selfHint": "لا يمكنك تغيير صلاحيتك بنفسك.",
    "twoFactorOn": "مفعّل",
    "twoFactorOff": "غير مفعّل",
    "never": "لم يسجّل الدخول بعد",
    "apply": "تطبيق",
    "changed": "تم تحديث الصلاحية.",
    "invite": {
      "title": "دعوة شخص",
      "hint": "تصله رسالة من خدمة تسجيل الدخول برابط لإنشاء حسابه بهذا الدور.",
      "email": "البريد الإلكتروني",
      "role": "الدور",
      "submit": "إرسال الدعوة",
      "sent": "تم إرسال الدعوة إلى {email}."
    },
    "invites": { "title": "الدعوات المعلّقة", "empty": "لا توجد دعوات معلّقة.", "sentOn": "أُرسلت {date}", "revoke": "إلغاء الدعوة" },
    "errors": {
      "invalidEmail": "أدخل عنوان بريد إلكتروني.",
      "conflict": "لدى هذا الشخص حساب أو دعوة بالفعل.",
      "not_found": "لم يعد هذا الشخص أو هذه الدعوة موجودًا. أعد تحميل الصفحة.",
      "unavailable": "تعذّر الوصول إلى خدمة تسجيل الدخول الآن. حاول مرة أخرى بعد قليل.",
      "self": "لا يمكنك تغيير صلاحيتك بنفسك.",
      "network_error": "تعذّر الوصول إلى الخادم. حاول مرة أخرى بعد قليل."
    }
  }
}
```

- [ ] **Step 6: Write the failing e2e test**

In `tests/e2e/helpers.ts`, add `| "signin_down"` to the end of `setMockScenario`'s scenario union, after `"performance"`.

Create `tests/e2e/users.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { isolateMockStore, normalizeSpaces, pageInSharedStore, setMockScenario, signInWithCookie } from "./helpers";

test.beforeEach(async ({ context }) => {
  await isolateMockStore(context);
});

test("an admin sees everyone who can sign in, with role, two-factor status and last sign-in", async ({ page, context }) => {
  await signInWithCookie(context, "dev_admin");
  await page.goto("/en/users");
  await expect(page.getByTestId("nav-users")).toBeVisible();
  await expect(page.getByTestId("user-dev_reviewer")).toContainText("reviewer@example.com");
  await expect(page.getByTestId("user-role-dev_reviewer")).toHaveValue("reviewer");
  await expect(page.getByTestId("user-role-dev_norole")).toHaveValue("none");
  await expect(page.getByTestId("user-twofactor-dev_admin")).toHaveText("On");
  await expect(page.getByTestId("user-twofactor-dev_reviewer")).toHaveText("Off");
  expect(normalizeSpaces(await page.getByTestId("user-last-dev_reviewer").innerText())).toBe("Wed, Oct 21, 9:00 AM");
  await expect(page.getByTestId("user-last-dev_norole")).toHaveText("Never");
  await expect(page.getByTestId("users-test-notice")).toBeVisible();
});

test("an admin can't change their own access (Review Focus 1)", async ({ page, context }) => {
  await signInWithCookie(context, "dev_admin");
  await page.goto("/en/users");
  await expect(page.getByTestId("user-you-dev_admin")).toBeVisible();
  await expect(page.getByTestId("user-role-dev_admin")).toBeDisabled();
  await expect(page.getByTestId("user-apply-dev_admin")).toBeDisabled();
  await expect(page.getByTestId("user-role-dev_reviewer")).toBeEnabled();
});

test("removing a reviewer's access takes effect on their next page; giving it back lets them in (Review Focus 1)", async ({ browser }) => {
  const store = `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const admin = await pageInSharedStore(browser, store, "dev_admin");
  const reviewer = await pageInSharedStore(browser, store, "dev_reviewer");
  await reviewer.goto("/en");
  await expect(reviewer.getByTestId("user-role")).toHaveText("Reviewer");

  await admin.goto("/en/users");
  await admin.getByTestId("user-role-dev_reviewer").selectOption("none");
  await admin.getByTestId("user-apply-dev_reviewer").click();
  await expect(admin.getByTestId("user-changed-dev_reviewer")).toBeVisible();
  await reviewer.goto("/en/keywords");
  await expect(reviewer).toHaveURL(/\/en\/no-access$/);

  await admin.getByTestId("user-role-dev_reviewer").selectOption("reviewer");
  await admin.getByTestId("user-apply-dev_reviewer").click();
  await expect(admin.getByTestId("user-changed-dev_reviewer")).toBeVisible();
  await reviewer.goto("/en");
  await expect(reviewer).toHaveURL(/\/en$/);
  await expect(reviewer.getByTestId("user-role")).toHaveText("Reviewer");
});

test("an admin invites by email with a role, can't invite the same person twice in any capitalisation, and revokes (Review Focus 3)", async ({
  page,
  context,
}) => {
  await signInWithCookie(context, "dev_admin");
  await page.goto("/en/users");
  await expect(page.getByTestId("invites-empty")).toBeVisible();

  await page.getByTestId("invite-email").fill("  New.Person@Example.com ");
  await page.getByTestId("invite-role").selectOption("admin");
  await page.getByTestId("invite-submit").click();
  await expect(page.getByTestId("invite-sent")).toHaveText("Invitation sent to new.person@example.com.");
  await expect(page.getByTestId("pending-invite-inv_1")).toContainText("new.person@example.com");
  await expect(page.getByTestId("pending-invite-inv_1")).toContainText("Admin");

  await page.getByTestId("invite-email").fill("NEW.PERSON@example.com");
  await page.getByTestId("invite-submit").click();
  await expect(page.getByTestId("invite-error")).toHaveText("This person already has an account or an invitation.");
  await page.getByTestId("invite-email").fill("Reviewer@Example.com");
  await page.getByTestId("invite-submit").click();
  await expect(page.getByTestId("invite-error")).toHaveText("This person already has an account or an invitation.");
  await expect(page.locator('[data-testid^="pending-invite-"]')).toHaveCount(1);

  await page.getByTestId("pending-revoke-inv_1").click();
  await expect(page.getByTestId("pending-invite-inv_1")).toHaveCount(0);
  await expect(page.getByTestId("invites-empty")).toBeVisible();
});

test("an address that isn't an email gets a message next to the field (Review Focus 3)", async ({ page, context }) => {
  await signInWithCookie(context, "dev_admin");
  await page.goto("/en/users");
  await page.getByTestId("invite-email").fill("not-an-email");
  await page.getByTestId("invite-submit").click();
  await expect(page.getByTestId("invite-email-error")).toHaveText("Enter an email address.");
  await expect(page.getByTestId("invite-email")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByTestId("invites-empty")).toBeVisible();
});

test("a reviewer has no Users item and is sent back from /users", async ({ page, context }) => {
  await signInWithCookie(context, "dev_reviewer");
  await page.goto("/en/users");
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.getByTestId("nav-users")).toHaveCount(0);
});

test("when the sign-in service can't be reached, the page says so instead of crashing (Review Focus 4)", async ({ page, context }) => {
  await signInWithCookie(context, "dev_admin");
  await setMockScenario(context, "signin_down");
  await page.goto("/en/users");
  await expect(page.getByTestId("users-unavailable")).toHaveText("The sign-in service can't be reached right now. Try again shortly.");
  await expect(page.getByTestId("nav-users")).toBeVisible();
});

test("the Users page in Arabic: right to left, Arabic labels, Latin digits", async ({ page, context }) => {
  await signInWithCookie(context, "dev_admin");
  await page.goto("/ar/users");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { level: 1, name: "المستخدمون" })).toBeVisible();
  await expect(page.getByTestId("user-twofactor-dev_admin")).toHaveText("مفعّل");
  await expect(page.getByTestId("user-role-dev_norole").locator("option:checked")).toHaveText("بلا صلاحية");
  const last = normalizeSpaces(await page.getByTestId("user-last-dev_reviewer").innerText());
  expect(last).toContain("9:00");
  expect(last).not.toMatch(/[٠-٩]/);
});
```

Run: `pnpm e2e tests/e2e/users.spec.ts`
Expected: FAIL. `/en/users` is a 404, so `nav-users` and the user rows aren't found. The reviewer test fails on the URL too.

- [ ] **Step 7: Write the page and its components**

Create `src/app/[locale]/(app)/users/page.tsx`:

```tsx
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SectionSkeleton } from "@/components/dashboard/section-skeleton";
import { UsersView } from "@/components/users/users-view";
import { asAppLocale } from "@/i18n/locales";

export default async function UsersPage({ params }: PageProps<"/[locale]/users">) {
  const locale = asAppLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("Users");
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-3xl">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("intro")}</p>
      </div>
      <Suspense fallback={<SectionSkeleton />}>
        <UsersView locale={locale} />
      </Suspense>
    </div>
  );
}
```

Create `src/components/users/users-view.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/locales";
import { requirePermission } from "@/lib/auth/session";
import { getEngine } from "@/lib/engine";
import { tryEngine } from "@/lib/engine/result";
import { serverEnv } from "@/lib/env";
import { formatDate, formatDateTime } from "@/lib/format/datetime";
import { getDirectory } from "@/lib/users/directory";
import { tryDirectory } from "@/lib/users/types";
import { UsersBoard } from "./users-board";

/** Design §7 /users (Admin): everyone who can sign in, with role, two-factor status and last sign-in; invitations (design §5). */
export async function UsersView({ locale }: { locale: AppLocale }) {
  const session = await requirePermission(locale, "users.manage");
  const t = await getTranslations("Users");
  const listed = await tryDirectory(async () => (await getDirectory()).list());
  if (!listed.ok) {
    return (
      <div role="alert" data-testid="users-unavailable" className="rounded-lg border border-bad-fg/30 bg-bad-bg p-4 text-sm text-bad-fg">
        {t.has(`errors.${listed.error.code}`) ? t(`errors.${listed.error.code}`) : listed.error.message}
      </div>
    );
  }

  // Times in the site's timezone, as everywhere else (M1); UTC when the engine can't say.
  const engine = await getEngine();
  const site = await tryEngine(() => engine.siteTimezone());
  const timeZone = site.ok ? site.data.timezone : "UTC";

  return (
    <UsersBoard
      locale={locale}
      selfId={session.userId}
      testLogins={serverEnv().authMode === "mock"}
      users={listed.data.users.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        twoFactor: user.twoFactor,
        lastSignIn: user.lastSignInAt ? formatDateTime(user.lastSignInAt, { timeZone, locale }) : null,
      }))}
      invites={listed.data.invites.map((invite) => ({
        id: invite.id,
        email: invite.email,
        role: invite.role,
        sentOn: formatDate(invite.createdAt, { timeZone, locale }),
      }))}
    />
  );
}
```

Create `src/components/users/users-board.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { inviteUserAction, revokeInviteAction, setUserRoleAction } from "@/app/[locale]/(app)/users/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEngineAction } from "@/lib/actions/use-engine-action";
import { isRole, ROLES, type Role } from "@/lib/auth/roles";
import type { EngineFailure } from "@/lib/engine/result";

const SELECT = "h-9 rounded-md border border-input bg-card px-3 text-sm disabled:opacity-50";
const NONE = "none";

export type UserRow = { id: string; name: string; email: string; role: Role | null; twoFactor: boolean; lastSignIn: string | null };
export type InviteRow = { id: string; email: string; role: Role | null; sentOn: string };

type Props = { locale: string; selfId: string; testLogins: boolean; users: UserRow[]; invites: InviteRow[] };

/** Design §7 /users: change someone's access, invite by email with a role, revoke a pending invitation. */
export function UsersBoard({ locale, selfId, testLogins, users, invites }: Props) {
  const t = useTranslations("Users");
  // Which row's change went through last; kept here because a row remounts when its role comes back changed.
  const [changed, setChanged] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-6">
      {testLogins && (
        <p data-testid="users-test-notice" className="text-sm text-muted-foreground">
          {t("testNotice")}
        </p>
      )}
      <Card>
        <CardHeader>
          <CardTitle>{t("people")}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th className="pb-2 pe-4 text-start font-medium">{t("table.person")}</th>
                <th className="pb-2 pe-4 text-start font-medium">{t("table.twoFactor")}</th>
                <th className="pb-2 pe-4 text-start font-medium">{t("table.lastSignIn")}</th>
                <th className="pb-2 text-start font-medium">{t("table.access")}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <UserRowView
                  key={`${user.id}:${user.role ?? NONE}`}
                  locale={locale}
                  user={user}
                  self={user.id === selfId}
                  changed={changed === user.id}
                  onStart={() => setChanged(null)}
                  onDone={() => setChanged(user.id)}
                />
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <InviteForm locale={locale} />
      <PendingInvites locale={locale} invites={invites} />
    </div>
  );
}

function useFailureText() {
  const t = useTranslations("Users.errors");
  return (error: EngineFailure) => (t.has(error.code) ? t(error.code) : error.message);
}

type RowProps = { locale: string; user: UserRow; self: boolean; changed: boolean; onStart: () => void; onDone: () => void };

function UserRowView({ locale, user, self, changed, onStart, onDone }: RowProps) {
  const t = useTranslations("Users");
  const failureText = useFailureText();
  const setRole = useEngineAction(setUserRoleAction);
  const current = user.role ?? NONE;
  const [choice, setChoice] = useState<string>(current);
  const [error, setError] = useState<EngineFailure | null>(null);

  async function apply() {
    setError(null);
    onStart();
    const result = await setRole.run({ locale, userId: user.id, role: isRole(choice) ? choice : null });
    if (result.ok) onDone();
    else setError(result.error);
  }

  return (
    <tr data-testid={`user-${user.id}`} className="border-t border-border align-top">
      <td className="py-3 pe-4">
        <p className="flex items-center gap-2 font-medium">
          {user.name}
          {self && (
            <Badge variant="secondary" data-testid={`user-you-${user.id}`}>
              {t("you")}
            </Badge>
          )}
        </p>
        <p className="text-muted-foreground">
          <bdi>{user.email}</bdi>
        </p>
      </td>
      <td className="py-3 pe-4" data-testid={`user-twofactor-${user.id}`}>
        {user.twoFactor ? t("twoFactorOn") : t("twoFactorOff")}
      </td>
      <td className="py-3 pe-4" data-testid={`user-last-${user.id}`}>
        {user.lastSignIn ?? t("never")}
      </td>
      <td className="py-3">
        <div className="flex items-center gap-2">
          <select
            aria-label={t("table.access")}
            data-testid={`user-role-${user.id}`}
            className={SELECT}
            disabled={self || setRole.pending}
            value={choice}
            onChange={(event) => setChoice(event.target.value)}
          >
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {t(`roles.${role}`)}
              </option>
            ))}
            <option value={NONE}>{t("roles.none")}</option>
          </select>
          <Button
            size="sm"
            variant="outline"
            data-testid={`user-apply-${user.id}`}
            disabled={self || setRole.pending || choice === current}
            onClick={() => void apply()}
          >
            {t("apply")}
          </Button>
        </div>
        {self && <p className="mt-1 text-xs text-muted-foreground">{t("selfHint")}</p>}
        {changed && (
          <p role="status" data-testid={`user-changed-${user.id}`} className="mt-1 text-sm text-ok-fg">
            {t("changed")}
          </p>
        )}
        {error && (
          <p role="alert" data-testid={`user-error-${user.id}`} className="mt-1 text-sm text-bad-fg">
            {failureText(error)}
          </p>
        )}
      </td>
    </tr>
  );
}

function InviteForm({ locale }: { locale: string }) {
  const t = useTranslations("Users");
  const failureText = useFailureText();
  const invite = useEngineAction(inviteUserAction);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("reviewer");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<EngineFailure | null>(null);
  const fieldError = error?.fields?.email ? t("errors.invalidEmail") : null;

  async function submit() {
    setError(null);
    setSentTo(null);
    const result = await invite.run({ locale, email, role: inviteRole });
    if (result.ok) {
      setSentTo(result.data.email);
      setEmail("");
    } else {
      setError(result.error);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("invite.title")}</CardTitle>
        <CardDescription>{t("invite.hint")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <form
          noValidate
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="flex min-w-64 flex-1 flex-col gap-1.5">
            <Label htmlFor="invite-email">{t("invite.email")}</Label>
            <Input
              id="invite-email"
              data-testid="invite-email"
              type="email"
              dir="ltr"
              autoComplete="off"
              value={email}
              aria-invalid={fieldError ? true : undefined}
              aria-describedby={fieldError ? "invite-email-error" : undefined}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-role">{t("invite.role")}</Label>
            <select
              id="invite-role"
              data-testid="invite-role"
              className={SELECT}
              value={inviteRole}
              onChange={(event) => {
                if (isRole(event.target.value)) setInviteRole(event.target.value);
              }}
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {t(`roles.${role}`)}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" data-testid="invite-submit" disabled={invite.pending || email.trim() === ""}>
            {t("invite.submit")}
          </Button>
        </form>
        {fieldError && (
          <p id="invite-email-error" data-testid="invite-email-error" className="text-sm text-bad-fg">
            {fieldError}
          </p>
        )}
        {error && !fieldError && (
          <p role="alert" data-testid="invite-error" className="text-sm text-bad-fg">
            {failureText(error)}
          </p>
        )}
        {sentTo && (
          <p role="status" data-testid="invite-sent" className="text-sm text-ok-fg">
            {t("invite.sent", { email: sentTo })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function PendingInvites({ locale, invites }: { locale: string; invites: InviteRow[] }) {
  const t = useTranslations("Users");
  const failureText = useFailureText();
  const revoke = useEngineAction(revokeInviteAction);
  const [error, setError] = useState<EngineFailure | null>(null);

  async function revokeOne(inviteId: string) {
    setError(null);
    const result = await revoke.run({ locale, inviteId });
    if (!result.ok) setError(result.error);
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
                </span>
                <Button size="sm" variant="outline" data-testid={`pending-revoke-${invite.id}`} disabled={revoke.pending} onClick={() => void revokeOne(invite.id)}>
                  {t("invites.revoke")}
                </Button>
              </li>
            ))}
          </ul>
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

- [ ] **Step 8: Run the e2e test to make sure it passes**

Run: `pnpm e2e tests/e2e/users.spec.ts`
Expected: PASS (8 tests).

- [ ] **Step 9: Lint, typecheck, the whole unit suite and the shell e2e**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm e2e tests/e2e/shell.spec.ts tests/e2e/auth.spec.ts`
Expected:
- lint and typecheck exit 0 (`next typegen` makes `PageProps<"/[locale]/users">`)
- every unit test passes, including `messages.test.ts` (same keys in both files)
- the shell and auth e2e pass

- [ ] **Step 10: Commit**

```bash
git add "src/app/[locale]/(app)/users" src/components/users src/components/shell/nav.ts messages tests/unit/users-actions.test.ts tests/unit/nav.test.ts tests/e2e/users.spec.ts tests/e2e/helpers.ts
git commit -m "feat: the Users page: change access, invite by email, revoke invitations"
```

---

### Task 4: Two-factor login: the Admin sets it up first, Reviewers are reminded

**Files:**
- Create:
  - `src/app/[locale]/security/page.tsx`
  - `src/components/security/security-view.tsx`, `src/components/security/clerk-security.tsx`
- Modify:
  - `src/lib/auth/mock-actions.ts` (`enableMockTwoFactor`)
  - `src/components/shell/user-menu.tsx` (Security link)
  - `messages/en.json`, `messages/ar.json`
- Test:
  - modify: `tests/unit/session.test.ts`
  - create: `tests/e2e/security.spec.ts`

**Interfaces:**
- Consumes: Task 1 `getSession`, `requireSession` (the redirect to `/{locale}/security`); Task 2 `createMockDirectory(namespace).enableTwoFactor`; M1 `SignOutControl`, `LocaleSwitch`, `ThemeToggle`, `assertMockMode`
- Produces:
  - **`/[locale]/security`:**
    - outside the `(app)` shell, so the two-factor redirect can't loop
    - signed out → sign-in; no role → no-access
    - Clerk mode: Clerk's `<UserProfile />`
    - test logins: a switch that turns two-factor on
  - **`enableMockTwoFactor(formData)`:** a server action (test logins only)
  - **User menu:** a `user-security` link: "Security" when two-factor login is on, "Turn on two-factor login" when it's off
  - **Test ids:** `security-status` (with `data-status`: `on`, `required` or `recommended`), `security-enable`, `security-continue`

- [ ] **Step 1: Write the failing tests**

In `tests/unit/session.test.ts`:
- Add `import { enableMockTwoFactor } from "@/lib/auth/mock-actions";` after the `@/lib/auth/session` import.
- Append inside `describe("session guards (test logins)", …)`:

```ts
  it("lets the admin in once two-factor login is on, in that test store only (design §5)", async () => {
    cookieJar.set("mock_store", `twofactor${Date.now().toString(36)}`);
    cookieJar.set("dev_session", "dev_admin_no2fa");
    const form = new FormData();
    form.set("locale", "ar");
    await expect(enableMockTwoFactor(form)).rejects.toThrow("REDIRECT:/ar/security");
    await expect(requireSession("ar")).resolves.toMatchObject({ userId: "dev_admin_no2fa", role: "admin", twoFactor: true });
    cookieJar.set("mock_store", `other${Date.now().toString(36)}`);
    await expect(requireSession("ar")).rejects.toThrow("REDIRECT:/ar/security");
  });
```

Create `tests/e2e/security.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { isolateMockStore, signInWithCookie } from "./helpers";

const REQUIRED = "Your role is Admin, so two-factor login is required. Turn it on to continue: you'll enter a code from an authenticator app each time you sign in.";
const RECOMMENDED = "Two-factor login is recommended: each time you sign in, you'll also enter a code from an authenticator app.";

test.beforeEach(async ({ context }) => {
  await isolateMockStore(context);
});

test("an admin without two-factor login reaches only the setup page until it's on (design §5; Review Focus 2)", async ({ page, context }) => {
  await signInWithCookie(context, "dev_admin_no2fa");
  for (const path of ["/en", "/en/keywords", "/en/users", "/en/settings/seo"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/en\/security$/);
  }
  await expect(page.getByTestId("security-status")).toHaveText(REQUIRED);
  await expect(page.getByTestId("security-continue")).toHaveCount(0);

  await page.getByTestId("security-enable").click();
  await expect(page.getByTestId("security-status")).toHaveText("Two-factor login is on.");
  await page.getByTestId("security-continue").click();
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.getByTestId("user-name").filter({ visible: true })).toHaveText("Admin without two-factor (test)");
  await page.goto("/en/users");
  await expect(page.getByTestId("user-twofactor-dev_admin_no2fa")).toHaveText("On");
});

test("a reviewer without two-factor login is only reminded (design §5)", async ({ page, context }) => {
  await signInWithCookie(context, "dev_reviewer");
  await page.goto("/en/keywords");
  await expect(page).toHaveURL(/\/en\/keywords$/);
  await expect(page.getByTestId("user-security")).toHaveText("Turn on two-factor login");
  await page.getByTestId("user-security").click();
  await expect(page).toHaveURL(/\/en\/security$/);
  await expect(page.getByTestId("security-status")).toHaveText(RECOMMENDED);
  await expect(page.getByTestId("security-continue")).toBeVisible();
});

test("someone with two-factor login on sees Security in the menu", async ({ page, context }) => {
  await signInWithCookie(context, "dev_admin");
  await page.goto("/en");
  await expect(page.getByTestId("user-security")).toHaveText("Security");
  await page.goto("/en/security");
  await expect(page.getByTestId("security-status")).toHaveText("Two-factor login is on.");
  await expect(page.getByTestId("security-enable")).toHaveCount(0);
});

test("the security page sends signed-out visitors to sign-in, and people without a role to no-access", async ({ page, context }) => {
  await page.goto("/en/security");
  await expect(page).toHaveURL(/\/en\/sign-in$/);
  await signInWithCookie(context, "dev_norole");
  await page.goto("/en/security");
  await expect(page).toHaveURL(/\/en\/no-access$/);
});

test("the security page in Arabic", async ({ page, context }) => {
  await signInWithCookie(context, "dev_admin_no2fa");
  await page.goto("/ar");
  await expect(page).toHaveURL(/\/ar\/security$/);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByTestId("security-status")).toHaveAttribute("data-status", "required");
  await expect(page.getByTestId("security-enable")).toHaveText("فعّل تسجيل الدخول بخطوتين (تجريبي)");
});
```

- [ ] **Step 2: Run the tests to make sure they fail**

Run: `pnpm test tests/unit/session.test.ts && pnpm e2e tests/e2e/security.spec.ts`
Expected: FAIL.
- Unit: `enableMockTwoFactor` isn't exported (a type error at import; Vitest reports it as not a function).
- e2e:
  - `/en/security` is a 404, so `security-status` isn't found
  - there's no `user-security` link
  - the signed-out test fails too, because the 404 page doesn't redirect

- [ ] **Step 3: Write the test switch, the page and the menu link**

In `src/lib/auth/mock-actions.ts`:
- Add the imports `import { MOCK_STORE_COOKIE } from "@/lib/engine/mock/registry";` and `import { createMockDirectory } from "@/lib/users/mock-directory";`.
- Append:

```ts
/** Test logins only: stands in for setting up an authenticator app (design §5), for this mock_store namespace. */
export async function enableMockTwoFactor(formData: FormData): Promise<void> {
  assertMockMode();
  const locale = asAppLocale(String(formData.get("locale") ?? ""));
  const jar = await cookies();
  const user = decodeMockSession(jar.get(MOCK_SESSION_COOKIE)?.value);
  if (!user) redirect(`/${locale}/sign-in`);
  createMockDirectory(jar.get(MOCK_STORE_COOKIE)?.value).enableTwoFactor(user.userId);
  redirect(`/${locale}/security`);
}
```

Create `src/components/security/clerk-security.tsx`:

```tsx
"use client";

import { UserProfile } from "@clerk/nextjs";

/** Clerk's account page: two-factor login (authenticator app, backup codes), password and sessions. */
export function ClerkSecurity() {
  return <UserProfile routing="hash" />;
}
```

Create `src/components/security/security-view.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { SignOutControl } from "@/components/shell/sign-out-control";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/locales";
import { enableMockTwoFactor } from "@/lib/auth/mock-actions";
import { getSession } from "@/lib/auth/session";
import { serverEnv } from "@/lib/env";
import { ClerkSecurity } from "./clerk-security";

/**
 * Design §5, §11: two-factor login is required for the Admin (this is the only page they reach until it's on) and
 * recommended for Reviewers. Call only under <Suspense>.
 */
export async function SecurityView({ locale }: { locale: AppLocale }) {
  const session = await getSession();
  if (!session) redirect(`/${locale}/sign-in`);
  if (!session.role) redirect(`/${locale}/no-access`);
  const t = await getTranslations("Security");
  const status = session.twoFactor ? "on" : session.role === "admin" ? "required" : "recommended";
  const clerk = serverEnv().authMode === "clerk";

  return (
    <Card className="w-full max-w-3xl">
      <CardHeader>
        <CardTitle className="font-heading text-2xl">{t("title")}</CardTitle>
        <CardDescription data-testid="security-status" data-status={status}>
          {t(status)}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {clerk && <ClerkSecurity />}
        {!clerk && !session.twoFactor && (
          <form action={enableMockTwoFactor} className="flex flex-col gap-2">
            <input type="hidden" name="locale" value={locale} />
            <p className="text-sm text-muted-foreground">{t("testNotice")}</p>
            <div>
              <Button type="submit" data-testid="security-enable">
                {t("enableTest")}
              </Button>
            </div>
          </form>
        )}
        <div className="flex flex-wrap items-center gap-3">
          {/* With Clerk the page can't tell when the Admin has just turned it on; the dashboard checks again. */}
          {(status !== "required" || clerk) && (
            <Link href="/" data-testid="security-continue" className="text-sm font-medium text-primary underline">
              {status === "required" ? t("continueOnceOn") : t("continue")}
            </Link>
          )}
          <SignOutControl locale={locale} />
        </div>
      </CardContent>
    </Card>
  );
}
```

Create `src/app/[locale]/security/page.tsx`:

```tsx
import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";
import { SecurityView } from "@/components/security/security-view";
import { LocaleSwitch } from "@/components/shell/locale-switch";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { asAppLocale } from "@/i18n/locales";

/** Outside the (app) shell, like /no-access: the shell sends an Admin without two-factor login here. */
export default async function SecurityPage({ params }: PageProps<"/[locale]/security">) {
  const locale = asAppLocale((await params).locale);
  setRequestLocale(locale);

  return (
    <main className="relative flex min-h-dvh items-center justify-center p-6">
      <div className="absolute end-4 top-4 flex gap-2">
        <ThemeToggle />
        <LocaleSwitch />
      </div>
      <Suspense fallback={null}>
        <SecurityView locale={locale} />
      </Suspense>
    </main>
  );
}
```

Replace `src/components/shell/user-menu.tsx` with:

```tsx
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/locales";
import { requireSession } from "@/lib/auth/session";
import { cn } from "@/lib/utils";
import { SignOutControl } from "./sign-out-control";

export async function UserMenu({ locale }: { locale: AppLocale }) {
  const session = await requireSession(locale);
  const t = await getTranslations("Shell");
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm" data-testid="user-name">
        {session.name}
      </span>
      <Badge variant="secondary" data-testid="user-role">
        {t(`role.${session.role}`)}
      </Badge>
      {/* Design §5: two-factor login is recommended for Reviewers; the link is the reminder until it's on. */}
      <Link
        href="/security"
        data-testid="user-security"
        className={cn("text-sm underline-offset-4 hover:underline", session.twoFactor ? "text-muted-foreground" : "font-medium text-warn-fg")}
      >
        {session.twoFactor ? t("security") : t("turnOnTwoFactor")}
      </Link>
      <SignOutControl locale={locale} />
    </div>
  );
}
```

- [ ] **Step 4: Add the messages**

Merge into `messages/en.json`:
- at `Shell`: `{ "security": "Security", "turnOnTwoFactor": "Turn on two-factor login" }`
- at the top level:

```json
{
  "Security": {
    "title": "Two-factor login",
    "required": "Your role is Admin, so two-factor login is required. Turn it on to continue: you'll enter a code from an authenticator app each time you sign in.",
    "recommended": "Two-factor login is recommended: each time you sign in, you'll also enter a code from an authenticator app.",
    "on": "Two-factor login is on.",
    "testNotice": "Test logins only: this switch stands in for setting up an authenticator app.",
    "enableTest": "Turn on two-factor login (test)",
    "continue": "Continue to the dashboard",
    "continueOnceOn": "I've turned it on: continue"
  }
}
```

Merge into `messages/ar.json`:
- at `Shell`: `{ "security": "الأمان", "turnOnTwoFactor": "فعّل تسجيل الدخول بخطوتين" }`
- at the top level:

```json
{
  "Security": {
    "title": "تسجيل الدخول بخطوتين",
    "required": "دورك مسؤول، لذا يلزم تفعيل تسجيل الدخول بخطوتين. فعّله للمتابعة: ستُدخل رمزًا من تطبيق المصادقة في كل مرة تسجّل فيها الدخول.",
    "recommended": "يُنصح بتفعيل تسجيل الدخول بخطوتين: ستُدخل في كل مرة تسجّل فيها الدخول رمزًا من تطبيق المصادقة أيضًا.",
    "on": "تسجيل الدخول بخطوتين مفعّل.",
    "testNotice": "لتسجيلات الدخول التجريبية فقط: هذا الزر بديل عن إعداد تطبيق المصادقة.",
    "enableTest": "فعّل تسجيل الدخول بخطوتين (تجريبي)",
    "continue": "المتابعة إلى لوحة التحكم",
    "continueOnceOn": "فعّلته: المتابعة"
  }
}
```

- [ ] **Step 5: Run the tests to make sure they pass**

Run: `pnpm test tests/unit/session.test.ts && pnpm e2e tests/e2e/security.spec.ts tests/e2e/auth.spec.ts`
Expected: PASS. The security spec has 5 tests, and the auth spec still passes.

- [ ] **Step 6: Lint, typecheck and the whole unit suite**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: exit 0; every unit test passes.

- [ ] **Step 7: Commit**

```bash
git add "src/app/[locale]/security" src/components/security src/lib/auth/mock-actions.ts src/components/shell/user-menu.tsx messages tests/unit/session.test.ts tests/e2e/security.spec.ts
git commit -m "feat: two-factor login: the Admin sets it up before anything else, Reviewers are reminded"
```

---

### Task 5: Signing out loads the sign-in page afresh

**Files:**
- Create: `src/app/api/auth/sign-out/route.ts`, `src/components/shell/clerk-sign-out.tsx`
- Modify: `src/components/shell/sign-out-control.tsx`, `src/lib/auth/mock-actions.ts` (remove `signOutMockUser`)
- Test:
  - create: `tests/unit/sign-out-route.test.ts`
  - modify: `tests/e2e/auth.spec.ts`

**Interfaces:**
- Consumes: M1 `MOCK_SESSION_COOKIE`, `asAppLocale`, `serverEnv`; the proxy's `/api` pass-through (M3a)
- Produces:
  - **`POST /api/auth/sign-out`** (test logins only; 404 in Clerk mode):
    - takes a form field `locale`
    - clears `dev_session`
    - answers 303 to `/{locale}/sign-in`
  - **`SignOutControl`:** a plain form POST (test logins) or `ClerkSignOut` (Clerk); `data-testid="sign-out"` in both
  - **`ClerkSignOut({ locale, label })`:** Clerk's `signOut`, then `window.location.assign("/{locale}/sign-in")`
  - **Removed:** `signOutMockUser`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/sign-out-route.test.ts`:

```ts
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { POST } = await import("@/app/api/auth/sign-out/route");

function signOutRequest(locale: string) {
  const body = new FormData();
  body.set("locale", locale);
  return new NextRequest("http://localhost:3000/api/auth/sign-out", { method: "POST", body, headers: { cookie: "dev_session=dev_admin" } });
}

describe("test-login sign-out (M1 follow-up: a full page load, so no hidden copy of the previous pages stays)", () => {
  beforeEach(() => {
    vi.stubEnv("AUTH_MODE", "mock");
    vi.stubEnv("ENGINE_MODE", "mock");
    vi.stubEnv("VERCEL", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("clears the test login and sends the browser to sign-in with a 303", async () => {
    const response = await POST(signOutRequest("ar"));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost:3000/ar/sign-in");
    expect(response.headers.get("set-cookie")).toMatch(/^dev_session=;/);
  });

  it("uses the default language for one it doesn't know", async () => {
    expect((await POST(signOutRequest("xx"))).headers.get("location")).toBe("http://localhost:3000/en/sign-in");
  });

  it("does nothing with Clerk sign-in", async () => {
    vi.stubEnv("AUTH_MODE", "clerk");
    const response = await POST(signOutRequest("en"));
    expect(response.status).toBe(404);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
```

In `tests/e2e/auth.spec.ts`:
- Change the import to `import { isolateMockStore, signInWithCookie } from "./helpers";`.
- Append:

```ts
test("signing out loads the sign-in page afresh: nothing of the previous pages stays hidden in the DOM (Review Focus 5)", async ({ page, context }) => {
  await isolateMockStore(context);
  await signInWithCookie(context, "dev_admin");
  await page.goto("/en");
  await page.waitForLoadState("networkidle"); // hydrated, so the next click is an in-app navigation
  await page.getByTestId("nav-keywords").click();
  await expect(page).toHaveURL(/\/en\/keywords$/);
  await expect(page.locator('[data-testid^="keyword-row-"]').first()).toBeVisible();
  await page.waitForLoadState("networkidle");

  await page.getByTestId("sign-out").filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/en\/sign-in$/);
  await expect(page.getByTestId("sign-in-dev_admin")).toBeVisible();
  await expect(page.getByTestId("user-name")).toHaveCount(0);
  await expect(page.locator('[data-testid^="keyword-row-"]')).toHaveCount(0);
});
```

- [ ] **Step 2: Run the tests to make sure they fail**

Run: `pnpm test tests/unit/sign-out-route.test.ts && pnpm e2e tests/e2e/auth.spec.ts`
Expected: FAIL.
- Unit: Vitest can't resolve `@/app/api/auth/sign-out/route`.
- e2e: after the server action's in-app redirect, the dashboard and keyword pages stay hidden in the DOM, so `user-name` counts 1 or more, not 0 (the M1 follow-up).
  - If the new e2e test passes here instead, ledger a ruling with what the DOM held, and keep the change: Clerk's user button signs out with in-app navigation too.

- [ ] **Step 3: Implement**

Create `src/app/api/auth/sign-out/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { asAppLocale } from "@/i18n/locales";
import { MOCK_SESSION_COOKIE } from "@/lib/auth/mock-session";
import { serverEnv } from "@/lib/env";

/**
 * Test-login sign-out as a plain form POST answered with a redirect: the browser loads the sign-in page itself, so no
 * hidden copy of the previous person's pages stays in the DOM (Next keeps recent pages hidden after in-app navigation).
 */
export async function POST(request: NextRequest) {
  if (serverEnv().authMode !== "mock") return new NextResponse(null, { status: 404 });
  const form = await request.formData();
  const locale = asAppLocale(String(form.get("locale") ?? ""));
  const response = NextResponse.redirect(new URL(`/${locale}/sign-in`, request.url), 303);
  response.cookies.delete(MOCK_SESSION_COOKIE);
  return response;
}
```

Create `src/components/shell/clerk-sign-out.tsx`:

```tsx
"use client";

import { useClerk } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

/** Clerk sign-out, then a full page load of sign-in, so no hidden copy of the previous person's pages stays in the DOM. */
export function ClerkSignOut({ locale, label }: { locale: string; label: string }) {
  const { signOut } = useClerk();
  return (
    <Button variant="ghost" size="sm" data-testid="sign-out" onClick={() => void signOut(() => window.location.assign(`/${locale}/sign-in`))}>
      {label}
    </Button>
  );
}
```

Replace `src/components/shell/sign-out-control.tsx` with:

```tsx
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import type { AppLocale } from "@/i18n/locales";
import { serverEnv } from "@/lib/env";
import { ClerkSignOut } from "./clerk-sign-out";

/** Both modes end in a full page load of sign-in (M1 follow-up). Account settings are on /security. */
export async function SignOutControl({ locale }: { locale: AppLocale }) {
  const t = await getTranslations("Shell");
  if (serverEnv().authMode === "clerk") return <ClerkSignOut locale={locale} label={t("signOut")} />;
  return (
    // A plain form POST, not a server action, so the browser loads the sign-in page itself.
    <form method="post" action="/api/auth/sign-out">
      <input type="hidden" name="locale" value={locale} />
      <Button type="submit" variant="ghost" size="sm" data-testid="sign-out">
        {t("signOut")}
      </Button>
    </form>
  );
}
```

In `src/lib/auth/mock-actions.ts`, delete the function `signOutMockUser` and its preceding blank line. Then run `grep -rn signOutMockUser src tests`. Expected: no matches.

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `pnpm test tests/unit/sign-out-route.test.ts && pnpm e2e tests/e2e/auth.spec.ts tests/e2e/security.spec.ts`
Expected: PASS.
- unit: 3 tests
- auth e2e: 6 tests, including the earlier "signing out returns to sign-in and stays signed out"
- security e2e: still passes, because its page has a sign-out control too

- [ ] **Step 5: Lint, typecheck and the whole unit suite**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: exit 0; every unit test passes.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/auth src/components/shell/clerk-sign-out.tsx src/components/shell/sign-out-control.tsx src/lib/auth/mock-actions.ts tests/unit/sign-out-route.test.ts tests/e2e/auth.spec.ts
git commit -m "fix: signing out loads the sign-in page afresh, leaving no hidden copy of the previous pages"
```

---

### Task 6: M4b wrap-up and full verification

**Files:**
- Create: `docs/plans/2026-10-22-m4b-followups.md`
- Modify: `README.md`, `docs/plans/2026-10-21-m1-followups.md`, `docs/plans/2026-10-22-m3a-followups.md`

**Interfaces:**
- Consumes: everything above
- Produces: a documented, fully green M4b

- [ ] **Step 1: Update `README.md`**

In `## Run locally`:
- Replace `local test logins (Admin, Reviewer, and a user with no role).` with `local test logins (Admin, Reviewer, a user with no role, and an Admin without two-factor login).`
- After the `ENGINE_MODE=mock` bullet, add:

```markdown
- Mock scenario `signin_down` (the same `mock_scenario` cookie): the sign-in service can't be reached. The Users page shows a notice; the engine stays normal.
```

Replace the whole section from `## Real sign-in (Clerk)` up to, but not including, `## Decisions in M1` with:

```markdown
## Real sign-in (Clerk)

One Clerk application per website copy (design §5).

1. Create an application at https://dashboard.clerk.com and enable **Microsoft** and **Email code** sign-in.
2. **Restrictions → Sign-up mode: Restricted.** Only people the Admin invites from `/users` can create an account.
3. **Multi-factor:** turn on **Authenticator application** and **Backup codes**. The portal sends an Admin without two-factor login to `/security` (Clerk's account page) until it's on.
4. **Sessions → Customize session token:** `{ "metadata": "{{user.public_metadata}}" }`. `/api/jobs` then reads the role from the token instead of asking Clerk on every poll. Without it the portal still works, with one Clerk call per poll.
5. Put the keys in `.env.local` (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`) and set `AUTH_MODE=clerk`.
6. Rebuild (`pnpm build`). `AUTH_MODE` is read at build time.
7. Give the first person the Admin role: Clerk dashboard → Users → the user → Metadata → **Public** → `{ "role": "admin" }`. From then on the Admin invites people and sets roles on `/users`. Anyone without a role sees "No access yet".

Clerk's keyless mode didn't activate in testing (2026-10-21), so keys are needed even locally. Use `AUTH_MODE=mock` until then. Clerk mode is unit-tested against a fake client only: check these steps end to end with real keys before go-live (`docs/plans/2026-10-22-m4b-followups.md`).
```

Append at the end of the file:

```markdown

## Decisions in M4b (users and security)

- **Users** (Admin, `/users`):
  - Everyone who can sign in, with their role, two-factor status and last sign-in (in the site's timezone).
  - Roles live in Clerk's public metadata: Admin, Reviewer or No access. No access removes the role and keeps the account, so access can be given back.
  - Nobody can change their own access, so the site can't lose its last Admin.
  - Invitations go by email with a role, which reaches the account when the person signs up. Emails are compared trimmed and in lower case; one that already has an account or a pending invitation is refused. A pending invitation can be revoked.
  - The page lists the first 100 people and 100 pending invitations.
  - When Clerk can't be reached, the page and its actions say so instead of failing.
- **Two-factor login** (design §5, §11):
  - Required for the Admin: an Admin without it reaches only `/security`; every page and server action sends them there.
  - Recommended for Reviewers: the user menu says "Turn on two-factor login" until it's on.
  - `/security` sits outside the app shell, like "No access". With Clerk it shows Clerk's account page.
- **Sessions:**
  - The signed-in person is read once per request (React `cache`), not once per check.
  - `/api/jobs` reads the role from the session token when the token carries it (step 4 above). Clerk renews the token every minute, so a role change reaches job polls within a minute; pages and actions see it on the next request.
- **Sign-out** loads the sign-in page afresh in both modes, so nothing of the previous person's pages stays hidden in the page. With Clerk, a Sign out button replaces Clerk's user button; the account page is `/security`.
- **Test logins:**
  - A fourth test user: "Admin without two-factor (test)".
  - Roles and two-factor status come from a test directory per `mock_store` namespace, so a change on `/users` takes effect on the person's next request, as with Clerk.
  - Invitations are listed, but no email is sent and they can't be accepted.
  - A switch on `/security` stands in for setting up an authenticator app.
```

- [ ] **Step 2: Update the follow-up docs**

- In `docs/plans/2026-10-21-m1-followups.md`:
  - append ` — handled in M4b (sign-out loads the sign-in page afresh in both modes)` to "after test-login sign-out, hidden (Activity) dashboard copies stay in the DOM until next navigation; recheck with Clerk sign-out in M4."
  - append ` — handled in M4b` to "getSession not wrapped in React cache() — up to 6 currentUser() calls per render in Clerk mode."
- In `docs/plans/2026-10-22-m3a-followups.md`, append ` — handled in M4b (the role comes from the session token)` to "One Clerk Backend API call (`currentUser()`) per poll: the existing session pattern. Consider reading the role from session claims later."

Create `docs/plans/2026-10-22-m4b-followups.md`:

```markdown
# M4b follow-ups

Carry these into the M4c and M5 plans.

## Before go-live (M5)

- **Clerk mode has never run:** it's unit-tested over a fake client only. With real keys, check end to end:
  - An invitation email arrives, and the role reaches the new account.
  - An Admin without two-factor login is sent to `/security`. After setting it up in Clerk's account page, "I've turned it on: continue" lets them in.
  - Removing someone's access sends them to "No access" on their next page.
  - The session token carries `metadata.role` (README, Real sign-in step 4).
  - Sign out ends on the sign-in page.
- **Clerk's own enforcement:** check whether the Clerk plan can require multi-factor at every sign-in. The portal enforces it for Admins either way.

## Known limits

- The Users page lists the first 100 people and 100 pending invitations (no paging).
- Inviting checks for duplicates against those lists. Beyond them, Clerk refuses a duplicate itself, and the page shows the same message.
- A pending invitation can't be resent: revoke it and invite again.
```

- [ ] **Step 3: Run every check from a clean build**

```bash
rm -rf .next
pnpm lint && pnpm typecheck && pnpm test && pnpm e2e && ALLOW_TEST_LOGINS=1 pnpm build
```

Expected:
- lint and typecheck exit 0
- Vitest: about 384 passed (354 + 30)
- Playwright: about 155 passed (141 + 14)
- the build lists `◐ /en/users`, `◐ /ar/users`, `◐ /en/security` and `◐ /ar/security`, and `ƒ /api/auth/sign-out`

- [ ] **Step 4: Manual smoke test**

Run `pnpm dev`:
- Keep the smoke script and the dev log in the scratchpad, outside the repo, and run the script with `NODE_PATH=<repo>/node_modules`. A file written inside the repo makes Turbopack recompile and reload the page.
- Warm the dev server first.
- Interact only after `networkidle`.
- Use a fresh `mock_store` cookie.

Check:
- (a) **As Admin on `/en/users`:**
  - The four test users are listed with roles, two-factor status and last sign-in.
  - Your own row can't be changed.
  - Setting the Reviewer to No access sends the Reviewer (a second browser context, same store) to "No access" on their next page. Giving it back lets them in.
- (b) **Invitations:**
  - " New@Example.com " as Reviewer is listed as `new@example.com`.
  - Inviting it again is refused, as is `REVIEWER@example.com`.
  - "not-an-email" shows the field message.
  - Revoke removes it.
- (c) **As the Admin without two-factor:**
  - `/en`, `/en/keywords` and `/en/users` all land on `/en/security`.
  - The test switch turns it on, and Continue reaches the dashboard.
- (d) **As Reviewer:** the user menu says "Turn on two-factor login", and `/en/security` says it's recommended.
- (e) **Sign-out:** sign out from `/en/keywords` after an in-app navigation. On the sign-in page, `document.querySelectorAll('[data-testid="user-name"], [data-testid^="keyword-row-"]').length` is 0.
- (f) **Arabic:** `/ar/users` and `/ar/security` are right to left, with Latin digits.
- (g) **`signin_down`:** with `mock_scenario=signin_down`, `/en/users` shows the notice, and the rest of the app works.
- (h) **Dev console:** no console errors, no dev overlay, and no errors in the `pnpm dev` log.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: M4b decisions, Clerk setup and go-live checks; users and two-factor login complete"
git log --oneline | head -10
```

---

## Decisions in M4b

These come from the plan, ahead of execution:

- **Roles stay in Clerk** (design §5), with no users table. M4c's database is for webhooks.
- **No access removes the role, and never deletes the account:**
  - Deleting is irreversible, and access can be given back.
  - Clerk keeps the sign-in history.
- **"Nobody changes their own access" instead of counting Admins:**
  - It's simpler.
  - A second Admin can still change the first.
  - It covers demoting as well as removing.
- **The portal enforces two-factor login for the Admin itself** (a redirect to `/security`), not only through Clerk settings:
  - Design §5 says it's required.
  - It works on any Clerk plan.
  - It holds even if the Clerk setting is missed.
- **The role for `/api/jobs` comes from the session token,** falling back to `currentUser()`. A missed token setting costs speed, not correctness. Pages and actions keep reading the user, so a role change applies on the next request.
- **A test directory per `mock_store` namespace:**
  - It matches the mock engine and keeps e2e tests apart.
  - Test sessions behave like Clerk's: the role is re-read on every request.
- **The Users actions use `useEngineAction`** for its pending state and error shape. The key isn't sent to Clerk, which takes none; each change is safe to repeat.
- **Sign-out is a plain form POST (test logins) or `window.location` (Clerk):**
  - Next 16 keeps recent pages hidden after in-app navigation (M1), and only a full page load clears them.
  - Clerk's user button signs out with in-app navigation, so a Sign out button replaces it, plus the Security link.
- **`/security` is outside the `(app)` group:** a page inside it would redirect to itself.
