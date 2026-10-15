# CSS declaration validation (BWB-023)

Style rules store `declarations` (property name -> value). Everything that reaches a stylesheet goes through `@blixis/wp-style-engine`: threat T5 in `docs/engineering/THREAT-MODEL.md` and ADR 0005 section 4. Selectors, layer names and class names are never user input; this document covers only declarations.

## API

```ts
validateDeclaration(name, value): { ok: true; name; value } | { ok: false; code; message }
validateDeclarations(declarations): DeclarationIssue[]
sanitizeDeclarations(declarations): { declarations; issues }   // what the compiler (BWB-024) must use
checkDocumentStyles(document): StyleIssue[]                    // paths like $.root[0].style[1].declarations.color
```

Nothing throws. `value` in a success result is the canonical form (lower case, single spaces, `.5` -> `0.5`, `+4px` -> `4px`) and validating it again gives the same result. The compiler emits only sanitized output, so even a document that skipped validation cannot inject CSS. `validateDocument` stays structural; the editor, the REST save path and the compiler call these functions.

## What is accepted

- **Property names** come from an allow-list (`src/properties.ts`, exported to `manifest/css-properties.json`): layout, size, spacing, flex and grid, typography, background, border and effects. Names are exact and lower case. Anything else (`filter`, `content`, `float`, `behavior`, vendor prefixes, `__proto__`) is `unknown-property`. Adding a property is a reviewed change with corpus entries.
- **Custom properties** must be named `--blx-[a-z0-9-]{1,64}`. Their values may hold plain tokens, quoted plain names, math, colour functions, gradients, grid and transform functions and `var(--blx-*)`; no free functions.
- **Values** match a per-property grammar (keyword set, length, box of 1-4 lengths, colour, number range, font family list, border, shadow, gradient, grid tracks, transform, ...). `inherit`, `initial`, `unset` and `revert` are accepted everywhere.
- **Functions** are allow-listed: `calc`, `min`, `max`, `clamp`; `rgb`, `rgba`, `hsl`, `hsla`, `oklch`, `oklab`, `lab`, `lch`, `color-mix`; the six gradient functions; `repeat`, `minmax`, `fit-content`; the 2D transform functions; and `var()`. Each function's arguments are checked against its own token policy, so a function can never carry a URL or string.
- **`var()`** only names `--blx-*` properties; a fallback is held to the custom-property rules. A lone `var()` is always accepted. A `var()` that is one term of a longer value is replaced by each of five stand-ins (a length, a colour, a number, `solid`, a percentage) and the value must fit the property grammar for at least one, so `border: 1px solid var(--blx-c)` passes and `color: var(--blx-c) garbage` does not. A `var()` inside another function is opaque to the property grammar; the function's own argument rules apply. The guarantee that variables hold no URL depends on every `--blx-*` value being validated where it is declared and on builder CSS controlling those names; other stylesheets that define `--blx-*` names are outside this guarantee (ADR 0005, guarantee scope).
- **Units** are allow-listed: `px em rem ch ex vw vh vmin vmax dvw dvh svw svh lvw lvh`, `deg rad turn grad`, `s ms`, and `fr` in grid tracks. `calc()` is checked for syntax (operands, operators with their required spaces, division by a literal zero) but not for unit compatibility; the browser ignores an incompatible one.

## What is refused, and why

