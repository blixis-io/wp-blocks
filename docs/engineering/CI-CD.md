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
