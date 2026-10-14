# Blixis WP Blocks — Product and Delivery Blueprint

Repository: `blixis-io/wp-blocks` (`git@github.com:blixis-io/wp-blocks.git`)
Status: planning blueprint · 2026-10-13

## Start here

1. Read [Agent Bootstrap](docs/agent/START-HERE.md) and give it to your AI coding agent **inside the repository**.
2. The first execution phase is **planning-only**: inventory the repo, reconcile this blueprint, create labels, milestones, GitHub Project, and **all** GitHub Issues from `docs/roadmap/issues.csv`, connect them, and stop before implementing application code.
3. Review the resulting Project backlog; then explicitly authorize implementation.
4. Follow [PRD](docs/product/PRD.md), [Architecture](docs/architecture/SYSTEM.md), and the engineering standards.

## Development setup

Requires Node 24 (`.nvmrc`) and pnpm (version pinned in `package.json`; `corepack enable` or install pnpm 11).

```bash
pnpm install --frozen-lockfile   # or: pnpm setup
pnpm check:boundaries            # workspace dependency rules (ADR 0010)
pnpm test:unit                   # Vitest suites (fixtures, parity with PHP)
pnpm test:tooling                # tests for the repository tooling (20 tests)
composer install                 # PHP tooling (PHP 8.2+ and Composer)
pnpm check:php                   # PHPCS, PHPStan, PHPUnit
pnpm wp:start && pnpm wp:smoke    # local WordPress in Docker (docs/engineering/LOCAL-DEVELOPMENT.md)
python3 -I tests/fixtures/style-resolution/verify.py   # style-resolution reference fixtures (ADR 0005)
```

Further scripts (lint, typecheck, build, e2e) arrive with BWB-013 to BWB-018.

## Documents

| File                                                | Purpose                                                                                                            |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `docs/product/PRD.md`                               | Scope, audience, personas, capabilities, non-goals, release criteria                                               |
| `docs/product/UX-JOURNEYS.md`                       | Draft user journeys and prototype acceptance (BWB-009)                                                             |
| `docs/product/FEATURE-MATRIX.md`                    | Free / Plus / Pro packaging and entitlement rules                                                                  |
| `docs/architecture/SYSTEM.md`                       | Modules, rendering, CSS strategy, editor, theme contracts                                                          |
| `docs/architecture/DOCUMENT-SCHEMA.md`              | Document schema v1: shape, formats, versioning rules, what `validateDocument` adds (BWB-019)                       |
| `docs/architecture/COMMANDS.md`                     | Document commands, inverses and undo/redo history (BWB-022)                                                        |
| `docs/architecture/EXTENSION-API.md`                | Element registry and extension API v1: definitions, classification, namespaces, manifest (BWB-021)                 |
| `docs/architecture/CSS-VALIDATION.md`               | CSS declaration allow-list, value grammar, sanitization and corpus (BWB-023)                                       |
| `docs/architecture/CSS-COMPILER.md`                 | Deterministic scoped CSS compiler: layers, selectors, modes, breakpoints, tokens (BWB-024)                         |
| `docs/architecture/BREAKPOINTS-AND-STATES.md`       | Breakpoints, states, precedence and inheritance, reference resolver and inspector API (BWB-025)                    |
| `docs/architecture/DESIGN-TOKENS.md`                | Design token schema, references, resolver and validation (BWB-026)                                                 |
| `docs/architecture/TRANSLATIONS.md`                 | Translation entries, `set-translation`, registry rules and stable property ids (BWB-104)                           |
| `docs/architecture/THEME.md`                        | The Blixis theme: files, compatibility declaration, development and tests (BWB-029)                                |
| `docs/architecture/VERSIONING-AND-COMPATIBILITY.md` | Version inventory, compatible vs breaking changes, change checklist, extension API and element SDK rules (BWB-028) |
| `docs/architecture/SCHEMAS-AND-APIS.md`             | Initial document contracts, endpoints, migrations and plugin extension API                                         |
| `docs/architecture/WORDPRESS.md`                    | Theme activation, font library, persistence, access and portability                                                |
| `docs/engineering/TESTING.md`                       | Test layers, coverage, CI gates, E2E matrix                                                                        |
| `docs/engineering/GITFLOW.md`                       | GitHub Flow, Conventional Commits, PR policy, no AI attribution                                                    |
| `docs/engineering/CODE-STANDARDS.md`                | TypeScript, React, PHP, REST and architectural conventions                                                         |
| `docs/engineering/STYLEGUIDES.md`                   | UI, token, accessibility, visual-editor UX, CSS conventions                                                        |
| `docs/engineering/THREAT-MODEL.md`                  | Assets, roles, trust boundaries, STRIDE threats and required controls (BWB-010)                                    |
| `docs/engineering/ACCESSIBILITY-BASELINE.md`        | WCAG 2.2 AA requirements, verification and performance rules (BWB-010)                                             |
| `docs/architecture/adrs/`                           | Architecture decision records                                                                                      |
| `tests/fixtures/style-resolution/`                  | Reference fixtures and verifier for ADR 0005                                                                       |
| `docs/engineering/SECURITY.md`                      | Threat model, supply chain, sandboxing, licensing                                                                  |
| `docs/engineering/CI-CD.md`                         | GitHub Actions, builds, release and versioning                                                                     |
| `docs/roadmap/ROADMAP.md`                           | Phases, gates, dependencies, deliverables                                                                          |
| `docs/roadmap/issues.csv`                           | **Canonical issue inventory** for provisioning GitHub                                                              |
| `docs/roadmap/ISSUE-CONVENTIONS.md`                 | Labels, issue descriptions, priorities, statuses                                                                   |
| `docs/github/PROJECT-SETUP.md`                      | GitHub CLI and Projects provisioning runbook                                                                       |
| `docs/agent/START-HERE.md`                          | **Copy/paste agent prompt** with mandatory plan-first execution                                                    |
| `docs/agent/AGENT-RULES.md`                         | Rules for future implementation sessions                                                                           |
| `docs/public-docs-plan/ASTRO-STARLIGHT.md`          | End-state Astro docs, API reference, tutorials, samples, Playwright                                                |
| `docs/public-docs-plan/INFORMATION-ARCHITECTURE.md` | Docs navigation and publishing gates                                                                               |

