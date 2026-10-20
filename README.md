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
- **No database yet**; it arrives with webhooks in M4. Requiring two-factor login for the Admin also lands in M4, with real Clerk sign-in.
- **TypeScript 5**, as pinned by the Next.js 16.4 template.
- **Browser tests build from an empty `.next`.** An incremental build once reused stale compiled CSS.
- **Browser tests match only visible elements after in-app navigation.** Next 16 keeps up to 3 previous pages in the page, hidden (React `<Activity>`).
