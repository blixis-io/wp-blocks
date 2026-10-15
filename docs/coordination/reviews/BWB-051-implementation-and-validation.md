# BWB-051 canvas iframe protocol: implementation and validation

Workflow: Sonnet 5.5 subagent (canvas-bridge package, canvas runtime, parent session, UI, docs), Codex (GPT-6 Luna) for the PHP canvas screen, CSP, manifest, REST preview client and smoke checks, Opus 5.5 subagent for independent read-only validation, orchestrator for integration and real-environment checks.

## Design
Same-origin PHP canvas document with only the trusted `canvas.js`; the editor embeds it with `sandbox="allow-scripts allow-same-origin"`. Handshake: hello, origin and `event.source` verification, MessageChannel port transfer; all later traffic on the port with strict hand-written schemas. Preview HTML and CSS come from `POST /documents/{id}/preview`.

## Opus validation
Verdict: ready with fixes. Findings and resolution:

| Finding | Resolution |
| --- | --- |
| Frame reload never detected | `load` listener, `notifyLoad()`, reset to waiting, state re-sent on next ready; endpoint and session tests, browser check |
| Preview transport cap rejected valid non-ASCII pages | Cap raised to worst-case JSON escape expansion, exact limits kept on decoded strings, tests |
| Canvas CSP `script-src 'self'` weaker than documented | Per-response nonce on the script tag, nonce-only `script-src`, smoke and unit assertions |
| `rects` computed on every render | rAF batching, sent only on `request-rects` |
| Accessibility gaps | Radio groups, language display name in the iframe title, resize re-measure |
| Test and doc gaps | Real `MessageChannel` test, wider bundle grep, access-policy PHPUnit, header assertions, forged-handshake, reload and CSP probes in the browser check, matrix and contract corrections |

## Orchestrator verification
Frozen install, Prettier, licence and audit checks, `pnpm run check`, `composer run check` (380 tests), reproducible `pnpm build`, real-WordPress `pnpm wp:smoke` from a deactivated state, and the headless-Chrome editor check against the Herd site all pass.

## Known limitations
Canvas lacks theme base CSS and fonts (tokens and compiled CSS only); forged-handshake and CSP enforcement are verified by the dev-only browser check, not in CI; `viewUrl` is the default-locale permalink until BWB-057.
