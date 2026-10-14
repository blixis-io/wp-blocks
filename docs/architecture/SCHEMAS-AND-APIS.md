# Data Contracts, API and Extension Interfaces (Initial Proposal)

All samples are illustrative contracts to validate through spikes and ADRs; they are **not implemented endpoints**.

## Document

> **Superseded sketch.** The canonical document model is [ADR 0003](adrs/0003-document-model-and-persistence.md); publication in [ADR 0004](adrs/0004-publication-model-and-revisions.md); styles in [ADR 0005](adrs/0005-style-resolution-and-css-output.md). The types below are kept only as history.

```ts
type BuilderDocument = {
  schemaVersion: number;
  documentId: string;
  revision: number;
  root: ElementNode[];
  styles: GlobalStyleRule[];
  metadata: { updatedAt: string; editorVersion: string };
};
type ElementNode = {
  id: string;
  type: string;
  props: Record<string, unknown>;
  styles: Record<string, Record<string, string | number>>; // breakpoint to declarations
  children: ElementNode[];
};
```

- Define JSON Schema or Zod schema as canonical TS contract; generate committed PHP-compatible validation fixtures or mirrored JSON Schema checks.
- Stable id constraints, legal parents/children, tree depth and payload size caps. Reject duplicate IDs and cycles.
- Persist schemaVersion; immutable migration fixtures for N-2 and current document versions; no silent loss for unknown elements.
- Canonical property names and normalization rules; unsafe CSS declarations are rejected server-side.

## Proposed REST API (`blixis/v1`)

This table remains a superseded sketch. The implemented BWB-041 layout and locale-content routes, including headers and error codes, are specified in [Document REST API](WORDPRESS.md#document-rest-api).

| Method/path | Purpose | Access |
|---|---|---|
| `GET /status` | compatible theme, feature flags, editor config | `edit_posts` equivalent, nonce |
| `GET, PUT /documents/{post_id}/layout` | **Implemented BWB-041** working layout stream; [contract](WORDPRESS.md#document-rest-api) | `edit_post(post_id)`; cookie nonce on PUT |
| `GET, PUT /documents/{post_id}/content/{locale}` | **Implemented BWB-041** locale stream; [contract](WORDPRESS.md#document-rest-api) | `edit_post(post_id)`; cookie nonce on PUT |
| `POST /documents/{postId}/preview` | sanitized preview markup and CSS | `edit_post(postId)` + nonce |
| `GET /design-system` | effective tokens, fonts and presets | authorized editors |
| `PUT /design-system` | persist global design tokens | `edit_theme_options` |
| `GET /elements` | registry manifest, no executable PHP | authorized editors |
| `GET /features` | UI entitlement hints | authorized editors |

WordPress REST cookie auth and `X-WP-Nonce`; use `permission_callback` on **every** route. Validate/sanitize before persistence, use explicit HTTP status and structured error codes (400 schema, 401 unauthenticated, 403 forbidden, 409 conflict, 422 unsupported).

## Storage

- Primary document: registered, revision-enabled post meta where supported; consider custom table only if profiling demands it. Autosaves/revisions must be tested explicitly.
- Global design tokens: versioned WordPress option or theme mod (pick by ADR), not scattered theme CSS edits.
- Preset data: immutable seed + user-customized tokens, never replace custom values on theme updates.

## PHP element registration proposal

```php
blixis_register_element( 'blixis/heading', [
    'schema' => $schema,
    'render_callback' => 'blixis_render_heading',
    'capability' => 'free',
] );
```

Define element namespace/version, props schema, default props, allowed children, PHP renderer and optional editor module. For data providers, use keyed source adapters, scope checks and query limits.

## Migration testing

Golden JSON fixtures, valid/invalid CSS fixtures, PHP output snapshots, roundtrip serialization tests, conflict tests, revision rollback tests, absent/unknown element tests and premium fallback tests are mandatory before beta.
