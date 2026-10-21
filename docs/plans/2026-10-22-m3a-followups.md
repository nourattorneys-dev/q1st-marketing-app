# M3a follow-ups (from the final review)

Carry these into the M3b–M5 plans.

## Deferred minor findings

- **Job polling treats too much as a blip.** Every failure except `not_found`/`signed_out` counts as a blip, including:
  - `unauthorized` (a revoked key)
  - `invalid_response` (a drifted job shape), which the route even answers with HTTP 200

  Either way the tracker shows "Still waiting for the server…" forever. Treat only `network_error`, `engine_unavailable`, `engine_busy` and 5xx as transient.
  - Related: `job.error` is shown only when it's a string. An `{code, message}` object falls back to "The job failed.", but spec §2 says to show the engine's message.
- **Polls can overlap** (`use-job.ts`). A slow engine makes one poll take up to about 31 s, while a new one starts every 3 s. Skip a tick while a request is still running.
- **AI keyword proposals show errors with `ActionError`, not `ActionFailure`.** A 429 there (for example on `aiTokens`) shows the raw message with no upgrade path. — handled in M4a
- **A per-item `quota_exceeded` inside a bulk result** shows as "title: message" without the upgrade path. Bulk Draft under quota also has no e2e test.
- **A 429 without `details.metric`** reads "Monthly limit reached for ." Fall back to a sentence without the metric. — handled in M4a
- **Limits give an English-only "Invalid request.":** over 50 phrases, a phrase over 100 characters, or over 20 request keywords. There's no limit hint or field message.
- **Stale "Not done:" lines on Keywords:** the `failures` list isn't cleared on an error or a later action.
- **`jobAction` in `review/actions.ts` is dead code** but still a public server action. Remove it and its test.
- **"Added 0 keywords." / "أُضيفت 0 كلمة مفتاحية"** when every phrase was a duplicate. Add a `=0` form.
- **Mock fidelity:** both posts of a "both" pair get the English title, so RTL is never tested on an Arabic draft title from these flows. Give the twin `topicFor(phrase, "ar")`.

## Rulings made during M3a

- **Task 3:** the seeded never-ending drafting job keeps `{postIds:[p_207]}` as its result instead of the plan's `complete: () => null`. The job never completes, so behaviour is identical.
- **Final review:**
  - `/api` routes now go through the proxy, so Clerk's `auth()` works in `/api/jobs/[id]`. API paths pass straight through without a locale redirect.
  - Vitest inlines `next-intl`, so a unit test can import the proxy. Its middleware imports `next/server` without a file extension, which plain Node rejects.
  - The Arabic comma (،) separates keywords too.
  - The Ideas list is paged like Keywords (`/meta.limits.pageSizeDefault`, `Pager`, and the "nothing on this page" link).
  - A card's own draft shows a `JobTracker` until the job ends. It replaces the static "Drafting" spinner on that card, so the older "both languages" e2e test now waits for the tracker.
  - **Deferred:** capping the page-wide `AutoRefresh` for bulk drafts. A bulk result carries no job ids, and what a failed job leaves behind is a question for Quantum1st (below).
- **Declined in the final review:**
  - Mock-only names (`source: "person"`, LinkedIn as the default social platform, duplicates worked out by the portal): plan decisions, checked at M5.
  - `addKeywords` parses its response strictly: covered by the deferred M2b `invalid_response` item.
  - Arabic normalisation (diacritics, alef forms) when comparing duplicates: the engine's rules are unknown.
  - Search, filter and select-all on /keywords; restoring dismissed suggestions: the spec doesn't ask for them.
  - Keyword and suggestion badges from webhooks: M4. — M4c: not built; every list and the dashboard read the engine when they open, so counts are current without webhook badges
  - An empty keyword tab page after approving: the same class as the deferred M2b Review item.
  - `role="status"` announcing every percent: inherited from M2a.
  - Dismiss offered on In use keywords: the engine decides, and refusals are listed.
  - The Add language picker doesn't detect Arabic text: the request carries the language the person chose.
  - "Requested" isn't remembered across dialogs: the engine handles repeats, and M4's plan page owns upgrade status.
  - The mock never fails a job: the reducer tests cover failure.
  - One Clerk Backend API call (`currentUser()`) per poll: the existing session pattern. Consider reading the role from session claims later. — handled in M4b (the role comes from the session token)

## Questions for Quantum1st (from M3a)

- `POST …/keywords` says "duplicates skipped and listed". The portal works out the skipped phrases itself, from what it sent minus what came back. If the engine lists them, where (`meta`, `details`)?
- `POST …/suggestions/{id}/draft` takes an optional `platform`. Which platform does the engine pick for a social suggestion when it's left out?
- Can topics (`…/keywords/topics`) and article drafts (`…/keywords/draft-articles`) start from covered keywords too? The portal offers them on New and In use only.
- What do finished jobs return in `result` for proposals, topics and drafts? The mock returns `{keywordIds}`, `{suggestionIds}` and `{postIds}`.
- Confirm 429 `details` is `{metric, used, limit}` for every metered action, and which metric drafting a social post counts against.
- **Added by the final review:**
  - What status does a suggestion get when its drafting job fails?
  - Are bulk quota refusals reported per item (`failed[].code`) or as a whole 429?
  - Is `job.error` a string or an `{code, message}` object?
  - Does `GET …/suggestions` page its results, and in what order?
- **Deployment (M5):** on one Clerk-mode Vercel preview, run a redraft and a keyword proposal through to "Done".
