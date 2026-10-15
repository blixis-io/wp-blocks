# BWB-047 Codex implementation report

tokens used
147,013
Implemented BWB-047 in the working tree. The plugin now reads the active theme’s `Blixis-Compat` header, locks builder writes with HTTP 423 after the existing 401/403 checks, and exposes `GET /blixis/v1/status`. Published pages continue rendering on incompatible themes with a token-aware fallback stylesheet. An escaped, translatable warning appears on the dashboard, themes, and plugins screens.

The main changes are in [ThemeCompat.php](wordpress/plugin/src/Theme/ThemeCompat.php), [ThemeGuard.php](wordpress/plugin/src/Rest/ThemeGuard.php), [StatusController.php](wordpress/plugin/src/Rest/StatusController.php), [Frontend.php](wordpress/plugin/src/Frontend/Frontend.php), and [WORDPRESS.md](docs/architecture/WORDPRESS.md). An explicitly present child header takes precedence even when empty or invalid; compatibility is cached only for the current request.

**Checks passed:** `composer run lint:fix`, `composer run lint`, `composer run test` (261 tests), PHPStan, Prettier for docs, and `git diff --check`.

The real-WordPress smoke was not run; the brief assigns that to you. No open questions. No commit or push was made.

## Follow-up fix (review finding)

tokens used
60,813
Fixed the BWB-047 review finding. `ThemeCompat` now caches compatibility by blog ID, stylesheet, and template, with an eight-entry limit. I updated every test implementation of `CompatibilityReader`, added tests for cache reuse, context changes, and eviction, and revised the cache sentence in [WORDPRESS.md](docs/architecture/WORDPRESS.md).

All requested checks passed: `composer run lint:fix`, `composer run lint`, `composer run test` (264 tests), PHPStan, and `pnpm exec prettier --write docs`. No commit or push was made.
