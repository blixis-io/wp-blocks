# Translations in the document (BWB-104)

Implements the translation edit path of ADR 0003 and ADR 0004 for `@blixis/wp-core` and `@blixis/wp-element-registry`. The editor interface language and the website translation language are separate settings: nothing here depends on the interface locale.

## Where translations live

`translations` maps `locale -> element id -> entry` and includes the default locale (ADR 0003). An entry is `{ status, values, sourceHash? }`; `values` holds only properties the registry classifies as **translatable** (text a visitor reads) or **locale-specific** (links, media ids that differ per language). Invariant properties stay in the element's `props`. Entries are keyed by element id and property id, never by text, so moving, restyling or retyping the surrounding layout never loses a translation.

Statuses: `missing`, `draft`, `translated`, `reviewed`, `stale`, `orphaned`. `orphaned` is set only when an element is removed (values are kept and restored by undo, ADR 0004); `stale` is set by source-change detection (BWB-105). Authors set `draft`, `translated` and `reviewed`.

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

## Not here yet

Stale detection and source hashes (BWB-105), locale management (adding and removing locales), the per-field translation inspector (BWB-114), locale-aware saving and revisioning (BWB-112), rich text with its own stable node ids, and bulk import and export (BWB-122).
