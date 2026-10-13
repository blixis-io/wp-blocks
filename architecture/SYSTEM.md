# Technical Architecture

## Bounded contexts

1. **Theme (`wordpress/theme`)** — presentation templates, Tailwind v4 compiled assets, `theme.json`, token hooks, theme compatibility metadata, setup integration. **No page document storage.**
2. **Core plugin (`wordpress/plugin`)** — data models, REST endpoints, PHP element renderers, persistence/migration, WordPress auth, editor registration and public rendering hooks.
3. **Editor (`apps/editor`)** — React + TypeScript, shadcn/ui, Tailwind for its chrome, Zustand stores, inspector, history, dnd-kit interactions and canvas.
4. **Shared packages** — schema, CSS compiler, element definitions, controls, design tokens, bridge events, capabilities.
5. **Premium add-ons** — separately deployed plugin packages registering capabilities, elements and data adapters.
6. **Docs (`apps/docs`, late phase)** — Astro Starlight + Playwright.

## Architecture diagram

```text
WP posts/pages/media/fonts/users
           |
WP REST API + authenticated capabilities ------ licensed optional add-ons
           |
     Versioned Builder JSON
      /                  \
React editor + iframe     PHP renderers
      |                     |
shadcn UI/dnd-kit          Semantic HTML
      |                     + page CSS compiled from JSON
      + live style preview  + site tokens + Tailwind theme CSS
```

## Monorepo (target)

```text
apps/editor
apps/docs                 # future
packages/core             # schemas, commands, migrations, snapshots
packages/element-registry
packages/style-engine
packages/design-tokens
packages/canvas-bridge
packages/editor-ui
packages/capabilities
wordpress/theme
wordpress/plugin
wordpress/plus
wordpress/pro
tests/e2e
tests/fixtures
tooling
.github
```

## Editor

- Store document, selection, viewport, panel state, dirty state and command history separately.
- Prefer commands (`InsertElement`, `MoveElement`, `UpdateProps`, `SetStyle`, `RemoveElement`) to arbitrary mutable tree operations.
- Use IDs stable across edits; reject cycles, disallowed parents and invalid nesting before commit.
- `dnd-kit` drives tree/canvas affordances; canvas bridge knows DOM positions; core commands decide validity.
- Canvas is a same-origin sandboxed iframe backed by live or server-preview output; validated `postMessage` protocol, no unrestricted inline scripts.
- shadcn/ui for chrome, schema-driven custom inspector controls for layout-specific interactions. Provide keyboard alternatives.

## Styling

- Theme builds a static Tailwind v4 stylesheet; scan only known source files, never arbitrary user documents.
- Shared tokens are persisted site-wide as versioned settings; emitted as CSS custom properties. Tailwind maps static utilities to compatible tokens.
- Element styles are stored as typed declarations and compiled into deterministic, scoped CSS classes per document. Support responsive breakpoints, pseudo-states and nested selectors only from safe validated vocabularies.
- Never treat user-supplied class names as trusted executable CSS; sanitize properties/values, restrict URL/function use, escape class names, use explicit allowlists.
- Separate editor CSS (including preflight) from iframe/front-end CSS; test plugin conflicts and specificity.

## Rendering and parity

- PHP is authoritative for published markup. Elements have PHP renderers; common fixture data ensures editor preview parity.
- React may render editor overlays but must not be necessary to render public pages.
- Server output is semantic HTML with escaped text/attrs/URLs, minimal assets and native WP filters where needed.
- Unknown element types preserve raw JSON and emit safe fallback; no fatal errors.
- Public rendering should work with persistent cache. Invalidation on document/tokens/theme changes is explicit.

## Fonts

- Integrate WordPress Font Library (available globally as of WP 7.0), query installed families/variants via server adapter, and preserve referenced font identities.
- Use `theme.json` and WordPress font registration where appropriate; align generated CSS with available fonts and fallbacks.
- Font files are owned by WordPress; no second media upload system. Default to system fallback on missing font.

## Themes, compatibility, portability

- Builder **editing** requires a supported active theme slug/parent marker and compatibility version. Child themes are supported.
- Switch to unsupported theme => editor disabled with actionable notice; preserve document JSON. Render/shortcode fallback to be defined in ADR and verified to avoid blank pages.
- Theme settings persist across reactivation; initialize setup only once per site.

## Architectural Decision Records

Create ADRs at `architecture/adrs/` for: theme mode, WP version floor, page persistence, PHP parity, CSS schema, fonts, plugin split, theme-switch fallback, animation engine license, and licensing/deployment. ADR template: context, options, decision, consequences, rollback.