| Refused | Code | Reason |
|---|---|---|
| `url()`, `image-set()`, `src()`, `attr()`, `env()`, `expression()`, `paint()`, any other function | `forbidden-function` / `forbidden-character` | no network requests from CSS (exfiltration, tracking); images are referenced by attachment id and resolved server-side (later issue) |
| `\` escapes, `/* */`, `;`, `{`, `}`, `@`, `!`, quotes, `:`, `<`, `>`, `[`, `]`, `&`, `\|`, `_`, backtick | `forbidden-character` | statement, block and at-rule injection; escapes that rebuild `url(`; HTML context breaks |
| control characters, newlines, non-ASCII (full-width or look-alike letters) | `forbidden-character` | printable ASCII only |
| unknown or non-`--blx-` custom properties and `var()` | `invalid-name` / `invalid-var` | no reading of arbitrary variables |
| unlisted units (`pt`, `cm`, `vi`, `e` notation) | `forbidden-unit` / `syntax` | |
| more than 2048 characters, 256 components, 8 levels of nesting, 10 digits per number | `value-too-long` / `too-complex` / `syntax` | bounded work and memory |

Strings are accepted only in `font-family` and in `--blx-*` custom properties (design tokens carry quoted font stacks), as a double-quoted plain name (`"Source Sans 3"`: letters, digits, spaces and hyphens, 1-63 characters). Unquoted names may contain only identifiers (`Helvetica Neue`); an unquoted standalone number is invalid CSS and is refused. Two value tokens must be separated by whitespace or an operator (`none+0` is refused) so the canonical form re-parses to the same value. `!important` is never accepted (ADR 0005: output is never `!important`).

## Implementation

A hand-written linear scanner (`src/tokenize.ts`), not regular expressions on the value, produces a small tree (identifiers, numbers, dimensions, percentages, hashes, functions, commas, slashes, operators). The grammar (`src/grammar.ts`) validates functions first, then the property's grammar. It uses no Node APIs, so it runs in the editor and in Node. The PHP twin (BWB-027) reads `manifest/css-properties.json` for the allow-lists, but the manifest is data only: the tokenizer, canonical serialization, function argument policies, `var()` stand-ins and grammar algorithms are normative in `src/*.ts` and are pinned by the corpus, which the twin must pass byte for byte (including the error codes and the canonical value). The corpus grows with every divergence found.

## PHP twin

`wordpress/plugin/src/Css/` contains the pure PHP `Tokenizer`, `Grammar`, `Properties`, `CssLimits`, and `DeclarationValidator`. `DeclarationValidator::sanitize()` returns canonical declarations in byte-sorted name order and issues for dropped entries. The PHP compiler must emit only this result. `Properties` reads the committed `wordpress/plugin/data/css-properties.json` copy; `tooling/build/sync-plugin-manifest.mjs` refreshes or checks it against the generated TypeScript manifest. The manifest generator exports easing functions and keywords as well as property grammars and the other allow-lists used by PHP.

`wordpress/plugin/tests/CssDeclarationValidatorTest.php` runs every case in the shared declaration corpus and checks canonical output, error codes, idempotence, forbidden bytes, bounds, sanitization, and seeded fuzz. The corpus has no TypeScript/PHP differences. PHP rejects non-ASCII and invalid UTF-8 bytes during the scanner's first pass, before parsing them, matching the TypeScript printable-ASCII gate for string inputs. PHP accepts `string|int`; integers outside JavaScript's safe-integer range become an empty value, matching TypeScript's numeric guard.

## Tests

- `corpus/declarations.json`: about 100 valid declarations with their canonical form and about 120 invalid ones with the expected code, covering CSS injection, escapes, Unicode look-alikes, URL functions, `var()` abuse, units, nesting and range errors. It is shared with the PHP twin.
- Seeded fuzz (40,000 random value fragments over all properties): nothing throws, nothing accepted contains `url(`, `expression`, `@`, `;`, braces, backslashes, quotes, `:` or a foreign custom property, and every accepted value is idempotent.
- A test per forbidden character (rejected with `forbidden-character` before any other rule), lone surrogates, non-ASCII and control characters, exact digit limits and component counting.
- Every allow-listed property rejects `url(...)` and accepts `inherit`; bounded-time and nesting-limit tests; sanitization and document-path tests.

## Known limits

The allow-list includes the four logical `margin-*` and `padding-*` sides (`block-start`, `inline-end`, `block-end`, `inline-start`) so inspector spacing follows writing direction. Physical sides remain available to documents and extensions.

- Math functions are checked for syntax, not sign or unit compatibility: `padding: calc(-1px)` validates and the browser discards it.
- Some accepted values are still invalid CSS in corner cases (for example a grid line name that the template does not define). They are harmless: the browser ignores the declaration.
- Named grid lines in square brackets, `transition` and `animation` shorthands, `filter`, `content`, `float` and `url()` backgrounds are not available yet; media backgrounds arrive through attachment ids in a later issue.
