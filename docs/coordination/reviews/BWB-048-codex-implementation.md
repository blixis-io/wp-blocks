# BWB-048 Codex implementation report

tokens used
471,786
Implemented BWB-048 on `test/48-php-attack-surface-hardening`; no commit or push.

The new [security test matrix](docs/engineering/SECURITY-TEST-MATRIX.md) maps T1–T22 to controls, exact tests, existing WordPress smoke labels, and explicit gaps. I added hostile renderer and REST payload suites, an error contract and SQL preparation guard, publish and rollback audit events, a 30-per-hour user/post limit, a 200-snapshot post limit, and PHP token-set validation. All 29 shared token cases pass. The [REST specification](docs/architecture/WORDPRESS.md) and threat model were updated.

**Bugs exposed and fixed by the new tests:** markup-shaped relative button URLs passed URL admission; NUL bytes survived text escaping and broke preview; escaped alt text containing strings such as `onclick=` was falsely rejected by the preview sanitizer; and wide JSON had no value-count limit before storage.

Verification passed: `composer run lint:fix`, `composer run lint`, `composer run test` (**343 tests**), PHPStan `--debug` (**no errors**), the contract tooling suite (**54 tests**), Prettier, the fixtures Node suite (**195 tests**), and `git diff --check`.

**Gaps:** Real-WordPress smoke was not run or edited. The new hook, 429 and snapshot-limit behavior still need that smoke evidence. Transient rate updates and snapshot counting are not atomic across concurrent requests; site-wide limits and alerting remain open. Full document schema validation and locale-specific translator permissions remain their separate issues. No additional BWB-048 decision is needed.

## Follow-up fixes from the independent review

tokens used
84,381
Applied the BWB-048 fixes on `test/48-php-attack-surface-hardening`.

- [Publisher.php](wordpress/plugin/src/Publication/Publisher.php:29) now caps publishes at 200 snapshots and allows rollbacks until a hard ceiling of 240. Tests cover refusal at 200, recovery at 200 and 239, and refusal at 240.
- [TokenSet.php](wordpress/plugin/src/Tokens/TokenSet.php:117) now uses UTF-16 lengths for mirrored TypeScript limits and memoizes resolution per mode. Tests cover Unicode boundaries and a 500-token shared-reference graph.
- Updated the [WordPress contract](docs/architecture/WORDPRESS.md:53) and [security test matrix](docs/engineering/SECURITY-TEST-MATRIX.md:23). Every cited test method and smoke label was checked against source.

**Parity note:** The TypeScript label limit is 80 UTF-16 units, so both 50 and 51 `é` characters are valid. The rejection test uses 81.

All requested checks pass: `lint:fix`, `lint`, 347 PHPUnit tests, PHPStan, and Prettier. `git diff --check` is clean. No commit or push was made.
