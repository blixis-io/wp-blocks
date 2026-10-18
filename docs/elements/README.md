# Blixis Element Registry — proposed v1

This package contains **253 standalone element-definition JSON files** across **9 categories**, plus schema, a searchable catalog and an example tree. It is an **architecture/design inventory**, not working PHP/React renderers and not a claim that every conceivable element has been enumerated.

## Subscription catalog

| Tier (minimum) | Element definitions |
|---|---:|
| Free | 93 |
| Plus | 103 |
| Pro | 57 |

Plus includes Free. Pro includes Plus and Free. Tier assignment is a **recommendation**; sync with approved licensing PRD before release. Do not lock reading/rendering existing saved content when a subscription lapses. Enforce restricted editing/actions server-side.

## Directory layout

- `elements/<category>/<element>.json` — individual element definitions
- `catalog.json` and `catalog.csv` — index and tier mapping
- `schemas/element-definition.schema.json` — Draft 2020-12 structural validation schema
- `schemas/shared-types-and-styles.json` — inherited CSS inspector contracts, common types, precedence, controls
- `examples/template-element-tree.json` — example element tree (instance data, not a definition)
- `scripts/validate.py` — validation and consistency checker
- `PROMPT-FOR-CODEX-CLAUDE.md` — handoff prompt

## Differences: definitions vs template files

Definitions describe *what an element can do*: properties, defaults, editor controls, rendering, tier, responsiveness, dark mode, locale behavior, interaction, tests. Templates contain *instances*: `{id,type,props,styles,children}`. A template references registry type IDs rather than repeating definition specs. Existing example templates in `blixis-template-examples.zip` should be normalized against this catalog before implementation; their JSON format is not automatically compatible with all the proposed options.

## Iconify / Solar

Icons are recorded as `solar:<icon-name>` and point to the [Solar set](https://icon-sets.iconify.design/solar/). Solar is CC BY 4.0 (attribution required). The file names are **candidate identifiers**: validate *every icon* against a pinned installed `@iconify-json/solar` version before use. The checker provides optional verification against a local Solar icon JSON. Never ship missing icon IDs silently. Do not bundle the icon pack itself into this ZIP.

## References/inspiration

- shadcn/ui component index: https://ui.shadcn.com/docs/components
- Interior component catalog: https://www.interior.dev/docs
- Iconify Solar: https://icon-sets.iconify.design/solar/

The `origin` field identifies *concept inspiration*, not direct source reuse. Interior is focused on **micro-interactions** (e.g., hold to confirm, split/reveal text, loading state, sortable lists), so this catalog includes both classic site elements and interaction primitives. Any copied source code requires separate license checks. GSAP integration is **optional and blocked pending suitability/licensing review for visual animation authoring products**.

## Implementation warnings

- UI widgets like dialog, select, chart and date picker need actual accessible behavior; JSON alone cannot implement them. Use shadcn/ui/Radix in **editor** where useful; front-end should progressively enhance PHP-rendered markup.
- `exampleInstance` is illustrative; `props` and style values are not enforced by the structural schema. Define the **instance schema** and property-type validators before implementing import endpoints.
- WordPress network endpoints must validate authorizations, signatures/checksums of templates, remote asset URLs, uploads, embeds and query permissions.
- Avoid emitting inline executable HTML/JS from templates.
- All text localization, text marks and translations should preserve stable element IDs.
- Respect prefers-reduced-motion: never hide final content when disabled.

## Validate

`python scripts/validate.py`

For icon verification: `python scripts/validate.py --solar-json node_modules/@iconify-json/solar/icons.json` (if installed; can also point to a complete Iconify solar JSON from your dependency).

**Important:** expect icon QA failures until aliases/names are checked against the pinned Solar version.
