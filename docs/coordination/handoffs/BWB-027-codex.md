# Handoff: independent review of BWB-027 (TS/PHP parity fixtures and contract tests)

READ-ONLY, offline. Branch `feat/27-ts-php-parity-fixtures`. Read: `docs/engineering/FIXTURES.md` (new section "Cross-language contracts"), `tests/fixtures/contracts.json`, `tests/fixtures/src/contracts.ts`, `contracts.test.ts`, `compile.contract.test.ts`, `tests/fixtures/compile/*`, the new document fixtures under `tests/fixtures/documents`, `tooling/php/tests/ContractsTest.php`, `tooling/php/bin/canonicalize.php`, `composer.json` (opis/json-schema), `tooling/boundaries.json` change, `.prettierignore`.

Questions:
1. Does the contract design actually protect the PHP twin? Can a suite be forgotten (orphan check roots, ignored names, a `pending` suite never promoted), can a file drift between languages unnoticed, is the "php.level" model enforceable (does anything fail when a PHP implementation lands but the level stays pending)? What should be added?
2. Compile goldens: read each `*.golden.css` against ADR 0005 and `docs/architecture/CSS-COMPILER.md`. Any golden that encodes a wrong or unstable behaviour (ordering, merged selectors, media nesting, token output, declaration canonicalisation such as `1.50rem` staying as written)? Is committing goldens produced by the implementation under test circular, and is anything independent in these fixtures (class-name hashes were computed with Python hashlib)? Are the expected issues in fixtures hand-derived or copied from output?
3. JSON Schema parity: is the rule "expected `schema` => invalid, everything else => valid" sound for documents and tokens? Check the new schema-invalid fixtures: does each fail for the stated reason in both the Zod and the JSON Schema? Is `opis/json-schema` configured correctly (draft 2020-12, formats, `$ref`s, `propertyNames`, unicode patterns)? Edge: PHP decodes `{}` as stdClass and `[]` as array.
4. canonical JSON parity via `canonicalize.php json:`; strict-JSON rules applied to schemas/manifests/corpora (numbers, NFC); anything that would make a legitimate data file unrepresentable.
5. Boundaries: `tests/fixtures` now depends on `style-engine` and `design-tokens`. Acceptable? Any circularity or production dependence?
6. CI/Docs: PHP matrix 8.2/8.3/8.5, Composer lock changes, licence check for Apache-2.0 dev dependency, `BLX_SKIP_PHP`. Missing documentation?

Output: Blocker/Major/Minor with file + fix wording; agreements; what you could not verify.
