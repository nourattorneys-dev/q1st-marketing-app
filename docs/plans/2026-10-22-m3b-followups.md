# M3b follow-ups

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
