# ADR 0002: Theme architecture

- Status: Accepted
- Date: 2026-10-14
- Issues: #5 (BWB-005); relates to #6, #47, #31
- Deciders: owner, orchestrator
- Reviewers: pending

## Context
Blixis ships a base theme plus a Builder plugin. The editor requires a compatible active theme; documents must survive theme switches. The blueprint prefers a classic/hybrid PHP theme over a full block (FSE) theme, to be validated (`README.md`, `PRD.md` §13). With WordPress 7.0 the Font Library works for classic themes (ADR 0001), removing the main technical argument for a block theme.

## Decision
1. **Classic (PHP template) theme with `theme.json`** — "hybrid": PHP templates own page structure; `theme.json` carries design tokens (colors, typography, spacing, layout) so core and the Font Library integrate. No dependence on the Site Editor for templates in Free.
2. **Tailwind CSS v4** compiled at build time to a static theme stylesheet. It scans only theme source files, never user documents (no runtime class generation). Builder page styles are emitted by the style engine (ADR 0005), not Tailwind.
3. **Ownership split.** Theme: templates, base CSS, token defaults and presets, onboarding entry point, compatibility declaration. Plugin: documents, REST, renderers, editor, public injection. The theme stores no page documents.
4. **Compatibility contract.** A theme is "Blixis-compatible" if its stylesheet or `style.css` header declares `Blixis-Compat: <integer>` (or a child theme whose parent does). The plugin reads it through one `ThemeCompat` service; the editor needs `edit_post` plus compatibility; admin controls need `edit_theme_options`.
5. **Theme switch behaviour.** On an incompatible theme the editor is disabled with an actionable notice; JSON is untouched. The plugin's `the_content` hook renders the document with its own minimal, token-aware fallback CSS so the page is never blank. Switch-back restores editing. Fallback styling quality bar and exact markup are specified in BWB-047 and tested per `TESTING.md` scenario 5.
6. **Tokens and modes.** The theme defines semantic CSS custom properties with light and dark values (ADR 0005) under `--blx-*`.
7. **Setup.** First-run wizard per `WORDPRESS.md`; settings stored once in a versioned option and never overwritten on reactivation.

## Alternatives considered
- *Full block (FSE) theme:* rejected for Free 1.0. Template control would sit in the Site Editor, overlapping our builder and complicating Plus theme templates (FR-030). Revisit via new ADR if Plus templates prove easier on FSE.
- *Theme-agnostic plugin (no compatible theme required):* contradicts PRD FR-019 and the owner's brief.
- *Plugin-only with no theme:* loses token/typography ownership and the onboarding contract.

## Consequences
- We own template maintenance. Core block styles and `theme.json` need compatibility tests.
- Third-party themes can opt in with one header and the token contract.

## Test strategy
Theme activation/reactivation, child-theme eligibility, theme switch and switch-back with and without JavaScript, `theme.json` token round trip, Font Library family appears in tokens, public page without editor JS.

## Rollback
Theme and plugin are separate packages; replacing the theme type requires a superseding ADR and a migration of token storage only (documents are theme-independent).

## Open questions
- Marker format (`Blixis-Compat` header vs `theme.json` key vs filter): confirm in the compatibility-guard spike (BWB-047).

Resolved in BWB-047: the marker is the `Blixis-Compat` header in `style.css`.
- WordPress.org theme-review constraints on required-plugin behaviour.

## Review log
- 2026-10-14 orchestrator draft.
- 2026-10-14 Codex review (P0 ADR review) raised no finding against this ADR; it was included in the reviewed set but not challenged specifically. Consequence for 0005: the Blixis theme must place its CSS in layer `blx.theme`.
