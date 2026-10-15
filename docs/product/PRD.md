# Product Requirements Document — Blixis WP Blocks

Version: 0.1 (proposal) · Owner: Blixis · Repository: `blixis-io/wp-blocks`

## 1. Vision

Create an extensible, developer-first visual site builder for WordPress, combining a purpose-built Blixis PHP theme, Tailwind CSS v4 foundation, native WordPress data/services, and a fast React + TypeScript visual editing experience. Free must be useful for real production websites; paid add-ons unlock advanced workflows without making existing pages disappear.

## 2. Problem

Traditional builders may produce unnecessary runtime assets, lock content to their rendering engine, expose inconsistent styling, or constrain advanced developers. Blixis aims to combine visual control, predictable semantic output, WordPress interoperability and a coherent design system.

## 3. Target users

- **Developer / agency:** builds reusable, maintainable sites; needs clean output, APIs, responsive control, source control and predictable environments.
- **Designer / site creator:** needs immediate visual feedback, presets, typography, flexible layout and trustworthy undo/redo.
- **Site owner:** needs reliable content changes, accessibility, publishing and safe update paths.

## 4. Product shape

- **Blixis Theme:** lean GPL-compatible classic/hybrid PHP theme, Tailwind v4 base stylesheet, `theme.json` tokens and accessible defaults.
- **Blixis Builder:** plugin that stores documents, manages editor and rendering, exposes secured WordPress REST APIs, migrates documents and supports extensible elements.
- **Blixis Plus:** independently distributed paid plugin for theme templates, dynamic data, expanded design workflows.
- **Blixis Pro:** independently distributed paid plugin for advanced queries/conditions, WooCommerce integration and animation tooling (only with legally suitable engine).
- **Documentation:** Astro + Starlight site built in a late delivery phase, Playwright-verified, with API reference, examples and tutorials.

## 5. Guiding principles

1. **WordPress-first:** use WordPress for media, users, roles, revisions where appropriate, Font Library and content metadata.
2. **No duplicated editors:** one element registry, one document model, explicit runtime adapters for PHP and React.
3. **Design token ownership:** preset is a seed; user configuration becomes canonical, versioned site settings.
4. **Clean server output:** semantic HTML + scoped generated CSS. No production editor React bundle.
5. **Accessible by default:** keyboard workflows, visible focus, sensible landmark hierarchy, WCAG 2.2 AA target.
6. **No silent destruction:** license expiry/theme switch/update preserve stored content and offer safe fallback.
7. **Progressive delivery:** demonstrable vertical slices and contractual quality gates.

## 6. Core user journeys

### 6.1 First install / onboarding

Administrator activates Blixis Theme, sees a dismissible setup invitation (no forced redirect), selects named color preset or custom mode, fonts available through WP Font Library, base typography/spacing/radius, preview, saves atomically, and can reopen Design System later. Theme reactivation must not override existing settings. Onboarding must be resumable and permission-protected.

### 6.2 Create and edit a page

Authorized user opens builder for a post/page, inserts Section/Container/Heading/Text/Image/Button, selects and reorders/nests elements through tree or canvas, edits properties using schema-derived controls, configures desktop/tablet/mobile values, sees accurate preview, undoes/redoes, autosaves drafts, publishes, and views a semantic frontend render.

### 6.3 Developer extensibility

Developer registers a custom element with schema, defaults, controls and PHP renderer; validates data; optionally exposes dynamic sources and hooks. Third-party registrations must obey security boundaries and version compatibility.

### 6.4 Feature availability

Free users can build and publish complete simple sites. Plus/Pro install separate add-ons. The server checks permissions and entitlement when creating/editing premium features. If an add-on is unavailable, documents remain intact and render safely or show an explicit compatibility warning without destructive rewriting.

## 7. Functional requirements

### Theme, WordPress, setup

- FR-001: Theme is compatible with supported WordPress/PHP targets and a checked child-theme contract.
- FR-002: Install/activation shows dismissible setup notice only when not configured.
- FR-003: Preset gallery, custom configuration, draft preview, rollback and completion state.
- FR-004: Tokens for semantic colors, typography, spacing, radii, breakpoints, containers.
- FR-005: WordPress Font Library integration for available families/variants; use `theme.json` where supported; no duplicate uploading subsystem.
- FR-006: Changes persist across reactivation; sensitive settings protected by capabilities, nonces and validation.

### Builder / editing

- FR-010: Versioned JSON tree; immutable IDs, normalized parent/child relationships, schema validation and migrations.
- FR-011: Element registry for core elements and typed extensibility.
- FR-012: Interactive canvas in iframe with postMessage bridge and origin/message validation.
- FR-013: Structure tree reorder/nest and canvas placement with keyboard alternatives.
- FR-014: Inspector auto-generates controls from element schemas; direct manipulation only where safe.
- FR-015: Responsive states, selection, multiselect when supported, breadcrumb, copy/paste, undo/redo.
- FR-016: Draft/autosave/publish flows; explicit conflict behavior; WordPress revision integration or documented equivalent.
- FR-017: Page-specific deterministic CSS; class reuse, pseudo-states, breakpoints, global classes.
- FR-018: Server-side safe PHP renderer; escaped HTML, safe URLs/attributes; unsupported components graceful.
- FR-019: Separate builder editor capability gating requires compatible active Blixis theme, but no data deletion when incompatible.
- FR-020: Media uses WordPress media library, responsive images and alt-text controls.

