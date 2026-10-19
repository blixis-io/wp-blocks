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

## Packaging (BWB-017)

`pnpm build` (CI) and `pnpm build:packages` (strict: fails if a distribution is not scaffolded yet) run `tooling/build/package.mjs`. For each distribution in `tooling/build/distributions.json` (theme `blixis`, plugins `blixis-builder`, `blixis-plus`, `blixis-pro`; ADR 0009) it writes `dist/<slug>-<version>.zip`, a manifest (every file with size, SHA-256 and mode) and `SHA256SUMS`.

- **Free vs paid:** each distribution has a `tier`. Only `free` ones (theme `blixis`, plugin `blixis-builder`) are built by default, which is what public CI does; `blixis-plus` and `blixis-pro` are built only with `--include-paid`, reserved for the protected release path, so paid source is never packaged or uploaded from public pull request builds (ADR 0009).
- **Identity and version:** the main file must carry the WordPress identity header (`Theme Name:` or `Plugin Name:`) and a valid SemVer 2.0.0 `Version:`; the workspace `package.json` must exist and carry the same version. Pro declares Builder and Plus in `Requires Plugins` and verifies both public APIs before registering features.
- **Deny by default:** only allow-listed extensions and names are packaged (PHP, CSS, JS, JSON, images, fonts, text, translation files and a few named files such as `LICENSE`); any other file aborts the build until it is allow-listed or excluded on purpose. Forbidden names (`.env*`, keys, certificates, `.npmrc`, `auth.json`, `credentials*`, `wp-config.php`, SQL dumps, `.aws`, ...) abort the build wherever they sit among the files that would be visited. Excluded directories (tests, `node_modules`, fixtures, ...) are never entered, so nothing inside them ships. Symbolic links and unsupported file types abort. The source tree is assumed not to change while building (symlink checks use `lstat` before reading).
- **Bounds:** per-file (20 MiB), total (100 MiB) and file-count (10 000) limits are checked before reading; the ZIP writer refuses ZIP32 overflows (4 GiB, 65 534 entries) instead of wrapping, because ZIP64 is not implemented.
- **Determinism:** one top-level folder `<slug>/`, entries sorted by path, fixed DOS timestamps (1980-01-01), normalised permissions (0644/0755), UTF-8 names, no extra fields. The same input gives the same bytes with the same Node/zlib build; zlib output can differ between builds, so releases are verified by the per-file SHA-256 manifest as well as the archive checksum.
- **Never shipped:** dependency folders, tests, fixtures, source maps, build and tool configuration (`package.json`, `composer.json`, lock files, PHPCS/PHPStan/PHPUnit config).
- The paid package path (`--include-paid`) is protected-release only. Reproducibility verification repeats that same paid selection, while ordinary public builds still omit paid archives.
- Paid source requires a separate release review and credential environment; public CI only verifies that it is excluded.

## Implemented pipeline (BWB-015)

Workflow: `.github/workflows/ci.yml`, run on every pull request and on pushes to `main`.

| Job | What it enforces |
|---|---|
| Commit and PR title policy (PRs only) | commitlint on every commit in the PR and on the PR title (squash merges use the title as the commit subject): Conventional Commits and the no-AI-attribution rule |
| JavaScript | `pnpm check`: format, lint, typecheck, workspace boundaries, tooling tests, Vitest unit suites (incl. TS/PHP fixture parity); style-resolution fixtures (ADR 0005) |
| PHP 8.2 / 8.3 / 8.5 | `composer validate --strict` and `composer run check` (PHPCS, PHPStan, PHPUnit) on the floor, the WordPress-recommended and the latest PHP (ADR 0001) |
| Build and package | `pnpm build`: packages every scaffolded distribution (`tooling/build/distributions.json`) twice and fails if the archives differ; unscaffolded ones are reported as skipped; archives are uploaded as an artifact |
| WordPress 7.0 / PHP 8.2 and 7.1 / PHP 8.5 | Starts the Compose environment (`docs/engineering/LOCAL-DEVELOPMENT.md`), seeds fixtures and runs `pnpm wp:smoke`; images pinned by digest |
| Security | `pnpm audit` (high+), `composer audit`, licence policy (`tooling/check-licenses.mjs`, ADR 0008/0013), path-scoped GSAP/boundary check, gitleaks secret scan (pinned release, checksum-verified) |
| CI | Aggregate status: `javascript`, `php`, `build`, `wordpress` and `security` must succeed (a skipped or cancelled job fails it); the commit policy must succeed on pull requests and be skipped otherwise; this is the single check to require when branch protection becomes available (BWB-125) |

Hardening: top-level `permissions: contents: read`, no secrets, `pull_request` (never `pull_request_target`), `persist-credentials: false`, every third-party action pinned to a full commit SHA (the repository also enforces SHA pinning), PR text passed through environment variables, concurrency cancellation for PR runs. Repository Actions settings: default workflow token is read-only and Actions cannot approve pull requests. Dependabot (`.github/dependabot.yml`) proposes weekly, cooldown-delayed updates for actions, npm and Composer.

Licence policy details: SPDX expressions are parsed with grouping and AND/OR precedence; `WITH` exceptions, `LicenseRef-*` and malformed expressions are rejected unless an exact scoped exception records the package, version, custom licence reference, reason and ADR; command failures, unexpected output and an empty inventory fail the check. GSAP is allowed only in ADR 0013 workspaces. The `@gsap/*` scope remains banned by default; manifests, lockfile entries, vendored files and source imports outside allowed paths fail CI (docs and tooling may mention it).

Deferred ADR 0008 gates (tracked in BWB-074, distribution and compliance): inventory of bundled assets (fonts, icons, images), a recorded-decisions file (`LICENSES.md`) and NOTICE generation. A direct push to `main` is not blocked by the commit-policy job (it runs on pull requests); that stays procedural until BWB-125.

Not yet in the pipeline, on purpose: building the editor bundle (Vite, with the editor in P5), PHPUnit integration tests inside WordPress (BWB-018, BWB-039), end-to-end and accessibility suites (BWB-058, BWB-066), nightly jobs. Each of those issues adds its job to this workflow rather than a parallel one. Until branch protection exists the rule is procedural: no merge while the CI check is red (`GITFLOW.md`).
