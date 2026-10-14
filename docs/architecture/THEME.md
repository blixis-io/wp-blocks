# The Blixis theme (BWB-029)

`wordpress/theme` is a classic (PHP template) theme, as decided in ADR 0002. It renders posts and pages with plain templates and leaves page design to the Builder plugin, which replaces `the_content()` output for pages built with it. The theme stores no documents. BWB-031 adds `theme.json` and CSS design variables; BWB-032 adds preset seed data. BWB-033 adds the setup entry point; BWB-034 adds the wizard interface. Later issues add design-system persistence (BWB-035), the Font Library (BWB-036), and the child-theme and accessibility audits (BWB-037/038).
The BWB-032 Ocean, Forest, Sunset and Minimal preset files live in `design/presets/`. They are validated light/dark token seeds; selecting one copies its tokens into the site's canonical setting. The `custom` choice starts from `design/default-tokens.json` without a preset file. New sites default to website appearance `auto`, independent of editor chrome and locale. Setup and persistence remain BWB-033 through BWB-035.

## Files

| File | Purpose |
|---|---|
| `style.css` | Theme header (name, version, `Requires at least: 7.0`, `Requires PHP: 8.2`, GPL-2.0-or-later, text domain `blixis`), the `Blixis-Compat` declaration and minimal accessibility defaults: responsive media, the `.screen-reader-text` and `.skip-link` utilities, visible focus. Its rules sit in `blx.theme`. |
| `design/default-tokens.json`, `build-tokens.mjs` | Version-one default token data and deterministic generator for `theme.json` and `assets/css/tokens.css`. The JSON is validated by the style engine; the CSS is emitted by its compiler, without a second CSS formatter. |
| `theme.json`, `assets/css/tokens.css` | Committed generated files. `theme.json` exposes token-backed palette, font families, font sizes, spacing and layout to WordPress; token CSS supports explicit light/dark and system preference. Both ship in the theme zip. |
| `assets/css/theme.src.css`, `assets/css/theme.css` | Tailwind v4 source and minified output. Theme rules and Tailwind imports sit in `blx.theme`; the source disables automatic scanning and explicitly scans theme PHP templates. The generated CSS is committed for the mounted development theme and packaged for production. |
| `functions.php`, `src/Setup.php` | Bootstrap and hooks: theme support (`title-tag`, `post-thumbnails`, `responsive-embeds`, `automatic-feed-links`, HTML5 markup), the text domain, the `primary` menu, and the header, token and theme stylesheets in dependency order, versioned by the theme version. No output at load time. |
| `src/Compat.php` | The compatibility declaration (below). |
| `src/SetupState.php`, `src/SetupAdmin.php` | Site setup status and per-user resume step; the Appearance page, notice, and POST actions. |
| `header.php`, `footer.php` | Document start and end: `language_attributes()`, charset and viewport, `wp_head()`, `wp_body_open()`, a skip link, banner with site name and the primary navigation (labelled `<nav>`), the `<main id="content" tabindex="-1">` landmark, footer and `wp_footer()`. |
| `index.php`, `single.php`, `page.php`, `archive.php`, `search.php`, `404.php`, `comments.php` | The template hierarchy needed by a classic theme, using `template-parts/content*.php`. Every output is escaped; strings are translatable. |
| `readme.txt` | WordPress.org style readme with the GPL statement. |
| `tests/` | PHPUnit tests that run without WordPress (`composer test`, suite `theme`). |

## The compatibility declaration

A theme is Blixis-compatible when its `style.css` header, or its parent's, contains `Blixis-Compat: <integer>` (ADR 0002). `Blixis\Theme\Compat::from_value()` defines the accepted value: a positive integer in plain digits, 1 to 9999, no sign, no leading zero, no spaces inside; anything else counts as "not declared". `Compat::declared($directory)` reads a theme directory with `get_file_data()` and `Compat::active()` answers for the active theme, falling back to the parent for a child theme without its own header. This theme declares 1 (`Compat::CURRENT`). The plugin's `ThemeCompat` service (BWB-047) implements the same parsing rule and uses the integer to decide whether editing is allowed.

## Child themes and switching

