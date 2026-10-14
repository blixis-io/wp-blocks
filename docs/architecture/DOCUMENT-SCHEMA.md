# Document schema (v1)

Implements [ADR 0003](adrs/0003-document-model-and-persistence.md) for BWB-019. The source of truth is the Zod schema in `packages/core/src/schema/`; `packages/core/schema/document.schema.json` (JSON Schema 2020-12, `$id` `urn:blixis:wp-blocks:document:1`) is generated from it and committed. A test fails if the committed file is stale; regenerate with `pnpm --filter @blixis/wp-core schema:generate`. The PHP plugin validates against the same JSON Schema (BWB-027).

## Shape

| Field | Rule |
|---|---|
| `schemaVersion` | The integer `1` (current). Older versions are migrated on load (BWB-020). |
| `documentId` | Id (below), stable for the life of the document. |
| `layoutRevision` | Integer >= 0; the working layout revision (ADR 0004). |
| `defaultLocale`, `locales` | WordPress locale ids; 1 to 64 locales. `defaultLocale` must be listed (checked by `validateDocument`). |
| `root` | Ordered top-level elements. A virtual page root is added when rendering. |
| `classListVersion`, `classRefs` | Site-wide class list version last synced, and the class versions this layout references (ADR 0004). Global class definitions are not stored in the document. |
| `translations` | `locale -> element id -> { status, values, sourceHash? }`. Includes the default locale; only translatable properties appear. |
| `metadata` | `updatedAt` (UTC `YYYY-MM-DDTHH:MM:SSZ`) and `editorVersion`. |

Element: `id`, `type`, `props` (invariant values only), `children`, optional `classIds` (at most 64; order is presentational) and `style` (at most 256 rules). Style rule: optional `breakpoint`, `mode` (`light`/`dark`), `state` (`hover`/`focus`/`focus-visible`/`active`) and `declarations` (name -> string or integer). Which of the three selectors are present decides the layer (ADR 0005).

## Formats

- **Id** (documents, elements, classes): `^[a-z0-9][a-z0-9_-]{2,63}$`. Opaque and immutable; never derived from content.
- **Element type**: `vendor/name`, lowercase, `^[a-z][a-z0-9-]{1,31}/[a-z][a-z0-9-]{1,63}$`. `blixis/*` is reserved for core elements.
- **Locale**: `^[a-z]{2,3}(?:_[A-Z]{2})?(?:_[a-z0-9]{3,12})?$` (`en_US`, `nl_NL`, `de_DE_formal`).
- **Property id**: `^[a-z][a-zA-Z0-9]{0,63}$`. **Breakpoint id**: `^(?!base$)[a-z][a-z0-9-]{0,31}$` (`base` is implicit, never written).
- **Declaration name**: a CSS property (`^[a-z][a-z0-9-]{0,63}$`) or a `--blx-*` custom property.
- **Values** follow the fixture rules (`docs/engineering/FIXTURES.md`): `null`, booleans, safe integers, strings, arrays, objects. **No decimal numbers**: store `1.5` as the string `"1.5"`, so TypeScript and PHP serialise identically.

## Reserved keys

`__proto__`, `constructor` and `prototype` are forbidden as object keys **anywhere** in a document, including unknown fields: they are prototype-pollution hazards in JavaScript, and some parsers silently drop an own `__proto__` key, which would break the lossless round trip. The JSON Schema enforces this through `propertyNames`/key patterns on every object it describes; in TypeScript use `safeParseDocument` (not `BuilderDocumentSchema.safeParse` directly), which rejects them up front with their paths. The PHP validator must do the same (BWB-027).

## Limits are a required gate at every entry point

Shape validation alone does not make input safe. `DOCUMENT_LIMITS` (exported by `@blixis/wp-core`): 2 MiB serialised size, 128 levels of JSON nesting, element tree depth 32, 5 000 elements, 64 declarations per style rule (the last is also in the JSON Schema as `maxProperties`). Every entry point (editor load, REST save and preview, the PHP renderer) MUST check the byte limit **before** decoding and the nesting/node limits before trusting the structure; `validateDocument` (BWB-020) applies all of them and is the only supported way to accept a document. Unknown fields are allowed but count toward the byte limit.

## What the schema does not check

JSON Schema cannot express these; `validateDocument` (BWB-020, implemented) checks them and returns structured errors:

