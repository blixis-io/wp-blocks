# Handoff: independent review of BWB-025 (breakpoints and pseudo-state rules)

READ-ONLY, offline. Branch `feat/25-breakpoints-and-states`. Read: `docs/architecture/BREAKPOINTS-AND-STATES.md`, ADR 0005 section 1 and 2, `packages/style-engine/src/breakpoints.ts`, `resolve.ts`, `resolve.test.ts`, the changed parts of `compile.ts` and `compile.test.ts` (the compiler tests now use `resolveProperty` as their oracle), `tests/fixtures/style-resolution/cases.json`, `packages/core/src/schema/style.ts` and `primitives.ts`.

Questions:
1. Does `resolveProperty` implement the ADR 0005 key exactly (origin, state, layer, breakpoint rank, class order)? Check `keyOf`, `greater`, `matches` for: a rule whose breakpoint is not in the registry, a context breakpoint not in the registry, `mode: undefined` context (mode-independent view), states given as a list, rules with several matching states (ordering among active states), numeric values, prototype-named properties, rule objects with inherited properties (`Object.hasOwn`).
2. `inspectProperty`: is "overridden" correct (own element rule exactly at the target)? Cases: target with state, target mode but only a base rule, a class rule at the exact target, a rule at the target that does not set the property but a lower element rule does, deletion semantics ("reset deletes the declaration"). Is the target's context (mode undefined means no mode rules) the right model for the inspector given ADR 0005 section 2 ("mode rules are sparse, everything else inherits from the mode-independent value")?
3. Breakpoints: `validateBreakpoints`, `breakpointsMatching`, `viewportBreakpoint` boundary behaviour (width equal to max-width, fractional widths, zero or negative widths, NaN). Consistent with the compiler's `@media (max-width:Npx)`? What about fractional pixel viewports (e.g. 640.5)?
4. Does moving the breakpoint code out of `compile.ts` change any behaviour? Is the public API surface (index.ts) consistent? Anything exported that should not be?
5. Test adequacy: fixtures including token origins, invalid list, random order-independence, owner example. Which mutations of `keyOf`/`matches`/`inspectProperty` would still pass? Is using the resolver as the compiler's oracle sound or circular (same author, same ADR)?
6. Documentation: does BREAKPOINTS-AND-STATES.md keep precedence and inheritance separate and match the code? Anything in it that the ADR does not say or that contradicts it?

Output: Blocker/Major/Minor with file + fix wording; agreements; what you could not verify.
