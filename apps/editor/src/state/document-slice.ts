import { createHistory, validateDocument, type BuilderDocument } from '@blixis/wp-core';
import type { StateCreator } from 'zustand/vanilla';
import { composeDocument, deepEqual, splitDocument, type ComposeError } from './compose';
import type { ResolvedDeps } from './context';
import type { ApiError, StreamRead } from './deps';
import type { Emitter } from './events';
import { repairSelection } from './selection-slice';
import { persistExpanded } from './structure-slice';
import type { EditorState } from './store';

export type LoadError = { type: 'api'; error: ApiError } | { type: 'invalid'; error: ComposeError };
class SaveFailure extends Error {
  constructor(readonly apiError: ApiError) {
    super('save-failed');
  }
}

export interface StreamRevisions {
  layout: number;
  content: Record<string, number>;
}

export interface DirtyState {
  layout: boolean;
  content: Record<string, boolean>;
}

/** What a save wrote: the revision the server returned per stream, and the document that was actually sent. */
export interface SavedStreams {
  layout?: number;
  content?: Record<string, number>;
  /** The document the streams were split from; defaults to the current one. Pass it when edits may have happened mid-save. */
  document?: BuilderDocument;
}

export interface DocumentSlice {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: LoadError | null;
  /** The document in memory. Replaced only by `loadDocument` and by a successful command, undo or redo. */
  document: BuilderDocument | null;
  /** Stream revisions as last read or saved; the future save slice sends them as `If-Match`. */
  revisions: StreamRevisions;
  /** Last loaded or saved snapshot (per stream); `dirty` compares against it. */
  savedDocument: BuilderDocument | null;
  dirty: DirtyState;
  saveStatus: 'idle' | 'saving' | 'failed';
  saveError: ApiError | { kind: 'invalid-document' } | null;
  saveErrorKey: string | null;
  retryAfterMs: number | null;
  saveLocked: boolean;
  lastSavedAt: number | null;
  saveDraft: (options?: { signal?: AbortSignal }) => Promise<void>;
  cancelSave: () => void;
  resolveConflict: (choice: 'reload' | 'overwrite') => Promise<void>;
  dismissSaveError: () => void;
  loadDocument: (options?: { signal?: AbortSignal }) => Promise<void>;
  markSaved: (saved: SavedStreams) => void;
}

const NO_REVISIONS: StreamRevisions = { layout: 0, content: {} };
const NO_DIRTY: DirtyState = { layout: false, content: {} };

const layoutEqual = (a: BuilderDocument, b: BuilderDocument): boolean => {
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  keys.delete('translations');
  for (const key of keys) if (!deepEqual(left[key], right[key])) return false;
  return true;
};

/**
 * Compares the split streams of `doc` with those of `saved`. Unchanged subtrees are shared between the two (the command
 * engine copies only the changed path), so this is cheap even for large documents, and undoing back to the saved state is
 * clean again. A missing locale stream and an empty one are the same thing.
 */
export function computeDirty(
  doc: BuilderDocument,
  saved: BuilderDocument,
  previous: DirtyState = NO_DIRTY,
): DirtyState {
  const layout = !layoutEqual(doc, saved);
  const content: Record<string, boolean> = {};
  for (const locale of new Set([...Object.keys(doc.translations), ...Object.keys(saved.translations)])) {
    content[locale] = !deepEqual(doc.translations[locale] ?? {}, saved.translations[locale] ?? {});
  }
  const sameContent =
    Object.keys(content).length === Object.keys(previous.content).length &&
    Object.entries(content).every(([locale, value]) => previous.content[locale] === value);
  return layout === previous.layout && sameContent ? previous : { layout, content };
}

export const isDirty = (state: Pick<EditorState, 'dirty'>): boolean =>
  state.dirty.layout || Object.values(state.dirty.content).some(Boolean);

const unreadable = (error: ApiError): LoadError => ({ type: 'api', error });

