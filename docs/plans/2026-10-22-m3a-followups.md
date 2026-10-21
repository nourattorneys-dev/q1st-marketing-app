# M3a follow-ups

## Questions for Quantum1st (from M3a)

- `POST …/keywords` says "duplicates skipped and listed". The portal works out the skipped phrases itself, from what it sent minus what came back. If the engine lists them, where (`meta`, `details`)?
- `POST …/suggestions/{id}/draft` takes an optional `platform`. Which platform does the engine pick for a social suggestion when it's left out?
- Can topics (`…/keywords/topics`) and article drafts (`…/keywords/draft-articles`) start from covered keywords too? The portal offers them on New and In use only.
- What do finished jobs return in `result` for proposals, topics and drafts? The mock returns `{keywordIds}`, `{suggestionIds}` and `{postIds}`.
- Confirm 429 `details` is `{metric, used, limit}` for every metered action, and which metric drafting a social post counts against.
