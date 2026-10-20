# Articles AI Dashboard — M1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A locally running, tested Next.js dashboard with:
- sign-in and Admin/Reviewer roles
- an English/Arabic (right-to-left) shell in the prototype's look
- a server-only engine client plus a mock of Quantum1st's v1.1 API
- a working Dashboard page (counts, next publish slot, connection warnings, quota bars) built on real API shapes

**Architecture:**
- **Rendering:** Next.js 16 App Router with Cache Components (`cacheComponents: true`). Static shells render instantly; everything per-user or per-request (session, engine data) streams in behind `<Suspense>`.
- **Engine access:** all engine traffic goes through one server-only client that validates every response against Zod schemas of the v1.1 contract. A mock engine with the same HTTP behaviour stands in until Quantum1st's API is live.
- **Language:** carried in the URL (`/en`, `/ar`) via next-intl.
- **Sign-in:** behind a session abstraction. Mock test logins are for local use only; Clerk is the real sign-in.

**Tech Stack:**
- Next.js 16.4.2, React 19.3, TypeScript 5 (template pin)
- next-intl 4.14.9, @clerk/nextjs 7.9.18, Zod 4.6.7
- Tailwind CSS 4, shadcn/ui CLI 4.22.1 (radix-nova, RTL)
- Vitest 5.0.5, Playwright 1.64.1
- pnpm 10.33, Node 26

**Spec:**
- Design: `Articles AI/docs/superpowers/specs/2026-10-21-marketing-dashboard-design.md` (copied into the repo at `docs/specs/` in Task 1)
- API contract: `Articles AI/Marketing Portal Build Spec v1.1.html` (copied to `docs/specs/`). Quantum1st's approval of v1.1 is assumed (owner, 2026-10-21).

## Global Constraints

- **Repository:** `~/Documents/GitHub/articles-ai-dashboard`, local git only. The GitHub remote comes later on the Nour Attorneys GitHub account. **Do not push.**
- **Pinned versions:**
  - `next` 16.4.2, `next-intl` 4.14.9, `@clerk/nextjs` 7.9.18, `zod` 4.6.7, `server-only` 0.0.1
  - `vitest` 5.0.5, `@playwright/test` 1.64.1, shadcn CLI `shadcn@4.22.1`
  - React, TypeScript and Tailwind as pinned by `create-next-app@16.4.2`
- **Keep `cacheComponents: true` and `partialPrefetching: true`.** Under them:
  - Runtime reads (`cookies()`, `headers()`, Clerk `auth()`/`currentUser()`, any engine call) happen **only inside a component rendered under `<Suspense>`**.
  - Never `await` them at the top level of a layout or page.
  - `await params` is fine: locales come from `generateStaticParams`.
- **The engine API key lives only in the server variable `ENGINE_API_KEY`.** Every module that reads env, the session or the engine starts with `import "server-only"`. No `NEXT_PUBLIC_` engine variables, ever.
- **`AUTH_MODE=mock` is refused when `VERCEL=1`.**
- **Nothing the API owns is hard-coded.** Lists, limits and metric names come from the API. UI labels translate known values and fall back to showing the raw value.
- **Times** are 12-hour, in the site's timezone (`site.timezone`), through `formatDateTime`. **Digits are Latin** in both languages (`formatNumber`).
- **Interface languages** are `en` and `ar`. URLs are `/en/…` and `/ar/…`; `ar` is `dir="rtl"`. Use logical CSS (`border-e`, `ps-`, `pe-`, `ms-`, `me-`), never `left`/`right`.
- **Never call a client a "law firm"** in copy or sample data. Fakher & Co is a "legal consultancy".
- **Every page guards itself.** Each async section that shows session data calls `requireSession`/`requirePermission` itself, even when the layout also does.
- **Engine changes** (from M2 on) send `X-Acting-User` and `Idempotency-Key`. The client in Task 4 already supports both.

**Recorded deviations from the design doc:**
1. **No database in M1.** Neon/Drizzle moves to M4, where the webhook receiver first needs it.
2. **TypeScript 5**, as pinned by the Next.js 16.4 template (design §17 fallback).
3. **Language in the URL** (`/en`, `/ar`). Under Cache Components the root layout can't read cookies, so `<html lang dir>` must come from the URL. next-intl remembers the choice in the `NEXT_LOCALE` cookie and redirects `/` accordingly.
4. **Theme in `localStorage`**, applied by an inline script before first paint (Next's recommended pattern), instead of a cookie.
5. **Local test logins (`AUTH_MODE=mock`) are the local default.** Clerk's keyless mode didn't activate in testing (2026-10-21), so Clerk needs real keys (Task 10 README).
6. **No Vercel deployment in M1.** Build locally (owner, 2026-10-21).
7. **Requiring two-factor login for the Admin (design §5) moves to M4** (Users & security), where Clerk sign-in is configured for real. M1's test logins have no second factor, and in Clerk mode M1 only reads the role.

## Review Focus

1. **The engine changes a response shape (drift).** Only the sections using that data show "unexpected format"; the rest of the page still renders. *Pinned by Task 4 (`invalid_response` unit tests) and Task 9 (e2e "drift").*
2. **The engine is unreachable or returns an HTML error page.** Reads retry twice, then show a readable "can't be reached" notice, and the page never crashes. *Pinned by Task 4 (retry and `engine_unavailable` tests) and Task 9 (e2e "down").*
3. **Quota edge values:** unlimited (`limit: null`), `limit: 0`, missing `warnAt`, or `used > limit`. No `NaN`/`Infinity` bar widths; the state is correct. *Pinned by Task 9 (`quotaView` unit tests).*
4. **Late-evening UTC times** show as the next calendar day in Dubai. An invalid timezone from the engine falls back to UTC instead of crashing. *Pinned by Task 2 unit tests.*
5. **Values the UI doesn't know:** a new connection status, waiting reason or quota metric is shown raw, never crashes, and is never hidden. *Pinned by Task 9: unit tests for `connectionWarnings` and `nextSlotView`, plus an e2e check that the fixture metric `videoMinutes` renders raw.*

---

### Task 1: Scaffold the repository

**Files:**
- Create (generated): the Next.js app in `~/Documents/GitHub/articles-ai-dashboard`; `components.json`, `src/lib/utils.ts`, and `src/components/ui/{button,card,badge,direction}.tsx` (shadcn)
- Create: `.env.example`, `README.md` (replaces the template's), `docs/specs/*`, `docs/plans/*`
- Modify: `.gitignore`, `package.json` (scripts)

**Interfaces:**
- Consumes: nothing
- Produces:
  - shadcn components `Button` (variants `default|outline|secondary|ghost|destructive|link`; sizes `default|xs|sm|lg|icon`)
  - `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`, `CardAction`; `Badge`
  - `DirectionProvider` (prop `direction: "ltr" | "rtl"`) from `@/components/ui/direction`
  - `cn` from `@/lib/utils`
  - scripts `dev`, `build`, `start`, `lint`, `typecheck`

- [ ] **Step 1: Create the Next.js app**

```bash
cd ~/Documents/GitHub
CI=1 pnpm dlx create-next-app@16.4.2 articles-ai-dashboard --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm --no-react-compiler --no-agent-feedback --yes
cd articles-ai-dashboard
git log --oneline
```
Expected: `Success! Created articles-ai-dashboard`, and `git log` shows one commit. If there's no commit, run `git add -A && git commit -m "chore: create next app"`.

- [ ] **Step 2: Initialise shadcn/ui (Radix, right-to-left) and add the M1 components**

```bash
CI=1 pnpm dlx shadcn@4.22.1 init --base radix --preset nova --rtl --yes --no-monorepo --css-variables --pointer < /dev/null
CI=1 pnpm dlx shadcn@4.22.1 add button card badge direction --yes < /dev/null
ls src/components/ui
```
Expected: `badge.tsx  button.tsx  card.tsx  direction.tsx`, and `components.json` contains `"style": "radix-nova"` and `"rtl": true`. (`< /dev/null` stops the CLI from waiting for input.)

- [ ] **Step 3: Add the typecheck script**

```bash
pnpm pkg set scripts.typecheck="next typegen && tsc --noEmit"
```
`next typegen` generates the `PageProps`/`LayoutProps` route types that `tsc` needs.

- [ ] **Step 4: Write `.env.example`**

```bash
# Content engine: "mock" uses built-in sample data (no key needed); "live" calls Quantum1st.
ENGINE_MODE=mock
# Required when ENGINE_MODE=live
ENGINE_BASE_URL=
ENGINE_API_KEY=

# Sign-in: "mock" = local test logins (development only, refused on Vercel); "clerk" = real sign-in.
# AUTH_MODE is read at build time and at runtime: rebuild after changing it.
AUTH_MODE=mock
# Required when AUTH_MODE=clerk (dashboard.clerk.com → API keys)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
```

- [ ] **Step 5: Let `.env.example` be committed, and ignore test output**

The template's `.gitignore` ignores `.env*`. Append:

```gitignore
!.env.example

# test output
/test-results/
/playwright-report/
/playwright/.cache/
```

- [ ] **Step 6: Replace `README.md`**

```markdown
# Articles AI — Marketing Dashboard

Review, approve and schedule AI-drafted articles and social posts. One deployment per website; the AI engine is Quantum1st's (API contract: `docs/specs/Marketing Portal Build Spec v1.1.html`).

## Run locally

    pnpm install
    cp .env.example .env.local
    pnpm dev            # http://localhost:3000 → /en

- `AUTH_MODE=mock`: local test logins (Admin, Reviewer, and a user with no role). Refused on Vercel.
- `ENGINE_MODE=mock`: built-in sample data. To simulate engine problems, set the browser cookie `mock_scenario` to `unauthorized`, `down` or `drift`.

## Checks

    pnpm lint && pnpm typecheck && pnpm test && pnpm e2e && pnpm build

## Docs

- Design: `docs/specs/2026-10-21-marketing-dashboard-design.md`
- API contract: `docs/specs/Marketing Portal Build Spec v1.1.html`
- Plans: `docs/plans/`
```

- [ ] **Step 7: Copy the spec and plan into the repo**

```bash
mkdir -p docs/specs docs/plans
SRC="$HOME/Documents/GitHub/Fakher-Stack/Articles AI"
cp "$SRC/docs/superpowers/specs/2026-10-21-marketing-dashboard-design.md" docs/specs/
cp "$SRC/Marketing Portal Build Spec v1.1.html" docs/specs/
cp "$SRC/docs/superpowers/plans/2026-10-21-m1-foundation.md" docs/plans/
ls docs/specs docs/plans
```

- [ ] **Step 8: Verify the scaffold builds**

Run: `pnpm lint && pnpm typecheck && pnpm build`
Expected: lint and typecheck exit 0; the build prints `✓ Compiled successfully` and lists route `/`.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js 16 app with shadcn/ui (RTL), docs and env example"
```

---

### Task 2: Unit-test tooling, locales and formatting

**Files:**
- Create: `vitest.config.ts`, `tests/stubs/server-only.ts`, `src/i18n/locales.ts`, `src/lib/format/datetime.ts`, `src/lib/format/number.ts`
- Test: `tests/unit/format.test.ts`
- Modify: `package.json` (scripts `test`, `test:watch`)

**Interfaces:**
- Consumes: nothing
- Produces:
  - `LOCALES: readonly ["en","ar"]`, `type AppLocale = "en" | "ar"`, `DEFAULT_LOCALE: AppLocale`
  - `isAppLocale(v: unknown): v is AppLocale`, `asAppLocale(v: string): AppLocale`, `directionOf(l: AppLocale): "ltr" | "rtl"`
  - `INTL_LOCALE: Record<AppLocale, string>`
  - `formatDateTime(iso: string, opts: { timeZone: string; locale: AppLocale }): string`
  - `formatNumber(value: number, locale: AppLocale): string`

- [ ] **Step 1: Install Vitest and add scripts**

```bash
pnpm add -D vitest@5.0.5
pnpm pkg set scripts.test="vitest run" scripts.test:watch="vitest"
```

- [ ] **Step 2: Create `vitest.config.ts` and the `server-only` stub**

```ts
// vitest.config.ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` throws outside React Server Components; unit tests run in plain Node.
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
  },
});
```

```ts
// tests/stubs/server-only.ts
export {};
```

- [ ] **Step 3: Write the failing tests**

```ts
// tests/unit/format.test.ts
import { describe, expect, it } from "vitest";
import { asAppLocale, directionOf, isAppLocale } from "@/i18n/locales";
import { formatDateTime } from "@/lib/format/datetime";
import { formatNumber } from "@/lib/format/number";

// ICU puts a narrow no-break space before AM/PM; compare with plain spaces.
const norm = (s: string) => s.replace(/\s+/gu, " ");

describe("locales", () => {
  it("recognises the two interface languages", () => {
    expect(isAppLocale("en")).toBe(true);
    expect(isAppLocale("ar")).toBe(true);
    expect(isAppLocale("de")).toBe(false);
    expect(asAppLocale("de")).toBe("en");
    expect(directionOf("ar")).toBe("rtl");
    expect(directionOf("en")).toBe("ltr");
  });
});

describe("formatDateTime", () => {
  it("renders 12-hour time in the site's timezone (06:00 UTC = 10:00 AM Dubai)", () => {
    const out = norm(formatDateTime("2026-10-21T06:00:00Z", { timeZone: "Asia/Dubai", locale: "en" }));
    expect(out).toContain("Oct 21");
    expect(out).toContain("10:00 AM");
  });

  it("uses the Dubai calendar date when UTC is still the previous day", () => {
    const out = norm(formatDateTime("2026-10-21T21:30:00Z", { timeZone: "Asia/Dubai", locale: "en" }));
    expect(out).toContain("Oct 22");
    expect(out).toContain("1:30 AM");
  });

  it("respects the offset in the input", () => {
    const out = norm(formatDateTime("2026-10-22T10:00:00+04:00", { timeZone: "Asia/Dubai", locale: "en" }));
    expect(out).toContain("Oct 22");
    expect(out).toContain("10:00 AM");
  });

  it("formats Arabic with Latin digits and the Arabic morning marker", () => {
    const out = norm(formatDateTime("2026-10-21T06:00:00Z", { timeZone: "Asia/Dubai", locale: "ar" }));
    expect(out).toContain("10:00");
    expect(out).toContain("ص");
    expect(out).not.toMatch(/[٠-٩]/u);
  });

  it("returns the input unchanged when it is not a date", () => {
    expect(formatDateTime("not-a-date", { timeZone: "Asia/Dubai", locale: "en" })).toBe("not-a-date");
  });

  it("falls back to UTC, and says so, when the timezone is unknown", () => {
    const out = norm(formatDateTime("2026-10-21T06:00:00Z", { timeZone: "Mars/Olympus", locale: "en" }));
    expect(out).toContain("6:00 AM");
    expect(out.endsWith(" UTC")).toBe(true);
  });
});

