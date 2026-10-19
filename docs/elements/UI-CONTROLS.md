# UI controls

The P5 native controls render HTML controls that work before JavaScript loads. Switches and checkboxes use native checkbox inputs; radio, select, toggle group and segmented controls use native selection controls; the slider uses `<input type="range">`. Labels and option text are escaped, option collections are bounded to 100 entries, and control names are restricted to a short safe character set.

The standalone toggle is a button with `aria-pressed`. Frontend JavaScript updates that state when clicked. Slider JavaScript keeps its adjacent `<output>` synchronized, while the range input itself remains usable without JavaScript. A range slider with two independently adjustable bounds is still planned; it is not advertised as ready.

Controls inherit the document's scoped styles, theme tokens and responsive styles. They use browser-native color and focus behavior unless a site style overrides them. Required and disabled states are emitted as native attributes.

## Verification

- `ElementDefinitionRegistryTest::test_ui_control_elements_render_accessible_and_safe_native_markup` checks semantic markup, escaping, selection, clamping and preview-sanitizer acceptance.
- Frontend runtime behavior is initialized only on pages containing toggle or slider markers.
- Run `composer run check`, `pnpm check`, and `pnpm wp:smoke` for the full renderer and WordPress integration gates.
