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
