## Review findings

### Blocker

- **PHP contract levels do not enforce their stated meaning.** [contracts.ts](tests/fixtures/src/contracts.ts:105) and [ContractsTest.php](tooling/php/tests/ContractsTest.php:90) check that runner files exist, but never establish that a `full` runner executes that suite’s expectations. Changing every entry to `full` with `ContractsTest.php` as its runner could pass without a PHP CSS compiler or declaration validator. A `pending` suite can also remain pending after its implementation lands. **Fix:** give each suite an executable PHP test identifier and assert its coverage, and make the delivery issues’ checks require promotion from `pending`/`shape`. Until then, describe the levels as tracking metadata, not an enforced parity gate.

### Major

- **The orphan check covers only fixed roots and exempts names at any depth.** [contracts.ts](tests/fixtures/src/contracts.ts:36) will miss a new shared-data directory; its basename-only ignore rule could also hide a shared file named `package.json`. PHP has no independent orphan check. **Fix:** derive or audit the shared-data roots, restrict ignores to exact repository paths, and test an orphan in a newly added root.

- **The compile goldens lock down output but are not an independent CSS oracle.** [compile.contract.test.ts](tests/fixtures/src/compile.contract.test.ts:18) compares the compiler to committed output and compiles the same input twice for stability. That is useful for drift and future PHP byte parity, but an implementation-generated mistake can be approved into both sides. The documented Python `hashlib` calculation independently supports class hashes; I found no independent check of the complete CSS or evidence in the fixtures that issue paths were derived separately. **Fix:** add a small hand-derived CSS expectation or browser computed-style check for the owner cascade example, class order, and auto mode; record how expected issue paths were derived.

- **Schema parity tests assert only valid versus invalid, not the stated failure.** [ContractsTest.php](tooling/php/tests/ContractsTest.php:154) treats every non-`schema` document outcome as JSON-Schema-valid, which is appropriate for semantic failures on the current corpus. The new invalid cases pass, but a fixture could fail for a second, unintended reason and still pass this test. **Fix:** assert the relevant Zod path and Opis keyword/path for each new schema-invalid fixture. Add focused probes for `propertyNames`, `$ref`, Unicode patterns, and empty object versus empty array. The current schemas declare draft 2020-12 and use `$ref`/`propertyNames`; I found no `format` keyword requiring format configuration.

- **Strict fixture-number rules are applied to schemas and manifests too.** [contracts.ts](tests/fixtures/src/contracts.ts:94) requires safe integer JSON numbers for every registered file. That is fine for current files, but a legitimate future JSON Schema constraint such as `"multipleOf": 0.1` would be unrepresentable under this contract. **Fix:** keep strict numbers for cross-language *data instances*; define a separate, documented policy for schema documents and other specifications if they need fractional numeric literals.

### Minor

- **The fixtures package declares an unused design-tokens dependency.** [package.json](tests/fixtures/package.json:15) and [boundaries.json](tooling/boundaries.json:97) allow it, while the fixture source imports the style engine directly. Remove the direct dependency unless a test uses it. The style-engine test dependency is appropriate; I found no production package depending on fixtures or package cycle.

- **Docs overstate the gate.** [FIXTURES.md](docs/engineering/FIXTURES.md:50) says PHP `shape` checks schema shape for a suite, but the two schema-file suites themselves receive strict-read checks; document and token *instances* receive Opis validation. Clarify that distinction and document that `BLX_SKIP_PHP=1` skips TypeScript-initiated PHP parity tests.

## Agreements

All nine CSS goldens match the documented output conventions on inspection: layer and state order, class precedence, merged selectors, nested mode/breakpoint media rules, token ordering, and border shorthand order. `1.50rem` remaining `1.50rem` is consistent with the current tokenizer’s canonical output; it is not documented as numeric normalization. The new schema-invalid fixtures passed the PHP accept/reject matrix, and the TypeScript contract tests passed. Empty `{}` retains `stdClass` identity in PHP, while `[]` remains an array. The new Opis packages in the lockfile declare Apache-2.0, and the existing CI PHP matrix is 8.2/8.3/8.5.

## Verification limits

I ran the targeted Vitest suite (**16 passed**) and PHPUnit contract suite (**47 passed**, PHP 8.4). PHPUnit reported only a read-only cache-write warning. I could not run the licence gate to completion: `pnpm licenses list --json --prod` exited 255 in this restricted workspace. I did not verify CI on 8.2/8.3/8.5, browser computed styles, or the future PHP compiler and validator.