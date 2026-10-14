# Design tokens (BWB-026)

Site-wide design tokens (FR-004): colours, font families, font sizes, spacing, radii, container widths and shadows. A preset seeds a token set; from then on the user's set is the canonical, versioned site setting (PRD, ownership). Tokens are live: changing one updates every published page (ADR 0004); `tokenVersion` only invalidates caches.

Two packages share the work because of the package boundaries (ADR 0010):

| Package | Owns |
|---|---|
| `@blixis/wp-design-tokens` | the schema (`TokenSetSchema`, committed as `schema/token-set.schema.json`), names, categories, limits, and the reference **resolver** (aliases, fallbacks, cycles). Depends only on Zod. |
| `@blixis/wp-style-engine` | `validateTokenSet` (hostile-input gate + schema + CSS grammar per category + whole-set rules) and `tokensForCompile`, because it owns the CSS validator and the compiler. |

## Shape

```json
{
  "schemaVersion": 1,
  "tokenVersion": 7,
  "tokens": [
    { "name": "color-primary", "category": "color", "value": "#1a56db", "dark": "#76a9fa", "label": "Primary" },
    { "name": "color-link", "category": "color", "value": "var(--blx-color-primary)" },
    { "name": "space-4", "category": "spacing", "value": "1rem" }
  ]
}
```

- `name`: lower-case words joined by hyphens, 48 characters at most; emitted as the custom property `--blx-<name>`. Unique within the set.
- `category`: `color`, `font-family`, `font-size`, `spacing`, `radius`, `container` or `shadow`. It decides the grammar of the value: the value must be valid for `color`, `font-family`, `font-size`, `row-gap`, `border-top-left-radius`, `max-width` and `box-shadow` respectively (`TOKEN_GRAMMAR`). `url()` and every other forbidden construct are refused by the same validator as style rules (docs/architecture/CSS-VALIDATION.md).
- `value` is the base value (light and mode-independent). `dark` is an optional dark-mode override: modes are sparse, everything else is shared. New sites default to `auto` appearance, so presets ship both values (ADR 0005).
- Values are at most 512 characters and a set at most 500 tokens. Unknown fields are preserved (forward compatibility); reserved keys (`__proto__`, `constructor`, `prototype`) are refused anywhere.
- Font families may use double-quoted plain names (`"Source Sans 3", system-ui, sans-serif`).

## References

A value may refer to other tokens with `var(--blx-name)` (optionally with a fallback), alone (an alias) or inside a longer value (`clamp(var(--blx-space-2), 2vw, calc(var(--blx-space-2) * 2))`). In CSS the reference stays a `var()`, so changing the target updates every user. The resolver (`resolveTokens(set, mode)`, `resolveToken`) substitutes the chain for previews, contrast checks and the PHP side:

- a reference to a token that does not exist is an `unknown-reference` unless it has a fallback (the fallback is used);
- a cycle, in either mode, is a `reference-cycle` on every token of the cycle (dark values can create cycles that light values do not);
- chains deeper than 16 levels are `reference-too-deep`, and a resolved value longer than 8 KiB is `expansion-too-large` (diamond-shaped references cannot blow up: results are memoized and capped);
- a lone alias must point at a token of the same category (`category-mismatch`).

## Validation

`validateTokenSet(input)` returns `{ ok: true, set }` or at most 50 issues with paths such as `tokens[3].dark`. It first makes one inert, bounded copy of the input (getters, Proxies, reserved keys and decimals become issues, never exceptions), then applies the schema, the category grammar to `value` and `dark`, then unique names, references, cycles and category matches.

## Output

`tokensForCompile(set)` gives the compiler `--blx-<name>` values: base values on `:where(:root)` and dark values for an explicit `data-theme="dark"` and for `auto` with a dark system preference, all in layer `blx.tokens` (docs/architecture/CSS-COMPILER.md). Tailwind and `theme.json` mapping belong to the theme issues and read the same set.

## Tests

Schema accept/reject matrix and committed JSON Schema check; reference extraction; alias chains, composite substitution, per-mode values, fallbacks, cycles (including dark-only), depth and size limits, memoized diamonds; end-to-end `validateTokenSet` with a full design system, grammar failures per category, hostile input and the 50-issue cap; compiled output evaluated for explicit light, explicit dark, auto dark and auto light.