## Architectural decisions requiring explicit review

- WordPress minimum release: propose **7.0+** for native Font Library integration. Confirm release and host compatibility before committing; compatibility fallback is an alternative decision.
- Classic/hybrid PHP theme preferred over a full-site-editing block theme; record an ADR after validating WordPress template and theme.json behavior.
- Products ship as **Blixis Theme + Blixis Builder (free)**, plus separate premium add-ons. Avoid putting plugin functionality in the theme.
- React editor runs only with a compatible active Blixis theme (including children), while persisted documents and safe frontend fallback behavior are preserved after a theme switch.
- Tailwind v4 powers the **theme baseline** and editor UI; arbitrary visual styles come from a dedicated runtime CSS compiler, not on-demand Tailwind class generation.
- Use `dnd-kit` for interactions. **Do not adopt GSAP before legal/license review** specific to visual animation-building competitors; default to Web Animations API and CSS.
- Do not claim any GitHub Project or issues exist until verified remotely.

## Source links (recheck during implementation)

- WordPress Theme Handbook: https://developer.wordpress.org/themes/
- WordPress Plugin Handbook: https://developer.wordpress.org/plugins/
- Font Library: https://wordpress.org/documentation/article/the-font-library/
- WordPress.org plugin guidelines: https://developer.wordpress.org/plugins/wordpress-org/detailed-plugin-guidelines/
- WordPress theme release guidelines: https://developer.wordpress.org/themes/releasing-your-theme/
- Astro Starlight: https://starlight.astro.build/getting-started/
- Playwright: https://playwright.dev/docs/intro
- GitHub Projects CLI: https://cli.github.com/manual/gh_project

The plans and estimates are proposed engineering targets, not commitments or completed work.

## October 2026 addendum

Read `docs/product/PRD-ADDENDUM-MULTILINGUAL-THEMES.md` for content translation and independent website light/dark mode requirements. The new `docs/roadmap/issues-addendum.csv` adds 24 tasks to the existing 100, for **124 total**. Use `docs/agent/CODEX-CLAUDE-PROMPTBOOK.md` for Codex/Claude Code prompts. Entry-point policies are linked from `AGENTS.md` and `CLAUDE.md`.
