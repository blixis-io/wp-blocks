# Versioning and compatibility contracts (BWB-028)

Everything that is stored, shared between TypeScript and PHP, or exposed to add-ons carries a version. This document says which versions exist, what counts as a compatible or a breaking change for each, what a developer must do to change them, and how the element SDK evolves. It collects rules that were spread over ADR 0003, 0004, 0005, 0009, `DOCUMENT-SCHEMA.md` and `EXTENSION-API.md`. Where an ADR states a rule, the ADR wins, except for the two places listed under "Amendments to accepted ADRs".

## The promise, in two directions

- **Upgrade (old data, new software) always works.** Anything written by an earlier release loads, edits and renders after an update, through migrations where the format changed. This is the compatibility this document protects.
- **Downgrade (new data, old software) is only supported for additive, optional changes.** Older software preserves unknown optional fields unchanged. Any change that makes the format more permissive, or that older software cannot interpret, is **not downgrade-safe**. It is called "compatible" below when it is upgrade-safe and additive, and "breaking" when old data stops working or its meaning changes; "loosening" is named explicitly where it matters.
- A newer `schemaVersion` than the software understands is refused safely (`unsupported-schema-version`) and the stored data is never rewritten.

## Version inventory

`tests/fixtures/src/versions.test.ts` checks that the four constants in this table equal the values in the code. It does not check the other versions below the table or the "bumped when" column.

| Artifact | Constant (package) | Current | Bumped when |
|---|---|---|---|
| Builder document (`schemaVersion`) | `CURRENT_SCHEMA_VERSION` (core) | 1 | a breaking document change, with a migration |
| Design token set (`schemaVersion`) | `CURRENT_TOKEN_SCHEMA_VERSION` (design-tokens) | 1 | a breaking token-set change, with a migration |
| Extension API | `EXTENSION_API_VERSION` (element-registry) | 1 | the public surface changes (see below) |
| CSS compiler output | `COMPILER_VERSION` (style-engine) | 1 | the same inputs would produce different CSS |

Other versions: an element definition's own `version` (below), `fixtureVersion` and `contractVersion` (test data formats, `docs/engineering/FIXTURES.md`), the JSON Schema `$id` URNs (`urn:blixis:wp-blocks:document:1`, `urn:blixis:wp-blocks:token-set:1`, which end in the schema version and change with it), `tokenVersion` (a cache counter, not a format version), `classListVersion` (global class list, ADR 0004), the plugin and add-on SemVer releases, and the REST namespace `blixis/v1` (BWB-041).

## Stored data: documents and token sets

Both follow the same rules (the document-specific text is in `DOCUMENT-SCHEMA.md`, the token-specific text in `DESIGN-TOKENS.md`):

- **Compatible, no bump:** adding an optional field. Unknown fields are preserved unchanged and ignored by consumers; reserved keys are never allowed. For token sets this concerns the *shape*; changing token *values* is a live settings change (ADR 0004), never a version event.
- **Breaking, bump and migrate:** removing or renaming a field, changing what a value means, tightening a pattern or a limit, making an optional field required, changing the shape of a token set. A bump comes with an append-only, pure migration `vN -> vN+1`, golden fixtures for the last two versions and a no-data-loss test.
- **Loosening** (a longer id, more nodes, a wider enum) is upgrade-safe but not downgrade-safe: documents written by the new version are rejected by the old one. Treat it as breaking for downgrade unless an ADR says otherwise, and say so in the changelog.
- How the public renderer behaves for a document it cannot read is decided with the renderer (BWB-043); editing is refused.

### Changing a schema: checklist

Always:

