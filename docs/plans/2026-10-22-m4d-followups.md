# M4d follow-ups

## Before go-live (M5)

- **Clerk in Arabic:** `/ar/sign-in` and `/ar/security` show Clerk's screens in Arabic, right to left (needs real Clerk keys).
- **The 4 MB photo limit:** a photo between 4 and 5 MB is stopped with the size message on Vercel. A direct-upload address from Quantum1st would lift the limit back to the engine's 5 MB.

## Next: M4e (data and robustness)

From the M4d triage (ids as in that triage), still open:

- **O8, the `not_connected` hint:** pass the Admin flag to the error display on Review (bulk publish), in the editor's save error and the photo panel, and on the settings pages. Give an unknown connection a fallback sentence and link.
- **O19, `/plan` zeros with no notice:** shown when the usage `siteId` doesn't match `/sites`. Fall back to the only site, or show a notice.
- **O20, all-or-nothing usage:** one bad usage row loses the chart, the results and the dashboard share. Parse months and results row by row.
- **O21, a failed timezone read:** hides the next slot and the Scheduled queue. Fall back to UTC, labelled.
- **O22, "Keep my changes":** it merges only top-level settings fields; merge maps one level deep.
- **O23, re-filled map rows:** a passing connection test re-fills map rows the Admin set to "Not sent".
- **O24, a webhook without `siteId`/`at`:** it gets 400 and is retried forever. Require only `event` after the signature checks out.
- **O38, no refresh after a failure:** a failed publish, or a 2xx answer that fails the schema, doesn't refresh the page.
- **O39, gateway 502/504 retries:** an HTML 502/504 from a gateway gets a new idempotency key on retry. Reuse it for `engine_unavailable`.
- **O40, "Still waiting…" forever:** a revoked key or a changed job format leaves job progress waiting. Answer non-200 and read object errors.
- **O41, edit locks:** an idle tab renews them forever, and closing a tab doesn't release them (`sendBeacon` to an unlock route).
- **O42, one bad email setting:** it makes webhook deliveries fail. Validate the services settings per use.
- **O43, `EMAIL_MODE=log` in production:** refuse it on Vercel production.
- **The rest of two partly handled lines:** M2a's i18n line (`post-card.tsx` passes numbers where the rest passes `String(...)`; `JobProgress` shows the engine's English `error.message`) and M3a's limits line (no hint for the 20-keyword limit on a new topic request).
- **The low-impact items in the triage** (O10–O17, O25–O35): pick the visible ones.
