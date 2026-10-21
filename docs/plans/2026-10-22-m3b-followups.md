# M3b follow-ups (from the final review)

Carry these into the M4 and M5 plans.

## Deferred minor findings

- **Keep my changes merges only top-level fields.** The website form's `settings`, `fieldMap` and `blockMap`, and the schedule's `days`, are each one field. So keeping my map edit puts back a colleague's other map entry; both versions do show in the panel. If they switched to Strapi meanwhile, my WordPress map is saved onto Strapi. Merge object-valued fields one level deep, or list map entries as separate conflict rows.
- **The `?connected=` notice can contradict the page.** After a Disconnect on the same URL, on reload, on Back, or from a bookmarked URL, it still says "Instagram connected." Show it only while that row is `ok` or `expiring`, or remove the parameter after showing it.
- **Switching the website type and back** (WordPress → Strapi → WordPress) leaves the saved WordPress values empty until a reload. Save stays blocked, so nothing is saved wrongly. When the type is the saved one, start again from the saved connection.
- **A passing test re-fills map rows the Admin set to "Not sent".** They're stored as missing keys, which look like never-set rows. Remember the rows the Admin cleared.
- **A test's suggestions can land in another type's form** if the type is switched while the test runs. Apply them only if the type is unchanged.
- **First-run tolerance with the real engine.** `siteName`, `siteUrl` and `defaultLang` are required strings, and `secretSet` is a required boolean. A new site that sends `null` for them, or a 404 from `GET …/settings/website` before the first connection, breaks the page. With the first-run redirect, that would send the Admin from the dashboard to a broken page on every visit. Make these fields nullish, treat a 404 as `missing`, and strip secret-kind keys from `settings` before rendering (defence in depth). This goes on the M5 checklist.
- **The `not_connected` hint:**
  - `canManageSettings` defaults to false, so places that aren't wired tell an Admin to "ask your admin": the Social board, the share picture, the SEO proposal, and a bulk publish that fails as a whole.
  - The text always says "can't be published".
  - Without `details.connection`, the link falls back to the website settings even for a LinkedIn post.
- **Smaller points:**
  - Connect buttons stay disabled when the page comes back from the back/forward cache.
  - The AI proposal replaces focus keywords typed while the job ran.
  - `readProposal` refuses `cta: null`.
  - The SEO proposal uses `ActionError`, so a 429 has no upgrade path. This is the known M3a item. — handled in M4a
  - The `defaultLang`, body format and Arabic mode selects show their first option when the saved value isn't in the list. The map editor already adds the saved value as an option.

## Rulings made during M3b

- **Task 2:** the store edits were applied by script. The plan's indented blocks were re-indented, and the code is the same.
- **Task 3:** dropped the unused `Category` import from `store.ts`. The plan's step anticipated it.
- **Task 9:** the first `task-done` run failed in the build, because a Google font didn't download (a network blip). A re-run on the same commit passed.
- **Task 10:** the smoke test ran on its own mock store, so step (d)'s "switch back to WordPress" wasn't needed.
- **Final review:**
  - **Fixed:** a failed connection test answered with `422 not_connected` (spec §9: "its test failed") now shows the engine's own reason instead of "Test the connection first". The mock answers a secret containing "disabled" this way.
  - **Lint failing on the smoke script:** the script lived in the plan's git-ignored workspace, which is deleted at the end. The branch lints clean.
- **Declined in the final review:**
  - The 12/24-hour display of time inputs: the browser controls it. The 12-hour rule applies to engine times, which use `formatDateTime`.
  - HTML `min` on the number inputs: hints only; the engine validates.
  - `originOf` defaults to https without `x-forwarded-proto` on a non-local host: it only affects plain-http LAN development.
  - Mock-only rules, Search Console's status source and the OAuth `?error=` return: plan decisions and open questions, checked at M5.
  - Strict `MetaSchema.targetTypes`: an M1 decision.
  - A Reviewer briefly sees the settings heading and tabs before the redirect: the same as other pages.
  - The first-run redirect inside a streamed Suspense boundary: works from a production build; the flash is cosmetic.
  - No `X-Acting-User` on the connect GET: the spec requires it only for changes.
  - Bulk-publish `not_connected` hints, and the redirect only from the dashboard: plan decisions.
  - A social row skipped when `expiresAt` has no time: the lenient-list policy.
  - Search Console shows "missing" when the site read fails: a degraded path, with an engine notice elsewhere.

## Questions for Quantum1st (from M3b)

- **SEO profile:**
  - Do `POST/DELETE …/settings/seo/picture` change `SeoSettings.version`? The portal assumes not. What does `DELETE` return? The portal expects `{removed: true}`.
  - What does the `…/settings/seo/propose` job return in `result`? The portal reads `{focusKeywords, cta}`.
- **Publishing schedule:**
  - Which limits apply to `perDay` and `gapMinutes`?
  - Is a plan whose posts don't fit between `from` and `to` refused?
  - Are the day codes `sun…sat`?
- **Website connection:**
  - Is a failed test always `200 {ok: false, error}`? Does it change `PublishTarget.status` and `lastError`?
  - What is `type` before the first connection? The mock sends `null`.
  - Which portal-side `fieldMap` keys does the engine accept? The v1.1 example uses `subtitle`; the design draft said `excerpt`. The portal shows whatever keys the engine sends.
  - The labels in `/meta.targetTypes` are English. Could the engine send them per language?
  - The test returns `categories`, but `/meta.targetTypes` lists no default-category field, so the portal doesn't offer one. Should it?
- **OAuth:**
  - What does `returnUrl` receive when a sign-in fails or is cancelled (for example `?error=`)?
  - Does `GET …/connect` change anything before the provider answers?
- **`422 not_connected`:** does `error.details` say which connection? The portal reads `details.connection`.
- **Search Console:** its status is read from `site.connections.searchConsole`, as there's no `GET …/settings/search-console`. Please confirm.
- **Added by the final review:**
  - Does a failed connection test ever come back as `422 not_connected` rather than `200 {ok: false}`? The portal now handles both.
  - Before the first connection, does `GET …/settings/website` answer 404, or a target with `status: "missing"`? Can `SeoSettings` fields be `null` on a new site?
- **Deployment (M5):** consider an environment-configured portal origin as the main OAuth return address, with the request's headers as a fallback.
