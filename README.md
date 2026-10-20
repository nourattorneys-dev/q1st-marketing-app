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
