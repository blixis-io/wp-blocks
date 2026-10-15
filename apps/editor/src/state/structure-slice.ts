import type { StateCreator } from 'zustand/vanilla';
import type { ResolvedDeps } from './context';
import type { EditorState } from './store';

const STRUCTURE_STORAGE_PREFIX = 'blixis-editor-structure-';
export const structureStorageKey = (postId: number): string => `${STRUCTURE_STORAGE_PREFIX}${String(postId)}`;

function readExpanded(deps: ResolvedDeps): { ids: readonly string[]; initialized: boolean } {
  const raw = deps.storage.read(structureStorageKey(deps.bootstrap.postId));
  if (raw === null || raw.length > 100_000) return { ids: [], initialized: false };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return { ids: [], initialized: false };
    const values = (parsed as Record<string, unknown>)['expandedIds'];
    if (!Array.isArray(values) || values.length > 5000) return { ids: [], initialized: false };
    const ids = values.filter((id): id is string => typeof id === 'string' && /^[a-z0-9][a-z0-9_-]{2,63}$/.test(id));
    return { ids: [...new Set(ids)], initialized: true };
  } catch {
    return { ids: [], initialized: false };
  }
}

export function persistExpanded(deps: ResolvedDeps, ids: readonly string[]): void {
  deps.storage.write(structureStorageKey(deps.bootstrap.postId), JSON.stringify({ expandedIds: ids }));
}

export interface StructureSlice {
  expandedIds: readonly string[];
  expandedInitialized: boolean;
  setExpanded: (id: string, expanded: boolean) => void;
  expandMany: (ids: readonly string[]) => void;
}

export const createStructureSlice = (deps: ResolvedDeps): StateCreator<EditorState, [], [], StructureSlice> => {
  const initial = readExpanded(deps);
  return (set, get) => ({
    expandedIds: initial.ids,
    expandedInitialized: initial.initialized,
    setExpanded(id, expanded) {
      const current = get().expandedIds;
      const has = current.includes(id);
      if (has === expanded) return;
      const expandedIds = expanded ? [...current, id] : current.filter((value) => value !== id);
      set({ expandedIds, expandedInitialized: true });
      persistExpanded(deps, expandedIds);
    },
    expandMany(ids) {
      const current = get().expandedIds;
      const next = new Set(current);
      for (const id of ids) next.add(id);
      if (next.size !== current.length) {
        const expandedIds = [...next];
        set({ expandedIds, expandedInitialized: true });
        persistExpanded(deps, expandedIds);
      }
    },
  });
};
