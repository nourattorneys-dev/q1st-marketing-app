# M2b follow-ups (from the final review)

Carry these into the M3–M5 plans.

## Deferred minor findings

- **No refresh after `publish_failed`.** Only successful changes call `refresh()`, but a 502 turns the post into `failed`:
  - the editor still shows the old status, and Save is offered
  - the Scheduled row stays, and Hold then returns 422

  Refresh on any definite answer that may have changed state.
- **Two more answers mean "outcome unknown" but are treated as definite:**
  - A gateway's HTML 502/504 (`engine_unavailable`) gets a new key on retry; it should reuse the key, like `network_error`.
  - A 2xx publish whose returned post fails the schema (`invalid_response`) went through, but nothing refreshes.
- **Review on a page past the end says "Nothing is waiting for review."** Reuse History's "There's nothing on this page" with a link to page 1.
- **Scheduled ignores paging.** If the real engine pages `GET …/scheduled`, later posts can't be reached.
- **A photo action can overlap an in-flight Save.** If a pick lands before the save, the user's own pick shows as "Someone saved first". Disable Save during photo actions and photo actions during Save.
- **An upload over 4.5 MB on Vercel shows "can't be reached".** It also keeps the key, so retrying fails the same way. Show a size message instead.
- **The time-zone e2e test depends on the machine.** Times are formatted on the server, so set `TZ=UTC` in the e2e web server's environment and `timezoneId` in Playwright's settings.
- **Test gaps:**
  - History has no Arabic seed, so right-to-left there is untested.
  - The drift e2e test covers /review and a /history page, but not /scheduled.
  - The `useEngineAction` hook's wiring is untested; only its pure key-memory helpers are.
- **The M1 `error.tsx` follow-up is only partly handled.**
  - `(app)/error.tsx` doesn't cover its own layout (`SidebarNav`, `UserMenu` and `ServiceBanner` read the session; `getSession()` in `ServiceBanner` isn't inside its `try`).
  - There is no `global-error.tsx`.
- **One key memory is shared by all rows on the Scheduled and History boards.** A no-answer publish on one row is forgotten once another row is acted on. Low risk, because the engine refuses to republish.

## Rulings made during M2b

- **Task 2:**
  - Kept `ScheduledSchema` in `engine-mock.test.ts`'s import, because another test there still uses it.
  - Three older assertions moved to the new action contract (p_209 counted, pending posts gain `publishNow`, approved posts get `hold`/`resume` and `publishNow`).
  - Unit counts run 5 above the plan, because a per-article structure test covers 5 more seeds.
- **Task 5:** applied the editor's type-only adaptations before the e2e RED run, so the build compiled. RED still failed for the right reason.
- **Task 6:** narrowed the lock heartbeat's reply to `EngineFailure` for typing; the behaviour is unchanged.
- **Final review:**
  - A rule that can't be overridden (`structure_mismatch`) now blocks publishing in any status, in the editor, on Scheduled and in the mock. Before, an approved twin could stop matching its English version and still be published.
  - History shows the skipped note even when every item on a page was left out.
  - Publishing, bulk actions and photo uploads get 120 s per attempt instead of 10 s.
- **Declined in the final review:**
  - Idle lock renewal, the `pagehide` release and the unsaved-changes guard: still deferred, as recorded in the M2a follow-ups.
  - Role-specific `not_connected` / quota hints and polling through `/api/jobs`: these belong to M3/M4. — not_connected handled in M3b
  - "Create social posts" in History and the editor: feature-flagged; it stays hidden while `/meta.features` is empty.
  - Whether the real engine's list and queue items carry `actions`: already a question for Quantum1st.
  - The Vercel 4.5 MB cap: a recorded risk. The misleading message is deferred above.
  - The global 6 MB server-action body limit: a plan decision.
  - History's Retry calls `POST …/publish` directly: spec §6 lists that call.
  - The editor doesn't show `post.error`: the spec asks for the error text only in History.
  - The mock reports `scheduledAt` in post views in the `manual` scenario: no screen reads it from there.
  - The mock never auto-publishes over time: a mock simplification.
  - Bidi isolation of Arabic titles inside English "title: message" lines: cosmetic.
  - No maximum length on the idempotency key: only signed-in users can send one.

## Questions for Quantum1st (added by the final review)

- **Publish time:** how long can a publish (and a bulk publish) take? We wait 120 s per attempt.
- **Duplicate key in flight:** what happens when a request with the same `Idempotency-Key` arrives while the first one is still running?
- **Deployment (M5):** check the Vercel `maxDuration` for the pages whose server actions publish.
- **Drift checks (M5):** the drift checks against the sandbox must assert that lists report `skipped === 0`, since lenient lists otherwise hide drift.
