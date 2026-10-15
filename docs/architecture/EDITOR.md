# Editor application (BWB-049)

`apps/editor` (`@blixis/wp-editor`) is the React 19 editor shell. It is loaded only on the Builder admin screen, never on public pages. UI primitives live in `packages/editor-ui` (`@blixis/wp-editor-ui`, shadcn/ui-style components written by hand on Radix). Pure packages (core, style-engine, canvas-bridge, ...) never import React (ADR 0010).


## Editor design tokens (BWB-127)

Editor chrome styling lives on `.blx-editor` and is independent of both website appearance in the canvas and the content locale. The scoped token sets are in `apps/editor/src/styles/editor.src.css`; components consume semantic `ed-*` utilities or these variables rather than embedding palette values.

| Role | Tokens |
|---|---|
| Page and panels | `--ed-bg`, `--ed-surface`, `--ed-surface-raised`, `--ed-surface-2`, `--ed-surface-hover` |
| Text and states | `--ed-fg`, `--ed-fg-muted`, `--ed-muted`, `--ed-danger`, `--ed-destructive`, `--ed-success`, `--ed-warning` |
| Actions and feedback | `--ed-primary`, `--ed-primary-fg`, `--ed-primary-hover`, `--ed-selected`, `--ed-selected-fg`, `--ed-selection-outline`, `--ed-hover-outline`, `--ed-focus-ring` |
| Borders and overlays | `--ed-border`, `--ed-border-strong`, `--ed-overlay`, `--ed-tooltip`, `--ed-tooltip-fg`, `--ed-banner`, `--ed-banner-fg` |
| Header and preview frame | `--ed-header`, `--ed-header-fg`, `--ed-header-border`, `--ed-preview-light`, `--ed-preview-dark`, `--ed-selection-contrast` |
| Shape and layout | `--ed-radius-control` (8 px), `--ed-radius-small` (6 px), `--ed-space-1`..`--ed-space-4` (4/8/12/16 px), `--ed-control-height` (30 px), `--ed-control-height-small` (24 px) |
| Type, elevation and stacking | `--ed-font-xs` (11 px), `--ed-font-sm` (12 px), `--ed-font-base` (13 px), `--ed-font-lg` (15 px), `--ed-shadow-floating`, `--ed-z-base`, `--ed-z-overlay`, `--ed-z-floating`, `--ed-z-skip` |

Light chrome uses a `#f5f7fb` page, white panels, `#e5e8ef` borders and `#2563eb` primary blue. Dark chrome has its own surface, text, border, action and state values. Both palettes are scoped to the editor root. Floating shadow and z-index tokens are reserved for overlays and menus; normal layout stays flat.

Contrast tests parse the actual token values and check these text pairs at 4.5:1: foreground on page, secondary foreground on page, foreground/secondary foreground on surface and raised surface, selected foreground on selection, primary foreground on primary and hover, destructive foreground on destructive and hover, tooltip foreground on tooltip, banner foreground on banner, foreground on selection, danger/success/warning on page, and header foreground on header. UI pairs (3:1) are strong border, focus ring, selected outline and hover outline against page and surface backgrounds. The token test is the source of truth when changing either palette. Controls stay at or above 24 px; normal inspector inputs use 30 px, while the existing 32 px minimum on buttons remains intact.

The baseline measured by `pnpm build:editor` before BWB-127 was **971,854 bytes** for `apps/editor/dist/editor.js` and **18,508 bytes** for `apps/editor/dist/editor.css`. After BWB-127, the same build measures **1,034,323 bytes** of JavaScript (+62,469 bytes, +6.4%) and **21,068 bytes** of CSS (+2,560 bytes, +13.8%). These raw minified artifact sizes include the shared UI and the expanded token styling.

### Icon API

`@blixis/wp-editor-ui` exports `Icon`, `ICONS`, `ELEMENT_ICONS` and `elementIconName`. The `Icon` component accepts a typed semantic name, Phosphor weight (`regular` by default; `thin`, `light`, `bold`, `fill` or `duotone` are available), numeric size, optional accessible `label`, and opt-in `mirrorInRtl` for directional glyphs. Icons are hidden from assistive technology unless a label is provided. The central registry imports named Phosphor components individually so unused icons can be removed from the bundle. Core element types are all mapped; unrecognized types use `fallback`.

## Shell layout and landmarks

The editor fills the viewport (`position: fixed; inset: 0`, CSS grid, no page scroll).

