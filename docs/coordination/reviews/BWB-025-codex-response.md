## BWB-025 review

**Blocker:** None found for validated inputs.

**Major**

- [resolve.ts](packages/style-engine/src/resolve.ts:74) accepts a rule with `breakpoint: 'base'` as a breakpoint-layer rule because `base` is in the registry. [compile.ts](packages/style-engine/src/compile.ts:219) rejects that same rule. This can make the public resolver and emitted CSS disagree. **Fix:** reject explicit `base` in the resolver, or validate rules before resolution, and add a parity test.

**Minor**

- [breakpoints.ts](packages/style-engine/src/breakpoints.ts:39) accepts zero and negative viewport widths as matching every breakpoint; `NaN` yields only `base`. These are outside meaningful viewport inputs, but the exported helpers silently return plausible results. **Fix:** define and enforce the accepted width range, with tests. Fractional widths behave correctly: `640` matches mobile; `640.5` does not, matching `@media (max-width:640px)`.
- [BREAKPOINTS-AND-STATES.md](docs/architecture/BREAKPOINTS-AND-STATES.md:20) says breakpoint order is fixed, while validation accepts a base-only registry and arbitrary ordered IDs. **Fix:** clarify whether “fixed” means fixed *within a supplied registry* or fixed IDs and positions; enforce the latter if intended.
- [BREAKPOINTS-AND-STATES.md](docs/architecture/BREAKPOINTS-AND-STATES.md:40) describes inheritance as coming from the next wider rule and says a state inherits from the non-state value. The source can instead be another active state or a different origin, according to the full key. **Fix:** describe inheritance as falling through to the next matching rule for that property; use wider breakpoint and non-state as examples.
- [resolve.test.ts](packages/style-engine/src/resolve.test.ts:209) does not directly test an exact state override, a mode target with only a mode-independent rule, a class rule at the exact target, or an exact rule missing the inspected property. Its “reset” test removes the entire element rule; [inspectProperty](packages/style-engine/src/resolve.ts:180) only reads values and performs no deletion. **Fix:** test those targets and deletion of one declaration while preserving other declarations in its rule. Phrase the documentation’s reset statement as required edit behavior until that operation exists.

**Agreements**

For valid rules and contexts, `keyOf` compares origin, state, layer, breakpoint rank, then class order as ADR 0005 specifies. Multiple active states follow the fixed state order, regardless of list order. Unknown rule breakpoints do not match; an unknown context breakpoint still permits unqualified rules, so callers need a valid context. `mode: undefined` gives a useful mode-independent inspector view, and `Object.hasOwn` prevents inherited declarations, including prototype-named properties, from becoming candidates. Numeric values become strings. `inspectProperty` marks a value overridden only when its winning source is the element rule at the exact target.

Moving validation and defaults out of `compile.ts` preserved their implementation and public exports. Using the resolver as the compiler test oracle is reasonable for valid class and element rules: the hand-derived fixtures and Python verifier provide separate checks. It is not complete coverage of the contract. A mutation affecting only token-origin resolution, invalid contexts, or the untested inspector targets could still pass; the compiler’s random comparison excludes token rules.

**Verification limits**

The branch remained clean. The style-engine tests passed (361 tests), typecheck passed, and the offline fixture verifier reported no failures. I did not verify browser computed styles, PHP parity, or actual inspector reset editing; those are not established by these checks.