1. Decide compatible or breaking with the rules above; a change in meaning needs an ADR note.
2. Change the Zod schema and regenerate the JSON Schema (`pnpm --filter @blixis/wp-core schema:generate`, `pnpm --filter @blixis/wp-design-tokens schema:generate`); tests fail while the committed file is stale. Check that the `$id` URN still matches the version.
3. Add fixtures: valid and invalid shapes (a schema-invalid document fixture states `expected.path`), registered in `tests/fixtures/contracts.json`.
4. Update `DOCUMENT-SCHEMA.md` or `DESIGN-TOKENS.md` and the inventory table above.

When the change is breaking:

5. Bump the constant, add the migration (append-only, pure, output re-validated), keep old fixtures as immutable inputs for the last two versions, and test that unknown fields survive.
6. Check what else holds data of the old format: published layout snapshots (global classes are copied by value into them, ADR 0003), translation streams (entries are keyed by element and property id), stored token sets, caches.

Where it applies:

7. The TS and PHP validators and their issue codes stay in agreement (the contract suites in `tests/fixtures/contracts.json`; promote a suite's `php.level` when its PHP side lands).
8. REST read and write paths and the renderer: additive fields are fine inside `blixis/v1`; a breaking change needs a new REST namespace version.
9. Downgrade behaviour: what an older plugin does with the new data, written down in the changelog.

## Derived data and caches

- **Compiler output.** `COMPILER_VERSION` is the first line of every stylesheet (`/*blx-css:N*/`). Changing the output for the same inputs requires bumping it and regenerating the goldens (`UPDATE_GOLDEN=1`, reviewed). Render cache keys include it (see the amendments below). An output-only compiler change does **not** change stored documents, so it needs no document migration.
- **CSS allow-list.** Adding a property, function, unit or grammar is compatible. Removing or tightening one makes stored declarations invalid: the compiler drops them (and reports them) instead of failing, but authors silently lose styling, so treat it as breaking: announce it, give a deprecation window (below) and add a migration when the value can be mapped.
- **Manifests.** `core-elements.json` is read by the PHP registry and renderers (BWB-043) and the REST `GET /elements` (BWB-041); `css-properties.json` is the allow-list the PHP CSS validator is built from (BWB-048). Both are generated from code and tested for staleness, and both are `pending` PHP suites in the contract registry. A manifest change is a contract change.
- **Tokens** are live site settings, and so is the breakpoint registry (it changes the emitted media queries): changing either bumps `tokenVersion` for cache invalidation. Changing the token *schema* is a version event; changing a token *name* is breaking for themes and add-ons that reference `--blx-<name>`.

## Other surfaces

- **Translations.** Streams are stored per locale and keyed by element id and property id, so a property id is permanent (below). The editor interface language and the website translation language remain separate settings; versioning rules never merge them.
- **Global classes.** The class list has its own counter (`classListVersion`, `classRefs`) and classes are copied by value into published snapshots; a change to the class schema is a document-level change and follows the checklist.
- **REST API.** `blixis/v1` accepts additive changes only; a breaking change is `blixis/v2` with an overlap period set when the first one is needed.
- **Theme.** `theme.json` and token mapping are part of the theme's compatibility declaration (ADR 0002); the token names above are the contract between plugin and themes.

## Extension API and the element SDK

The extension API is the registration contract for Plus, Pro and third-party add-ons (ADR 0009; details in `EXTENSION-API.md`). Add-ons depend on it only.

### API version

- `EXTENSION_API_VERSION` is an integer. It increases whenever the public surface changes in a way an add-on can rely on or be broken by: a new definition field, hook or property kind (an add-on may require it) as well as any removal, rename or tightening. Purely internal changes do not bump it.
- A definition declares `requiresApi`, the minimum version it needs; declare the lowest version that provides what you use. The host refuses a definition that needs a newer version than it has (implemented in `registry.ts`).
- **Compatibility is by use, not by distance.** A higher host version never refuses an add-on merely because the number grew. Registration is refused only when the add-on needs a newer API than the host has, or when it uses a feature that has been removed (the error names the feature).
- **Deprecation.** A feature deprecated in API version N is documented as `deprecated since N, removable in N+3`: it keeps working through N+2, and for at least two plugin minor releases counted from the release that first shipped the deprecation notice. Use of a deprecated feature produces a registration warning that names it. The warning, the removal check and the compatibility matrix are delivered with the release process (BWB-075); until then reviewers apply this window and the registry only enforces the upper bound.
- The compatibility matrix (API version, minimum Builder version, deprecated and removed features) lives in the Builder changelog once a second API version exists.

### Element definitions

- `type` is permanent. A renamed or replaced element is a new type plus a documented replacement; the old type goes through the deprecation window. Namespaces and tiers follow `EXTENSION-API.md`.
- **Property ids are immutable.** A property's meaning, kind and classification (invariant, translatable, locale-specific) never change, because stored content and translation streams are keyed by property id and the document does not store the definition's version. A changed meaning is a new property id (keep reading the old one) or a new element type.
- `version` (integer, starts at 1) is the definition's own version, raised when the definition changes in a way that matters to stored content. A definition must keep reading content written by every earlier version of itself; test old published content and translations after changing an add-on.
- **Upgrade-safe changes:** a new optional property with a default, better labels, widening `allowedParents`/`allowedChildren`, a wider range, new enum values (these last three are not downgrade-safe for content written with them).
- **Breaking changes:** removing or renaming a property, changing a property's kind or classification, removing an enum value, narrowing a range below stored values, adding a required property without a default, changing `category` (nesting rules use categories), changing `tier` (registration source and fallback rules) or the declared `fallback` class (what visitors see when the add-on is inactive).
- **Narrowing `allowedParents`/`allowedChildren` is breaking.** The registry does not grandfather existing content: `checkAgainstRegistry` reports content that no longer nests legally as an error (only unknown *types* are warnings), and `canNest(..., 'relocate')` only relaxes placement for unknown children. Until validation has an explicit legacy-content rule, with fixtures for load, edit, publish and render, treat narrowing as a breaking change.
- **Changing a default** changes how old content renders whenever its property is absent; treat it as breaking unless old content always stores the property.
- **Inactive add-ons.** Today the registry preserves an unknown element type unchanged and only warns about it. Rendering it with the fallback class its definition declared needs that class (and, for `retained`, the published output) to be persisted outside the definition, because the definition is absent. Where and how is specified and implemented with the renderer (BWB-043, ADR 0009 section 3); this document does not promise the behaviour before then.

### Writing an element: steps

1. Choose `type` in your namespace and a `category`; declare `requiresApi` as low as possible.
2. Define every property with a kind, a classification and a default; strings that visitors read are `translatable`, links and ids that differ per language are `locale-specific`, everything else is `invariant`.
3. State `allowedParents` and `allowedChildren`.
4. Register through the handle the host gives you (`registry.registrarFor(source)`); `register` never throws and returns every problem.
5. Server-side rendering is an integration contract that BWB-043 specifies (the JSON manifest describes definitions, not renderer code); until then an add-on's PHP renderer is not available. Escape every output and test with the shared fixtures when it is.
6. When you change the definition later, apply the rules above and raise `version`.

## Amendments to accepted ADRs

1. **ADR 0004 (cache key).** Render cache keys additionally include the compiler version (`COMPILER_VERSION`). Tokens and the breakpoint registry stay covered by `tokenVersion`.
2. **ADR 0005 (Rollback).** "Compiler changes that alter output bump `schemaVersion`" is replaced: an output-only compiler change bumps `COMPILER_VERSION` and regenerates the goldens, and does not touch stored documents. `schemaVersion` changes only when the stored format changes.

Both are recorded in the review logs of the two ADRs.

## What protects these rules

Schema and manifest staleness tests, the contract registry and its orphan check, golden stylesheets, the inventory test above, migration fixtures once migrations exist, and review of any change to the files listed in `tests/fixtures/contracts.json`. The PR template asks whether shared data is registered and whether a PHP suite level changed.
