export {
  COALESCE_WINDOW_MS,
  type BridgeSlice,
  type DispatchOptions,
  type DispatchResult,
  type StepResult,
} from './bridge';
export {
  composeDocument,
  createEmptyDocument,
  deepEqual,
  formatTimestamp,
  isSplitStable,
  splitDocument,
  type ComposeError,
  type ComposeErrorCode,
  type ComposeInput,
  type ComposeResult,
  type SplitDocument,
} from './compose';
export {
  DEFAULT_BREAKPOINTS,
  DEFAULT_HISTORY_LIMIT,
  VIEWPORTS,
  type BreakpointRegistry,
  type BridgeError,
  type BridgeErrorCode,
  type EditorStoreDeps,
  type KeyValueStorage,
  type PreviewMode,
  type StoreBootstrap,
  type Viewport,
} from './context';
export { createRestClient, type ApiError, type RestClient } from './deps';
export {
  computeDirty,
  isDirty,
  type DirtyState,
  type DocumentSlice,
  type LoadError,
  type SavedStreams,
  type StreamRevisions,
} from './document-slice';
export type { DocumentEvent, DocumentListener } from './events';
export type { CoalesceMark, HistorySlice } from './history-slice';
export { StoreProvider, useEditorStore, useEditorStoreApi } from './react';
export { hasElement, repairSelection, type SelectionSlice } from './selection-slice';
export { VIEW_STORAGE_PREFIX, readPersistedView, viewStorageKey, type SettingsSlice } from './settings-slice';
export { createEditorStore, type EditorState, type EditorStore } from './store';
export type { StructureSlice } from './structure-slice';
