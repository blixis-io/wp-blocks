# Element Registry v2

## Data flow

`docs/elements/elements/**/*.json` is the authored catalog. `tooling/elements/generate.mjs` validates each file and produces the committed TS manifest (`packages/element-registry/manifest/element-definitions-v2.json`), PHP manifest (`wordpress/plugin/data/element-definitions-v2.json`), palette catalog, type unions and icon mismatch report. It copies the catalog archetype into each generated definition because archetype is an index field in `catalog.json`, not a definition-schema field. CI freshness is checked with `pnpm check:elements`.

| Layer | Contract |
| --- | --- |
| Authored definition | Definition schema v1; property types, defaults, required/localizable/editor-only flags, controls, archetype, structure, style and security metadata |
| Generated registry manifest | All 253 definitions, fully qualified type (`blixis/<id>`), tier metadata, `ready`/`planned` status |
| TypeScript | Generated `GeneratedElementId` and `GeneratedElementType`; the editor runtime registers every generated definition marked `ready` and excludes every definition marked `planned` |
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

The list and counts are derived from `catalog.json`; the current catalogue has fewer than the 47 archetypes stated in the original request. No archetypes were invented to fill the count. P1 rendering accepts the `simple` archetype and honors the layout definitions' allowlisted semantic tag, bounded HTML id, escaped accessible label, and hidden state. A separator emits a native horizontal rule and a spacer remains non-semantic. Section, container, grid, columns, stack, row, flex, aspect-ratio, scroll-area, sticky-container, split-layout, resizable-panels, marquee-layout, div, spacer and separator are insertable in the editor. Scroll areas expose a labeled keyboard-focusable region with bounded overflow and height controls. Sticky containers emit scoped sticky positioning with a validated 0–200 pixel top offset. Split layouts render two equal columns and stack them on mobile. Resizable panels render direct children as flex panes with keyboard- and pointer-operable native separators; their progressive enhancement is omitted on narrow screens, where panels stack in source order. Marquee layout uses an inert, ID-free duplicate track for smooth motion, offers an explicit pause/resume button, and disables movement and the clone for reduced-motion preferences. The style inspector exposes compiler-validated aspect-ratio, flex, grid, overflow and positioning choices only when declared by that element, with responsive overrides.

The P2 renderer emits escaped ordered/unordered list items, allowlisted code with optional token styling and line numbers, and guarded links with safe target/rel behavior. It includes static counters, script-free SVG progress rings, semantic `<mark>` content, inline Solar icons from a fixed allowlist, icon lists and buttons, gradient text built only from bounded hex stops, and keyboard-focusable tooltip text. Countdown timers update progressively on the public page, code blocks expose copy controls only when the clipboard runtime is available, and animated headlines honor reduced-motion preferences. Button groups render as a labeled `role="group"` container. Table of contents renders authored nested links as a labeled navigation landmark; its default label is “On this page.” Counter values are escaped and non-finite values fall back to 42. Progress rings clamp their values and expose `role="progressbar"` with accessible value attributes. Rich-text semantic tags come from each definition’s tag allowlist; blockquotes default to `<blockquote>`, and invalid tag values fall back to the definition default.

For P3, image and picture elements resolve raster assets through the existing media boundary, with responsive `srcset`/`sizes` support and escaped optional captions. Before/after comparisons require two resolved images and provide a static side-by-side fallback plus a progressive, keyboard-operable range control. Galleries render only resolved image references with bounded item/column counts. Gallery and lightbox elements use the permission-aware media picker; responsive grid styling keeps a static image list, while lightbox links retain a direct-image fallback and progressively open an accessible native dialog. Native video/audio rendering accepts attachment IDs only through a separate resolver and explicit MIME allowlists; author-supplied URLs and unapproved media types fall back to an empty media placeholder. Caption-track editing and third-party embeds remain incomplete pending their accessibility and provider security contracts.

P4 adds renderer fallbacks for the catalog's navigation item structures, semantic breadcrumb trails, bounded numeric/previous-next/load-more pagination links, native `<details>` accordion disclosures, linked tab sections that keep all content available without JavaScript, and ordered step lists with an `aria-current="step"` marker. Static breadcrumbs, pagination, and step lists are insertable with generated controls. The disclosures and linked sections preserve content when scripting is disabled; full tab switching, single-open accordion enforcement, and overlay interactions remain planned.

P4 also exposes a localized title/description repeater for the existing step renderer and the static timeline element. Both use the same ordered-list output and mark the active step with aria-current.

P5 renders native controls and accessible static fallbacks for alerts/live regions, progress indicators, skeletons/spinners, empty states, keyboard shortcuts, attachment-backed avatars, inputs and choices, calendars, tables, static chart summaries, dialogs and menus, toasts, carousels, ratings, copy controls, and loading buttons. Progressive enhancement is isolated in the frontend elements runtime; carousel autoplay pauses for reduced-motion users and exposes pause controls. Charts remain text summaries instead of scripted visualizations.

