# UI, Design System and CSS Styleguides

## Experience principles

Fast, predictable, visually quiet, keyboard-operable, professional. The editor must preserve attention on the website canvas and clearly distinguish editing chrome from content.

## Editor layout

- Left: element library and structure tree (switchable or dockable).
- Center: sandboxed website iframe with overlays and viewport controls.
- Right: property inspector grouped Content, Layout, Typography, Spacing, Borders, Background, Effects, Advanced.
- Top: undo/redo, viewport presets, history, preview, save/publish status.
- Shortcuts documented and discoverable; never shadow text-entry shortcuts.

## Interaction

- Clear hover vs selection vs drag state; visible and screen-reader understandable drop indicators.
- Undo/redo granular, predictable and safe after save. Preserve focus after reordering and inspector updates.
- Responsive edits identify active breakpoint and inheritance (value from wider breakpoint vs explicit override).
- Form inputs have labels, units, min/max, reset to inherited value and live visual feedback.
- Autosave and publishing statuses are explicit; warn on conflicts, network errors and navigation with unsaved changes.

## Design tokens

Tokens for color roles (brand/foreground/background/surface/border/focus/danger), fonts (heading/body/mono), type scale, spacing, sizing, radii, shadows, motion, container widths and breakpoints. Theme, frontend and editor consume a versioned token schema but are free to express them through separate CSS bundles.

## Accessibility

- WCAG 2.2 AA target for core editing flows and default output.
- Visible focus ring, contrast-tested text and interactive borders, keyboard reorder alternatives, proper landmarks and label associations.
- Reduced-motion mode (`prefers-reduced-motion`), no non-essential animations forced.
- Responsive keyboard/screen reader tests across dialogs, menus, nested tree and inspector.

## Tailwind CSS and shadcn/ui

- Tailwind v4 powers theme static assets and editor chrome; `shadcn/ui` code is owned in repo and themed via scoped editor design tokens.
- Separate admin stylesheet from content iframe. Do not blindly apply Tailwind preflight to all WordPress content.
- Do not expose arbitrary runtime Tailwind class generation as page document contract.

## Naming conventions

- React components `PascalCase`, hooks `useSomething`, constants `UPPER_SNAKE_CASE`, npm packages `@blixis/wp-*`.
- PHP namespaces `Blixis\...`, WP handles `blixis-*`, CSS runtime classes `blx-*`, CSS variables `--blx-*`.
- Theme slug `blixis`; plugin slug `blixis-builder`; repo name remains `wp-blocks`.

## Theme presets

Preset = immutable documented data object with accessible contrast defaults. Preset IDs stable. Manual customization generates user-owned overrides. Switching preset must preview diffs and request confirmation before replacing overrides; offer undo or export before destructive changes.

## Documentation visual style

Starlight docs use same semantic design tokens and accessible navigation. Examples and screenshots must have captions/alt text and match released UI; no fabricated screenshots.
