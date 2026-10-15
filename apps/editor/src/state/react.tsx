import { createContext, useContext, type ReactNode } from 'react';
import { useStore } from 'zustand';
import type { EditorState, EditorStore } from './store';

const StoreContext = createContext<EditorStore | null>(null);

/** Provides one editor store to the tree below it. */
export function StoreProvider({ store, children }: { store: EditorStore; children: ReactNode }) {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

/** The store itself, for imperative access (`getState()`, `subscribe`) from event handlers and effects. */
export function useEditorStoreApi(): EditorStore {
  const store = useContext(StoreContext);
  if (store === null) throw new Error('useEditorStore must be used inside a StoreProvider');
  return store;
}

/**
 * Subscribes a component to a slice of the state (Zustand's hook, `useSyncExternalStore` semantics). The selector must
 * return a stable value for an unchanged state: select primitives or existing references, never a freshly built object or
 * array (wrap those in `useShallow`), otherwise the component re-renders on every store update.
 */
export function useEditorStore<T>(selector: (state: EditorState) => T): T {
  return useStore(useEditorStoreApi(), selector);
}
