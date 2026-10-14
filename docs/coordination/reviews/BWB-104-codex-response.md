## Blocker

- [apply.ts](packages/core/src/commands/apply.ts:470) accepts a caller-supplied `restore-translation` entry without `ctx.translationValue`. Because `applyCommand` and `execute` accept untrusted commands, a caller can use it to store an unsafe URL or an invariant property that `set-translation` rejects. The “internal inverse” label in [COMMANDS.md](docs/architecture/COMMANDS.md:15) does not enforce that boundary. **Fix:** keep inverse application private to history, or validate every submitted entry against the registry before exposing this command to callers. Add a test that submits a hostile restore directly.

## Major

- [apply.ts](packages/core/src/commands/apply.ts:419) leaves an empty locale stream after undoing the first entry when that locale had no stream initially. `withEntry(..., null)` deletes the element but always writes `translations[locale] = {}`. **Fix:** record whether the stream existed and remove it on inverse when it did not; test exact round-trip from an absent stream.
- [apply.ts](packages/core/src/commands/apply.ts:443) checks `set` against the hook but never checks `unset`. An absent invariant or unknown property ID is accepted and can change the entry’s status. **Fix:** define and enforce an unset rule; allow removal of an existing invalid value for repair if intended, but reject absent or nonlocalized IDs otherwise.
- [apply.ts](packages/core/src/commands/apply.ts:457) applies the default status even for an empty edit or an `unset` that removes nothing. This can downgrade `reviewed` to `draft` without changing content. **Fix:** preserve status on a value no-op; require an explicit `status` for a status-only change. Resetting review after an actual value edit is reasonable.
- [VERSIONING-AND-COMPATIBILITY.md](docs/architecture/VERSIONING-AND-COMPATIBILITY.md:73) says a new public hook raises the extension API version, while [definition.ts](packages/element-registry/src/definition.ts:6) remains at 1 after adding `translationValue` and `localizedProperties`. **Fix:** bump the version if these are public add-on capabilities, or document why they are internal.

## Minor

- [translations.test.ts](packages/core/src/commands/translations.test.ts:274) calls its seeded test a mix of edits, removals and undo, but it generates no removals and does not redo the full sequence. It also runs without the registry hook. **Fix:** include remove/restore, hook failures, absent streams and full undo/redo snapshots.
- [property-ids.json](packages/element-registry/locks/property-ids.json) is a sensible separate lock for core IDs, but the test cannot stop someone changing the lock alongside a breaking definition. It covers neither add-ons nor changes in meaning within the same kind and classification. **Fix:** require review or migration fixtures for lock edits; give add-ons a comparable compatibility test. Renamed types remain protected because the old type must stay present.
- [COMMANDS.md](docs/architecture/COMMANDS.md:44) overstates the tested exact-inverse and seeded redo guarantees. [TRANSLATIONS.md](docs/architecture/TRANSLATIONS.md:24) says the command and registry cannot disagree, which assumes the hook is supplied and excludes direct restore. **Fix:** narrow those claims after closing the gaps above.

## Agreements and scope

The registry’s own-property lookup correctly rejects prototype-named, invariant and unknown properties; `checkAgainstRegistry` retains its prior behavior for known types and continues to skip orphaned entries and unknown types. Refusing *new edits* to a missing add-on’s type while preserving its stored data is a sound default. Locale-specific values belong in the default-locale stream too; fallback resolution is outside BWB-104.

The command shape leaves room for BWB-105 source-hash comparison and stale marking, BWB-112 locale snapshots, and BWB-114 inspector fields. Default-locale edits should trigger dependent stale marking in BWB-105, without overwriting target values. Status and error-code semantics should be settled before release.

The targeted offline tests passed: **11 core, 7 registry**. I did not verify WordPress persistence, rendering, fallback behavior, add-on registration across releases, or the full repository check suite. The working tree remained clean.