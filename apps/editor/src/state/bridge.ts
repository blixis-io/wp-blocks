import {
  applyCommand,
  canRedo,
  canUndo,
  redo as redoHistory,
  undo as undoHistory,
  type BuilderDocument,
  type Command,
  type CommandError,
  type History,
} from '@blixis/wp-core';
import type { StateCreator } from 'zustand/vanilla';
import type { BridgeError, ResolvedDeps } from './context';
import { deepEqual } from './compose';
import { computeDirty } from './document-slice';
import type { DocumentEvent, DocumentListener, Emitter } from './events';
import type { CoalesceMark } from './history-slice';
import { hasElement, repairSelection } from './selection-slice';
import type { EditorState } from './store';

const pruneExpanded = (root: BuilderDocument['root'], expanded: readonly string[]): readonly string[] => {
  const withChildren = new Set<string>();
  const stack = [...root];
  while (stack.length) {
    const node = stack.pop();
    if (!node) continue;
    if (node.children.length) withChildren.add(node.id);
    stack.push(...node.children);
  }
  const next = expanded.filter((id) => {
    return withChildren.has(id);
  });
  return next.length === expanded.length ? expanded : next;
};

/** Edits closer together than this, on the same element and properties, become one undo step. */
export const COALESCE_WINDOW_MS = 1000;

export interface DispatchOptions {
  /** Merges rapid consecutive property, translation, or style edits carrying the same key into one undo step. */
  coalesceKey?: string;
  /** Optional longer interaction window (for an active pointer drag); bounded to one minute. */
  coalesceWindowMs?: number;
}

export type DispatchResult = { ok: true; command: Command } | { ok: false; error: BridgeError };

/** Result of `undo`/`redo`: `changed` is false when there was nothing to undo or redo. */
export type StepResult = { ok: true; changed: boolean } | { ok: false; error: BridgeError };

export interface BridgeSlice {
  /**
   * THE write path of the document. Runs the command through core's `applyCommand` with the element registry's hooks; on
   * success replaces document, history, dirty state and selection in one store update. A failing command changes nothing.
   * The command is untrusted input: it is never mutated and core stores its own inert copy.
   */
  dispatch: (command: unknown, options?: DispatchOptions) => DispatchResult;
  finishCoalescing: () => void;
  undo: () => StepResult;
  redo: () => StepResult;
  /** Called after every document change with a consistent store (`command`, `undo`, `redo`, `load`). */
  subscribe: (listener: DocumentListener) => () => void;
}

type Entry = History['past'][number];

const COALESCABLE = new Set(['update-props', 'set-translation', 'set-style-rule']);

/** Element plus the property ids a command touches; two commands merge only when this is identical. */
function signatureOf(command: Command): string | null {
  if (command.type === 'update-props') {
    return JSON.stringify([
      command.type,
      command.id,
      Object.keys(command.set ?? {}).sort(),
      [...(command.unset ?? [])].sort(),
    ]);
  }
  if (command.type === 'set-translation') {
    return JSON.stringify([
      command.type,
      command.locale,
      command.elementId,
      Object.keys(command.set ?? {}).sort(),
      [...(command.unset ?? [])].sort(),
    ]);
  }
  if (command.type === 'set-style-rule') {
    return JSON.stringify([command.type, command.id, command.selector, Object.keys(command.declarations ?? {}).sort()]);
  }
  return null;
}

/** `true` when applying `command` to `from` yields a document structurally equal to `expected`. */
function reproduces(deps: ResolvedDeps, from: BuilderDocument, command: unknown, expected: BuilderDocument): boolean {
  const result = applyCommand(from, command, deps.commandContext);
  return result.ok && deepEqual(result.document, expected);
}

const refuse = (code: BridgeError['code'], message: string): { ok: false; error: BridgeError } => ({
  ok: false,
  error: { code, message },
});
const fromCommandError = (error: CommandError): { ok: false; error: BridgeError } => ({ ok: false, error });

