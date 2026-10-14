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
| `restore` | Internal: the inverse of `remove`. | Re-inserts the subtree and restores each translation entry's previous status. |

`applyCommand(doc, command, ctx)` returns `{ ok: true, document, inverse }` or `{ ok: false, error: { code, message } }`. It is pure: the input is never modified, untouched subtrees are shared between the old and new document, and a failing command changes nothing.

## Errors

`element-not-found`, `parent-not-found`, `duplicate-id`, `id-has-orphaned-translations` (a new element may not reuse the id of a removed element that still has orphaned translations; undo is the way back), `index-out-of-range`, `cycle` (moving an element into itself or its descendants), `depth-exceeded` (32), `node-limit-exceeded` (5 000), `disallowed-parent`, `invalid-argument`. Codes are stable.

## Registry hook

`ctx.canNest(parentType | null, childType)` is the seam for the element registry (BWB-021): every nesting inside an inserted or moved subtree is checked, so a disallowed parent anywhere in the subtree rejects the command. Without a hook everything is allowed.

## History

`createHistory(doc, limit = 200)`, `execute`, `undo`, `redo`, `canUndo`, `canRedo`; all immutable. A new command clears the redo stack; a failing command leaves the history untouched; undo/redo with nothing to do are no-ops; the oldest entries are dropped beyond `limit`. Undo applies the recorded inverse, redo re-applies the original command.

## Guarantees (tested)

- After every successful command the document still passes `validateDocument` (unique ids, depth and node limits, orphan rules, class references).
- `inverse(apply(c))` restores the previous document exactly, including absent versus empty `style` lists (`emptyAs`), translation statuses and rule positions.
- Seeded random command sequences (valid and invalid mixed) satisfy both properties at every step, and undoing everything and redoing everything reproduces every intermediate document.

## Not here yet

Translation edits (`SetTranslation`, stale detection: BWB-104/105), global class and token edits (site-level, not part of a page document), coalescing of rapid property edits into one undo step (editor concern, BWB-050), and the registry's per-type property schemas (BWB-021).
