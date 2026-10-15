# Editor application (BWB-049)

`apps/editor` (`@blixis/wp-editor`) is the React 19 editor shell. It is loaded only on the Builder admin screen, never on public pages. UI primitives live in `packages/editor-ui` (`@blixis/wp-editor-ui`, shadcn/ui-style components written by hand on Radix). Pure packages (core, style-engine, canvas-bridge, ...) never import React (ADR 0010).

## Shell layout and landmarks

The editor fills the viewport (`position: fixed; inset: 0`, CSS grid, no page scroll).

| Region | Element | Notes |
|---|---|---|
| Skip link | `a.blx-skip` | First in tab order, targets `#blx-canvas`. |
| Header | `header[role=banner]` containing `role=toolbar` | One roving tab stop (Arrow keys, Home, End). Back to admin, structure toggle, title and content-locale chip, Undo/Redo, viewport group, Preview, Save, Publish, keyboard shortcuts, editor appearance group, editor language chip, inspector toggle. |
| Lock banner | `div[role=status]` | Shown when `editingEnabled` is false; shows `lockReason`. |
| Structure | `nav[aria-label=Structure]#blx-structure` | Placeholder with empty state. Collapsible. |
| Canvas | `main#blx-canvas` | `tabindex=-1`: it is reached through the skip link (the link moves focus here); Tab does not stop on it. Placeholder: "Canvas arrives with the canvas protocol." and the content locale. |
| Inspector | `aside[aria-label=Inspector]#blx-inspector` | Tabs Content / Style / Settings with empty states. Collapsible. |

Panel toggles have a fixed accessible name ("Structure panel", "Inspector panel"); `aria-expanded` alone carries the state, so it is not announced twice. They also carry `aria-controls`; collapsed panels get `hidden`. State is remembered in `localStorage` key `blixis-editor-panels` (every access is wrapped in try/catch). Undo, Redo, Save and Publish are disabled placeholders (`aria-disabled`, still focusable so their tooltip explains why); the document store and save arrive with BWB-050 and BWB-055.

## Bootstrap contract v1

The PHP admin screen prints `<script type="application/json" id="blixis-editor-bootstrap">`. The editor reads `textContent`, applies a 64 KiB limit, `JSON.parse`s it (never `eval`) and validates it with zod (`src/bootstrap.ts`).

```json
{ "version": 1, "restRoot": "https://site/wp-json/blixis/v1/", "nonce": "...", "postId": 42, "postTitle": "...",
  "postType": "page", "contentLocale": "fr_FR", "defaultLocale": "en_US", "enabledLocales": ["en_US", "fr_FR"],
  "editorLocale": "en_US", "pluginVersion": "0.1.0", "themeName": "...", "editingEnabled": true,
  "lockReason": null, "adminUrl": "https://site/wp-admin/", "viewUrl": "https://site/about/",
  "cspNonce": "base64-from-the-response-header" }
```

- `restRoot`, `adminUrl` and `viewUrl` (nullable) must be credential-free http(s) URLs on `location.origin`, without control characters or backslashes. The editor uses the normalised `new URL(value).href`, never the raw string (so `https:host/x` style spellings are not passed through as written). `viewUrl` is the default-locale permalink for now; BWB-057 localises it. Why: the nonce authorises REST calls as the current user; a cross-origin `restRoot` would send it to another origin, and `javascript:`/`data:` links in the toolbar would be script injection.
- `cspNonce` (16 to 64 base64/base64url characters) is the nonce of the response's `style-src`. `mountEditor` assigns it to `globalThis.__webpack_nonce__` before rendering, so the `<style>` elements that Radix dialogs inject (scroll lock) are allowed without `unsafe-inline`; it is not set when the bootstrap is invalid.
- Locales are WordPress locale ids and use exactly the grammar of `MetaKeys::is_valid_locale` in the plugin (`/^[a-z]{2,3}(_[A-Za-z0-9]{2,8})*$/`, at most 20 characters; no hyphens). `postType` is a slug; strings have length limits. The schema is a `z.strictObject`: unknown top-level keys (including `__proto__`), missing fields and wrong types are refused, not stripped.
- A failed bootstrap renders an `ErrorScreen` (`role=alert`) with a generic message. The result carries a code only, never the offending value or validator messages.

