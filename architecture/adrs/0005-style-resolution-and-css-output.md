# ADR 0005: Style resolution and CSS output

- Status: Accepted (owner decision 2026-10-14); implementation details reviewed by Codex, findings applied
- Date: 2026-10-14
- Issues: #102, #106, #107, #24, #25, #26, #108, #113
- Deciders: owner
- Reviewers: Codex (see Review log)

## Context
Owner decision: a deterministic, composable style resolution model with four layers — base, responsive breakpoint overrides, appearance (light/dark) overrides, combined appearance + breakpoint overrides. For conflicting values at the same effective level, appearance-specific overrides beat generic responsive overrides, so independent `dark` and `mobile` definitions resolve to `dark`; an explicit `dark + mobile` rule beats both. Without it the dark value applies. The cascade must be independent of stylesheet insertion order, avoid specificity escalation, prefer generated cascade layers, support mode-specific design tokens, behave identically in editor canvas and PHP output, be exhaustively tested, and document breakpoint precedence and inheritance separately.

Worked example (owner): base black; mobile gray; dark white; dark+mobile light gray → dark mobile = light gray; without dark+mobile = white; light mobile = gray.

## Decision
### 1. Resolution algorithm (per element, per CSS property)
Inputs: context `(mode ∈ {light,dark}, viewport breakpoint, active states)`.
Candidate rules come from three **origins**: design tokens, global classes, the element's own rules. A rule *matches* when its `mode` (if set) equals the context mode, its `breakpoint` (if set) contains the viewport, and its `state` (if set) is active. The winner for a property is the matching rule with the highest key, compared lexicographically:

| Priority | Component | Order (low → high) |
|---|---|---|
| 1 | Origin | token < class < element |
| 2 | State | none < `hover` < `focus` < `focus-visible` < `active` |
| 3 | Layer | `base` < `breakpoint` < `mode` < `mode+breakpoint` |
| 4 | Breakpoint | registry order, widest → narrowest (narrower wins) |
| 5 | Class order | position in the **site-wide global class list** (later wins); only applies to class origin |

A rule with no state, mode or breakpoint belongs to the `base` layer. Properties absent from the winning rule fall through to the next-highest matching rule (per property). Source order is never a tiebreaker; two rules with an identical key (same origin, class, state, mode, breakpoint) are a validation error. Layer 2 (`mode`) beats layer 1 (`breakpoint`), realising "dark beats mobile"; layer 3 beats both.

