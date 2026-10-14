# CSS compiler (BWB-024)

`compile()` in `@blixis/wp-style-engine` turns a document, the global classes it uses and the design tokens into one stylesheet that implements ADR 0005 section 3. The same function runs in the editor canvas; the PHP twin (BWB-027) must reproduce its output byte for byte for the same inputs.

```ts
compile({ document, classes?, tokens?, breakpoints? }): { css, classNames: Map<elementId, string[]>, issues }
```

Nothing throws. Every declaration goes through `sanitizeDeclarations` (docs/architecture/CSS-VALIDATION.md): invalid ones are dropped and reported as `invalid-declaration` issues, never emitted.

## Inputs (all of them: output depends on nothing else)

- `document`: elements with `style` rules and `classIds`; `documentId` feeds the element class names.
- `classes`: every global class the document may reference, **by value, in precedence order** (first = lowest). The position in this list decides precedence between classes, not the order of an element's `classIds`.
- `tokens`: `{ name: '--blx-*', value, mode? }`.
- `breakpoints`: widest first; the first is `base` without a width, the rest have a strictly decreasing integer `max-width` in px. Default: `base`, `tablet` 1024, `mobile` 640. An invalid registry produces an `invalid-breakpoints` issue and empty output.
- `COMPILER_VERSION` (written as `/*blx-css:1*/` on the first line). Changing the output for the same inputs requires a new version and migration fixtures.

## Output

```
/*blx-css:1*/
@layer blx.theme,blx.tokens,blx.class.s0.base,...,blx.el.active.modebp;
@layer blx.tokens{...}
@layer blx.el.s0.base{.blx-1a2b3c4d5e6f{color:red}}
@layer blx.el.s0.mode{:where(html[data-theme="dark"]) .blx-...{color:white}@media (prefers-color-scheme:dark){:where(html:not([data-theme="light"]):not([data-theme="dark"])) .blx-...{color:white}}}
```

- **Layers.** The full layer list (42 names) is always declared first, in the order of the ADR key: theme, tokens, then origin (`class`, `el`) x state (`s0`, `hover`, `focus`, `focus-visible`, `active`) x kind (`base`, `bp`, `mode`, `modebp`). Only layers with rules get a block. Precedence comes from this order alone.
- **Specificity (0,1,0) everywhere.** One class per selector; appearance scopes and states live in `:where()`.
- **Class names.** Element: `blx-<12 hex of sha256("<documentId>:<elementId>")>`. Global class: `blx-c-<12 hex of sha256("<classId>")>`. Generated identifiers contain only `[0-9a-f-]`; user text never reaches a selector or layer name. A collision between two elements is detected and reported (`hash-collision`); the second element is not styled.
- **Modes.** Each mode rule is emitted twice: for an explicit `html[data-theme]` and, for `auto`/absent, inside `@media (prefers-color-scheme: dark)` (dark) or `@media not all and (prefers-color-scheme: dark)` (light) with the auto scope. With no JavaScript and no stored preference the system preference applies.
- **Breakpoints.** `@media (max-width:Npx)`, nested inside the mode media query when both apply. Inside a layer, rules are sorted by breakpoint rank (widest to narrowest), then class order, so the last matching rule is the highest key.
- **Tokens.** `:where(:root)` for base values, then light and dark overrides (explicit and auto forms), in layer `blx.tokens`.
- **Declaration order inside a rule.** Custom properties first, then broader before narrower so the narrower setting wins. Border properties are ranked explicitly: `border` < `border-width|style|color` < `border-top|right|bottom|left` < `border-top-width|style|color`. Everything else is ranked by the number of name parts (`margin` < `margin-top`, `flex` < `flex-basis`, `gap` < `row-gap`, `border-radius` < `border-top-left-radius`), then by name.
- **Deduplication and determinism.** Rules with identical layer, breakpoint, class order, mode and declarations share one block with a sorted selector list. Blocks are sorted by a total order, so the output does not depend on where elements sit in the document or on object key order.
- **Unused classes** are not emitted. Rules with unknown breakpoints or an explicit `base`, duplicate (state, mode, breakpoint) combinations (the first rule that has something to emit wins), unknown class ids, repeated class references and duplicate class definitions are reported and skipped (the first definition wins). Class-name hash collisions between elements or between global classes are reported and the later owner is ignored. Non-ASCII ids are reported (`invalid-identifier`), never thrown.
- **Bounds.** At most 1,000 global classes, 1,000 tokens and 256 rules per element or class; extras are ignored and reported. The document limits bound everything else. Callers pass registries that were validated when saved.

## Tests

- Conformance with `tests/fixtures/style-resolution/cases.json` (all element and class cases, with classes attached in reverse order of precedence): the compiled CSS is evaluated by a small cascade evaluator in the tests (`cascade.test-helper.ts`) for explicit themes, `auto` and no `data-theme`, at desktop, tablet and mobile widths. The presence matrix of the four rule layers (16 x 2 modes x 3 viewports) and 1,500 seeded random rule sets in 6,000 random contexts are checked against an independent TypeScript port of the lexicographic key.
- The evaluator refuses any selector or media query outside the compiler's known forms and every selector is checked against a one-class pattern, which is the specificity assertion.
- Mutation checks (done by hand when writing the compiler): swapping the `bp` and `mode` layer order, or sorting by class order before breakpoint, makes tests fail.
- Not yet covered: real-browser computed styles and theme-collision fixtures against third-party unlayered CSS (issue #147; the evaluator above proves ordering and layer logic, not browser behaviour, and it skips the token-origin fixture, which tokens tests cover by hand), the PHP compiler (BWB-027) and the editor canvas.
