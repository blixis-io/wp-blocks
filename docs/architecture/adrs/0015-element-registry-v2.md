# ADR 0015: Definition-driven element registry v2

- Status: Accepted for implementation under approved issue #273 (BWB-161)
- Date: 2026-10-18
- Deciders: owner

## Context

The current registry is a small, validated TypeScript/PHP contract. `docs/elements` supplies 253 richer definitions with control, rendering, localization, security, asset and archetype metadata. Replacing the existing registry in place would break saved types and property IDs. The new inventory is an additive source of truth; legacy contracts remain readable during migration.

## Decision

The generator validates every definition against `schemas/element-definition.schema.json`, checks its catalog identity and emits a versioned manifest, palette catalog, TypeScript ID union and Solar icon report. Generated output is committed and must pass `pnpm check:elements`. `sync:plugin-manifest` copies the PHP-consumed generated manifest into the distributable data directory.

Definitions are data. An archetype renderer implements safe behavior shared by compatible elements; a definition supplies semantic tag options, property constraints, defaults and controls. An element is insertable only when status is `ready`; `planned` remains discoverable in the development palette when `showPlannedElements` is enabled. Tier is displayed metadata and never disables existing saved output. PHP exposes `blixis_builder_element_entitlement`; editor integrations expose an equivalent filter whose default is `available`. Server enforcement of restricted editing is a later phase.

Each instance has `{ id, type, props, styles, children }`. `type` resolves to a definition, and props are checked for declared type, enum, bounds, required/default behavior, localization and `editorOnly` exclusion from frontend output. Unknown legacy content is retained and safely falls back; it is never silently discarded. Unsafe HTML is never accepted. URL, class, id, semantic tag, asset reference, style and motion values use explicit allowlists; media resolves only through manifest references and WordPress attachments. Motion honors reduced-motion preferences.

Existing namespaced types such as `blixis/heading` resolve from the definition id `heading` and namespace `blixis`. Property aliases are handled at the compatibility boundary and documented in `ELEMENT-REGISTRY-V2.md`; stored documents are not rewritten implicitly. Definition-only changes do not bump document schema. A breaking stored contract change increments `definitionVersion`, adds an explicit append-only migration and fixtures, and preserves old aliases for reads.

## Alternatives considered

- Replace the old registry and rename stored properties: rejected because it breaks persisted documents and presets.
- Treat subscription tier as a runtime render gate: rejected because saved pages must keep rendering after entitlement changes.
- Implement each catalog item with custom UI and renderer code: rejected; the remaining catalog must primarily add data and reuse archetypes.

## Consequences

Two definition versions coexist until compatibility coverage is complete. Generated artifacts are checked in for deterministic PHP packaging. Missing Solar IDs are reported and resolved through deterministic fallbacks; Solar attribution remains required by ADR 0012.

## Security

Renderers escape text and attributes, never emit author-supplied HTML, validate links with `SafeUrl`, apply `rel="noopener noreferrer"` to `_blank`, and restrict output tags/attributes. IDs/classes are normalized. Responsive CSS is compiled only from registered tokens and bounded values. Asset resolution is local and manifest-scoped.

## Test strategy

Schema validation and freshness checks run in CI; TS and PHP validate shared instance fixtures. Tests cover aliases, hostile values, unknown definitions, entitlement defaults, render safety, generated palette status, icon fallback and template importability. Full WordPress and browser smoke tests run in the provided environments.

## Rollback

Remove v2 consumers while retaining generated source artifacts and the original registry. No stored document migration is required to disable v2 reading because legacy type/property aliases remain supported.
