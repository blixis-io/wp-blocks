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

Every `*.fixture.json` is an object with exactly these keys: `fixtureVersion` (1), `id` (kebab-case, equal to the file name without `.fixture.json`, unique across the tree), `description` (why the fixture exists), `tags` (kebab-case labels such as `translation`, `dark-mode`, `hostile`), `input`, and `expected` (a value, `{ "error": "<code>" }` for invalid input, `{ "valid": true }`, or another documented outcome). Invalid and hostile inputs are fixtures too; every defect fix adds one (`TESTING.md`).

## Determinism rules

1. **Values:** only `null`, booleans, safe integers, strings, arrays and objects. Non-integer number tokens (`1.0`, `1e3`), negative zero and integers beyond 2^53 are forbidden because PHP and JavaScript print them differently: use strings. Strings and keys must be NFC-normalised, well-formed Unicode (no lone surrogates). Objects must not repeat a key, and nesting is limited to 128 levels. Both languages enforce this with a strict scanner that runs on the JSON *text* before decoding (`strict-json.ts`, `StrictJson.php`), because decoding already hides these cases (`1.0` becomes `1`). In TypeScript, canonicalisation additionally accepts only plain JSON values (no sparse arrays, class instances, symbols or non-enumerable properties).
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

## Checks

`pnpm test:unit` (Vitest, includes the Prettier-stability and PHP parity tests), `composer test` (PHPUnit), and `pnpm check` run everything locally; CI runs the same.
