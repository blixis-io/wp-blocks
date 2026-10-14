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
- **Custom properties** must be named `--blx-[a-z0-9-]{1,64}`. Their values may hold plain tokens, math, colour functions, gradients, grid and transform functions and `var(--blx-*)`; no free functions.
- **Values** match a per-property grammar (keyword set, length, box of 1-4 lengths, colour, number range, font family list, border, shadow, gradient, grid tracks, transform, ...). `inherit`, `initial`, `unset` and `revert` are accepted everywhere.
- **Functions** are allow-listed: `calc`, `min`, `max`, `clamp`; `rgb`, `rgba`, `hsl`, `hsla`, `oklch`, `oklab`, `lab`, `lch`, `color-mix`; the six gradient functions; `repeat`, `minmax`, `fit-content`; the 2D transform functions; and `var()`. Each function's arguments are checked against its own token policy, so a function can never carry a URL or string.
- **`var()`** only names `--blx-*` properties; a fallback is held to the custom-property rules. A value that contains `var()` skips the property grammar (the variable may expand to anything), but it was still scanned and every `--blx-*` value is validated where it is declared.
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

Quoted font names are not accepted: use unquoted names (`Helvetica Neue`, `Source Sans 3`). `!important` is never accepted (ADR 0005: output is never `!important`).

## Implementation

A hand-written linear scanner (`src/tokenize.ts`), not regular expressions on the value, produces a small tree (identifiers, numbers, dimensions, percentages, hashes, functions, commas, slashes, operators). The grammar (`src/grammar.ts`) validates functions first, then the property's grammar. It uses no Node APIs, so it runs in the editor and in Node. The PHP twin (BWB-027) reads `manifest/css-properties.json` and must pass the same corpus.

## Tests

- `corpus/declarations.json`: about 100 valid declarations with their canonical form and about 120 invalid ones with the expected code, covering CSS injection, escapes, Unicode look-alikes, URL functions, `var()` abuse, units, nesting and range errors. It is shared with the PHP twin.
- Seeded fuzz (40,000 random value fragments over all properties): nothing throws, nothing accepted contains `url(`, `expression`, `@`, `;`, braces, backslashes, quotes, `:` or a foreign custom property, and every accepted value is idempotent.
- Every allow-listed property rejects `url(...)` and accepts `inherit`; bounded-time and nesting-limit tests; sanitization and document-path tests.
