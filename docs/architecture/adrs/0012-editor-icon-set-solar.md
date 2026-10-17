# ADR 0012: Editor icon set — Solar

- Status: Accepted (owner decision, 2026-10-15)
- Date: 2026-10-15
- Issues: epic #195
- Deciders: owner

## Context

The editor requires local, tree-shaken icon assets under its strict CSP. Owner selected Solar Icon Set from `@iconify-icons/solar` 2.0.4, under CC-BY-4.0, and explicitly accepted its attribution requirement as a licence policy exception. This replaces ADR 0011's Phosphor choice.

## Decision

Use Solar glyphs from individual `@iconify-icons/solar/<icon>-linear` imports, rendered as inline SVG data by the shared Icon wrapper. The `sidebarClose` and `sidebarOpen` panel controls use the named `sidebar-close-line-duotone` and `sidebar-open-line-duotone` exports as a deliberate duotone exception to the otherwise Linear set. There is no runtime Iconify API or CDN. Solar icons are included unmodified. Build-generated `assets/editor/NOTICE.txt` includes the CC BY 4.0 credit, licence URL, source Figma community URL, and modification status; packaging requires NOTICE in the plugin zip.

Add one exact exception for `npm:@iconify-icons/solar`, version 2.0.4, licence CC-BY-4.0, reason and this ADR reference. It does not change the general distributed allowlist. A package version or declared licence change fails until reviewed.

## Licence assessment

CC BY 4.0 permits adaptation and redistribution with attribution and is compatible with GPLv3 in the direction of combining CC BY 4.0 material into a GPLv3-covered work, subject to CC BY conditions. The plugin is GPL-2.0-or-later and can be combined under GPLv3. This is a reasoned compatibility assessment, not legal advice; interaction between the plugin's GPL-2.0-or-later notice, the CC BY attribution/indication conditions, and downstream redistribution remains a residual uncertainty. The scoped exception records the owner's explicit acceptance of that risk.

## Alternatives considered

- Phosphor (MIT): selected by ADR 0011, superseded by the owner's Solar decision.
- Lucide (ISC): previous set.
- Runtime Iconify API or CDN: rejected because of external runtime dependencies and CSP.

## Consequences

Solar is the consistent Linear style for editor chrome and element-type icons; Bold Duotone is reserved for emphasis if later needed. Semantic names stay centralized in `packages/editor-ui/src/icons/registry.ts`. Phosphor is no longer imported and was removed from the editor-ui manifest; regenerate the lockfile. Notice generation and packaging tests cover the credit. The dependency's CC-BY-4.0 status is monitored by the exact-version exception.

## Test strategy

Test exception scope and version/licence drift, map coverage for all core element types, wrapper semantics, generated NOTICE attribution and required packaging contents. Run the licence checker and editor build.

## Rollback

Remove the Solar imports and exception, restore a reviewed icon set and its matching NOTICE behavior, and supersede this ADR.
