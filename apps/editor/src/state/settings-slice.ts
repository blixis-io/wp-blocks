import type { StateCreator } from 'zustand/vanilla';
import { PANELS_STORAGE_KEY, readPanelState, type PanelState } from '../panels';
import { writeStorage } from '../storage';
import { VIEWPORTS, type PreviewMode, type ResolvedDeps, type Viewport } from './context';
import type { EditorState } from './store';

/**
 * View settings of the CANVAS CONTENT. Four things are deliberately separate and none of them may change another:
 *
 * | Setting | Owner | Never changes |
 * |---|---|---|
 * | editor chrome appearance | `chrome-theme.ts` (own storage key) | previewMode, contentLocale |
 * | editor interface locale | `bootstrap.editorLocale` / I18nProvider | previewMode, contentLocale |
 * | `previewMode` (website content light/dark) | this slice | chrome theme |
 * | `contentLocale` (language being edited) | this slice | editor interface locale |
 */
export interface SettingsSlice {
  viewport: Viewport;
  /** Breakpoint id of the viewport per the injected breakpoint registry (`base` for desktop). */
  breakpointId: string;
  /** Canvas width in CSS px for the viewport; `null` = full width. */
  viewportWidth: number | null;
  previewMode: PreviewMode;
  contentLocale: string;
  panels: PanelState;
  setViewport: (viewport: Viewport) => void;
  setPreviewMode: (mode: PreviewMode) => void;
  /** Switches the language being edited. Refused (`false`) unless it is an enabled locale. Never touches the chrome language. */
  setContentLocale: (locale: string) => boolean;
  togglePanel: (side: keyof PanelState) => void;
}

const PREVIEW_MODES: readonly string[] = ['light', 'dark'];
export const VIEW_STORAGE_PREFIX = 'blixis-editor-view-';
export const viewStorageKey = (postId: number): string => `${VIEW_STORAGE_PREFIX}${String(postId)}`;

interface PersistedView {
  viewport?: Viewport;
  previewMode?: PreviewMode;
  contentLocale?: string;
}

/** Reads the per-post view settings. Everything is validated field by field; anything unexpected is ignored. */
export function readPersistedView(deps: ResolvedDeps): PersistedView {
  const raw = deps.storage.read(viewStorageKey(deps.bootstrap.postId));
  if (raw === null || raw.length > 1024) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
  const record = parsed as Record<string, unknown>;
  const result: PersistedView = {};
  const viewport = record['viewport'];
  if (typeof viewport === 'string' && (VIEWPORTS as readonly string[]).includes(viewport)) {
    result.viewport = viewport as Viewport;
  }
  const previewMode = record['previewMode'];
  if (previewMode === 'light' || previewMode === 'dark') result.previewMode = previewMode;
  const contentLocale = record['contentLocale'];
  if (typeof contentLocale === 'string' && deps.bootstrap.enabledLocales.includes(contentLocale)) {
    result.contentLocale = contentLocale;
  }
  return result;
}

/**
 * Initial content locale. The bootstrap locale wins only when the bootstrap says it was requested explicitly
 * (`contentLocaleExplicit`); otherwise the remembered per-post locale is used when it is still enabled, then the bootstrap
 * locale (itself the site default for a generic link).
 */
function initialContentLocale(deps: ResolvedDeps, persisted: PersistedView): string {
  const { contentLocale, defaultLocale, enabledLocales, contentLocaleExplicit } = deps.bootstrap;
  const valid = enabledLocales.includes(contentLocale) ? contentLocale : defaultLocale;
  if (contentLocaleExplicit === true && enabledLocales.includes(contentLocale)) return valid;
  return persisted.contentLocale ?? valid;
}

export const createSettingsSlice =
  (deps: ResolvedDeps): StateCreator<EditorState, [], [], SettingsSlice> =>
  (set, get) => {
    const persisted = readPersistedView(deps);
    const viewport = persisted.viewport ?? 'desktop';
    const remember = (): void => {
      const { viewport: v, previewMode, contentLocale } = get();
      deps.storage.write(
        viewStorageKey(deps.bootstrap.postId),
        JSON.stringify({ viewport: v, previewMode, contentLocale }),
      );
    };
    const geometry = (next: Viewport) => ({
      viewport: next,
      breakpointId: deps.breakpoints.viewports[next].breakpoint,
      viewportWidth: deps.breakpoints.viewports[next].width,
    });
    return {
      ...geometry(viewport),
      previewMode: persisted.previewMode ?? 'light',
      contentLocale: initialContentLocale(deps, persisted),
      panels: readPanelState(),
      setViewport(next) {
        if (!VIEWPORTS.includes(next) || get().viewport === next) return;
        set(geometry(next));
        remember();
      },
      setPreviewMode(mode) {
        if (!PREVIEW_MODES.includes(mode) || get().previewMode === mode) return;
        set({ previewMode: mode });
        remember();
      },
      setContentLocale(locale) {
        if (!deps.bootstrap.enabledLocales.includes(locale)) return false;
        if (get().contentLocale !== locale) {
          set({ contentLocale: locale });
          remember();
        }
        return true;
      },
      togglePanel(side) {
        const next = { ...get().panels, [side]: !get().panels[side] };
        set({ panels: next });
        writeStorage(PANELS_STORAGE_KEY, JSON.stringify(next)); // panels keep their own key and the global storage (panels.ts)
      },
    };
  };