describe("formatNumber", () => {
  it("groups thousands", () => {
    expect(formatNumber(812000, "en")).toBe("812,000");
  });

  it("uses Latin digits in Arabic", () => {
    const out = formatNumber(812000, "ar");
    expect(out).toMatch(/^812\D000$/u);
    expect(out).not.toMatch(/[٠-٩]/u);
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `pnpm test`
Expected: FAIL. The imports `@/i18n/locales`, `@/lib/format/datetime` and `@/lib/format/number` can't be resolved.

- [ ] **Step 5: Implement**

```ts
// src/i18n/locales.ts
export const LOCALES = ["en", "ar"] as const;
export type AppLocale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: AppLocale = "en";

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function asAppLocale(value: string): AppLocale {
  return isAppLocale(value) ? value : DEFAULT_LOCALE;
}

export function directionOf(locale: AppLocale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}

/** Intl locale tags for formatting. Both languages use Latin digits in this dashboard. */
export const INTL_LOCALE: Record<AppLocale, string> = { en: "en-US", ar: "ar-AE" };
```

```ts
// src/lib/format/datetime.ts
import { INTL_LOCALE, type AppLocale } from "@/i18n/locales";

function formatter(locale: AppLocale, timeZone: string) {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
    numberingSystem: "latn",
  });
}

/** Formats an ISO 8601 timestamp as 12-hour time in the site's timezone (spec §2 "Use the times we send"). */
export function formatDateTime(iso: string, opts: { timeZone: string; locale: AppLocale }): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    return formatter(opts.locale, opts.timeZone).format(date);
  } catch (error) {
    if (error instanceof RangeError) return `${formatter(opts.locale, "UTC").format(date)} UTC`;
    throw error;
  }
}
```

```ts
// src/lib/format/number.ts
import { INTL_LOCALE, type AppLocale } from "@/i18n/locales";

export function formatNumber(value: number, locale: AppLocale): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], { numberingSystem: "latn", maximumFractionDigits: 0 }).format(value);
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test`
Expected: PASS, 9 tests.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add locales, 12-hour site-timezone date and Latin-digit number formatting"
```

---

### Task 3: Environment, roles and sessions

**Files:**
- Create: `src/lib/env.ts`, `src/lib/auth/roles.ts`, `src/lib/auth/types.ts`, `src/lib/auth/mock-session.ts`, `src/lib/auth/clerk-session.ts`, `src/lib/auth/session.ts`
- Test: `tests/unit/env.test.ts`, `tests/unit/auth.test.ts`, `tests/unit/session.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces:
  - `MOCK_ENGINE_BASE_URL: string`
  - `type ServerEnv = { engineMode: "mock"|"live"; engineBaseUrl: string; engineApiKey: string; authMode: "mock"|"clerk" }`
  - `parseServerEnv(source: Record<string, string|undefined>): ServerEnv`, `serverEnv(): ServerEnv`
  - `ROLES`, `type Role = "admin"|"reviewer"`, `isRole(v: unknown): v is Role`
  - `type Permission = "content.work"|"siteHealth.view"|"siteHealth.apply"|"settings.manage"|"users.manage"|"plan.manage"`, `can(role: Role, p: Permission): boolean`
  - `type Session = { userId: string; email: string; name: string; role: Role|null }`, `type AuthedSession = Omit<Session,"role"> & { role: Role }`
  - `MOCK_SESSION_COOKIE = "dev_session"`, `MOCK_USERS: readonly Session[]` (ids `dev_admin`, `dev_reviewer`, `dev_norole`), `decodeMockSession(v: string|undefined): Session|null`
  - `type ClerkUserLike`, `sessionFromClerkUser(user: ClerkUserLike): Session`
  - `getSession(): Promise<Session|null>`, `requireSession(locale: string): Promise<AuthedSession>`, `requirePermission(locale: string, p: Permission): Promise<AuthedSession>`

- [ ] **Step 1: Install dependencies**

```bash
pnpm add zod@4.6.7 server-only@0.0.1 @clerk/nextjs@7.9.18
```

- [ ] **Step 2: Write the failing tests**

```ts
// tests/unit/env.test.ts
import { describe, expect, it } from "vitest";
import { MOCK_ENGINE_BASE_URL, parseServerEnv } from "@/lib/env";

describe("parseServerEnv", () => {
  it("defaults to the mock engine and test logins", () => {
    expect(parseServerEnv({})).toEqual({
      engineMode: "mock",
      engineBaseUrl: MOCK_ENGINE_BASE_URL,
      engineApiKey: "mock-key",
      authMode: "mock",
    });
  });

  it("treats empty strings as unset", () => {
    expect(parseServerEnv({ ENGINE_BASE_URL: "", ENGINE_API_KEY: "", AUTH_MODE: "" }).authMode).toBe("mock");
  });

  it("refuses test logins on Vercel", () => {
    expect(() => parseServerEnv({ AUTH_MODE: "mock", VERCEL: "1" })).toThrow(/refused on Vercel/);
    expect(() => parseServerEnv({ VERCEL: "1" })).toThrow(/refused on Vercel/);
  });

  it("allows Clerk on Vercel", () => {
    expect(parseServerEnv({ AUTH_MODE: "clerk", VERCEL: "1" }).authMode).toBe("clerk");
  });

  it("requires a base URL and key for the live engine", () => {
    expect(() => parseServerEnv({ ENGINE_MODE: "live" })).toThrow(/ENGINE_BASE_URL and ENGINE_API_KEY/);
    expect(
      parseServerEnv({ ENGINE_MODE: "live", ENGINE_BASE_URL: "https://api.example.com/api/v1", ENGINE_API_KEY: "k" }),
    ).toMatchObject({ engineMode: "live", engineBaseUrl: "https://api.example.com/api/v1", engineApiKey: "k" });
  });

  it("passes a provided key to the mock engine", () => {
    expect(parseServerEnv({ ENGINE_API_KEY: "e2e-key" }).engineApiKey).toBe("e2e-key");
  });
});
```

```ts
// tests/unit/auth.test.ts
import { describe, expect, it } from "vitest";
import { sessionFromClerkUser } from "@/lib/auth/clerk-session";
import { decodeMockSession, MOCK_USERS } from "@/lib/auth/mock-session";
import { can, isRole } from "@/lib/auth/roles";

describe("roles", () => {
  it("knows exactly two roles", () => {
    expect(isRole("admin")).toBe(true);
    expect(isRole("reviewer")).toBe(true);
    expect(isRole("owner")).toBe(false);
    expect(isRole(undefined)).toBe(false);
  });

  it("gives admins every permission", () => {
    for (const p of ["content.work", "siteHealth.view", "siteHealth.apply", "settings.manage", "users.manage", "plan.manage"] as const) {
      expect(can("admin", p)).toBe(true);
    }
  });

  it("limits reviewers to content work and viewing site health (design §5)", () => {
    expect(can("reviewer", "content.work")).toBe(true);
    expect(can("reviewer", "siteHealth.view")).toBe(true);
    expect(can("reviewer", "siteHealth.apply")).toBe(false);
    expect(can("reviewer", "settings.manage")).toBe(false);
    expect(can("reviewer", "users.manage")).toBe(false);
    expect(can("reviewer", "plan.manage")).toBe(false);
  });
});

describe("mock sessions", () => {
  it("decodes the three fixed test users", () => {
    expect(MOCK_USERS.map((u) => u.userId)).toEqual(["dev_admin", "dev_reviewer", "dev_norole"]);
    expect(decodeMockSession("dev_reviewer")?.role).toBe("reviewer");
    expect(decodeMockSession("dev_norole")?.role).toBeNull();
  });

  it("can't be used to invent a user or role", () => {
    expect(decodeMockSession(undefined)).toBeNull();
    expect(decodeMockSession("admin")).toBeNull();
    expect(decodeMockSession('{"role":"admin"}')).toBeNull();
  });
});

describe("sessionFromClerkUser", () => {
  const base = { id: "user_1", fullName: "Sara Ali", primaryEmailAddress: { emailAddress: "sara@example.com" } };

  it("reads the role from public metadata", () => {
    expect(sessionFromClerkUser({ ...base, publicMetadata: { role: "admin" } })).toEqual({
      userId: "user_1",
      email: "sara@example.com",
      name: "Sara Ali",
      role: "admin",
    });
  });

  it("gives no role for a missing or unknown role", () => {
    expect(sessionFromClerkUser({ ...base, publicMetadata: {} }).role).toBeNull();
    expect(sessionFromClerkUser({ ...base, publicMetadata: { role: "owner" } }).role).toBeNull();
    expect(sessionFromClerkUser({ ...base, publicMetadata: null }).role).toBeNull();
  });

  it("falls back to the email when there is no name", () => {
    expect(sessionFromClerkUser({ ...base, fullName: null, publicMetadata: {} }).name).toBe("sara@example.com");
  });
});
```

```ts
// tests/unit/session.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { cookieJar } = vi.hoisted(() => ({ cookieJar: new Map<string, string>() }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined),
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));

import { getSession, requirePermission, requireSession } from "@/lib/auth/session";

describe("session guards (test logins)", () => {
  beforeEach(() => {
    cookieJar.clear();
    vi.stubEnv("AUTH_MODE", "mock");
    vi.stubEnv("ENGINE_MODE", "mock");
    vi.stubEnv("VERCEL", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("sends signed-out visitors to sign-in", async () => {
    await expect(requireSession("en")).rejects.toThrow("REDIRECT:/en/sign-in");
  });

  it("sends people without a role to the no-access page", async () => {
    cookieJar.set("dev_session", "dev_norole");
    await expect(requireSession("ar")).rejects.toThrow("REDIRECT:/ar/no-access");
  });

  it("returns the signed-in reviewer", async () => {
    cookieJar.set("dev_session", "dev_reviewer");
    await expect(requireSession("en")).resolves.toMatchObject({ userId: "dev_reviewer", role: "reviewer" });
  });

  it("sends a reviewer away from admin-only screens", async () => {
    cookieJar.set("dev_session", "dev_reviewer");
    await expect(requirePermission("en", "settings.manage")).rejects.toThrow("REDIRECT:/en");
  });

  it("lets an admin into admin-only screens", async () => {
    cookieJar.set("dev_session", "dev_admin");
    await expect(requirePermission("en", "settings.manage")).resolves.toMatchObject({ role: "admin" });
  });

  it("refuses test logins on Vercel", async () => {
    vi.stubEnv("VERCEL", "1");
    await expect(getSession()).rejects.toThrow(/refused on Vercel/);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm test`
Expected: FAIL. `@/lib/env`, `@/lib/auth/*` can't be resolved.

- [ ] **Step 4: Implement**

```ts
// src/lib/env.ts
import "server-only";
import { z } from "zod";

export const MOCK_ENGINE_BASE_URL = "https://mock.engine.local/api/v1";
const MOCK_ENGINE_DEFAULT_KEY = "mock-key";

const EnvSchema = z.object({
  ENGINE_MODE: z.enum(["mock", "live"]).default("mock"),
  ENGINE_BASE_URL: z.url().optional(),
  ENGINE_API_KEY: z.string().min(1).optional(),
  AUTH_MODE: z.enum(["mock", "clerk"]).default("mock"),
  VERCEL: z.string().optional(),
});

export type ServerEnv = {
  engineMode: "mock" | "live";
  engineBaseUrl: string;
  engineApiKey: string;
  authMode: "mock" | "clerk";
};

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const cleaned = Object.fromEntries(
    Object.entries(source).map(([key, value]) => [key, value === "" ? undefined : value]),
  );
  const env = EnvSchema.parse(cleaned);

  if (env.AUTH_MODE === "mock" && env.VERCEL === "1") {
    throw new Error("AUTH_MODE=mock is for local development only and is refused on Vercel. Set AUTH_MODE=clerk.");
  }

  if (env.ENGINE_MODE === "live") {
    if (!env.ENGINE_BASE_URL || !env.ENGINE_API_KEY) {
      throw new Error("ENGINE_MODE=live needs ENGINE_BASE_URL and ENGINE_API_KEY.");
    }
    return {
      engineMode: "live",
      engineBaseUrl: env.ENGINE_BASE_URL,
      engineApiKey: env.ENGINE_API_KEY,
      authMode: env.AUTH_MODE,
    };
  }

  return {
    engineMode: "mock",
    engineBaseUrl: MOCK_ENGINE_BASE_URL,
    engineApiKey: env.ENGINE_API_KEY ?? MOCK_ENGINE_DEFAULT_KEY,
    authMode: env.AUTH_MODE,
  };
}

/** Parsed on every call (cheap), so tests and runtime always see the current environment. */
export function serverEnv(): ServerEnv {
  return parseServerEnv(process.env);
}
```

```ts
// src/lib/auth/roles.ts
export const ROLES = ["admin", "reviewer"] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export type Permission =
  | "content.work" // keywords, ideas, drafting, import, review, edit, approve, override, schedule, history
  | "siteHealth.view"
  | "siteHealth.apply" // changes the live website
  | "settings.manage" // SEO profile, schedule, website connection, social, webhook
  | "users.manage"
  | "plan.manage";

const PERMISSIONS: Record<Role, readonly Permission[]> = {
  admin: ["content.work", "siteHealth.view", "siteHealth.apply", "settings.manage", "users.manage", "plan.manage"],
  reviewer: ["content.work", "siteHealth.view"],
};

export function can(role: Role, permission: Permission): boolean {
  return PERMISSIONS[role].includes(permission);
}
```

```ts
// src/lib/auth/types.ts
import type { Role } from "./roles";

export type Session = { userId: string; email: string; name: string; role: Role | null };
export type AuthedSession = Omit<Session, "role"> & { role: Role };
```

```ts
// src/lib/auth/mock-session.ts
import type { Session } from "./types";

export const MOCK_SESSION_COOKIE = "dev_session";

export const MOCK_USERS: readonly Session[] = [
  { userId: "dev_admin", email: "admin@example.com", name: "Admin (test)", role: "admin" },
  { userId: "dev_reviewer", email: "reviewer@example.com", name: "Reviewer (test)", role: "reviewer" },
  { userId: "dev_norole", email: "pending@example.com", name: "No role (test)", role: null },
];

/** The cookie holds only the id of one of the fixed test users, so it can't be used to invent a role. */
export function decodeMockSession(value: string | undefined): Session | null {
  if (!value) return null;
  return MOCK_USERS.find((user) => user.userId === value) ?? null;
}
```

```ts
// src/lib/auth/clerk-session.ts
import { isRole } from "./roles";
import type { Session } from "./types";

/** The parts of Clerk's User we read; `currentUser()`'s result satisfies this structurally. */
export type ClerkUserLike = {
  id: string;
  fullName: string | null;
  primaryEmailAddress: { emailAddress: string } | null;
  publicMetadata: Record<string, unknown> | null | undefined;
};

export function sessionFromClerkUser(user: ClerkUserLike): Session {
  const email = user.primaryEmailAddress?.emailAddress ?? "";
  const role = user.publicMetadata?.role;
  return { userId: user.id, email, name: user.fullName || email, role: isRole(role) ? role : null };
}
```

```ts
// src/lib/auth/session.ts
import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { serverEnv } from "@/lib/env";
import { sessionFromClerkUser } from "./clerk-session";
import { decodeMockSession, MOCK_SESSION_COOKIE } from "./mock-session";
import { can, type Permission } from "./roles";
import type { AuthedSession, Session } from "./types";

/** Reads the signed-in person. Call only inside a component rendered under <Suspense>. */
export async function getSession(): Promise<Session | null> {
  if (serverEnv().authMode === "mock") {
    return decodeMockSession((await cookies()).get(MOCK_SESSION_COOKIE)?.value);
  }
  const { currentUser } = await import("@clerk/nextjs/server");
  const user = await currentUser();
  return user ? sessionFromClerkUser(user) : null;
}

/** Signed in with a role, or redirected to sign-in / no-access. */
export async function requireSession(locale: string): Promise<AuthedSession> {
  const session = await getSession();
  if (!session) redirect(`/${locale}/sign-in`);
  if (!session.role) redirect(`/${locale}/no-access`);
  return { ...session, role: session.role };
}

/** Like requireSession, and redirects to the dashboard when the role lacks the permission. */
export async function requirePermission(locale: string, permission: Permission): Promise<AuthedSession> {
  const session = await requireSession(locale);
  if (!can(session.role, permission)) redirect(`/${locale}`);
  return session;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test`
Expected: PASS (format 9, env 6, auth 8, session 6).

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: exit 0. In particular, `sessionFromClerkUser(user)` accepts Clerk's `User`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add server env parsing, roles, test logins and Clerk session mapping"
```

---

### Task 4: Engine schemas, errors and HTTP client

**Files:**
- Create: `src/lib/engine/schemas.ts`, `src/lib/engine/errors.ts`, `src/lib/engine/client.ts`, `src/lib/engine/result.ts`
- Test: `tests/unit/engine-client.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces:
  - **Schemas and types:** `MetaSchema`/`Meta`, `SiteSchema`/`Site`, `SitesSchema`, `QuotaSchema`/`Quota`, `PlanSchema`/`Plan`, `PostSummarySchema`/`PostSummary`, `ScheduledSchema`/`Scheduled`, `ListMeta`
  - `class EngineError extends Error { status: number; code: string; fields?: Record<string,string>; details?: Record<string,unknown> }`, `isEngineError(e): e is EngineError`
  - **Local error codes:** `network_error` (status 0), `engine_unavailable` (non-JSON response), `invalid_response` (shape drift)
  - **Client types:** `type FetchLike = (input: string, init: RequestInit) => Promise<Response>`, `type EngineClientConfig = { baseUrl: string; apiKey: string; fetch: FetchLike; retryDelaysMs?: readonly number[] }`
  - **Client:** `createEngineClient(config)` → `{ request<S extends z.ZodType>(req: EngineRequest<S>): Promise<{ data: z.infer<S>; meta: ListMeta | null }> }`, where `EngineRequest<S> = { method: "GET"|"POST"|"PUT"|"DELETE"; path: string; schema: S; query?: Record<string, string|number|boolean|undefined>; body?: unknown; actingUser?: string; idempotencyKey?: string }`; `type EngineClient`
  - **Result helpers:** `type EngineFailure = { status: number; code: string; message: string }`, `type EngineResult<T> = { ok: true; data: T } | { ok: false; error: EngineFailure }`, `tryEngine<T>(fn: () => Promise<T>): Promise<EngineResult<T>>`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/engine-client.test.ts
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createEngineClient, type FetchLike } from "@/lib/engine/client";
import { EngineError } from "@/lib/engine/errors";
import { tryEngine } from "@/lib/engine/result";

type Call = { url: string; init: RequestInit };

function recorder(responses: Array<Response | Error>) {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (!next) throw new Error("No more fake responses");
    if (next instanceof Error) throw next;
    return next;
  };
  return { calls, fetch };
}

const okJson = (data: unknown, meta?: unknown) => Response.json({ ok: true, data, ...(meta ? { meta } : {}) });
const errJson = (status: number, error: Record<string, unknown>) => Response.json({ ok: false, error }, { status });
const headersOf = (call: Call) => new Headers(call.init.headers);
const Thing = z.object({ id: z.string() });
const config = (fetch: FetchLike) => ({
  baseUrl: "https://api.example.com/api/v1/",
  apiKey: "secret-key",
  fetch,
  retryDelaysMs: [0, 0],
});

async function failure(promise: Promise<unknown>): Promise<EngineError> {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(EngineError);
  return error as EngineError;
}

describe("engine client", () => {
  it("GET: sends the key, encodes the query, returns data and list meta", async () => {
    const { calls, fetch } = recorder([okJson([{ id: "a" }], { page: 1, pageSize: 25, total: 1 })]);
    const client = createEngineClient(config(fetch));

    const res = await client.request({
      method: "GET",
      path: "/things",
      schema: z.array(Thing),
      query: { status: "pending,drafting", page: 1, q: undefined },
    });

    expect(res).toEqual({ data: [{ id: "a" }], meta: { page: 1, pageSize: 25, total: 1 } });
    expect(calls[0].url).toBe("https://api.example.com/api/v1/things?status=pending%2Cdrafting&page=1");
    expect(calls[0].init.method).toBe("GET");
    expect(headersOf(calls[0]).get("X-Api-Key")).toBe("secret-key");
    expect(headersOf(calls[0]).get("Idempotency-Key")).toBeNull();
    expect(headersOf(calls[0]).get("X-Acting-User")).toBeNull();
  });

  it("POST: sends the acting user, the idempotency key and a JSON body", async () => {
    const { calls, fetch } = recorder([okJson({ id: "p_1" })]);
    const client = createEngineClient(config(fetch));

    await client.request({
      method: "POST",
      path: "/posts/p_1/approve",
      schema: Thing,
      body: { overrideReason: "checked by hand" },
      actingUser: "sara@example.com",
      idempotencyKey: "key-123",
    });

    const headers = headersOf(calls[0]);
    expect(headers.get("Idempotency-Key")).toBe("key-123");
    expect(headers.get("X-Acting-User")).toBe("sara@example.com");
    expect(headers.get("Content-Type")).toBe("application/json; charset=utf-8");
    expect(calls[0].init.body).toBe(JSON.stringify({ overrideReason: "checked by hand" }));
  });

  it("generates an idempotency key for a change when none is given", async () => {
    const { calls, fetch } = recorder([okJson({ id: "p_1" })]);
    await createEngineClient(config(fetch)).request({ method: "DELETE", path: "/posts/p_1", schema: Thing });
    expect(headersOf(calls[0]).get("Idempotency-Key")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("turns an error envelope into an EngineError with its details", async () => {
    const { fetch } = recorder([
      errJson(429, {
        code: "quota_exceeded",
        message: "Monthly limit reached for articles",
        details: { metric: "articles", used: 40, limit: 40 },
      }),
    ]);
    const error = await failure(createEngineClient(config(fetch)).request({ method: "GET", path: "/x", schema: Thing }));
    expect(error).toMatchObject({
      status: 429,
      code: "quota_exceeded",
      message: "Monthly limit reached for articles",
      details: { metric: "articles", used: 40, limit: 40 },
    });
  });

  it("retries a read twice after network failures", async () => {
    const { calls, fetch } = recorder([new TypeError("fetch failed"), new TypeError("fetch failed"), okJson({ id: "a" })]);
    const res = await createEngineClient(config(fetch)).request({ method: "GET", path: "/x", schema: Thing });
    expect(res.data).toEqual({ id: "a" });
    expect(calls).toHaveLength(3);
  });

  it("gives up after three failed reads with network_error", async () => {
    const { calls, fetch } = recorder([new TypeError("a"), new TypeError("b"), new TypeError("c")]);
    const error = await failure(createEngineClient(config(fetch)).request({ method: "GET", path: "/x", schema: Thing }));
    expect(error).toMatchObject({ status: 0, code: "network_error" });
    expect(calls).toHaveLength(3);
  });

  it("never retries a change automatically", async () => {
    const { calls, fetch } = recorder([new TypeError("fetch failed")]);
    const error = await failure(
      createEngineClient(config(fetch)).request({ method: "POST", path: "/x", schema: Thing, idempotencyKey: "k" }),
    );
    expect(error.code).toBe("network_error");
    expect(calls).toHaveLength(1);
  });

  it("reports an HTML error page as engine_unavailable", async () => {
    const { fetch } = recorder([
      new Response("<html>Bad gateway</html>", { status: 502, headers: { "content-type": "text/html" } }),
    ]);
    const error = await failure(createEngineClient(config(fetch)).request({ method: "GET", path: "/x", schema: Thing }));
    expect(error).toMatchObject({ status: 502, code: "engine_unavailable" });
  });

  it("reports data in the wrong shape as invalid_response", async () => {
    const { fetch } = recorder([okJson({ id: 42 })]);
    const error = await failure(createEngineClient(config(fetch)).request({ method: "GET", path: "/x", schema: Thing }));
    expect(error.code).toBe("invalid_response");
  });

  it("reports a malformed envelope as invalid_response", async () => {
    const { fetch } = recorder([Response.json({ data: { id: "a" } })]);
    const error = await failure(createEngineClient(config(fetch)).request({ method: "GET", path: "/x", schema: Thing }));
    expect(error.code).toBe("invalid_response");
  });
});

describe("tryEngine", () => {
  it("wraps success", async () => {
    await expect(tryEngine(async () => 5)).resolves.toEqual({ ok: true, data: 5 });
  });

  it("turns an EngineError into a failure value", async () => {
    const result = await tryEngine(async () => {
      throw new EngineError({ status: 401, code: "unauthorized", message: "Key revoked" });
    });
    expect(result).toEqual({ ok: false, error: { status: 401, code: "unauthorized", message: "Key revoked" } });
  });

  it("rethrows anything that isn't an EngineError", async () => {
    await expect(
      tryEngine(async () => {
        throw new Error("bug");
      }),
    ).rejects.toThrow("bug");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test tests/unit/engine-client.test.ts`
Expected: FAIL. `@/lib/engine/client` can't be resolved.

- [ ] **Step 3: Implement the schemas (spec v1.1 §3–4)**

```ts
// src/lib/engine/schemas.ts
import { z } from "zod";

const isoDateTime = z.iso.datetime({ offset: true });

// ── Envelope (spec §3) ───────────────────────────────────────────────────────
export const EngineErrorBodySchema = z.object({
  code: z.string(),
  message: z.string(),
  fields: z.record(z.string(), z.string()).nullish(),
  details: z.record(z.string(), z.unknown()).nullish(),
});

export const ListMetaSchema = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});
export type ListMeta = z.infer<typeof ListMetaSchema>;

export const EnvelopeSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), data: z.unknown(), meta: ListMetaSchema.nullish() }),
  z.object({ ok: z.literal(false), error: EngineErrorBodySchema }),
]);

// ── Meta (spec §4 "Meta") ────────────────────────────────────────────────────
const TargetFieldSchema = z.object({ key: z.string(), label: z.string(), kind: z.string(), required: z.boolean() });

export const TargetTypeSchema = z.object({
  type: z.string(),
  label: z.string(),
  fields: z.array(TargetFieldSchema),
  bodyFormats: z.array(z.string()),
  arabicModes: z.array(z.string()),
});

export const MetaSchema = z.object({
  languages: z.array(z.string()),
  platforms: z.array(z.string()),
  kinds: z.array(z.string()),
  metrics: z.array(z.string()),
  limits: z.object({
    metaTitle: z.number().int(),
    metaDescription: z.number().int(),
    photoMaxBytes: z.number().int(),
    photoTypes: z.array(z.string()),
    importMaxBytes: z.number().int().nullish(),
    importTypes: z.array(z.string()).nullish(),
    pageSizeDefault: z.number().int(),
    pageSizeMax: z.number().int(),
    lockMinutes: z.number().int(),
  }),
  pollSeconds: z.number().positive(),
  features: z.array(z.string()),
  targetTypes: z.array(TargetTypeSchema),
});
export type Meta = z.infer<typeof MetaSchema>;

// ── Site (spec §4 "Site") ────────────────────────────────────────────────────
// Statuses are open strings (known: ok | expiring | error | missing) so a new value never breaks the page.
const ConnectionStatusSchema = z.string();

export const SiteSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  name: z.string(),
  url: z.url(),
  category: z.string(),
  timezone: z.string(),
  languages: z.array(z.string()),
  defaultLanguage: z.string(),
  connections: z.object({
    website: z.object({ type: z.string().nullish(), status: ConnectionStatusSchema }),
    linkedin: ConnectionStatusSchema,
    instagram: ConnectionStatusSchema,
    searchConsole: ConnectionStatusSchema.nullish(),
  }),
  counts: z.object({
    suggestions: z.number().int(),
    pending: z.number().int(),
    approved: z.number().int(),
    scheduled: z.number().int(),
    published: z.number().int(),
    failed: z.number().int(),
    keywordsNew: z.number().int(),
  }),
  createdAt: isoDateTime,
});
export type Site = z.infer<typeof SiteSchema>;
export const SitesSchema = z.array(SiteSchema);

