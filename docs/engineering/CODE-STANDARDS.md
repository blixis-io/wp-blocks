# Code Standards

## Universal

- English for code symbols, docs, issues, PRs and comments. Meaningful names; no magic strings or hidden side effects.
- Prefer small pure functions, explicit errors, isolation of IO and dependency injection at boundaries.
- Public interfaces documented; no `TODO` without linked issue; avoid dead code and disabled linters.
- Exact project-wide versions pinned and maintained; changes in dependency majors via ADR and compatibility tests.
- New external dependencies require licensing, security, bundle impact and maintenance review.

## TypeScript / React

- TypeScript strict mode; avoid `any`, unsafe casts and suppressed diagnostics without justification.
- ESLint with typescript-eslint, React hooks and accessibility rules; Prettier for formatting.
- Prefer named exports and colocated tests; public package APIs from intentional barrel exports.
- Use immutable state and command objects for document edits. Zustand slices separate document, selection, UI and history.
- Component props typed; accessible labels, keyboard focus and ARIA only when native controls insufficient.
- Prefer shadcn/ui and Radix for admin chrome; custom inspector controls are reused across elements.
- Never inject arbitrary HTML in editor; schema-validate all iframe messages and external data.

## PHP / WordPress

- PHP namespaces or collision-safe `Blixis\...` symbols, Composer PSR-4 autoloading as appropriate.
- WordPress Coding Standards through PHPCS, PHPCBF; PHPStan with WordPress stubs.
- Every REST route defines `permission_callback`, input schemas and safe error responses.
- Check `current_user_can` for operations; cookie auth nonces; sanitize on write and escape on output (`esc_html`, `esc_attr`, `esc_url`, `wp_kses` as needed).
- Use prepared queries via `$wpdb->prepare` when direct SQL is unavoidable; do not concatenate SQL input.
- Use WP hooks, filters, translation functions and capabilities instead of platform-specific hacks.
- Renderer callbacks accept validated data and return HTML without causing writes.

## JSON contracts and versioning

- Each persisted document has schemaVersion and document revision; validated migrations are append-only and fixture-tested.
- IDs and property names use documented conventions; namespaced element types like `blixis/heading`.
- Never silently discard unknown fields or premium components on load/save. Distinguish errors from no-op.

## REST standards

- Namespace with version (`blixis/v1`), normalize status/error codes, use `ETag` or revision conflicts to prevent overwrites.
- Paginate potentially large collections, rate-limit or bound preview rendering, avoid excess response data.
- API responses documented with examples and role requirements; OpenAPI spec generated/validated in later phase.

## CSS / assets

- Tailwind v4 for theme source and editor chrome; runtime builder declarations compiled to dedicated scoped CSS.
- Tokens expressed as semantic custom properties; use CSS logical properties for RTL where practical.
- Avoid `!important` except documented intentional overrides; no unrestricted user CSS in core MVP.
- Dynamic CSS escape/validate selectors, values, functions and URLs; CSS output stable for caching and snapshots.

## Definition of Done (code)

Feature is implemented behind relevant gate, has unit/integration tests, accessibility checked, documented where user-visible, passes CI, respects WP licensing/security rules, has no unreviewed breaking behavior and closes a traceable issue.
