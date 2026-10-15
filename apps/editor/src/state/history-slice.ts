import type { BuilderDocument, History } from '@blixis/wp-core';
import type { StateCreator } from 'zustand/vanilla';
import type { EditorState } from './store';

/** Marks the undo entry that a burst of rapid edits is being merged into. */
export interface CoalesceMark {
  key: string;
  /** Element and property set of the command; only an identical one merges. */
  signature: string;
  /** Clock value of the last command of the burst (the window is measured from it). */
  at: number;
  /** The document before the FIRST command of the burst; a merge is only taken when replaying from it is exact. */
  base: BuilderDocument;
}

export interface HistorySlice {
  /** Core undo/redo state; its `document` is always the store's `document`. Read-only: only the bridge replaces it. */
  history: History | null;
  canUndo: boolean;
  canRedo: boolean;
  coalesce: CoalesceMark | null;
}

export const createHistorySlice: StateCreator<EditorState, [], [], HistorySlice> = () => ({
  history: null,
  canUndo: false,
  canRedo: false,
  coalesce: null,
});
