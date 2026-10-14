## Independent review of BWB-105

**Blocker**

- [apply.ts](packages/core/src/commands/apply.ts:432): An accepted `restore-translation` command can set `entry: null, dropStream: true` on the last default-locale entry. It removes the required default-locale stream. I reproduced `applyCommand` returning success while `validateDocument` rejects the result with `missing-default-locale-stream`. **Fix:** never drop the default stream, and validate the preconditions for `dropStream`. Add a regression test through the public command parser.

**Major**

- [apply.ts](packages/core/src/commands/apply.ts:535): Any effective non-default `set-translation` refreshes `sourceHash`. Changing only a locale-specific link, or explicitly setting `draft`, can therefore clear `stale` without reviewing the changed source text. Status-only `reviewed` can reasonably serve as confirmation, but that intent needs to be explicit. **Fix:** retain the marker for unrelated field edits and draft status changes; provide an explicit confirmation path for translated/reviewed, with tests.

- [apply.ts](packages/core/src/commands/apply.ts:619): `restore-statuses` is accepted as an untrusted command and can set a stale entry directly to `reviewed` while leaving its old marker in place. `restore-translation` can likewise supply an arbitrary marker. **Fix:** restrict inverse commands to trusted history use, or validate their source/status relationship when accepted externally. Test that they cannot bypass stale confirmation.

- [registry.ts](packages/element-registry/src/registry.ts:162): An unknown type returns an empty source-property list. `mark-stale` then compares its existing marker with the hash of `{}`, potentially flagging every live translation of a temporarily unavailable add-on. Registry changes also change the meaning of a marker: adding a source property with an existing value, or removing one, flags entries on the next sweep; adding an unvalued property has no effect until it receives a value. **Fix:** distinguish “unknown type” from “known type with no source properties,” and define a registry-change migration/recheck policy.

- [apply.ts](packages/core/src/commands/apply.ts:455): `applyStatuses` copies a locale stream for every changed entry, giving `mark-stale` quadratic work within each locale. A valid 2,500-element, two-locale document took **1.14 seconds** to mark stale locally. **Fix:** validate records first, then copy each affected stream once and update its entries. The schema permits 320,000 `restore-statuses` records, though the command byte limit constrains the practical count.

**Minor**

- [source.ts](packages/core/src/translation/source.ts:14): Creating a default entry with only locale-specific values changes the marker from absent to the hash of `{}` and can flag existing targets despite no counted text changing. Decide whether this conservative flag is intended and test it.
- [TRANSLATIONS.md](docs/architecture/TRANSLATIONS.md:37): The corpus and this paragraph alone are insufficient as a complete PHP byte-level recipe. Link the strict value rules and specify recursive key ordering, empty objects, Unicode escaping, and PHP JSON flags from [FIXTURES.md](docs/engineering/FIXTURES.md:21). Add corpus cases for integer-like/Unicode keys and line separators.
- [stale.test.ts](packages/core/src/commands/stale.test.ts:274): The seeded invariant covers ordinary edits and history, but excludes direct inverse commands, missing default entries, registry changes, and remove/restore. Those omissions let the blocker and status bypass pass. Extend it with targeted cases.

**Agreements:** The digest correctly selects present source-property values, excludes locale-specific values when the hook is supplied, and distinguishes absent from empty values. Canonical JSON enforces NFC, well-formed Unicode, and safe integers; UTF-8 SHA-256 tests cover lone surrogates and padding boundaries. Several source edits and a reversion leave already-stale entries stale, which is conservative. A target marker matching the newly produced source is correctly left alone. Locale membership is checked for ordinary edits, and remove/restore preserves orphaned text. Including the addendum roadmap in the contracts check is appropriate.

**Checks:** 82 focused tests passed; core, element-registry, and style-engine typechecks passed. I reproduced the default-stream defect and measured `mark-stale` locally. The PHP source-digest runner is still marked pending under BWB-112, so I could not verify PHP parity or snapshot-level `sourceContentRevision` behavior.