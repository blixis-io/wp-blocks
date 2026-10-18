# Element Registry v2

## Data flow

`docs/elements/elements/**/*.json` is the authored catalog. `tooling/elements/generate.mjs` validates each file and produces the committed TS manifest (`packages/element-registry/manifest/element-definitions-v2.json`), PHP manifest (`wordpress/plugin/data/element-definitions-v2.json`), palette catalog, type unions and icon mismatch report. It copies the catalog archetype into each generated definition because archetype is an index field in `catalog.json`, not a definition-schema field. CI freshness is checked with `pnpm check:elements`.

| Layer | Contract |
| --- | --- |
| Authored definition | Definition schema v1; property types, defaults, required/localizable/editor-only flags, controls, archetype, structure, style and security metadata |
| Generated registry manifest | All 253 definitions, fully qualified type (`blixis/<id>`), tier metadata, `ready`/`planned` status |
| TypeScript | Generated `GeneratedElementId` and `GeneratedElementType`; editor runtime integration remains a follow-up slice |
| PHP | Distributable generated JSON plus validated registry metadata; renderers resolve an archetype with safe fallback |
| Palette | Category, title, icon, tier badge, search keywords and status; planned items are opt-in in development |

## Archetypes

Archetypes are renderer families, not serialized element types. Catalog counts:

| Archetype | Count | Archetype | Count |
| --- | ---: | --- | ---: |
| accordion | 2 | alert | 7 |
| animation | 19 | audio | 1 |
| button | 15 | calendar | 3 |
| card | 6 | carousel | 4 |
| chart | 2 | choice | 7 |
| code | 2 | command | 1 |
| container | 16 | countdown | 1 |
| counter | 4 | datatable | 4 |
| dynamic | 20 | embed | 5 |
| filter | 4 | form | 10 |
| gallery | 6 | icon | 4 |
| image | 11 | input | 18 |
| link | 1 | list | 3 |
| loop | 5 | lottie | 1 |
| map | 1 | navigation | 15 |
| overlay | 9 | pagination | 2 |
| parallax | 2 | product | 1 |
| progress | 5 | range | 3 |
| rating | 2 | richtext | 9 |
| simple | 4 | steps | 4 |
| tabs | 2 | text | 5 |
| toggle | 3 | upload | 2 |
| video | 2 | | |

The list and counts are derived from `catalog.json`; the current catalogue has fewer than the 47 archetypes stated in the original request. No archetypes were invented to fill the count. P1 rendering accepts the `simple` archetype and honors the layout definitions' allowlisted semantic tag, bounded HTML id, escaped accessible label, and hidden state. A separator emits a native horizontal rule and a spacer remains non-semantic. Section, container, grid, columns, stack, row, flex, aspect-ratio, scroll-area, sticky-container, split-layout, div, spacer and separator are insertable in the editor. Scroll areas expose a labeled keyboard-focusable region with bounded overflow and height controls. Sticky containers emit scoped sticky positioning with a validated 0–200 pixel top offset. Split layouts render two equal columns and stack them on mobile. The style inspector exposes compiler-validated aspect-ratio, flex, grid, overflow and positioning choices only when declared by that element, with responsive overrides. Resizable panels and marquee motion remain planned until their element-specific contracts are implemented.

The P2 renderer also emits escaped ordered/unordered list items, allowlisted language labels for static code blocks, guarded links with safe target/rel behavior, static numeric counters, script-free SVG progress rings, and semantic `<mark>` content for highlight text. Lists, links, paragraphs, rich-text elements, eyebrows, blockquotes, badges, button groups, counters, progress rings, highlight text, and table of contents are insertable with generated inspector controls. Button groups render as a labeled `role="group"` container. Table of contents renders the authored nested links as a labeled navigation landmark; its default label is “On this page.” Counter values are escaped and non-finite values fall back to 42; count-up animation remains planned. Progress rings clamp their values and expose `role="progressbar"` with accessible value attributes. Static code output is available for saved elements but remains planned in the palette until its copy behavior is implemented. Rich-text semantic tags come from each definition’s tag allowlist; blockquotes default to `<blockquote>`, and invalid tag values fall back to the definition default.