The parent theme loads its PHP hooks for an active child. A child without its own `Blixis-Compat` header inherits the parent's version 1 declaration. A child with an invalid declaration, such as `Blixis-Compat: x`, is incompatible even when its parent declares version 1. The local fixtures in `tooling/wp-env/fixtures/themes/` exercise both cases and a standalone incompatible theme.

An active child uses the inherited PHP page and header templates and may override the footer template. Styles load in this order: parent baseline `style.css`, parent `tokens.css`, parent `theme.css`, child `style.css`, so the child can override parent rules. Generated asset URLs point into the parent theme directory. The saved design-system CSS still prints after `tokens.css`, and an administrator can open Appearance → Blixis setup. The smoke test checks those behaviors on the rendered front page.

Switching through the invalid child and an unrelated theme, then back to Blixis, preserves the raw `blixis_setup`, `blixis_design_system`, and `blixis_design_system_history` options and the administrator's setup UI/draft user meta. `after_switch_theme` attempts to create `blixis_setup` only when absent, so reactivation does not replace an existing value. The Blixis theme's classes and setup admin hooks are not loaded while the unrelated theme is active; this theme therefore does not offer its setup page or notice there. Plugin editor gating and public fallback on an incompatible theme belong to BWB-047 (ADR 0002, `TESTING.md` scenario 5).

These checks use one site in the local Docker stack. On multisite, options are scoped to the current site and setup UI data remains per user; network-wide switching has not been exercised by this smoke test.

## Setup entry point

`after_switch_theme` adds the per-site `blixis_setup` option only if absent; it is never replaced on reactivation, including when its data is invalid or from a newer schema. The option has autoload disabled and stores `{version: 1, status: 'not_started'|'in_progress'|'completed'|'dismissed', updated_at: UTC RFC3339 string, preset?: lowercase slug}`. `SetupState::normalize()` validates reads without WordPress calls; invalid data disables entry actions safely. BWB-034 owns wizard completion and preset application.

Each user's wizard position is separate in user meta `blixis_setup_ui` as `{resume_step: 1..6}`. A missing or invalid value reads as step 1. It never determines the site's setup status. Site option APIs operate in the current site's context on multisite.

Administrators with `edit_theme_options` see a non-blocking notice on admin screens while setup is `not_started` or `in_progress`. Appearance → Blixis setup (`blixis-setup`) displays the current status and the server-rendered six-step wizard. Start and Dismiss are `admin-post.php` POST forms protected by `wp_nonce_field()` and `check_admin_referer()`; handlers enforce the capability and redirect through `wp_safe_redirect()`. Output is escaped. Requests without the capability or valid nonce return 403. No public frontend route or forced redirect is involved.

## Setup wizard

Appearance → Blixis setup has six server-rendered steps: preset or Custom, colors, typography, spacing/radius/layout, a side-by-side light/dark preview, and Apply. Every POST checks `edit_theme_options` and a step-specific nonce, then redirects safely. Back, Next and Cancel work without JavaScript. The per-user `blixis_setup_ui` resume step is separate from the site-wide status. `blixis_setup_draft` stores bounded JSON in user meta; invalid values and low-contrast semantic pairs are rejected before writing it. The preview uses scoped variables and reports contrast in each mode. The Apply button validates the saved draft and calls `DesignSystemStore::apply()` (below); only after that succeeds is setup marked `completed` and the draft deleted.

## Fonts (BWB-036)

Typography offers system stacks and up to 50 published `wp_font_family` posts from the WordPress Font Library. `FontLibrary` parses each post's `post_content` JSON, rejects unsafe names and variants, deduplicates by slug, and shows the available weights/styles. The wizard saves a quoted family name with `system-ui, sans-serif` fallback. Every draft read, step submission, apply, and saved-state read revalidates that exact stack against currently installed families. If a selected family is removed, the saved option remains intact but its CSS is ignored in favor of bundled defaults until the family returns or another design is applied.

WordPress 7.0 provides Appearance → Fonts to classic themes. Core registers `wp_print_font_faces` on `wp_head` and resolves active Font Library faces through its merged theme.json data. The theme's generated `theme.json` keeps token-backed font families; Blixis prints only the selected font-family token and does not print `@font-face` or request a font host. Installed fonts need to be activated in WordPress to get their face declarations on the public site. The smoke test covers wizard discovery and rejection; a browser check with an activated uploaded face remains necessary to verify file loading in a real WordPress instance.

