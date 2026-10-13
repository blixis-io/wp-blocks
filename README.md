# Blixis WP Blocks — Product and Delivery Blueprint

Repository: `blixis-io/wp-blocks` (`git@github.com:blixis-io/wp-blocks.git`)
Status: planning blueprint · 2026-10-13

## Start here

1. Read [Agent Bootstrap](agent/START-HERE.md) and give it to your AI coding agent **inside the repository**.
2. The first execution phase is **planning-only**: inventory the repo, reconcile this blueprint, create labels, milestones, GitHub Project, and **all** GitHub Issues from `roadmap/issues.csv`, connect them, and stop before implementing application code.
3. Review the resulting Project backlog; then explicitly authorize implementation.
4. Follow [PRD](product/PRD.md), [Architecture](architecture/SYSTEM.md), and the engineering standards.

## Documents

| File | Purpose |
|---|---|
| `product/PRD.md` | Scope, audience, personas, capabilities, non-goals, release criteria |
| `product/FEATURE-MATRIX.md` | Free / Plus / Pro packaging and entitlement rules |
| `architecture/SYSTEM.md` | Modules, rendering, CSS strategy, editor, theme contracts |
| `architecture/SCHEMAS-AND-APIS.md` | Initial document contracts, endpoints, migrations and plugin extension API |
| `architecture/WORDPRESS.md` | Theme activation, font library, persistence, access and portability |
| `engineering/TESTING.md` | Test layers, coverage, CI gates, E2E matrix |
| `engineering/GITFLOW.md` | GitHub Flow, Conventional Commits, PR policy, no AI attribution |
| `engineering/CODE-STANDARDS.md` | TypeScript, React, PHP, REST and architectural conventions |
| `engineering/STYLEGUIDES.md` | UI, token, accessibility, visual-editor UX, CSS conventions |
| `engineering/SECURITY.md` | Threat model, supply chain, sandboxing, licensing |
| `engineering/CI-CD.md` | GitHub Actions, builds, release and versioning |
| `roadmap/ROADMAP.md` | Phases, gates, dependencies, deliverables |
| `roadmap/issues.csv` | **Canonical issue inventory** for provisioning GitHub |
| `roadmap/ISSUE-CONVENTIONS.md` | Labels, issue descriptions, priorities, statuses |
| `github/PROJECT-SETUP.md` | GitHub CLI and Projects provisioning runbook |
| `agent/START-HERE.md` | **Copy/paste agent prompt** with mandatory plan-first execution |
| `agent/AGENT-RULES.md` | Rules for future implementation sessions |
| `docs-plan/ASTRO-STARLIGHT.md` | End-state Astro docs, API reference, tutorials, samples, Playwright |
| `docs-plan/INFORMATION-ARCHITECTURE.md` | Docs navigation and publishing gates |

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

Read `product/PRD-ADDENDUM-MULTILINGUAL-THEMES.md` for content translation and independent website light/dark mode requirements. The new `roadmap/issues-addendum.csv` adds 24 tasks to the existing 100, for **124 total**. Use `agent/CODEX-CLAUDE-PROMPTBOOK.md` for Codex/Claude Code prompts. Entry-point policies are linked from `AGENTS.md` and `CLAUDE.md`.
