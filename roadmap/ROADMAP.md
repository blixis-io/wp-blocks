# Delivery Roadmap — Blixis WP Blocks

The issue inventory in [`issues.csv`](issues.csv) is canonical for issue creation. All phases have an entry/exit gate. **Never implement a downstream phase before upstream contracts pass.** Milestones are outcome-based; do not assign fictional delivery dates.

**Total: 100 issues across 11 phases.**

| Phase | Focus | Issues | Exit gate |
|---|---|---:|---|
| P0 | Governance & Discovery | 10 | Repo exists; ADR set and quality requirements approved |
| P1 | Repository & Developer Foundations | 8 | Clean clone can install, start WP locally and pass empty test pipeline |
| P2 | Core Contracts & CSS Engine | 10 | Fixture tests prove stable JSON roundtrips and safe CSS |
| P3 | Blixis Theme & Onboarding | 10 | Activate, configure, reactivate and render baseline templates reliably |
| P4 | WordPress Plugin & PHP Renderer | 10 | API lifecycle and generated pages pass integration/security tests |
| P5 | Editor Shell & Authoring | 10 | Core element CRUD, selection, inspector and save/reopen work |
| P6 | Drag & Drop, UX & Accessibility | 8 | DnD operations are valid undoable accessible and cross-browser |
| P7 | Free MVP Hardening & Release | 8 | MVP gate cleared; Free 1.0 release candidate ready |
| P8 | Plus Add-on | 8 | Plus add-on install/disable/expire/restore tests green |
| P9 | Pro Add-on | 8 | Pro release gate passes entitlements security and compatibility |
| P10 | Public Documentation & Ecosystem Launch | 10 | Docs build, reference, Playwright and publication gates pass |

## Phase details

### P0 — Governance & Discovery

**Objective:** Repository contracts, legal dependencies and all critical architectural decisions reviewed.
**Exit criterion:** Repo exists; ADR set and quality requirements approved.

**Work items:**

- **BWB-001** — Audit repo state and local tooling (`P0`, S; `dx`).
- **BWB-002** — Provision GitHub labels, milestones and Project (`P0`, M; `dx`).
- **BWB-003** — Create all backlog issues and link Project (`P0`, M; `dx`).
- **BWB-004** — Validate supported WordPress/PHP/Node environments (`P0`, M; `wordpress`).
- **BWB-005** — Decide classic/hybrid theme architecture (`P0`, M; `theme`).
- **BWB-006** — Decide free plugin / theme / premium boundaries (`P0`, M; `security`).
- **BWB-007** — Define document and persistence ADR (`P0`, S; `core`).
- **BWB-008** — License review of all key dependencies and animation engine (`P0`, M; `security`).
- **BWB-009** — Establish product UX journeys and prototype acceptance (`P0`, M; `editor`).
- **BWB-010** — Write threat model and accessibility baseline (`P0`, M; `security`).

### P1 — Repository & Developer Foundations

**Objective:** Bootstrapped monorepo, automated standards and testable WordPress development environment.
**Exit criterion:** Clean clone can install, start WP locally and pass empty test pipeline.

**Work items:**

- **BWB-011** — Initialize pnpm workspaces and package boundaries (`P0`, M; `dx`).
- **BWB-012** — Set up WordPress local development with fixtures (`P0`, M; `wordpress`).
- **BWB-013** — Configure TS strict ESLint Prettier and commitlint (`P0`, M; `dx`).
- **BWB-014** — Configure Composer PHPStan PHPCS and PHPUnit (`P0`, M; `wordpress`).
- **BWB-015** — Create initial GitHub Actions CI pipeline (`P0`, M; `dx`).
- **BWB-016** — Add issue PR templates CODEOWNERS and branch protection docs (`P0`, M; `dx`).
- **BWB-017** — Configure build and packaging scripts (`P0`, L; `dx`).
- **BWB-018** — Create fixture conventions and test helpers (`P0`, M; `dx`).

### P2 — Core Contracts & CSS Engine

**Objective:** Versioned schema, command history, element registry and deterministic styles.
**Exit criterion:** Fixture tests prove stable JSON roundtrips and safe CSS.

**Work items:**

- **BWB-019** — Define canonical document schema and JSON Schema (`P1`, S; `core`).
- **BWB-020** — Implement validation, normalization and document migrations (`P1`, S; `core`).
- **BWB-021** — Implement element registry and default element contracts (`P1`, L; `core`).
- **BWB-022** — Implement immutable document commands and undo redo (`P1`, S; `core`).
- **BWB-023** — Implement CSS declaration validation and sanitization (`P1`, L; `css`).
- **BWB-024** — Implement scoped deterministic CSS compiler (`P1`, L; `css`).
- **BWB-025** — Implement breakpoints and pseudo-state rules (`P1`, L; `css`).
- **BWB-026** — Implement global design token schema and resolver (`P1`, L; `css`).
- **BWB-027** — Create TS/PHP parity fixtures and contract tests (`P1`, M; `core`).
- **BWB-028** — Document extension versioning and compat contracts (`P1`, S; `core`).