For P3, image aliases resolve through the existing raster-image asset boundary, optional captions are escaped, and galleries render only resolved image references with bounded item/column counts. Native video/audio rendering accepts attachment IDs only through a separate resolver and explicit MIME allowlists; author-supplied URLs and unapproved media types fall back to an empty media placeholder. The editor picker and caption-track workflow remain incomplete, and third-party embeds require a provider security contract.

P4 adds renderer fallbacks for the catalog's navigation item structures, semantic breadcrumb trails, bounded numeric/previous-next/load-more pagination links, native `<details>` accordion disclosures, linked tab sections that keep all content available without JavaScript, and ordered step lists with an `aria-current="step"` marker. Static breadcrumbs, pagination, and step lists are insertable with generated controls. The disclosures and linked sections preserve content when scripting is disabled; full tab switching, single-open accordion enforcement, and overlay interactions remain planned.

P4 also exposes a localized title/description repeater for the existing step renderer and the static timeline element. Both use the same ordered-list output and mark the active step with aria-current.

P5 adds static semantic output for alerts/live regions, native progress indicators with clamped values and optional percentage labels, decorative skeleton/spinner markers, empty-state content, keyboard shortcut text with native kbd markup, and attachment-backed avatar images with localized alt text. Alerts, progress, skeletons, spinners, empty states, keyboard shortcuts, and avatars are insertable with generated controls. Avatar groups render attachment-backed images; their lightbox behavior and insertable controls remain planned. Dismiss, toast timing, choice/input behavior, charts, and other interactive UI components remain planned until their editor and enhancement contracts exist.

P7 exposes post title, plain-text content/excerpt, date, author, category names, and site tagline as insertable static elements. They resolve only the current WordPress context, escape the result, and use the authored fallback when no value is available. Binding metadata is never evaluated as code. Query loops, user/meta-selected fields, filters, and provider embeds remain planned pending bounded query and permission contracts.

P6 form submission and file upload remain planned: the catalog does not define a REST route, nonce/capability model, data-retention policy, spam provider, or upload destination contract. P8 commerce behavior remains planned and requires an installed WooCommerce adapter; no cart, checkout, or payment behavior is synthesized by the core renderer. P9 animation elements remain planned; preserve reduced-motion defaults and ADR 0013's GSAP distribution limits when adding progressive enhancement.

## Instance and compatibility contract

An instance is `{ id, type, props, styles, children }`. IDs are stable. Definition properties supply validation type, enum/options, bounds, defaults, required status, `localizable`, `editorOnly`, and a control. Array validation recursively applies the declared item type in TypeScript and PHP, including attachment-backed `array<asset-ref>` values. Translatable data stays in locale content streams. `editorOnly` values are excluded from saved frontend props. Unknown types/properties round-trip for forward compatibility and render through the static safe fallback.

Type ids map by namespace (`heading` definition ↔ `blixis/heading` saved type). `ElementDefinitionRegistry` resolves the template compatibility ids below without rewriting stored documents. `CoreDocumentRenderer` uses v1 renderers and content contracts for existing v1 element types, and definition metadata plus safe static renderers for the template types. These read aliases are not destructive migrations.

| Legacy saved prop | Definition prop | Compatibility policy |
| --- | --- | --- |
| `blixis/heading.props.text` and content-stream `values.text` | `heading.content` | One read alias maps legacy `text` to canonical `content`; legacy inspector writes `text`, v2 inspector writes `content` |
| `blixis/heading.props.level` | `heading.tag` | Existing v1 renderer maps levels 1–6; template tags are restricted to `h1`–`h6` |
| `blixis/text.props.text` and content-stream `values.text` | `text.content` | One read alias maps legacy `text` to canonical `content`; legacy inspector writes `text` |
| `page` | `stack` | Template compatibility type alias; renders as a safe main wrapper |
| `navigation` | `navigation-menu` | Template compatibility type alias; repeater labels and URLs are escaped/guarded |
| `site-header` | `sticky-header` | Template compatibility type alias |
| `site-footer` | `stack` | Template compatibility type alias |
| `section.props.semanticTag` | `section.semanticTag` | Definition enum allowlist controls the emitted tag |
| `container.props.maxWidthToken` | `container` | Kept as a bounded token identifier; no raw CSS value is emitted |
| `image.props.assetRef` | `image.assetRef` | Resolves only through imported attachment metadata `_blixis_template_asset_ref`; never interpreted as a URL |