Class precedence is a property of the global class list (reorderable in the UI), **not** of the per-element `classIds` order; `classIds` order is presentation only. (This replaces the earlier draft and ADR 0003's "order is semantically meaningful".)

Origin outranks state and layer: an element's explicit rule is never overridden by a class's more specific-looking rule (Codex agreed this is a defensible authoring rule). State outranks layer, so `hover` always beats the non-hover value for the same origin, even when the non-hover value is a `dark+mobile` rule; authors who want a different hover colour in dark mobile add a `dark+mobile+hover` rule.

### 2. Breakpoints and inheritance (documented separately)
- Breakpoints are registry-defined, **nested `max-width` conditions** in a fixed widest → narrowest order (default `base`, `tablet` ≤ 1024px, `mobile` ≤ 640px; values configurable, order not). A phone matches `base`, `tablet` and `mobile`; the narrowest matching rule wins by key component 4.
- Inheritance: a narrower breakpoint inherits every property it does not set from the next wider matching rule, within the same mode layer. The inspector shows "inherited from <breakpoint>" vs "overridden".
- Mode rules are sparse: everything else inherits from the mode-independent value. Resetting a mode override deletes the rule.

### 3. CSS output
- Builder content is wrapped in `.blx-root`; each element gets one class `.blx-<hash>` where hash = stable digest of `(documentId, elementId)`; generated identifiers contain only `[a-z0-9-]`.
- **Selectors have constant specificity (0,1,0).** Appearance and state conditions use `:where()`:
  - dark: `:where(html[data-theme="dark"]) .blx-a1`
  - light: `:where(html[data-theme="light"]) .blx-a1`
  - hover: `.blx-a1:where(:hover)`
- **Appearance preference lives on `<html data-theme="light|dark|auto">`.** Absent or `auto` means follow the system. For `auto`, mode rules are also emitted inside media queries:
  - dark: `@media (prefers-color-scheme: dark) { :where(html:not([data-theme="light"]):not([data-theme="dark"])) .blx-a1 { … } }`
  - light: `@media not all and (prefers-color-scheme: dark) { :where(html:not([data-theme="light"]):not([data-theme="dark"])) .blx-a1 { … } }`
  Correct first paint therefore needs no JavaScript; with no JS and no stored preference the system preference applies. An optional tiny inline initialiser sets `data-theme` from a stored visitor preference (BWB-113).
- **Cascade layers** are declared once at the top of the generated stylesheet. The layer order is the lexicographic key above, expanded: `blx.theme` first (the Blixis theme's own CSS, so builder output always wins over it), then for each origin (`tokens`; `class`; `el`) and each state (`s0`=none, `hover`, `focus`, `focus-visible`, `active`) the four layers `base, bp, mode, modebp`:

```css
@layer blx.theme, blx.tokens,
  blx.class.s0.base, blx.class.s0.bp, blx.class.s0.mode, blx.class.s0.modebp,
  blx.class.hover.base, … , blx.class.active.modebp,
  blx.el.s0.base, … , blx.el.active.modebp;
```
  Within a layer all rules have equal specificity, and are emitted sorted by (breakpoint rank widest→narrowest, class order ascending), so the last matching rule is the highest key. Conformance tests check this equivalence (§Test strategy).
- Tokens are custom properties with per-mode values in layer `blx.tokens` (same `html[data-theme]` / `auto` media-query structure).
- **Guarantee scope.** The resolver's result is guaranteed for builder-owned CSS. Unlayered CSS from third-party themes or plugins beats all layered CSS by CSS rules; the Blixis theme puts its own CSS in `blx.theme` so it never does. A theme-collision fixture suite documents what third-party unlayered CSS can override; builder output is never `!important`.
- Output is deterministic: the same **compiler inputs** ⇒ byte-identical CSS (stable sort, stable hashes). Inputs are: layout snapshot (or working layout), the global class definitions it references (by value), the token set/`tokenVersion`, the breakpoint registry and the compiler version. Rollback restores class values but intentionally not historical token values (tokens are live, ADR 0004).
- The editor canvas iframe loads the same compiler output (shared TS package + PHP compiler validated against shared fixtures — BWB-027). Preview is never an independent implementation.

### 4. Security
Declarations are validated by a **tokenizing CSS value parser** (not regexes) against a property allow-list and per-property value grammar: allowed functions are `calc`, `min`, `max`, `clamp`, `rgb`, `hsl`, `oklch`, `color-mix`, and `var()` limited to `--blx-*` names; `url()` is not accepted in free text — images are referenced by media-library attachment id and resolved server-side to a validated URL; no `@import`, `expression`, `\` escapes that change meaning, comments, `;`/`{`/`}` injection; bounded lengths and counts. Selectors and layer names are never user-controlled; identifiers come from hashes. Translation payloads never reach the CSS compiler.

## Alternatives considered
- *Specificity tricks (`[data-theme] .x`)*: rejected; escalates specificity, fragile with plugin CSS.
- *Source-order cascade*: rejected by the owner (insertion accidents).
- *Duplicating nodes for dark mode*: rejected (ADR 0003).
- *Mobile beats dark*: rejected by owner decision.

## Consequences
- Requires `@layer` support (all supported browsers: current and previous stable; ADR 0001). Older browsers fall back to unstyled-by-builder content (documented).
- `auto` mode doubles dark rules in size; measured in BWB-069.

## Test strategy
Reference fixtures and an executable verifier live in `tests/fixtures/style-resolution/` (`python3 -I tests/fixtures/style-resolution/verify.py`): hand-derived expected values, a 192-combination presence matrix, and 3000 seeded random rule sets comparing the lexicographic-key evaluator with a simulation of the emitted cascade layers. The production compiler (BWB-024/107) must reproduce `cases.json` and additionally be checked in real browsers.

- Generated test matrix covering **every presence combination** of the four rule layers (2⁴ = 16) × contexts {light,dark} × {desktop,tablet,mobile} × {normal,hover}, comparing the reference resolver, the compiled CSS evaluated in a real browser (Playwright, computed styles), the PHP compiler and the editor canvas.
- Fixtures from the owner example plus: class vs element origin, two classes (order), narrower-breakpoint wins, token mode values, `auto` with system dark/light and with manual override, JS disabled, duplicate-rule rejection, byte-stable output.
- Specificity assertion: every generated selector is (0,1,0).
- Equivalence test: reference resolver vs browser computed style for generated random rule sets (property-based), including conflicting classes across states/modes/breakpoints, `auto` with system light/dark/no preference and explicit `light`/`dark`, with JavaScript disabled.
- Theme-collision fixtures: Blixis theme in `blx.theme` loses to builder; third-party unlayered rule documented outcome.

## Rollback
Style output version is part of `schemaVersion`; compiler changes that alter output bump it and keep migration fixtures.

## Open questions
- `focus-visible` vs `hover` relative order on touch devices.
- Container queries and `prefers-contrast` are out of scope for Free 1.0.

## Review log
- 2026-10-14 orchestrator draft from owner decision.
- 2026-10-14 Codex review (`coordination/reviews/P0-ADR-REVIEW-codex-response.md`): Blocker 1 (resolver/layer mismatch for class order and states) accepted — class order moved to site-wide list, state/layer expansion made explicit; Blocker 2 (selector scope, `auto` light rules) accepted — ancestor-scoped selectors and light/dark media queries; Major 7 (unlayered CSS) accepted — guarantee scope and `blx.theme` layer; Minor 12 (breakpoint wording) accepted; security note (CSS parser rules) accepted. Challenge verdict "origin before layer": Codex agreed as an authoring rule.
- 2026-10-14 Codex re-review (`coordination/reviews/P0-ADR-REREVIEW-codex-response.md`): 10 of 12 earlier findings resolved, 2 partly (post-meta atomicity stays conditional on the BWB-040 spike; PHP floor increase handled via `Requires PHP`). New findings applied here: source-comparison target and retention (blocker), global-class pending detection via `classVersion`/`classRefs`, combined-publish preflight with single atomic pointer advance, determinism inputs named.
