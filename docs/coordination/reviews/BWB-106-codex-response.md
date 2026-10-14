## Review of BWB-106

**No blocker found.** The branch computes light and dark values from one token set. The inspected compiler gives each styled element one class; it does not copy elements, classes, or element rules per mode.

### Major findings

- [modes.ts](packages/design-tokens/src/modes.ts:65): `resolveExpression` inserts a probe token and consumes one level of the 16-token reference limit. A valid 16-token chain resolves in `resolveModes` but returns `reference-too-deep` as an expression. Resolve the expression without counting a synthetic token toward token depth; add a depth-16 regression case.

- [modes.ts](packages/design-tokens/src/modes.ts:22): `resolveModes` silently accepts duplicate names. `resolveTokens` uses the first definition, while `overrides` scans all definitions; a later duplicate can therefore appear in `overrides` even though it has no effect, with no issue reported. Report `duplicate-name` and derive overrides from the definitions actually resolved, or require a validated set.

- [graph.ts](packages/design-tokens/src/graph.ts:65): cycle detection includes references inside unused fallbacks. `a = var(--blx-b, var(--blx-a))`, `b = red` is reported as a cycle although the fallback is not used. Build cycle edges according to the reference that resolution will take. This predates the branch but affects its mode results.

### Minor findings

- [modes.ts](packages/design-tokens/src/modes.ts:61): the probe avoids *defined* name collisions, but can satisfy an otherwise unknown reference in an unvalidated set and change the reported issue. A resolver that does not insert a token fixes this too.
- [modes.test.ts](packages/style-engine/src/modes.test.ts:60): the CSS evaluator covers the fixture’s simple `var(--name)` aliases, including a nested alias, and its explicit and `auto` contexts. It does not model whitespace, fallbacks, composite substitutions, invalid computed values, or browser computed styles. Add a browser test and representative complex values; narrow the “like a browser” claim in [DESIGN-TOKENS.md](docs/architecture/DESIGN-TOKENS.md:60). `resolveExpression` also resolves text without checking whether it is a valid CSS value; document that boundary or validate at its caller.

### Agreements and test strength

Exact string equality is the right **conservative** sparse rule. If both values are `var(--blx-b)`, dropping dark preserves the alias in both modes, so a dark override of `b` still flows through. Resolved equality or case/whitespace normalization could discard a deliberate dark value that needs to stay fixed when its target changes later.

The emitted base is `:where(:root)` in `blx.tokens`; dark overrides have explicit and dark-system `auto` forms. Light is the base in the token schema, so a dark-only token or dark-first base cannot arise through this API. The compiler can emit explicit and `auto` light overrides for direct `TokenValue` inputs, but BWB-106’s end-to-end fixture does not exercise that path.

The existing tests would catch removal of sparse emission, a missing alias in `differing`, and broken dark selectors or dark `auto` queries for this fixture. They would still pass if the compiler’s **light override `auto` branch** were removed, because `tokensForCompile` supplies no light overrides.

Targeted tests passed: design tokens **41/41** and style engine **416/416**. I did not verify real-browser computed styles, PHP compiler parity, or editor canvas behavior. The working tree remained clean.