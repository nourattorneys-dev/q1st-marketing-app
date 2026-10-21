# M4a follow-ups (from the final review)

Carry these into the M4b and M5 plans.

## Deferred minor findings

- **Hashtag characters:** typed hashtags lose combining marks and joiners.
  - Arabic harakat are stripped (`#مُحامٍ` becomes `#محام`), as are a Persian ZWNJ and Devanagari vowel signs.
  - `#Dubai🔥` becomes `#Dubai`, and `#🇦🇪` is dropped.
  - `#DubaiLaw#UAE` becomes one tag, and the Arabic semicolon doesn't split tags.
  - Fix: allow `\p{M}` and ZWNJ/ZWJ, NFC-normalise before comparing, and split on `#` and `؛` too. Tags from the engine aren't re-parsed.
- **The caption count is in code points, not what a person sees:** `👍🏽` counts 2 and `مُحامٍ` counts 6. Use `Intl.Segmenter`, or reword the comment and test.
- **Site health's "Not done:" list and the selection go stale** across a scan, a fix preparation or a tab change (this repeats the M3a pattern).
- **`/plan` can show zeros without a notice:** if `engine.siteId()` fails, or if usage's `siteId` doesn't match `/sites`. Fall back to the only entry when there's exactly one, or show a notice.
- **The period dates can be a day off without a hint** when the site's timezone can't be read (the fallback is UTC).
- **`UsageSchema` is all-or-nothing:** one bad month or result row loses the chart, the results and the dashboard share. Parse `months` and `results` leniently.
- **A finding in a status the tabs don't request** (for example `failed`) appears in no tab.
- **The dashboard's "This site:" line is hidden rather than 0** when the engine leaves out the month or the metric. For a `scope: "site"` quota it repeats `used`.
- **Duplicate hashtags from the engine** produce duplicate React keys, and removing one chip removes both. Key and remove by index.
- **Test gaps:**
  - nothing checks the Arabic caption's direction
  - the plan e2e "a month with no numbers as 0" actually checks a metric with no numbers
  - no e2e covers an Admin's Request upgrade after a scan 429
- **A plan Decision doesn't match the mock:** it says critical findings come first, but the mock returns insertion order.

## Rulings made during M4a

- **Task 3:** the M1 test "handles a zero limit without NaN or Infinity" asserted that limit 0 with used 0 reads ok, at 0% (the behaviour the M1 follow-up flagged). It now expects over, at 100%.
- **Task 4:** `action-inputs.test.ts` had no top-level `key`, so one was added above the new `describe`. This was the plan's stated fallback.
- **Task 6:** the editor blocks were located by content, because the plan's list indentation differs from the file's. The code is the same.
- **Task 7:** the dev smoke test runs from outside the repo, on a warm dev server, and acts only after `networkidle`. A log written inside the repo made Turbopack recompile and reload the page, which aborted the upload. A cold dev server loops reloads on the first pages it compiles, and dev hydration is slow. The production build and the e2e tests aren't affected.
- **Final review:**
  - **Fixed:** the plan period's month now comes from the period's midpoint, so a UTC-written start (`2026-09-30T20:00:00Z` for Dubai's October 1) no longer shows September's site usage. `monthOf` and its test were removed.
  - **Fixed:** Scan site and Prepare fixes stay disabled while their job runs (`JobTracker` and `useJob` gained `onSettled`), so a second click can't spend another metered scan.
- **Declined in the final review:**
  - Bulk approve and publish of a photo-less Instagram post from `/review` or `/scheduled`: the engine's per-item 400 names the post, and the client-side rule is for the editor.
  - A running job forgotten after a reload, overlapping polls, `job.error` objects, and the one-request key memory: existing patterns or M3a follow-ups. Job webhooks belong to M4b.
  - The `sites` metric charted as zeros, no per-platform caption limits, no level filter, and the webhook GET/PUT: plan decisions, open questions, or M4b.
  - A stale photo-less view blocking a legitimate approve: not realistically reachable, since only the lock holder edits and photo changes reload the post.
  - The bidi of an LTR URL inside the Arabic apply confirmation: cosmetic.
  - The mock's 422 for preparing with no open findings: the mock's existing convention for state errors.

## Questions for Quantum1st (from M4a)

- **Site health:**
  - Can a fix be applied only after it's prepared?
  - Who may dismiss a finding? The portal lets both roles dismiss, and only the Admin apply.
  - Which order and page size does `GET …/site/findings` use? Is `level` a comma-separated filter?
  - What does a finished scan or fix job return in `result`? The mock returns `{findingIds}`.
- **Usage:**
  - Are `from`/`to` inclusive months in the site's timezone?
  - Is a month with no activity missing, or present with zeros?
  - Should `plan.metrics` like `sites` (account-level) be charted per site?
- **Social posts:** what are the caption and hashtag limits per platform (LinkedIn, Instagram)? Could `/meta.limits` carry them, so the preview's count can warn?
- **Upgrade requests:** is there a way to read whether an upgrade request is pending? The portal remembers "requested" only until the page reloads.
- **Added by the final review:**
  - How does the engine join a social post's `content` and `hashtags` when posting? The preview assumes a blank line between them.
  - Can a finding take a status besides open, prepared, applied and dismissed (for example `applying` or `failed`)?
  - Does `/account/usage` always use the same `siteId` as `GET /sites`?
  - Which offset does `Plan.period` use, the site's or UTC? The portal now reads the period's midpoint, so either works.
