# M1 follow-ups (from the final review, 2026-10-21)

Carry these into the M2–M4 plans.

## Deferred minor findings

- reads don't retry non-JSON 5xx gateway pages (engine_unavailable thrown immediately).
- limit 0 + used 0 shows "ok" with empty bar; in hard mode it's effectively exhausted. — handled in M4a
- nextSlotView invents "queue_empty" when engine sends neither nextSlotAt nor waitingReason.
- a failed site read hides a valid next slot (could fall back to UTC).
- no error.tsx — non-engine throws (e.g. Clerk outage) show Next's default error page. — handled in M2b; handled in M4d (the `[locale]` boundary covers the app frame; `global-error.tsx` the root)
- unmapped engine codes (not_found, engine_busy) show the engine's English message in the Arabic UI. — handled in M2a (engine_busy and not_found translated)
- NextIntlClientProvider ships every message on every page; pass only client-needed namespaces.
- after test-login sign-out, hidden (Activity) dashboard copies stay in the DOM until next navigation; recheck with Clerk sign-out in M4. — handled in M4b (sign-out loads the sign-in page afresh in both modes)
- live mode accepts http:// ENGINE_BASE_URL (key in clear text); require https except localhost.
- getSession not wrapped in React cache() — up to 6 currentUser() calls per render in Clerk mode. — handled in M4b
- "Published" stat vs spec's "published this month" — confirm counts.published semantics with Quantum1st.
- `vercel env pull` may write VERCEL="1" into .env.local and refuse local test logins with a confusing message.

## Rulings made during M1

- Setup: Ruling: work on branch m1-foundation (created from create-next-app's initial commit 72d1707 on main) — skill forbids implementing on main without consent; the repo is brand new so a branch costs nothing — cost if wrong: one merge at the end.
- Setup: Ruling: workspace/ledger created after Task 1 step 1, because the repo (and the plan copy inside it) is what Task 1 creates — cost if wrong: none (Task 1 still recorded via task-done).
- Task 6: Ruling: plan passed DirectionProvider direction={dir}, but shadcn's DirectionProvider type requires Radix's 'dir' prop (direction is an optional alias) — use dir={dir}; identical behaviour (component does direction ?? dir) — cost if wrong: none, same rendered output.
- Task 6: Ruling: renamed vitest.config.ts → vitest.config.mts — Vite warned the ESM config is loaded as CommonJS (no "type":"module") and native loading will become default; .mts is the minimal fix without changing package type — cost if wrong: one rename back.
- Task 6: Ruling: build shows /en and /ar as ○ (static) not ◐ — no runtime reads exist until Task 7's session guards, so static is correct now; expectation carried to Task 7 — cost if wrong: none.
- Task 7: Ruling: language-switch e2e matched 3 user-role badges — Next 16 (cacheComponents) keeps up to 3 previous routes in the DOM hidden by React <Activity> (docs: preserving-ui-state.md); the app is correct, the test was wrong — assert on .filter({ visible: true }) after in-app navigation; later e2e tests that navigate client-side must do the same — cost if wrong: none (visible element is what the user sees).
- Task 8: Ruling: an incremental 'pnpm build' right after rewriting globals.css produced compiled CSS with the OLD tokens (no data-theme/ok-bg/#f6f5f2); a clean rebuild was correct. next build has no cache-skip flag, so the e2e webServer now runs 'rm -rf .next' before building — cost if wrong: ~10s slower e2e start; prevents false passes/fails from stale builds.
- Final: Ruling: reviewer challenged Task 8's ruling premise ("next build has no cache-skip flag") — correct, experimental.turbopackFileSystemCacheForBuild exists (on by default since 16.3). Repro attempt (edit a token, incremental build) did NOT reproduce stale CSS; keep Next's default build cache for real builds and keep the clean e2e build as cheap insurance; README notes the flag if it recurs — cost if wrong: a stale-CSS build could ship from a restored cache (would be caught visually; switch the flag off then).
- Final: Ruling: declined-to-judge "new connection keys beyond the four are dropped by Zod" — spec §4 calls shapes exact, so a new connection is a contract change handled when it's added; "never hidden" applies to new values of known fields — cost if wrong: a new connection's warning wouldn't show until the UI adds it.
- Final: Ruling: declined-to-judge "401 shows four section notices, not spec §9's site-wide banner" — M1 plan pins per-section notices; the site-wide banner belongs with the M2 layout work — cost if wrong: repeated message on a revoked key until M2.
- Final: Ruling: declined-to-judge "dashboard 'this site's share of usage' not shown" — needs /account/usage, planned for M4 Plan & usage page — cost if wrong: dashboard lacks per-site share until M4. — handled in M4a (dashboard and /plan show this site's share)
- Final: Ruling: declined-to-judge "connection warnings don't link to Settings / no first-run redirect" — Settings pages arrive in M3; add links and redirect there — cost if wrong: admins read the text but have no link until M3. — handled in M3b (warnings link to Settings; first-run redirect)
- Final: Ruling: declined-to-judge "sign-in and no-access pages lack language/theme toggles" — UX gap; add the language switch to those pages in M2 shell work — cost if wrong: Arabic users must edit the URL to /ar/sign-in until then.
- Final: Ruling: declined-to-judge "NEXT_LOCALE is a session cookie" — next-intl v4 default; acceptable since the URL carries the language — cost if wrong: language resets to English after browser restart.
- Final: Ruling: declined-to-judge items covered by recorded deviations (2FA, database, Vercel preview), visual fidelity vs prototype (checked by screenshots), shadcn generated files — no action.