- unique element ids across the whole tree, and legal parents/children per the element registry (BWB-021); `blixis/*` types belong to core, other namespaces to registered vendors; breakpoints and state names must be registered
- tree depth (limit 32), total node count (5 000), serialised size (2 MB) and declarations per rule (64)
- `locales` has no duplicates and contains `defaultLocale`; the default locale has a translation stream; every translation locale is in `locales`; every translated element id exists (otherwise `orphaned`)
- every `classRefs` and `classIds` entry refers to a known global class, and the two agree
- `metadata.updatedAt` is a real calendar timestamp (the pattern accepts `2026-02-31T00:00:00Z`)
- NFC-normalised, well-formed Unicode in strings and keys
- duplicate style rules (same breakpoint/mode/state combination on one element)
- the value allow-list for declarations (BWB-023) and registered property ids per element type

## Validation API (BWB-020)

`validateDocument(input, options?)` in `@blixis/wp-core` is the only supported way to accept a document. It takes the stored or received **text** (preferred: the byte limit is checked before decoding and the strict scanner rejects what decoding would hide) or an already-parsed value (the caller must then have enforced the byte limit). The pipeline, in order: byte limit -> strict JSON text (no decimal/exponent tokens, `-0`, duplicate keys, lone surrogates) -> **one inert snapshot** of the parsed value -> value rules (safe integers, NFC) -> reserved keys -> schema version and migration -> shape (Zod) -> semantic checks. The snapshot (`snapshotInput`) copies the value exactly once, iteratively, while enforcing the JSON depth limit, a value-count cap (500 000) and an estimate of the serialised size (so parsed objects get the same 2 MiB limit as text); it refuses accessors, Proxies that throw, sparse arrays, class instances, symbols, functions, bigint and non-safe-integer numbers. Every later gate and the returned document come from the snapshot, never from the caller's object, so a getter cannot show the checks one value and the consumer another, and the caller's object is neither read again nor modified. It returns `{ ok: true, document, warnings, fromVersion, migrated }` or `{ ok: false, errors }`; every issue has a stable `code` (`ISSUE_CODES`), a JSON `path` and a message, and at most 50 are reported (collection stops at 50).

Issue codes: `too-large`, `invalid-json`, `too-deep`, `too-many-values`, `invalid-value`, `reserved-key`, `unsupported-schema-version`, `migration-failed`, `schema`, `duplicate-element-id`, `tree-too-deep`, `too-many-nodes`, `duplicate-locale`, `default-locale-not-listed`, `missing-default-locale-stream`, `translation-locale-not-listed`, `translation-for-missing-element`, `orphaned-entry-for-existing-element` (warning), `unknown-class-reference`, `duplicate-style-rule`, `invalid-timestamp`. Codes are never renamed.

`serializeDocument(document)` gives the deterministic text form (canonical JSON) used for storage, revision hashes and equality; `validateDocument(serializeDocument(d))` returns an equal document.

Migrations (`migrateDocument`, registry `MIGRATIONS`, empty while version 1 is the only version) are pure, append-only steps `vN -> vN+1` applied to a private copy. The registry may not contain two steps for one version, and **every step's output is treated as untrusted**: it passes the snapshot, value-rule and reserved-key gates again before the next step or the shape check. A newer schema version fails with `unsupported-schema-version` and the input is left untouched; gaps in the chain, steps that throw and steps that do not set the new `schemaVersion` fail with `migration-failed`. Each real migration ships with golden fixtures for the last two versions and a no-data-loss test (unknown fields must survive).

Not covered yet: element registry checks (legal parents/children, registered properties and types: BWB-021) and the CSS value allow-list (BWB-023). The PHP twin of this pipeline is part of the parity work (BWB-027).

## Versioning rules

- **Compatible (no version bump):** adding an optional field. Unknown fields on the document, elements, style rules, translation entries and metadata are allowed and must round-trip unchanged; consumers ignore what they do not know. (Reserved keys are never allowed.)
- **Breaking (bump `schemaVersion`, add an append-only migration and golden fixtures):** removing or renaming a field, changing the meaning of a value, tightening a pattern or limit, or making an optional field required.
- Loading a document with a newer `schemaVersion` than the running code understands fails safely without rewriting it (no silent loss, ADR 0003).
- Migrations run only on load, are pure functions `vN -> vN+1`, and are covered by immutable fixtures for the last two versions (N-2).
