# Versioning and compatibility contracts (BWB-028)

Everything that is stored, shared between TypeScript and PHP, or exposed to add-ons carries a version. This document says which versions exist, what counts as a compatible or a breaking change for each, what a developer must do to change them, and how the element SDK evolves. It collects rules that were spread over ADR 0003, 0004, 0005, 0009, `DOCUMENT-SCHEMA.md` and `EXTENSION-API.md`; where those state a rule, they win.

## Version inventory

The numbers in the last column are checked against the code by `tests/fixtures/src/versions.test.ts`, so this table cannot drift.

| Artifact | Constant (package) | Current | Bumped when |
|---|---|---|---|
| Builder document (`schemaVersion`) | `CURRENT_SCHEMA_VERSION` (core) | 1 | a breaking document change, with a migration |
| Design token set (`schemaVersion`) | `CURRENT_TOKEN_SCHEMA_VERSION` (design-tokens) | 1 | a breaking token-set change, with a migration |
| Extension API | `EXTENSION_API_VERSION` (element-registry) | 1 | the public surface changes (see below) |
| CSS compiler output | `COMPILER_VERSION` (style-engine) | 1 | the same inputs would produce different CSS |

Other versions: an element definition's own `version` (below), `fixtureVersion` and `contractVersion` (test data formats, `docs/engineering/FIXTURES.md`), the JSON Schema `$id` URNs (`urn:blixis:wp-blocks:document:1`, `urn:blixis:wp-blocks:token-set:1`, which end in the schema version), `tokenVersion` (a cache counter, not a format version), the plugin and add-on SemVer releases, and the REST API version (BWB-041).

## Stored data: documents and token sets

Rules (from `DOCUMENT-SCHEMA.md`, applied to token sets too):

- **Compatible, no bump:** adding an optional field. Unknown fields are preserved unchanged and ignored by consumers; reserved keys are never allowed.
- **Breaking, bump and migrate:** removing or renaming a field, changing what a value means, tightening a pattern or a limit, making an optional field required. A bump comes with an append-only, pure migration `vN -> vN+1`, golden fixtures for the last two versions and a no-data-loss test.
- A newer version than the running code understands fails safely (`unsupported-schema-version`) and the stored data is never rewritten. How the public renderer behaves in that case is decided with the renderer (BWB-043); editing is refused.
- Loosening is compatible for new writers but breaks old readers: relaxing a limit or a pattern (a longer id, more nodes) means documents written by the new version are rejected by the old one. Treat it as breaking for compatibility with downgrades unless an ADR says otherwise.

### Changing a schema: checklist

1. Decide compatible or breaking with the rules above. A breaking change needs an ADR note if it changes meaning.
2. Change the Zod schema, then regenerate the JSON Schema (`pnpm --filter @blixis/wp-core schema:generate`, `pnpm --filter @blixis/wp-design-tokens schema:generate`); tests fail while the committed file is stale.
3. Breaking: bump the constant, add the migration and its fixtures, and keep the old fixtures as immutable inputs.
4. Add fixtures: valid and invalid shapes (a schema-invalid document fixture states `expected.path`), registered in `tests/fixtures/contracts.json`.
5. Update the PHP side or, while it is pending, the roadmap issue named in the registry; a delivered PHP side promotes the suite's `php.level`.
6. Update `DOCUMENT-SCHEMA.md` / `DESIGN-TOKENS.md` and the inventory table above.

## Derived data and caches

- **Compiler output.** `COMPILER_VERSION` is the first line of every stylesheet (`/*blx-css:N*/`). Changing output for the same inputs requires bumping it, regenerating the goldens (`UPDATE_GOLDEN=1`, reviewed) and, per ADR 0004, it belongs in render cache keys together with `(post, locale, layoutRev, localeRev, publishedDefaultLocaleRev, tokenVersion)`. A new compiler version therefore invalidates every cached stylesheet.
- **CSS allow-list.** Adding a property, function, unit or grammar is compatible (more values become valid). Removing or tightening one makes stored declarations invalid: the compiler drops them (and reports them) instead of failing, but the author silently loses styling, so treat it as breaking: announce it, give a deprecation window (below) and add a migration when the value can be mapped.
- **Manifests** (`core-elements.json`, `css-properties.json`) are generated from code and tested for staleness; the PHP side reads them, so a manifest change is a contract change and updates the contract suites.
- **Tokens** are live site settings: changing a value is not a version event, but changing the token schema is.

