## BWB-014 review

**No blocker found in the current tooling configuration.** The checkout is clean on `chore/14-php-tooling`; the handoff’s “uncommitted tree” description does not match the inspected tree.

### Major

- [tooling/php.test.mjs](tooling/php.test.mjs:10): All enforcement tests skip when Composer binaries are absent, so `pnpm test:tooling` can pass without checking PHP tooling. Make the PHP tooling gate require `composer install` and fail when the binaries are missing.
- [tooling/php.test.mjs](tooling/php.test.mjs:19): The failing fixtures give limited protection against a gutted config. One security sniff suffices for the assertion; there is no failing case for nonce verification, prepared SQL, Docs, the text domain, or the PHP compatibility floor. The PHPStan return-type error can still fail at a lower level. Add focused failing fixtures and assert their specific diagnostic codes, plus a level/config assertion.

### Minor

- [phpcs.xml.dist](phpcs.xml.dist:27): The filename exemptions apply across all PHP, although PSR-4 naming is needed chiefly under `src/`. Scope the exemptions to PSR-4 source paths so theme templates and entry files retain WordPress filename checks.
- [phpcs.xml.dist](phpcs.xml.dist:50): The four allowed text domains are global; a Builder file can use the Theme domain without a diagnostic. Add package-specific domain checks when package PHP arrives.
- [phpunit.xml.dist](phpunit.xml.dist:4): `vendor/autoload.php` is sufficient for the tooling suite, but adding WordPress integration tests to this suite will also require the WordPress test bootstrap and database setup. Define that runner/bootstrap with BWB-012/BWB-018.

### Agreements and limits

PHPCS resolves 299 sniffs, including escaping, nonce, prepared SQL, and safe redirect checks. Its file entries cover `wordpress/**` and `tooling/php/tests`; the fixtures are excluded by omission, and `vendor`, `node_modules`, and `dist` are excluded. The AlternativeFunctions exception is limited to `*/tests/*`. PHPStan’s extension is registered, its level is 8, and its paths include `wordpress`; with the existing tooling test path, it cannot pass solely because `wordpress` is empty. `treatPhpDocTypesAsCertain: false` and the additional signature/return checks are reasonable for WordPress stubs.

The lock has 40 **dev-only** packages, no abandoned flags, and no listed PHP requirement above 8.2. The committed lock and ignored `vendor/` support reproducibility; `config.platform.php` resolves at 8.2.30. Add `composer audit` to the planned CI dependency scan.

I could inspect effective sniff registration, but could not run the fixture tests: PHPCS’s JSON reporter requires a writable temporary directory, which this read-only environment denies. I therefore could not verify the full PHPStan/PHPUnit runs or a future WordPress integration suite.