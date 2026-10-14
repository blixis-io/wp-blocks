# Document commands and history

Implements the command model of [SYSTEM.md](SYSTEM.md) ("Editor") for BWB-022, in `packages/core/src/commands/`. The editor never edits the document tree directly: every change is a command applied by `applyCommand`, and `History` records each command with its exact inverse.

## Commands

| Command | Effect | Notes |
|---|---|---|
| `insert` `{parentId, index, element}` | Adds a subtree. `parentId: null` = top level. | Ids are supplied by the caller (never generated), so replaying commands is deterministic. |
| `remove` `{id}` | Removes a subtree. | Translations of every removed element, in every locale, become `orphaned` (values kept, never dropped; ADR 0004). |
| `move` `{id, parentId, index}` | Moves a subtree. | `index` is the position in the target list **after** the element has left its old place. |
| `update-props` `{id, set?, unset?}` | Sets and removes invariant properties. | A key cannot be in both. Values follow the document value rules. |
| `set-style-rule` `{id, selector, declarations \| null, index?}` | Adds, replaces (in place) or removes the rule for a breakpoint/mode/state combination. | Never creates two rules with one selector. `null` removes. |
| `set-class-ids` `{id, classIds \| null}` | Sets or clears the element's global classes. | Only classes present in the document's `classRefs`. |
| `set-translation` `{locale, elementId, set?, unset?, status?}` | Sets and removes translatable values of one element in one locale; creates the entry when absent. | `status` is `draft`, `translated` or `reviewed`; omitted, it becomes `translated` in the default locale and `draft` elsewhere (editing leaves review). Unknown entry fields and `sourceHash` are kept. See `TRANSLATIONS.md`. |
| `mark-stale` `{locale?}` | Flags draft, translated and reviewed translations whose source marker is missing or differs from the current default-locale source as `stale`, keeping their text. | See `TRANSLATIONS.md`. Idempotent. |
| `restore-statuses` | Internal: the inverse of `mark-stale`. | Sets exact statuses on live entries. |
| `restore-translation` | Internal: the inverse of `set-translation`. | Puts back the complete previous entry, or removes it (and the locale stream when the edit created it), and the statuses of other locales' entries that a source edit flagged. With a registry hook the restored values that differ from the current ones are checked like `set-translation` values. |
| `restore-style-rule` | Internal: the inverse of removing a rule. | Puts back the complete rule, unknown fields included, at its original position. |
| `restore` | Internal: the inverse of `remove`. | Re-inserts the subtree and restores each translation entry's previous status. Checked against the current state: every status record must belong to the restored subtree and to an entry that is currently `orphaned`; anything else is a `stale-restore`. |

`applyCommand(doc, command, ctx)` returns `{ ok: true, document, inverse, command }` or `{ ok: false, error: { code, message } }`. It is pure: the input is never modified, untouched subtrees are shared between the old and new document, and a failing command changes nothing.

**Trust boundary.** A command is untrusted input (REST, macros, tests): it is copied once into an inert snapshot (no accessors, Proxies, class instances, reserved keys, decimals, non-NFC text), validated against `CommandSchema` (strict: unknown fields are errors; the same id, element and rule schemas as documents), and only then applied. The returned `command` is that snapshot; `History` stores it, so mutating the object you passed afterwards changes neither the document nor undo/redo. Nothing is thrown: a malformed command, a hostile object or a throwing `canNest` hook become `invalid-argument`.

**Result limits.** Whatever a command does, the result must stay within the document limits (tree depth 32, 5 000 elements, 2 MiB estimated size, at most 256 style rules and 64 class ids per element); otherwise the command fails and nothing changes. Together with the checks above this makes the guarantee below hold: a command never produces a document that `validateDocument` rejects.

Property ids such as `toString`, `valueOf` and `hasOwnProperty` are valid and exist on every object's prototype, so all lookups use own-property checks.

## Errors

`element-not-found`, `parent-not-found`, `duplicate-id`, `id-has-orphaned-translations` (a new element may not reuse the id of a removed element that still has orphaned translations; undo is the way back), `index-out-of-range`, `cycle` (moving an element into itself or its descendants), `depth-exceeded` (32), `node-limit-exceeded` (5 000), `document-too-large` (2 MiB), `disallowed-parent`, `invalid-argument` (malformed command or payload), `stale-restore`, `locale-not-found` (the locale is not one of the document's `locales`), `not-translatable` (the registry says the property is not translatable or locale-specific, or the type is unknown) and `invalid-translation` (a value its definition refuses). Codes are stable.

## Registry hook

`ctx.canNest(parentType | null, childType, intent)` is the seam for the element registry (BWB-021). For `insert` (intent `create`) every nesting inside the new subtree is checked, so a disallowed parent anywhere in it rejects the command. For `move` and `restore` (intent `relocate`) only the subtree root's new nesting is checked: nestings already inside the subtree were valid before and are not re-judged, so a container holding an element of a removed add-on can still be rearranged. Without a hook everything is allowed.

`ctx.sourceProperties(type)` returns the ids that count as source text for stale detection (BWB-105; `registry.sourceProperties`).

`ctx.translationValue(type, property, value)` is the registry seam for `set-translation` (BWB-104): it returns `{ ok: true }` or `{ ok: false, code: 'not-translatable' | 'invalid-translation', message }`. `registry.translationValue` is that hook. Without a hook any property id is accepted.

## History

`createHistory(doc, limit = 200)`, `execute`, `undo`, `redo`, `canUndo`, `canRedo`; all immutable. A new command clears the redo stack; a failing command leaves the history untouched; undo/redo with nothing to do are no-ops; the oldest entries are dropped beyond `limit`. Undo applies the recorded inverse, redo re-applies the original command.

## Guarantees (tested)

- After every successful command the document still passes `validateDocument` (unique ids, depth and node limits, orphan rules, class references).
- `inverse(apply(c))` restores the previous document exactly, including absent versus empty `style` lists (`emptyAs`), translation statuses and rule positions.
- Seeded random command sequences (valid and invalid mixed) satisfy both properties at every step, and undoing everything and redoing everything reproduces every intermediate document.

## History details

`createHistory` rejects a limit that is not a positive integer (`RangeError`). Undo can fail (for example if the registry hook changed since); the history is then returned untouched and the same undo succeeds once the cause is gone.

## Performance

Every command walks the tree to find its target and re-measures the result (depth, count, estimated bytes). Measured on a 5 000-element document with about 60 bytes of text per element: 1.5 to 1.8 ms per `update-props` or `move` (Node 24, Apple silicon); a full `validateDocument` of the same document takes about 45 ms, so it belongs on load and save, not on every keystroke. The test suite asserts a generous 40 ms ceiling per edit. If profiling in the real editor shows a hot path, an id -> path index can be cached per document object; nothing needs that yet.

## Not here yet

Locale management (adding and removing locales), global class and token edits (site-level, not part of a page document), coalescing of rapid property edits into one undo step (editor concern, BWB-050), and the registry's per-type property schemas (BWB-021).