## Extension API and the element SDK

The extension API is the registration contract for Plus, Pro and third-party add-ons (ADR 0009; details in `EXTENSION-API.md`). Add-ons depend on it only.

### API version

- `EXTENSION_API_VERSION` is an integer. It is increased whenever the public surface changes in a way an add-on can rely on or be broken by: a new definition field, hook or property kind (an add-on may require it) as well as any removal, rename or tightening. Purely internal changes do not bump it.
- A definition declares `requiresApi`, the minimum version it needs. The host refuses a definition that needs a newer version than it has (implemented). An add-on should declare the lowest version that provides what it uses, not the newest.
- **Support window and deprecation.** A feature is deprecated by documenting it as `deprecated since N, removed in M` with `M >= N + 2`, and by a registration warning where the code can detect use. A deprecated feature keeps working for at least two further API versions and two plugin minor releases. An add-on declaring `requiresApi = k` is supported on hosts up to API `k + 2`; beyond that the host may refuse it with an actionable notice. The enforcement and the release process are part of BWB-075; until then this window is the policy reviewers apply.
- The compatibility matrix (API version, minimum Builder version, deprecated and removed features) is kept in the Builder changelog and in this document once a second version exists.

### Element definitions

- `type` is permanent. A renamed element is a new type plus a documented replacement; the old type keeps working until removed through the deprecation window. Namespaces and tiers follow `EXTENSION-API.md` (core `blixis/`, Plus `blixis-plus/`, Pro `blixis-pro/`, others anything not starting with `blixis`).
- `version` (integer, starts at 1) is the definition's own version. Raise it when the definition changes in a way that matters to stored content. The document does not store it, so a definition must always read content written by any earlier version of itself.
- **Compatible changes:** a new optional property (with a default), a new default, widening `allowedChildren`/`allowedParents`, a wider property range, better labels.
- **Breaking changes:** removing or renaming a property, changing a property's kind or classification (invariant, translatable, locale-specific: translations are stored by property id and would be lost), narrowing a range below stored values, adding a required property without a default. Core elements get a document migration. Add-on authors have no migration hook, so for add-ons a breaking change must be written as a new property id (read the old one as a fallback) or a new element type.
- **Tightening nesting is safe for stored content:** existing documents keep their content (documents are never rewritten), `canNest` with `relocate` lets authors rearrange it, and only new insertions are checked. Unknown element types (an add-on that was removed) are preserved and rendered with the fallback class the definition declared (ADR 0009).
- Paid elements declare a `fallback` class (`static`, `retained`, `unavailable`) and keep it stable: changing it changes what visitors see when the add-on is inactive.

### Writing an element: steps

1. Choose `type` in your namespace and a `category`; declare `requiresApi` as low as possible.
2. Define every property with a kind, a classification and a default; strings that visitors read are `translatable`, links and ids that differ per language are `locale-specific`, everything else is `invariant`.
3. State `allowedParents` and `allowedChildren`.
4. Register through the handle the host gives you (`registry.registrarFor(source)`); `register` never throws and returns every problem.
5. Provide the PHP renderer that the manifest describes (BWB-043) and escape every output; test with the shared fixtures.
6. When you change the definition later, apply the rules above and raise `version`.

## What protects these rules

Schema and manifest staleness tests, the contract registry and its orphan check, golden stylesheets, the inventory test above, migration fixtures once migrations exist, and review of any change to the files listed in `tests/fixtures/contracts.json`. The PR template asks whether shared data is registered and whether a PHP suite level changed.
