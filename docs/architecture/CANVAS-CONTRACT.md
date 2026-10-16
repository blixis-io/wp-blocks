# Editor canvas preview contract (BWB-042) and iframe protocol (BWB-051)

`POST /blixis/v1/documents/{post_id}/preview` returns `{ html, css, locale, mode, layoutRevision, contentRevision, source }`. `html` is a fragment; `css` is compiler output (empty until BWB-044). `source` is `request` for the unsaved `document` in the JSON request, or `working` for the post's working streams. Preview never publishes or persists the request document and never reads publication pointers or snapshots. Missing working streams yield empty HTML and CSS with null revisions.

The editor shows this fragment in a sandboxed same-origin iframe that loads a dedicated canvas document and its own trusted runtime. The transport, the sandbox flags and the message protocol are described under "Canvas iframe protocol (BWB-051)" below; this section only covers the preview payload. Preview HTML permits `data-blx-id` and `data-blx-type` as element hooks; invalid identifiers receive only `data-blx-invalid`. Core output also uses fixed semantic tags, a container max-width token and inert media/unknown placeholders. Consumers should use only documented hooks.

Cookie-authenticated requests use WordPress REST `X-WP-Nonce`; core enforces nonce validation. The route checks `edit_post` for the exact opted-in post. Responses require `Cache-Control: private, no-store`; preview URLs must not be publicly reachable. The editor screen's frame policy is separate from this JSON response. The preview endpoint uses the selected **website content locale** and **website appearance mode** independently of editor interface locale and editor chrome appearance.

Request JSON is at most 2 MiB. The envelope validator runs before rendering. The element tree is capped at 32 levels and 5,000 nodes with unique IDs and list-shaped children. HTML is capped at 1 MiB and CSS at 256 KiB. The final HTML safety check rejects dangerous tags, event handlers and active URL schemes, including entity and whitespace obfuscation. It rejects rather than repairs: repair could silently change IDs, nesting, or meaning after validation and break parity with the PHP renderer. Failures expose only `blixis_preview_failed`.

`CoreElementPreviewRenderer` now emits semantic HTML for the six core elements. `StructurePreviewRenderer` remains available for tests and fallback. Compiled CSS arrives in BWB-044. Preview is not an independent rendering implementation: those later components replace the renderer through `blixis_builder_preview_renderer` while this transport and final safety boundary stay in place.

## Page structure and layout parity (BWB-150)

The singular article shell is described once by the `blixis_builder_page_shell` filter, exposed to the Blixis theme through `Setup::page_shell()` and resolved by the canvas through `Canvas\\PageShell::for_post()`. Theme page and single templates use that descriptor around their article. The canvas uses it inside the same `main.site-main.site-shell` and `article > .entry-content > .blx-page[data-blx-document]` structure. Both the published frontend renderer and canvas use `PageShell::document_wrapper()` for `.blx-page`; the canvas mount `#blx-canvas-root` is nested inside that wrapper and is the runtime rendering target.

The canvas includes the theme's layout-bearing main and article wrappers and body classes. Theme header, entry title header and footer chrome stay outside the canvas because they are not part of the editable document; the page shell's main width and padding are included because they affect document layout. Canvas body classes are derived from the post and active stylesheet; runtime IDs are isolated in the iframe document and do not overlap editor chrome. In a non-Blixis theme, the safe fallback is a generic `main`/`article`/`.entry-content` around `.blx-page`; BWB-047's theme compatibility guard still decides whether editing is available.

CSS media queries resolve against the iframe's layout viewport, whose width is the editor's selected desktop/tablet/mobile frame width. The protocol's viewport width updates the content breakpoint attribute; it does not substitute the parent window width. Runtime code must use `document.documentElement.clientWidth` or the iframe viewport for layout decisions, never the editor window's width.

The canvas preserves content `lang` and `dir` on `html`, website `data-theme` appearance and native color-scheme metadata. Editor chrome appearance and interface locale remain independent. The Herd browser check compares the selected hero section, container, heading, text and button computed geometry/typography at 1200, 768 and 375 pixels, then compares colors in both website modes. It assumes the demo page's working document has been published by `pnpm dev:demo`, matching the existing browser-check fixture.

