# CI/CD, Builds and Releases

## Toolchain

Proposed: pnpm workspaces, Vite, TypeScript, PHP Composer tooling, Docker or wp-env, GitHub Actions. Pin Node/PHP/toolchain versions in manifests. For local developer UX support one-command `setup`, `dev`, `test`, `lint`, `build`, `e2e` scripts.

## CI workflow

On PR: install with frozen lockfile → format/lint/commitlint → TS typecheck → PHP PHPCS/PHPStan → Vitest → PHPUnit/WP integration → build → E2E smoke → accessibility checks → dependency/security/secret scanning → artifact output checks.

Nightly: supported WP/PHP versions, cross-browser Playwright, visual and upgrade fixtures, bundle/performance budgets, docs link check.

Release: human approval → verify changelog/versions, migration and license compliance → deterministic builds → signed/verified archives where supported → tag/release notes → publish theme/plugin/addons to appropriate channels → smoke deploy / rollback plan.

## Artifacts

- Production editor JS/CSS chunks, theme stylesheet, WordPress plugin zip, WordPress theme zip, paid add-on zips, docs static build.
- Source maps never publicly expose secrets; publish only when policy permits.
- Ensure compiled distributables contain corresponding source access when needed for distribution compliance.

## Separation of concerns

Do not deploy Plus/Pro source or credentials from public fork PR builds. Use environment protections and least-privilege tokens. Initial project provisioning requires separate permissions from regular CI.

## Implemented pipeline (BWB-015)

Workflow: `.github/workflows/ci.yml`, run on every pull request and on pushes to `main`.

| Job | What it enforces |
|---|---|
| Commit and PR title policy (PRs only) | commitlint on every commit in the PR and on the PR title (squash merges use the title as the commit subject): Conventional Commits and the no-AI-attribution rule |
| JavaScript | `pnpm check`: format, lint, typecheck, workspace boundaries, tooling tests; style-resolution fixtures (ADR 0005) |
| PHP 8.2 / 8.3 / 8.5 | `composer validate --strict` and `composer run check` (PHPCS, PHPStan, PHPUnit) on the floor, the WordPress-recommended and the latest PHP (ADR 0001) |
| WordPress 7.0 / PHP 8.2 and 7.1 / PHP 8.5 | Starts the Compose environment (`docs/engineering/LOCAL-DEVELOPMENT.md`), seeds fixtures and runs `pnpm wp:smoke`; images pinned by digest |
| Security | `pnpm audit` (high+), `composer audit`, licence policy (`tooling/check-licenses.mjs`, ADR 0008), GSAP/boundary check, gitleaks secret scan (pinned release, checksum-verified) |
| CI | Aggregate status: `javascript`, `php`, `wordpress` and `security` must succeed (a skipped or cancelled job fails it); the commit policy must succeed on pull requests and be skipped otherwise; this is the single check to require when branch protection becomes available (BWB-125) |

Hardening: top-level `permissions: contents: read`, no secrets, `pull_request` (never `pull_request_target`), `persist-credentials: false`, every third-party action pinned to a full commit SHA (the repository also enforces SHA pinning), PR text passed through environment variables, concurrency cancellation for PR runs. Repository Actions settings: default workflow token is read-only and Actions cannot approve pull requests. Dependabot (`.github/dependabot.yml`) proposes weekly, cooldown-delayed updates for actions, npm and Composer.

Licence policy details: SPDX expressions are parsed with grouping and AND/OR precedence; `WITH` exceptions, `LicenseRef-*` and malformed expressions are rejected until a decision is recorded; command failures, unexpected output and an empty inventory fail the check. The GSAP ban covers the `gsap` package and the whole `@gsap/*` scope in manifests and the lockfile, plus vendored files and imports in source (docs and tooling may mention it).

Deferred ADR 0008 gates (tracked in BWB-074, distribution and compliance): inventory of bundled assets (fonts, icons, images), a recorded-decisions file (`LICENSES.md`) and NOTICE generation. A direct push to `main` is not blocked by the commit-policy job (it runs on pull requests); that stays procedural until BWB-125.

Not yet in the pipeline, on purpose: build and packaging (BWB-017), PHPUnit integration tests inside WordPress (BWB-018, BWB-039), end-to-end and accessibility suites (BWB-058, BWB-066), nightly jobs. Each of those issues adds its job to this workflow rather than a parallel one. Until branch protection exists the rule is procedural: no merge while the CI check is red (`GITFLOW.md`).