| Region | Element | Notes |
|---|---|---|
| Skip link | `a.blx-skip` | First in tab order, targets `#blx-canvas`. |
| Header | `header[role=banner]` containing `role=toolbar` | One roving tab stop (Arrow keys, Home, End). Back to admin, structure toggle, title and content-locale chip, Undo/Redo, viewport group (sizes the preview frame), Preview, Save, Publish, keyboard shortcuts, editor appearance group, editor language chip, inspector toggle. |
| Lock banner | `div[role=status]` | Shown when `editingEnabled` is false; shows `lockReason`. |
| Structure | `nav[aria-label=Structure]#blx-structure` | Placeholder with empty state. Collapsible. |
| Canvas | `main#blx-canvas` | `tabindex=-1`: it is reached through the skip link (the link moves focus here); Tab does not stop on it. Contains the "Preview appearance" group, the load/connection/preview statuses and the preview iframe (see "Canvas (BWB-051)"). Without `canvasUrl` it shows the placeholder "Canvas arrives with the canvas protocol." and the content locale. |
| Inspector | `aside[aria-label=Inspector]#blx-inspector` | Tabs Content / Style / Settings with empty states. Collapsible. |

Panel toggles have a fixed accessible name ("Structure panel", "Inspector panel"); `aria-expanded` alone carries the state, so it is not announced twice. They also carry `aria-controls`; collapsed panels get `hidden`. State is remembered in `localStorage` key `blixis-editor-panels` (every access is wrapped in try/catch). Undo, Redo, Save and Publish are disabled placeholders (`aria-disabled`, still focusable so their tooltip explains why); the document store and save arrive with BWB-050 and BWB-055.

## Bootstrap contract v1

The PHP admin screen prints `<script type="application/json" id="blixis-editor-bootstrap">`. The editor reads `textContent`, applies a 64 KiB limit, `JSON.parse`s it (never `eval`) and validates it with zod (`src/bootstrap.ts`).

```json
{ "version": 1, "restRoot": "https://site/wp-json/blixis/v1/", "nonce": "...", "postId": 42, "postTitle": "...",
  "postType": "page", "contentLocale": "fr_FR", "defaultLocale": "en_US", "enabledLocales": ["en_US", "fr_FR"],
  "editorLocale": "en_US", "pluginVersion": "0.1.0", "themeName": "...", "editingEnabled": true,
  "lockReason": null, "adminUrl": "https://site/wp-admin/", "viewUrl": "https://site/about/",
  "canvasUrl": "https://site/wp-admin/admin.php?page=blixis-canvas&post=42&locale=fr_FR",
  "cspNonce": "base64-from-the-response-header" }
```

- `restRoot`, `adminUrl` and `viewUrl` (nullable) must be credential-free http(s) URLs on `location.origin`, without control characters or backslashes. The editor uses the normalised `new URL(value).href`, never the raw string (so `https:host/x` style spellings are not passed through as written). `viewUrl` is the default-locale permalink for now; BWB-057 localises it. Why: the nonce authorises REST calls as the current user; a cross-origin `restRoot` would send it to another origin, and `javascript:`/`data:` links in the toolbar would be script injection.
- `canvasUrl` (optional, `null` allowed) is the same-origin URL of the dedicated canvas document, validated and normalised like `restRoot`. Absent or `null` means the canvas is unavailable and the editor keeps the placeholder. The editor adds `locale=<content locale>` itself, so a content-language switch loads the right document.
- `contentLocaleExplicit` (optional boolean, default `false`; the strict schema accepts it) says whether the link asked for `contentLocale` explicitly (`locale=` in the editor URL). Only then does the bootstrap locale win over the locale remembered for the post; a generic link omits it and the remembered locale wins, then the bootstrap locale (the site default for such a link).
- `cspNonce` (16 to 64 base64/base64url characters) is the nonce of the response's `style-src`. `mountEditor` assigns it to `globalThis.__webpack_nonce__` before rendering, so the `<style>` elements that Radix dialogs inject (scroll lock) are allowed without `unsafe-inline`; it is not set when the bootstrap is invalid.
- Locales are WordPress locale ids and use exactly the grammar of `MetaKeys::is_valid_locale` in the plugin (`/^[a-z]{2,3}(_[A-Za-z0-9]{2,8})*$/`, at most 20 characters; no hyphens). `postType` is a slug; strings have length limits. The schema is a `z.strictObject`: unknown top-level keys (including `__proto__`), missing fields and wrong types are refused, not stripped.
- A failed bootstrap renders an `ErrorScreen` (`role=alert`) with a generic message. The result carries a code only, never the offending value or validator messages.

## Four independent settings