// ── Plan & Quota (spec §4) ───────────────────────────────────────────────────
export const QuotaSchema = z.object({
  metric: z.string(),
  limit: z.number().nullable(),
  used: z.number(),
  scope: z.string().nullish(),
  mode: z.string().nullish(),
  warnAt: z.number().nullish(),
});
export type Quota = z.infer<typeof QuotaSchema>;

export const PlanSchema = z.object({
  plan: z.object({ id: z.string(), name: z.string() }),
  period: z.object({ start: isoDateTime, end: isoDateTime }),
  quotas: z.array(QuotaSchema),
  metrics: z.array(z.string()),
});
export type Plan = z.infer<typeof PlanSchema>;

// ── Scheduled (spec §7 GET …/scheduled) ──────────────────────────────────────
export const PostSummarySchema = z.object({
  id: z.string(),
  kind: z.string(),
  platform: z.string(),
  language: z.string(),
  status: z.string(),
  title: z.string(),
  schedule: z
    .object({ hold: z.boolean(), scheduledAt: isoDateTime.nullish(), position: z.number().int() })
    .nullish(),
  updatedAt: isoDateTime,
});
export type PostSummary = z.infer<typeof PostSummarySchema>;

export const ScheduledSchema = z.object({
  autoPublish: z.boolean(),
  nextSlotAt: isoDateTime.nullish(),
  waitingReason: z.string().nullish(),
  posts: z.array(PostSummarySchema),
});
export type Scheduled = z.infer<typeof ScheduledSchema>;
```

- [ ] **Step 4: Implement the errors, client and result helper**

```ts
// src/lib/engine/errors.ts
type EngineErrorInit = {
  status: number;
  code: string;
  message: string;
  fields?: Record<string, string> | null;
  details?: Record<string, unknown> | null;
};

export class EngineError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string>;
  readonly details?: Record<string, unknown>;

  constructor(init: EngineErrorInit) {
    super(init.message);
    this.name = "EngineError";
    this.status = init.status;
    this.code = init.code;
    this.fields = init.fields ?? undefined;
    this.details = init.details ?? undefined;
  }
}

export function isEngineError(error: unknown): error is EngineError {
  return error instanceof EngineError;
}
```

```ts
// src/lib/engine/client.ts
import { z } from "zod";
import { EngineError } from "./errors";
import { EnvelopeSchema, type ListMeta } from "./schemas";

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;
export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

export type EngineClientConfig = {
  baseUrl: string;
  apiKey: string;
  fetch: FetchLike;
  /** Delays between read retries; reads are tried retryDelaysMs.length + 1 times. */
  retryDelaysMs?: readonly number[];
};

export type EngineRequest<S extends z.ZodType> = {
  method: HttpMethod;
  path: string; // starts with "/", relative to the base URL
  schema: S;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  actingUser?: string;
  idempotencyKey?: string;
};

export type EngineResponse<T> = { data: T; meta: ListMeta | null };

const DEFAULT_RETRY_DELAYS_MS = [250, 750] as const;

