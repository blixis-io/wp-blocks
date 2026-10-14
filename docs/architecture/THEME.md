# The Blixis theme (BWB-029)

`wordpress/theme` is a classic (PHP template) theme, as decided in ADR 0002. It renders posts and pages with plain templates and leaves page design to the Builder plugin, which replaces `the_content()` output for pages built with it. The theme stores no documents. BWB-031 adds `theme.json` and CSS design variables. Later issues add presets (BWB-032), the setup wizard (BWB-033/034), design-system persistence (BWB-035), the Font Library (BWB-036), and the child-theme and accessibility audits (BWB-037/038).

## Files

| File | Purpose |
|---|---|
| `style.css` | Theme header (name, version, `Requires at least: 7.0`, `Requires PHP: 8.2`, GPL-2.0-or-later, text domain `blixis`), the `Blixis-Compat` declaration and minimal accessibility defaults: responsive media, the `.screen-reader-text` and `.skip-link` utilities, visible focus. Its rules sit in `blx.theme`. |
| `design/default-tokens.json`, `build-tokens.mjs` | Version-one default token data and deterministic generator for `theme.json` and `assets/css/tokens.css`. The JSON is validated by the style engine; the CSS is emitted by its compiler, without a second CSS formatter. |
| `theme.json`, `assets/css/tokens.css` | Committed generated files. `theme.json` exposes token-backed palette, font families, font sizes, spacing and layout to WordPress; token CSS supports explicit light/dark and system preference. Both ship in the theme zip. |
| `assets/css/theme.src.css`, `assets/css/theme.css` | Tailwind v4 source and minified output. Theme rules and Tailwind imports sit in `blx.theme`; the source disables automatic scanning and explicitly scans theme PHP templates. The generated CSS is committed for the mounted development theme and packaged for production. |
| `functions.php`, `src/Setup.php` | Bootstrap and hooks: theme support (`title-tag`, `post-thumbnails`, `responsive-embeds`, `automatic-feed-links`, HTML5 markup), the text domain, the `primary` menu, and the header, token and theme stylesheets in dependency order, versioned by the theme version. No output at load time. |
| `src/Compat.php` | The compatibility declaration (below). |
| `header.php`, `footer.php` | Document start and end: `language_attributes()`, charset and viewport, `wp_head()`, `wp_body_open()`, a skip link, banner with site name and the primary navigation (labelled `<nav>`), the `<main id="content" tabindex="-1">` landmark, footer and `wp_footer()`. |
| `index.php`, `single.php`, `page.php`, `archive.php`, `search.php`, `404.php`, `comments.php` | The template hierarchy needed by a classic theme, using `template-parts/content*.php`. Every output is escaped; strings are translatable. |
| `readme.txt` | WordPress.org style readme with the GPL statement. |
| `tests/` | PHPUnit tests that run without WordPress (`composer test`, suite `theme`). |

## The compatibility declaration

A theme is Blixis-compatible when its `style.css` header, or its parent's, contains `Blixis-Compat: <integer>` (ADR 0002). `Blixis\Theme\Compat::from_value()` defines the accepted value: a positive integer in plain digits, 1 to 9999, no sign, no leading zero, no spaces inside; anything else counts as "not declared". `Compat::declared($directory)` reads a theme directory with `get_file_data()` and `Compat::active()` answers for the active theme, falling back to the parent for a child theme without its own header. This theme declares 1 (`Compat::CURRENT`). The plugin's `ThemeCompat` service (BWB-047) implements the same parsing rule and uses the integer to decide whether editing is allowed.

## Development and tests

- `pnpm --filter @blixis/wp-theme run build:tokens` validates `design/default-tokens.json` and regenerates `theme.json` and `assets/css/tokens.css`. The generator calls `tokensForCompile` and `compile` from `@blixis/wp-style-engine`; a tooling test regenerates both into temporary files, parses them and checks that the committed copies are current. The token JSON is source data and stays out of the zip.
- `pnpm --filter @blixis/wp-theme run build:css` runs `build-css.mjs` to regenerate `assets/css/theme.css`. The script uses `@tailwindcss/node` to compile and minify, and `@tailwindcss/oxide` to scan only the PHP template paths listed in `theme.src.css`; automatic scanning must remain disabled. Both build dependencies are MIT-licensed and pinned to the same version as Tailwind. Builder documents and editor source never contribute utilities. Template class names are literal strings, never assembled from user content. `pnpm build` regenerates tokens before CSS, then packages twice and compares archive bytes. The tooling test rebuilds CSS to a temporary file and checks that the committed output is current and that an outside-theme fixture class is absent.
- `pnpm wp:start` mounts `wordpress/theme` read-only into `wp-content/themes/blixis` (`docker/compose.packages.yml`, merged by `tooling/wp-env/wp-env.mjs`; the mount is added for the web and the CLI container) and activates it. Edit files on the host; changes show on reload. `WP_DEBUG_LOG` is on, so PHP warnings go to `wp-content/debug.log`.
- `pnpm wp:smoke` checks that the theme is active and declares `Blixis-Compat: 1`, that the front page has a skip link, a `main` landmark, a language and a viewport, that pages and the 404 page render through the theme, and that nothing in the debug log points into the theme.
- `composer run check` lints the theme with the WordPress coding standards and PHPCompatibility, analyses it with PHPStan level 8 and the WordPress stubs, and runs the theme tests.
- `pnpm build` packages `blixis-<version>.zip` reproducibly (tests, tooling files, token source data and `theme.src.css` are excluded). The zip requires `theme.json`, `assets/css/tokens.css` and `assets/css/theme.css`. The header `Version` must equal `wordpress/theme/package.json`.

## Not here yet

`screenshot.png` (required for WordPress.org; with the design work), presets and the setup entry point (see the issues above), translation files (`languages/`, BWB-071) and the WordPress.org theme-review checks (release phase).
