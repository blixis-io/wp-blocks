# BWB-113 Codex implementation report

tokens used
98,168
Implemented BWB-113 on `feat/113-visitor-appearance` for [issue #113](https://github.com/blixis-io/wp-blocks/issues/113). In auto site mode, visitors can choose System, Light, or Dark; exact Light/Dark values are stored in the browser and applied by a small head script before first paint. The header control stays hidden without JavaScript. Forced site modes output neither the control nor the visitor scripts, and the server does not read visitor preference data.

Changed files: [appearance PHP and control](wordpress/theme/src/Appearance.php), [header](wordpress/theme/header.php), [browser scripts](wordpress/theme/assets/js/appearance.js), [CSS source](wordpress/theme/assets/css/theme.src.css) and generated CSS, [PHP tests](wordpress/theme/tests/AppearanceVisitorTest.php), [JS tests](tooling/theme-appearance.test.mjs), [theme architecture](docs/architecture/THEME.md), and [ADR 0005](docs/architecture/adrs/0005-style-resolution-and-css-output.md).

**Checks:** Prettier, JS lint, typecheck, unit tests, Composer lint and tests, PHPStan debug analysis, CSS build, and `git diff --check` passed. `test:tooling` passed 104/107 tests; its remaining failures came from pnpm’s missing local package index for `zod@4.6.7` and PHPStan fixture runs being unable to open a local TCP listener in this sandbox. The standalone license check failed on the same pnpm index error.

No code decisions remain open. Real WordPress and browser smoke checks remain for your planned pass. No commit or push was made.

## Follow-up fixes from the independent review

tokens used
62,969
Applied the BWB-113 review fixes: bfcache and storage-area reconciliation, a CSP hash helper and note, a browser check that fails on unmet expectations, and a stronger byte-identical cache-boundary test. No commit or push was made.

Formatting, lint, typecheck, JavaScript tests, PHP lint, all 352 PHP tests, and PHPStan passed. The live Herd check could not run here: Chrome did not open a debuggable page, and `blixis.test` does not resolve in this environment.
