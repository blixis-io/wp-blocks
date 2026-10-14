# ADR 0009: Distribution and package boundaries

- Status: Reviewed
- Date: 2026-10-14
- Issues: #6 (BWB-006); relates to #8, #74, #75, #76, #83
- Deciders: owner (licensing, distribution), orchestrator
- Reviewers: pending (see Review log)

## Context
The product is a theme plus a Builder plugin (Free) and separately distributed Plus and Pro add-ons (`FEATURE-MATRIX.md`). Free features include manual translation and light/dark modes (ADR 0007). WordPress.org plugin guidelines (https://developer.wordpress.org/plugins/wordpress-org/detailed-plugin-guidelines/, read 2026-10-14) constrain what Free may contain:

- Guideline 1: all code, data and images must be GPL or GPL-compatible.
- Guideline 5: plugins may not contain functionality that is restricted or locked, only to be made available by payment or upgrade, and functionality may not be disabled after a trial or quota. The guidelines recommend add-on plugins hosted outside WordPress.org to exclude premium code.
- Guideline 6: a plugin acting only as a front end to an external paid service is not accepted.
- Guideline 7: no contacting external servers without explicit, authorised consent.
- Guideline 8: no installing premium versions of the same plugin.
- Guideline 11: upgrade prompts must be limited, sparing and dismissible.

## Decision
### 1. Four independently versioned distributions
| Package | Slug | Channel | Contains |
|---|---|---|---|
| Blixis Theme | `blixis` | WordPress.org theme directory (candidate) | templates, static CSS (`blx.theme` layer), `theme.json`, token defaults/presets, setup wizard entry point, compatibility header |
| Blixis Builder (Free) | `blixis-builder` | WordPress.org plugin directory (candidate) | document model, REST, PHP renderers, editor app, style engine, locale/appearance features, feature registry, extension API |
| Blixis Plus | `blixis-plus` | independent (own site/licence server) | Plus-only elements, template documents, data adapters; **no copy of Builder code** |
| Blixis Pro | `blixis-pro` | independent | Pro-only elements, query/conditions, WooCommerce adapters, animation controls. **Pro is a superset tier: it declares Plus as a dependency** (`Requires Plugins: blixis-builder, blixis-plus`), so the Plus capabilities marked "Yes" for Pro in `FEATURE-MATRIX.md` are provided by the installed Plus add-on. |

Premium plugins depend on the Builder's public, versioned extension API (`blixis_register_element`, capability registration, hooks) and declare `Requires Plugins: blixis-builder` plus a minimum extension-API version. They never bundle, patch or fork Builder code.

### 2. What may differ between Free and paid
- Free contains **no** locked, dormant or disabled premium functionality, no premium code paths behind licence flags, and no trial or quota (guideline 5). The feature registry in Free only reports which *add-ons* are active; it does not gate Free features.
- Paid add-ons add **new** elements and workflows. They do not remove or degrade Free capabilities.
- Free upgrade promotion is limited to one dismissible notice per context and a static "Add-ons" screen; no nagging, no tracking (guidelines 7, 11).
- Free makes no outbound requests without explicit consent. Licence checks, update checks and any telemetry exist only in paid add-ons (their own consent and privacy text) and never run on public page requests.

### 3. Lifecycle invariants and compatibility states
ADR 0007's rule "published content never depends on an add-on" is made precise here, because some premium output (query loops, dynamic fields, conditional results, theme templates) cannot be *recomputed* without the code that produces it. Each premium element or document type must declare, in its manifest (BWB-075), one **fallback class**:

| Class | Meaning | Public result when the add-on is inactive or expired |
|---|---|---|
| `static` | Output depends only on stored props (e.g. a styled card) | Rendered by Free's generic renderer; identical content |
| `retained` | Output is dynamic but the add-on stores a **rendered HTML snapshot** inside the published LayoutSnapshot at publish time (sanitised with the same escaping rules) | The retained snapshot is shown, frozen at its last publish; not live |
| `unavailable` | Output cannot be preserved | Nothing is rendered publicly for that element, and editors see an explicit compatibility notice; the element and its data remain stored |

Rules:
- Free ships the generic renderer for `static` types and the retained-snapshot display for `retained` types; no premium logic is in Free.
- The add-on matrix tests (BWB-089) cover deactivation, expiry and restore against a **previously published page** for every premium type, asserting the declared class: `static` identical, `retained` equals the frozen snapshot, `unavailable` renders nothing and shows the notice, with no fatal and no data change.
- Rendering never calls a licence server. Expiry stops updates and new premium editing, not display of `static`/`retained` content.
- Documents are never rewritten on deactivation; unknown element data round-trips.
- Because `unavailable` and `retained` degrade a live page, the add-on UI must warn before deactivation lists which published pages are affected.
- This refines ADR 0007: the guarantee is "no data loss, no fatal, and defined, tested public output", not "premium output stays live".

### 4. Licensing
- All distributed code, data, fonts, icons and images are GPL-compatible, inventoried per ADR 0008. Free packages are released under GPL-2.0-or-later (recommended by the guidelines; confirm with counsel).
- Plus and Pro are GPL-licensed code sold with services (updates, support); counsel confirms the commercial model before launch (owner action).
- Trademarks and the "Blixis" name are handled separately from code licensing.

### 5. Repository layout and release
Monorepo (`SYSTEM.md`) with separate build outputs per package; Plus/Pro sources are not published from public fork PR builds and use protected environments (`CI-CD.md`). Each package has its own changelog and SemVer; the extension API has its own version with a compatibility matrix.

## Alternatives considered
- *Single plugin with licence-gated features:* rejected; violates guideline 5 for WordPress.org and complicates expiry behaviour.
- *Plus/Pro as forks:* rejected; double maintenance and security patching.
- *Premium code inside Free but inactive:* rejected (guideline 5).

## Consequences
- The extension API is a public contract; changes require versioning and a deprecation window (BWB-075).
- Free must ship generic fallbacks for premium element types, increasing the Free surface slightly.

## Test strategy
Package-boundary lint (Free build contains no references to Plus/Pro namespaces or licence endpoints); add-on activation/deactivation/expiry matrix (BWB-089); outbound-request test (Free makes none without consent); fallback-render fixtures for every premium element type.

## Rollback
Superseding ADR; moving a capability from a paid add-on into Free is allowed, the reverse is not (ADR 0007).

## Open questions
- Owner: distribution channel for the theme and Builder (WordPress.org vs own site) and whether the review timeline is acceptable.
- Counsel review of the GPL plus paid-services model and trademark policy.
- Exact `Requires Plugins` handling for add-ons on WP 7.0 (verify behaviour in BWB-076).
- Owner: confirm Pro-includes-Plus and the three fallback classes, in particular that dynamic premium output (e.g. query loops) is frozen or omitted, not live, when its add-on is inactive.

## Review log
- 2026-10-14 orchestrator draft; guideline text read from developer.wordpress.org.
- 2026-10-14 Codex review (`coordination/reviews/P0-BATCH2-codex-response.md`): Blocker (generic container cannot recreate premium output) accepted — fallback classes and compatibility states; Major (Pro vs Plus dependency) accepted — Pro declares Plus. Codex could not verify the guideline quotations offline; they were read from developer.wordpress.org by the orchestrator.