| Setting | Where it lives | Applied to | Never derived from |
|---|---|---|---|
| Editor chrome appearance (system, light, dark) | `localStorage` `blixis-editor-chrome` | `data-editor-theme` on `.blx-editor` only | Site appearance, content locale |
| Site appearance (visitor light/dark) | The theme (`data-theme` on the site `<html>`) | The website | Editor chrome appearance |
| Preview appearance (website content light/dark in the editor) | Settings slice `previewMode`, per-post `localStorage` | The preview request (`mode`), `html[data-theme]`, native `color-scheme`, `data-blx-mode` in the canvas document, and the frame backdrop. Toggled by the "Preview appearance" group in the canvas area | Editor chrome appearance, the visitor's preference |
| Editor interface locale | `bootstrap.editorLocale` | `lang` and `dir` on `.blx-editor`, `t()` catalogs | Content locale |
| Content (translation) locale | Settings slice (initial value from `bootstrap.contentLocale`) | The chip, the preview request `locale`, `lang`/`dir` of the canvas document | Editor locale |

The chrome theme never touches `<html>`/`<body>`; `matchMedia('(prefers-color-scheme: dark)')` is consulted only to resolve `system`, with a change listener. Tests assert both isolations.

## Editor i18n

`src/i18n.ts` holds catalogs `en_US` (complete, the source of truth for `MessageKey`) and `nl_NL` (typed to cover every key). Selection: exact match, then same language (`nl_BE` becomes `nl_NL`), then `en_US`; a missing key falls back per key to `en_US`, then to the key. `t(key, { name })` replaces `{name}`; messages are plain text. `dir="rtl"` for ar, he, fa, ur follows the editor locale. The shell is wrapped in Radix `DirectionProvider` (`@radix-ui/react-direction`, re-exported by `@blixis/wp-editor-ui`) with the same direction, so Toolbar and Tabs render `dir="rtl"` and mirror the arrow keys (ArrowLeft moves forward in RTL). This is covered by tests for `ar` and `en_US`.

## Style isolation

Tailwind v4 is compiled by `apps/editor/scripts/build.mjs` with `@tailwindcss/node` and `@tailwindcss/oxide`, like the theme (no CLI, no Vite plugin; ADR 0008). `src/styles/editor.src.css` wraps `@tailwind utilities` and all component CSS in `@layer blx-editor { .blx-editor { ... } }`, so every selector compiles to `.blx-editor ...`. The theme uses `@theme inline` so no `:root` variables are emitted, the scoped reset is `:where()` based, and the build removes Tailwind's universal-selector `@layer properties` fallback (the `@property` rules remain). `src/styles.test.ts` builds the CSS and walks it: any selector outside `.blx-editor`, or any at-rule other than `@layer blx-editor`, `@media`, `@supports`, `@keyframes` or `@property`, fails. Overlays (dialog, tooltip) portal into the `.blx-editor` root through `PortalContainerProvider`, keeping theme, `lang` and `dir`.

Because the layer is lower priority than unlayered CSS, the PHP screen must not load other admin stylesheets that style bare elements inside the root. Design values are CSS custom properties on `.blx-editor[data-editor-theme=light|dark]`; `styles.test.ts` verifies 4.5:1 for text pairs and 3:1 for borders and focus rings in both themes with `contrastRatio` from `@blixis/wp-design-tokens`. Selected toggles and tabs show a 2px inset ring in `--ed-selected-ring` in addition to the fill (WCAG 1.4.11; the ring is checked at 3:1 against the page, selected fill and surface in both themes). Below 52rem the panels stack and the whole editor scrolls vertically (WCAG 1.4.10 reflow); `tooling/herd/editor-browser-check.mjs` checks 320 CSS px for horizontal overflow and a reachable inspector. Known limitation: dark chrome is applied when React mounts, so a brief white flash before mount is possible; a first-paint fix is planned with the editor state work. Motion respects `prefers-reduced-motion`, `forced-colors` gets `Highlight`/`CanvasText` outlines, and layout uses logical properties for RTL.

## Build and reproducibility

`pnpm build:editor` writes `apps/editor/dist/` (git-ignored; CI and `pnpm wp:smoke` build it first):

