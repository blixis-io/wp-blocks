# ADR 0011: Editor icon set

- Status: Superseded by ADR 0012
- Date: 2026-10-15
- Issues: #196 (BWB-127), epic #195
- Deciders: owner
- Reviewers: pending

## Context

The editor needs a consistent, typed icon API for its toolbar, controls and registered element types. Iconify Solar (CC-BY-4.0) was requested, but `tooling/licenses.json` permits distributed dependencies only when their licence is on the GPL-compatible allowlist. CC-BY-4.0 is not listed; its attribution condition and GPLv2 compatibility are uncertain under the repository policy. The editor previously used Lucide React (ISC).

The Free editor is distributed with the GPL-compatible plugin bundle. Icons must be local assets with no runtime CDN/API so that the editor works under the strict Content Security Policy.

## Decision

Use `@phosphor-icons/react` 2.1.10 under MIT. Import individual named components through a single semantic registry to preserve tree-shaking. Expose them through the shared editor UI `Icon` wrapper, with typed names, size and weight options, decorative-by-default semantics, accessible labels, and opt-in RTL mirroring for directional glyphs. Keep a core element type to icon map beside the icon registry and provide a fallback icon for unknown types.

Remove Lucide React from both editor packages once no imports remain. Include Phosphor's licence text in the generated editor bundle NOTICE, based on the same metafile and package metadata as other shipped dependencies. No icons load from a CDN or external API.

## Alternatives considered

- **Iconify Solar (CC-BY-4.0):** rejected for distribution because the repository does not allow this licence and GPLv2 compatibility is uncertain.
- **Lucide React (ISC):** the previous set; permissive, but replaced to standardize the icon family, provide regular/duotone/fill weights and broaden the available glyphs.
- **Inline SVGs:** rejected because they duplicate icon source and lack a shared typed registry.

## Consequences

The editor UI owns all icon rendering and element icon mapping. Components do not import icon packages directly. Phosphor weights allow consistent regular icons and opt-in duotone or fill emphasis. Named imports constrain bundle contents, and the build-generated NOTICE continues to include licence text for exactly the bundled packages.

## Test strategy

Unit tests cover decorative defaults, accessible labels, opt-in RTL mirroring, compile-time rejection of unknown names, and map coverage of every core element type plus runtime fallback. The editor build verifies generated bundle notices and records the raw byte sizes for JavaScript and CSS. Run the licence checker and package-boundary check.

## Rollback

Remove the wrapper and Phosphor dependency, restore the former Lucide imports and NOTICE fixture expectation, and supersede this ADR if another approved set is selected.

## Open questions

None for the initial Free element registry. Extensions can use the fallback or supply their own icon through a future extension API decision.

## Review log

- 2026-10-15: owner selected Phosphor for BWB-127; licence reasoning and distribution constraints recorded.
