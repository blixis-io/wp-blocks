import type { StateCreator } from 'zustand/vanilla';
import type { ApiError, PageSettings, PageSettingsWrite } from '../api/types';
import type { ResolvedDeps } from './context';
import type { EditorState } from './store';

export interface PageSettingsSlice {
  pageSettings: PageSettings | null;
  pageSettingsSaved: PageSettings | null;
  pageSettingsStatus: 'idle' | 'loading' | 'ready' | 'failed';
  pageSettingsError: ApiError | null;
  pageSettingsFieldErrors: Record<string, string>;
  pageSettingsDirty: boolean;
  loadPageSettings: () => Promise<void>;
  updatePageSettings: (
    update: Partial<Pick<PageSettings, 'title' | 'slug' | 'excerpt'>> & {
      featuredImage?: PageSettings['featuredImage'];
    } & { seo?: PageSettings['seo'] },
  ) => void;
}

export function changedPageSettings(current: PageSettings, saved: PageSettings): PageSettingsWrite {
  const changed: PageSettingsWrite = {};
  if (current.title !== saved.title) changed.title = current.title;
  if (current.slug !== saved.slug) changed.slug = current.slug;
  if (current.excerpt !== saved.excerpt) changed.excerpt = current.excerpt;
  if (JSON.stringify(current.featuredImage) !== JSON.stringify(saved.featuredImage))
    changed.featuredImageId = current.featuredImage?.id ?? null;
  const seo: PageSettingsWrite['seo'] = {};
  for (const locale of new Set([...Object.keys(current.seo), ...Object.keys(saved.seo)])) {
    const next = current.seo[locale];
    const previous = saved.seo[locale];
    if (next) {
      const changed = Object.fromEntries(
        Object.entries(next).filter(
          ([key, value]) => JSON.stringify(value) !== JSON.stringify(previous?.[key as keyof typeof next]),
        ),
      );
      if (Object.keys(changed).length) seo[locale] = changed;
    }
  }
  if (Object.keys(seo).length) changed.seo = seo;
  return changed;
}

export const createPageSettingsSlice =
  (deps: ResolvedDeps): StateCreator<EditorState, [], [], PageSettingsSlice> =>
  (set, get) => {
    let loading: Promise<void> | null = null;
    return {
      pageSettings: null,
      pageSettingsSaved: null,
      pageSettingsStatus: 'idle',
      pageSettingsError: null,
      pageSettingsFieldErrors: {},
      pageSettingsDirty: false,
      loadPageSettings() {
        if (get().pageSettingsStatus === 'ready') return Promise.resolve();
        if (loading) return loading;
        set({ pageSettingsStatus: 'loading' });
        loading = deps.client
          .readPage()
          .then((result) => {
            if (result.ok)
              set({
                pageSettings: result.value,
                pageSettingsSaved: result.value,
                pageSettingsStatus: 'ready',
                pageSettingsError: null,
              });
            else set({ pageSettingsStatus: 'failed', pageSettingsError: result.error });
          })
          .finally(() => {
            loading = null;
          });
        return loading;
      },
      updatePageSettings(update) {
        const current = get().pageSettings;
        if (!current) return;
        const next = { ...current, ...update, ...(update.seo ? { seo: { ...current.seo, ...update.seo } } : {}) };
        const saved = get().pageSettingsSaved;
        set({
          pageSettings: next,
          pageSettingsDirty: saved ? Object.keys(changedPageSettings(next, saved)).length > 0 : true,
          pageSettingsFieldErrors: {},
        });
      },
    };
  };
