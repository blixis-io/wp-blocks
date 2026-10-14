# Handoff: independent review of BWB-020 (document validation, normalization, migrations)

READ-ONLY, offline. Branch `feat/20-document-validation`. Read: `docs/architecture/DOCUMENT-SCHEMA.md` (Validation API), `packages/core/src/document/*.ts`, `packages/core/src/json/*.ts`, `packages/core/src/schema/{parse,limits}.ts`, `packages/core/src/document/validate.test.ts`, `tests/fixtures/src/{canonical,strict-json}.ts` (now re-exports), `tooling/php/src/StrictJson.php`, ADR 0003/0004, `docs/engineering/THREAT-MODEL.md` (T3, T4, T18).

Questions:
1. Denial of service and bypasses in `validateDocument`: any input that makes it slow, recurse deeply (Zod parsing of a 128-level JSON structure? `assertJsonValue` and `findReservedKeys` recurse after the depth guard; the schema parse of deeply nested `ElementNode` recursion; regex backtracking in the schema patterns), allocate unbounded memory (strings of 2 MiB ok, but `MAX_JSON_VALUES` 500k, `structuredClone` in migrations), or skip a gate (object input path has no byte limit: is that documented/acceptable? sparse arrays, getters, Proxies, objects with toJSON, `Symbol.toStringTag`).
2. Order of gates and error classification: should `invalid-value` (NFC, decimals) precede or follow reserved keys? Does a hostile object trigger getters before validation? `Object.values` on exotic objects.
3. Semantic checks: `checkSemantics` iterative walk correctness (depth counting, node limit, `break` leaving stale state), duplicate style rule key, locale/translation checks, class reference check (only when tree within limits: is skipping safe?), `isRealTimestamp` (leap years, seconds=60, year 0000), warnings vs errors.
4. Migration framework: contract, `structuredClone` on non-plain input, registry ordering/duplicate `from`, a migration returning a different object type, mutation of shared state, "no data loss" guarantee (is the identity-migration test meaningful?), future-version handling.
5. JSON depth limit 128 vs element depth 32: arithmetic and the consistency test; PHP twin `StrictJson::MAX_DEPTH` and `json_decode` depth (MAX_DEPTH + 1).
6. `serializeDocument`/`canonicalJson`: still byte-identical with PHP (parity suite passes); `compareCodePoints` correctness for lone surrogates and astral characters; performance of the sort.
7. Tests: which behaviour has no failing-case test? Would the suite fail if a gate were removed or reordered?

Output: Blocker/Major/Minor with file + fix wording; agreements; what you could not verify.
