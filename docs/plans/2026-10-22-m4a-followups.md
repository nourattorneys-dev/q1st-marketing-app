# M4a follow-ups

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
