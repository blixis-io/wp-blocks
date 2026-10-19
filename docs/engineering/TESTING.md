# Testing Strategy

## Goals

Testing is a release criterion, not a post-release activity. Test features at their cheapest reliable layer and reserve cross-browser E2E for user journeys. Every defect fix adds a regression test.

## Tools (proposed)

- TS schema, state, commands, CSS compiler: **Vitest** + property-based tests (fast-check where worthwhile).
- React UI: **React Testing Library** + user-event + axe accessibility checks.
- PHP renderer, REST, WordPress data: **PHPUnit** with official WordPress test suite/factory fixtures, PHPCS and PHPStan.
- Browser/system: **Playwright** for Chromium, Firefox and WebKit; desktop and mobile viewports.
- Visual snapshots: Playwright screenshots of deterministic fixtures, reviewed on intentional changes.
- Security scanning: dependency scanning, secret scanning, static analysis; fuzz CSS and document input.

Fixture conventions and shared helpers: [FIXTURES.md](FIXTURES.md).

## Required suites

| Layer | Scenarios | Minimum gate |
|---|---|---|
| Unit | tree insert/move/delete, invalid nesting, history, CSS tokens, schema validation | per PR |
| Contract | TS/PHP JSON fixtures, generated CSS snapshots, renderer parity | per PR |
| Integration | WP meta/revisions, REST auth, theme gating, fonts, migrations | per PR |
| UI | inspector fields, keyboard navigation, selection, drag overlays | per PR |
| E2E smoke | activate/setup/create/edit/publish/reload/switch theme | per PR or merge queue |
| E2E full | three engines, responsive widths, add-on and migrations | nightly/release |
| Accessibility | keyboard, focus, labels, landmarks, contrast, axe | per PR + release manual |
| Performance | representative frontend fixture, editor interactions and bundle budgets | nightly/release |

## Must-have end-to-end scenarios

1. New WP install → activate theme/plugin → setup preset → custom tokens → save → reload persisted settings.
2. Create page → add elements → reorder through structure tree and canvas → edit responsive styles → undo/redo → save → publish → front end matches preview.
3. Save conflicts from two editor tabs → 409 or explicit conflict UI; user can recover their draft.
4. Keyboard-only edit and structure reorder; visible focus and semantic HTML.
5. Switch away from Blixis theme → editor unavailable with explanation; JSON remains; frontend behavior matches documented ADR; switch back → editor resumes.
6. Child theme remains eligible; unauthorized user receives 403; nonce/CSRF failure rejected.
7. Font Library add/remove/use family; missing font falls back predictably; no duplicate font download.
8. Premium absent, disabled, expired and restored states preserve documents and apply fallback rules.
9. Invalid/hostile CSS or document props cannot inject script, HTML, URL hazards or cross-site preview content.
10. Upgrade N-2 fixture documents with migrations; no dropped unknown component data.
11. Theme/WordPress/plugins coexist and public pages load without editor JS.
12. Docs: Starlight nav/search, tutorial code examples, responsive accessibility and link checks.

## Coverage policy

Initial targets: core schema/state/style packages >= 90% branch where meaningful; REST/PHP rendering >= 80% branch; no artificially enforced blanket percentage for UI. Update coverage thresholds after first architecture slice. Tests are judged by behavior and contract coverage, not just percentages.

## Test data and environments

- Use deterministic seeded WP fixtures, local Docker or wp-env, fixed clock/timezone, known font fixtures, sampled theme variations.
- Run WordPress 7.0 and 7.1 against PHP 8.2, 8.3 and 8.5 in the pull request integration smoke matrix; pin every container image by digest.
- Structure outline interactions use dnd-kit pointer and keyboard sensors for up to 250 visible rows; larger outlines keep keyboard reorder (Alt+Arrow keys) and omit per-row drag registration to keep rendering responsive. Verify sibling reorder, compatible-container nesting, rejection of invalid nesting, drop-target indication, keyboard reorder, and locked-document behavior.
- Secrets only in GitHub Actions secrets; separate isolated DB per parallel worker.
- Preserve failing Playwright traces/screenshots and PHP logs as restricted CI artifacts.

## Quality gates

PR merge blocked on formatting, lint, type-check, unit, PHP unit, integration smoke, build and secret/dependency scan. Nightly runs full matrix; releases require all critical E2E, migration, accessibility and security checks green. Flaky tests are fixed/quarantined with issue and owner, not silently ignored.
