# BWB-042 Codex implementation report

tokens used
109,944
Implemented BWB-042’s preview route. It accepts an unsaved document or reads the selected post’s working streams, validates the envelope and bounded tree, and returns a structural HTML fragment through a replaceable renderer. The response is capped and checked by a reject-only HTML sanitizer. The route uses the document permission policy and marks preview responses `private, no-store`.

Changed files are grouped under [preview REST policy and transport](wordpress/plugin/src/Rest/PreviewController.php), the [preview contract classes](wordpress/plugin/src/Preview/PreviewRenderer.php), [tests](wordpress/plugin/tests/PreviewTest.php), and the [canvas contract](docs/architecture/CANVAS-CONTRACT.md). The REST tables in `WORDPRESS.md` and `SCHEMAS-AND-APIS.md` were updated.

**Checks passed:** `composer run lint:fix`, `composer run lint`, `composer run test` (189 tests, 781 assertions), PHPStan, Prettier on `docs`, and `git diff --check`. I did not run the real WordPress smoke, as requested. No commit or push was made.

Decision and remaining limit: this issue’s renderer emits structure only; real element output and compiled CSS remain with BWB-043/044. No new open decision was introduced.