| `blixis/button` content-stream `values.text` | `button.label` | Legacy content `text` is read as the canonical label; the legacy inspector writes the established `label` key |
| `button.target` | `button.target` | Only `_self` and `_blank`; `_blank` emits `noopener noreferrer` |
| `container.maxWidthToken` | `container.maxWidthToken` | Bounded identifier only; never emitted as raw CSS |
| `blixis/container.props.maxWidth` | `container.maxWidth` | Legacy width preset (`narrow`, `default`, `wide`, `full`) only; renderer clamps to a supported preset |
| `columns.ratios` | `columns.ratios` | Numeric ratio list, validated as a list |
| `columns.stackAt` | `columns.stackAt` | Breakpoint identifier |
| `grid.columns` | `grid.columns` | Desktop/tablet/mobile count object |
| `grid.gapToken`, `row.gapToken`, `stack.gapToken` | Same names | Bounded token identifiers |
| `card.variant` | `card.variant` | Definition enum includes bundled `surface` value |
| `heading.content/tag` | `heading.content/tag` | Content is escaped; tag is restricted to h1–h6 |
| `image.fit/loading` | Same names | Enumerated values only |
| `navigation.items` | `navigation.items` | Bounded list; labels escaped, links URL guarded |
| `section.variant` | `section.variant` | Plain value; semantic tag is separately allowlisted |
| `site-header.sticky` | `site-header.sticky` | Boolean only |
| `site-logo.assetRef/link` | Same names | Asset key resolves through imported media metadata; link URL guarded |
| `text.content` | `site-title.content` | Compatibility type alias; content is escaped |

CSS declarations still go through the existing CSS property allowlist, including `gap`, `grid-template-columns`, `row-gap` and `column-gap`.

The read alias table is implemented in `ElementDefinitionRegistry`; `ContentResolver` and the definition-driven renderer use that shared alias metadata. The editor applies the matching write-key mapping for legacy ids and writes only one property key. Legacy ids `blixis/heading`, `blixis/text`, `blixis/button`, `blixis/image`, `blixis/section`, `blixis/container` retain their established property names. Any additional alias discovered in real templates must be added here with fixtures before the v2 adapter consumes it.

## Archetype and safety rules

PHP dispatches to an `ArchetypeRenderer` by definition archetype and falls back to escaped static content for unsupported renderers. Renderers may emit only definition-allowed semantic tags and attributes. Text always uses `esc_html`; attributes use `esc_attr`; links and media use validated URL/media resolvers. `_blank` adds `noopener noreferrer`. There is no raw HTML property or renderer path. IDs/classes are constrained, CSS declarations go through the existing style compiler, and asset refs resolve only inside a bundled pack manifest or WordPress media library. Reduced-motion rules preserve visible final content.

## Entitlement and status

Tier is metadata. `blixis_builder_element_entitlement` and its editor-side equivalent default to `available`; neither controls saved-content rendering. Server-side restrictions on editing/additional actions are applied later. Planned elements are not insertable by default and appear in a dev-only planned group with `showPlannedElements`.

## Versioning

Definition editorial changes that do not alter instance values retain `definitionVersion`. A changed stored property contract increments it and adds an append-only migration plus old/new fixtures. Document `schemaVersion` changes only when the persisted envelope itself changes. Readers preserve unknown fields; migrations never discard them silently.

## Known catalog inconsistencies

- The original prompt says 47 archetypes; generated counts are authoritative and report the actual distinct total shown above.
- `page`, `navigation`, `site-header`, `site-footer`, and `text` are compatibility ids rather than definition ids.
- The `card.variant` definition now includes the bundled `surface` value. Responsive `grid.columns` is represented by a desktop/tablet/mobile object for the compatibility adapter; the editor control is part of the later inspector slice.
- Bundled WooCommerce template IDs `woocommerce-cart-link` and `woocommerce-product-grid` map to the catalog's `cart-icon` and `product-grid` definitions for validation and round-trip preservation. Their provider behavior is still deferred; without a renderer they emit the safe static fallback and retain their data for later WooCommerce support.
- `examples/template-element-tree.json` uses proposed instance fields; it is not proof of runtime compatibility.
- `definitionVersion` is fixed to `1.0.0` by schema; breaking evolutions require schema and generator coordination.
- Icon candidates need exact validation against the installed Solar package. Current mismatches are committed at `docs/elements/reports/icon-mismatches.json`.
