import type { BuilderDocument } from '../schema/document.ts';
import { applyCommand } from './apply.ts';
import type { Command, CommandContext, CommandError } from './types.ts';

interface Entry {
  command: Command;
  inverse: Command;
}

/** Immutable undo/redo state. `document` is always the result of `past` applied to the starting document. */
export interface History {
  readonly document: BuilderDocument;
  readonly past: readonly Entry[];
  readonly future: readonly Entry[];
  readonly limit: number;
}

export type HistoryResult = { ok: true; history: History } | { ok: false; error: CommandError };

export const DEFAULT_HISTORY_LIMIT = 200;

export function createHistory(document: BuilderDocument, limit: number = DEFAULT_HISTORY_LIMIT): History {
  return { document, past: [], future: [], limit };
}

/** Runs a new command. Success clears the redo stack; failure returns the error and leaves the history untouched. */
export function execute(history: History, command: Command, ctx: CommandContext = {}): HistoryResult {
  const result = applyCommand(history.document, command, ctx);
  if (!result.ok) return result;
  const past = [...history.past, { command, inverse: result.inverse }];
  return {
    ok: true,
    history: {
      ...history,
      document: result.document,
      past: past.length > history.limit ? past.slice(past.length - history.limit) : past,
      future: [],
    },
  };
}

export const canUndo = (history: History): boolean => history.past.length > 0;
export const canRedo = (history: History): boolean => history.future.length > 0;

/** Reverts the last command by applying its recorded inverse. A no-op when there is nothing to undo. */
export function undo(history: History, ctx: CommandContext = {}): HistoryResult {
  const entry = history.past[history.past.length - 1];
  if (entry === undefined) return { ok: true, history };
  const result = applyCommand(history.document, entry.inverse, ctx);
  if (!result.ok) return result;
  return {
    ok: true,
    history: {
      ...history,
      document: result.document,
      past: history.past.slice(0, -1),
      future: [...history.future, entry],
    },
  };
}

/** Re-applies the last undone command. A no-op when there is nothing to redo. */
export function redo(history: History, ctx: CommandContext = {}): HistoryResult {
  const entry = history.future[history.future.length - 1];
  if (entry === undefined) return { ok: true, history };
  const result = applyCommand(history.document, entry.command, ctx);
  if (!result.ok) return result;
  return {
    ok: true,
    history: {
      ...history,
      document: result.document,
      past: [...history.past, { command: entry.command, inverse: result.inverse }],
      future: history.future.slice(0, -1),
    },
  };
}
