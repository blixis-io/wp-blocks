# UI controls

The P5 native controls render HTML controls that work before JavaScript loads. Switches and checkboxes use native checkbox inputs; radio, select, toggle group and segmented controls use native selection controls; the slider uses `<input type="range">`. Labels and option text are escaped, option collections are bounded to 100 entries, and control names are restricted to a short safe character set.

The standalone toggle is a button with `aria-pressed`. Frontend JavaScript updates that state when clicked. Slider JavaScript keeps its adjacent `<output>` synchronized, while the range input itself remains usable without JavaScript. Range sliders expose separate lower and upper native range inputs and keep the bounds ordered as the user drags either thumb.

Date picker and date range picker controls use labeled native date inputs. Calendar supports single, range and bounded multiple-date selection using the browser's native picker. Data tables render escaped static rows and support optional filtering; sortable tables add keyboard-operable column buttons. Charts render a native meter list as a readable static data view. Ratings use a fieldset of native radio buttons or a meter in read-only mode. Copy buttons expose an explicit localized copy value and announce success or failure. Loading buttons change to their configured busy label only after a valid containing form submits. Dialog-like overlays use the native disclosure fallback and gain focus handling only where the off-canvas runtime is enabled. Command lists remain visible without JavaScript and gain text filtering. Carousels use a scrollable track, native controls, a pause control for autoplay, and disable autoplay when reduced motion is requested. Scroll indicators track the page scroll position. Context menus open on right-click and remain keyboard-operable through their native disclosure trigger.

Controls inherit the document's scoped styles, theme tokens and responsive styles. They use browser-native color and focus behavior unless a site style overrides them. Required and disabled states are emitted as native attributes.

## Verification

- `ElementDefinitionRegistryTest::test_ui_control_elements_render_accessible_and_safe_native_markup` checks semantic markup, escaping, selection, clamping and preview-sanitizer acceptance.
- Frontend runtime behavior is initialized only on pages containing toggle or slider markers.
- Run `composer run check`, `pnpm check`, and `pnpm wp:smoke` for the full renderer and WordPress integration gates.
