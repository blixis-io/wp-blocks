# BWB-050 implementation and validation record

**Work split.** State slices, command bridge, compose/split, UI wiring and docs: Claude Sonnet 5.5 subagent. REST client (`apps/editor/src/api`, trust boundary): Codex with GPT-6 Luna, against a contract file written by the orchestrator (`api/types.ts`). Orchestrator: contract, demo working streams, PHP follow-up, real-WordPress smoke, real-browser check. Independent validation (read-only): Claude Opus 5.5 subagent.

**Validation verdict:** READY WITH FIXES. Findings and resolution:

| Finding | Severity | Resolution |
|---|---|---|
| Redo after a coalesced burst did not reproduce the post-burst document (type then revert lost the stale marking of other locales) | High | merge only when replaying the latest command on the pre-burst base deep-equals the current document and the first inverse restores the base; regression tests |
| A listener dispatching during notification delivered events out of order | Medium-high | FIFO queue drained by one loop, per-event documents, error isolation; re-entrancy tests |
| ES2024 `isWellFormed` reachable at runtime in an ES2022 bundle (older browsers failed every load) | Medium | core helper with feature detection and a code-unit fallback (a lookbehind regex was rejected: Safari before 16.4 cannot parse it), tested against the native method with and without it; bundle grep; browser floor documented |
| The REST client followed redirects (could carry the nonce header off-origin) | Medium | `redirect: 'error'` and a `redirected` check |
| Client node cap could refuse documents core accepts | Medium | cap derived from the response byte limit; maximal-document test |
| Load error only inside the Structure panel (silent when collapsed; focus lost on retry) | Medium | alert in the shell main region, focus moved to the loading status |
| Edits allowed after a failed reload | Low-medium | commands refused with `not-ready` while in error |
| Content-locale precedence ignored explicit links (PHP always sent the default locale) | Low | generic links omit `locale`; new bootstrap field `contentLocaleExplicit` decides precedence |
| Inspector header without label; selector walked the tree on every update | Low | visually hidden prefix; derived with `useMemo` |
| Tests proved less than the docs claimed | Test quality | 5,000-element performance test with dirty comparison, missing tests added, docs corrected |

**Verified in real environments.** Real WordPress smoke (unchanged PHP behaviour plus the new bootstrap field); real browser (headless Chrome against the Herd site): the editor loads the demo page's working streams through the REST API with HTTP 200 for the layout and both content streams, the outline lists the loaded elements, a click selects with `aria-current`, the inspector header shows the element, undo is disabled before any command.
