# Handoff: independent review of BWB-022 (document commands and undo/redo)

READ-ONLY, offline. Branch `feat/22-commands-undo-redo`. Read: `docs/architecture/COMMANDS.md`, `packages/core/src/commands/*.ts`, `packages/core/src/commands/commands.test.ts`, ADR 0003, ADR 0004 (orphaned translations on removal), `docs/architecture/SYSTEM.md` (Editor), `docs/architecture/DOCUMENT-SCHEMA.md`.

Questions:
1. Correctness of each command and its inverse: remove/restore (translation statuses across locales, already-orphaned entries, entries that exist only for some locales), move (index semantics after removal, inverse index, moving to a descendant's sibling, depth accounting before/after), insert (orphan-id rule, subtree id clashes, node/depth limit arithmetic: off-by-one at exactly 32 levels / 5000 nodes), update-props (set + previous values + unset), set-style-rule (replace in place, removal index, `emptyAs`), set-class-ids.
2. Can a command sequence produce an invalid document (validateDocument would reject) or lose data? Think: translations for removed elements restored by a later insert; `restore` with stale `statuses`; `restore` applied to a document that changed since (History only calls it right after the matching state, but the command is exported: is it safe against misuse?); `canNest` hook misuse; style rules with reserved keys; huge declarations.
3. Purity and sharing: any mutation of the input (splice on copies?), shared references leaking mutable state, frozen-input handling, performance (O(n) per command: `allIds`, `measure(doc.root)` on every placement; is that acceptable at 5000 nodes for typing at 60 fps? where is the hot path?).
4. History: limit handling, redo after a failed undo (can undo fail?), cloning of entries, memory growth, behaviour when `execute` fails mid-way, coalescing hooks.
5. Error handling: unexpected exceptions (withChildren throwing 'path does not exist') leaking out of applyCommand instead of a result? Which inputs reach them (invalid parent paths, stale paths)?
6. Tests: which behaviour has no failing-case test? Would the random test catch a broken inverse for each command type, a command that corrupts translations, or a missing orphan marking? Is the generator's coverage good (does it actually produce each successful command type, restore with statuses, deep trees)?

Output: Blocker/Major/Minor with file + fix wording; agreements; what you could not verify.