### Premium and ecosystem

- FR-030: Optional Plus add-on: theme template conditions and templates (header, footer, single, archive).
- FR-031: Optional Plus add-on: dynamic source adapters (WP fields, ACF if present) with safe allowlisting.
- FR-032: Optional Pro add-on: query loops and conditional rendering with bounded queries.
- FR-033: Optional Pro add-on: WooCommerce editing primitives without unsafe payment/cart handling.
- FR-034: Optional Plus/Pro animation add-on with an engine-neutral animation schema; GSAP use is limited by ADR 0013 and the Free plugin retains a CSS/WAAPI path.
- FR-035: Server-validated capabilities, clear license expiry behavior, and compatibility/version checks.
- FR-036: Planned (post-MVP): reusable global components, templates/pattern library and extensibility SDK.

### Docs and integrations

- FR-040: Astro + Starlight docs with versioned user and developer sections.
- FR-041: API reference covers REST endpoints, auth and errors, element registry and PHP hooks.
- FR-042: Reproducible copy-paste examples and tutorial sample site.
- FR-043: Playwright tests for docs navigation, examples, links, mobile behavior and critical journeys.

## 8. Non-functional requirements

- NFR-001 Performance: establish baseline budgets and enforce p75 lab performance targets on representative fixtures; no editor JS loaded publicly.
- NFR-002 Security: threat model REST, stored CSS/HTML, dynamic data, media uploads and plugin extension entry points.
- NFR-003 Accessibility: WCAG 2.2 AA target for editor workflows and generated default UI, with documented exceptions.
- NFR-004 Browser support: current and preceding stable Chromium/Firefox/WebKit (final matrix in testing standard).
- NFR-005 Reliability: deterministic build, migration rollback plan, autosave recovery, integration fixtures.
- NFR-006 Maintainability: strict TS, PHP coding standards/PHPCS, type-checking, linting and CI.
- NFR-007 Privacy: no tracking or external calls without documented purpose and consent when required.
- NFR-008 I18n: translatable UI, locale-aware messages, RTL readiness and text-domain hygiene.

## 9. Not in initial MVP

WooCommerce builder, advanced theme templates, global components library, advanced animation timeline, AI content generation, multisite orchestration, visual grid free-placement engine and hosted cloud service. These are deferred to later roadmap phases.

## 10. Key metrics / quality targets (validate with usage)

- New user can complete onboarding and publish a basic responsive page without editing code.
- A basic page can be edited, saved, reopened, and rendered without lost data in every supported browser.
- E2E smoke suite passes on a clean WP install and after supported update/migration fixtures.
- Zero known critical/high exploitable vulnerabilities at release; automated security checks enforced.
- No regression in existing documents after supported theme activation switches or add-on removal.
- Accessibility audits identify no known blocking keyboard paths for MVP core flows.

## 11. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Tailwind utilities unavailable for runtime values | Use class-based dedicated CSS generator; tokens shared with Tailwind build |
| iframe editor complexity | Spike bridge, coordinate mapping, scroll/resize and focus before full DnD |
| PHP/React preview mismatch | Shared fixtures and HTML/CSS contract tests; preview via WP renderer where practical |
| Plugin ecosystem conflicts | namespacing, isolated editor stylesheet, functional tests with representative plugins |
| Theme lock-in | preserve stored JSON and provide documented fallback/export rules |
| Fonts and WP version drift | WP version matrix, native Font Library adapter, no proprietary font store |
| GSAP licensing constraints | owner-approved for scoped editor/add-on use by ADR 0013; not GPL-compatible, legal risk accepted, counsel review recommended before commercial release; CSS/WAAPI remains available to Free |
| Freemium policy/licensing | separate downloadable plugins; GPL-compatible dependencies; legal review |

## 12. Release gates

- **Architecture gate:** approved ADRs, security model, schemas, repo standards, CI green.
- **MVP gate:** first-install → create/edit → autosave → publish → frontend → reopen E2E passes; theme integration and fallback tested.
- **Free 1.0 gate:** migration/versioning, accessibility, localization and operational docs complete.
- **Premium gate:** add-on contracts and entitlement validation tested, expiry non-destructive, install/update compatibility tested.
- **Docs gate:** Starlight site builds, all public API features covered, examples executable, Playwright green.

## 13. Open decisions for the architecture gate

- Exact minimum WP/PHP/Node/browser versions (validate supported hosting and Font Library adoption).
- PHP classic/hybrid approach vs full block theme, based on required template control.
- Rendering fallback semantics on theme switch/add-on deactivation.
- WP REST endpoint namespace and versioning strategy.
- Premium distribution, billing and number-of-sites licensing; prices not final.
- Public source licensing strategy for free and premium addons and third-party assets.
- Whether docs are deployed from monorepo or later extracted to dedicated repo.
