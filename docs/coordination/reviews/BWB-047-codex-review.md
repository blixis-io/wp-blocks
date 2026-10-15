# BWB-047 independent Codex review (read-only)


The cache finding above also affects status, notices, and fallback CSS after a blog or theme context change within one PHP request. Otherwise, I found no child/parent precedence or invalid-child fall-through problem: an explicitly present child header is selected before the parent ([WordPressCompatibilityReader.php](wordpress/plugin/src/Theme/WordPressCompatibilityReader.php:18)). For valid post IDs, the guard orders unauthenticated 401, forbidden 403, then incompatible 423 correctly ([ThemeGuard.php](wordpress/plugin/src/Rest/ThemeGuard.php:27)).

## 3. Test gaps

- No test switches blog or theme context *within one PHP request* after populating the static cache; that would expose the finding above ([ThemeCompatTest.php](wordpress/plugin/tests/ThemeCompatTest.php:83)).
- The real WordPress smoke covers an invalid child declaration, but not an explicitly **empty** child header, which the contract says must override a valid parent ([wp-env.mjs](tooling/wp-env/wp-env.mjs:1066)). The unit test checks the pure precedence helper, not the WordPress file reader ([ThemeCompatTest.php](wordpress/plugin/tests/ThemeCompatTest.php:53)).
- The incompatible-theme smoke checks subscriber 403 for layout PUT, but does not exercise anonymous 401, publish-capability 403, or content restore through real REST dispatch ([wp-env.mjs](tooling/wp-env/wp-env.mjs:1021)).
hook: Stop
hook: Stop Completed
tokens used
69,988
## 1. Security

**Finding — the 423 lock can use another site’s compatibility result in a multisite request.** `ThemeCompat` stores one static result for the whole PHP request and returns it without checking the current blog or stylesheet ([ThemeCompat.php](wordpress/plugin/src/Theme/ThemeCompat.php:20), [ThemeCompat.php](wordpress/plugin/src/Theme/ThemeCompat.php:59)). If code checks a compatible site, calls `switch_to_blog()` for an incompatible site, then dispatches a builder write in that same request, the guard reuses `compatible=true` and permits the write. The reverse order incorrectly locks a compatible site. Key the cache by site and active stylesheet, or invalidate it on a context switch.

I found no XSS in the new notice or fallback CSS: the notice escapes the theme name and URL ([AdminNotice.php](wordpress/plugin/src/Theme/AdminNotice.php:34)); the stylesheet is a static string with no document or theme input ([FallbackCss.php](wordpress/plugin/src/Frontend/FallbackCss.php:15)). I found no other unguarded builder write route.

**Complete `register_rest_route` inventory under `wordpress/plugin/src`:**

| Route | Methods | Theme lock |
| --- | --- | --- |
| Document layout and locale content `/revisions` | GET | Read allowed; edit permission applies ([DocumentController.php](wordpress/plugin/src/Rest/DocumentController.php:52)) |
| Document layout and locale content `/restore` | POST | Guarded, 423 after access checks ([DocumentController.php](wordpress/plugin/src/Rest/DocumentController.php:62)) |
| Document layout and locale content | GET, PUT | GET allowed; PUT guarded ([DocumentController.php](wordpress/plugin/src/Rest/DocumentController.php:72)) |
| `/documents/{id}/preview` | POST | Read-only preview; edit permission applies ([PreviewController.php](wordpress/plugin/src/Rest/PreviewController.php:36)) |
| `/documents/{id}/published` | GET | Read allowed; edit permission applies ([PublicationController.php](wordpress/plugin/src/Rest/PublicationController.php:50)) |
| `/documents/{id}/publish`, `/rollback` | POST | Guarded, 423 after edit and publish checks ([PublicationController.php](wordpress/plugin/src/Rest/PublicationController.php:64)) |
| `/status` | GET | Read-only; requires `edit_posts` ([StatusController.php](wordpress/plugin/src/Rest/StatusController.php:18)) |
| `/media/{id}` | GET | Read-only ([MediaController.php](wordpress/plugin/src/Rest/MediaController.php:25)) |

## 2. Correctness

The cache finding above also affects status, notices, and fallback CSS after a blog or theme context change within one PHP request. Otherwise, I found no child/parent precedence or invalid-child fall-through problem: an explicitly present child header is selected before the parent ([WordPressCompatibilityReader.php](wordpress/plugin/src/Theme/WordPressCompatibilityReader.php:18)). For valid post IDs, the guard orders unauthenticated 401, forbidden 403, then incompatible 423 correctly ([ThemeGuard.php](wordpress/plugin/src/Rest/ThemeGuard.php:27)).

## 3. Test gaps

- No test switches blog or theme context *within one PHP request* after populating the static cache; that would expose the finding above ([ThemeCompatTest.php](wordpress/plugin/tests/ThemeCompatTest.php:83)).
- The real WordPress smoke covers an invalid child declaration, but not an explicitly **empty** child header, which the contract says must override a valid parent ([wp-env.mjs](tooling/wp-env/wp-env.mjs:1066)). The unit test checks the pure precedence helper, not the WordPress file reader ([ThemeCompatTest.php](wordpress/plugin/tests/ThemeCompatTest.php:53)).
- The incompatible-theme smoke checks subscriber 403 for layout PUT, but does not exercise anonymous 401, publish-capability 403, or content restore through real REST dispatch ([wp-env.mjs](tooling/wp-env/wp-env.mjs:1021)).
