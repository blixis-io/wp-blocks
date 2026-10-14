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

PUT requires `Content-Type: application/json`, a JSON envelope object of at most 2 MiB, and a strong quoted integer `If-Match: "<expected revision>"`. The repository validates the envelope through its `DocumentValidator` seam, overwrites the envelope's stream revision with the next CAS revision, and preserves unknown fields. Full schema validation is BWB-043. Success returns `{ "revision": n }` and the new ETag. These routes cannot address `_blixis_published` or immutable snapshot keys; publication uses a separate future API.

| Status | Code | Cause |
|---|---|---|
| 400 | `blixis_invalid_post_id`, `blixis_invalid_locale`, `blixis_invalid_mode`, `blixis_invalid_revision` | Invalid route argument, preview locale/mode, or If-Match value; WordPress reports route arguments as `rest_invalid_param` with the `blixis_*` code under `data.details.<arg>.code` |
| 401 | `blixis_unauthenticated` | No authenticated user |
| 403 | `blixis_forbidden` | Post inaccessible, absent, or type excluded |
| 403 | `rest_cookie_invalid_nonce` | WordPress core rejects cookie nonce |
| 409 | `blixis_conflict` | CAS mismatch; error data has `currentRevision` and `expectedRevision` |
| 413 | `blixis_too_large` | Body exceeds 2 MiB |
| 422 | `blixis_invalid_document` | Invalid content type, envelope/validator rejection, or preview tree limit violation |
| 428 | `blixis_precondition_required` | If-Match absent |
| 500 | `blixis_storage_error` | Storage failure, with no exception details disclosed or logged |
| 500 | `blixis_preview_failed` | Preview storage, renderer, sanitizer, or output cap failure, with no internal details disclosed |

Plugin errors use `WP_Error` with stable codes and `data.status`. A real-WordPress smoke test must verify nonce behavior and route registration; the isolated PHPUnit suite tests the request policy and storage mapping.

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
