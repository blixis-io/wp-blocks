import { createStore, type StoreApi } from 'zustand/vanilla';
import { createBridgeSlice, type BridgeSlice } from './bridge';
import { resolveDeps, type EditorStoreDeps, type ResolvedDeps } from './context';
import { createDocumentSlice, type DocumentSlice } from './document-slice';
import { createEmitter } from './events';
import { createHistorySlice, type HistorySlice } from './history-slice';
import { createSelectionSlice, type SelectionSlice } from './selection-slice';
import { createSettingsSlice, type SettingsSlice } from './settings-slice';
import { createStructureSlice, type StructureSlice } from './structure-slice';

/** Everything the editor state holds. The slices are separate files; the bridge slice carries the only write path. */
export type EditorState = DocumentSlice &
  SelectionSlice &
  HistorySlice &
  SettingsSlice &
  BridgeSlice &
  StructureSlice &
  Pick<ResolvedDeps, 'registry' | 'breakpoints'>;
export type EditorStore = StoreApi<EditorState>;

/**
 * Creates one isolated editor store (no module-level state, so every test and every editor instance gets its own). The
 * REST client and bootstrap values are injected; the clock, storage, element registry and breakpoint registry are optional.
 */
export function createEditorStore(deps: EditorStoreDeps): EditorStore {
  const resolved = resolveDeps(deps);
  const emitter = createEmitter();
  return createStore<EditorState>()((...args) => ({
    registry: resolved.registry,
    breakpoints: resolved.breakpoints,
    ...createDocumentSlice(resolved, emitter)(...args),
    ...createSelectionSlice(...args),
    ...createHistorySlice(...args),
    ...createSettingsSlice(resolved)(...args),
    ...createStructureSlice(resolved)(...args),
    ...createBridgeSlice(resolved, emitter)(...args),
  }));
}