P7 exposes post title, plain-text content/excerpt, date, author, category names, site tagline, and typed dynamic tags for an explicit allowlist of public post, site, and author values. Binding sources and paths are documented in `docs/elements/schemas/shared-types-and-styles.json`; unknown paths use the authored fallback, and values are escaped as text. The renderer also supports featured images through attachment resolution, public author boxes using only display name and biography, approved comments capped at 50, post loops restricted to published posts and public post types with a 30 item ceiling, category-related posts, bounded numeric pagination, authored static tables, and native same-origin GET site search. Search preview forms accept only the generated search role, GET method and same-origin action. Registered query references are not executed because this repository has no query registry yet. Arbitrary metadata, filters, provider embeds, and dynamic templates remain planned pending typed public-data and query contracts.

P6 Free forms render native POST markup and submit through a nonce bound to the published post and form id. The handler reloads the published layout snapshot, accepts only the field names and types declared by that form, validates required values, email addresses, numeric and URL fields, and length bounds, rejects a filled honeypot, and applies a short per-form rate limit keyed by an HMAC of the remote address. Phone fields use native `type=tel`, bounded text lengths, and a server-side allowlist of digits, spaces, parentheses, periods, hyphens, and an optional leading plus. Valid submissions go to the WordPress admin email; the Builder stores no entries. Password fields and CAPTCHA-selected forms require a registered provider and are refused by the built-in handler. Newsletter signup sends a request to the site owner; it does not add a subscriber to an external list. Success/error elements render after a same-site redirect, and form status responses are marked no-store. Editor previews show the form inert. File-upload controls remain on safe fallbacks until their destination and retention contract is defined. P8 Pro renders bounded public product names, links, prices and cart counts when WooCommerce is active; without Pro or WooCommerce, saved nodes retain a safe static fallback. Preview output is inert, and no checkout or payment behavior is implemented. P9 currently supports a native details/summary show-more disclosure, entrance animation and scroll reveal with bounded CSS transitions and an IntersectionObserver enhancement, CSS-only hover tilt and staggered children, CSS scroll timelines where supported, an accessible typing indicator, a keyboard-focusable horizontal scroll region, a logo marquee with a pause control when autoplay is enabled, a scroll-snap carousel using the accessible native-scroll carousel renderer, reading and scroll progress using the existing bounded page-scroll indicator, and a number ticker that progressively counts up when visible while retaining its final value without JavaScript or when reduced motion is requested. Other advanced motion elements remain planned; preserve ADR 0013's GSAP distribution limits.

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

The preview response adds a final markup boundary after rendering. It rejects executable elements, event handlers, unsafe URLs, and arbitrary inline CSS. Inline SVG is limited to the icon renderer's `svg`, `path`, and `circle` geometry with allowlisted attributes; inline styles are limited to the generated gradient declarations and bounded headline index. This keeps the same accessible icon and visual fallbacks available in the editor canvas.

Generated `asset-ref` and `array<asset-ref>` controls open the shared, permission-aware media library and save canonical `attachment:<id>` references. The inspector caps repeaters at the definition's `maxItems` (up to 32) and removes selections without accepting arbitrary URLs or typed attachment identifiers.

Every control-bearing definition property has an `inspector.prop.<property>` label in the English and Dutch editor message catalogs, including properties on planned definitions. Labels follow the editor interface locale; they do not depend on the website content locale. The i18n test checks this contract against the generated definitions so new properties cannot surface raw message keys in the inspector.

The editor palette test checks every definition currently marked `ready` against the generated palette, confirms its card is insertable, and clicks it to verify the corresponding node is added to the document tree. Raising a definition's readiness therefore adds it to this coverage automatically.

The `icon` and `icon-svg` definitions offer only the three Solar glyphs rendered from local path data. Their size setting is bounded to 8–128 pixels, and the server and preview boundary validate the emitted SVG tags and geometry attributes.

## Entitlement and status

Tier is metadata. `blixis_builder_element_entitlement` and its editor-side equivalent default to `available`; neither controls saved-content rendering. Server-side restrictions on editing/additional actions are applied later. Planned elements are not insertable by default and appear in a dev-only planned group with `showPlannedElements`.

## Versioning

Definition editorial changes that do not alter instance values retain `definitionVersion`. A changed stored property contract increments it and adds an append-only migration plus old/new fixtures. Document `schemaVersion` changes only when the persisted envelope itself changes. Readers preserve unknown fields; migrations never discard them silently.

## Known catalog inconsistencies

- The original prompt says 47 archetypes; generated counts are authoritative and report the actual distinct total shown above.
- `page`, `navigation`, `site-header`, `site-footer`, and `text` are compatibility ids rather than definition ids.
- The `card.variant` definition now includes the bundled `surface` value. Responsive `grid.columns` is represented by a desktop/tablet/mobile object for the compatibility adapter; the editor control is part of the later inspector slice.
- Bundled WooCommerce template IDs `woocommerce-cart-link` and `woocommerce-product-grid` map to the catalog's `cart-icon` and `product-grid` definitions for validation and round-trip preservation. Pro renders the product and cart display through the extension renderer contract; the core renderer retains its safe static fallback.
- `examples/template-element-tree.json` uses proposed instance fields; it is not proof of runtime compatibility.
- `definitionVersion` is fixed to `1.0.0` by schema; breaking evolutions require schema and generator coordination.
- Icon candidates need exact validation against the installed Solar package. Current mismatches are committed at `docs/elements/reports/icon-mismatches.json`.
