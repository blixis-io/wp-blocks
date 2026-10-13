# PRD Addendum — Multilingual Content, Light/Dark Design Modes and Delivery Hardening

Status: **Proposed change request** · Applies to `blixis-io/wp-blocks` · Base PRD: `product/PRD.md`.

## 1. Why this addendum exists

The original PRD covers UI localization (NFR-008) but not author-managed **multilingual website content**. It also omits website-specific **light/dark styling variants**. These are distinct from the editor's own light/dark appearance and must be designed into the document schema before the rendering and style engines stabilize.

**Definitions**
- *Editor locale*: language of builder controls and notifications (WordPress i18n).
- *Content locale*: language of published copy, slugs, navigation, alt text and SEO data.
- *Editor appearance*: dark/light color scheme of the application chrome only.
- *Website appearance*: light/dark/auto rendering of the actual site, independent of editor appearance and independent of content locale.

## 2. New functional requirements

### Content translations

- **FR-050** Admin configures supported site locales and a default locale. A source document has a stable ID and child element IDs across languages.
- **FR-051** Textual fields are registered as `translatable`, `invariant`, or `locale-specific`; identifiers, layout structure and raw CSS must never be translated automatically.
- **FR-052** Author can change target locale in the editor and edit translated values while the document tree remains shared by default. Show source text read-only and translation state (`missing`, `draft`, `translated`, `reviewed`, `stale`).
- **FR-053** Source edits flag dependent translations as potentially stale; preserve existing translations instead of silently replacing them. Keep a source content hash / revision marker.
- **FR-054** Missing translations use a configurable fallback policy (source text or blank) with a visible warning, never silently deleting content. Avoid mixed-language SEO metadata when a locale is unpublished.
- **FR-055** Public routing selects locale deterministically, with explicit, tested interactions for existing multilingual plugins (adapter strategy rather than claiming universal compatibility). Define translated URL/slug policy, locale switcher and canonical/hreflang strategy.
- **FR-056** Media alt text, button labels, accessibility labels, menus, template strings and dynamic content must have explicit translation contracts. Respect permissions for translation workflows.
- **FR-057** Bulk workflows (filter untranslated/stale, export/import XLIFF or structured JSON) are extensible; auto-translate is **optional** and must require a configured provider, consent and cost disclosure. Never send private content to external providers without explicit authorization.
- **FR-058** RTL is supported in UI and page preview, including logical CSS properties, direction-aware drag/drop and tests for Arabic/Hebrew fixtures where applicable.
- **FR-059** Per-locale content editing and publishing state must not corrupt or unexpectedly publish other locales; revisions and autosave retain locale identity.

### Content light/dark modes

- **FR-060** Editor chrome theme, website preview theme and the actual site's appearance are independent settings.
- **FR-061** Website supports `light`, `dark` and `auto` (system preference) with a selectable default; user preference takes priority if explicitly set, per documented policy.
- **FR-062** One semantic layout/document tree is shared across appearance modes by default. Styling model supports base tokens/styles plus sparse mode-specific overrides; do not duplicate whole pages or nodes for dark mode.
- **FR-063** Authors can preview or compare light and dark versions side by side, switch edit target, reset overrides, and copy a style between modes. Show an explicit indicator when a property is overridden.
- **FR-064** Colors, backgrounds, borders, shadows, images/assets and typography may vary by mode; responsive overrides must compose deterministically with mode overrides, pseudo-states, global classes and component inheritance.
- **FR-065** Frontend emits accessible CSS based on custom properties and `[data-theme]` or equivalent, and uses `prefers-color-scheme` for auto mode. Prevent wrong-theme flash using a small safe initialization strategy when preference persistence is enabled; the site must work without JavaScript.
- **FR-066** Light/dark variants must meet contrast and focus-indicator accessibility thresholds, and respect `prefers-reduced-motion` for any transitions.
- **FR-067** Language selection must never reset appearance selection (and vice versa), including preview URLs, deep links, autosave and restoration.

### Reliability, safety, licensing and architecture

