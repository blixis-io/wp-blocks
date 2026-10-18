# Navigation interactions

## Tabs

The PHP renderer always emits linked section headings and all tab panels. This keeps every section reachable when JavaScript is unavailable. When the frontend runtime initializes, it enhances the links and sections with the tab, tablist, and tabpanel roles, selects `defaultValue` (or the first tab when that key is missing), and hides inactive panels.

Horizontal tab sets use Left and Right Arrow keys. Vertical tab sets use Up and Down Arrow keys. Home and End move to the first and last tab. Activation follows focus and does not add history entries. The tablist wraps at either end. Focus outlines and colors use system tokens/current color so theme and dark-mode values remain intact.

## Accordions

Accordion content uses native `details` and `summary` so it remains operable without JavaScript. The `multiple` setting controls whether several entries may stay open; single-open groups use the native `details[name]` group and the runtime also enforces it for browsers without native grouping. When `collapsible` is false, the runtime keeps an entry open after initialization. `defaultOpen` identifies the initially open entries, bounded to one when `multiple` is false; non-collapsible groups default to their first entry if no default is specified.

All titles and content are escaped as text. The inspector's stable item IDs drive default-open selection; public HTML IDs are derived from the element ID and item position rather than authored strings.
