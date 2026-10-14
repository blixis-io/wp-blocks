# Element registry and extension API (v1)

Implements BWB-021 in `packages/element-registry`. The registry is the single list of element types the editor, the REST API and the PHP renderers know. It is also the public registration contract that Plus, Pro and third-party add-ons use (ADR 0009: add-ons depend on this API only). Versioning and compatibility rules for the contract itself are in `VERSIONING-AND-COMPATIBILITY.md`; the current version is `EXTENSION_API_VERSION = 1`.

## Definition

A definition is plain data (no code), validated strictly when registered and frozen afterwards:

| Field | Meaning |
|---|---|
| `type` | `vendor/name`, lowercase (`blixis/heading`, `acme/card`). |
| `version`, `title`, `category` | Definition version, label, and one of `layout`, `content`, `media`, `interactive`. |
| `tier`, `fallback` | `free`, `plus` or `pro`. Paid tiers must declare a fallback class (`static`, `retained`, `unavailable`: ADR 0009 section 3); free elements must not. |
| `requiresApi` | The extension API version needed. Registration fails if it is newer than this software. |
| `props` | Property definitions by id (below). |
| `allowedParents` / `allowedChildren` | Types, categories (`@layout`) and, for parents, `#root` (the page). A nesting is legal only if the parent accepts the child **and** the child accepts the parent. |

Property kinds: `string` (max length), `enum`, `integer` (min, max), `boolean`, `media` (a media-library attachment id) and `url`. Every property is classified (FR-051): **invariant** (stored in `props`, identical in every language), **translatable** (strings only; stored in the translation streams, edited per locale) or **locale-specific** (string, url or media; also stored per locale but never offered for automatic translation, for example a link target). Only invariant properties can be `required` (translated values are checked per language by the translation workflow), and a required property must have a default so a new element can always be created.

## Who may register what

| Source | Namespace | Tier |
|---|---|---|
| core (Builder) | `blixis/` | free |
| Plus add-on | `blixis-plus/` | plus |
| Pro add-on | `blixis-pro/` | pro |
| anyone else | any name that does not start with `blixis` | free |

Registration never throws, even for hostile input (throwing getters, Proxies, reserved keys such as a JSON `__proto__`; the definition is copied once through the same inert snapshot as documents). `source` is a claim of identity the registry cannot verify, so the trusted host assigns it from plugin provenance and gives add-on code only `registry.registrarFor(source)`, never the raw `register` and never a source taken from an add-on payload. `register(definition, source)` returns `{ ok: true }` or every problem found. Duplicates, bad defaults (checked against the property's own validator), impossible ranges, translatable non-strings and reserved namespaces are all rejected.

## Using it

- `registry.canNest(parentType | null, childType)` is the `canNest` hook of the document commands (BWB-022). Unknown parents or children are refused, so the editor cannot build with types it does not know.
- `registry.defaultsFor(type)` splits defaults into invariant `props` and translatable/locale-specific values; `createElement(type, id)` builds a new element with its invariant defaults. The editor writes the translatable defaults into the current locale's translation stream.
- `registry.translationValue(type, property, value)` is the `translationValue` hook of `set-translation` (BWB-104) and the rule behind `checkAgainstRegistry` for stored translations; `registry.localizedProperties(type)` lists the translatable and locale-specific properties. See `TRANSLATIONS.md`.
- `registry.validateProps(type, props)` explains problems with invariant props, including translatable values that were put in `props` by mistake.
- `checkAgainstRegistry(document, registry)` checks a structurally valid document (`validateDocument`) against the registry: illegal nesting, unknown or misplaced properties, invalid values, and translation values for properties that are not translatable. **Unknown element types are only warnings**: the document is preserved unchanged and rendered with the safe fallback, so removing an add-on never destroys content (ADR 0003, ADR 0009).
- `registry.manifest()` is a JSON-only description of all definitions. For the six core elements it is committed as `packages/element-registry/manifest/core-elements.json` (a test fails if it is stale; regenerate with `pnpm --filter @blixis/wp-element-registry manifest:generate`). The PHP side reads the manifest instead of duplicating definitions (renderers: BWB-043, REST `GET /elements`: BWB-041).

## The six core elements

`blixis/section` (page root only; tag), `blixis/container` (in sections and containers; max width), `blixis/heading` (level invariant, text translatable), `blixis/text` (text translatable), `blixis/image` (attachment id and decorative flag invariant, alt text translatable) and `blixis/button` (label translatable, link locale-specific, style and new-tab invariant). Everything except sections lives inside sections or containers; headings, text, images and buttons are leaves.

## Link safety

URL properties are validated by `isSafeUrl`: `http`, `https`, `mailto`, `tel` and relative references only. It rejects every other scheme (`javascript:`, `data:`, `vbscript:`, `blob:`, `file:` ...), protocol-relative `//host`, backslashes, whitespace, control and invisible characters (which browsers drop inside schemes), and character references: named (`&colon;`) and numeric, with or without the closing semicolon (`&#58`), so any `&#` is rejected. Rendering still escapes with `esc_url` (BWB-043); this is the first of two layers.

## Not here yet

Rich text, per-element style schemas and editor controls (BWB-053/054), PHP renderers (BWB-043), the enforcement of the deprecation window (BWB-075), and stale detection (BWB-105).