## Four independent settings

| Setting | Where it lives | Applied to | Never derived from |
|---|---|---|---|
| Editor chrome appearance (system, light, dark) | `localStorage` `blixis-editor-chrome` | `data-editor-theme` on `.blx-editor` only | Site appearance, content locale |
| Site appearance (visitor light/dark) | The theme (`data-theme` on the site `<html>`) | The website and, later, the canvas content | Editor chrome appearance |
| Editor interface locale | `bootstrap.editorLocale` | `lang` and `dir` on `.blx-editor`, `t()` catalogs | Content locale |
| Content (translation) locale | `bootstrap.contentLocale` | Displayed in the chip and canvas placeholder; later selects the content document | Editor locale |

The chrome theme never touches `<html>`/`<body>`; `matchMedia('(prefers-color-scheme: dark)')` is consulted only to resolve `system`, with a change listener. Tests assert both isolations.

## Editor i18n

`src/i18n.ts` holds catalogs `en_US` (complete, the source of truth for `MessageKey`) and `nl_NL` (typed to cover every key). Selection: exact match, then same language (`nl_BE` becomes `nl_NL`), then `en_US`; a missing key falls back per key to `en_US`, then to the key. `t(key, { name })` replaces `{name}`; messages are plain text. `dir="rtl"` for ar, he, fa, ur follows the editor locale. The shell is wrapped in Radix `DirectionProvider` (`@radix-ui/react-direction`, re-exported by `@blixis/wp-editor-ui`) with the same direction, so Toolbar and Tabs render `dir="rtl"` and mirror the arrow keys (ArrowLeft moves forward in RTL). This is covered by tests for `ar` and `en_US`.

## Style isolation

Tailwind v4 is compiled by `apps/editor/scripts/build.mjs` with `@tailwindcss/node` and `@tailwindcss/oxide`, like the theme (no CLI, no Vite plugin; ADR 0008). `src/styles/editor.src.css` wraps `@tailwind utilities` and all component CSS in `@layer blx-editor { .blx-editor { ... } }`, so every selector compiles to `.blx-editor ...`. The theme uses `@theme inline` so no `:root` variables are emitted, the scoped reset is `:where()` based, and the build removes Tailwind's universal-selector `@layer properties` fallback (the `@property` rules remain). `src/styles.test.ts` builds the CSS and walks it: any selector outside `.blx-editor`, or any at-rule other than `@layer blx-editor`, `@media`, `@supports`, `@keyframes` or `@property`, fails. Overlays (dialog, tooltip) portal into the `.blx-editor` root through `PortalContainerProvider`, keeping theme, `lang` and `dir`.

Because the layer is lower priority than unlayered CSS, the PHP screen must not load other admin stylesheets that style bare elements inside the root. Design values are CSS custom properties on `.blx-editor[data-editor-theme=light|dark]`; `styles.test.ts` verifies 4.5:1 for text pairs and 3:1 for borders and focus rings in both themes with `contrastRatio` from `@blixis/wp-design-tokens`. Selected toggles and tabs show a 2px inset ring in `--ed-selected-ring` in addition to the fill (WCAG 1.4.11; the ring is checked at 3:1 against the page, selected fill and surface in both themes). Below 52rem the panels stack and the whole editor scrolls vertically (WCAG 1.4.10 reflow); `tooling/herd/editor-browser-check.mjs` checks 320 CSS px for horizontal overflow and a reachable inspector. Known limitation: dark chrome is applied when React mounts, so a brief white flash before mount is possible; a first-paint fix is planned with the editor state work. Motion respects `prefers-reduced-motion`, `forced-colors` gets `Highlight`/`CanvasText` outlines, and layout uses logical properties for RTL.