- `editor.js`: esbuild, one minified ES2022 IIFE (browser floor below), `process.env.NODE_ENV` set to `"production"`, no source map, ASCII output. Legal comments are written to `editor.js.LEGAL.txt` (`legalComments: 'external'`).
- Browser floor: the code targets ES2022 and the TypeScript `lib` is the repository default (ES2023, no ES2024 override). `String.prototype.isWellFormed` (ES2024), which core's value validation needs, goes through `isWellFormed()` in `packages/core/src/json/well-formed.ts`: the native method when present, otherwise a code-unit loop with identical results (no regular expression lookbehind, which Safari before 16.4 cannot parse). A grep of the built bundle finds no `toWellFormed`, `findLast`, `Object.groupBy`, `replaceAll`, `Array.fromAsync` or `Promise.withResolvers`; `isWellFormed` appears once, inside the feature-detecting helper. `toSorted`/`toReversed`/`toSpliced` match only methods of a Radix collection class that implements them itself, not `Array.prototype`. The bundle does use ES2022 library calls (`Object.hasOwn`, `.at()`) and the web API `structuredClone` (element registry), so the practical floor is roughly Chrome 98, Safari 15.4 and Firefox 94 (`structuredClone`); nothing newer is reached at runtime. This is verified by reading the bundle, not by running old browsers.
- `canvas.js`: the second bundle, built from `src/canvas/runtime.ts` (the canvas runtime that runs inside the preview iframe). Minified ES2022 IIFE, no source map, no React, no third-party code (about 14 KB). The build test asserts that it contains no `react`, no `eval`/`new Function`, no cookie or storage access and the hello message name.
- `editor.css`: the scoped Tailwind output.
- `manifest.json`: `{ "version": 1, "js", "css", "jsSha256", "cssSha256", "canvasJs", "canvasJsSha256" }` (exactly these keys, in this order). The hashes are used for cache busting (the PHP asset version) and for integrity verification at build and sync time only (`tooling/build/sync-editor-assets.mjs`). There is no Subresource Integrity attribute and no runtime hash check in PHP. The PHP manifest reader accepts exactly these seven keys, so the notice files are not listed in it.
- `NOTICE.txt` (ADR 0008 section 4): generated by the build from esbuild's metafiles of both bundles, so it lists exactly the third-party packages bundled into `editor.js` or `canvas.js` (React, Radix, zod, tailwind-merge, class-variance-authority, lucide-react and their dependencies) with name, exact version, licence id and licence text from `node_modules`, sorted for reproducibility. `editor.js.LEGAL.txt` holds the inline legal comments esbuild preserved.

`node apps/editor/scripts/build.mjs --verify-reproducible` builds twice and compares (both bundles and the manifest); `styles.test.ts` also builds twice into temp directories (`--out`) and compares bytes. `pnpm --filter @blixis/wp-editor run dev` is a watch build.

## State and command bridge (BWB-050)

`apps/editor/src/state/` holds the editor state in ONE Zustand store per editor instance. `createEditorStore(deps)` is a factory (no module-level state), so every test and every mounted editor is isolated. Zustand is allowed only in `apps/editor` and `packages/editor-ui` (ADR 0010); core and the other pure packages never import it. `deps` are the `RestClient` (interface in `src/api/types.ts`, real factory through the `src/state/deps.ts` seam), the bootstrap values, and optional `registry`, `now` (clock), `storage`, `breakpoints` and `historyLimit`. React access is `StoreProvider` and `useEditorStore(selector)` in `react.tsx`; selectors must return primitives or existing references (never a freshly built object) or the component re-renders on every update.

### Slices

