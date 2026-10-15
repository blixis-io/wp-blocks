# Code Standards

## Universal

- English for code symbols, docs, issues, PRs and comments. Meaningful names; no magic strings or hidden side effects.
- Prefer small pure functions, explicit errors, isolation of IO and dependency injection at boundaries.
- Public interfaces documented; no `TODO` without linked issue; avoid dead code and disabled linters.
- Exact project-wide versions pinned and maintained; changes in dependency majors via ADR and compatibility tests.
- New external dependencies require licensing, security, bundle impact and maintenance review.

## TypeScript / React

- TypeScript strict mode; avoid `any`, unsafe casts and suppressed diagnostics without justification.
- ESLint with typescript-eslint, React hooks and accessibility rules; Prettier for formatting.
- Prefer named exports and colocated tests; public package APIs from intentional barrel exports.
- Use immutable state and command objects for document edits. Zustand slices separate document, selection, UI and history.
- Component props typed; accessible labels, keyboard focus and ARIA only when native controls insufficient.
- Prefer shadcn/ui and Radix for admin chrome; custom inspector controls are reused across elements.
- Never inject arbitrary HTML in editor; schema-validate all iframe messages and external data.

## PHP / WordPress

- PHP namespaces or collision-safe `Blixis\...` symbols, Composer PSR-4 autoloading as appropriate.
- WordPress Coding Standards through PHPCS, PHPCBF; PHPStan with WordPress stubs.
- Every REST route defines `permission_callback`, input schemas and safe error responses.
- Check `current_user_can` for operations; cookie auth nonces; sanitize on write and escape on output (`esc_html`, `esc_attr`, `esc_url`, `wp_kses` as needed).
- Use prepared queries via `$wpdb->prepare` when direct SQL is unavoidable; do not concatenate SQL input.
- Use WP hooks, filters, translation functions and capabilities instead of platform-specific hacks.
- Renderer callbacks accept validated data and return HTML without causing writes.

## JSON contracts and versioning

- Each persisted document has schemaVersion and document revision; validated migrations are append-only and fixture-tested.
- IDs and property names use documented conventions; namespaced element types like `blixis/heading`.
- Never silently discard unknown fields or premium components on load/save. Distinguish errors from no-op.

## REST standards

- Namespace with version (`blixis/v1`), normalize status/error codes, use `ETag` or revision conflicts to prevent overwrites.
- Paginate potentially large collections, rate-limit or bound preview rendering, avoid excess response data.
- API responses documented with examples and role requirements; OpenAPI spec generated/validated in later phase.

## CSS / assets

- Tailwind v4 for theme source and editor chrome; runtime builder declarations compiled to dedicated scoped CSS.
- Tokens expressed as semantic custom properties; use CSS logical properties for RTL where practical.
- Avoid `!important` except documented intentional overrides; no unrestricted user CSS in core MVP.
- Dynamic CSS escape/validate selectors, values, functions and URLs; CSS output stable for caching and snapshots.

## Definition of Done (code)

Feature is implemented behind relevant gate, has unit/integration tests, accessibility checked, documented where user-visible, passes CI, respects WP licensing/security rules, has no unreviewed breaking behavior and closes a traceable issue.

## Tooling and checks (BWB-013)