### P3 — Blixis Theme & Onboarding

**Objective:** Installable Tailwind theme and native first-run design wizard.
**Exit criterion:** Activate, configure, reactivate and render baseline templates reliably.

**Work items:**

- **BWB-029** — Scaffold GPL-compatible Blixis PHP theme (`P1`, M; `theme`).
- **BWB-030** — Integrate Tailwind v4 static theme build (`P1`, L; `theme`).
- **BWB-031** — Integrate theme.json and CSS design variables (`P1`, L; `theme`).
- **BWB-032** — Create preset definitions and accessibility validation (`P1`, M; `theme`).
- **BWB-033** — Create theme setup admin entry point and capability checks (`P1`, M; `wordpress`).
- **BWB-034** — Implement setup wizard preset and custom controls (`P1`, L; `editor`).
- **BWB-035** — Implement design-system save, rollback and persistence (`P1`, L; `wordpress`).
- **BWB-036** — Integrate WordPress Font Library families/variants (`P1`, L; `wordpress`).
- **BWB-037** — Test child-theme support and switching behavior (`P1`, M; `theme`).
- **BWB-038** — Audit theme output accessibility and RTL readiness (`P1`, S; `theme`).

### P4 — WordPress Plugin & PHP Renderer

**Objective:** Stored page documents, secure REST and semantic PHP rendering.
**Exit criterion:** API lifecycle and generated pages pass integration/security tests.

**Work items:**

- **BWB-039** — Scaffold Blixis Builder core plugin (`P1`, L; `wordpress`).
- **BWB-040** — Register revision-capable document persistence (`P1`, S; `wordpress`).
- **BWB-041** — Build secured document REST read/write API (`P1`, S; `wordpress`).
- **BWB-042** — Build preview API and safe canvas content contract (`P1`, L; `wordpress`).
- **BWB-043** — Implement PHP registry and core render adapter (`P1`, L; `core`).
- **BWB-044** — Implement frontend injection and CSS cache invalidation (`P1`, L; `wordpress`).
- **BWB-045** — Implement media integration and image safety (`P1`, L; `wordpress`).
- **BWB-046** — Implement autosave draft and revision semantics (`P1`, L; `wordpress`).
- **BWB-047** — Implement theme compatibility guard and fallback policy (`P1`, L; `wordpress`).
- **BWB-048** — Harden REST CSS and PHP renderer attack surfaces (`P0`, M; `security`).

### P5 — Editor Shell & Authoring

**Objective:** Usable shadcn-powered editor and reliable in-frame preview.
**Exit criterion:** Core element CRUD, selection, inspector and save/reopen work.

**Work items:**

- **BWB-049** — Scaffold React editor shadcn UI and theme isolation (`P1`, M; `editor`).
- **BWB-050** — Implement editor state stores and command bridge (`P1`, L; `editor`).
- **BWB-051** — Implement canvas iframe protocol with security validation (`P1`, L; `editor`).
- **BWB-052** — Implement element structure tree and selection overlays (`P1`, L; `editor`).
- **BWB-053** — Implement schema-driven property inspector (`P1`, L; `editor`).
- **BWB-054** — Implement initial six core element editors (`P1`, L; `editor`).
- **BWB-055** — Implement editor save publish and error recovery UI (`P1`, L; `editor`).
- **BWB-056** — Implement keyboard navigation and undo redo shortcuts (`P1`, L; `editor`).
- **BWB-057** — Implement desktop tablet mobile viewport controls (`P1`, L; `editor`).
- **BWB-058** — Create end-to-end create-edit-reopen-publish smoke suite (`P1`, M; `editor`).

### P6 — Drag & Drop, UX & Accessibility

**Objective:** Robust reordering and nesting with visual and keyboard affordances.
**Exit criterion:** DnD operations are valid undoable accessible and cross-browser.

**Work items:**

- **BWB-059** — Build dnd-kit structure tree reorder and nesting (`P1`, L; `editor`).
- **BWB-060** — Build canvas drag drop coordinate adapter (`P1`, L; `editor`).
- **BWB-061** — Enforce allowed nesting cycle and depth constraints (`P1`, M; `core`).
- **BWB-062** — Implement copy paste duplicate and multiselect basics (`P1`, L; `editor`).
- **BWB-063** — Build context menus, empty states and notifications (`P1`, L; `editor`).
- **BWB-064** — Keyboard drag reorder alternatives and focus management (`P1`, M; `editor`).
- **BWB-065** — Test DnD across viewport sizes and browsers (`P1`, M; `editor`).
- **BWB-066** — Accessibility and usability audit with remediation (`P1`, S; `editor`).

### P7 — Free MVP Hardening & Release

**Objective:** Reliable accessible free release with documented rollback.
**Exit criterion:** MVP gate cleared; Free 1.0 release candidate ready.

