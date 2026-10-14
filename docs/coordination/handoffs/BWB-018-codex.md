# Handoff: independent review of BWB-018 (fixture conventions and helpers)

READ-ONLY, offline. Branch `test/18-fixtures`. Read: `docs/engineering/FIXTURES.md`, `tests/fixtures/src/*.ts` (canonical.ts, load.ts, deterministic.ts, golden.ts and their tests, parity.test.ts), `tests/fixtures/documents/**`, `tooling/php/src/Fixtures.php`, `tooling/php/bin/canonicalize.php`, `tooling/php/tests/FixturesTest.php`, `docs/architecture/adrs/0003-*.md`, `docs/engineering/TESTING.md`.

Questions:
1. Canonical JSON: are the TS and PHP implementations really byte-identical for all values the rules allow? Look hard at: key ordering (UTF-8 bytes, integer-like keys, PHP arrays turning numeric string keys into ints when decoded as arrays vs stdClass), `JSON.stringify` vs `json_encode` escaping (control characters, U+2028/2029, DEL, `/`, lone surrogates, non-BMP), `-0`, big nesting depth (PHP default 512), duplicate keys in the JSON text (last wins in both?), `__proto__` and similar keys in JS objects, empty-string keys, NFC checks (JS normalize vs PHP Normalizer: Unicode version differences).
2. Fixture value rules and envelope: anything that lets non-determinism in (floats as strings are fine? integers vs `-0`? key `__proto__`?). Is the envelope validation equivalent in TS and PHP (PHP `load` checks fewer things than TS `parseFixture`: tags, description)?
3. `assertGolden`: update-in-CI guard (`CI` env), path handling, CRLF, trailing newline; can it silently pass?
4. Determinism helpers: `seededRandom` (mulberry32 correctness, the hard-coded expected values), `fixedClock`, `sequentialIds`.
5. Tests: which behaviour has no failing-case test? Would parity tests fail if either serialiser were gutted?
6. Dependencies: Vitest 5.0.4 and @types/node 24.19.2 pinned exact; anything risky?

Output: Blocker/Major/Minor with file + fix wording; agreements; what you could not verify.
