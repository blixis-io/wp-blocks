## Review of `feat/29-theme-scaffold`

**No blocker to merging BWB-029 as a scaffold.** I would fix the major findings before treating its output and compatibility rule as a foundation for later issues.

### Major

- **Escape theme-owned text at output.** [header.php](wordpress/theme/header.php:20) prints the site name with `bloginfo()`, and the [content template parts](wordpress/theme/template-parts/content.php:12) print titles with `the_title()` without a final context escape. Use `esc_html( get_bloginfo( 'name' ) )` and escaped title values; escape the charset as an attribute. Review archive title and description as intentional, restricted HTML. Keep `the_content()` as rendered content rather than escaping its markup.
- **Settle the child-theme precedence rule before BWB-047 copies it.** [Compat.php](wordpress/theme/src/Compat.php:72) correctly prefers a child’s valid number, including one different from its parent’s. It also falls back to the parent when the child has an *invalid* header, although the documented rule says fallback when the header is *absent*. Define that distinction, test absent/invalid/different child values, and require the plugin to compare supported versions rather than accept any positive integer.
- **Preserve a visible destination for keyboard skipping.** The skip link and focusable `<main>` are sound, but [style.css](wordpress/theme/style.css:83) removes the main landmark’s focus outline. Remove that override or provide another visible focus treatment. This is a scaffold accessibility fix; broader contrast, RTL and manual audits belong to BWB-038.
- **Do not claim `accessibility-ready` before its audit.** [style.css](wordpress/theme/style.css:14) and [readme.txt](wordpress/theme/readme.txt:9) use the tag while BWB-038 remains open. Remove it for now or add the required review evidence.

### Minor

- [footer.php](wordpress/theme/footer.php:15): `esc_html__()` turns `&copy;` into visible literal text. Use `©` in the translated string.
- [search.php](wordpress/theme/search.php:18): `get_search_query()` is escaped by default, then escaped again. Request the raw value and escape once.
- [index.php](wordpress/theme/index.php:10): a populated posts home has only post `h2`s and no page `h1`. Add a contextual heading when that template serves the posts index. Archive, search and 404 headings are present; singular templates use `h1`.
- [wp-env.mjs](tooling/wp-env/wp-env.mjs:146): the debug-log check can fail on an old theme entry and does not isolate the current smoke run. Record a starting offset or use a fresh log. The Linux container path itself is unaffected by a Windows host path.
- [wp-env.mjs](tooling/wp-env/wp-env.mjs:75): `install()` silently skips activation if the package mount is absent. Fail clearly when this theme-specific environment is expected; otherwise the later smoke failure is harder to diagnose.
- [THEME.md](docs/architecture/THEME.md): the missing `screenshot.png` is documented and can wait for visual design, but it must be supplied before WordPress.org submission. `home.php`, `front-page.php` and `attachment.php` are optional hierarchy specializations; `index.php` supplies the classic-theme fallback.

### Agreements

The required classic-theme entry files, headers, GPL declaration, text domain, PHP floor, hooks, menu and HTML5 support are present. `comments.php` uses the standard navigation and form calls and casts the comment count appropriately. The compatibility parser’s digit and bound checks are reasonable. The `blixis` slug, text domain, `Blixis\Theme` namespace, `src/` layout and `blixis-style` handle are coherent; keep them stable as later issues build on them. `declare(strict_types=1)` governs calls made *from* each PHP file and does not make WordPress’s include of that file strict.

Both resolved Compose services mount the theme read-only. The package rules include PHP `src/` files and exclude tests; the header and package version are both `0.1.0`. The fake `ABSPATH` is limited to unit tests, and the runtime guards are present. `wp theme activate` is repeatable, though `start` will switch an existing local site back to Blixis. With the package Compose file absent, the wrapper can still run but will lack the theme mount.

**Read-only checks passed:** PHP syntax for all theme PHP files; theme PHPUnit suite (24 tests, 63 assertions on PHP 8.4.25); Node syntax for the two tooling files; and resolved Docker Compose configuration. The working tree remained clean.

**Could not verify offline:** an actual WordPress 7.0/7.1 activation and smoke run, PHP 8.2/8.5 CI behavior, theme-review acceptance, browser keyboard behavior, rendered search-form labels, or the accessibility tag’s full criteria. No obvious PHP 8.5-specific construct appeared in the theme, but the unit suite does not exercise WordPress template rendering.