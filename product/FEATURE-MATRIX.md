# Packaging: Free / Plus / Pro

**Decision:** Free is a complete free-to-use page builder; Plus and Pro are **separate installed add-on distributions** rather than paywalls around code shipped inside a WordPress.org free plugin.

| Capability | Free | Plus | Pro |
|---|:---:|:---:|:---:|
| Blixis Theme + setup presets and custom tokens | Yes | Yes | Yes |
| WordPress Font Library adapter | Yes | Yes | Yes |
| Core visual editor, responsive styles, history, save/publish | Yes | Yes | Yes |
| Core elements and media | Yes | Yes | Yes |
| Global CSS classes and design tokens | Yes | Yes | Yes |
| Manual multilingual content: multiple locales, locale-specific storage, translation statuses, fallbacks, independent locale publishing | Yes | Yes | Yes |
| Website light/dark appearance: global light/dark tokens, element-level overrides, responsive styling, light/dark previews | Yes | Yes | Yes |
| Automated/AI translation, translation providers, bulk workflows, translation memory, advanced localization rules | — | Candidate | Candidate |
| Theme templates / display conditions | — | Yes | Yes |
| Dynamic data bindings / ACF adapter | — | Yes | Yes |
| Enhanced reusable design patterns | — | Yes | Yes |
| Query loop and advanced conditional rendering | — | — | Yes |
| WooCommerce component templates | — | — | Yes |
| Advanced animation controls (approved engine) | — | — | Yes |
| Extended integration SDK examples | — | — | Yes |

Decision record: [ADR 0007](../architecture/adrs/0007-free-plus-pro-allocation-translation-and-modes.md). "Candidate" rows are assigned to Plus or Pro when their issue is scheduled.

## Entitlement and lifecycle invariants

- A premium element may be created or edited only when required add-on and authorized feature are active; enforce server-side.
- Rendering contracts must not depend on a temporary license API response for each public request. Premium output follows the fallback classes (static / retained / unavailable) in ADR 0009 §3.
- Pro is a superset tier and declares Plus as a dependency (ADR 0009).
- Define and document continuation semantics after expiry, deactivation or downgrade; never erase JSON or silently replace premium elements.
- Free core includes all shared rendering primitives needed to avoid a white screen when premium editor controls are absent, subject to an approved portability ADR.
- Avoid artificial limitations in code hosted on WordPress.org. Read the latest directory guidelines before submission.
- Marketing tiers, billing platform, agency tiers and license pricing are separate business decisions, not baked into document schemas.

## Proposed implementation

`FeatureRegistry` declared in TS + PHP capability map; server returns effective feature set for editor hints but authoritative checks live on REST handlers/render registration. Add-ons register optional elements/control bundles through versioned hooks. Tests cover downgrade, expired license, missing add-on and site restoration.
