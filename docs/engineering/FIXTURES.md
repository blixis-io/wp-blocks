# Fixture conventions and test helpers

Fixtures are the shared truth between the TypeScript editor, the PHP renderer, WordPress integration tests and browser tests (FR-071, ADR 0003, ADR 0005). They must be deterministic, reviewable and identical for every consumer.

## Layout

```text
tests/fixtures/
  documents/{valid,invalid}/<id>.fixture.json   builder documents and their expected outcome
  style-resolution/                             ADR 0005 cases (python verifier; moves to the envelope format with BWB-107)
  <area>/...                                    css/, translations/, wordpress/, browser/ as those features arrive
  src/                                          @blixis/wp-fixtures: loader, canonical JSON, deterministic helpers, goldens
```

Golden outputs (rendered HTML, compiled CSS) live next to the fixture they belong to as `<id>.golden.html` / `<id>.golden.css`.

## Fixture envelope

Except for the PHP render corpus described below, every `*.fixture.json` is an object with exactly these keys: `fixtureVersion` (1), `id` (kebab-case, equal to the file name without `.fixture.json`, unique across the tree), `description` (why the fixture exists), `tags` (kebab-case labels such as `translation`, `dark-mode`, `hostile`), `input`, and `expected` (a value, `{ "error": "<code>" }` for invalid input, `{ "valid": true }`, or another documented outcome). Invalid and hostile inputs are fixtures too; every defect fix adds one (`TESTING.md`).

## Determinism rules

1. **Values:** `null`, booleans, safe integers, decimals on a four-place grid from `0.0001` through `1,000,000,000`, strings, arrays and objects. Decimal tokens must use their canonical plain form (`4.5`, not `4.50`); exponent notation, negative zero, values with more than four fractional places and integers beyond 2^53 are rejected. This bounded range keeps PHP and JavaScript serialization identical. Strings and keys must be NFC-normalised, well-formed Unicode (no lone surrogates). Objects must not repeat a key, and nesting is limited to 128 levels. Both languages enforce these rules with a strict scanner that runs on the JSON *text* before decoding. In TypeScript, canonicalisation additionally accepts only plain JSON values (no sparse arrays, class instances, symbols or non-enumerable properties).
2. **Files:** UTF-8, LF line endings, exactly one final newline, Prettier formatting (a test enforces it, so diffs stay minimal).
3. **Time:** never read the real clock. Use `fixedClock()` / `FIXED_NOW` (2026-01-01T00:00:00Z); timezone is UTC; the WordPress fixture site is UTC too.
4. **Ids and randomness:** no random ids in fixtures or goldens. Use `sequentialIds()` (`el-001`, ...) and `seededRandom(seed)` for reproducible property-style tests.
5. **Canonical JSON:** to compare or hash a value use `canonicalJson` / `canonicalHash` (keys in UTF-8 byte order at every depth, no whitespace, unescaped slashes and Unicode). The PHP twin is `Blixis\Tooling\Fixtures::canonical_json()`. `tests/fixtures/src/parity.test.ts` runs both over every committed fixture and over tricky values and requires byte-identical results. It already caught a real divergence: JavaScript enumerates integer-like object keys (`"2"`, `"10"`) numerically regardless of insertion order, so canonical JSON is serialised by hand rather than through object property order.
6. **Goldens:** compare with `assertGolden(actual, path)`; output and golden files end with exactly one newline. They change only deliberately: `UPDATE_GOLDEN=1 pnpm --filter @blixis/wp-fixtures test` rewrites them (refused when `CI` is set, and only for `*.golden.<ext>` files inside `tests/fixtures`) and the diff is reviewed like code.
7. **WordPress state:** use the Docker environment (`docs/engineering/LOCAL-DEVELOPMENT.md`) and its idempotent seed (`tooling/wp-env/fixtures/seed.php`); tests must not depend on data created by other tests. Locale- and mode-specific WordPress fixtures are added with the P2 issues.
8. **Browser tests:** run against seeded fixtures only, with animations disabled, a fixed viewport per project, UTC and a fixed locale; screenshots are committed only when intentional and reviewed (`TESTING.md`). Playwright arrives with BWB-058.

## Using the helpers

```ts
import { loadAllFixtures, canonicalJson, fixedClock, sequentialIds } from '@blixis/wp-fixtures';
for (const fixture of loadAllFixtures()) { /* run fixture.input through the unit under test */ }
```

```php
$fixture = \Blixis\Tooling\Fixtures::load( $path ); // validates the envelope; $fixture->input, ->expected
$all     = \Blixis\Tooling\Fixtures::load_all( $dir ); // also requires unique ids across the tree
```

Source files must not contain raw special characters (combining marks, line separators): write them as code points (`String.fromCodePoint`), because formatters rewrite escape sequences into invisible raw characters.

PHP requires `ext-intl` (NFC checks). The PHP helpers live under `tooling/php/src` for now; they move into the plugin test support when the plugin exists (BWB-039).

## Cross-language contracts (BWB-027)

`tests/fixtures/contracts.json` is the registry of every shared data file. A **suite** names its files (or directories), the TypeScript tests that run it and the state of the PHP side:

| `php.level` | Meaning |
|---|---|
| `full` | PHPUnit executes the suite's expectations. |
| `shape` | PHP reads every file with its strict scanner and checks the suite's **instances** (document fixtures, token corpus cases) against the JSON Schemas generated from the TypeScript schemas; the schema files themselves are only strict-read. The semantics arrive with `php.issue`. |
| `pending` | Nothing runs in PHP yet; `php.issue` is the roadmap issue that delivers it. |

`full` and `shape` suites name their PHPUnit file (`php.runner`) and the test methods in it that check the suite (`php.covers`); both the TypeScript and the PHP contract tests verify that those methods exist, and a pending suite may not have a runner. A PHP-only suite may declare `phpOnly: true` with `ts: []` and a full PHP runner when no TypeScript counterpart exists. The registry is tracking metadata: it cannot prove that a method really exercises a suite, so **the PR that delivers a pending suite's issue must change its level** (PR template checklist) and reviewers check that the named methods read the suite's files.

Current suites: document fixtures and schema, design-token schema and corpus, the CSS declaration corpus and allow-list manifest, ADR 0005 resolution cases, the compile goldens and the element manifest. Rules enforced on both sides (`tests/fixtures/src/contracts.test.ts`, `tooling/php/tests/ContractsTest.php`):

The CSS declaration corpus and CSS properties manifest are `full` PHP suites. `CssDeclarationValidatorTest` reads every declaration case and compares its canonical value or issue code, and checks that the plugin's bundled manifest is byte-identical to the style-engine manifest. The sync command copies both CSS and core-element manifests into `wordpress/plugin/data/`.

1. Every JSON file in a directory named `corpus`, `manifest`, `schema`, `fixtures`, `golden` or `contracts`, anywhere in the repository (not a fixed list of roots), belongs to a suite. Only exact configuration paths (`tests/fixtures/package.json`, `tsconfig.json`, the registry itself) and `tooling/fixtures/` (inputs of the tooling tests) are exempt.
2. Every file passes the strict JSON rules above (also schemas and manifests: they use integers only for now; a future schema needing fractional literals such as `multipleOf: 0.1` needs a documented exception and a PHP scanner mode first), and its canonical JSON is byte-identical in PHP and TypeScript.
3. A pending or shape-only suite names a real roadmap issue; runners and test files exist.
4. Document fixtures and the token corpus agree between the TypeScript schemas and the generated JSON Schema run by PHP: a fixture that expects `schema` (for tokens: `schema`, `reserved-key` or `unreadable`) is rejected, every other fixture is accepted. A document fixture that expects `schema` also states `expected.path`, the JSON path of the offending value, and both languages must fail at exactly that place (PHP maps JSON Schema's pointer: a missing required property is reported at the object and a rejected property name at its object, so those are matched on the child). Extra PHP probes cover `$ref` recursion, reserved keys, non-ASCII ids and `{}` versus `[]`.

**Compile goldens** (`tests/fixtures/compile`): each fixture holds a document, global classes, tokens and optionally a breakpoint registry, and expects the render metadata (`classNames` per element and `issues` with code and path) plus a `*.golden.css` with the exact stylesheet. The TypeScript compiler is the reference; the PHP compiler (BWB-044) must produce the same bytes. Goldens change only deliberately (`UPDATE_GOLDEN=1`, reviewed like code); Prettier ignores them. Because goldens come from the implementation they protect, they are not the only oracle: the class-name hashes in the expectations were computed with Python `hashlib`, issue paths follow the documented format (`$.root[i].style[j].declarations.<name>`, derived by hand from the fixture structure and the order of sorted property names), and `compile.contract.test.ts` contains hand-derived stylesheets (the owner example, class precedence and the light-mode media query) written from ADR 0005 with class names from Node's `crypto`. Real-browser computed styles are tracked in #147.

**JSON Schema validator for PHP:** `opis/json-schema` 2.x, a pure-PHP validator that supports draft 2020-12 (the dialect Zod generates). It is a development dependency used by the contract tests only (Apache-2.0, recorded by the licence check) and is never shipped: the plugin's runtime validation is the hand-written PHP validator of BWB-043, which these fixtures exist to hold to the TypeScript behaviour.

**Adding shared data:** put the file in a data directory (names above), register it in `contracts.json` (the orphan check fails otherwise), add the TypeScript runner and, when the PHP side exists, change its level. `BLX_SKIP_PHP=1` skips the TypeScript-initiated PHP parity tests (canonical JSON); the PHPUnit contract tests are run by `composer test`.

## Checks

`pnpm test:unit` (Vitest, includes the Prettier-stability and PHP parity tests), `composer test` (PHPUnit), and `pnpm check` run everything locally; CI runs the same.

**PHP render corpus** (`tests/fixtures/render/*.fixture.json`): each file has `{ id, description, registry: "core", locale, mode, document, expectedHtml }`. Expected HTML is hand-derived and compared byte for byte by `RegistryRenderTest::test_render_corpus`. This corpus is PHP-only because there is no TypeScript HTML renderer; the contract registry marks it `phpOnly` with an empty `ts` runner list.

**Compile corpus.** `tests/fixtures/compile-corpus` holds one stylesheet and its input for each case of `style-resolution/cases.json`, generated from the TypeScript compiler (`pnpm --filter @blixis/wp-fixtures generate:compile-corpus`). TypeScript fails when the files drift; PHP must produce the same bytes (BWB-044).