## Build and reproducibility

`pnpm build:editor` writes `apps/editor/dist/` (git-ignored; CI and `pnpm wp:smoke` build it first):

- `editor.js`: esbuild, one minified ES2022 IIFE, `process.env.NODE_ENV` set to `"production"`, no source map, ASCII output. Legal comments are written to `editor.js.LEGAL.txt` (`legalComments: 'external'`).
- `editor.css`: the scoped Tailwind output.
- `manifest.json`: `{ "version": 1, "js", "css", "jsSha256", "cssSha256" }`. The hashes are used for cache busting (the PHP asset version) and for integrity verification at build and sync time only (`tooling/build/sync-editor-assets.mjs`). There is no Subresource Integrity attribute and no runtime hash check in PHP. The PHP manifest reader accepts exactly these five keys, so the notice files are not listed in it.
- `NOTICE.txt` (ADR 0008 section 4): generated by the build from esbuild's metafile, so it lists exactly the third-party packages bundled into `editor.js` (React, Radix, zod, tailwind-merge, class-variance-authority, lucide-react and their dependencies) with name, exact version, licence id and licence text from `node_modules`, sorted for reproducibility. `editor.js.LEGAL.txt` holds the inline legal comments esbuild preserved.

`node apps/editor/scripts/build.mjs --verify-reproducible` builds twice and compares; `styles.test.ts` also builds twice into temp directories (`--out`) and compares bytes. `pnpm --filter @blixis/wp-editor run dev` is a watch build.

## Adding a component

1. Add `packages/editor-ui/src/components/<name>.tsx`: build on a Radix primitive when it has behaviour, take `className`, merge with `cn()`, default `type="button"`, use only `ed-*` colour utilities (no inline styles except CSS variables), use `ed-focus-ring` for focus.
2. Export it from `src/index.ts` and add a unit test (role, keyboard, axe).
3. Use only individual `lucide-react` icon imports and `aria-hidden` icons.
4. Add messages for every visible string to `en_US` and `nl_NL` in `apps/editor`.

## Keyboard map

Tab moves between skip link, toolbar, panels, canvas, inspector. In the toolbar and in tab lists Left/Right (mirrored in RTL), Home and End move. Escape closes dialogs and tooltips and returns focus to the trigger. Editing shortcuts (Mod+Z, Mod+Shift+Z, Mod+S, Mod+/, Mod+Alt+1/2) are listed in the shortcuts dialog as planned and are not active yet.

## Accessibility notes

Landmarks are unique and named; disabled placeholders use `aria-disabled` and stay focusable; the Dialog has a name, a description, a focus trap and focus return; the scroll region is focusable and named; targets are at least 32 px (a 44 px touch size exists). axe-core (WCAG 2.2 AA tags) runs in the default, dialog-open, locked/collapsed/Dutch and error states. There is deliberately no separate dark-theme axe run: jsdom applies no stylesheet, so it would test the same DOM as the light run. Colour and non-colour indicator contrast for both themes is verified from the tokens in `styles.test.ts`, and the real layout in the Herd browser check. Chips use visually hidden text ("Content language: fr_FR") instead of `aria-label` on a generic element.

## What plugs in later

| Issue | Plugs into |
|---|---|
| BWB-050 | Document store: Undo/Redo, dirty state, bootstrap `postId`. |
| BWB-051..053 | Structure panel tree, inspector tabs, drag and drop. |
| BWB-054 | Canvas iframe and `@blixis/wp-canvas-bridge`; the viewport group gets behaviour. |
| BWB-055 | Save/Publish through `restRoot` + `nonce`; lock handling. |
| BWB-056..058 | Shortcuts, content-locale switcher, translation status. |