export function createEngineClient(config: EngineClientConfig) {
  const base = config.baseUrl.replace(/\/+$/, "");
  const retryDelays = config.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;

  async function request<S extends z.ZodType>(req: EngineRequest<S>): Promise<EngineResponse<z.infer<S>>> {
    const url = new URL(base + req.path);
    for (const [key, value] of Object.entries(req.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const headers: Record<string, string> = { "X-Api-Key": config.apiKey, Accept: "application/json" };
    if (req.actingUser) headers["X-Acting-User"] = req.actingUser;
    if (req.method !== "GET") headers["Idempotency-Key"] = req.idempotencyKey ?? crypto.randomUUID();

    let body: string | undefined;
    if (req.body !== undefined) {
      headers["Content-Type"] = "application/json; charset=utf-8";
      body = JSON.stringify(req.body);
    }

    // Only reads are retried; a change is never repeated automatically (design §9).
    const attempts = req.method === "GET" ? retryDelays.length + 1 : 1;
    for (let attempt = 0; ; attempt++) {
      try {
        const response = await config.fetch(url.toString(), { method: req.method, headers, body, cache: "no-store" });
        return await parseResponse(response, req.schema);
      } catch (error) {
        if (error instanceof EngineError) throw error;
        if (attempt >= attempts - 1) {
          throw new EngineError({
            status: 0,
            code: "network_error",
            message: "The content engine could not be reached. Try again shortly.",
          });
        }
        await sleep(retryDelays[attempt] ?? 0);
      }
    }
  }

  return { request };
}

export type EngineClient = ReturnType<typeof createEngineClient>;

async function parseResponse<S extends z.ZodType>(response: Response, schema: S): Promise<EngineResponse<z.infer<S>>> {
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new EngineError({
      status: response.status,
      code: "engine_unavailable",
      message: `The content engine returned an unreadable response (HTTP ${response.status}).`,
    });
  }

  const envelope = EnvelopeSchema.safeParse(json);
  if (!envelope.success) {
    throw new EngineError({
      status: response.status,
      code: "invalid_response",
      message: "The content engine sent a response in an unexpected format.",
    });
  }

  if (!envelope.data.ok) {
    const { code, message, fields, details } = envelope.data.error;
    throw new EngineError({ status: response.status, code, message, fields, details });
  }

  const data = schema.safeParse(envelope.data.data);
  if (!data.success) {
    throw new EngineError({
      status: response.status,
      code: "invalid_response",
      message: "The content engine sent data in an unexpected format.",
      details: { issues: z.prettifyError(data.error) },
    });
  }

  return { data: data.data, meta: envelope.data.meta ?? null };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

```ts
// src/lib/engine/result.ts
import { isEngineError } from "./errors";

export type EngineFailure = { status: number; code: string; message: string };
export type EngineResult<T> = { ok: true; data: T } | { ok: false; error: EngineFailure };

/** Engine failures become values so a section can show a readable notice (Next hides thrown messages in production). */
export async function tryEngine<T>(fn: () => Promise<T>): Promise<EngineResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    if (isEngineError(error)) {
      return { ok: false, error: { status: error.status, code: error.code, message: error.message } };
    }
    throw error;
  }
}
```

The retry loop treats only non-`EngineError` throws (network failures from `fetch`) as retryable. An `EngineError` from `parseResponse` (an error envelope, `engine_unavailable`, `invalid_response`) is a real answer and is rethrown immediately.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test`
Expected: PASS, including the 10 client and 3 `tryEngine` tests.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add v1.1 response schemas and a server engine client with retries, idempotency and drift detection"
```

---

### Task 5: Mock engine and engine API

**Files:**
- Create: `src/lib/engine/mock/fixtures.ts`, `src/lib/engine/mock/server.ts`, `src/lib/engine/api.ts`, `src/lib/engine/index.ts`, `src/lib/engine/notice.ts`
- Test: `tests/unit/engine-mock.test.ts`

**Interfaces:**
- Consumes: from Task 4, `createEngineClient`, `EngineClient`, `FetchLike`, `EngineError`, and the schemas; from Task 3, `serverEnv()`
- Produces:
  - `MOCK_SITE_ID = "site_fakher"`, `mockMeta()`, `mockSite()`, `mockScheduled()`, `mockPlan()`
  - `type MockScenario = "normal"|"unauthorized"|"down"|"drift"`, `isMockScenario(v): v is MockScenario`, `MOCK_SCENARIO_COOKIE = "mock_scenario"`
  - `createMockFetch(opts: { baseUrl: string; apiKey: string; scenario?: MockScenario }): FetchLike`
  - `createEngineApi(client)` → `{ siteId(): Promise<string>; meta(): Promise<Meta>; site(): Promise<Site>; plan(): Promise<Plan>; scheduled(o?: { pageSize?: number }): Promise<Scheduled> }`, `type EngineApi`
  - `getEngine(): Promise<EngineApi>`: per-request (React `cache`), server-only
  - `engineNoticeKey(code: string): "serviceUnavailable"|"engineUnreachable"|"engineInvalid"|null`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/engine-mock.test.ts
import { describe, expect, it } from "vitest";
import { createEngineApi } from "@/lib/engine/api";
import { createEngineClient } from "@/lib/engine/client";
import { EngineError } from "@/lib/engine/errors";
import { MOCK_SITE_ID, mockMeta, mockPlan, mockScheduled, mockSite } from "@/lib/engine/mock/fixtures";
import { createMockFetch, isMockScenario, type MockScenario } from "@/lib/engine/mock/server";
import { engineNoticeKey } from "@/lib/engine/notice";
import { MetaSchema, PlanSchema, ScheduledSchema, SiteSchema } from "@/lib/engine/schemas";

const BASE = "https://mock.engine.local/api/v1";

function setup(options: { scenario?: MockScenario; clientKey?: string } = {}) {
  const calls: string[] = [];
  const mockFetch = createMockFetch({ baseUrl: BASE, apiKey: "mock-key", scenario: options.scenario });
  const client = createEngineClient({
    baseUrl: BASE,
    apiKey: options.clientKey ?? "mock-key",
    retryDelaysMs: [0, 0],
    fetch: (url, init) => {
      calls.push(`${init.method} ${new URL(url).pathname}`);
      return mockFetch(url, init);
    },
  });
  return { client, engine: createEngineApi(client), calls };
}

async function failure(promise: Promise<unknown>): Promise<EngineError> {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(EngineError);
  return error as EngineError;
}

describe("mock fixtures", () => {
  it("match the v1.1 schemas", () => {
    expect(MetaSchema.safeParse(mockMeta()).success).toBe(true);
    expect(SiteSchema.safeParse(mockSite()).success).toBe(true);
    expect(ScheduledSchema.safeParse(mockScheduled()).success).toBe(true);
    expect(PlanSchema.safeParse(mockPlan()).success).toBe(true);
  });

  it("describe Fakher & Co as a legal consultancy, never a law firm", () => {
    expect(mockSite().category).toBe("legal consultancy");
    expect(JSON.stringify([mockSite(), mockScheduled(), mockPlan()]).toLowerCase()).not.toContain("law firm");
  });
});

describe("engine API over the mock engine", () => {
  it("resolves the site once per request and returns typed data", async () => {
    const { engine, calls } = setup();
    const site = await engine.site();
    const scheduled = await engine.scheduled({ pageSize: 2 });
    await engine.site();

    expect(site.id).toBe(MOCK_SITE_ID);
    expect(site.timezone).toBe("Asia/Dubai");
    expect(scheduled.posts).toHaveLength(2);
    expect(calls.filter((c) => c === "GET /api/v1/sites")).toHaveLength(1);
    expect(calls.filter((c) => c === `GET /api/v1/sites/${MOCK_SITE_ID}`)).toHaveLength(1);
  });

  it("returns meta and the plan", async () => {
    const { engine } = setup();
    expect((await engine.meta()).pollSeconds).toBeGreaterThan(0);
    expect((await engine.plan()).plan.name).toBe("Pro");
  });

  it("rejects a wrong key with 401 unauthorized", async () => {
    const { engine } = setup({ clientKey: "wrong" });
    expect(await failure(engine.plan())).toMatchObject({ status: 401, code: "unauthorized" });
  });

  it("simulates a revoked key", async () => {
    const { engine } = setup({ scenario: "unauthorized" });
    expect((await failure(engine.meta())).code).toBe("unauthorized");
  });

  it("simulates an unreachable engine", async () => {
    const { engine } = setup({ scenario: "down" });
    expect((await failure(engine.plan())).code).toBe("network_error");
  });

  it("simulates a changed response shape for the site only", async () => {
    const { engine } = setup({ scenario: "drift" });
    expect((await failure(engine.site())).code).toBe("invalid_response");
    await expect(engine.plan()).resolves.toMatchObject({ plan: { name: "Pro" } });
  });

  it("answers unknown routes with not_found", async () => {
    const { client } = setup();
    const error = await failure(client.request({ method: "GET", path: "/nope", schema: MetaSchema }));
    expect(error).toMatchObject({ status: 404, code: "not_found" });
  });

  it("only accepts known scenario names", () => {
    expect(isMockScenario("drift")).toBe(true);
    expect(isMockScenario("explode")).toBe(false);
  });
});

describe("engineNoticeKey", () => {
  it("translates local and auth failures, and leaves engine messages as they are", () => {
    expect(engineNoticeKey("unauthorized")).toBe("serviceUnavailable");
    expect(engineNoticeKey("network_error")).toBe("engineUnreachable");
    expect(engineNoticeKey("engine_unavailable")).toBe("engineUnreachable");
    expect(engineNoticeKey("invalid_response")).toBe("engineInvalid");
    expect(engineNoticeKey("quota_exceeded")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test tests/unit/engine-mock.test.ts`
Expected: FAIL. `@/lib/engine/api` and the mock modules can't be resolved.

- [ ] **Step 3: Implement the fixtures**

```ts
// src/lib/engine/mock/fixtures.ts
import type { Meta, Plan, PostSummary, Scheduled, Site } from "../schemas";

export const MOCK_SITE_ID = "site_fakher";

export function mockMeta(): Meta {
  return {
    languages: ["en", "ar"],
    platforms: ["website", "linkedin", "instagram"],
    kinds: ["blog", "social"],
    metrics: ["articles", "socialPosts", "photos", "publishes", "siteScans", "aiTokens"],
    limits: {
      metaTitle: 60,
      metaDescription: 155,
      photoMaxBytes: 5_242_880,
      photoTypes: ["image/jpeg", "image/png", "image/webp"],
      importMaxBytes: 10_485_760,
      importTypes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/html"],
      pageSizeDefault: 25,
      pageSizeMax: 100,
      lockMinutes: 15,
    },
    pollSeconds: 3,
    features: [],
    targetTypes: [
      {
        type: "wordpress",
        label: "WordPress",
        fields: [
          { key: "url", label: "Site address", kind: "url", required: true },
          { key: "username", label: "Publishing user", kind: "text", required: true },
          { key: "secret", label: "Application password", kind: "secret", required: true },
          { key: "postType", label: "Post type", kind: "text", required: false },
        ],
        bodyFormats: ["html", "boldbuilder"],
        arabicModes: ["translatepress", "separate"],
      },
      {
        type: "strapi",
        label: "Strapi",
        fields: [
          { key: "url", label: "Strapi address", kind: "url", required: true },
          { key: "secret", label: "API token", kind: "secret", required: true },
          { key: "collection", label: "Collection", kind: "text", required: true },
        ],
        bodyFormats: ["blocks"],
        arabicModes: ["locale"],
      },
    ],
  };
}

export function mockSite(): Site {
  return {
    id: MOCK_SITE_ID,
    accountId: "acc_fakher",
    name: "Fakher & Co",
    url: "https://fakhernco.com",
    category: "legal consultancy",
    timezone: "Asia/Dubai",
    languages: ["en", "ar"],
    defaultLanguage: "en",
    connections: {
      website: { type: "wordpress", status: "ok" },
      linkedin: "expiring",
      instagram: "missing",
      searchConsole: null,
    },
    counts: { suggestions: 8, pending: 3, approved: 5, scheduled: 5, published: 41, failed: 1, keywordsNew: 12 },
    createdAt: "2026-10-20T18:29:00+04:00",
  };
}

const SCHEDULED_POSTS: readonly PostSummary[] = [
  {
    id: "p_101",
    kind: "blog",
    platform: "website",
    language: "en",
    status: "approved",
    title: "When does a commission become payable under UAE Labour Law?",
    schedule: { hold: false, scheduledAt: "2026-10-22T10:00:00+04:00", position: 1 },
    updatedAt: "2026-10-21T09:12:00+04:00",
  },
  {
    id: "p_102",
    kind: "blog",
    platform: "website",
    language: "ar",
    status: "approved",
    title: "متى تستحق العمولة وفق قانون العمل الإماراتي؟",
    schedule: { hold: false, scheduledAt: "2026-10-22T13:00:00+04:00", position: 2 },
    updatedAt: "2026-10-21T09:12:00+04:00",
  },
  {
    id: "p_103",
    kind: "social",
    platform: "linkedin",
    language: "en",
    status: "approved",
    title: "Commission rights after resignation",
    schedule: { hold: true, scheduledAt: null, position: 3 },
    updatedAt: "2026-10-21T08:40:00+04:00",
  },
];

export function mockScheduled(): Scheduled {
  return {
    autoPublish: true,
    nextSlotAt: "2026-10-22T10:00:00+04:00",
    waitingReason: null,
    posts: SCHEDULED_POSTS.map((post) => ({ ...post, schedule: post.schedule ? { ...post.schedule } : post.schedule })),
  };
}

export function mockPlan(): Plan {
  return {
    plan: { id: "plan_pro", name: "Pro" },
    period: { start: "2026-10-01T00:00:00+04:00", end: "2026-10-31T23:59:59+04:00" },
    quotas: [
      { metric: "articles", limit: 40, used: 31, scope: "account", mode: "hard", warnAt: 0.8 },
      { metric: "socialPosts", limit: 120, used: 110, scope: "account", mode: "soft", warnAt: 0.8 },
      { metric: "photos", limit: null, used: 60 },
      // A metric the interface has no label for: it must still show, using its raw name (Review Focus 5).
      { metric: "videoMinutes", limit: 10, used: 2, scope: "account", mode: "soft", warnAt: 0.8 },
    ],
    metrics: ["articles", "socialPosts", "photos", "publishes", "siteScans", "aiTokens", "sites", "videoMinutes"],
  };
}
```

- [ ] **Step 4: Implement the mock HTTP server, the API, the per-request facade and the notice mapping**

```ts
// src/lib/engine/mock/server.ts
import type { FetchLike } from "../client";
import { MOCK_SITE_ID, mockMeta, mockPlan, mockScheduled, mockSite } from "./fixtures";

export type MockScenario = "normal" | "unauthorized" | "down" | "drift";
const MOCK_SCENARIOS: readonly MockScenario[] = ["normal", "unauthorized", "down", "drift"];
export const MOCK_SCENARIO_COOKIE = "mock_scenario";

export function isMockScenario(value: unknown): value is MockScenario {
  return typeof value === "string" && (MOCK_SCENARIOS as readonly string[]).includes(value);
}

type MockOptions = { baseUrl: string; apiKey: string; scenario?: MockScenario };

/** An in-process stand-in for Quantum1st's API: same envelope, status codes and auth check. */
export function createMockFetch(options: MockOptions): FetchLike {
  const basePath = new URL(options.baseUrl).pathname.replace(/\/+$/, "");

  return async (input, init) => {
    const scenario = options.scenario ?? "normal";
    if (scenario === "down") throw new TypeError("fetch failed");

    const key = new Headers(init.headers).get("X-Api-Key");
    if (scenario === "unauthorized" || key !== options.apiKey) {
      return fail(401, "unauthorized", "Key missing, revoked, or the account is suspended.");
    }

    const url = new URL(input);
    if (!url.pathname.startsWith(basePath)) return fail(404, "not_found", "Not found.");
    const path = url.pathname.slice(basePath.length);
    const method = (init.method ?? "GET").toUpperCase();

    if (method === "GET" && path === "/meta") return ok(mockMeta());
    if (method === "GET" && path === "/sites") return ok([mockSite()]);
    if (method === "GET" && path === "/account/plan") return ok(mockPlan());

    const siteRoute = /^\/sites\/([^/]+)(\/.*)?$/.exec(path);
    if (siteRoute) {
      if (decodeURIComponent(siteRoute[1]) !== MOCK_SITE_ID) return fail(404, "not_found", "Site not found.");
      const rest = siteRoute[2] ?? "";
      if (method === "GET" && rest === "") return ok(scenario === "drift" ? driftedSite() : mockSite());
      if (method === "GET" && rest === "/scheduled") {
        const scheduled = mockScheduled();
        const pageSize = Number(url.searchParams.get("pageSize") ?? scheduled.posts.length);
        return ok({ ...scheduled, posts: scheduled.posts.slice(0, pageSize) });
      }
    }

    return fail(404, "not_found", `No mock route for ${method} ${path}.`);
  };
}

function ok(data: unknown): Response {
  return Response.json({ ok: true, data });
}

function fail(status: number, code: string, message: string): Response {
  return Response.json({ ok: false, error: { code, message } }, { status });
}

/** The site as an engine that changed its shape would send it: `counts` is gone. */
function driftedSite(): Record<string, unknown> {
  const site: Record<string, unknown> = { ...mockSite() };
  delete site.counts;
  return site;
}
```

```ts
// src/lib/engine/api.ts
import type { EngineClient } from "./client";
import { EngineError } from "./errors";
import { MetaSchema, PlanSchema, ScheduledSchema, SiteSchema, SitesSchema } from "./schemas";

/** Memoises an argument-less read for the life of one API instance (one request). */
function once<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined;
  return () => (pending ??= load());
}

export function createEngineApi(client: EngineClient) {
  const siteId = once(async () => {
    const { data } = await client.request({ method: "GET", path: "/sites", schema: SitesSchema });
    const first = data[0];
    if (!first) throw new EngineError({ status: 404, code: "not_found", message: "This API key has no site." });
    return first.id;
  });

  const sitePath = async () => `/sites/${encodeURIComponent(await siteId())}`;

  const meta = once(async () => (await client.request({ method: "GET", path: "/meta", schema: MetaSchema })).data);
  const site = once(async () => (await client.request({ method: "GET", path: await sitePath(), schema: SiteSchema })).data);
  const plan = once(async () => (await client.request({ method: "GET", path: "/account/plan", schema: PlanSchema })).data);

  async function scheduled(options: { pageSize?: number } = {}) {
    const { data } = await client.request({
      method: "GET",
      path: `${await sitePath()}/scheduled`,
      schema: ScheduledSchema,
      query: { pageSize: options.pageSize },
    });
    return data;
  }

  return { siteId, meta, site, plan, scheduled };
}

export type EngineApi = ReturnType<typeof createEngineApi>;
```

```ts
// src/lib/engine/index.ts
import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { serverEnv } from "@/lib/env";
import { createEngineApi } from "./api";
import { createEngineClient, type FetchLike } from "./client";
import { createMockFetch, isMockScenario, MOCK_SCENARIO_COOKIE } from "./mock/server";

/** One engine API per request. Call only inside a component rendered under <Suspense>. */
export const getEngine = cache(async () => {
  const env = serverEnv();
  let fetchImpl: FetchLike;

  if (env.engineMode === "mock") {
    const scenario = (await cookies()).get(MOCK_SCENARIO_COOKIE)?.value;
    fetchImpl = createMockFetch({
      baseUrl: env.engineBaseUrl,
      apiKey: env.engineApiKey,
      scenario: isMockScenario(scenario) ? scenario : "normal",
    });
  } else {
    fetchImpl = (input, init) => fetch(input, init);
  }

  return createEngineApi(createEngineClient({ baseUrl: env.engineBaseUrl, apiKey: env.engineApiKey, fetch: fetchImpl }));
});
```

```ts
// src/lib/engine/notice.ts
export type NoticeKey = "serviceUnavailable" | "engineUnreachable" | "engineInvalid";

/** Which translated message to show for an engine failure; null means show the engine's own message as it is. */
export function engineNoticeKey(code: string): NoticeKey | null {
  switch (code) {
    case "unauthorized":
      return "serviceUnavailable";
    case "network_error":
    case "engine_unavailable":
      return "engineUnreachable";
    case "invalid_response":
      return "engineInvalid";
    default:
      return null;
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test`
Expected: PASS for all suites (11 new tests in `engine-mock.test.ts`).

- [ ] **Step 6: Typecheck and commit**

Run: `pnpm typecheck`
Expected: exit 0.

```bash
git add -A
git commit -m "feat: add the mock engine (v1.1 fixtures and failure scenarios) and the per-request engine API"
```

---

### Task 6: Language routing, root layout and browser tests

**Files:**
- Create: `src/i18n/routing.ts`, `src/i18n/request.ts`, `src/i18n/navigation.ts`, `messages/en.json`, `messages/ar.json`, `src/proxy.ts`, `src/app/[locale]/layout.tsx`, `src/app/[locale]/(app)/page.tsx`, `src/app/api/health/route.ts`, `playwright.config.ts`, `tests/e2e/constants.ts`, `tests/e2e/helpers.ts`
- Modify: `next.config.ts`, `package.json` (script `e2e`)
- Delete: `src/app/layout.tsx`, `src/app/page.tsx`
- Test: `tests/e2e/locale.spec.ts`

**Interfaces:**
- Consumes: from Task 2, `LOCALES`, `DEFAULT_LOCALE`, `asAppLocale`, `directionOf`; from Task 1, `DirectionProvider`; from Task 3, `serverEnv`
- Produces:
  - `routing` (next-intl, `localePrefix: "always"`)
  - from `@/i18n/navigation`: `Link`, `redirect`, `usePathname`, `useRouter`, `getPathname`
  - message namespaces `Meta`, `Shell`, `SignIn`, `NoAccess`, `Dashboard`, `Errors` (complete for M1)
  - e2e helpers `signInWithCookie(context, user)`, `setMockScenario(context, scenario)`, `normalizeSpaces(text)`; constants `BASE_URL`, `E2E_ENGINE_KEY`

- [ ] **Step 1: Install next-intl and Playwright**

```bash
pnpm add next-intl@4.14.9
pnpm add -D @playwright/test@1.64.1
pnpm exec playwright install chromium
pnpm pkg set scripts.e2e="playwright test"
```

- [ ] **Step 2: Write the Playwright config, constants and helpers**

```ts
// tests/e2e/constants.ts
export const E2E_PORT = 3100;
export const BASE_URL = `http://localhost:${E2E_PORT}`;
/** Passed to the server as ENGINE_API_KEY; must never appear in anything the browser receives. */
export const E2E_ENGINE_KEY = "e2e-secret-key-do-not-leak";
```

```ts
// tests/e2e/helpers.ts
import type { BrowserContext } from "@playwright/test";
import { BASE_URL } from "./constants";

export type TestUser = "dev_admin" | "dev_reviewer" | "dev_norole";

export async function signInWithCookie(context: BrowserContext, user: TestUser): Promise<void> {
  await context.addCookies([{ name: "dev_session", value: user, url: BASE_URL }]);
}

export async function setMockScenario(
  context: BrowserContext,
  scenario: "normal" | "unauthorized" | "down" | "drift",
): Promise<void> {
  await context.addCookies([{ name: "mock_scenario", value: scenario, url: BASE_URL }]);
}

/** ICU uses narrow no-break spaces in times; compare with plain spaces. */
export function normalizeSpaces(text: string): string {
  return text.replace(/\s+/gu, " ");
}
```

```ts
// playwright.config.ts
import { defineConfig, devices } from "@playwright/test";
import { BASE_URL, E2E_ENGINE_KEY, E2E_PORT } from "./tests/e2e/constants";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  expect: { timeout: 10_000 },
  use: { baseURL: BASE_URL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // A production build: it also proves the Cache Components rules hold.
    command: `pnpm build && pnpm start -p ${E2E_PORT}`,
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: false,
    timeout: 300_000,
    env: { ENGINE_MODE: "mock", AUTH_MODE: "mock", ENGINE_API_KEY: E2E_ENGINE_KEY },
  },
});
```

- [ ] **Step 3: Write the failing e2e test**

```ts
// tests/e2e/locale.spec.ts
import { expect, test } from "@playwright/test";
import { BASE_URL } from "./constants";

test("the root address opens English by default", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/en(\/|$)/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
});

test("Arabic pages are right to left", async ({ page }) => {
  await page.goto("/ar");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
});

test("the root address remembers Arabic", async ({ page, context }) => {
  await context.addCookies([{ name: "NEXT_LOCALE", value: "ar", url: BASE_URL }]);
  await page.goto("/");
  await expect(page).toHaveURL(/\/ar(\/|$)/);
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `pnpm e2e tests/e2e/locale.spec.ts`
Expected: FAIL. The web server never becomes ready at `/api/health` (404), or `/en` returns 404.

- [ ] **Step 5: Add routing, the request config and navigation**

```ts
// src/i18n/routing.ts
import { defineRouting } from "next-intl/routing";
import { DEFAULT_LOCALE, LOCALES } from "./locales";

export const routing = defineRouting({ locales: LOCALES, defaultLocale: DEFAULT_LOCALE, localePrefix: "always" });
```

```ts
// src/i18n/request.ts
import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  return { locale, messages: (await import(`../../messages/${locale}.json`)).default };
});
```

```ts
// src/i18n/navigation.ts
import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
```

- [ ] **Step 6: Write the complete M1 message catalogues**

`messages/en.json`:

```json
{
  "Meta": { "title": "Articles AI" },
  "Shell": {
    "brand": "Articles AI",
    "nav": { "label": "Main", "dashboard": "Dashboard" },
    "role": { "admin": "Admin", "reviewer": "Reviewer" },
    "signOut": "Sign out",
    "language": "العربية",
    "themeDark": "Dark mode",
    "themeLight": "Light mode",
    "loading": "Loading…"
  },
  "SignIn": {
    "title": "Sign in",
    "devNotice": "Local test logins. They only work in development and are refused on Vercel.",
    "signInAs": "Sign in as {name}"
  },
  "NoAccess": {
    "title": "No access yet",
    "body": "Your account doesn't have a role yet. Ask your admin to give you access."
  },
  "Dashboard": {
    "title": "Dashboard",
    "stats": {
      "suggestions": "Topic ideas",
      "pending": "Waiting for review",
      "scheduled": "Scheduled",
      "published": "Published",
      "failed": "Failed"
    },
    "nextSlot": {
      "title": "Next publish slot",
      "off": "Auto-publish is off. Nothing goes out until someone presses Publish now.",
      "waiting": "Nothing is going out: {reason}",
      "reasons": {
        "outside_hours": "outside publishing hours",
        "daily_limit": "today's limit is reached",
        "gap": "waiting for the gap between posts",
        "queue_empty": "the queue is empty"
      }
    },
    "connections": {
      "title": "Connections",
      "allGood": "All connections are working.",
      "names": { "website": "Website", "linkedin": "LinkedIn", "instagram": "Instagram", "searchConsole": "Search Console" },
      "statuses": { "expiring": "expiring soon", "error": "not working", "missing": "not connected" },
      "fixInSettings": "Fix this in Settings.",
      "askAdmin": "Ask your admin to fix this."
    },
    "quota": {
      "title": "Monthly usage",
      "unlimited": "{used} used · unlimited",
      "usage": "{used} of {limit}",
      "warning": "Close to the monthly limit",
      "over": "Monthly limit reached",
      "metrics": {
        "articles": "Articles",
        "socialPosts": "Social posts",
        "photos": "Photos",
        "publishes": "Publishes",
        "siteScans": "Site scans",
        "aiTokens": "AI tokens",
        "sites": "Sites"
      }
    }
  },
  "Errors": {
    "serviceUnavailable": "Service unavailable, contact Quantum1st.",
    "engineUnreachable": "The content engine can't be reached right now. Try again shortly.",
    "engineInvalid": "The content engine sent data in an unexpected format. Contact Quantum1st if this continues."
  }
}
```

`messages/ar.json`:

```json
{
  "Meta": { "title": "Articles AI" },
  "Shell": {
    "brand": "Articles AI",
    "nav": { "label": "القائمة الرئيسية", "dashboard": "لوحة التحكم" },
    "role": { "admin": "مسؤول", "reviewer": "مراجع" },
    "signOut": "تسجيل الخروج",
    "language": "English",
    "themeDark": "الوضع الداكن",
    "themeLight": "الوضع الفاتح",
    "loading": "جارٍ التحميل…"
  },
  "SignIn": {
    "title": "تسجيل الدخول",
    "devNotice": "حسابات تجريبية محلية. تعمل في بيئة التطوير فقط ويتم رفضها على Vercel.",
    "signInAs": "الدخول باسم {name}"
  },
  "NoAccess": {
    "title": "لا توجد صلاحية بعد",
    "body": "لم يُمنح حسابك دوراً بعد. اطلب من المسؤول منحك الصلاحية."
  },
  "Dashboard": {
    "title": "لوحة التحكم",
    "stats": {
      "suggestions": "أفكار المواضيع",
      "pending": "بانتظار المراجعة",
      "scheduled": "مجدولة",
      "published": "منشورة",
      "failed": "فشلت"
    },
    "nextSlot": {
      "title": "موعد النشر التالي",
      "off": "النشر التلقائي متوقف. لن يُنشر شيء حتى يضغط أحدهم «انشر الآن».",
      "waiting": "لا يُنشر شيء الآن: {reason}",
      "reasons": {
        "outside_hours": "خارج ساعات النشر",
        "daily_limit": "تم بلوغ حد اليوم",
        "gap": "بانتظار الفاصل بين المنشورات",
        "queue_empty": "قائمة الانتظار فارغة"
      }
    },
    "connections": {
      "title": "الاتصالات",
      "allGood": "جميع الاتصالات تعمل.",
      "names": { "website": "الموقع", "linkedin": "لينكدإن", "instagram": "إنستغرام", "searchConsole": "Search Console" },
      "statuses": { "expiring": "تنتهي صلاحيته قريباً", "error": "لا يعمل", "missing": "غير متصل" },
      "fixInSettings": "أصلح ذلك من الإعدادات.",
      "askAdmin": "اطلب من المسؤول إصلاح ذلك."
    },
    "quota": {
      "title": "الاستخدام الشهري",
      "unlimited": "{used} مستخدم · بلا حد",
      "usage": "{used} من {limit}",
      "warning": "قريب من الحد الشهري",
      "over": "تم بلوغ الحد الشهري",
      "metrics": {
        "articles": "المقالات",
        "socialPosts": "منشورات التواصل",
        "photos": "الصور",
        "publishes": "عمليات النشر",
        "siteScans": "فحوصات الموقع",
        "aiTokens": "رموز الذكاء الاصطناعي",
        "sites": "المواقع"
      }
    }
  },
  "Errors": {
    "serviceUnavailable": "الخدمة غير متاحة، تواصل مع Quantum1st.",
    "engineUnreachable": "تعذّر الوصول إلى محرك المحتوى الآن. حاول مرة أخرى بعد قليل.",
    "engineInvalid": "أرسل محرك المحتوى بيانات بصيغة غير متوقعة. تواصل مع Quantum1st إذا استمر ذلك."
  }
}
```

- [ ] **Step 7: Configure Next and the proxy**

```ts
// next.config.ts
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default createNextIntlPlugin("./src/i18n/request.ts")(nextConfig);
```

Keep any other options the generated `next.config.ts` contains; only the plugin wrapper is new.

```ts
// src/proxy.ts
import { clerkMiddleware } from "@clerk/nextjs/server";
import createMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";
import { routing } from "./i18n/routing";

const intlProxy = createMiddleware(routing);

// Clerk's middleware needs keys, so it only runs in Clerk mode. Page guards do the access checks in both modes.
export default process.env.AUTH_MODE === "clerk"
  ? clerkMiddleware((_auth, request) => intlProxy(request))
  : (request: NextRequest) => intlProxy(request);

export const config = { matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"] };
```

- [ ] **Step 8: Replace the root layout with the locale layout; add the first page and the health route**

```bash
git rm src/app/layout.tsx src/app/page.tsx
mkdir -p "src/app/[locale]/(app)" src/app/api/health
```

```tsx
// src/app/[locale]/layout.tsx
import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { DirectionProvider } from "@/components/ui/direction";
import { directionOf } from "@/i18n/locales";
import { routing } from "@/i18n/routing";
import { serverEnv } from "@/lib/env";
import "../globals.css";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Meta" });
  return { title: t("title") };
}

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const dir = directionOf(locale);

  const content = (
    <NextIntlClientProvider>
      <DirectionProvider direction={dir}>{children}</DirectionProvider>
    </NextIntlClientProvider>
  );

  return (
    <html lang={locale} dir={dir} suppressHydrationWarning>
      <body className="min-h-dvh antialiased">
        {serverEnv().authMode === "clerk" ? (
          <ClerkProvider signInUrl={`/${locale}/sign-in`} afterSignOutUrl={`/${locale}/sign-in`}>
            {content}
          </ClerkProvider>
        ) : (
          content
        )}
      </body>
    </html>
  );
}
```

```tsx
// src/app/[locale]/(app)/page.tsx
import { getTranslations, setRequestLocale } from "next-intl/server";
import { asAppLocale } from "@/i18n/locales";

export default async function DashboardPage({ params }: PageProps<"/[locale]">) {
  const locale = asAppLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("Dashboard");
  return <h1 className="text-3xl">{t("title")}</h1>;
}
```

```ts
// src/app/api/health/route.ts
export function GET() {
  return Response.json({ ok: true });
}
```

- [ ] **Step 9: Run the e2e test to verify it passes**

Run: `pnpm e2e tests/e2e/locale.spec.ts`
Expected: the build lists `◐ /en` and `◐ /ar` (partial prerender) and `ƒ Proxy (Middleware)`; 3 tests pass.

- [ ] **Step 10: Run the full checks and commit**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all pass.

```bash
git add -A
git commit -m "feat: add /en and /ar routing, the locale root layout, the health route and Playwright"
```

---

### Task 7: Sign-in, no-access and the app shell

**Files:**
- Create:
  - `src/lib/auth/mock-actions.ts`
  - `src/app/[locale]/sign-in/page.tsx`, `src/app/[locale]/sign-in/clerk-sign-in.tsx`, `src/app/[locale]/no-access/page.tsx`
  - `src/app/[locale]/(app)/layout.tsx`
  - `src/components/shell/nav.ts`, `nav-link.tsx`, `sidebar.tsx`, `sidebar-nav.tsx`, `topbar.tsx`, `user-menu.tsx`, `locale-switch.tsx`, `sign-out-control.tsx`
- Test: `tests/unit/nav.test.ts`, `tests/e2e/auth.spec.ts`

**Interfaces:**
- Consumes:
  - from Task 3: `requireSession`, `can`, `Role`, `Permission`, `MOCK_USERS`, `MOCK_SESSION_COOKIE`, `decodeMockSession`, `serverEnv`
  - from Task 2: `asAppLocale`, `AppLocale`
  - from Task 6: `Link`, `usePathname`, `useRouter`
  - from Task 1: `Button`, `Card*`, `Badge`, `cn`
- Produces:
  - Server actions `signInAsMockUser(formData)` and `signOutMockUser(formData)`; the form fields are `userId` and `locale`
  - `type NavItem = { key: string; href: string; permission: Permission }`, `NAV_ITEMS`, `visibleNavItems(role, items?)`
  - Components `Sidebar({locale})`, `Topbar({locale})`, `SignOutControl({locale})`
  - Test ids: `sign-in-<userId>`, `sign-out`, `user-name`, `user-role`, `nav-<key>`, `locale-switch`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/nav.test.ts
import { describe, expect, it } from "vitest";
import { NAV_ITEMS, visibleNavItems, type NavItem } from "@/components/shell/nav";

const items: NavItem[] = [
  { key: "dashboard", href: "/", permission: "content.work" },
  { key: "settings", href: "/settings", permission: "settings.manage" },
  { key: "users", href: "/users", permission: "users.manage" },
];

describe("visibleNavItems", () => {
  it("shows reviewers only content screens", () => {
    expect(visibleNavItems("reviewer", items).map((i) => i.key)).toEqual(["dashboard"]);
  });

  it("shows admins every screen", () => {
    expect(visibleNavItems("admin", items).map((i) => i.key)).toEqual(["dashboard", "settings", "users"]);
  });

  it("gives both roles the M1 dashboard", () => {
    expect(visibleNavItems("reviewer")).toEqual(NAV_ITEMS);
    expect(visibleNavItems("admin")).toEqual(NAV_ITEMS);
  });
});
```

```ts
// tests/e2e/auth.spec.ts
import { expect, test } from "@playwright/test";
import { signInWithCookie } from "./helpers";

test("signed-out visitors are sent to sign-in", async ({ page }) => {
  await page.goto("/en");
  await expect(page).toHaveURL(/\/en\/sign-in$/);
});

test("a reviewer signs in and sees their name and role", async ({ page }) => {
  await page.goto("/en/sign-in");
  await page.getByTestId("sign-in-dev_reviewer").click();
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.getByTestId("user-name")).toHaveText("Reviewer (test)");
  await expect(page.getByTestId("user-role")).toHaveText("Reviewer");
  await expect(page.getByTestId("nav-dashboard")).toBeVisible();
});

test("a user without a role is sent to the no-access page", async ({ page, context }) => {
  await signInWithCookie(context, "dev_norole");
  await page.goto("/en");
  await expect(page).toHaveURL(/\/en\/no-access$/);
});

test("signing out returns to sign-in and stays signed out", async ({ page, context }) => {
  await signInWithCookie(context, "dev_admin");
  await page.goto("/en");
  await page.getByTestId("sign-out").click();
  await expect(page).toHaveURL(/\/en\/sign-in$/);
  await page.goto("/en");
  await expect(page).toHaveURL(/\/en\/sign-in$/);
});

test("switching language keeps the page and flips the direction", async ({ page, context }) => {
  await signInWithCookie(context, "dev_reviewer");
  await page.goto("/en");
  await page.getByTestId("locale-switch").click();
  await expect(page).toHaveURL(/\/ar$/);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByTestId("user-role")).toHaveText("مراجع");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test tests/unit/nav.test.ts && pnpm e2e tests/e2e/auth.spec.ts`
Expected: FAIL. `@/components/shell/nav` is missing, and `/en/sign-in` returns 404.

- [ ] **Step 3: Implement the test-login actions and the navigation model**

```ts
// src/lib/auth/mock-actions.ts
"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { asAppLocale } from "@/i18n/locales";
import { serverEnv } from "@/lib/env";
import { decodeMockSession, MOCK_SESSION_COOKIE } from "./mock-session";

function assertMockMode(): void {
  if (serverEnv().authMode !== "mock") throw new Error("Test logins are disabled (AUTH_MODE is not mock).");
}

export async function signInAsMockUser(formData: FormData): Promise<void> {
  assertMockMode();
  const locale = asAppLocale(String(formData.get("locale") ?? ""));
  const userId = String(formData.get("userId") ?? "");
  if (!decodeMockSession(userId)) throw new Error("Unknown test user.");
  (await cookies()).set(MOCK_SESSION_COOKIE, userId, { httpOnly: true, sameSite: "lax", path: "/" });
  redirect(`/${locale}`);
}

export async function signOutMockUser(formData: FormData): Promise<void> {
  assertMockMode();
  const locale = asAppLocale(String(formData.get("locale") ?? ""));
  (await cookies()).delete(MOCK_SESSION_COOKIE);
  redirect(`/${locale}/sign-in`);
}
```

```ts
// src/components/shell/nav.ts
import { can, type Permission, type Role } from "@/lib/auth/roles";

export type NavItem = { key: string; href: string; permission: Permission };

/** Later milestones append their screens here, each with the permission that gates it. */
export const NAV_ITEMS: readonly NavItem[] = [{ key: "dashboard", href: "/", permission: "content.work" }];

export function visibleNavItems(role: Role, items: readonly NavItem[] = NAV_ITEMS): NavItem[] {
  return items.filter((item) => can(role, item.permission));
}
```

- [ ] **Step 4: Implement the sign-in and no-access pages**

```tsx
// src/app/[locale]/sign-in/clerk-sign-in.tsx
"use client";

import { SignIn } from "@clerk/nextjs";

export function ClerkSignIn() {
  return <SignIn routing="hash" />;
}
```

```tsx
// src/app/[locale]/sign-in/page.tsx
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { asAppLocale } from "@/i18n/locales";
import { signInAsMockUser } from "@/lib/auth/mock-actions";
import { MOCK_USERS } from "@/lib/auth/mock-session";
import { serverEnv } from "@/lib/env";
import { ClerkSignIn } from "./clerk-sign-in";

export default async function SignInPage({ params }: PageProps<"/[locale]/sign-in">) {
  const locale = asAppLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("SignIn");

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      {serverEnv().authMode === "clerk" ? (
        <ClerkSignIn />
      ) : (
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
      )}
    </main>
  );
}
```

```tsx
// src/components/shell/sign-out-control.tsx
import { UserButton } from "@clerk/nextjs";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import type { AppLocale } from "@/i18n/locales";
import { signOutMockUser } from "@/lib/auth/mock-actions";
import { serverEnv } from "@/lib/env";

export async function SignOutControl({ locale }: { locale: AppLocale }) {
  if (serverEnv().authMode === "clerk") return <UserButton />;
  const t = await getTranslations("Shell");
  return (
    <form action={signOutMockUser}>
      <input type="hidden" name="locale" value={locale} />
      <Button type="submit" variant="ghost" size="sm" data-testid="sign-out">
        {t("signOut")}
      </Button>
    </form>
  );
}
```

```tsx
// src/app/[locale]/no-access/page.tsx
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SignOutControl } from "@/components/shell/sign-out-control";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { asAppLocale } from "@/i18n/locales";

export default async function NoAccessPage({ params }: PageProps<"/[locale]/no-access">) {
  const locale = asAppLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("NoAccess");

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="font-heading text-2xl">{t("title")}</CardTitle>
          <CardDescription>{t("body")}</CardDescription>
        </CardHeader>
        <CardContent>
          <SignOutControl locale={locale} />
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 5: Implement the shell**

```tsx
// src/components/shell/nav-link.tsx
"use client";

import type { ReactNode } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export function NavLink({ href, testId, children }: { href: string; testId: string; children: ReactNode }) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
  return (
    <Link
      href={href}
      data-testid={testId}
      aria-current={active ? "page" : undefined}
      className={cn(
        "block rounded-md px-3 py-2 text-sm hover:bg-sidebar-accent",
        active && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
      )}
    >
      {children}
    </Link>
  );
}
```

```tsx
// src/components/shell/sidebar-nav.tsx
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/locales";
import { requireSession } from "@/lib/auth/session";
import { visibleNavItems } from "./nav";
import { NavLink } from "./nav-link";

export async function SidebarNav({ locale }: { locale: AppLocale }) {
  const session = await requireSession(locale);
  const t = await getTranslations("Shell.nav");
  return (
    <nav aria-label={t("label")}>
      <ul className="flex flex-col gap-1">
        {visibleNavItems(session.role).map((item) => (
          <li key={item.key}>
            <NavLink href={item.href} testId={`nav-${item.key}`}>
              {t(item.key)}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

```tsx
// src/components/shell/sidebar.tsx
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/locales";
import { SidebarNav } from "./sidebar-nav";

export async function Sidebar({ locale }: { locale: AppLocale }) {
  const t = await getTranslations("Shell");
  return (
    <aside className="border-e border-border bg-sidebar p-4 text-sidebar-foreground">
      <div className="mb-6 font-heading text-xl">{t("brand")}</div>
      <Suspense fallback={<p className="text-sm text-muted-foreground">{t("loading")}</p>}>
        <SidebarNav locale={locale} />
      </Suspense>
    </aside>
  );
}
```

```tsx
// src/components/shell/locale-switch.tsx
"use client";

import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { usePathname, useRouter } from "@/i18n/navigation";

export function LocaleSwitch() {
  const locale = useLocale();
  const t = useTranslations("Shell");
  const router = useRouter();
  const pathname = usePathname();
  const other = locale === "ar" ? "en" : "ar";

  return (
    <Button
      variant="ghost"
      size="sm"
      lang={other}
      data-testid="locale-switch"
      onClick={() => router.replace(pathname, { locale: other })}
    >
      {t("language")}
    </Button>
  );
}
```

```tsx
// src/components/shell/user-menu.tsx
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import type { AppLocale } from "@/i18n/locales";
import { requireSession } from "@/lib/auth/session";
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
      <SignOutControl locale={locale} />
    </div>
  );
}
```

```tsx
// src/components/shell/topbar.tsx
import { Suspense } from "react";
import type { AppLocale } from "@/i18n/locales";
import { LocaleSwitch } from "./locale-switch";
import { UserMenu } from "./user-menu";

export function Topbar({ locale }: { locale: AppLocale }) {
  return (
    <header className="flex items-center justify-end gap-2 border-b border-border bg-card px-6 py-3">
      <LocaleSwitch />
      <Suspense fallback={null}>
        <UserMenu locale={locale} />
      </Suspense>
    </header>
  );
}
```

```tsx
// src/app/[locale]/(app)/layout.tsx
import { setRequestLocale } from "next-intl/server";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { asAppLocale } from "@/i18n/locales";

export default async function AppLayout({ children, params }: LayoutProps<"/[locale]">) {
  const locale = asAppLocale((await params).locale);
  setRequestLocale(locale);
  return (
    <div className="grid min-h-dvh grid-cols-1 md:grid-cols-[15rem_minmax(0,1fr)]">
      <Sidebar locale={locale} />
      <div className="flex min-w-0 flex-col">
        <Topbar locale={locale} />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test && pnpm e2e`
Expected: unit tests PASS; e2e `locale.spec.ts` (3) and `auth.spec.ts` (5) PASS.

- [ ] **Step 7: Lint, typecheck and commit**

Run: `pnpm lint && pnpm typecheck`
Expected: exit 0.

```bash
git add -A
git commit -m "feat: add test-login and Clerk sign-in, no-access page, role-filtered shell and language switch"
```

---

### Task 8: Prototype design tokens, fonts and theme

**Files:**
- Modify: `src/app/globals.css` (full replacement), `src/app/[locale]/layout.tsx` (fonts, theme script), `src/components/shell/topbar.tsx` (theme toggle)
- Create: `src/components/shell/theme-toggle.tsx`
- Test: `tests/e2e/theme.spec.ts`

**Interfaces:**
- Consumes: the Task 6 layout and the Task 7 topbar
- Produces:
  - Tailwind colour utilities for the shadcn tokens plus the status colours `bg-ok-bg`/`text-ok-fg`, `warn`, `bad`, `info`, `neutral`
  - `font-sans` (IBM Plex Sans + IBM Plex Sans Arabic) and `font-heading` (Newsreader + Noto Naskh Arabic)
  - `data-theme="light"|"dark"` on `<html>`; test id `theme-toggle`

- [ ] **Step 1: Write the failing e2e test**

```ts
// tests/e2e/theme.spec.ts
import { expect, test } from "@playwright/test";
import { signInWithCookie } from "./helpers";

test("the light theme uses the prototype's warm background", async ({ page }) => {
  await page.goto("/en/sign-in");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(246, 245, 242)");
});

test("a saved dark theme applies before the page shows", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("theme", "dark"));
  await page.goto("/en/sign-in");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(19, 19, 18)");
});

test("the theme toggle switches and remembers the theme", async ({ page, context }) => {
  await signInWithCookie(context, "dev_reviewer");
  await page.goto("/en");
  await page.getByTestId("theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm e2e tests/e2e/theme.spec.ts`
Expected: FAIL. `data-theme` is missing and the background is shadcn's default `rgb(255, 255, 255)`.

- [ ] **Step 3: Replace `src/app/globals.css` with the prototype tokens mapped onto shadcn's variables**

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

/* Dark mode follows <html data-theme="dark"> (set before paint by the layout's inline script). */
@custom-variant dark (&:is([data-theme="dark"] *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-sans);
  --font-serif: var(--font-serif);
  --font-heading: var(--font-serif);
  --color-sidebar-ring: var(--sidebar-ring);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar: var(--sidebar);
  --color-chart-5: var(--chart-5);
  --color-chart-4: var(--chart-4);
  --color-chart-3: var(--chart-3);
  --color-chart-2: var(--chart-2);
  --color-chart-1: var(--chart-1);
  --color-ring: var(--ring);
  --color-input: var(--input);
  --color-border: var(--border);
  --color-destructive: var(--destructive);
  --color-accent-foreground: var(--accent-foreground);
  --color-accent: var(--accent);
  --color-muted-foreground: var(--muted-foreground);
  --color-muted: var(--muted);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-secondary: var(--secondary);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary: var(--primary);
  --color-popover-foreground: var(--popover-foreground);
  --color-popover: var(--popover);
  --color-card-foreground: var(--card-foreground);
  --color-card: var(--card);
  --color-ok-bg: var(--ok-bg);
  --color-ok-fg: var(--ok-fg);
  --color-warn-bg: var(--warn-bg);
  --color-warn-fg: var(--warn-fg);
  --color-bad-bg: var(--bad-bg);
  --color-bad-fg: var(--bad-fg);
  --color-info-bg: var(--info-bg);
  --color-info-fg: var(--info-fg);
  --color-neutral-bg: var(--neutral-bg);
  --color-neutral-fg: var(--neutral-fg);
  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
  --radius-2xl: calc(var(--radius) * 1.8);
  --radius-3xl: calc(var(--radius) * 2.2);
  --radius-4xl: calc(var(--radius) * 2.6);
}

/* Light — values from the prototype ("Design from Nour Attorneys portal/Admin Portal.dc.html"). */
:root {
  --font-sans: var(--font-plex-sans), var(--font-plex-arabic), system-ui, sans-serif;
  --font-serif: var(--font-newsreader), var(--font-naskh), Georgia, serif;
  --radius: 0.5rem;

  --background: #f6f5f2;
  --foreground: #1d1c1a;
  --card: #ffffff;
  --card-foreground: #1d1c1a;
  --popover: #ffffff;
  --popover-foreground: #1d1c1a;
  --primary: #1f3a5f;
  --primary-foreground: #ffffff;
  --secondary: #f0eee9;
  --secondary-foreground: #1d1c1a;
  --muted: #f0eee9;
  --muted-foreground: #6b675f;
  --accent: #e7ecf2;
  --accent-foreground: #1f3a5f;
  --destructive: oklch(0.47 0.12 25);
  --border: #e4e1da;
  --input: #e4e1da;
  --ring: #1f3a5f;

  --ok-bg: oklch(0.95 0.035 155);
  --ok-fg: oklch(0.42 0.09 155);
  --warn-bg: oklch(0.95 0.04 80);
  --warn-fg: oklch(0.45 0.09 65);
  --bad-bg: oklch(0.95 0.03 25);
  --bad-fg: oklch(0.47 0.12 25);
  --info-bg: oklch(0.95 0.025 250);
  --info-fg: oklch(0.42 0.08 250);
  --neutral-bg: #efede8;
  --neutral-fg: #55524c;

  --chart-1: #1f3a5f;
  --chart-2: oklch(0.42 0.09 155);
  --chart-3: oklch(0.45 0.09 65);
  --chart-4: oklch(0.47 0.12 25);
  --chart-5: oklch(0.42 0.08 250);

  --sidebar: #ffffff;
  --sidebar-foreground: #1d1c1a;
  --sidebar-primary: #1f3a5f;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: #e7ecf2;
  --sidebar-accent-foreground: #1f3a5f;
  --sidebar-border: #e4e1da;
  --sidebar-ring: #1f3a5f;

  color-scheme: light;
}

[data-theme="dark"] {
  --background: #131312;
  --foreground: #eceae5;
  --card: #1b1a19;
  --card-foreground: #eceae5;
  --popover: #1b1a19;
  --popover-foreground: #eceae5;
  --primary: #9db6d6;
  --primary-foreground: #0e1826;
  --secondary: #252422;
  --secondary-foreground: #eceae5;
  --muted: #252422;
  --muted-foreground: #a29d93;
  --accent: #223143;
  --accent-foreground: #9db6d6;
  --destructive: oklch(0.82 0.1 25);
  --border: #34322f;
  --input: #34322f;
  --ring: #9db6d6;

  --ok-bg: oklch(0.3 0.045 155);
  --ok-fg: oklch(0.83 0.09 155);
  --warn-bg: oklch(0.3 0.045 70);
  --warn-fg: oklch(0.85 0.09 75);
  --bad-bg: oklch(0.3 0.05 25);
  --bad-fg: oklch(0.82 0.1 25);
  --info-bg: oklch(0.3 0.04 250);
  --info-fg: oklch(0.83 0.07 250);
  --neutral-bg: #2a2926;
  --neutral-fg: #c9c5bc;

  --chart-1: #9db6d6;
  --chart-2: oklch(0.83 0.09 155);
  --chart-3: oklch(0.85 0.09 75);
  --chart-4: oklch(0.82 0.1 25);
  --chart-5: oklch(0.83 0.07 250);

  --sidebar: #1b1a19;
  --sidebar-foreground: #eceae5;
  --sidebar-primary: #9db6d6;
  --sidebar-primary-foreground: #0e1826;
  --sidebar-accent: #223143;
  --sidebar-accent-foreground: #9db6d6;
  --sidebar-border: #34322f;
  --sidebar-ring: #9db6d6;

  color-scheme: dark;
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background font-sans text-foreground;
  }
  button:not(:disabled),
  [role="button"]:not(:disabled) {
    cursor: pointer;
  }
}
```

- [ ] **Step 4: Add the fonts and the pre-paint theme script to the locale layout**

In `src/app/[locale]/layout.tsx`:

(a) Add these imports and module-level constants below the existing imports:

```tsx
import { IBM_Plex_Sans, IBM_Plex_Sans_Arabic, Newsreader, Noto_Naskh_Arabic } from "next/font/google";

const plexSans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-sans", display: "swap" });
const plexArabic = IBM_Plex_Sans_Arabic({ subsets: ["arabic"], weight: ["400", "500", "600"], variable: "--font-plex-arabic", display: "swap" });
const newsreader = Newsreader({ subsets: ["latin"], variable: "--font-newsreader", display: "swap" });
const naskh = Noto_Naskh_Arabic({ subsets: ["arabic"], variable: "--font-naskh", display: "swap" });
const FONT_VARIABLES = [plexSans.variable, plexArabic.variable, newsreader.variable, naskh.variable].join(" ");

/** Runs before first paint: applies the saved theme so dark mode never flashes light. */
const THEME_SCRIPT = `(function(){var d=document.documentElement;try{d.setAttribute("data-theme",localStorage.getItem("theme")==="dark"?"dark":"light")}catch(e){d.setAttribute("data-theme","light")}})();`;
```

(b) Replace the returned `<html>` element's opening tag and add a `<head>`:

```tsx
    <html lang={locale} dir={dir} data-theme="light" className={FONT_VARIABLES} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh antialiased">
```

The rest of the layout is unchanged.

- [ ] **Step 5: Add the theme toggle to the top bar**

```tsx
// src/components/shell/theme-toggle.tsx
"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

type Theme = "light" | "dark";

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

const readTheme = (): Theme => (document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");
const serverTheme = (): Theme => "light";

export function ThemeToggle() {
  const t = useTranslations("Shell");
  const theme = useSyncExternalStore(subscribe, readTheme, serverTheme);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      // Storage can be unavailable (private browsing); the theme still applies for this page.
    }
  }

  return (
    <Button variant="ghost" size="sm" data-testid="theme-toggle" onClick={toggle}>
      {theme === "dark" ? t("themeLight") : t("themeDark")}
    </Button>
  );
}
```

In `src/components/shell/topbar.tsx`, import `ThemeToggle` from `./theme-toggle` and render `<ThemeToggle />` immediately before `<LocaleSwitch />`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm e2e`
Expected: all e2e tests PASS (locale 3, auth 5, theme 3).

- [ ] **Step 7: Look at it, then commit**

Run `pnpm dev`, sign in as Reviewer, and check `/en` and `/ar` in light and dark. Expected:
- warm off-white background
- navy primary
- the serif brand title
- Arabic text in IBM Plex Sans Arabic
- in `/ar`, the sidebar on the right

```bash
git add -A
git commit -m "feat: apply the prototype design tokens, Plex/Newsreader fonts and a flash-free light/dark theme"
```

---

### Task 9: The Dashboard page

**Files:**
- Create:
  - `src/lib/dashboard/quota.ts`, `src/lib/dashboard/connections.ts`, `src/lib/dashboard/next-slot.ts`
  - `src/components/dashboard/engine-notice.tsx`, `section-skeleton.tsx`, `stat-cards.tsx`, `next-slot-card.tsx`, `connection-warnings.tsx`, `quota-panel.tsx`
- Modify: `src/app/[locale]/(app)/page.tsx` (full replacement)
- Test: `tests/unit/dashboard.test.ts`, `tests/e2e/dashboard.spec.ts`

**Interfaces:**
- Consumes:
  - from Task 5: `getEngine`, `engineNoticeKey`
  - from Task 4: `tryEngine`, `EngineFailure`, `Quota`, `Site`, `Scheduled`
  - from Task 3: `requireSession`, `can`
  - from Task 2: `formatDateTime`, `formatNumber`, `AppLocale`
- Produces:
  - `quotaView(q: Quota): QuotaView` (`{ metric; used; limit: number|null; percent: number; state: "ok"|"warning"|"over"|"unlimited" }`)
  - `connectionWarnings(c: Site["connections"]): { key: ConnectionKey; status: string }[]`
  - `nextSlotView(s): { kind: "slot"; at: string } | { kind: "off" } | { kind: "waiting"; reason: string }`
  - Test ids: `stat-<key>`, `stat-<key>-value`, `next-slot`, `next-slot-time`, `connections`, `connection-<key>` (with `data-status`), `connections-help`, `quota`, `quota-<metric>` (with `data-state`), `engine-notice` (with `data-code`)

- [ ] **Step 1: Write the failing unit tests**

```ts
// tests/unit/dashboard.test.ts
import { describe, expect, it } from "vitest";
import { connectionWarnings } from "@/lib/dashboard/connections";
import { nextSlotView } from "@/lib/dashboard/next-slot";
import { quotaView } from "@/lib/dashboard/quota";

describe("quotaView", () => {
  it("is ok below the warning line", () => {
    expect(quotaView({ metric: "articles", limit: 40, used: 31, warnAt: 0.8 })).toEqual({
      metric: "articles",
      used: 31,
      limit: 40,
      percent: 78,
      state: "ok",
    });
  });

  it("warns at or above warnAt", () => {
    expect(quotaView({ metric: "socialPosts", limit: 120, used: 110, warnAt: 0.8 })).toMatchObject({ percent: 92, state: "warning" });
  });

  it("is over at or above the limit, and the bar never passes 100%", () => {
    expect(quotaView({ metric: "articles", limit: 40, used: 40, warnAt: 0.8 })).toMatchObject({ percent: 100, state: "over" });
    expect(quotaView({ metric: "socialPosts", limit: 120, used: 150, warnAt: 0.8 })).toMatchObject({ percent: 100, state: "over" });
  });

  it("treats a null limit as unlimited", () => {
    expect(quotaView({ metric: "photos", limit: null, used: 60 })).toEqual({
      metric: "photos",
      used: 60,
      limit: null,
      percent: 0,
      state: "unlimited",
    });
  });

  it("handles a zero limit without NaN or Infinity", () => {
    expect(quotaView({ metric: "sites", limit: 0, used: 0, warnAt: 0.8 })).toMatchObject({ percent: 0, state: "ok" });
    expect(quotaView({ metric: "sites", limit: 0, used: 2, warnAt: 0.8 })).toMatchObject({ percent: 100, state: "over" });
  });

  it("never warns when warnAt is missing", () => {
    expect(quotaView({ metric: "aiTokens", limit: 100, used: 99 })).toMatchObject({ percent: 99, state: "ok" });
  });
});

describe("connectionWarnings", () => {
  it("lists every connection that isn't ok, in a fixed order, including unknown statuses", () => {
    expect(
      connectionWarnings({
        website: { type: "wordpress", status: "missing" },
        linkedin: "degraded",
        instagram: "ok",
        searchConsole: "expiring",
      }),
    ).toEqual([
      { key: "website", status: "missing" },
      { key: "linkedin", status: "degraded" },
      { key: "searchConsole", status: "expiring" },
    ]);
  });

  it("ignores a connection the engine doesn't report", () => {
    expect(
      connectionWarnings({ website: { type: "wordpress", status: "ok" }, linkedin: "ok", instagram: "ok", searchConsole: null }),
    ).toEqual([]);
  });
});

describe("nextSlotView", () => {
  it("shows the next slot when auto-publish is on", () => {
    expect(nextSlotView({ autoPublish: true, nextSlotAt: "2026-10-22T10:00:00+04:00", waitingReason: null })).toEqual({
      kind: "slot",
      at: "2026-10-22T10:00:00+04:00",
    });
  });

  it("says auto-publish is off", () => {
    expect(nextSlotView({ autoPublish: false, nextSlotAt: "2026-10-22T10:00:00+04:00" })).toEqual({ kind: "off" });
  });

  it("passes the engine's waiting reason through, even an unknown one", () => {
    expect(nextSlotView({ autoPublish: true, nextSlotAt: null, waitingReason: "holiday" })).toEqual({ kind: "waiting", reason: "holiday" });
    expect(nextSlotView({ autoPublish: true })).toEqual({ kind: "waiting", reason: "queue_empty" });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test tests/unit/dashboard.test.ts`
Expected: FAIL. `@/lib/dashboard/*` can't be resolved.

- [ ] **Step 3: Implement the dashboard logic**

```ts
// src/lib/dashboard/quota.ts
import type { Quota } from "@/lib/engine/schemas";

export type QuotaState = "ok" | "warning" | "over" | "unlimited";
export type QuotaView = { metric: string; used: number; limit: number | null; percent: number; state: QuotaState };

export function quotaView(quota: Quota): QuotaView {
  const { metric, used, limit } = quota;
  if (limit === null) return { metric, used, limit, percent: 0, state: "unlimited" };

  const ratio = limit > 0 ? used / limit : used > 0 ? Number.POSITIVE_INFINITY : 0;
  const percent = Number.isFinite(ratio) ? Math.min(100, Math.max(0, Math.round(ratio * 100))) : 100;
  const warnAt = quota.warnAt ?? null;
  const state: QuotaState = ratio >= 1 ? "over" : warnAt !== null && ratio >= warnAt ? "warning" : "ok";

  return { metric, used, limit, percent, state };
}
```

```ts
// src/lib/dashboard/connections.ts
import type { Site } from "@/lib/engine/schemas";

export const CONNECTION_KEYS = ["website", "linkedin", "instagram", "searchConsole"] as const;
export type ConnectionKey = (typeof CONNECTION_KEYS)[number];

/** Every reported connection whose status isn't "ok", including statuses the interface doesn't know yet. */
export function connectionWarnings(connections: Site["connections"]): { key: ConnectionKey; status: string }[] {
  const statuses: Record<ConnectionKey, string | null | undefined> = {
    website: connections.website.status,
    linkedin: connections.linkedin,
    instagram: connections.instagram,
    searchConsole: connections.searchConsole,
  };
  return CONNECTION_KEYS.flatMap((key) => {
    const status = statuses[key];
    return status && status !== "ok" ? [{ key, status }] : [];
  });
}
```

```ts
// src/lib/dashboard/next-slot.ts
import type { Scheduled } from "@/lib/engine/schemas";

export type NextSlotView = { kind: "slot"; at: string } | { kind: "off" } | { kind: "waiting"; reason: string };

export function nextSlotView(scheduled: Pick<Scheduled, "autoPublish" | "nextSlotAt" | "waitingReason">): NextSlotView {
  if (!scheduled.autoPublish) return { kind: "off" };
  if (scheduled.nextSlotAt) return { kind: "slot", at: scheduled.nextSlotAt };
  return { kind: "waiting", reason: scheduled.waitingReason ?? "queue_empty" };
}
```

- [ ] **Step 4: Run the unit tests to verify they pass**

Run: `pnpm test`
Expected: PASS (11 new dashboard tests).

- [ ] **Step 5: Write the failing e2e test**

```ts
// tests/e2e/dashboard.spec.ts
import { expect, test } from "@playwright/test";
import { BASE_URL, E2E_ENGINE_KEY } from "./constants";
import { normalizeSpaces, setMockScenario, signInWithCookie } from "./helpers";

test.describe("dashboard, signed in as a reviewer", () => {
  test.beforeEach(async ({ context }) => {
    await signInWithCookie(context, "dev_reviewer");
  });

  test("shows the site's counts", async ({ page }) => {
    await page.goto("/en");
    await expect(page.getByTestId("stat-suggestions-value")).toHaveText("8");
    await expect(page.getByTestId("stat-pending-value")).toHaveText("3");
    await expect(page.getByTestId("stat-scheduled-value")).toHaveText("5");
    await expect(page.getByTestId("stat-published-value")).toHaveText("41");
    await expect(page.getByTestId("stat-failed-value")).toHaveText("1");
  });

  test("shows the next publish slot in 12-hour Dubai time", async ({ page }) => {
    await page.goto("/en");
    const text = normalizeSpaces(await page.getByTestId("next-slot-time").innerText());
    expect(text).toContain("Oct 22");
    expect(text).toContain("10:00 AM");
  });

  test("lists broken connections and tells a reviewer to ask the admin", async ({ page }) => {
    await page.goto("/en");
    await expect(page.getByTestId("connection-linkedin")).toHaveAttribute("data-status", "expiring");
    await expect(page.getByTestId("connection-instagram")).toHaveAttribute("data-status", "missing");
    await expect(page.getByTestId("connection-website")).toHaveCount(0);
    await expect(page.getByTestId("connections-help")).toHaveText("Ask your admin to fix this.");
  });

  test("shows quota states, and a metric the interface doesn't know under its raw name", async ({ page }) => {
    await page.goto("/en");
    await expect(page.getByTestId("quota-articles")).toHaveAttribute("data-state", "ok");
    await expect(page.getByTestId("quota-socialPosts")).toHaveAttribute("data-state", "warning");
    await expect(page.getByTestId("quota-socialPosts")).toContainText("110 of 120");
    await expect(page.getByTestId("quota-photos")).toHaveAttribute("data-state", "unlimited");
    await expect(page.getByTestId("quota-videoMinutes")).toContainText("videoMinutes");
  });

  test("works in Arabic with Latin digits and Dubai time", async ({ page }) => {
    await page.goto("/ar");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("لوحة التحكم");
    await expect(page.getByTestId("stat-published-value")).toHaveText("41");
    const slot = normalizeSpaces(await page.getByTestId("next-slot-time").innerText());
    expect(slot).toContain("10:00");
    expect(slot).toContain("ص");
  });
});

test("an admin is told to fix connections in Settings", async ({ page, context }) => {
  await signInWithCookie(context, "dev_admin");
  await page.goto("/en");
  await expect(page.getByTestId("connections-help")).toHaveText("Fix this in Settings.");
});

test.describe("engine problems", () => {
  test.beforeEach(async ({ context }) => {
    await signInWithCookie(context, "dev_reviewer");
  });

  test("a revoked key shows the service-unavailable message", async ({ page, context }) => {
    await setMockScenario(context, "unauthorized");
    await page.goto("/en");
    await expect(page.getByTestId("engine-notice").first()).toHaveText("Service unavailable, contact Quantum1st.");
  });

  test("an unreachable engine shows a try-again message", async ({ page, context }) => {
    await setMockScenario(context, "down");
    await page.goto("/en");
    await expect(page.getByTestId("engine-notice").first()).toHaveText(
      "The content engine can't be reached right now. Try again shortly.",
    );
  });

  test("a changed response shape breaks only the sections that use it", async ({ page, context }) => {
    await setMockScenario(context, "drift");
    await page.goto("/en");
    await expect(page.getByTestId("engine-notice").first()).toHaveAttribute("data-code", "invalid_response");
    await expect(page.getByTestId("quota-articles")).toBeVisible();
  });
});

test("the engine API key never reaches the browser", async ({ page, context }) => {
  await signInWithCookie(context, "dev_admin");
  const bodies: string[] = [];
  const origins = new Set<string>();

  page.on("request", (request) => {
    if (request.url().startsWith("http")) origins.add(new URL(request.url()).origin);
  });
  page.on("response", async (response) => {
    const type = response.headers()["content-type"] ?? "";
    if (/text|javascript|json|x-component/.test(type)) {
      try {
        bodies.push(await response.text());
      } catch {
        // Redirect responses have no readable body.
      }
    }
  });

  await page.goto("/en");
  await expect(page.getByTestId("stat-pending-value")).toHaveText("3");
  await page.waitForLoadState("networkidle");

  expect(bodies.length).toBeGreaterThan(0);
  for (const body of bodies) expect(body).not.toContain(E2E_ENGINE_KEY);
  expect([...origins]).toEqual([BASE_URL]);
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm e2e tests/e2e/dashboard.spec.ts`
Expected: FAIL. `stat-suggestions-value` isn't found; the page only has its heading.

- [ ] **Step 7: Implement the dashboard components**

```tsx
// src/components/dashboard/engine-notice.tsx
import { getTranslations } from "next-intl/server";
import { engineNoticeKey } from "@/lib/engine/notice";
import type { EngineFailure } from "@/lib/engine/result";

export async function EngineNotice({ error }: { error: EngineFailure }) {
  const t = await getTranslations("Errors");
  const key = engineNoticeKey(error.code);
  return (
    <div
      role="alert"
      data-testid="engine-notice"
      data-code={error.code}
      className="rounded-lg border border-bad-fg/30 bg-bad-bg p-4 text-sm text-bad-fg"
    >
      {key ? t(key) : error.message}
    </div>
  );
}
```

```tsx
// src/components/dashboard/section-skeleton.tsx
export function SectionSkeleton() {
  return <div className="h-24 animate-pulse rounded-lg bg-muted" aria-hidden="true" />;
}
```

```tsx
// src/components/dashboard/stat-cards.tsx
import { getTranslations } from "next-intl/server";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AppLocale } from "@/i18n/locales";
import { requireSession } from "@/lib/auth/session";
import { getEngine } from "@/lib/engine";
import { tryEngine } from "@/lib/engine/result";
import { formatNumber } from "@/lib/format/number";
import { EngineNotice } from "./engine-notice";

export async function StatCards({ locale }: { locale: AppLocale }) {
  await requireSession(locale);
  const t = await getTranslations("Dashboard.stats");
  const engine = await getEngine();
  const site = await tryEngine(() => engine.site());
  if (!site.ok) return <EngineNotice error={site.error} />;

  const { counts } = site.data;
  const stats = [
    ["suggestions", counts.suggestions],
    ["pending", counts.pending],
    ["scheduled", counts.scheduled],
    ["published", counts.published],
    ["failed", counts.failed],
  ] as const;

  return (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {stats.map(([key, value]) => (
        <Card key={key} data-testid={`stat-${key}`}>
          <CardHeader>
            <CardDescription>{t(key)}</CardDescription>
            <CardTitle className="font-heading text-3xl" data-testid={`stat-${key}-value`}>
              {formatNumber(value, locale)}
            </CardTitle>
          </CardHeader>
        </Card>
      ))}
    </section>
  );
}
```

```tsx
// src/components/dashboard/next-slot-card.tsx
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AppLocale } from "@/i18n/locales";
import { requireSession } from "@/lib/auth/session";
import { nextSlotView } from "@/lib/dashboard/next-slot";
import { getEngine } from "@/lib/engine";
import { tryEngine } from "@/lib/engine/result";
import { formatDateTime } from "@/lib/format/datetime";
import { EngineNotice } from "./engine-notice";

export async function NextSlotCard({ locale }: { locale: AppLocale }) {
  await requireSession(locale);
  const t = await getTranslations("Dashboard.nextSlot");
  const engine = await getEngine();
  const [site, scheduled] = await Promise.all([
    tryEngine(() => engine.site()),
    tryEngine(() => engine.scheduled({ pageSize: 5 })),
  ]);

  let body;
  if (!site.ok) body = <EngineNotice error={site.error} />;
  else if (!scheduled.ok) body = <EngineNotice error={scheduled.error} />;
  else {
    const view = nextSlotView(scheduled.data);
    if (view.kind === "slot") {
      body = (
        <p className="text-lg" data-testid="next-slot-time">
          {formatDateTime(view.at, { timeZone: site.data.timezone, locale })}
        </p>
      );
    } else if (view.kind === "off") {
      body = <p className="text-sm text-muted-foreground">{t("off")}</p>;
    } else {
      const reason = t.has(`reasons.${view.reason}`) ? t(`reasons.${view.reason}`) : view.reason;
      body = <p className="text-sm text-muted-foreground">{t("waiting", { reason })}</p>;
    }
  }

  return (
    <Card data-testid="next-slot">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
```

```tsx
// src/components/dashboard/connection-warnings.tsx
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AppLocale } from "@/i18n/locales";
import { can } from "@/lib/auth/roles";
import { requireSession } from "@/lib/auth/session";
import { connectionWarnings } from "@/lib/dashboard/connections";
import { getEngine } from "@/lib/engine";
import { tryEngine } from "@/lib/engine/result";
import { EngineNotice } from "./engine-notice";

export async function ConnectionWarnings({ locale }: { locale: AppLocale }) {
  const session = await requireSession(locale);
  const t = await getTranslations("Dashboard.connections");
  const engine = await getEngine();
  const site = await tryEngine(() => engine.site());

  let body;
  if (!site.ok) body = <EngineNotice error={site.error} />;
  else {
    const warnings = connectionWarnings(site.data.connections);
    body =
      warnings.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("allGood")}</p>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {warnings.map(({ key, status }) => (
              <li
                key={key}
                data-testid={`connection-${key}`}
                data-status={status}
                className="flex items-center justify-between gap-3 rounded-md bg-warn-bg px-3 py-2 text-sm text-warn-fg"
              >
                <span>{t(`names.${key}`)}</span>
                <span>{t.has(`statuses.${status}`) ? t(`statuses.${status}`) : status}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-muted-foreground" data-testid="connections-help">
            {can(session.role, "settings.manage") ? t("fixInSettings") : t("askAdmin")}
          </p>
        </>
      );
  }

  return (
    <Card data-testid="connections">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
```

```tsx
// src/components/dashboard/quota-panel.tsx
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AppLocale } from "@/i18n/locales";
import { requireSession } from "@/lib/auth/session";
import { quotaView } from "@/lib/dashboard/quota";
import { getEngine } from "@/lib/engine";
import { tryEngine } from "@/lib/engine/result";
import { formatNumber } from "@/lib/format/number";
import { cn } from "@/lib/utils";
import { EngineNotice } from "./engine-notice";

export async function QuotaPanel({ locale }: { locale: AppLocale }) {
  await requireSession(locale);
  const t = await getTranslations("Dashboard.quota");
  const engine = await getEngine();
  const plan = await tryEngine(() => engine.plan());

  if (!plan.ok) {
    return (
      <Card data-testid="quota">
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <EngineNotice error={plan.error} />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="quota">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{plan.data.plan.name}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-4">
          {plan.data.quotas.map((quota) => {
            const q = quotaView(quota);
            const label = t.has(`metrics.${q.metric}`) ? t(`metrics.${q.metric}`) : q.metric;
            const used = formatNumber(q.used, locale);
            return (
              <li key={q.metric} data-testid={`quota-${q.metric}`} data-state={q.state}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium">{label}</span>
                  <span className="text-muted-foreground">
                    {q.limit === null ? t("unlimited", { used }) : t("usage", { used, limit: formatNumber(q.limit, locale) })}
                  </span>
                </div>
                {q.limit !== null && (
                  <div
                    className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-label={label}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={q.percent}
                  >
                    <div
                      className={cn(
                        "h-full rounded-full",
                        q.state === "over" ? "bg-bad-fg" : q.state === "warning" ? "bg-warn-fg" : "bg-primary",
                      )}
                      style={{ width: `${q.percent}%` }}
                    />
                  </div>
                )}
                {q.state === "warning" && <p className="mt-1 text-xs text-warn-fg">{t("warning")}</p>}
                {q.state === "over" && <p className="mt-1 text-xs text-bad-fg">{t("over")}</p>}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
```

The bar's inner element is a normal block, so it starts at the inline start: it fills from the left in English and from the right in Arabic, with no extra code.

```tsx
// src/app/[locale]/(app)/page.tsx  (replaces the Task 6 version)
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ConnectionWarnings } from "@/components/dashboard/connection-warnings";
import { NextSlotCard } from "@/components/dashboard/next-slot-card";
import { QuotaPanel } from "@/components/dashboard/quota-panel";
import { SectionSkeleton } from "@/components/dashboard/section-skeleton";
import { StatCards } from "@/components/dashboard/stat-cards";
import { asAppLocale } from "@/i18n/locales";

export default async function DashboardPage({ params }: PageProps<"/[locale]">) {
  const locale = asAppLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("Dashboard");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl">{t("title")}</h1>
      <Suspense fallback={<SectionSkeleton />}>
        <StatCards locale={locale} />
      </Suspense>
      <div className="grid gap-6 lg:grid-cols-2">
        <Suspense fallback={<SectionSkeleton />}>
          <NextSlotCard locale={locale} />
        </Suspense>
        <Suspense fallback={<SectionSkeleton />}>
          <ConnectionWarnings locale={locale} />
        </Suspense>
      </div>
      <Suspense fallback={<SectionSkeleton />}>
        <QuotaPanel locale={locale} />
      </Suspense>
    </div>
  );
}
```

- [ ] **Step 8: Run all tests to verify they pass**

Run: `pnpm test && pnpm e2e`
Expected: all unit tests PASS; e2e PASS (locale 3, auth 5, theme 3, dashboard 10).

- [ ] **Step 9: Lint, typecheck and commit**

Run: `pnpm lint && pnpm typecheck`
Expected: exit 0.

```bash
git add -A
git commit -m "feat: build the Dashboard (counts, next slot, connection warnings, quotas) on the v1.1 API"
```

---

### Task 10: Clerk setup notes and full verification

**Files:**
- Modify: `README.md` (sections "Real sign-in (Clerk)" and "Decisions in M1")

**Interfaces:**
- Consumes: everything above
- Produces: a documented, fully green M1

- [ ] **Step 1: Add the Clerk setup and the M1 decisions to `README.md`**

Append:

```markdown
## Real sign-in (Clerk)

1. Create an application at https://dashboard.clerk.com and enable **Microsoft** and **Email code** sign-in.
2. Put its keys in `.env.local` (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`) and set `AUTH_MODE=clerk`.
3. Rebuild (`pnpm build`). `AUTH_MODE` is read at build time.
4. Give the first person the Admin role: Clerk dashboard → Users → the user → Metadata → **Public** → `{ "role": "admin" }`. Reviewers get `{ "role": "reviewer" }`. Anyone without a role sees "No access yet".

Clerk's keyless mode didn't activate in testing (2026-10-21), so keys are needed even locally. Use `AUTH_MODE=mock` until then.

## Decisions in M1

- **Language in the URL** (`/en`, `/ar`). Next 16 Cache Components forbids reading cookies in the root layout, so the URL drives `<html lang dir>`. The last choice is remembered in the `NEXT_LOCALE` cookie.
- **Theme in `localStorage`**, applied by an inline script before first paint.
- **Digits are Latin** in both languages, and **times are 12-hour in the site's timezone**.
- **No database yet**; it arrives with webhooks in M4.
- **TypeScript 5**, as pinned by the Next.js 16.4 template.
```

- [ ] **Step 2: Run every check from a clean build**

```bash
rm -rf .next
pnpm lint && pnpm typecheck && pnpm test && pnpm e2e && pnpm build
```
Expected:
- lint and typecheck exit 0
- Vitest reports all suites passing (format, env, auth, session, engine-client, engine-mock, nav, dashboard)
- Playwright reports 21 passed
- the build lists `◐ /en`, `◐ /ar` (and the sign-in and no-access routes) and `ƒ Proxy (Middleware)`

- [ ] **Step 3: Manual smoke test in the browser**

Run `pnpm dev` and check:
- (a) `/` → `/en/sign-in`
- (b) sign in as **Admin**: the dashboard shows 8 / 3 / 5 / 41 / 1, "Thu, Oct 22, 10:00 AM", LinkedIn and Instagram warnings with "Fix this in Settings.", and four quota rows
- (c) switch to Arabic: right-to-left layout, Arabic labels, Latin digits, "ص"
- (d) dark mode toggles and survives a reload
- (e) set the cookie `mock_scenario=down` in DevTools and reload: readable error notices, no crash

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: Clerk setup and M1 decisions; M1 foundation complete"
git log --oneline
```
Expected: ten feature/docs commits on top of the scaffold commit.