## Canvas iframe protocol (BWB-051)

The canvas sends `token-colors` after each successful render and whenever website preview appearance changes. The message contains `mode: light|dark`, an optional render revision, and at most 64 `{ id, value }` entries for active color tokens. The runtime resolves values from its own document element custom properties and transmits only strict hex, numeric `rgb(a)`, or numeric `hsl(a)` strings up to 40 characters. Invalid values are omitted. The parent validates the same contract and retains latest values per website appearance for editor swatches; editor chrome appearance and content locale remain independent.

This section amends the first T6 design (an iframe with `sandbox="allow-same-origin"` and no scripts). That design could not report clicks, sizes or element positions to the editor without running editor code inside the content origin, and any "no scripts" scheme leaves the editor blind. The amended design keeps the guarantee that **document data cannot run code**, but moves it from the sandbox flags to a Content Security Policy and to a trusted runtime that is ours.

### Components

| Part | Where | Role |
|---|---|---|
| Canvas document | PHP, `admin.php?page=blixis-canvas&post=<id>&locale=<l>` (`CanvasScreen`) | A minimal same-origin HTML page: registered Blixis theme parent/child stylesheet, token CSS, compiled theme CSS, a `<meta name="blixis-canvas" content='{"version":1,"cspNonce":"..."}'>`, the shared `main > article > .entry-content > .blx-page[data-blx-document]` structure with `<div id="blx-canvas-root">`, and one `<script src=".../canvas.js" nonce defer>`. The canvas mount is empty until the runtime receives the preview fragment. |
| Response policy | HTTP header of that document | `default-src 'none'; script-src 'nonce-<per response>'; style-src 'self' 'nonce-<per response>'; img-src 'self' data:; font-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-ancestors 'self'`, plus `X-Frame-Options: SAMEORIGIN`, `Cache-Control: private, no-store`. No `unsafe-inline`, no `unsafe-eval`. Fonts are same-origin theme/WordPress uploads; `data:` font sources are not permitted because the theme does not ship data-URI fonts. Built by `EditorHeaders::canvas_list`. |

### Theme fidelity and resource boundary (BWB-128)

The canvas invokes only the active Blixis theme's own style registration method, then reads the theme's known style handles (`blixis-style`, `blixis-parent-style`, `blixis-tokens`, `blixis-theme`) from `wp_styles`. A URL is emitted only when it matches the corresponding URL in the theme build's `Setup::styles()` map, uses the site's HTTP(S) origin, and its path remains under the active child or parent theme directory. This includes the base `style.css` (global font, text and page background rules), generated token CSS and compiled theme CSS. The standalone response does not run the general enqueue action and never copies plugin or wp-admin styles. Links are allowed by `style-src 'self'`; no nonce is needed on same-origin external stylesheets.

WordPress core's `wp_print_font_faces()` is also captured after the theme styles are registered; this is the same Font Library/theme.json printer used by the front end. The canvas retains only complete `@font-face` rules from its output, rejects other CSS/at-rules, and drops individual faces with malformed, `data:`, or non-site-origin `src` URLs. It prints the retained rules in a `style.wp-fonts-local` element with the response nonce. The canvas keeps `font-src 'self'` unchanged: font files on a CDN or another origin are deliberately unavailable in the canvas, while same-origin theme and WordPress uploads remain available. If core's printer is unavailable or there are no safe faces (including non-Blixis theme fallback), the block is omitted. Token CSS has its own nonce-bearing style element.

The frame starts with website mode `light`, independent of editor chrome and visitor local storage. Each validated `mode` message sets both `html[data-theme]` and the root's `data-blx-mode`; it also updates the native `color-scheme` meta value. This activates the same theme token selectors and page colors as the front end. Theme base CSS maps headings to `--blx-font-heading` and body text to `--blx-font-body`. `lang` and `dir` on the canvas HTML come from the requested content locale (`Locale\Direction`), not the editor interface locale.
| Canvas runtime | `apps/editor/src/canvas/runtime.ts`, built to `dist/canvas.js` | The only script in the frame. Plain TypeScript, no React, about 14 KB minified. |
| Protocol | `packages/canvas-bridge` (`@blixis/wp-canvas-bridge`) | Strict message schemas, the two endpoint factories (`createParentEndpoint`, `createCanvasEndpoint`), limits. Pure TypeScript, no DOM types beyond small structural interfaces. |
| Editor integration | `apps/editor/src/canvas/Canvas.tsx`, `useCanvasSession.ts` | Mounts the iframe, performs the handshake, requests previews with the REST client, forwards viewport, appearance, selection and hover, maps pick and hover back to the store. |

