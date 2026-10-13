# ADR 0007: Free / Plus / Pro allocation for translation and appearance modes

- Status: Accepted (owner decision 2026-10-14)
- Date: 2026-10-14
- Issues: #103 (BWB-103), #6
- Deciders: owner
- Reviewers: n/a (product decision); consistency review by Codex pending

## Context
`PRD-ADDENDUM` FR-073 required a written allocation before shipping. Free must be genuinely usable; premium must not be required to render already-published content.

## Decision
**Free includes (no artificial limits):**
- Manual multilingual content editing; multiple content languages; locale-specific content storage.
- Translation statuses (missing/draft/translated/reviewed/stale) and fallback behaviour.
- Light and dark website appearance styling; global light/dark design tokens; element-level appearance overrides; responsive styling; light/dark previews (including side-by-side comparison).
- Independent locale publishing (ADR 0004).

**Plus/Pro candidates (separately distributed add-ons):** automated AI translation; translation provider integrations; advanced translation workflows (bulk, XLIFF, review queues); translation memory; advanced localisation rules; conditional rendering; advanced animation; professional theme-builder features; WooCommerce integrations. Tier assignment of each is decided when its issue is scheduled (P8/P9); this ADR only fixes the Free floor.

**Lifecycle invariants:** deactivating or letting a paid add-on expire never removes translations or mode styles, and public rendering of published content never depends on an add-on or a license check (FEATURE-MATRIX invariants). Paid features that add *editing* controls degrade to read-only/hidden controls, not data loss. Pricing, billing and license mechanics are separate business decisions.

## Alternatives considered
Gating light/dark or additional locales in Plus: rejected by owner as an artificial restriction of fundamental capability (and a WordPress.org risk).

## Consequences
Free carries the full translation data model and cascade engine; paid value comes from workflow and integrations. Bulk export/import and provider adapters (#122, #123) remain paid candidates and must not be required by Free flows.

## Test strategy
Feature-registry tests: all Free capabilities available with no add-on installed; add-on removal/expiry leaves translations and mode styles editable and rendered.

## Rollback
Moving a Free capability to a paid tier is prohibited without a superseding ADR and a migration plan; moving capabilities *into* Free is allowed.

## Open questions
None blocking. AI translation consent/privacy design is deferred to #123.

## Review log
- 2026-10-14 recorded from owner decision. Codex review raised no finding.
