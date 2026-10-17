# BWB-159 setup wizard design pass

Issue: [#267](https://github.com/blixis-io/wp-blocks/issues/267)  
Scope: compare the current WordPress screenshots with the owner's design-16 through design-19, then bring wizard steps 2 through 6 closer to those targets while preserving the six-step POST, nonce, resume, validation, and apply contracts.

## Screenshot comparison

| Current screenshot | Owner target | Comparison before this pass |
| --- | --- | --- |
| `ws-step2.png` (Theme) | `design-16-setup-wizard-2.png` | The stepper already showed Theme as active and the page had the four foundation groups. The page still used the generic “Welcome to Blixis” heading, had no step-specific helper copy or preview, and rendered the unavailable options as plain radio rows with one repeated backend notice. The target uses a prominent Theme heading, a two-column set of selectable-looking cards, and a selected-template live preview. |
| `ws-step3.png` (Style) | `design-17-setup-wizard-3.png` | The stepper state was correct. The screen had raw body/heading font stacks, a text-size select, and Auto/Light/Dark radios, but no selected palette, card hierarchy, button-style explanation, or preview. The target groups palette, type, button and appearance choices beside a live site preview. |
| `ws-step4.png` (Style continuation) | `design-17-setup-wizard-3.png` | There is no separate owner screenshot for this screen. It belongs to the same Style stepper stage, but showed spacing, radius and container selects as crowded inline text controls. Those settings already have validated token backing and needed a readable continuation that retained the existing step and field contract. |
| `ws-step5.png` (Content) | `design-18-setup-wizard-4.png` | The stepper state was correct, but the generic heading remained and the page showed one large document card followed by a long raw list of unsupported schema details. There was no import summary. The target uses a clear Content heading, categorized import choices and a summary; the present templates do not support those imports, so interactive fake categories would misrepresent capabilities. |
| `ws-step6.png` (Finish) | `design-19-setup-wizard-5.png` | The stepper state was correct, but the page only showed a plain “Setup Complete!” heading, one-line choices and an Apply button. It lacked a review/success distinction, a visual summary, the selected design preview and post-apply actions. |

## Changes

- Added step-specific headings and helper text, preserving the five visible stepper stages and the two-screen Style stage.
- Reworked Theme controls into a responsive card layout and displayed the selected pack's validated preview image. Unsupported foundation choices remain disabled with the actual missing-apply-backend reason.
- Added a selected-palette summary, readable typography choices, the existing Auto/Light/Dark setting, and a token-driven sample website preview. Button styles remain disabled because no saved button-style setting exists.
- Kept spacing, radius and container edits on the existing step 4; converted them to labeled responsive token cards and summarized their design tokens.
- Kept Content import controls honest: document refusal reasons remain visible and the new summary explains that unregistered element types block import. It does not claim anything was imported.
- Added a pre-apply review and made the successful Apply redirect render the Finish success state, selected template preview, configured-choice summary, and available post-setup links. Completion is still recorded only after `DesignSystemStore::apply()` succeeds.
- Added Dutch translations and strengthened the translation test to match each `msgid` with its own `msgstr`, including around plural entries. Extended wp-env smoke assertions for the previews, unavailable controls, review state and post-apply success state.
- Updated `docs/architecture/THEME.md` to document the preview limits, unavailable options, two Style screens and completion behavior.

The style preview is a sample assembled from the selected validated token values; it does not render the template's document. The image preview is the provider's template preview asset. The wizard does not install demo pages, menus, forms, products or plugins.

## Verification status

Prettier, PHPCS, all 450 Composer/PHPUnit tests, PHPStan debug mode, all 3,580 pnpm unit tests, setup translation parity, smoke-script syntax, PO catalog syntax, duplicate PO message IDs and `git diff --check` pass. The full `pnpm check` passes format, manifest, ESLint, typecheck, workspace boundaries and 118 of 119 tooling tests; its sole failure is the default PHPStan worker failing to bind `127.0.0.1:0` with `EPERM` in this sandbox. Docker/wp-env and Herd were not run in this environment; real-browser layout, WCAG contrast/focus/reflow, RTL behavior and the updated WordPress smoke flow still need the owner's real screenshots and environment checks.
