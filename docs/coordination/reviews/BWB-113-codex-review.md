# BWB-113 independent Codex review (read-only)

Stored-value validation, translated attribute escaping, and prototype-like keys showed no injection issue. The compiled theme selectors and forced site modes are consistent with the implementation. **Accessibility is clean** for the requested names, roles, pressed state, live region, focus, forced colors, RTL, and 44px targets. **Cache safety is clean in the implementation:** it does not read visitor state on the server or vary HTML per visitor.

Read-only checks: `git diff --check`, the three Node tests, and the three PHP visitor tests passed. PHPUnit also warned that it could not write its result cache under the read-only filesystem.
hook: Stop
hook: Stop Completed
tokens used
54,155
## Findings

1. **Security / CSP compatibility — Medium.** The early preference script is emitted inline by [Appearance.php:75](wordpress/theme/src/Appearance.php:75). `wp_get_inline_script_tag()` makes it possible for a site to add a nonce through WordPress filters, but this code supplies no nonce or hash itself. On a site with a CSP that blocks inline scripts, the stored preference cannot apply before CSS loads; the footer script then changes the theme later. This is a CSP compatibility and first-paint issue, not an XSS finding.

2. **Correctness — Medium.** [appearance.js:48](wordpress/theme/assets/js/appearance.js:48) synchronizes `storage` events, but there is no `pageshow` reconciliation. A page restored from the back/forward cache can retain its old `data-theme`, meta value, and pressed button after the preference changed in another tab while that page was suspended.

3. **Correctness — Low.** The `key === null` path at [appearance.js:49](wordpress/theme/assets/js/appearance.js:49) treats every storage clear event as a cleared appearance preference without checking `event.storageArea`. A same-origin iframe clearing `sessionStorage` can therefore switch the page to System while its `localStorage` preference remains Light or Dark.

4. **Tests — Medium.** The real-browser check only collects values and prints them at [appearance-browser-check.mjs:60](tooling/herd/appearance-browser-check.mjs:60) and [appearance-browser-check.mjs:106](tooling/herd/appearance-browser-check.mjs:106); it makes no assertions. Its “before first paint” claim is also unsupported: [appearance-browser-check.mjs:76](tooling/herd/appearance-browser-check.mjs:76) observes parsing state, not a paint event. The check can print failing values and still exit successfully.

5. **Tests — Low.** The cache-boundary test at [AppearanceVisitorTest.php:67](wordpress/theme/tests/AppearanceVisitorTest.php:67) checks only that two request globals are absent from `Appearance.php` at [AppearanceVisitorTest.php:79](wordpress/theme/tests/AppearanceVisitorTest.php:79). That does not establish that rendered HTML is identical across visitors.

Stored-value validation, translated attribute escaping, and prototype-like keys showed no injection issue. The compiled theme selectors and forced site modes are consistent with the implementation. **Accessibility is clean** for the requested names, roles, pressed state, live region, focus, forced colors, RTL, and 44px targets. **Cache safety is clean in the implementation:** it does not read visitor state on the server or vary HTML per visitor.

Read-only checks: `git diff --check`, the three Node tests, and the three PHP visitor tests passed. PHPUnit also warned that it could not write its result cache under the read-only filesystem.
