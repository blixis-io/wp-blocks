import { findPath, nodeAt, type BuilderDocument } from '@blixis/wp-core';
import type { StateCreator } from 'zustand/vanilla';
import type { EditorState } from './store';

export interface SelectionSlice {
  selectedId: string | null;
  hoveredId: string | null;
  /** Selects an element of the loaded document. Refused (returns `false`, state unchanged) for a missing id. `null` clears. */
  select: (id: string | null) => boolean;
  clearSelection: () => void;
  /** Hover is validated like selection: a missing id is ignored. */
  hover: (id: string | null) => void;
}

export const hasElement = (doc: BuilderDocument | null, id: string): boolean =>
  doc !== null && findPath(doc.root, id) !== null;

/**
 * Selection rule after any document change (command, undo, redo, load): a selected id that still exists stays selected. One
 * that no longer exists moves to its nearest surviving ancestor, found by walking up the path it had in the PREVIOUS
 * document (`findPath` + `nodeAt`); with no surviving ancestor (or no previous document) the selection is cleared.
 */
export function repairSelection(
  selectedId: string | null,
  previous: BuilderDocument | null,
  next: BuilderDocument,
): string | null {
  if (selectedId === null) return null;
  if (findPath(next.root, selectedId) !== null) return selectedId;
  if (previous === null) return null;
  const path = findPath(previous.root, selectedId);
  if (path === null) return null;
  for (let length = path.length - 1; length >= 1; length -= 1) {
    const ancestor = nodeAt(previous.root, path.slice(0, length));
    if (ancestor !== undefined && findPath(next.root, ancestor.id) !== null) return ancestor.id;
  }
  return null;
}

export const createSelectionSlice: StateCreator<EditorState, [], [], SelectionSlice> = (set, get) => ({
  selectedId: null,
  hoveredId: null,
  select(id) {
    if (id === null) {
      if (get().selectedId !== null) set({ selectedId: null });
      return true;
    }
    if (!hasElement(get().document, id)) return false;
    if (get().selectedId !== id) set({ selectedId: id });
    return true;
  },
  clearSelection() {
    if (get().selectedId !== null) set({ selectedId: null });
  },
  hover(id) {
    const next = id !== null && hasElement(get().document, id) ? id : null;
    if (get().hoveredId !== next) set({ hoveredId: next });
  },
});
