# M2a follow-ups (from the final review)

Carry these into the M2b–M4 plans.

## Deferred minor findings

- Idempotency key reuse ignores input changes: after a `network_error`, a retry with an edited note or form reuses the key and gets `idempotency_mismatch`; a retried lock heartbeat replays the old lock instead of renewing it. Fingerprint the input; use a fresh key per heartbeat.
- Lock lifetime: an idle open tab renews its lock indefinitely (spec: "while editing"); closing a tab doesn't release it (no `pagehide` handler), so it waits for the 15-minute expiry; Approve/Reject/Changes/Delete stay enabled while someone else holds the lock, and a `locked` reply from them shows the raw message instead of the banner with Take over.
- No unsaved-changes guard on Back, the language switch, Ask for changes or Reject.
- The review queue shows only the first page (25 posts); later posts can't be reached.
- One malformed post blanks the whole queue (`PostsSchema` is a plain array), against M1's "one bad field shouldn't blank the app".
- Job/status polling and lock heartbeats use server actions, which Next runs one at a time per client; design §8 names `/api/jobs/[id]`. Move before M3/M4 add more polling.
- Mock mode: the `mock_store` registry grows with every cookie value (anyone can set it); on Vercel previews the state lives per server instance and resets on cold starts. Document in the README or cap the registry.
- i18n: "1 warnings" in English; Arabic dual and 11+ plurals; `post-card.tsx` passes numbers where the rest passes `String(...)`; the dialog's screen-reader "Close" is English; `JobProgress` shows the engine's English `error.message`; the server's `INVALID` message is English only.
- `useEngineAction` itself has no unit test (only `shouldReuseKey`).

## Rulings made during M2a

- `getEngine`'s mock branch awaits `connection()`: the mock store reads its clock, which Next flagged while prerendering; a real engine call is network I/O and is excluded the same way.
- `LocaleSwitch` reads `usePathname()` inside its own Suspense with an inert same-size fallback, because `/review/[postId]` has a segment unknown at build time. (The reviewer suggests reading `window.location.pathname` on click instead, which would avoid the brief disabled state.)
- The editor counts only real edits: TipTap's rewriting of engine HTML, `setEditable` and the trailing node no longer mark an article as changed; `trailingNode` is off (use the arrow keys to type after a final table or list).
- The editor keeps a draft (form + the version it started from): saves send that version, so a newer save by someone else always becomes a conflict; Take over and newer server versions replace the form when nothing is unsaved; Keep mine applies only my changed fields on top of theirs, and the conflict panel shows both values.
- Body fidelity: links keep their own `target`/`rel`; images, h1–h6, superscript and subscript are kept. Anything else the editor can't represent (e.g. `<details>` FAQ, `<figure>`, `<iframe>`) makes the body read-only with a notice, saved byte-exact. **Ask Quantum1st for the neutral form's FAQ markup**, then add a matching extension.
- The mock stores articles in a neutral form (no `<p>` inside list items or cells, no TipTap table sizing) and refuses malformed slugs with `error.fields`, so the portal can't rely on getting its own HTML back.
- "Matching structure" counts list items and table rows (spec v1.1 §11), the same way in the side-by-side view and the mock's check. The real engine's rule is still unknown until Quantum1st sends the rulebook.
- Ids that go into engine URLs must match `^[A-Za-z0-9_-]{1,64}$` (actions and the engine API), so `..` can't reach site-level endpoints.
- Seed p_203 has an FAQ `<details>` block, so its body is read-only on the preview by design.
- Not done, by decision: no link/table/quote tools in the toolbar yet; approve sends no version (spec §7 defines none); in the Arabic interface the side-by-side view puts English on the start (right) side.