export const createDocumentSlice =
  (deps: ResolvedDeps, emitter: Emitter): StateCreator<EditorState, [], [], DocumentSlice> =>
  (set, get) => {
    /** The load in flight; a newer load aborts it and its late result is ignored. */
    const loads: { current: { id: number; controller: AbortController } | null } = { current: null };
    let counter = 0;

    const isCurrent = (id: number): boolean => loads.current?.id === id;

    const readAll = async (signal: AbortSignal) => {
      const locales = [...new Set(deps.bootstrap.enabledLocales)];
      const [layout, contents] = await Promise.all([
        deps.client.readLayout({ signal }),
        Promise.all(
          locales.map(async (locale) => ({ locale, result: await deps.client.readContent(locale, { signal }) })),
        ),
      ]);
      return { layout, contents };
    };
    let activeSave: Promise<void> | null = null;
    let saveAbortController: AbortController | null = null;
    let conflictSnapshot: BuilderDocument | null = null;
    const writeSnapshot = async (snapshot: BuilderDocument, signal: AbortSignal, overwrite = false) => {
      const dirty = get().dirty;
      const split = splitDocument(snapshot, get().revisions.content);
      const revisions: { layout?: number; content: Record<string, number> } = { content: {} };
      if (overwrite) {
        if (dirty.layout) {
          const read = await deps.client.readLayout({ signal });
          if (!read.ok) throw new SaveFailure(read.error);
          revisions.layout = read.value.revision;
        }
        for (const locale of Object.keys(dirty.content)
          .filter((key) => dirty.content[key])
          .sort()) {
          const read = await deps.client.readContent(locale, { signal });
          if (!read.ok) throw new SaveFailure(read.error);
          revisions.content[locale] = read.value.revision;
        }
      }
      if (dirty.layout) {
        const revision = revisions.layout ?? get().revisions.layout;
        const result = await deps.client.writeLayout(split.layout, revision, { signal });
        if (!result.ok) throw new SaveFailure(result.error);
        get().markSaved({ layout: result.value.revision, document: snapshot });
      }
      for (const locale of Object.keys(dirty.content)
        .filter((key) => dirty.content[key])
        .sort()) {
        const revision = revisions.content[locale] ?? get().revisions.content[locale] ?? 0;
        const result = await deps.client.writeContent(locale, split.contents[locale], revision, { signal });
        if (!result.ok) throw new SaveFailure(result.error);
        get().markSaved({ content: { [locale]: result.value.revision }, document: snapshot });
      }
      set({ saveStatus: 'idle', saveError: null, saveErrorKey: null, retryAfterMs: null, lastSavedAt: deps.now() });
    };

    return {
      status: 'idle',
      error: null,
      document: null,
      revisions: NO_REVISIONS,
      savedDocument: null,
      dirty: NO_DIRTY,
      saveStatus: 'idle',
      saveError: null,
      saveErrorKey: null,
      retryAfterMs: null,
      saveLocked: false,
      lastSavedAt: null,
      saveDraft(options = {}) {
        if (activeSave) return activeSave;
        const snapshot = get().document;
        if (!snapshot || !deps.editingEnabled || get().saveLocked || !isDirty(get())) return Promise.resolve();
        if (!validateDocument(snapshot).ok) {
          set({ saveStatus: 'failed', saveError: { kind: 'invalid-document' }, saveErrorKey: 'save.error.invalid' });
          return Promise.resolve();
        }
        const controller = new AbortController();
        saveAbortController = controller;
        const abort = () => {
          controller.abort();
        };
        options.signal?.addEventListener('abort', abort, { once: true });
        if (options.signal?.aborted) controller.abort();
        set({ saveStatus: 'saving', saveError: null, saveErrorKey: null, retryAfterMs: null });
        activeSave = (async () => {
          try {
            await writeSnapshot(snapshot, controller.signal);
          } catch (error) {
            const api = error instanceof SaveFailure ? error.apiError : { kind: 'network' as const };
            if (api.kind === 'aborted') set({ saveStatus: 'idle', saveError: null, saveErrorKey: null });
            else {
              if (api.status === 409) conflictSnapshot = snapshot;
              const key =
                api.kind === 'network'
                  ? 'save.error.offline'
                  : api.status === 409
                    ? 'save.error.conflict'
                    : api.status === 401 || api.status === 403
                      ? 'save.error.auth'
                      : api.status === 423
                        ? 'save.error.locked'
                        : api.status === 413 || api.kind === 'too-large'
                          ? 'save.error.large'
                          : api.status === 422
                            ? 'save.error.validation'
                            : api.status === 429
                              ? 'save.error.rate'
                              : 'save.error.server';
              const seconds = api.data?.['retryAfter'];
              const retryAfterMs =
                api.status === 429 && typeof seconds === 'number' && Number.isFinite(seconds)
                  ? Math.min(30, Math.max(0, seconds)) * 1000
                  : api.status === 429
                    ? 5000
                    : null;
              set({ saveStatus: 'failed', saveError: api, saveErrorKey: key, retryAfterMs });
              if (api.status === 423) set({ saveLocked: true });
            }
          } finally {
            options.signal?.removeEventListener('abort', abort);
            activeSave = null;
            if (saveAbortController === controller) saveAbortController = null;
          }
        })();
        return activeSave;
      },
      cancelSave() {
        saveAbortController?.abort();
      },
      async resolveConflict(choice) {
        const snapshot = conflictSnapshot;
        if (!snapshot) return;
        conflictSnapshot = null;
        if (choice === 'reload') {
          await get().loadDocument();
          set({ saveStatus: 'idle', saveError: null });
          return;
        }
        set({ saveStatus: 'saving', saveError: null, saveErrorKey: null });
        try {
          await writeSnapshot(snapshot, new AbortController().signal, true);
        } catch (error) {
          const api = error instanceof SaveFailure ? error.apiError : { kind: 'network' as const };
          if (api.status === 409) conflictSnapshot = snapshot;
          set({
            saveStatus: 'failed',
            saveError: api,
            saveErrorKey:
              api.status === 409
                ? 'save.error.conflict'
                : api.kind === 'network'
                  ? 'save.error.offline'
                  : 'save.error.server',
          });
        }
      },
      dismissSaveError() {
        set({ saveStatus: 'idle', saveError: null, saveErrorKey: null, retryAfterMs: null });
      },

      async loadDocument(options = {}) {
        loads.current?.controller.abort();
        const controller = new AbortController();
        const id = (counter += 1);
        loads.current = { id, controller };
        const external = options.signal;
        const onExternalAbort = (): void => {
          controller.abort();
        };
        if (external?.aborted === true) controller.abort();
        else external?.addEventListener('abort', onExternalAbort, { once: true });
        set({ status: 'loading' });
        try {
          const { layout, contents } = await readAll(controller.signal);
          if (!isCurrent(id)) return; // superseded: a newer load owns the state now
          const failure = [layout, ...contents.map((c) => c.result)].find((r) => !r.ok);
          if (failure !== undefined) {
            if (failure.error.kind === 'aborted') {
              // Aborted by the caller (a newer load would have returned above): put the state back.
              set({ status: get().document === null ? 'idle' : 'ready' });
              return;
            }
            set({ status: 'error', error: unreadable(failure.error) });
            return;
          }
          if (!layout.ok) return;
          const streamContents: Record<string, Record<string, unknown> | null> = {};
          const contentRevisions: Record<string, number> = {};
          for (const { locale, result } of contents) {
            if (!result.ok) return;
            const read: StreamRead = result.value;
            if (read.locale !== null && read.locale !== locale) {
              set({ status: 'error', error: { type: 'invalid', error: { code: 'locale-mismatch', locale } } });
              return;
            }
            streamContents[locale] = read.document;
            contentRevisions[locale] = read.revision;
          }
          const composed = composeDocument({
            layout: layout.value.document,
            contents: streamContents,
            postId: deps.bootstrap.postId,
            defaultLocale: deps.bootstrap.defaultLocale,
            enabledLocales: deps.bootstrap.enabledLocales,
            now: deps.now,
            editorVersion: deps.bootstrap.pluginVersion,
          });
          if (!composed.ok) {
            set({ status: 'error', error: { type: 'invalid', error: composed.error } });
            return;
          }
          const document = composed.document;
          const validExpanded = new Set(allExpandableIds(document.root));
          const defaultExpanded = expandableIds(document.root);
          set((state) => ({
            status: 'ready',
            error: null,
            document,
            savedDocument: document,
            revisions: { layout: layout.value.revision, content: contentRevisions },
            dirty: computeDirty(document, document),
            saveLocked: false,
            lastSavedAt: deps.now(),
            history: createHistory(document, deps.historyLimit),
            canUndo: false,
            canRedo: false,
            coalesce: null,
            selectedId: repairSelection(state.selectedId, state.document, document),
            hoveredId: null,
            expandedInitialized: state.expandedInitialized || document.root.length > 0,
            expandedIds: state.expandedInitialized
              ? state.expandedIds.filter((id) => validExpanded.has(id))
              : defaultExpanded,
          }));
          if (get().expandedInitialized) persistExpanded(deps, get().expandedIds);
          emitter.emit({ type: 'load', document });
        } finally {
          external?.removeEventListener('abort', onExternalAbort);
          if (isCurrent(id)) loads.current = null;
        }
      },

      markSaved(saved) {
        const state = get();
        const { document: now, savedDocument } = state;
        if (now === null || savedDocument === null) return;
        const source = saved.document ?? now;
        const translations = { ...savedDocument.translations };
        for (const locale of Object.keys(saved.content ?? {})) {
          if (Object.hasOwn(source.translations, locale)) translations[locale] = source.translations[locale] ?? {};
          else Reflect.deleteProperty(translations, locale);
        }
        const base = saved.layout === undefined ? savedDocument : source;
        const nextSaved: BuilderDocument = { ...base, translations };
        set({
          savedDocument: nextSaved,
          revisions: {
            layout: saved.layout ?? state.revisions.layout,
            content: { ...state.revisions.content, ...saved.content },
          },
          dirty: computeDirty(now, nextSaved, state.dirty),
        });
      },
    };
  };

function expandableIds(root: BuilderDocument['root']): string[] {
  const ids: string[] = [];
  const stack = root.map((node) => ({ node, depth: 1 }));
  while (stack.length) {
    const item = stack.pop();
    if (!item) continue;
    if (item.node.children.length) {
      if (item.depth <= 2) ids.push(item.node.id);
      for (const node of item.node.children) stack.push({ node, depth: item.depth + 1 });
    }
  }
  return ids;
}

function allExpandableIds(root: BuilderDocument['root']): string[] {
  const ids: string[] = [];
  const stack = [...root];
  while (stack.length) {
    const node = stack.pop();
    if (!node) continue;
    if (node.children.length) ids.push(node.id);
    stack.push(...node.children);
  }
  return ids;
}