export const createBridgeSlice =
  (deps: ResolvedDeps, emitter: Emitter): StateCreator<EditorState, [], [], BridgeSlice> =>
  (set, get) => {
    /** One atomic store update for a new document + history; listeners are told afterwards. */
    const commit = (type: DocumentEvent['type'], history: History, coalesce: CoalesceMark | null): void => {
      const state = get();
      const document: BuilderDocument = history.document;
      const selectedId = repairSelection(state.selectedId, state.document, document);
      const hoveredId = state.hoveredId !== null && hasElement(document, state.hoveredId) ? state.hoveredId : null;
      const expandedIds = pruneExpanded(document.root, state.expandedIds);
      set({
        document,
        history,
        canUndo: canUndo(history),
        canRedo: canRedo(history),
        coalesce,
        selectedId,
        hoveredId,
        expandedIds,
        dirty: state.savedDocument === null ? state.dirty : computeDirty(document, state.savedDocument, state.dirty),
      });
      emitter.emit({ type, document });
    };

    const guard = (): { history: History } | { ok: false; error: BridgeError } => {
      const { history, status } = get();
      // `error` keeps the previous document in memory but it may be dirty and a later successful Retry replaces it: no edits.
      if (history === null || get().document === null || status === 'loading' || status === 'error') {
        return refuse('not-ready', 'the document is not loaded');
      }
      if (!deps.editingEnabled || get().saveLocked) return refuse('read-only', 'editing is disabled for this document');
      return { history };
    };

    return {
      finishCoalescing() {
        if (get().coalesce !== null) set({ coalesce: null });
      },
      dispatch(command, options = {}) {
        const ready = guard();
        if (!('history' in ready)) return ready;
        const { history } = ready;
        const applied = applyCommand(history.document, command, deps.commandContext);
        if (!applied.ok) return fromCommandError(applied.error);

        const entry: Entry = { command: applied.command, inverse: applied.inverse };
        const limit = history.limit;
        const key = options.coalesceKey;
        const signature =
          key === undefined || !COALESCABLE.has(applied.command.type) ? null : signatureOf(applied.command);
        const previousEntry = history.past[history.past.length - 1];
        const mark = get().coalesce;
        const at = deps.now();
        // The merged entry replays only the LATEST command from the pre-burst document and undoes with the FIRST inverse.
        // Core commands are state dependent (a `set-translation` that equals the pre-burst values is a no-op and marks no
        // stale translations), so merge only when both directions reproduce the current states exactly.
        const burst =
          key !== undefined &&
          signature !== null &&
          mark !== null &&
          previousEntry !== undefined &&
          mark.key === key &&
          mark.signature === signature &&
          at - mark.at >= 0 &&
          at - mark.at <=
            Math.min(60_000, Math.max(COALESCE_WINDOW_MS, options.coalesceWindowMs ?? COALESCE_WINDOW_MS)) &&
          reproduces(deps, mark.base, applied.command, applied.document) &&
          reproduces(deps, applied.document, previousEntry.inverse, mark.base)
            ? { base: mark.base, inverse: previousEntry.inverse }
            : null;

        let past: readonly Entry[];
        if (burst !== null) {
          // Keep the FIRST inverse (it restores the state before the burst) and the LATEST forward command (it carries the
          // final values for the same property set): one step that undoes and redoes the whole burst.
          past = [...history.past.slice(0, -1), { command: entry.command, inverse: burst.inverse }];
        } else {
          const extended = [...history.past, entry];
          past = extended.length > limit ? extended.slice(extended.length - limit) : extended;
        }
        const next: History = { ...history, document: applied.document, past, future: [] };
        const base = burst?.base ?? history.document;
        commit('command', next, key !== undefined && signature !== null ? { key, signature, at, base } : null);
        return { ok: true, command: applied.command };
      },

      undo() {
        const ready = guard();
        if (!('history' in ready)) return ready;
        const result = undoHistory(ready.history, deps.commandContext);
        if (!result.ok) return fromCommandError(result.error);
        if (result.history === ready.history) return { ok: true, changed: false };
        commit('undo', result.history, null);
        return { ok: true, changed: true };
      },

      redo() {
        const ready = guard();
        if (!('history' in ready)) return ready;
        const result = redoHistory(ready.history, deps.commandContext);
        if (!result.ok) return fromCommandError(result.error);
        if (result.history === ready.history) return { ok: true, changed: false };
        commit('redo', result.history, null);
        return { ok: true, changed: true };
      },

      subscribe: emitter.subscribe,
    };
  };
