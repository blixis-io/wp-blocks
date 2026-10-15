# WordPress Integration Specification

## Supported environment

Baseline decided in [ADR 0001](adrs/0001-supported-environments.md): WordPress 7.0+ (Font Library available to classic themes from 7.0, verified against wordpress.org documentation), PHP 8.2+ proposed pending owner confirmation. Test multisite even if initial launch does not promise full support.

## Plugin/theme responsibilities

- Theme: PHP templates, styles, `theme.json`, optional safe presentation defaults, onboarding entry point, theme compatibility declaration.
- Plugin: editor, post meta, revisions, renderers, dynamic data, API, capabilities, extension registry. Content survives theme changes.
- Premium: separately distributed optional plugins; never ship restricted inactive premium functionality inside WordPress.org-hosted Free code.

## Builder plugin bootstrap

`wordpress/plugin/blixis-builder.php` checks the PHP 8.2 and WordPress 7.0 floors before loading Builder classes. An unsupported site receives an admin notice and no Builder hooks; the plugin does not fatal. The plugin maps `Blixis\Builder\` classes directly to `src/ClassName.php` with a small local autoloader, without Composer at runtime. Activation stores the package version once in the current site's non-autoloaded `blixis_builder_version` option; network activation initializes each existing site independently. Reactivation never replaces an existing value. Deactivation only unregisters runtime hooks through WordPress's normal request lifecycle: it deletes no content or options. `uninstall.php` removes only `blixis_builder_version` for the current site; network uninstall removes that option on each site. Documents and other site data remain intact for later portability and fallback work (BWB-040 and BWB-047).

## Builder post-meta persistence

Working layout, locale content, publication pointer, and immutable snapshots use separate protected postmeta keys under ADR 0003 §3. Fixed keys are registered per editable public REST post type; `blixis_builder_post_types` defaults to `post` and `page`. Dynamic key capabilities are restricted to valid builder keys and `edit_post`; all builder keys stay out of core revision/autosave meta. Writes use the storage repository's per-row CAS, while first inserts use a per-key advisory lock because postmeta has no unique key. Full document schema validation is BWB-043; current checks cover the 2 MiB envelope and revision fields. See [BWB-040 spike](spikes/BWB-040-persistence.md) for the contract, sanitize fallback, revision decision, and smoke-test gaps.

## Document REST API

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
| 401 | `blixis_unauthenticated` | Authentication is required. |
| 403 | `blixis_forbidden` | Access is forbidden. |
| 403 | `rest_cookie_invalid_nonce` | WordPress core rejects cookie nonce |
| 404 | `blixis_revision_not_found` | Revision not found. |
| 404 | `blixis_snapshot_not_found` | Snapshot not found. |
| 404 | `blixis_media_not_found` | Media not found. |
| 409 | `blixis_conflict` | Revision conflict. |
| 409 | `blixis_snapshot_missing` | Snapshot is missing. |
| 409 | `blixis_layout_not_published` | Layout is not published. |
| 409 | `blixis_publish_blocked` | Publication is blocked. |
| 409 | `blixis_snapshot_limit` | Publish would exceed 200 stored snapshots, or rollback would exceed its recovery ceiling of 240. |
| 413 | `blixis_too_large` | Request is too large. |
| 422 | `blixis_invalid_document` | Invalid document. |
| 422 | `blixis_nothing_to_publish` | Nothing to publish. |
| 423 | `blixis_theme_incompatible` | The active theme does not support Blixis editing. |
| 428 | `blixis_precondition_required` | If-Match is required. |
| 429 | `blixis_rate_limited` | Publication rate limit reached. |
| 500 | `blixis_storage_error` | Storage failed. |
| 500 | `blixis_preview_failed` | Preview failed. |

Plugin errors use `WP_Error` with stable codes, fixed messages from `Rest\ErrorCatalog`, and `data.status`. WordPress reports invalid route arguments as `rest_invalid_param` with the `blixis_*` code under `data.details.<arg>.code`.

The [canvas contract](CANVAS-CONTRACT.md) specifies the preview request and response, iframe sandbox, size limits and renderer boundary. Preview shares the permission policy above. Its request body is JSON (2 MiB maximum) with optional `locale` (site locale by default), `mode` (`light` by default) and `document` (unsaved envelope). It never reads published pointers or snapshots. Preview-specific errors are 400 `blixis_invalid_locale` / `blixis_invalid_mode`, 413 `blixis_too_large`, 422 `blixis_invalid_document`, and generic 500 `blixis_preview_failed`; authentication errors and core nonce errors are as above. Successful responses carry `Cache-Control: private, no-store`.

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

**Rollback:** `POST /documents/{id}/rollback` with `{ locale, contentSnapshot }` or `{ layoutSnapshot }` republishes an old snapshot under a new number (history is append-only). A locale rollback restores the pair (base layout, content) exactly; a layout rollback follows the same impact rules as a layout publish. Unknown snapshots are 404 `blixis_snapshot_not_found`.

Snapshots carry the working revision they came from (`sourceRevision`), the layout they were made for (`baseLayout`) and the element types their entries referred to (`elementTypes`). Pruning of unreferenced snapshots stays a separate, explicit step (`SnapshotStore::collect`).

**Publication abuse controls.** After authentication, per-post capability and theme checks, the publication request limits each user to 30 successful publishes or rollbacks of a post in a rolling hour. A rejected request returns 429 `blixis_rate_limited` with `Retry-After` seconds. The publisher refuses a publish that would take a post above 200 stored snapshots; rollback remains available through 240 snapshots for recovery. Both limits return 409 `blixis_snapshot_limit` before any snapshot or pointer write. The limiter uses a per-site transient; its read/update is not atomic across simultaneous requests. A site-wide aggregate cap, alerting and retention accounting remain BWB-070 work.

**Audit hook.** After a successful pointer advance, the publication controller fires `do_action( 'blixis_builder_publication_event', array $event )`. The event has exactly `actor` (user ID), `post`, `locale` (or null), `kind` (`publish` or `rollback`), `layoutSnapshot` (or null), `contentSnapshot` (or null), `pointerRevision`, and `time` (UTC RFC3339). It includes no document content. Hook consumers own their retention and access policy.

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