- **FR-070** Document format has an explicit schema version and migration suite for locale/mode additions; unknown future fields round-trip safely where possible. Never execute arbitrary CSS/HTML from an untrusted translation payload.
- **FR-071** Public renderer independently handles locale, theme mode and viewport breakpoints; editor and PHP output must be parity-tested against shared fixtures.
- **FR-072** CSS cascade precedence must be documented with conformance tests: global tokens → classes → element styles → mode overrides → responsive overrides (order within a mode/breakpoint intersection defined in an ADR). Don't treat this illustrative order as implementation until ADR approval.
- **FR-073** Translation/mode features have a written Free/Plus/Pro allocation decision **before shipping**. Avoid relying on premium plugins to render already-published content after expiration. Recommended: basic manual translation + light/dark theming in Free; bulk/pro translation integrations in paid tiers after market validation.
- **FR-074** Version and compatibility matrix defines supported WordPress/PHP/Node/browser versions and plugin interoperability; no speculative compatibility guarantees.
- **FR-075** CI includes snapshot/conformance tests over locales × modes × breakpoints and protects against explosive combinations via representative pairwise matrices plus targeted full tests for critical cases.

## 3. Proposed data model (illustrative, not final)

```ts
interface PageDocument {
  schemaVersion: number;
  defaultLocale: string;
  locales: string[];
  root: ElementNode;
  translations: Record<string, Record<string, LocalizedProperties>>;
}
interface ElementNode {
  id: string;
  type: string;
  props: Record<string, unknown>; // invariant + source locale
  styles: StyleSet;
  children: ElementNode[];
}
interface StyleSet {
  base?: StyleProperties;
  modes?: Partial<Record<'light' | 'dark', StyleProperties>>;
  responsive?: Record<string, StyleProperties>;
  // Intersection handling must be specified in the style-engine ADR.
}
interface LocalizedProperties {
  values: Record<string, unknown>;
  sourceRevision: string;
  status: 'missing'|'draft'|'translated'|'reviewed'|'stale';
}
```

**Important:** strings must be keyed by stable element and property IDs, not by English source text. Avoid translating HTML chunks when rich text can use a structured safe representation. Public URL localization cannot be solved solely by translating element props; evaluate WP post/translation plugin interoperability.

## 4. Acceptance scenarios

1. Build an English hero with a heading, button, alt text and menu entry. Switch to Dutch and translate; English remains unchanged.
2. Edit English source and confirm Dutch becomes `stale` without its text being overwritten.
3. Set heading foreground/background in light mode, override dark colors, then edit responsive font size: both site modes render correctly without duplicating node IDs.
4. Independently switch editor chrome from light to dark while website preview stays in light mode.
5. Preview Dutch/dark/mobile and English/light/desktop, save, reopen, publish and confirm deterministic PHP output.
6. Disable JavaScript and confirm readable light/dark defaults; test system mode and manual preference persistence with JavaScript enabled.
7. Exercise missing-language fallback, RTL direction, keyboard-only editing, image alt translation and contrast checks.
8. Deactivate a premium add-on and change active theme; data is never deleted, and public content follows documented fallback behavior.
9. Fail provider-side machine translation safely with no partial overwrite, no unapproved data transmission and no hidden costs.

## 5. New delivery decisions / ADRs required before implementation

- ADR: locale storage and routing (native WordPress vs adapters for WPML/Polylang, etc.).
- ADR: style precedence when locale-independent dark overrides meet breakpoint/state overrides.
- ADR: CSS scoping and theme preference persistence / FOUC prevention.
- ADR: translation field registration and rich text safety.
- ADR: Free/Plus/Pro feature policy for multilingual/manual vs automated translations.
- ADR: live preview architecture and cache key dimensions (locale, mode, revision, site token version).

## 6. Phasing

- **P0:** ADRs and data-contract decisions; add migration/cascade fixtures before implementation.
- **P2:** core schema, translation metadata, mode overrides and CSS parity.
- **P3:** onboarding for site languages and both-mode presets, global tokens.
- **P4:** PHP locale-aware renderer, routing adapters and save APIs.
- **P5–P6:** locale selector, translation inspector, side-by-side theme mode preview, keyboard behavior.
- **P7:** user journeys, accessibility, migration and cross-mode regression gate.
- **P8–P9:** paid integrations/bulk workflows only after tier policy is signed off.
- **P10:** multilingual documentation, API reference, tutorials and Playwright examples.

## 7. Scope discipline

**Phase 1 minimum:** manual English/Dutch content editing, explicit fallback, light/dark per-element overrides, site mode switch, PHP output, test coverage. **Later:** additional routing plugin adapters, translation services, XLIFF, contextual translation memory, multilingual SEO automation and advanced side-by-side editing. A mockup is not an authorization to ship every depicted feature immediately.
