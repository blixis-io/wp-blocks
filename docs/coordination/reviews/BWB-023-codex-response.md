## BWB-023 review

**No declaration or `<style>` breakout found.** The validator rejects backslashes, controls, non-ASCII UTF-16 code units, `<`, `>`, semicolons and braces before serialization. That covers trailing backslashes, NUL, lone surrogates, Unicode look-alikes and bidi characters. URL-capable functions, including `image-set`, `src`, `cross-fade` and vendor forms, are outside the function allow-list. I found no way for an accepted value to reach a neighbouring declaration or form `url()` by joining validated `var()` tokens.

### Major

- **`var()` bypasses the entire property grammar.** [grammar.ts](packages/style-engine/src/grammar.ts:510) accepts `color: var(--blx-x) garbage`, `color: var(--blx-x) / 1px`, and a gradient containing `var()` as a color. These remain confined to one declaration, but can silently invalidate styling. Validate the token structure around each `var()` against the destination grammar, or restrict it to a whole value or an explicitly permitted slot. The claim that every referenced `--blx-*` value is validated also needs a boundary: other stylesheets can define those names, so a URL-free guarantee depends on controlling their cascade.

- **Common builder values are rejected.** [grammar.ts](packages/style-engine/src/grammar.ts:336) rejects named grid lines (`grid-column: hero`), `flex: 1 1 min-content`, and `aspect-ratio: auto 16 / 9`. [properties.ts](packages/style-engine/src/properties.ts:224) restricts `transition-property` to eight names, omits `cubic-bezier()` and `steps()`, and treats negative `transition-delay` like an invalid duration. Extend these grammars with focused positive and negative corpus cases.

- **Font names with digits are accepted as unquoted text.** [grammar.ts](packages/style-engine/src/grammar.ts:497) and the corpus accept `Source Sans 3`, although an unquoted CSS family name cannot contain a standalone number token. Support safely serialized quoted family names or resolve approved font identifiers to CSS strings; correct the corpus expectation.

- **The 50-issue work limit does not stop validation within a node.** [document.ts](packages/style-engine/src/document.ts:28) uses `forEach` over up to 256 style rules after the issue cap is reached. Stop iterating immediately at the cap to meet the T18 bounded-work intent.

### Minor

- **Several invalid values validate:** `border-width: 10%`, `box-shadow: 0 0 -2px red`, `background-position: left left`, and `text-decoration-line: none underline`. The generic checks at [grammar.ts](packages/style-engine/src/grammar.ts:300) need property-specific constraints. Math functions also bypass non-negative checks, so `padding: calc(-1px)` validates and is left for the browser to discard.

- **The ten-digit limit permits eleven integer digits.** The comparison in [tokenize.ts](packages/style-engine/src/tokenize.ts:172) accepts `12345678901px`. Count digits explicitly and test both sides of the limit. Function nodes are also excluded from the component count, though the eight-level depth cap still bounds them.

- **The manifest cannot specify PHP parity by itself.** [css-properties.json](packages/style-engine/manifest/css-properties.json) contains allow-list data, but not tokenizer precedence, serialization, function argument policies, grammar algorithms or error ordering. The PHP twin needs the TS source rules as a normative contract and expanded shared fixtures.

- **Mutation coverage is uneven.** Skipping `checkFunctions` or removing the `--` identifier check would fail existing corpus cases. Removing many entries from `FORBIDDEN` would still be rejected later as `syntax`, so tests asserting rejection alone do not prove the intended early `forbidden-character` boundary. Add targeted character and limit cases. The fuzz test’s fragment set does not exercise lone surrogates or several valid-but-browser-invalid combinations.

**Agreements:** Exact, case-sensitive property names; sorted sanitization; own `__proto__` rejection; safe-integer conversion; and idempotent serialization behaved as documented. The scanner’s sign handling, `.5`, `1e3`, `1px2`, operator spacing and eight-level nesting checks matched the inspected rules. With the fixed value and depth caps, I found no unbounded recursive or quadratic path.

**Verification:** `pnpm --filter @blixis/wp-style-engine test` passed (235 tests). I did not verify rendered CSS in browsers or a PHP twin; neither is established by this review.