### Sandbox flags and why they are acceptable

The iframe is `sandbox="allow-scripts allow-same-origin"`. Both flags are needed by our runtime: `allow-scripts` to run `canvas.js`, `allow-same-origin` so the frame keeps the site origin (it must load the `'self'` script, use the admin cookie for its own document request and exchange `event.origin` values that can be compared exactly). This combination is normally discouraged because a sandboxed document that can run its own scripts and keeps its origin can remove its own sandbox. It is acceptable here only because **content cannot execute anything**:

1. The only script that may run is `canvas.js` (`script-src 'nonce-<per response>'`, the nonce is on the one `canvas.js` tag; deliberately no `'self'`, so same-origin REST JSONP or other plugin scripts cannot run in the frame). Inline scripts, inline event handler attributes, `javascript:` URLs, `eval` and `new Function` are blocked by the policy, whatever is in the HTML.
2. The fragment is sanitized twice: by the PHP preview route (rejects dangerous tags, handlers and active URL schemes, never repairs) and again by the runtime before anything reaches the DOM.
3. The runtime inserts the fragment parsed in an inert `<template>` and adds styles only through one managed `<style nonce>` element after a CSS guard.
4. The frame is never given `allow-top-navigation`, `allow-forms`, `allow-popups` or `allow-modals`, so even a bug cannot navigate the editor, submit forms or open windows.
5. `frame-ancestors 'self'` and `X-Frame-Options: SAMEORIGIN` on the canvas document allow framing only by the site origin (clickjacking), `connect-src 'none'` and `form-action 'none'` close the exfiltration channels a script-less document would still have, and `img-src` has no remote origins.

Two consequences of the policy that later work must not forget:

* **`style=""` attributes are blocked by the CSP.** The policy has neither `unsafe-inline` nor `unsafe-hashes`, so the browser ignores every inline `style` attribute in the preview. The runtime's CSS guard on `style` attributes therefore only protects inert text (what the attribute would contain if it were ever copied elsewhere); it is not what makes inline styles safe, and they do not work. The BWB-044 compiler must never rely on inline styles: all styling goes through compiled CSS in the managed `<style nonce>` element and through the `data-blx-*` attribute hooks.
* **`img-src data:` exists only for theme CSS** (`url(data:...)` inside the theme token stylesheet that the PHP document links). Content is held to a stricter rule than the policy: the runtime refuses `data:` (and `javascript:`, `vbscript:`, `blob:`, `file:`) in every content `src`/`href`-like attribute, and the CSS guard refuses `url(` in compiler CSS altogether.

What the flags do NOT do: they do not stop a bug in `canvas.js` or in the policy. If an attacker found a way to run script in the frame, the frame is same-origin with the admin and could reach the editor window. This is the residual risk of the design (see "What is not guaranteed").

### Handshake (no trusted `window.postMessage` after it)

```
editor (parent)                                   canvas iframe (child)
createParentEndpoint({window, iframe, origin})    iframe loads canvas document; defer canvas.js runs
connect(init) ... listens on window  <---------- hello = { type:'blx-canvas-hello', version:1, nonce }
                                                  posted to window.parent with targetOrigin = own origin
checks: event.origin === expected origin
        event.source === iframe.contentWindow
        schema valid, state === waiting, nonce not used before
creates MessageChannel, keeps port1
init = { type:'blx-canvas-init', version:1, nonce, viewport:{width,breakpoint}, mode, locale, dir }
posted to iframe.contentWindow, targetOrigin = expected origin, transfer [port2] ----------->
                                                  checks: event.origin === own origin
                                                          event.source === window.parent
                                                          nonce === the one it sent
                                                          exactly one port, schema valid, first init only
                                                  removes its window listener, keeps the port
        <======================= MessagePort: all further traffic =====================>
                                                  ready {}  (after it applied init)
```