## Development and tests

- `pnpm --filter @blixis/wp-theme run build:tokens` validates `design/default-tokens.json` and regenerates `theme.json` and `assets/css/tokens.css`. The generator calls `tokensForCompile` and `compile` from `@blixis/wp-style-engine`; a tooling test regenerates both into temporary files, parses them and checks that the committed copies are current. The token JSON and preset JSON ship in the zip because the setup wizard reads them at runtime.
- `pnpm --filter @blixis/wp-theme run build:css` runs `build-css.mjs` to regenerate `assets/css/theme.css`. The script uses `@tailwindcss/node` to compile and minify, and `@tailwindcss/oxide` to scan only the PHP template paths listed in `theme.src.css`; automatic scanning must remain disabled. Both build dependencies are MIT-licensed and pinned to the same version as Tailwind. Builder documents and editor source never contribute utilities. Template class names are literal strings, never assembled from user content. `pnpm build` regenerates tokens before CSS, then packages twice and compares archive bytes. The tooling test rebuilds CSS to a temporary file and checks that the committed output is current and that an outside-theme fixture class is absent.
- `pnpm wp:start` mounts `wordpress/theme` read-only into `wp-content/themes/blixis` (`docker/compose.packages.yml`, merged by `tooling/wp-env/wp-env.mjs`; the mount is added for the web and the CLI container) and activates it. Edit files on the host; changes show on reload. `WP_DEBUG_LOG` is on, so PHP warnings go to `wp-content/debug.log`.
- `pnpm wp:smoke` checks that the theme is active and declares `Blixis-Compat: 1`, that the front page has a skip link, a `main` landmark, a language and a viewport, that pages and the 404 page render through the theme, and that nothing in the debug log points into the theme.
- `composer run check` lints the theme with the WordPress coding standards and PHPCompatibility, analyses it with PHPStan level 8 and the WordPress stubs, and runs the theme tests.
- `pnpm build` packages `blixis-<version>.zip` reproducibly (tests, tooling files, token source data and `theme.src.css` are excluded). The zip requires `theme.json`, `assets/css/tokens.css` and `assets/css/theme.css`. The header `Version` must equal `wordpress/theme/package.json`.

## Not here yet

`screenshot.png` (required for WordPress.org; with the design work), translation files (`languages/`, BWB-071) and the WordPress.org theme-review checks (release phase).

## Design system persistence (BWB-035)

`DesignSystemStore` keeps the site's design system in one option, `blixis_design_system`: `{ version: 1, tokenVersion, preset, updated_at, tokens }` with the wizard's token shape (`name => { value, dark? }`). It is autoloaded because every public page prints it. `tokenVersion` starts at 1 and only ever increases (also on rollback); it exists for cache invalidation (ADR 0004). Tokens are live: saving or restoring changes every page at once, and the wizard's preview step plus the Apply button are the confirmation.

- **Validation.** Saving and reading both validate against the bundled default token set (`TokenDraft::validate`); invalid or corrupted data is ignored, never repaired, and the bundled `tokens.css` stays in force.
- **History and rollback.** The replaced state is pushed onto `blixis_design_system_history` (not autoloaded, newest first, at most 5). "Restore the previous design system" (POST, nonce, `edit_theme_options`) puts the newest earlier content back under a new, higher `tokenVersion`; the state it replaces is not kept, so a second restore goes one step further back.
- **Atomicity.** The current option is the source of truth. The history is written first (a failure in between leaves a harmless duplicate); success is reported only after the current option was written, and a failed save changes nothing and shows an error.
- **Output.** `Setup::enqueue` adds the saved tokens as inline CSS after `tokens.css` (`DesignSystemStore::css`), in the same layer `blx.tokens`, in the exact form the compiler emits (a test compares them for the bundled defaults). Values are restricted to a safe character set (no `;`, braces, angle brackets, backslashes or `url()`); anything else is skipped.
- **Bundled defaults.** `design/default-tokens.json` now includes `color-on-primary` and a border color with enough contrast; a test checks that the default set passes the accessibility rules in both modes.

