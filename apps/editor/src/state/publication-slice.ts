import type { StateCreator } from 'zustand/vanilla';
import type { ApiError, PublicationState } from '../api/types';
import type { ResolvedDeps } from './context';
import type { EditorState } from './store';
import { isDirty } from './document-slice';

export interface PublicationSlice {
  publication: PublicationState | null;
  publicationStatus: 'idle' | 'loading' | 'publishing' | 'failed';
  publicationError: ApiError | null;
  publicationSuccess: boolean;
  refreshPublication: () => Promise<void>;
  publish: (locales: readonly string[]) => Promise<void>;
  rollback: (locale?: string) => Promise<void>;
  clearPublicationError: () => void;
}
class PublicationFailure extends Error {
  constructor(readonly api: ApiError) {
    super('publication-failed');
  }
}

export const createPublicationSlice =
  (deps: ResolvedDeps): StateCreator<EditorState, [], [], PublicationSlice> =>
  (set, get) => ({
    publication: null,
    publicationStatus: 'idle',
    publicationError: null,
    publicationSuccess: false,
    async refreshPublication() {
      set({ publicationStatus: 'loading' });
      const result = await deps.client.readPublication();
      if (result.ok) set({ publication: result.value, publicationStatus: 'idle', publicationError: null });
      else set({ publicationStatus: 'failed', publicationError: result.error });
    },
    async publish(locales) {
      set({ publicationStatus: 'publishing', publicationError: null, publicationSuccess: false });
      if (isDirty(get())) {
        await get().saveDraft();
        if (get().saveStatus === 'failed' || isDirty(get())) {
          const saveError = get().saveError;
          set({
            publicationStatus: 'failed',
            publicationError: saveError && 'status' in saveError ? saveError : { kind: 'network' },
          });
          return;
        }
        const refreshed = await deps.client.readPublication();
        if (!refreshed.ok) {
          set({ publicationStatus: 'failed', publicationError: refreshed.error });
          return;
        }
        set({ publication: refreshed.value });
      }
      let pointerRevision = get().publication?.pointerRevision;
      if (pointerRevision === undefined) {
        const read = await deps.client.readPublication();
        if (!read.ok) {
          set({ publicationStatus: 'failed', publicationError: read.error });
          return;
        }
        set({ publication: read.value });
        pointerRevision = read.value.pointerRevision;
      }
      const state = get().publication;
      const layout = state?.layout.state !== 'published';
      const targets = [...new Set(locales)].filter((locale) => deps.bootstrap.enabledLocales.includes(locale));
      if (!layout && targets.length === 0) {
        set({
          publicationStatus: 'failed',
          publicationError: { kind: 'http', status: 422, code: 'blixis_nothing_to_publish' },
        });
        return;
      }
      try {
        if (layout || targets.length === 0) {
          const result = await deps.client.publish({
            pointerRevision,
            layout,
            ...(targets[0] ? { locale: targets[0] } : {}),
          });
          if (!result.ok) throw new PublicationFailure(result.error);
          pointerRevision = result.value.pointerRevision;
        }
        for (const locale of targets.slice(layout || targets.length === 0 ? 1 : 0)) {
          const result = await deps.client.publish({ pointerRevision, layout: false, locale });
          if (!result.ok) throw new PublicationFailure(result.error);
          pointerRevision = result.value.pointerRevision;
        }
        const refreshed = await deps.client.readPublication();
        if (!refreshed.ok) throw new PublicationFailure(refreshed.error);
        set({
          publication: refreshed.value,
          publicationStatus: 'idle',
          publicationError: null,
          publicationSuccess: true,
        });
      } catch (error) {
        const api = error instanceof PublicationFailure ? error.api : { kind: 'network' as const };
        const refreshed = await deps.client.readPublication();
        set({
          ...(refreshed.ok ? { publication: refreshed.value } : {}),
          publicationStatus: 'failed',
          publicationError: api,
          publicationSuccess: false,
        });
      }
    },
    async rollback(locale) {
      const current = get().publication;
      if (!current) return;
      set({ publicationStatus: 'publishing', publicationError: null, publicationSuccess: false });
      // Snapshot history is not exposed by the current API; snapshots are monotonically numbered per stream.
      const currentSnapshot = locale ? current.locales[locale]?.snapshot : current.layout.snapshot;
      if (!currentSnapshot || currentSnapshot < 2) {
        set({
          publicationStatus: 'failed',
          publicationError: { kind: 'http', status: 422, code: 'blixis_snapshot_not_found' },
        });
        return;
      }
      const rollback = locale
        ? await deps.client.rollback({
            pointerRevision: current.pointerRevision,
            locale,
            contentSnapshot: currentSnapshot - 1,
          })
        : await deps.client.rollback({
            pointerRevision: current.pointerRevision,
            layoutSnapshot: currentSnapshot - 1,
            confirmImpact: true,
          });
      if (!rollback.ok) {
        set({ publicationStatus: 'failed', publicationError: rollback.error });
        return;
      }
      const refreshed = await deps.client.readPublication();
      set(
        refreshed.ok
          ? {
              publication: refreshed.value,
              publicationStatus: 'idle',
              publicationError: null,
              publicationSuccess: true,
            }
          : { publicationStatus: 'failed', publicationError: refreshed.error, publicationSuccess: false },
      );
    },
    clearPublicationError() {
      set({ publicationError: null, publicationStatus: 'idle' });
    },
  });
