# Navigation interactions

## Tabs

The PHP renderer always emits linked section headings and all tab panels. This keeps every section reachable when JavaScript is unavailable. When the frontend runtime initializes, it enhances the links and sections with the tab, tablist, and tabpanel roles, selects `defaultValue` (or the first tab when that key is missing), and hides inactive panels.

Horizontal tab sets use Left and Right Arrow keys. Vertical tab sets use Up and Down Arrow keys. Home and End move to the first and last tab. Activation follows focus and does not add history entries. The tablist wraps at either end. Focus outlines and colors use system tokens/current color so theme and dark-mode values remain intact.

## Accordions

Accordion content uses native `details` and `summary` so it remains operable without JavaScript. The `multiple` setting controls whether several entries may stay open; single-open groups use the native `details[name]` group and the runtime also enforces it for browsers without native grouping. When `collapsible` is false, the runtime keeps an entry open after initialization. `defaultOpen` identifies the initially open entries, bounded to one when `multiple` is false; non-collapsible groups default to their first entry if no default is specified.

All titles and content are escaped as text. The inspector's stable item IDs drive default-open selection; public HTML IDs are derived from the element ID and item position rather than authored strings.

## Mobile menus and sticky headers

The mobile-menu element uses native `details`/`summary` as its disclosure control, so the links remain operable without JavaScript. At wide widths the summary is hidden and the navigation is forced visible even while the details element is closed. Navigation orientation is constrained to horizontal or vertical before it reaches the markup.

Sticky headers use `position: sticky` and a validated 0–256 pixel block offset. The header uses `Canvas` and `CanvasText`, which follow the active site color scheme. Back-to-top is a normal empty-fragment link, so it returns to the document start without hijacking scrolling or requiring a script.

Scroll-spy navigation observes only same-origin fragment links whose target IDs exist in the document. It updates `aria-current="location"` for the closest visible section. Browsers without `IntersectionObserver` keep the ordinary link list and do not receive an incomplete scroll handler.

Mega menus render all nested links in a responsive, multi-column list. This keeps every destination visible and keyboard reachable; child links are not hidden behind hover-only interaction. Wizard steps render an ordered list with the configured current step and horizontal or vertical orientation. Site-title reads the current WordPress site name when available and uses its authored content as a fallback outside WordPress or when the site name is empty.

## Off-canvas panels

Off-canvas content is a native `details` disclosure, so it is available without JavaScript. The placement and animation preset are allowlisted. Click, hover, and focus opening modes use the disclosure summary; `manual` mode listens for `blixis:offcanvas-open` and `blixis:offcanvas-close` events on the element. A modal panel adds `role="dialog"`, traps Tab focus, makes outside branches inert, and restores focus on close. Escape and outside-click dismissal follow their respective settings. Reduced-motion preferences disable the entrance animation.
