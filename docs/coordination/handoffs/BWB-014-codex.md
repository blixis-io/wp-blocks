# Handoff: independent review of BWB-014 (Composer, PHPCS, PHPStan, PHPUnit)

READ-ONLY, offline. Branch `chore/14-php-tooling` (uncommitted tree). Issue #14. Read: `composer.json`, `composer.lock` (versions only), `phpcs.xml.dist`, `phpstan.neon.dist`, `phpunit.xml.dist`, `tooling/php/**`, `tooling/php.test.mjs`, root `package.json`, `docs/engineering/CODE-STANDARDS.md` (PHP tooling), `docs/engineering/SECURITY.md`, ADR 0001 (PHP 8.2 / WP 7.0 floors), ADR 0009.

Questions:
1. Is the PHPCS ruleset right for a WordPress.org-bound theme/plugin and add-ons: WordPress-Extra + Docs, PHPCompatibilityWP `testVersion 8.2-`, `minimum_wp_version 7.0`, prefixes, text domains, the FileName relaxation for PSR-4, the AlternativeFunctions exclusion limited to `*/tests/*`? Anything weakening security sniffs (escaping, nonce, SQL)? Are `<file>` entries (`wordpress`, `tooling/php/tests`) and exclude patterns correct (could generated or vendor code be scanned, or real PHP be silently skipped)?
2. PHPStan level 8 with the WordPress extension via `phpstan/extension-installer`: config sound? `treatPhpDocTypesAsCertain: false`, `checkTooWide...` options appropriate? Will it analyse `wordpress/**` once PHP exists, and fail loudly (not pass vacuously) if paths vanish?
3. PHPUnit config: strictness flags, bootstrap, test suites, coverage/cache, and the plan for WordPress integration tests (BWB-012, BWB-018). Anything that will block the WP test suite?
4. Composer: `config.platform.php 8.2.30` with `require php >=8.2`, `allow-plugins`, `sort-packages`, `optimize-autoloader`, lock committed, `vendor/` ignored; any supply-chain or reproducibility concern (e.g. packages abandoned, dev-only vs production autoload, `composer audit` in CI)? Check versions in the lock for compatibility with PHP 8.2.
5. Tests (`tooling/php.test.mjs`, `EnvironmentTest.php`): would they fail if configs were gutted (e.g. the compat sniff removed, security sniffs excluded, PHPStan level lowered)? Which enforcement lacks a failing-case test?

Output: Blocker/Major/Minor with file + fix wording; short agreements; what you could not verify.