* The editor sets the iframe `src` only after `connect()` is listening, so the hello cannot be missed.
* After the handshake no `window` message starts anything by itself: the canvas removed its listener, and a further valid hello from the frame (replay or second hello) is only remembered by the editor. A document sends exactly one hello, so a second one can only mean that the frame loaded a new document; it is acted on only together with the iframe's `load` event (next point). The nonce is chosen by the child. It only tells two loads of the frame apart (an init answers the hello it was made for; a hello that was already answered is not answered again). It is **not** an authentication control: the protection against a forged hello is the `event.origin` and `event.source === iframe.contentWindow` check, and only same-origin code running in that exact frame could pass it.
* **Frame reloads.** The editor listens for `load` on the iframe and calls `endpoint.notifyLoad()` for every `load` event. The first load is the document `connect()` was made for and changes nothing, whether its hello arrived before or after the event (they are separate tasks and either order happens). Every later `load` is a reload (Reload Frame, a navigation in the frame): the endpoint closes the old port and goes back to `waiting` (the session shows `connecting` and cancels the in-flight preview), then answers the new document's hello. Because the reloaded document's hello can also arrive BEFORE its `load` event, a hello received while connected is remembered and answered right when the confirming `load` arrives, so neither order drops a good connection and a stray hello alone never replaces a live one. The init of that handshake uses the current viewport, appearance and locale (`getInit`). After the next `ready` the session sends `viewport`, `mode`, `select` and `hover` again and the last `render` (or fetches a fresh preview when the document changed meanwhile). A reload that never says hello times out like the first load (`handshake-timeout`, retry button). `reset()` remains the explicit form used by tests.
* A handshake that does not complete within `timeoutMs` (default 10 s) reports `handshake-timeout`; the UI shows a retry that creates a new frame.
* Port messages that fail the schema are dropped and counted, never thrown. After 20 invalid messages the endpoint closes the port and reports `protocol-violation` to its owner, which shows a "preview disconnected" alert with a reload button.
* `close()` closes ports, removes listeners and stops the timer; callbacks never fire afterwards. A throwing owner callback cannot break an endpoint.

### Messages (protocol version 1, all strict: unknown types, extra keys, wrong types, accessors, symbol keys, non-plain objects and oversize payloads are refused)

Parent to canvas:

| Type | Fields and limits |
|---|---|
| `render` | `html` string at most 1,048,576 characters; `css` string at most 262,144; `revision` non-negative safe integer |
| `viewport` | `width` integer 200..4000; `breakpoint` matching `^[a-z][a-z0-9-]{0,31}$` |
| `mode` | `mode` `light` or `dark` (website content appearance) |
| `select`, `hover` | `id` element id or `null` |
| `scroll-to` | `id` element id |
| `request-rects` | `revision` non-negative safe integer; asks for ONE `rects` answer |
| `ping` | `n` non-negative safe integer |
| `edit-start` | `id`, inline `prop`, bounded string/rich `value`, `editable: true`, `mode`, content `locale` and `dir`; only one active session |
| `edit-command` | allow-listed command `name` plus bounded `args`; content is never HTML |

The edit-command allow-list includes `toggle-mark`, `set-link`, `clear-link`, `set-style`, `clear-marks`, `select-all`, and `collapse-selection`. `collapse-selection` has no arguments and places the caret at the end of the active text selection. `apply-to-all` accepts only an allow-listed nested edit command and its validated arguments; the runtime temporarily selects the textblock, applies the operation, restores the previous selection, and focuses the canvas editor. Style fields accept only token ids or an enumerated weight; `null` clears the selected color/highlight value. Link URLs use the shared safe URL validator. Both protocol boundaries validate these commands before dispatch.
| `edit-end` | `commit` boolean |

Canvas to parent:

| Type | Fields and limits |
|---|---|
| `ready` | none |
| `rendered` | `revision` |
| `size` | `width`, `height` positive integers at most 100,000 |
| `scroll` | `x`, `y` finite coordinates within +-1,000,000; emitted once after ready/render and rAF-throttled on scrolling |
| `pick` | `id` element id; `shift`, `alt` booleans |
| `hover` | `id` element id or `null` |
| `rects` | Only as the answer to `request-rects`. `revision` is the render revision the rectangles were measured on (the canvas' last applied one, 0 before the first render), so the requester can drop an answer for another render; `items` at most 5,000 of `{ id, x, y, w, h }`, finite numbers within +-1,000,000, `w` and `h` not negative |
| `error` | `code` one of `unsafe-html`, `unsafe-css`, `too-large`, `render-failed`, `invalid-message`, `internal` (never free text) |
| `pong` | `n` |
| `edit-request` | `id`; emitted for a double-click on an element candidate |
| `edit-ready` | active `id` and `prop` |
| `edit-change` | active `id`, `prop`, bounded model JSON or plain string |
| `edit-selection` | active id, empty flag, bounded marks/text and optional bounded viewport rectangle |
| `edit-ended` | active `id`, `commit` or `cancel` reason |
| `edit-error` | short error code, no content or exception text |

Element ids use the pattern of core's `ID_PATTERN` (the drift test is in `packages/canvas-bridge/src/messages.test.ts`: it fails if the bridge copy changes). Importing core into the runtime would bundle zod into the frame, so the pattern is copied. Validators return `{ ok: true, value }` or `{ ok: false, reason }` with `reason` one of `malformed`, `unknown-type`, `invalid-field`, `too-large`: they never throw (even for hostile proxies) and never echo the payload. Both directions validate both what they receive and what they send.

### Runtime rules (`canvas.js`)

The document CSP remains nonce-only. `canvas.js` captures its own script element nonce at startup. On the first accepted `edit-start`, it derives sibling `richtext.js` from its own same-origin URL, preserves the manifest version query, and inserts one nonce-bearing script; it caches both successful and failed load attempts. Missing nonce, cross-origin URL, bad target, or load failure returns a short `edit-error` code. The frame remains usable. `richtext.js` is a separate lazy bundle and is not loaded by the public frontend.

Editing traffic uses the same MessagePort and strict exact-shape validators. Content crosses the port only as legacy strings or the ADR 0014 rich JSON model; HTML never crosses it. `edit-change` is bounded at the bridge and validated again by the editor registry/core before it can become a translation command. A single active session is allowed. The parent commits only the final value once with `coalesceKey=rich:<id>:<prop>:<locale>`; cancel discards the pending value. Preview refresh is deferred while the canvas editor is mounted.

* Reads and strictly validates the meta tag (at most 1 KiB, exactly `version` 1 and a `cspNonce` of 16 to 64 base64 characters); without it, or without `#blx-canvas-root`, it does nothing.
* `render`: the HTML is parsed in an inert `<template>`. The whole fragment is refused (`unsafe-html`, `too-large` above 50,000 elements) if it contains `script`, `iframe`, `frame`, `frameset`, `object`, `embed`, `applet`, `form`, `link`, `meta`, `base`, `style`, `noscript`, `template`, SVG `use`/`foreignObject`/animation elements or `math`, an attribute starting with `on`, `srcdoc`, a URL attribute (`href`, `src`, `srcset`, `action`, `formaction`, `poster`, ...) whose value, after removing whitespace and control characters, starts with `javascript:`, `data:`, `vbscript:`, `blob:` or `file:`, or a `style` attribute that fails the CSS guard. Accepted `title` attributes are stripped before insertion because native browser tooltips cannot use editor chrome styling. On refusal the previous content stays.
* CSS goes into ONE managed `<style nonce>` element (its text is replaced). The CSS is refused (`unsafe-css`) if it contains `</style`, `<!--`, `@import`, `@charset`, `url(`, `image-set(`, `src(`, `expression(`, `-moz-binding`, `behavior:` or `javascript:`, after comments are removed and CSS escapes (`\75 rl(`) are decoded, or non-printable, bidi-control or zero-width characters, or exceeds the cap. A separate fixed nonce `<style>` draws only the hover outline from `data-blx-hover` (no inline styles); the selected outline is owned by the editor overlay outside the iframe.
* `viewport` sets `data-blx-breakpoint` on the root; `mode` sets `html[data-theme]`, native color-scheme metadata and root `data-blx-mode` to the selected website appearance. The parent sizes the frame. `select` is accepted for protocol symmetry; selected styling is owned by the parent overlay. `hover` marks elements and survives re-renders. `scroll-to` scrolls an element into view.
* **Canvas interaction guard (BWB-133):** trusted runtime listeners run in document capture phase and stop interactive events before content handlers or browser defaults. Click, auxclick, context menu, double-click, submit/reset, Enter/Space activation, pointer/mouse down, drag/drop, touch start, and form/media/detail action events are guarded. Primary, middle and right activation report a `pick` for the nearest valid `[data-blx-id]`; a text hit inside a link therefore selects its owning element. Input controls do not accept keyboard edits; the active Tiptap root is the only exception during its parent-approved edit session. Links cannot navigate or open a new target, controls cannot submit or toggle/play, and content never receives activation events. `change`, `input`, `play` and `toggle` are post-action notifications in the platform and are stopped as defense in depth; their initiating activation is prevented. The runtime does not set `inert`, disable controls, or alter content attributes. It does not intercept wheel or non-activation scrolling keys, and Space on ordinary page content still scrolls. Interactive content uses the default cursor. The PHP renderer and runtime HTML guard continue to reject `javascript:` URLs; inline content scripts are disallowed by the CSP. This guard does not replace the sandbox or CSP.

Hover is reported on `pointerover` with a 50 ms throttle (the last value wins) and `null` when the pointer leaves. Layout is measured in at most ONE `requestAnimationFrame` pass per frame: a render and any number of `ResizeObserver` notifications only schedule that pass, which reports `size` (only when it changed) and document scroll coordinates after ready/render and on scroll. The expensive part, one `getBoundingClientRect` per element (up to 5,000, a message of about 250 KB), runs only for a `request-rects` message: requests in the same frame are answered by a single `rects` message with coordinates relative to the document. Nothing sends `rects` unrequested.
* It never calls `eval` or `Function`, never reads cookies or storage and never navigates; a test greps the source and the built bundle for these.

### Editor side

* `Canvas.tsx` renders `<iframe title sandbox="allow-scripts allow-same-origin">`; `bootstrap.canvasUrl` (optional, same-origin, validated like the other URLs) is the base, and the editor adds `locale=<content locale>`. Without `canvasUrl` (or without a REST client) the old placeholder is shown.
* Previews use only `RestClient.preview({ document, locale: contentLocale, mode: previewMode })`: debounced by 150 ms, the previous request is aborted by every new change, answers are tagged by a request counter and stale ones are ignored, and nothing is requested while the document is not ready or the canvas has not sent `ready`. The counter is the `render` revision, and `rendered { revision }` clears the error state.
* Errors are shown from the catalogs only (never server text): a `role="alert"` with a retry button for a failed preview, and a separate alert with a reload button for a timeout or a protocol violation; `role="status"` while connecting.
* A change of the content language creates a new frame (the locale is part of the canvas URL and of the init), so the content direction and `lang` of the preview always match the language being edited. The session requests rectangles after ready, rendered, size and selection changes, with one rAF-coalesced request; it filters replies to the selected id and the canvas last-rendered revision, retaining those rectangles when a later preview request fails. Scroll updates only reposition the clipped overlay and never request another full rectangle scan.
* Frame widths: desktop fills the area; tablet is 768 px and mobile 375 px, centred and never larger than the area. The content is not scaled; the width is reported with `viewport`. The `breakpoint` is the settings slice's `breakpointId`. The desktop width is measured again whenever the area resizes (the window, the panels): a `ResizeObserver` on the canvas container, throttled to one measurement per animation frame, sends `viewport` only when the width changed and only while the desktop viewport is selected.
* Both choice controls are single-choice groups with the same pattern: the viewport control in the toolbar and "Preview appearance" in the canvas bar are `radiogroup`s of `role=radio` items with `aria-checked` (the same Radix toggle group), with roving focus. The iframe title uses the display name of the content language in the editor language (`Intl.DisplayNames`, for example "Page preview (French (France))"), and the locale id only as the fallback; no names are hard-coded.

### How the protocol is tested

* `packages/canvas-bridge/src/*.test.ts`: schemas and limits (`messages.test.ts`), handshake with fake windows and ports (`endpoints.test.ts`, including the load/hello race orders) and `real-channel.test.ts`, which runs the REAL parent and canvas endpoints over Node's real `MessageChannel`/`MessagePort` (transfer with the init, started ports, close, posting after close, a flood of invalid messages); only the two windows are simulated.
* `apps/editor/src/canvas/*.test.ts(x)`: the runtime in jsdom (hostile fragments, frame batching, `request-rects`, scroll) and the session hook with a fake endpoint (reload recovery, width measurement, request coalescing and rectangle filtering).
* `tooling/herd/editor-browser-check.mjs`: a real browser against the Herd site: header and sandbox, real click, a forged handshake from a second frame, a frame reload, and a CSP enforcement probe.
* `apps/editor/src/styles.test.ts`: the built `canvas.js` contains no React, `eval`, `new Function`, cookie, `localStorage`, `sessionStorage`, `indexedDB`, `location.assign`, `location.replace` or `window.open`.

### Threats and mitigations

| Threat | Mitigation | Test |
|---|---|---|
| Forged hello from another window or origin | `event.origin`, `event.source === iframe.contentWindow`, schema and state checks; failures are silent. The nonce is not part of this defence (see Handshake) | `endpoints.test.ts` (wrong origin, null origin, other window, null source, bad schema) |
| Confusion between loads of the frame (replayed, second or late hello) | One handshake per load; a hello while connected only counts together with the confirming `load` event; answered nonces are not answered again | replay, double hello, reset and `notifyLoad` race tests (`endpoints.test.ts`) |
| Forged init to the canvas | Origin, `event.source === window.parent`, the canvas' own nonce, exactly one port, once | canvas endpoint tests (wrong nonce, no port, two ports, double init) |
| Port theft | The port is transferred once with `targetOrigin` set to the expected origin; the parent keeps `port1` private; a different origin cannot receive it | init target origin test |
| Hostile render payload (HTML) | Server sanitizer, runtime tag/attribute/URL refusal in an inert template, CSP blocks inline script and handlers anyway | `runtime.test.ts` hostile fragments (script, svg, handlers, obfuscated schemes, srcset, template, math, noscript) |
| CSS exfiltration and CSS injection | No `url(`, `@import`, `image-set(`, `src(`, `expression(`, escapes decoded first, no `</style`; style element has a nonce; policy limits fetches | CSS guard tests |
| Message flood or oversize | Hard limits on every field, 20-invalid-message shutdown, bounded rect list | schema boundary tests, shutdown tests |
| Prototype pollution through messages | Own data properties only, null-prototype copies, unknown keys refused | hostile object tests |
| Preview loops and huge output (T18) | 150 ms debounce, abort of the previous request, response caps, 1 MiB/256 KiB limits on both ends | session tests |
| Inline script or handler injected into the frame (CSP enforcement) | `script-src` with only the response nonce, without `unsafe-inline`: an injected `<script>` text and `onerror` run nothing and the browser reports the violation | `tooling/herd/editor-browser-check.mjs` CSP probe |
| Forged handshake from a second same-origin frame | Origin plus `event.source` check: a hello from any window but the canvas iframe is ignored, no extra port is created | `editor-browser-check.mjs` forged handshake, `endpoints.test.ts` |
| Clickjacking of the canvas document | `frame-ancestors 'self'` and `X-Frame-Options: SAMEORIGIN` | PHP header tests |

### What is NOT guaranteed

* A compromise of `canvas.js` or a mistake in the canvas document's policy would give an attacker script in a frame that has the site origin. The sandbox does not contain that; the defence is the CSP, the two sanitizers and a small, dependency-free runtime.
* The runtime trusts the PHP document for the theme token CSS (`<link>`/`<style>` it contains are authored by the site, not by document data).
* The canvas is not an isolation boundary against the admin user: a user who can edit a document can already do everything the editor does.
* Resource use inside the frame (very large but valid HTML, expensive CSS selectors) is bounded by size limits only, not by time.
* Older browsers without `MessageChannel`, `ResizeObserver` or `<template>` are unsupported; the canvas then reports a timeout.
* `rects` feed the selected-element outline and future drag and drop. The editor requests them on ready, render, size and selection changes, coalesced to one request per animation frame; hover never triggers a rectangle scan.