| Concern | Tool | Config |
|---|---|---|
| TypeScript strictness | TypeScript 6.0 (`typescript-eslint` does not yet support 7.x) | `tsconfig.base.json`: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noUnusedLocals/Parameters`, `noPropertyAccessFromIndexSignature`, `verbatimModuleSyntax`. Packages extend it and add a `typecheck` script. |
| Lint | ESLint 9 (flat config; `eslint-plugin-jsx-a11y` does not support 10 yet) with `typescript-eslint` strict + stylistic type-checked rules; React hooks and jsx-a11y rules only in packages allowed to use React (ADR 0010) | `eslint.config.mjs` |
| Formatting | Prettier (code and config files; docs and CSV are not auto-formatted) | `.prettierrc.json`, `.prettierignore`, `.editorconfig` |
| Commits | commitlint: Conventional Commits types from GITFLOW, kebab-case scopes, header <= 100 chars, **and a rule rejecting AI-agent attribution** (generated-by lines, AI co-author trailers) | `commitlint.config.mjs`, local `commit-msg` hook in `.husky/` |

Commands (root): `pnpm lint`, `pnpm format:check` / `pnpm format`, `pnpm typecheck` (runs each package's `typecheck` script), `pnpm commitlint` (commits since `origin/main`), and `pnpm check` for everything that does not need WordPress. `pnpm test:tooling` proves the tools enforce what they claim (rejects implicit `any`, unchecked index access, `any`, `@ts-ignore`, bad commit headers and AI attribution).

Dependencies are recorded with exact versions (`savePrefix: ""`), install scripts are blocked unless listed in `onlyBuiltDependencies` (currently empty), and versions younger than one day are not installed (`minimumReleaseAge`). Peer-dependency conflicts are resolved by choosing compatible versions, not by overrides.

**Adding a TypeScript package.** A workspace package that contains `.ts`/`.tsx` sources must have a `tsconfig.json` extending `tsconfig.base.json` (set `lib`/`types` explicitly; shared PHP-mirrored code must not rely on DOM types) and a `typecheck` script; `pnpm check:boundaries` fails otherwise, so the root `pnpm typecheck` can never pass vacuously. The package's tsconfig must include every source file, or type-aware linting reports "not found by the project service". Source-level imports are restricted by ESLint to match ADR 0010 and ADR 0013 (no React, Zustand, dnd-kit or Tailwind in framework-free packages; GSAP only in its explicitly allowed workspaces).

**Commit attribution rule.** The commitlint rule is line-based: it rejects AI co-author trailers (by name or by vendor email domain), `Assisted-by:` / `Generated-by:` trailers, "generated with/by ..." lines naming an assistant, bare assistant signatures and the robot emoji, and allows human co-authors and bot trailers such as Dependabot. A name list cannot recognise every assistant, so reviewers still check the policy by hand.

## PHP tooling (BWB-014)

| Concern | Tool | Config |
|---|---|---|
| Code style | PHP_CodeSniffer with `WordPress-Extra` and `WordPress-Docs` (WPCS 3), plus `PHPCompatibilityWP` for PHP 8.2+ and WordPress 7.0+ (ADR 0001); global prefixes `blixis`/`Blixis`; text domains `blixis`, `blixis-builder`, `blixis-plus`, `blixis-pro`; PSR-4 file names allowed | `phpcs.xml.dist` |
| Static analysis | PHPStan 2 at level 8 with `szepeviktor/phpstan-wordpress` (WordPress stubs and rules) | `phpstan.neon.dist` |
| Tests | PHPUnit 11 (strict: warnings, risky tests, deprecations and unexpected output fail) with Yoast PHPUnit Polyfills for the WordPress test suite | `phpunit.xml.dist`; suites are listed per package as PHP code arrives |

Composer resolves dependencies as if running on PHP 8.2.30 (`config.platform.php`), so the committed `composer.lock` installs on the floor version; CI also runs newer PHP (ADR 0001). Commands: `composer lint`, `composer lint:fix`, `composer stan`, `composer test`, `composer check`; the root `pnpm lint:php`, `pnpm stan`, `pnpm test:php` and `pnpm check:php` wrap them. `pnpm check` stays JavaScript-only so contributors without PHP can run it.

When a package gets PHP code: put it under `wordpress/<package>/src` (PSR-4, namespace `Blixis\...`), tests under `wordpress/<package>/tests`, and add that tests directory to `phpunit.xml.dist`. `phpcs.xml.dist` and `phpstan.neon.dist` already cover everything under `wordpress/`. `tooling/php.test.mjs` proves the tools reject deliberately bad fixtures (`tooling/php/fixtures/bad`, never scanned by default): style, documentation, unescaped output, missing nonce, interpolated SQL, unregistered text domain, a return type error and a PHP 8.3-only function. These tests fail (not skip) when `composer install` has not been run; set `BLX_SKIP_PHP=1` to skip them deliberately.

**Known limits.** PHPCompatibility 9.x only knows PHP features up to 8.0, so the PHP 8.2 floor is enforced by PHPStan (`phpVersion: 80200`) and by running CI on PHP 8.2 (ADR 0001), not by PHPCompatibility alone. The text-domain check is global until each package has PHP code (then add per-package domains). `composer audit` (`composer run audit`) belongs in the CI dependency scan (BWB-015).

**PHP in namespaces.** Call PHP's special functions (`defined`, `strlen`, `count`, `is_*`, `in_array`, ...) with a leading backslash (`\defined( 'ABSPATH' )`) so the engine can optimise them and IDEs do not warn (PHP6616).

**Array syntax.** Use short arrays (`[ ... ]`), never `array( ... )`. This departs from WordPress Coding Standards on purpose: `phpcs.xml.dist` excludes the short-array prohibition and enforces `Generic.Arrays.DisallowLongArraySyntax`; `composer lint:fix` converts old code.
