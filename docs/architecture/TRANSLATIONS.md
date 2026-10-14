# Translations in the document (BWB-104)

Implements the translation edit path of ADR 0003 and ADR 0004 for `@blixis/wp-core` and `@blixis/wp-element-registry`. The editor interface language and the website translation language are separate settings: nothing here depends on the interface locale.

## Where translations live

`translations` maps `locale -> element id -> entry` and includes the default locale (ADR 0003). An entry is `{ status, values, sourceHash? }`; `values` holds only properties the registry classifies as **translatable** (text a visitor reads) or **locale-specific** (links, media ids that differ per language). Invariant properties stay in the element's `props`. Entries are keyed by element id and property id, never by text, so moving, restyling or retyping the surrounding layout never loses a translation.

Statuses: `missing`, `draft`, `translated`, `reviewed`, `stale`, `orphaned`. `orphaned` is set only when an element is removed (values are kept and restored by undo, ADR 0004); `stale` is set by source-change detection (below). Authors set `draft`, `translated` and `reviewed`.

## Editing: `set-translation`

```json
{ "type": "set-translation", "locale": "nl_NL", "elementId": "el-001", "set": { "text": "Hallo" }, "status": "translated" }
```

- The locale must be one of the document's `locales` (`locale-not-found`), the element must exist (`element-not-found`) and its entry must not be orphaned.
- `set` merges values, `unset` removes them; a property cannot be in both. Property ids such as `toString` are ordinary data.
- Without `status`, the entry becomes `translated` in the default locale and `draft` in any other locale: changing a value always leaves review. Unknown fields on the entry and `sourceHash` are preserved exactly.
- An edit that changes no value (an empty `set`, the same values, removing a value that is not there) leaves the entry untouched, so a reviewed translation stays reviewed; only an explicit `status` changes the status without changing values.
- `unset` removes values that are there, including legacy values the registry would no longer accept (a repair). With a registry hook, an id that is not there must at least be a localized property of the type (`not-translatable` otherwise), so an editor bug does not pass silently.
- The result is checked against the document limits (size, depth) like every command. The inverse `restore-translation` puts back the complete previous entry or removes it; when the edit created the locale's stream, the inverse (`dropStream`) removes the stream again, so undo is exact.
- `restore-translation` is not a back door: with a registry hook, every value in the restored entry that differs from the current entry is checked like a `set-translation` value (values that are unchanged are not asked again, so undo keeps working after the rules became stricter; undo that would re-add a value the registry now refuses fails and leaves the history untouched).

## The registry decides what may be translated

`registry.translationValue(type, property, value)` is passed to the commands as `ctx.translationValue` and is also what `checkAgainstRegistry` applies to stored translations, so the two use one rule (the commands only apply it when the host supplies the hook; without it any property id is accepted). A property is accepted when the element type is registered, the property is translatable or locale-specific, and its value passes the property definition (string length, enum, `isSafeUrl` for links, and so on). Invariant, unknown and prototype-named properties and unknown types (an add-on that was removed) are `not-translatable`; a value the definition refuses is `invalid-translation`. `registry.localizedProperties(type)` lists the localized properties of a type for the translation inspector.

## Stable property ids

Stored translations are keyed by property id, so ids never change meaning or classification (docs/architecture/VERSIONING-AND-COMPATIBILITY.md). `packages/element-registry/locks/property-ids.json` records every core property with its classification and kind; tests fail if a released id is removed or changed, and if a new core property is not added to the lock. Editing an existing lock entry is itself a breaking change and needs an ADR note and migration fixtures in review (a lock edit alongside a changed definition is exactly what the file exists to make visible). `comparePropertyIds(lock, definitions)` is exported so add-on authors can keep a lock of their own and test against it.

## Stale translations (BWB-105)

FR-053: editing the source text flags the translations made from it, and never replaces their words.

**The marker.** A non-default entry carries `sourceHash`, the digest of the default-locale source text it was made from. Definition (the PHP twin must reproduce it exactly):

1. Take the default-locale entry's `values` and keep only the **source properties** of the element's type: the translatable ones (`registry.sourceProperties(type)`, passed as `ctx.sourceProperties`). Locale-specific values such as links are meant to differ per language, so they never count. Without the hook every value counts. A source property without a value is left out; an empty value is not the same as no value.
2. Serialize the result as canonical JSON (docs/engineering/FIXTURES.md): object keys sorted by UTF-8 byte order at every depth, no whitespace, strings escaped as JSON requires (`"` `\\` and the short forms `\b \f \n \r \t`, other controls below U+0020 as lower-case `\u00xx`) with `/`, U+007F, U+0085, U+2028 and U+2029 and all other characters written as they are, integers only, NFC text.
3. The marker is the first 16 hex characters (lower case) of the SHA-256 of the UTF-8 bytes of that text.

`packages/core/corpus/source-digest.json` holds 17 cases (including integer-like and accented keys, line separators, control characters, empty containers and non-string values), computed independently with Python `hashlib`; it is the contract for the PHP twin (suite `source-digest-corpus`, delivered with BWB-112).

**Unknown types.** When the registry does not know the element's type (its add-on is gone) `sourceProperties` answers `undefined`: the source text cannot be identified, so no marker is written and nothing is judged stale for that element. A known type with no translatable properties is different: its source is the empty set.

**Changing a type's translatable properties.** Property ids are permanent (above), so a release may add translatable properties but never remove or reclassify one. An added property only changes the marker of elements that have a value for it, and the next `mark-stale` or source edit then flags their translations, which is correct: there is new source text to translate.

**Setting it.** A non-default `set-translation` records the marker of the source as it is now, but only when the translator has seen that source: the entry is new, the edit changes a translatable value, or the status is explicitly `translated` or `reviewed` (that is how a stale entry is confirmed). Editing only a link, or choosing `draft`, keeps the old marker; an entry whose marker is not the current one cannot be `draft`, `translated` or `reviewed`, so it becomes (or stays) `stale`. An element with no default-locale entry gets no marker.

**Flagging.** `set-translation` in the default locale compares the digest before and after. When it changed, every draft, translated or reviewed entry of that element in the other locales whose marker is missing or different becomes `stale`, in the same command, so a single undo reverts the source edit and the flags together (`restore-translation` carries the previous statuses). `missing`, `stale` and `orphaned` entries and entries already made from the new text are left alone. An edit that does not change the digest (a link, an identical value) flags nothing. A default entry that first appears after translations exist is a new source: translations made without one are flagged, which is the conservative reading of "potentially stale".

**Catching up.** `mark-stale` (optionally for one non-default locale) applies the same rule to the whole document, for changes that did not go through `set-translation` (imports, migrations, bulk edits). An entry without a marker counts as potentially stale. It is idempotent, a no-op when nothing is stale, linear in the number of entries, and its inverse `restore-statuses` puts the previous statuses back exactly.

**Internal commands.** `restore-translation` and `restore-statuses` can create states no ordinary command can reach (a reviewed entry with an old marker), so they are only accepted as the very inverse object that a previous result returned (what the history stores), never from a deserialized command. A copy of an inverse, a REST body or a macro is refused with `invalid-argument`.

**Not decided here.** What the renderer shows for a stale entry (its own text or the default-locale fallback) and which stale entries may be published (ADR 0004: only with confirmation) belong to BWB-112 and BWB-121; the snapshot-level `sourceContentRevision` is part of locale publishing (BWB-112).

## Not here yet

Locale management (adding and removing locales), the per-field translation inspector (BWB-114), locale-aware saving and revisioning (BWB-112), rich text with its own stable node ids, and bulk import and export (BWB-122).