**Work items:**

- **BWB-067** — Build deterministic WP matrix integration pipeline (`P1`, L; `wordpress`).
- **BWB-068** — Complete migration fixtures and downgrade resilience (`P1`, M; `core`).
- **BWB-069** — Profile CSS/JS bundles and frontend rendering (`P1`, M; `css`).
- **BWB-070** — Conduct security review and fuzzing pass (`P0`, M; `security`).
- **BWB-071** — Finalize localization RTL and keyboard support (`P1`, M; `editor`).
- **BWB-072** — Publish internal install upgrade and rollback guide (`P1`, M; `dx`).
- **BWB-073** — Perform Free release candidate QA and smoke tests (`P1`, M; `dx`).
- **BWB-074** — Prepare free distribution packaging and compliance (`P0`, M; `security`).

### P8 — Plus Add-on

**Objective:** Paid templates and dynamic data without breaking free documents.
**Exit criterion:** Plus add-on install/disable/expire/restore tests green.

**Work items:**

- **BWB-075** — Define premium extension manifest and capability contracts (`P1`, M; `premium`).
- **BWB-076** — Implement Plus plugin packaging and compatibility checks (`P1`, L; `premium`).
- **BWB-077** — Implement theme template document types (`P1`, S; `premium`).
- **BWB-078** — Implement safe display conditions and resolution (`P1`, L; `premium`).
- **BWB-079** — Implement dynamic data source adapters and ACF optional adapter (`P1`, L; `premium`).
- **BWB-080** — Implement reusable pattern/template library MVP (`P1`, L; `premium`).
- **BWB-081** — Implement license status UX and graceful fallback tests (`P1`, L; `premium`).
- **BWB-082** — Document Plus features and upgrade path (`P1`, S; `docs`).

### P9 — Pro Add-on

**Objective:** Advanced loops, WooCommerce and safe animations.
**Exit criterion:** Pro release gate passes entitlements security and compatibility.

**Work items:**

- **BWB-083** — Implement Pro plugin packaging and feature registration (`P1`, L; `premium`).
- **BWB-084** — Implement bounded query builder and loop elements (`P1`, L; `premium`).
- **BWB-085** — Implement conditional display expression model (`P1`, L; `premium`).
- **BWB-086** — Implement WooCommerce elements and template adapters (`P1`, L; `premium`).
- **BWB-087** — Decide animation execution engine after legal review (`P1`, M; `security`).
- **BWB-088** — Implement advanced animation schema and editing controls (`P1`, L; `premium`).
- **BWB-089** — Run premium upgrade expiry disable restore matrix (`P1`, M; `premium`).
- **BWB-090** — Document Pro integrations and extension patterns (`P1`, S; `docs`).

### P10 — Public Documentation & Ecosystem Launch

**Objective:** Astro Starlight docs, runnable API examples and tutorial suite.
**Exit criterion:** Docs build, reference, Playwright and publication gates pass.

**Work items:**

- **BWB-091** — Initialize Astro Starlight documentation app (`P2`, S; `docs`).
- **BWB-092** — Write getting started install and first-site tutorial (`P2`, M; `docs`).
- **BWB-093** — Document editor guides, responsive design and styles (`P2`, S; `docs`).
- **BWB-094** — Document WordPress REST API with executable examples (`P2`, S; `docs`).
- **BWB-095** — Document element SDK PHP hooks and extension contracts (`P2`, S; `docs`).
- **BWB-096** — Create examples and starter sample site fixtures (`P2`, M; `docs`).
- **BWB-097** — Set up Playwright docs navigation link and a11y smoke (`P2`, M; `docs`).
- **BWB-098** — Generate reference/versioning and changelog site pages (`P2`, M; `docs`).
- **BWB-099** — Set up docs deployment SEO and feedback workflow (`P2`, M; `docs`).
- **BWB-100** — Conduct docs release audit and launch readiness review (`P2`, S; `docs`).

## Release sequence

- Internal architecture proof (P0–P2).
- Theme/onboarding and server renderer vertical slice (P3–P4).
- MVP editor with essential flows and DnD (P5–P6).
- Free 1.0 readiness (P7).
- Optional Plus package (P8).
- Optional Pro package (P9).
- Final public documentation site and ecosystem launch (P10).

**Documentation is written incrementally throughout development.** P10 is the final public docs website, polish, tested tutorials and publishing gate—not the first time engineering docs are written.

## Dependency semantics

The CSV includes minimal **blocking** predecessor pointers to support phased issue provisioning. The project agent must refine detailed task-to-task dependencies after creating issues, taking care to avoid cycles. Do not interpret all issues within a phase as strictly sequential: parallel work is encouraged after foundational contracts stabilize.

## Estimates

Sizes XS/S/M/L are relative and deliberately do not assert calendar duration. Assign owners, capacity and realistic date milestones only after repository audit and architecture decisions.
