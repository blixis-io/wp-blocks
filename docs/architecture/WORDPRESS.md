# WordPress Integration Specification

## Supported environment

Baseline decided in [ADR 0001](adrs/0001-supported-environments.md): WordPress 7.0+ (Font Library available to classic themes from 7.0, verified against wordpress.org documentation), PHP 8.2+ proposed pending owner confirmation. Test multisite even if initial launch does not promise full support.

## Plugin/theme responsibilities

For singular builder documents, the `blixis_builder_page_shell` filter is the shared markup contract between theme templates, the public renderer and the isolated canvas. The Blixis theme supplies the main layout classes and article shell; the plugin supplies a generic wrapper for non-Blixis themes. The canvas does not execute theme PHP templates or call `get_header()`: it includes layout-bearing wrappers only. See [Canvas contract](CANVAS-CONTRACT.md#page-structure-and-layout-parity-bwb-150).

- Theme: PHP templates, styles, `theme.json`, optional safe presentation defaults, onboarding entry point, theme compatibility declaration.
- Plugin: editor, post meta, revisions, renderers, dynamic data, API, capabilities, extension registry. Content survives theme changes.
- Premium: separately distributed optional plugins; never ship restricted inactive premium functionality inside WordPress.org-hosted Free code.

## Builder plugin bootstrap

`wordpress/plugin/blixis-builder.php` checks the PHP 8.2 and WordPress 7.0 floors before loading Builder classes. An unsupported site receives an admin notice and no Builder hooks; the plugin does not fatal. The plugin maps `Blixis\Builder\` classes directly to `src/ClassName.php` with a small local autoloader, without Composer at runtime. Activation stores the package version once in the current site's non-autoloaded `blixis_builder_version` option; network activation initializes each existing site independently. Reactivation never replaces an existing value. Deactivation only unregisters runtime hooks through WordPress's normal request lifecycle: it deletes no content or options. `uninstall.php` removes only `blixis_builder_version` for the current site; network uninstall removes that option on each site. Documents and other site data remain intact for later portability and fallback work (BWB-040 and BWB-047).

## Builder post-meta persistence

Working layout, locale content, publication pointer, and immutable snapshots use separate protected postmeta keys under ADR 0003 §3. Fixed keys are registered per editable public REST post type; `blixis_builder_post_types` defaults to `post` and `page`. Dynamic key capabilities are restricted to valid builder keys and `edit_post`; all builder keys stay out of core revision/autosave meta. Writes use the storage repository's per-row CAS, while first inserts use a per-key advisory lock because postmeta has no unique key. Full document schema validation is BWB-043; current checks cover the 2 MiB envelope and revision fields. See [BWB-040 spike](spikes/BWB-040-persistence.md) for the contract, sanitize fallback, revision decision, and smoke-test gaps.

# Editor screen (BWB-049)

## Blixis admin menu (#266)

When active on a supported site, the plugin publishes `blixis_builder_admin_menu_slug` with the value `blixis` and registers the top-level Blixis menu below Comments. The theme reads that filter when registering its setup wizard: with the plugin active the wizard is a submenu at `admin.php?page=blixis-setup`; without it the theme retains the standalone Appearance → Blixis setup page. The legacy `themes.php?page=blixis-setup` URL redirects to the plugin page when the menu is active. The theme must not depend on plugin classes or menu registration to render or complete setup.

The menu entries are Setup Wizard (`edit_theme_options`), Global Styles (`edit_theme_options`), Templates (`edit_theme_options`), Theme Builder (`edit_theme_options`), Assets (`upload_files`), Settings (`manage_options`), and Help & Support (`edit_theme_options`). Assets uses only the core `/wp/v2/media` API; the core Media Library screen is unchanged. Plugin page assets live in `assets/admin/` and are part of the free package allowlist. The setup notice preference is `blixis_show_setup_notice`; Settings updates it through the Settings API.

The Setup Wizard Welcome step presents template cards with a full-width 16:10 preview, visible template name and localized category; the longer description remains available to assistive technology. The selected template palette and font pairing lead their respective choice groups. The template font card reports Font Library installation status and exposes installation in the same card. The admin stylesheet keeps four template cards per desktop row and adapts the gallery and choice grids at narrower widths. These are presentation rules only: template data remains validated by the theme adapter and selection still uses the existing wizard form fields.

The plugin serves an isolated editor document at `wp-admin/admin.php?page=blixis-editor&post=<id>[&locale=<locale>]`. The page is hidden from the admin menu and is rendered before the normal admin template, without `wp_head`, `admin_head`, admin styles, or admin scripts. The only application assets are `assets/editor/editor.css` and `assets/editor/editor.js`, loaded from `wordpress/plugin/assets/editor/` using the validated manifest hash as the cache version. The frontend build produces `apps/editor/dist/`; packaging copies that output into the plugin asset directory.

The URL parser accepts a strictly positive decimal post ID within the PHP integer range. `admin_init` renders only when WordPress identifies the request as `admin.php`, so matching `page` parameters on `admin-ajax.php` or `admin-post.php` cannot render the editor. A missing or invalid locale falls back to the site's configured default; valid locales must also be enabled. Bootstrap locales are checked against the same grammar as `MetaKeys::is_valid_locale` (`^[a-z]{2,3}(_[A-Za-z0-9]{2,8})*$`, at most 20 characters); invalid enabled entries are dropped and an invalid editor-interface locale falls back to `en_US`. Authentication is left to WordPress's admin login flow. For an authenticated user, missing posts, non-opted-in post types, and failed `edit_post` checks all produce the same generic 403, so the response does not reveal post existence. Compatible themes enable editing. An incompatible theme still permits the document in read-only mode and passes the stable `ThemeStatus` reason as `lockReason` (ADR 0002 §5: data remains readable while editing is locked).

The document response is private and non-cacheable. It sets `nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: same-origin`, and a restrictive CSP: no default sources, same-origin scripts/styles/connections/frames, images from `self` and `data:` only, same-origin fonts, no base URL, no objects, and same-origin form/frame ancestors. The style nonce in `style-src` matches `cspNonce` in that response's bootstrap and is regenerated per request. No inline executable script is used; bootstrap JSON is in an `application/json` script element with JSON_HEX escaping. A permalink is sent as `viewUrl` only when its scheme, host and effective port match the admin origin; `adminUrl` and `canvasUrl` have same-origin fallback handling. `restRoot` remains the WordPress REST URL, including installations that deliberately configure it cross-origin.

The editor document's `script-src 'self'` requires the plugin JavaScript and CSS asset URLs to be same-origin with the admin document. A cross-origin plugin asset URL (for example, via a CDN or `WP_PLUGIN_URL`) is unsupported: the browser blocks the editor bundle under CSP, leaving the application root blank and the editor unusable. Configure plugin assets on the WordPress origin.

Bootstrap contract v1 (the editor validates this shape):

| Field | Meaning |
|---|---|
| `version` | Contract version, `1`. |
| `restRoot`, `wpRestRoot`, `nonce` | Absolute Blixis `blixis/v1` and core `wp/v2` REST roots, plus the WordPress REST nonce. `wpRestRoot` must be same-origin HTTP(S) so the nonce is never sent cross-origin. |
| `maxUploadBytes`, `canUpload` | `wp_max_upload_size()` and `current_user_can( 'upload_files' )`; the editor validates the byte limit and hides upload controls without the capability. |
| `postId`, `postTitle`, `postType` | Current post identity and stored title as plain text (tags stripped and entities decoded, capped at 200 characters). The browser `<title>` is separately HTML-escaped. |
| `contentLocale` | Selected enabled website-content locale. |
| `defaultLocale`, `enabledLocales` | Site translation configuration. |
| `editorLocale` | `get_user_locale()` for editor chrome; independent from `contentLocale`. |
| `pluginVersion`, `themeName` | Running plugin and active theme display versions/names. |
| `editingEnabled`, `lockReason` | Edit capability and theme-lock explanation; reason is null when unlocked. |
| `adminUrl`, `canvasUrl`, `viewUrl` | Post edit/list destination, absolute same-origin canvas document URL (null when unavailable), and permalink (null when unavailable). |
| `contentLocaleExplicit` | True only when the editor link itself named an enabled content locale; generic links (row actions, admin bar) omit `locale`, so the editor may restore the user's remembered locale. |
| `cspNonce` | Per-response nonce (base64 of 18 random bytes) that the response's `Content-Security-Policy` allows for `<style>` elements. |

**Why a style nonce.** The policy is `style-src 'self' 'nonce-<random>'` with no `unsafe-inline`: the bundled Radix dialogs lock page scrolling by injecting a `<style>` element, which a real browser blocks otherwise (found by the real-browser check; jsdom does not enforce CSP). The editor hands the nonce to those libraries through `__webpack_nonce__` before the first render; a malformed nonce can never reach the header (`EditorHeaders::is_valid_nonce`).

`manifest.json` is limited to 4096 bytes and must be JSON version 1 with the exact filenames `editor.js`, `editor.css`, and `canvas.js`, plus lowercase 64-character SHA-256 values `jsSha256`, `cssSha256`, and `canvasJsSha256`. All seven keys are required and additional keys are rejected. Missing or malformed assets produce a friendly administrator notice and a generic unavailable message for other users; they never cause a PHP fatal error.

## Canvas document (BWB-051)

The preview iframe loads `wp-admin/admin.php?page=blixis-canvas&post=<id>[&locale=<locale>]`, a hidden `admin.php` page rendered as a standalone HTML document before WordPress admin chrome. Its post and enabled content-locale parsing, login redirect, and uniform 403 for missing, forbidden, or non-opted-in posts match the editor. Theme incompatibility does not block the canvas because it only views a preview. `<html lang>` and `dir` come from the website content locale (including RTL direction), independent of the editor-interface locale.

The document contains the root `#blx-canvas-root` and the manifest's `canvas.js` runtime. For a Blixis-compatible active theme, existing `assets/css/tokens.css` and `theme.css` are linked when present. The saved `blixis_design_system` option is rendered by `Canvas\TokenCss`; names and values use the theme's token-name grammar and `SAFE_VALUE` character rule, with URL constructors explicitly refused. Invalid names/values are skipped. Base values and sparse dark values use the same `:where(:root)`, `[data-theme="dark"]`, and auto dark media selectors as `DesignSystemStore::css()`, plus explicit root light/dark mode selectors for the canvas. The inline style has only the per-response nonce. The canvas runtime receives sanitized preview HTML/CSS as text through the same-origin MessageChannel protocol; document data is never executable script.

Canvas response headers are private/no-store, `nosniff`, `X-Frame-Options: SAMEORIGIN`, and `Referrer-Policy: same-origin`. Its CSP is `default-src 'none'; script-src 'nonce-<n>'; style-src 'self' 'nonce-<n>'; img-src 'self' data:; font-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; object-src 'none'`. `font-src` intentionally remains same-origin only: Blixis ships no data-URI font faces, and WordPress Font Library files are served from the site. The canvas loads the active Blixis theme's registered parent/child base stylesheet, generated token CSS and compiled theme CSS after checking each known handle against `Setup::styles()`, the same origin and the active theme directory. It does not run global style enqueue hooks or include plugin/admin styles. Same-origin stylesheet links are allowed by `style-src 'self'`; the `canvas.js` script tag carries the per-response nonce, as do inline token and runtime style blocks. There is deliberately no `'self'` in canvas `script-src`, preventing arbitrary same-origin scripts. The nonce is fresh per response and JSON_HEX-encoded in the `blixis-canvas` meta attribute. If `plugins_url()` points to another host (for example, a CDN or `WP_PLUGIN_URL`), the nonce still authorizes `canvas.js`; this does not add that host to `connect-src` or any other directive. The editor document has a separate policy and still requires same-origin plugin assets as described above.

The canvas starts in explicit light website mode; validated preview mode messages set `html[data-theme]`, `data-blx-mode`, and the native `color-scheme` metadata together. This reuses front-end theme selectors without reading visitor local storage or editor chrome state. HTML language and direction follow the content locale.

The editor bootstrap's `canvasUrl` is an absolute admin URL only if its origin matches `admin_url()`; otherwise it is null and the editor shows its unavailable placeholder. Asset manifest v1 strictly requires `version`, `js`, `css`, `jsSha256`, `cssSha256`, `canvasJs`, `canvasJsSha256`, fixed asset filenames, lowercase SHA-256 digests, and all three files on disk. Bundles without the canvas runtime are not built for this contract.

## Document REST API

### Page settings (BWB-155 / #252)

`_blixis_seo` and `_blixis_page_version` are endpoint-owned post meta: their `auth_callback` and `map_meta_cap` entries deny every user, so XML-RPC, core REST and `edit_post_meta` cannot write them; `Seo\Head` additionally treats the stored envelope as untrusted when rendering. Page settings writes use their own rate-limit bucket (`blxpage_`, separate from publishing).

`GET` and `PUT /blixis/v1/documents/{id}/page` expose the WordPress page title, slug, status, excerpt, featured image and per-content-locale SEO values. Access matches document routes (`edit_post` on an opted-in public REST post type); cookie writes use WordPress REST nonce middleware. Writes require the quoted opaque `If-Match` token returned as `version`/ETag, derived from a per-post write counter (protected meta `_blixis_page_version`, bumped by every write so two writes inside one second still differ), `post_modified_gmt` and the post ID; the check is repeated under the per-post storage lock before writing. A missing token is 428 and a stale token is 409 with the current version. The request policy strictly validates all submitted fields and rejects the whole request before any write if one field is invalid. Page fields use `wp_update_post`, featured media uses thumbnail APIs, and SEO is stored only in protected `_blixis_seo` JSON `{ schemaVersion: 1, locales }`; it is excluded from core REST and revisions.

SEO head tags are emitted by `Seo\\Head` only for singular builder posts without a known SEO plugin and never on password-protected pages or authorized draft previews. It uses current website locale with configured default fallback, escapes all values, validates the canonical and social image URLs, and replaces core canonical output on those pages. Editor interface locale is independent of this content locale. A successful update emits the existing content-free `blixis_builder_publication_event` audit envelope with kind `page-settings`.

BWB-041 registers these working-stream routes under `blixis/v1`:

| Method | Route | Result |
|---|---|---|
| `GET`, `PUT` | `/documents/{post_id}/layout` | Shared layout stream |
| `GET`, `PUT` | `/documents/{post_id}/content/{locale}` | One locale content stream |
| `POST` | `/documents/{post_id}/preview` | Non-cacheable structural canvas fragment from request document or working streams |

Every route checks authentication, an existing post of a type in `MetaRegistration::post_types()`, and `edit_post` for that exact post. The post must be an opted-in public REST type. For THREAT-MODEL T2, missing posts, excluded post types, and insufficient capability all return the **same 403** `blixis_forbidden`, so the response does not reveal post existence. Anonymous requests return 401 `blixis_unauthenticated`. Per-locale capability checks are reserved for a later issue; `edit_post` is the current policy. Locale syntax follows `MetaKeys::is_valid_locale`.

Cookie-authenticated clients send `X-WP-Nonce` from WordPress REST nonce creation. Core `rest_cookie_check_errors` rejects an invalid nonce with 403 `rest_cookie_invalid_nonce`. Core treats an absent nonce as an anonymous request, so a cookie write without a nonce gets 401 `blixis_unauthenticated` and nothing is written (verified in the real-WordPress smoke). Other WordPress authentication methods follow their normal core behavior. GET performs only a repository read and never changes state. Successful reads return `{ "revision": n, "document": <decoded JSON> }`; an unwritten stream returns revision `0` and document `null`. Responses include `ETag: "<revision>"` and `Cache-Control: private, no-store`.

PUT requires `Content-Type: application/json`, a JSON envelope object of at most 2 MiB, and a strong quoted integer `If-Match: "<expected revision>"`. The repository validates the envelope through its `DocumentValidator` seam and rejects JSON depth over 32 or more than 50,000 JSON values. Layout trees with duplicate IDs or more than 5000 nodes are also rejected before writing. It overwrites the envelope's stream revision with the next CAS revision and preserves unknown fields. Full schema validation is BWB-043. Success returns `{ "revision": n }` and the new ETag. These routes cannot address `_blixis_published` or immutable snapshot keys; publication uses a separate API.

| Status | Code | Cause |
|---|---|---|
| 400 | `blixis_invalid_post_id` | Invalid post ID. |
| 400 | `blixis_invalid_locale` | Invalid locale. |
| 400 | `blixis_invalid_mode` | Invalid mode. |
| 400 | `blixis_invalid_revision` | Invalid revision. |
| 400 | `blixis_invalid_page_settings` | Page settings are invalid. |
| 401 | `blixis_unauthenticated` | Authentication is required. |
| 403 | `blixis_forbidden` | Access is forbidden. |
| 403 | `rest_cookie_invalid_nonce` | WordPress core rejects cookie nonce |
| 404 | `blixis_revision_not_found` | Revision not found. |
| 404 | `blixis_snapshot_not_found` | Snapshot not found. |
| 404 | `blixis_media_not_found` | Media not found. |
| 409 | `blixis_conflict` | Revision conflict. |
| 409 | `blixis_snapshot_missing` | Snapshot is missing. |
| 409 | `blixis_base_layout_snapshot_missing` | The content snapshot base layout is missing. |
| 409 | `blixis_layout_not_published` | Layout is not published. |
| 409 | `blixis_publish_blocked` | Publication is blocked. |
| 409 | `blixis_snapshot_limit` | Publish would exceed 200 stored snapshots, or rollback would exceed its recovery ceiling of 240. |
| 413 | `blixis_too_large` | Request is too large. |
| 422 | `blixis_invalid_document` | Invalid document. |
| 422 | `blixis_locale_mismatch` | The content belongs to another locale. |
| 422 | `blixis_nothing_to_publish` | Nothing to publish. |
| 423 | `blixis_theme_incompatible` | The active theme does not support Blixis editing. |
| 428 | `blixis_precondition_required` | If-Match is required. |
| 429 | `blixis_rate_limited` | Publication rate limit reached. |
| 500 | `blixis_storage_error` | Storage failed. |
| 500 | `blixis_preview_failed` | Preview failed. |
| 400 | `blixis_invalid_template_request` | Template request is invalid. |
| 400 | `blixis_font_install_failed` | Template fonts could not be installed. |
| 404 | `blixis_template_not_found` | Template not found. |

`POST /documents/{id}/unpublish` uses `edit_post`, the REST cookie nonce, the publication rate bucket, the per-post pointer lock and a quoted `If-Match`. Its body must be empty or `{}`. It advances the pointer to an unpublished tombstone (pointer revision increases; layout and locale references are removed) and retains snapshot rows and working streams. It does not bump the render-cache epoch: frontend readers resolve the pointer before cache lookup, so the tombstone selects the ordinary WordPress content path. The tombstone preserves locale keys with empty entries so `GET /published` reports each locale as unpublished. A repeated unpublish returns 422 `blixis_nothing_to_publish`; stale revisions return 409 and missing `If-Match` returns 428. The `blixis_builder_publication_event` hook also emits content-free `kind=unpublish` events with a null locale.

Plugin errors use `WP_Error` with stable codes, fixed messages from `Rest\ErrorCatalog`, and `data.status`. WordPress reports invalid route arguments as `rest_invalid_param` with the `blixis_*` code under `data.details.<arg>.code`.

The [canvas contract](CANVAS-CONTRACT.md) specifies the preview request and response, iframe sandbox, size limits and renderer boundary. Preview shares the permission policy above. Its request body is JSON (2 MiB maximum) with optional `locale` (site locale by default), `mode` (`light` by default) and `document` (unsaved envelope). It never reads published pointers or snapshots. Preview-specific errors are 400 `blixis_invalid_locale` / `blixis_invalid_mode`, 413 `blixis_too_large`, 422 `blixis_invalid_document`, and generic 500 `blixis_preview_failed`; authentication errors and core nonce errors are as above. Successful responses carry `Cache-Control: private, no-store`. The editor client allows a 7,868,416-byte JSON transport response: the 1,310,720 decoded HTML/CSS character allowance can expand to six bytes per UTF-16 code unit under WordPress `wp_json_encode` escaping (`\\uXXXX`; astral characters use two escapes), plus 4 KiB for the envelope. After parsing, it still rejects HTML above 1,048,576 characters or CSS above 262,144 characters.

## Theme first-run wizard

1. Theme activation is observed through `after_switch_theme` (do not assume it is fired synchronously during click).
2. If not configured and authorized, show non-blocking admin notice with `Start setup` and `Dismiss`.
3. Wizard route is capability-protected; CSRF secured; stages: choose preset/custom → colors → typography/fonts → spacing/radius/layout → preview → apply.
4. Save validated settings atomically; `setup_completed` only after successful persistence. Support resume, back, cancel and future Design System edits.
5. Reactivation preserves existing settings; distinguish site-wide global settings from per-user wizard UI state.
6. Respect WP multisite site context and child-theme compatibility.

## Native fonts

- Use WordPress-managed Font Library instead of custom asset ownership.
- Discover installed font families and available variants, present preview/fallback, avoid duplicates and unnecessary Google-hosted runtime requests.
- Ensure font declarations work in canvas and public renderer and are not injected twice.

## Bundled template data (BWB-157)

The plugin ships four mockup template packs under `templates/packs/`. `Templates\TemplateValidator` validates every pack scalar and nested prop, localization, style and animation value, confines asset paths, enforces category and option allowlists, and parses SVG against an inert element/attribute allowlist. Template categories are `corporate`, `agency`, `real-estate`, `ecommerce`, `blog`, `portfolio`, `saas`, and `other`. Invalid packs are skipped and available from `Library::problems()` for debugging. A filter may add directories through `blixis_builder_template_packs`; filtered packs use the same validation. Duplicate IDs are reported and the first valid pack wins. Asset URLs are built from the validated directory only when it is inside the plugin or WordPress uploads directory; other roots remain available as validated metadata but have no asset URLs and are flagged in `problems()`.

`GET /blixis/v1/templates` and `GET /blixis/v1/templates/{id}` require `edit_theme_options`, WordPress REST cookie authentication and its nonce. Responses are private and non-cacheable and contain validated fields and URLs only. `POST /blixis/v1/templates/{id}/fonts` requires an empty body and installs only allowlisted bundled font files; it checks both `edit_theme_options` and `upload_files`, records each authenticated attempt in the `blxtpl_` rolling-hour bucket before installation (failures count), and takes a 30-second per-family `add_option` mutex around each install. Font MIME checking passes WordPress `wp_get_allowed_font_mime_types()` to `wp_check_filetype()` and accepts the core TTF MIME variants; a fixed extension/MIME fallback covers older environments. The content-free `template-font-install` audit event includes `templateId` and the installed allowlisted `familySlugs`. WordPress 6.5+ registers the local `blixis` Font Collection; older core versions skip registration and return a clear install result.

Pack documents are preserved for later importing but are marked `importable: false` where their types or props do not match the current core registry. Unsupported types and props are listed in each document's `importabilityReasons`; the import path must refuse those documents. This issue does not apply templates or rewrite site content.

## Auth and security

- Editor requires both `current_user_can( 'edit_post', $post_id )` and compatible theme, with admin-only controls requiring `edit_theme_options`.
- Use `permission_callback` on REST routes, server validation, sanitize on input and escape on output, nonces for cookie auth, no arbitrary PHP execution.
- Preview content must not leak unpublished data publicly.

## Compatibility and performance

- Test official WP theme requirements and WP APIs; maintain graceful fallback for plugin deactivate/theme switch.
- Avoid global CSS resets that collide with admin/plugin styles; load editor assets only on builder screens.
- PHP render cache invalidation for document updates, tokens, template context and add-on changes.
- WP I18n and translation extraction for theme/plugin; accessibility; resource hints and fonts.

## Distribution

- GPL-compatible files and source availability where required.
- WordPress.org theme/plugin review guidelines apply if submitted; premium add-ons distributed independently. Keep security patch policy across all packages.

## Frontend rendering and cache (BWB-044)

On a singular view of an opted-in post type, the plugin replaces the post content with the **published** builder output and prints the compiled stylesheet once as an inline style (`blixis-builder-frontend`). `Frontend\PublishedReader` resolves the publication pointer to immutable snapshots (ADR 0004); working streams are never read, so drafts cannot reach visitors. A post with no pointer, a missing or invalid snapshot, unsafe or oversized output, a password requirement, or the filter `blixis_builder_render_frontend` returning false keeps its normal content: every failure falls back to WordPress's own output.

The locale is the site locale (`get_locale()`); if the pointer has no published content for it, the pointer's default locale is used. Locale URL routing and the 404 for unpublished locales are separate work (ADR 0006).

**Cache.** The rendered `{html, css}` pair is stored as a transient (so a persistent object cache is used automatically) under a key made of every input: post, selected locale, published layout and content snapshot numbers, a site-wide **epoch**, the CSS compiler version, the plugin version and the active theme with its version (`Frontend\RenderCacheKey`). A new publication changes the snapshot numbers, so the old entry is simply never read again. Changes that affect every page start a new epoch (`Frontend\Invalidation`: a random value in the autoloaded option `blixis_builder_epoch`): saving or deleting the design system or global classes, switching the theme, and updating or deleting an attachment. Entries expire after a day, so abandoned keys do not accumulate.

**Draft preview (BWB-151).** The editor's separate `previewUrl` carries a per-user WordPress nonce for the post's `blixis_preview` query argument. On a singular builder post only, `Frontend\DraftPreview` enables preview rendering when the viewer is logged in, can `edit_post`, and presents a valid nonce for that exact post. Any invalid or incomplete request follows the normal published path without changing output or status. Canonical redirects are disabled only after this gate passes, so WordPress cannot discard the nonce from the authorized preview request. An authorized request renders the current working layout and current content locale through `Frontend\WorkingReader`; the configured default locale's working content is included as the source fallback, matching published locale selection. The editor chrome locale is not involved. The editor's `viewUrl` remains the default-locale public permalink until locale-specific permalink support in BWB-057. The locale router provides a localized public permalink only for published locales, so preview links for unpublished content locales use the default permalink until locale permalink routing supports drafts (BWB-057). Draft output uses the same compiler and renderer but is never stored in the persistent cache; the in-request memo has a distinct mode key. Preview responses send no-store/private, noindex and same-origin referrer headers and define `DONOTCACHEPAGE`. A fixed `Draft preview` badge is emitted at `wp_footer` and styled by preview-only fallback CSS; it is not saved in the document.

Verified on real WordPress by the smoke test: normal content without a pointer, no draft leak, snapshot output and CSS, a new revision visible without flushing, epoch change on design system save, and fallback after a snapshot is removed.

## Media and image accessibility (BWB-045)

Images come only from the WordPress media library, by attachment ID (THREAT-MODEL T11). `Media\MediaPolicy` and `WordPressMediaResolver` accept an attachment only when it is a real `attachment` post with a raster MIME type (JPEG, PNG, GIF, WebP, AVIF). SVG is refused because it can carry scripts, and the builder never fetches a remote image. Anything else renders the inert `data-blx-missing-media` placeholder.

**Responsive images.** The resolver takes `srcset` and `sizes` from WordPress (`wp_get_attachment_image_srcset`, `wp_get_attachment_image_sizes`). `MediaPolicy` rebuilds `srcset` from validated candidates (safe URL, one `Nw` descriptor, at most 16) and accepts `sizes` only as a bounded media-condition string; `sizes` is printed only together with a valid `srcset`. Width and height always come from the attachment so the layout does not shift.

**Alt text.** The alt property is translatable (FR-056). Order: the translated or default-locale alt, then the library's alt text. An image marked decorative gets `alt=""` and `role="presentation"`. Any other image without alt text still gets `alt=""` and the hook `data-blx-alt-missing`, which the editor uses to ask for text (ACCESSIBILITY-BASELINE rule 9).

**Picker support.** `GET /blixis/v1/media/{id}` (users who can edit posts; 401 anonymous, 403 otherwise) returns `{ id, url, width, height, alt, srcset, sizes }` for a chosen attachment, `private, no-store`. Missing, non-image and SVG attachments are the same 404. The picker UI is the WordPress media modal inside the editor (BWB-054).

## Revision history of working streams (BWB-046)

Every successful write of a working stream (layout or one locale's content) keeps the value it replaced as an immutable history row `_blixis_rev_<stream>_<n>` (`Storage\RevisionRing`): who saved it (user ID), when (UTC), and the stream value, bounded to the newest 20 per stream, oldest pruned first. Streams never share a ring, a conflicting write records nothing, and a history problem never fails a save. Core WordPress revisions are not used (spike BWB-040).

**Restore is an ordinary write.** `POST /documents/{id}/layout/restore` and `.../content/{locale}/restore` take `{ "revision": n }` and `If-Match: "<current>"`; the old value is written as a new revision (append-only), so a restore can itself be undone, and a stale `If-Match` is the usual 409. Unknown revisions are 404 `blixis_revision_not_found`. `GET .../revisions` returns `{ current, revisions: [{ revision, savedAt, author }] }`, newest first. Access is the same as the document routes (401, uniform 403).

**Save recovery.** The editor keeps working data only in these streams (autosave never publishes, ADR 0004): after a crash or a lost connection the last saved revision is in the stream and earlier ones in the history. Conflict handling is the `If-Match`/409 contract of the document routes.


## Publishing and rollback (BWB-046)

`Publication\Publisher` implements ADR 0004. **State:** `GET /documents/{id}/published` returns `{ pointerRevision, layout, locales }` where each stream is `unpublished`, `published` or `published-with-pending-changes` (the working revision differs from the one the published snapshot was made from). Reading needs edit rights.

**Publish:** `POST /documents/{id}/publish` with `If-Match: "<pointer revision>"` and `{ layout?: bool, locale?: string, confirmImpact?: bool, excludeIncompatible?: bool }`. It needs the publish capability for the post (`publish_post`; an editor of a draft who cannot publish gets the uniform 403). Layout and locale content are published separately but move the single `_blixis_published` pointer in one compare-and-swap, after the immutable snapshots are written, so a failure leaves the live page unchanged. Autosaves and working writes never touch the pointer.

- A locale is published against the layout live at that moment, never against unpublished layout edits; a locale cannot be published before a layout exists (409 `blixis_layout_not_published`).
- Content entries must refer to elements that exist in that layout with the same recorded type and only to translatable or locale-specific properties; otherwise the publish is blocked (409 `blixis_publish_blocked`, `incompatible: [{ id, reason, locale }]`) unless `excludeIncompatible` drops those entries.
- A layout publish checks every other published locale; locales it would break are listed (409 with `impacted: [{ locale, ids }]`) and, with `confirmImpact`, stay pinned to their previous layout (`baseLayout` in their pointer entry) while compatible locales move to the new layout. Public rendering of a locale uses its own `baseLayout`.

**Rollback:** `POST /documents/{id}/rollback` with `{ locale, contentSnapshot }` or `{ layoutSnapshot }` republishes an old snapshot under a new number (history is append-only). A locale rollback restores the pair (base layout, content) exactly; after unpublish it uses the content snapshot's `baseLayout` as the published layout. If that layout snapshot is gone, it returns 409 `blixis_base_layout_snapshot_missing`. A layout rollback follows the same impact rules as a layout publish. Unknown snapshots are 404 `blixis_snapshot_not_found`.

Snapshots carry the working revision they came from (`sourceRevision`), the layout they were made for (`baseLayout`) and the element types their entries referred to (`elementTypes`). Pruning of unreferenced snapshots stays a separate, explicit step (`SnapshotStore::collect`); collection preserves every snapshot while the current pointer is an unpublished tombstone.

**Publication abuse controls.** After authentication, per-post capability and theme checks, the publication request limits each user to 30 successful publishes, rollbacks or unpublishes of a post in a rolling hour. A rejected request returns 429 `blixis_rate_limited` with `Retry-After` seconds. The publisher refuses a publish that would take a post above 200 stored snapshots; rollback remains available through 240 snapshots for recovery. Both limits return 409 `blixis_snapshot_limit` before any snapshot or pointer write. The limiter uses a per-site transient; its read/update is not atomic across simultaneous requests. A site-wide aggregate cap, alerting and retention accounting remain BWB-070 work.

**Audit hook.** After a successful pointer advance, the publication controller fires `do_action( 'blixis_builder_publication_event', array $event )`. The event has `actor` (user ID), `post`, `locale` (or null), `kind` (`publish`, `rollback`, `unpublish`, `page-settings`, or `template-font-install`), `layoutSnapshot` (or null), `contentSnapshot` (or null), `pointerRevision`, and `time` (UTC RFC3339). Page settings and font installation reuse this envelope with null snapshots and pointer revision zero. Font installation additionally carries `templateId` and allowlisted `familySlugs`; it includes no document content. Hook consumers own their retention and access policy.

## Theme compatibility guard

The Builder plugin reads `Blixis-Compat` from the active stylesheet's `style.css` using WordPress `get_file_data`. Any child theme declaration wins, including an empty or invalid one; only an absent header inherits its parent's declaration. The plugin supports contract version 1. It does not load theme PHP to decide compatibility. A read failure is treated as `not-declared` and never stops the plugin from loading. The per-request cache is keyed by blog ID, stylesheet, and template, so switching blogs or themes within one request refreshes compatibility; it keeps at most eight contexts.

| Reason | Meaning |
| --- | --- |
| `ok` | Effective declaration is supported. |
| `not-declared` | Neither stylesheet declares a version, or reading failed. |
| `invalid-declaration` | Effective header is present but is not a plain positive integer at most 9999. |
| `too-old` | Valid version is below the plugin's supported range. |
| `too-new` | Valid version is above the plugin's supported range. |

When incompatible, document layout/content PUT, revision restore, publish, and rollback return HTTP 423 `blixis_theme_incompatible` after normal authentication and post capability checks. The error data is `{ reason, theme, declared, supportedMin, supportedMax }`. Unauthenticated requests still receive 401, and forbidden requests receive a uniform 403 without revealing theme status. No builder storage is touched by a locked write. Document GET, revision lists, published state, preview, and media GET remain available under their existing permissions.

`GET /blixis/v1/status` requires authentication and `edit_posts` (401/403 otherwise), returns `Cache-Control: private, no-store`, and reports the theme name, compatibility, declaration, reason, supported bounds, editing enabled/lock reason, and plugin version. It is read-only.

Published pages continue rendering through the plugin on incompatible themes. A second inline style, `blixis-builder-fallback`, supplies minimal container, image and button rules in `@layer blx.theme`, with literal fallbacks for design tokens. The render cache key includes the compatibility reason as well as stylesheet name/version, so a changed declaration changes the key even when the theme version is unchanged. Builder JSON and published pointers are preserved through a theme switch.

The warning notice appears on dashboard, themes, and plugins screens for users with `edit_posts`. These are the entry points where a site owner can see the lock or change themes without repeating it on every editing screen. Its theme name and themes link are escaped and its text is translatable.

## Locale routing (BWB-111)

**Site languages** live in the option `blixis_locales`: `{ "version": 1, "defaultLocale": "en_US", "enabledLocales": ["en_US", "nl_NL"], "fallback": "source" }` (set with `wp option update blixis_locales '<json>' --format=json`; a settings screen comes with the editor). Invalid values mean "one language", which switches routing off. At most 20 locales; `fallback` is `source` (a missing translation shows the default locale's text) or `blank` (it shows nothing); stored data is never changed by a fallback.

**Native strategy (Free default, ADR 0006).** The default locale stays at the canonical URLs (`/about/`); every other enabled locale lives under a prefix with the same slug (`/nl/about/`). The prefix is the language subtag (`nl`), or the whole tag (`nl-nl`, `nl-be`) when two enabled locales share a language. `NativeLocaleRouter` removes the prefix from the request before WordPress parses it, so no rewrite rules need flushing and plain permalinks work; generated site URLs (`home_url`) get the prefix back, except admin, REST, login, assets and cron. On a localized request `get_locale()`, `<html lang>` and `dir` (RTL for Arabic, Hebrew, Persian, Urdu and a few more) follow the content locale; the editor interface locale is a separate thing.

- **Published only.** A page is served under a locale prefix only when that locale has published content for it; otherwise (and for archives, search and regular pages without a translation) the URL is a 404, produced before WordPress canonical redirects can rewrite it (`redirect_canonical` is switched off for locale URLs). Unpublished locales are left out of hreflang and the switcher. An unknown prefix is not a locale: WordPress treats it like any unknown URL (404, or its own slug guess to the canonical page).
- **SEO.** Published pages print `<link rel="alternate" hreflang>` for every published locale plus `x-default` (the default locale's URL, or the first published one); the canonical link of a localized page is its own prefixed URL.
- **Switcher.** `blixis_builder_locale_switcher()` prints `<nav class="blx-locale-switcher" aria-label="Language">` with a link per published translation (self-named, `lang`/`hreflang`, `aria-current="page"`); nothing on single-language sites or untranslated pages. The Blixis theme calls it in its header.
- **Route safety.** `Locale\Collisions::report()` lists prefixes that collide with WordPress routes or existing top-level slugs (the settings screen will refuse such prefixes).
- **Caching.** Rendered pages are cached per locale, with the default-locale content revision and the fallback policy in the key. Appearance mode is not a cache dimension.

**Adapter boundary.** Everything the builder needs from routing is the `Locale\LocaleRouter` interface (`current()`, `fallback_policy()`, `is_published()`, `url_for()`, `alternates()`). Free ships only the native strategy. **No translation-plugin adapter (WPML, Polylang, TranslatePress ...) is supported or advertised**: an adapter must implement this interface and have contract tests against that plugin first. Translated slugs, per-locale domains, translated post titles and locale-aware menus are out of scope for Free 1.0 (the WordPress post title and the navigation menu are the same in every language; only the builder content is translated).

## Locale-aware saving (BWB-112)

**Identity.** A content stream is `{ schemaVersion, contentRevision, locale, entries }` and always carries the locale of the stream it lives in: the server stamps `locale` on save and refuses an envelope that names another one (422 `blixis_locale_mismatch`, nothing written). Content snapshots carry it too, and the public renderer refuses a snapshot whose `locale` differs from its key. Reads (`GET .../content/{locale}`), history (`.../revisions`) and conflicts (409 `data.locale`) name the locale, so autosave, restore and conflict handling never mix languages; each locale stream has its own revisions, history ring and compare-and-swap.

**Route parameters.** WordPress merges the JSON body into `get_param()` and the body wins, so a `locale` or `post_id` field in a request body could redirect a write. The plugin reads identifiers only from the URL (`Rest\RouteParams`); a smoke check proves a body cannot redirect a write.

**Validation (`Storage\ContentValidator`).** Shape and bounds are checked on every save: `entries` is an object of at most 5,000 entries keyed by element id; an entry has only `status` (`missing|draft|translated|reviewed|stale|orphaned`), `values` (at most 32 properties, names `[a-z][A-Za-z0-9]*`, values string up to 20,000 characters, integer, boolean, null, or bounded inline rich text for declared text properties) and `sourceHash` (16 lowercase hex characters). Whether an entry fits the layout (element exists, same type, translatable property) is checked when publishing (ADR 0004), because the layout can change independently.

**Stale detection.** `Locale\SourceDigest` is the PHP twin of `sourceDigest` (first 16 hex characters of the SHA-256 of the canonical JSON of the default-locale translatable values), verified against the shared 17-case corpus. `GET /documents/{id}/content/{locale}/translation-status` (same access as the document routes) returns per element `missing | draft | translated | reviewed | stale | orphaned` plus `sourceChanged` and counts: a translation is stale when its `sourceHash` no longer matches the digest of the current default-locale source text, text without an element is orphaned, and nothing is ever deleted, so the target text is preserved when the source changes. Only translatable properties count as source text, so a per-language link never makes a translation stale. The default locale is the configured one (`blixis_locales`).
## Bundled template import (BWB-161, phase P0)

`POST /blixis/v1/templates/{id}/import` accepts only a JSON object with boolean `createPages`, `setHomePage`, `createNavigation`, and `overwriteExisting` properties. Omitted options inherit the validated pack's `importOptions`; a request cannot enable a pack-disabled option. Cookie-authenticated REST writes require WordPress's REST nonce. The setup wizard submits its step-scoped nonce to the dedicated `admin_post_blixis_import_template` handler. Both paths enforce `edit_pages` and `edit_theme_options` inside the importer as well as at their adapters. Imports are draft-only; a requested homepage selection is deferred and returned as a result note until an imported page is published.

Imports resolve only paths accepted by `Templates\\TemplateValidator`, then verify `realpath()` confinement under that pack before staging files. Per-file SHA-256 metadata (`_blixis_template_asset_file`) makes sideloading idempotent per pack asset. Sanitized bundled SVGs are temporarily admitted to WordPress's MIME allowlist only during sideload. Only existing draft pages carrying this importer's template/document markers can be overwritten, with `edit_post` checked on each page; published pages are never candidates. Pages receive layout/content working streams through `StreamStore`; the importer never publishes them. A failed import deletes newly created posts, menus and attachments and restores overwritten page fields, working streams and revision-ring metadata with slashing preserved. When `overwriteExisting` is false, a repeat import returns HTTP 409 before changing content. `setHomePage` only changes the front-page options after successful creation; it does not publish the page.

The importer follows generated element definitions when splitting each document: invariant and layout properties stay in `layout`, while every recognized localizable property is written to that element's `content` entry under its canonical property name. Pack rich-text spans are converted to the versioned `{v:1,inline:[...]}` model; only supported marks and declared pack color-token IDs are retained, and dropped values or marks are described in the import result notes. Definition aliases let the renderer read legacy `text` stream fields while new imports and editor-facing streams use canonical names such as `content` and `label`.

Template locale tags are mapped to enabled site locales before any content stream is written. Exact locale matches win; otherwise the mapper chooses an enabled locale with the same language prefix, preferring the site's default locale when it matches. The template's default language supplies the initial content stream for its mapped site locale; other pack localizations populate their matching enabled locales. A localization whose language is disabled is omitted and named in the import result notes. Storage locales require a WordPress locale identifier with a region, such as `en_US`; bare language tags such as `en` are rejected. Import stream names are created through `MetaKeys::content()` and checked by `MetaKeys::is_valid_key()`.

Import attempts use a dedicated `blximp_` rolling rate-limit bucket. Successful imports emit a content-free `template-import` audit event with actor, template ID and asset references. Page text and uploaded bytes are excluded. See the template-import rows in `docs/engineering/SECURITY-TEST-MATRIX.md` and the user-run `pnpm wp:smoke` block; Docker is required for real WordPress verification.