| Slice (file) | Fields and actions |
|---|---|
| document (`document-slice.ts`) | `status` (`idle`, `loading`, `ready`, `error`), `error` (`{ type: 'api', error: ApiError }` or `{ type: 'invalid', error: ComposeError }`), `document`, `revisions { layout, content[locale] }` (as read, for the future `If-Match`), `savedDocument`, `dirty { layout, content[locale] }`, `loadDocument({ signal })`, `markSaved({ layout?, content?, document? })` |
| selection (`selection-slice.ts`) | `selectedId`, `hoveredId`, `select(id)` (returns `false` and changes nothing for an id that is not in the document), `clearSelection()`, `hover(id)` |
| history (`history-slice.ts`) | `history` (core `History`, limit 200; its `document` is always the store's `document`), `canUndo`, `canRedo`, `coalesce` (the burst being merged) |
| settings (`settings-slice.ts`) | `viewport`, `breakpointId`, `viewportWidth`, `previewMode`, `contentLocale`, `panels`, `setViewport`, `setPreviewMode`, `setContentLocale`, `togglePanel` |
| bridge (`bridge.ts`) | `dispatch(command, { coalesceKey? })`, `undo()`, `redo()`, `subscribe(listener)` |

`undo`/`redo` are part of the bridge slice because they replace the document; the history slice holds only data. Nothing else writes `document`.

### The single write path

The editor never edits the tree. Every change is a core command run through `dispatch`, which calls `applyCommand` with a `CommandContext` built from the element registry (`canNest`, `sourceProperties`, `translationValue`) and then replaces `document`, `history`, `canUndo`/`canRedo`, `dirty`, selection and the coalescing mark in ONE `set()`. Subscribers (store or bridge) therefore never see a new document with an old history; bridge listeners run after the store was updated with `{ type: 'command' | 'undo' | 'redo' | 'load', document }`. Events go through one FIFO queue drained by a single loop: an event raised while listeners run (a listener that dispatches or undoes) is queued and delivered to every listener only after the current one, so all listeners see the same order and each event carries the document of its own moment (`getState()` already holds the newest). A throwing listener cannot break editing or stop the others, and a listener unsubscribed during delivery is not called afterwards. A failing command returns `{ ok: false, error }` and changes nothing (same state object, no notification). Commands are untrusted: core copies them into an inert snapshot and the bridge returns that copy. Commands are refused with `not-ready` while no document is loaded or a load is running (a reload would silently drop the edit) and with `read-only` when `bootstrap.editingEnabled` is false. `dispatch`, `undo` and `redo` are also refused with `not-ready` while the status is `error` (a failed reload keeps the previous document in memory, but a later successful Retry replaces it, so edits made in between would be lost silently). The only other way the document is replaced is `loadDocument` (atomic, all or nothing).

### Stream composition (`compose.ts`)

The server stores the layout stream (the document without `translations`) and one content stream per locale (`{ schemaVersion, contentRevision, locale, entries }`, ADR 0003/0004). `composeDocument` merges them into the in-memory `BuilderDocument` and validates the result with core's `validateDocument` (limits, reserved keys, shape, semantics): any problem is a typed `ComposeError` (`invalid-shape`, `invalid-layout`, `invalid-content`, `locale-mismatch`, `unsupported-version`, `invalid-input`) that carries no payload text, and nothing is loaded. A never-written layout becomes an empty skeleton (`post-<postId>`, revisions 0, an empty stream for every locale, `editorVersion` from the plugin version, timestamp from the injected clock). A content stream whose `locale` differs from its slot is refused. Locales that are enabled but missing from a stored layout are appended to `locales`. Unknown fields on the layout, elements, metadata and translation entries round-trip; unknown fields of the content ENVELOPE are not kept (the server owns `contentRevision` and `locale`). `splitDocument` is the inverse for the write routes and `isSplitStable(doc)` is the property `composeDocument(splitDocument(x))` deep-equals `x` (a locale without translation stream stays without one).

`loadDocument` reads the layout and every enabled locale in parallel, aborts any older load (a late answer of an older load is ignored), leaves the previous state untouched on failure (only `status` and `error` change) and resets history and the saved snapshot on success.

### Dirty tracking

`dirty` is computed by comparing the split streams of `document` with those of `savedDocument` using a structural comparison with a reference shortcut at every level. The command engine shares unchanged subtrees, so this costs about the size of the change, and a command that touches several streams (for example `remove` orphans entries in every locale) marks all of them. Undoing back to the saved state is clean again. `markSaved({ layout?, content?, document? })` records the revisions the server returned and moves the saved snapshot of the named streams to `document` (default: the current one; pass the document that was actually sent when edits may have happened during the save), so other streams stay dirty.

### The four independent settings

| Setting | Lives in | Changes |
|---|---|---|
| Editor chrome appearance | `chrome-theme.ts`, key `blixis-editor-chrome` | `data-editor-theme` on `.blx-editor` |
| Editor interface locale | `bootstrap.editorLocale` | `lang`, `dir`, catalogs |
| Website content appearance (`previewMode`, `light` or `dark`; "Preview appearance" group) | settings slice | what the canvas shows and what the preview route renders (BWB-051) |
| Content locale (`contentLocale`) | settings slice | which language is edited |

None of them reads or writes another one, and none touches `<html>`; tests assert this on the store and on `document.documentElement`. `setContentLocale` refuses locales that are not enabled. `viewport` maps to a breakpoint id and canvas width through an injected breakpoint registry (default: desktop `base`, tablet `tablet` at 1024 px, mobile `mobile` at 640 px). `viewport`, `previewMode` and `contentLocale` are remembered per post under `blixis-editor-view-<postId>` as JSON, validated field by field on read (garbage, wrong types, unknown locales, reserved keys and oversized values are ignored; storage errors are swallowed). The bootstrap content locale wins over the remembered one only when `contentLocaleExplicit` is true and the locale is enabled; otherwise the remembered (still enabled) locale wins, then the bootstrap locale. Panels keep the existing `blixis-editor-panels` key.

### Coalescing rule

`dispatch(command, { coalesceKey })` merges a command into the previous undo step when ALL of these hold: it is an `update-props` or `set-translation`; the previous successful command carried the same `coalesceKey`; both touch the same element (and locale) with the same set of set/unset property ids; and the injected clock says at most 1000 ms passed since the previous command of the burst (a rolling window, so continuous typing stays one step). The merge is taken only when the merged result is exactly reproducible: the burst remembers the document before its first command, and the bridge checks that replaying the latest command on it yields a document structurally equal to the current one and that the first inverse applied to the current document yields the pre-burst one (structural equality with a reference shortcut). If not, a new undo step starts. Example: typing "Hello!" and backspacing to "Hello" in the source locale would replay as a no-op from the pre-burst "Hello" (no stale marking of other locales), so it stays two steps. Anything else (another command, undo, redo, load, a failed command does not count) ends the burst. Core's `History` is immutable and cannot express this itself, so the bridge applies the command normally and then replaces the top entry in an immutable way: it keeps the FIRST inverse (it restores the document before the burst; for translations it also restores the statuses other locales had) and the LATEST forward command (the property set is identical, so it carries the final values). Undo restores the pre-burst document exactly and redo reproduces the post-burst one; seeded random tests verify both.

### Selection rule

Selection is validated against the document. After every command, undo, redo and load the selected id is kept if the element still exists; otherwise it moves to its nearest surviving ancestor, found by walking up the path the element had in the PREVIOUS document (`findPath`, `nodeAt`); with no surviving ancestor it is cleared. An undo does not bring back an old selection. Hover is cleared when its element is gone.

### UI wiring

`main.tsx` creates the store with `createRestClient` (injectable in tests through `mountEditor`'s options) and `EditorApp` calls `loadDocument` on mount (aborted on unmount). The toolbar Undo and Redo buttons follow `canUndo`/`canRedo` (`aria-disabled`) and work by click and keyboard; Mod+Z and Mod+Shift+Z are BWB-056 and are NOT bound. The Structure panel shows a virtual WAI-ARIA tree with keyboard selection, loading, error (`role="alert"`, generic catalog text for 401, 403, 409, 423, network and invalid documents, never server text) and empty states; tree drag and drop is BWB-059. The Inspector header shows the selected element's type and id. The canvas placeholder (shown when the bootstrap has no `canvasUrl`) shows the content locale from the settings slice.

### Schema-driven inspector (BWB-053 / BWB-054)

`src/inspector/Inspector.tsx` reads the selected type from the injected `ElementRegistry` and renders its registered properties in the existing Content and Settings tabs. Invariant values are stored through `update-props`; translated and locale-specific values are stored through `set-translation` using `settings.contentLocale`. The editor interface locale only chooses message catalogs. Unknown element types have no editable controls. The document-level `editingEnabled` flag disables controls and displays one lock message; the bridge also refuses all writes when `editingEnabled` is false.

The framework-free `src/inspector/control-mapping.ts` maps element property schemas to control families and inspector tabs; its tests exercise every core property kind and the special content placement for media identity fields. Presentation components live under `src/inspector/controls/`, split into text, numeric, choice, media and style families. The prop control mapping follows the registry union: strings become text inputs or a multiline textarea for long text, integers become bounded number inputs, enums become selects, booleans become checkboxes, and URL drafts are checked before dispatch on blur or Enter. Images resolve only through WordPress media attachment ids; the inspector explains that media library selection is coming. Failed dispatches remain beside the field as translated alerts with `aria-describedby`; command failures keep the local draft. Image alternative text is localized and a warning appears only when it is absent and the image is not decorative.

The Style tab uses named Blixis tokens for spacing, colour and font size, plus fixed safe presets for weight, line height and alignment, all checked by the style engine. The shared design-token schema does not yet model font weight or line height as token categories; the preset choices avoid arbitrary input until the theme token adapter can supply them. Spacing uses logical block/inline sides. The active editor viewport selects its breakpoint from the injected breakpoint registry; sparse style rules inherit from wider breakpoints while mode and state rules are excluded from this indicator. The panel marks a local override and offers reset by deleting declarations for the active breakpoint while preserving wider breakpoint values. Every write is a discrete `set-style-rule` undo step. No command runs during render.

Typography presets use finite weight and line-height choices. This keeps values inside the CSS declaration allow-list and avoids free-form parsing in these controls; expand the presets or add validated numeric controls in a follow-up.

Inspector tests cover spacing and typography resets, actual controls across the six core element types, read-only reasons, command errors, selection and locale draft resets, undo/redo synchronization, viewport-specific inherited indicators, and a selection plus field edit on a 5,000-element document with a 30-second test timeout.

The inspector is editor chrome and does not affect website content appearance or editor locale. Field layout uses logical CSS properties for RTL. Tabs retain their existing Radix keyboard semantics; fields use native labels, fieldsets and controls with touch-size inputs.

### Current scope boundary

The core registry defines the initial six elements and their persisted property contracts. Images resolve only through `attachmentId`; the inspector exposes the attachment id, localized alternative text and decorative toggle, with media library selection coming in a later issue. The style controls expose core spacing, colour and font-size tokens plus finite weight and line-height presets. Site-specific token choices and first-class weight/line-height token categories remain open work for the future theme settings adapter.


### What plugs in later

| Issue | Plugs into |
|---|---|
| BWB-051 canvas bridge | Done: see "Canvas (BWB-051)". Uses `subscribe` (events carry the document) and `viewport`, `breakpointId`, `previewMode`, `contentLocale`, `selectedId`, `hoveredId` from the store |
| BWB-052 structure tree | Done: `select`, `expandedIds`, keyboard focus and selection breadcrumb |
| BWB-059 drag and drop | `dispatch({ type: 'move' ... })` and canvas rectangles |
| BWB-053/054 inspector | Done: injected registry, `selectedId`, translated/invariant fields and discrete style history |
| BWB-055 save and autosave | `subscribe` for change events, `dirty`, `revisions` (`If-Match`), `splitDocument` for the bodies, `markSaved` with the document that was sent |
| BWB-056 shortcuts | `undo`, `redo` |

### Testing approach

Vitest with jsdom, no extra dependencies. `src/test/state-helpers.ts` builds isolated stores over a fake `RestClient`, a manual clock and an in-memory storage. Covered: compose/split round trip including hostile payloads (reserved keys, huge, deeply nested, wrong types, getters, locale mismatch); the slices; bridge atomicity (a subscriber never sees a torn state); failing commands changing nothing; undo/redo parity with core's `History` on seeded random command sequences (valid and invalid mixed: undoing everything gives the loaded document, redoing reproduces every intermediate one); coalescing bursts, including seeded random bursts; selection repair; load races and failure; dirty tracking; settings independence and persistence validation; React glue, outline, errors in both catalogs and axe; re-entrancy of listeners (nested dispatch and undo, removal during delivery, throwing listeners); coalescing regressions (type-then-revert, a burst interrupted by another command); refusal of edits after a failed reload; a bounded performance test (1,000 `update-props` plus a 300-step coalesced burst on a 5,000-element document with dirty comparison, under a generous 10 s bound that only catches accidental per-keystroke whole-tree work, not a benchmark). The REST client tests cover redirects (`redirect: 'error'` is passed on every request; a response with `redirected === true` is a network error) and a maximal document (5,000 elements, just under 2 MiB) loading through the real client.

## Structure tree and selection (BWB-052)

The virtual WAI-ARIA tree defaults to the first two expandable levels plus ancestors of the selected element. A separate initialization flag and a validated per-post storage entry distinguish the untouched default from a user who collapsed every node, so browser reloads and locale changes do not reopen the tree. Keyboard focus has its own `focusedId` and roving tab stop; Left/Right follow the editor chrome direction, while selection remains independent. Each row reports sibling position and set size. The breadcrumb uses ordered list semantics, explicit hidden separators, full ids in `title`, and `aria-current="location"` on the selected item.

## Canvas (BWB-051)

The canvas overlay wrapper matches the iframe content box and clips overflow. It displays selected-element rectangles only; rectangles are document-relative, scroll-adjusted, and rendered at scale 1.

The full protocol, sandbox rationale, threat table and non-guarantees are in `docs/architecture/CANVAS-CONTRACT.md`. This section is the editor view of it.

| Piece | File | Notes |
|---|---|---|
| Protocol package | `packages/canvas-bridge` | Pure TypeScript. Schemas, limits, `createParentEndpoint`, `createCanvasEndpoint`. It has no dependencies besides `@blixis/wp-core` (types and a pattern test), no React, no DOM types. |
| Runtime | `src/canvas/runtime.ts`, `src/canvas/guards.ts` | Bundle entry of `canvas.js`. Importing the module has no side effect unless the document has the `blixis-canvas` meta tag. |
| Session hook | `src/canvas/useCanvasSession.ts` | Handshake, debounced preview, store to canvas and canvas to store forwarding. |
| Component | `src/canvas/Canvas.tsx` | The iframe, the statuses, `PreviewAppearance`. |

* The shell passes the REST client and the bootstrap's `canvasUrl` to `Canvas`. `EditorApp` takes an optional `client` prop (set by `mountEditor`); without it, or without `canvasUrl`, the placeholder stays.
* The iframe element has a title ("Page preview (French (France))": the language display name from `Intl.DisplayNames` in the editor language, the locale id only as fallback), exactly `sandbox="allow-scripts allow-same-origin"` and no `src` until the endpoint listens. It stays keyboard reachable as a normal iframe. A pick in the canvas moves focus back to `main#blx-canvas` so users are not left inside the preview document.
* Viewport buttons (radio group in the toolbar) set `settings.viewport`; the desktop width is measured again when the area resizes (`ResizeObserver` on the container, one measurement per animation frame); the frame is `min(100%, var(--blx-frame-width))` wide: desktop fills the area, tablet 768 px, mobile 375 px. These frame widths live in `FRAME_WIDTHS` and are independent of the breakpoint registry's widths (1024 and 640), which stay the style engine's breakpoints; the registry's `breakpointId` is what the canvas receives.
* "Preview appearance" (Light / Dark, a `radiogroup` of `role=radio` items with `aria-checked`, the same pattern as the viewport control) is the website CONTENT appearance. It changes `previewMode`, the preview request, and the canvas HTML's `data-theme`, `color-scheme` and root `data-blx-mode`. The canvas loads only registered active Blixis theme base/token/compiled styles under its strict CSP. Tests assert that the editor chrome and its storage key stay untouched.
* Only `RestClient.preview` talks to the server; there is no `fetch` in the canvas code. Failed previews map the `ApiError` kind and status to catalog texts (`canvas.preview.error.*`, en_US and nl_NL); server text is never displayed.
* A reload of the canvas document (every `load` event after the first) puts the session back to `connecting`, re-handshakes and, on `ready`, re-sends viewport, mode, selection, hover and the last render (or fetches a fresh preview when the document changed meanwhile). See "Frame reloads" in the contract.
* Content locale changes recreate the frame (new `src`, new handshake with the new `locale`/`dir`); the editor locale is never sent.
* `tooling/herd/editor-browser-check.mjs` checks the canvas in a real browser: sandbox flags, strict CSP header, rendered elements without active content, a real click that selects an element, a forged handshake from a second frame, a frame reload that reconnects, a CSP enforcement probe (inline script and handler blocked, violation reported), frame widths for tablet and mobile and the independence of the preview appearance from the chrome appearance.

## Adding a component

1. Add `packages/editor-ui/src/components/<name>.tsx`: build on a Radix primitive when it has behaviour, take `className`, merge with `cn()`, default `type="button"`, use only `ed-*` colour utilities (no inline styles except CSS variables), use `ed-focus-ring` for focus.
2. Export it from `src/index.ts` and add a unit test (role, keyboard, axe).
3. Use only individual `lucide-react` icon imports and `aria-hidden` icons.
4. Add messages for every visible string to `en_US` and `nl_NL` in `apps/editor`.

## Keyboard map

Tab moves between skip link, toolbar, panels, canvas, inspector. In the toolbar and in tab lists Left/Right (mirrored in RTL), Home and End move. Escape closes dialogs and tooltips and returns focus to the trigger. Editing shortcuts (Mod+Z, Mod+Shift+Z, Mod+S, Mod+/, Mod+Alt+1/2) are listed in the shortcuts dialog as planned and are not active yet.

## Accessibility notes

Landmarks are unique and named; disabled placeholders use `aria-disabled` and stay focusable; the Dialog has a name, a description, a focus trap and focus return; the scroll region is focusable and named; targets are at least 32 px (a 44 px touch size exists). A load failure is shown as a `role="alert"` with a Try again button in the main region (`LoadStatus.tsx`), independent of the panels; the Structure panel only carries a short pointer. The button stays mounted until the reload starts, then focus moves to the loading status text, and back to the alert if the retry fails again. axe-core (WCAG 2.2 AA tags) runs in the default, dialog-open, locked/collapsed/Dutch and error states. There is deliberately no separate dark-theme axe run: jsdom applies no stylesheet, so it would test the same DOM as the light run. Colour and non-colour indicator contrast for both themes is verified from the tokens in `styles.test.ts`, and the real layout in the Herd browser check. Chips use visually hidden text ("Content language: fr_FR") instead of `aria-label` on a generic element.

## What plugs in later

| Issue | Plugs into |
|---|---|
| BWB-050 | Done: document store, command bridge, Undo/Redo, dirty state (see "State and command bridge"). |
| BWB-051 | Done: canvas iframe, `@blixis/wp-canvas-bridge`, the canvas runtime, real viewport and preview appearance controls (see "Canvas (BWB-051)"). |
| BWB-052 | Structure tree, selection breadcrumb and clipped canvas selection overlay using `request-rects`. |
| BWB-053/054 | Done: schema-driven inspector, property/style editing, locale-aware fields and accessible controls. |
| BWB-059 | Inspector tabs and drag and drop. |
| BWB-055 | Save/Publish through `restRoot` + `nonce`; lock handling. |
| BWB-056..058 | Shortcuts, content-locale switcher, translation status. |
