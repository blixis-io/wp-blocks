# BWB-049 implementation and validation record

**Work split.** Frontend (`apps/editor`, `packages/editor-ui`, build, tests, `docs/architecture/EDITOR.md`): Claude Sonnet 5.5 subagent. PHP editor screen (`wordpress/plugin/src/Admin`, tests, docs): Codex with the lighter GPT-6 Luna model. Orchestrator: dependency and boundary checks, asset packaging, real-WordPress smoke, real-browser check, integration fixes. Independent validation (read-only): Claude Opus 5.5 subagent.

**Validation verdict:** READY WITH FIXES. Findings and their resolution:

| Finding | Severity | Resolution |
|---|---|---|
| RTL: no Radix `DirectionProvider`, toolbar and tabs stayed LTR | High | Provider added; tests for `ar` (dir and mirrored arrows) and `en_US` |
| Reflow clipped content at 320 CSS px | Medium | Narrow layout scrolls; Herd browser check asserts 320px |
| Selected state shown by background colour only (1.27:1, 1.60:1) | Medium | 2px ring token at >= 3:1 in both themes, tested |
| Post title showed raw entities (`get_the_title`) | Medium | stored title, tags stripped, entities decoded; browser `<title>` uses the same text; smoke check |
| One cross-origin `viewUrl` broke the whole editor | Medium | PHP sends `null` for a cross-origin permalink |
| No licence notices in the shipped bundle | Medium | `editor.js.LEGAL.txt` and generated `NOTICE.txt` ship with the plugin (required files) |
| `img-src https:` too broad | Low | `img-src 'self' data:` |
| Editor rendered on `admin-ajax.php`/`admin-post.php` | Low | gated on `pagenow === admin.php` |
| Raw URL strings, unknown bootstrap keys stripped not refused, locale grammar mismatch PHP/JS | Low | normalised URLs, `strictObject`, grammar mirrors `MetaKeys::is_valid_locale` |
| Chips named with `aria-label` on spans; panel toggles announced state twice | Low | visually hidden text; fixed labels with `aria-expanded` |
| Weak or vacuous tests (dark axe run identical to light, Save click without assertion, `__proto__` test, smoke 403 comparison) | Test quality | replaced or strengthened |
| Docs claimed SRI, mirrored RTL, refused unknown keys, stale "pending" matrix rows | Docs | corrected |

**Found only by running a real browser (not by jsdom or the reviewer):** (1) the strict CSP blocked the `<style>` element that Radix dialogs inject for scroll lock; fixed with a per-response style nonce handed to the bundle through `__webpack_nonce__`, not `unsafe-inline`; (2) with the structure panel collapsed the canvas collapsed into the 0-width grid track (auto-placement after a `hidden` panel left the grid); fixed with explicit grid columns and a geometry assertion.

**Known limitations (documented):** dark chrome shows a brief white flash before mount; `viewUrl` is the default-locale permalink until BWB-057; the manifest hashes are build/sync-time integrity only (no SRI).
