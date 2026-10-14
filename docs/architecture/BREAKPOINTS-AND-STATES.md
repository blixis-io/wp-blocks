# Breakpoints, states and style resolution (BWB-025)

ADR 0005 decides the rules; this document describes how they are implemented in `@blixis/wp-style-engine` (`breakpoints.ts`, `resolve.ts`) and keeps **precedence** and **inheritance** apart, as the ADR requires.

## How a rule is stored

A style rule (`StyleRule`, docs/architecture/DOCUMENT-SCHEMA.md) has optional `breakpoint`, `mode` (`light` | `dark`) and `state` (`hover` | `focus` | `focus-visible` | `active`) plus `declarations`. Which of the three are present decides the rule's **layer**:

| Fields present | Layer |
|---|---|
| none | `base` |
| `breakpoint` | `bp` |
| `mode` | `mode` |
| `mode` and `breakpoint` | `modebp` |

"Base" is expressed by leaving `breakpoint` out; the id `base` is not valid in a rule. Two rules of one owner with the same (state, mode, breakpoint) are a validation error: merge their declarations.

## Breakpoints

A breakpoint registry lists `base` first (no width) and then narrower breakpoints with strictly decreasing integer `max-width` values (`DEFAULT_BREAKPOINTS`: `tablet` 1024px, `mobile` 640px). Within a registry the order is fixed (widest to narrowest, `base` first); the ids and widths are configurable. `validateBreakpoints` checks a registry, `breakpointsMatching(list, width)` returns the ids a viewport width matches and `viewportBreakpoint(list, width)` the narrowest one (what the editor's viewport switcher shows).

Breakpoints are **nested**, not exclusive: a 400px viewport matches `base`, `tablet` and `mobile`. A rule for a breakpoint therefore applies at that width and below.

## Precedence (which rule wins)

For one property in one context (mode, breakpoint, active states) the matching rule with the highest key wins, compared in this order (ADR 0005 section 1):

1. origin: token < class < element
2. state: none < hover < focus < focus-visible < active
3. layer: base < bp < mode < modebp
4. breakpoint: wider < narrower
5. class order: position in the site-wide global class list (later wins; only for classes)

Source order never decides. So **dark beats mobile**, and a `dark + mobile` rule beats both. Worked example (owner decision): base black, mobile gray, dark white, dark+mobile light gray gives light desktop black, light mobile gray, dark desktop white, **dark mobile light gray**, and without the dark+mobile rule dark mobile is white.

`resolveProperty(rules, property, context, breakpoints?)` is the reference implementation (`Resolved = { value, source }`). `resolveStyle` does it for every property and `rulesFor(element, classes)` collects an element's own rules and its classes' rules (classes ordered by the global list, never by the element's `classIds`). The compiler (docs/architecture/CSS-COMPILER.md) is tested against this resolver.

## Inheritance (what the inspector shows)

Rules are sparse: a rule sets only the properties it changes, and every other property falls through to the next matching rule that sets it (the next key down in the precedence list above). In the inspector the usual sources are:

- A narrower breakpoint inherits every property it does not set from the next wider matching rule, within the same mode layer.
- A mode rule inherits from the mode-independent value; the mode-independent view (`mode` undefined) only ever sees rules without a mode.
- A state rule inherits from the non-state value.

`inspectProperty(rules, property, target)` answers for an edit target (`breakpoint`, `mode`, `state`, all optional): the value that applies there with its source, and `overridden`, which is true only when the element has its own rule exactly at that target. Otherwise the UI says "inherited from `<source>`" (a wider breakpoint, the mode-independent value, a class, another state). Resetting an override must delete that declaration from the rule (and the rule when it becomes empty), through the style commands of BWB-022; `inspectProperty` only reads. The value then falls back to the inherited one.

## States

`hover`, `focus`, `focus-visible` and `active` are selected through `:where()` so they add no specificity, and a state rule only matches while the state is active. A state outranks the layer, so hover beats the non-hover value even when the non-hover value comes from a `dark + mobile` rule; to change the hover colour in dark mobile, add a `dark + mobile + hover` rule. Touch devices and the relative order of `focus-visible` and `hover` are an open question in ADR 0005.

## Tests

`resolve.test.ts` runs every case of `tests/fixtures/style-resolution/cases.json` (token origins included, which the compiler tests skip), the invalid-combination list, order-independence on seeded random rule sets, the owner example per inspector target, class precedence and breakpoint registries. The compiler tests use the same resolver as their oracle in 6,000 random contexts.
