import {
  DirectionProvider,
  PortalContainerProvider,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TooltipProvider,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  PanelToggleIcon,
  Icon,
} from '@blixis/wp-editor-ui';
import type { RestClient } from './api/types';
import type { CanvasMessage } from '@blixis/wp-canvas-bridge';
import { Canvas, PreviewAppearance, type CanvasTestOptions } from './canvas/Canvas';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { findPath, nodeAt, type ElementNode, type RichText } from '@blixis/wp-core';
import type { EditorBootstrap } from './bootstrap';
import { useChromeTheme, type ChromePreference } from './chrome-theme';
import { elementLabel } from './element-label';
import { Header } from './Header';
import { LoadStatus } from './LoadStatus';
import { createTranslator } from './i18n';
import { I18nProvider, useI18n } from './i18n-react';
import { StructurePanel } from './StructurePanel';
import { StoreProvider, useEditorStore, useEditorStoreApi, type EditorStore } from './state';
import { Inspector } from './inspector/Inspector';
import { readSessionStorage, writeSessionStorage } from './storage';
import { ElementId } from './ElementId';
import { MediaProvider } from './media/MediaContext';
import type { MediaClient } from './api/types';

const STRUCTURE_ID = 'blx-structure';
const INSPECTOR_ID = 'blx-inspector';
export const CANVAS_ID = 'blx-canvas';

/** Finds an element by id (iterative, the tree is untrusted-shaped). */
function findElement(root: readonly ElementNode[] | undefined, id: string): ElementNode | null {
  const stack = [...(root ?? [])];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) break;
    if (node.id === id) return node;
    stack.push(...node.children);
  }
  return null;
}

function Shell({
  bootstrap,
  client,
  canvas,
  preference,
  onPreference,
  dir,
}: {
  bootstrap: EditorBootstrap;
  client: RestClient | undefined;
  canvas: CanvasTestOptions | undefined;
  preference: ChromePreference;
  onPreference: (next: ChromePreference) => void;
  dir: 'ltr' | 'rtl';
}) {
  const { t } = useI18n();
  const [inspectorTab, setInspectorTab] = useState<'content' | 'style' | 'advanced'>(() => {
    const saved = readSessionStorage('blixis-inspector-tab');
    return saved === 'style' || saved === 'advanced' ? saved : 'content';
  });
  const [rightTab, setRightTab] = useState<'page' | 'block'>('page');
  const [editTarget, setEditTarget] = useState<{
    id: string;
    prop: string;
    status: 'loading' | 'ready';
    value?: string | RichText;
  } | null>(null);
  // The Selected Text section and the Text Formatting row live on the Content tab: show it while an edit session runs
  // unless the user picks another tab during that session (the remembered tab preference is left untouched).
  const editingId = editTarget?.id;
  const [tabPickedDuringEdit, setTabPickedDuringEdit] = useState<string | null>(null);
  const shownTab = editingId !== undefined && tabPickedDuringEdit !== editingId ? 'content' : inspectorTab;
  const [inlineEditing, setInlineEditing] = useState(() => readSessionStorage('blixis-inline-editing') !== 'false');
  const [editSelection, setEditSelection] = useState<Extract<CanvasMessage, { type: 'edit-selection' }> | null>(null);
  const [tokenColors, setTokenColors] = useState<Partial<Record<'light' | 'dark', Readonly<Record<string, string>>>>>(
    {},
  );
  const [sendEditCommand, setSendEditCommand] = useState<(name: string, args?: Record<string, unknown>) => void>(
    () => () => undefined,
  );
  const [startEdit, setStartEdit] = useState<(id: string, prop: string, focus?: boolean) => void>(
    () => () => undefined,
  );
  const [setEditText, setSetEditText] = useState<(text: string) => void>(() => () => undefined);
  const [endEdit, setEndEdit] = useState<(commit: boolean) => void>(() => () => undefined);
  const registerEditCommand = useCallback((send: (name: string, args?: Record<string, unknown>) => void) => {
    setSendEditCommand(() => send);
  }, []);
  const registerEditStart = useCallback((start: (id: string, prop: string, focus?: boolean) => void) => {
    setStartEdit(() => start);
  }, []);
  const registerEditText = useCallback((setText: (text: string) => void) => {
    setSetEditText(() => setText);
  }, []);
  const registerEditEnd = useCallback((end: (commit: boolean) => void) => {
    setEndEdit(() => end);
  }, []);
  const store = useEditorStoreApi();
  useEffect(() => {
    const showContent = (event: Event) => {
      setInspectorTab('content');
      setTabPickedDuringEdit(store.getState().selectedId);
      const field = (event as CustomEvent<{ field?: string }>).detail.field;
      if (field) {
        requestAnimationFrame(() => {
          globalThis.document.querySelector<HTMLInputElement>(`[name="${field}"]`)?.focus();
        });
      }
    };
    globalThis.document.addEventListener('blixis:inspector-content', showContent);
    return () => {
      globalThis.document.removeEventListener('blixis:inspector-content', showContent);
    };
  }, [store]);
  const panels = useEditorStore((state) => state.panels);
  const togglePanel = useEditorStore((state) => state.togglePanel);
  const [visiblePanels, setVisiblePanels] = useState(panels);
  const handleTogglePanel = (side: keyof typeof panels) => {
    const willClose = panels[side];
    const panel = globalThis.document.getElementById(side === 'left' ? STRUCTURE_ID : INSPECTOR_ID);
    if (willClose && panel?.contains(globalThis.document.activeElement)) {
      globalThis.document.getElementById(CANVAS_ID)?.focus();
    }
    if (!willClose) setVisiblePanels((visible) => ({ ...visible, [side]: true }));
    togglePanel(side);
  };
  const contentLocale = useEditorStore((state) => state.contentLocale);
  const selectedId = useEditorStore((state) => state.selectedId);
  const document = useEditorStore((state) => state.document);
  const selected = useMemo(
    () => (selectedId === null ? null : findElement(document?.root, selectedId)),
    [selectedId, document],
  );
  const previousSelected = useRef<string | null>(selectedId);
  useEffect(() => {
    if (previousSelected.current !== selectedId) setRightTab(selectedId === null ? 'page' : 'block');
    previousSelected.current = selectedId;
  }, [selectedId]);
  const breadcrumb = useMemo(() => {
    if (selectedId === null || document === null) return [];
    const path = findPath(document.root, selectedId);
    return (
      path
        ?.map((_, index) => nodeAt(document.root, path.slice(0, index + 1)))
        .filter((node): node is ElementNode => node !== undefined) ?? []
    );
  }, [selectedId, document]);
  const saveLocked = useEditorStore((state) => state.saveLocked);
  const locked = !bootstrap.editingEnabled || saveLocked;
  const openPageSettings = () => {
    setRightTab('page');
    if (!panels.right) {
      setVisiblePanels((visible) => ({ ...visible, right: true }));
      togglePanel('right');
    }
    window.requestAnimationFrame(() => globalThis.document.getElementById('page-title')?.focus());
  };
  return (
    <>
      <a className="blx-skip" href={`#${CANVAS_ID}`}>
        {t('skip.toCanvas')}
      </a>
      <div className="blx-top">
        <Header
          bootstrap={bootstrap}
          panels={panels}
          onTogglePanel={handleTogglePanel}
          appearance={preference}
          onAppearance={onPreference}
          onPageSettings={openPageSettings}
          inlineEditActive={editTarget !== null}
        />
        {locked ? (
          <div role="status" className="blx-banner" data-testid="lock-banner">
            <Icon name="lock" className="me-2 inline size-4 align-text-bottom" />
            {t('lock.banner', { reason: bootstrap.lockReason ?? t('lock.default') })}
          </div>
        ) : null}
      </div>
      <div
        className="blx-body"
        data-left={panels.left ? 'open' : 'closed'}
        data-right={panels.right ? 'open' : 'closed'}
      >
        {!panels.left ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="blx-reopen-panel blx-reopen-left ed-focus-ring"
                aria-label={t('panel.structure.toggle')}
                aria-controls={STRUCTURE_ID}
                aria-expanded={false}
                onClick={() => {
                  handleTogglePanel('left');
                }}
              >
                <span className="blx-rail-icon">
                  <PanelToggleIcon side="start" open={false} dir={dir} />
                </span>
                <span className="blx-rail-label">{t('panel.structure')}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent>{t('panel.expand')}</TooltipContent>
          </Tooltip>
        ) : null}
        {!panels.right ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="blx-reopen-panel blx-reopen-right ed-focus-ring"
                aria-label={t('panel.inspector.toggle')}
                aria-controls={INSPECTOR_ID}
                aria-expanded={false}
                onClick={() => {
                  handleTogglePanel('right');
                }}
              >
                <span className="blx-rail-icon">
                  <PanelToggleIcon side="end" open={false} dir={dir} />
                </span>
                <span className="blx-rail-label">{t('panel.inspector')}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent>{t('panel.expand')}</TooltipContent>
          </Tooltip>
        ) : null}
        <nav
          id={STRUCTURE_ID}
          aria-label={t('panel.structure')}
          className="blx-panel blx-panel-left"
          aria-hidden={!panels.left || undefined}
          inert={!panels.left}
          hidden={!visiblePanels.left}
          onTransitionEnd={(event) => {
            if (event.target === event.currentTarget && !panels.left) {
              setVisiblePanels((visible) => ({ ...visible, left: false }));
            }
          }}
        >
          <StructurePanel
            editingEnabled={!locked}
            onCollapse={() => {
              handleTogglePanel('left');
            }}
            expanded={panels.left}
          />
        </nav>
        <main id={CANVAS_ID} tabIndex={-1} className="blx-main" aria-label={t('canvas.title')}>
          <LoadStatus />
          {bootstrap.canvasUrl !== undefined && bootstrap.canvasUrl !== null && client !== undefined ? (
            <>
              <div className="blx-stage-bar" data-testid="canvas-breadcrumb-bar">
                <nav key="canvas-breadcrumb" aria-label={t('canvas.breadcrumb')} className="blx-stage-crumbs">
                  <button
                    key="breadcrumb-home"
                    type="button"
                    className="blx-breadcrumb-home ed-focus-ring"
                    aria-label={t('canvas.selection.home')}
                    aria-current={selectedId === null ? 'location' : undefined}
                    onClick={() => store.getState().select(null)}
                  >
                    <Icon name="home" size={15} />
                  </button>
                  <ol className="blx-breadcrumb">
                    {breadcrumb.map((node) => (
                      <li key={node.id}>
                        <Icon name="caretRight" size={13} mirrorInRtl />
                        <button
                          type="button"
                          className="blx-breadcrumb-item ed-focus-ring"
                          aria-current={node.id === selectedId ? 'location' : undefined}
                          onClick={() => store.getState().select(node.id)}
                        >
                          {elementLabel(node.type, t)} <ElementId id={node.id} />
                        </button>
                      </li>
                    ))}
                  </ol>
                </nav>
                <PreviewAppearance />
              </div>
              <Canvas
                canvasUrl={bootstrap.canvasUrl}
                client={client}
                selected={selected}
                editingEnabled={!locked}
                inlineEditing={inlineEditing}
                onEditSessionChange={setEditTarget}
                onEditSelectionChange={setEditSelection}
                onTokenColorsChange={setTokenColors}
                onEditCommandApiChange={registerEditCommand}
                onEditStartApiChange={registerEditStart}
                onEditTextApiChange={registerEditText}
                onEditEndApiChange={registerEditEnd}
                {...canvas}
              />
            </>
          ) : (
            <div className="blx-canvas">
              <p>{t('canvas.placeholder')}</p>
              <p className="text-ed-fg-muted" data-testid="content-locale">
                {t('canvas.contentLocale', { locale: contentLocale })}
              </p>
            </div>
          )}
        </main>
        <aside
          id={INSPECTOR_ID}
          aria-labelledby="blx-inspector-label"
          className="blx-panel blx-panel-right"
          aria-hidden={!panels.right || undefined}
          inert={!panels.right}
          hidden={!visiblePanels.right}
          onTransitionEnd={(event) => {
            if (event.target === event.currentTarget && !panels.right) {
              setVisiblePanels((visible) => ({ ...visible, right: false }));
            }
          }}
        >
          <span className="sr-only" id="blx-inspector-label">
            {t('panel.inspector')}
          </span>
          <span className="sr-only" data-testid="inspector-selection" aria-live="polite">
            {selected ? `${t('inspector.selected')}: ${elementLabel(selected.type, t)} ${selected.id}` : ''}
          </span>
          <Tabs
            value={rightTab}
            onValueChange={(value) => {
              if (value === 'page' || value === 'block') setRightTab(value);
            }}
            className="blx-right-tabs"
          >
            <div className="blx-panel-tabbar">
              <TabsList aria-label={t('panel.inspector')} className="blx-right-tabs-list">
                <TabsTrigger value="page">{t('inspector.tab.page')}</TabsTrigger>
                {selected ? <TabsTrigger value="block">{t('inspector.tab.block')}</TabsTrigger> : null}
              </TabsList>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="blx-collapse-button ed-focus-ring"
                    aria-label={t('panel.inspector.toggle')}
                    aria-controls={INSPECTOR_ID}
                    aria-expanded={panels.right}
                    onClick={() => {
                      handleTogglePanel('right');
                    }}
                  >
                    <PanelToggleIcon side="end" open dir={dir} />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{t('panel.collapse')}</TooltipContent>
              </Tooltip>
            </div>
            <TabsContent value="page" className="blx-page-inspector-body">
              <Inspector element={null} tab="content" editingEnabled={!locked} />
            </TabsContent>
            {selected ? (
              <TabsContent value="block" className="blx-inspector-tabs">
                <div className="blx-inspector-selection">
                  <span className="font-medium">{elementLabel(selected.type, t)}</span>{' '}
                  <ElementId id={selected.id} tooltip={false} />
                </div>
                <Tabs
                  value={shownTab}
                  onValueChange={(value) => {
                    if (value === 'content' || value === 'style' || value === 'advanced') {
                      setInspectorTab(value);
                      setTabPickedDuringEdit(editingId ?? null);
                      writeSessionStorage('blixis-inspector-tab', value);
                    }
                  }}
                  className="blx-inspector-subtabs"
                >
                  <TabsList aria-label={t('inspector.tabs')}>
                    <TabsTrigger value="content">{t('inspector.content')}</TabsTrigger>
                    <TabsTrigger value="style">{t('inspector.style')}</TabsTrigger>
                    <TabsTrigger value="advanced">{t('inspector.advanced')}</TabsTrigger>
                  </TabsList>
                  <TabsContent value="content">
                    <Inspector
                      element={selected}
                      tab="content"
                      editingEnabled={!locked}
                      editTarget={editTarget}
                      editSelection={editSelection}
                      tokenColors={tokenColors}
                      sendEditCommand={sendEditCommand}
                      setEditText={setEditText}
                      endEdit={endEdit}
                      inlineEditing={inlineEditing}
                      onInlineEditingChange={(value) => {
                        setInlineEditing(value);
                        writeSessionStorage('blixis-inline-editing', String(value));
                      }}
                      startEdit={(id, prop, focus) => {
                        setInspectorTab('content');
                        startEdit(id, prop, focus);
                      }}
                    />
                  </TabsContent>
                  <TabsContent value="style">
                    <Inspector element={selected} tab="style" editingEnabled={!locked} />
                  </TabsContent>
                  <TabsContent value="advanced">
                    <Inspector element={selected} tab="advanced" editingEnabled={!locked} />
                  </TabsContent>
                </Tabs>
              </TabsContent>
            ) : null}
          </Tabs>
        </aside>
      </div>
    </>
  );
}

/**
 * The editor root. `data-editor-theme`, `lang` and `dir` live on this element only (never on `<html>`), and they come
 * from the EDITOR chrome preference and EDITOR locale; the content locale is only displayed in the canvas.
 */
export function EditorApp({
  bootstrap,
  store,
  client,
  canvas,
  mediaClient,
}: {
  bootstrap: EditorBootstrap;
  store: EditorStore;
  /** The REST client of this session. Without it (or without `bootstrap.canvasUrl`) the canvas shows a placeholder. */
  client?: RestClient;
  /** Test seams of the canvas session. */
  canvas?: CanvasTestOptions;
  mediaClient?: MediaClient;
}) {
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const attachRoot = useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    setRoot(node);
  }, []);
  const { preference, resolved, setPreference } = useChromeTheme();
  const { lang, dir } = createTranslator(bootstrap.editorLocale);
  useEffect(() => {
    const mountedRoot = rootRef.current;
    if (!mountedRoot) return;
    if (typeof window.matchMedia !== 'function') {
      mountedRoot.dataset['reducedMotion'] = 'false';
      mountedRoot.dataset['motionReady'] = 'true';
      return;
    }
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      mountedRoot.dataset['reducedMotion'] = String(media.matches);
    };
    media.addEventListener('change', update);
    mountedRoot.dataset['motionReady'] = 'true';
    update();
    return () => {
      media.removeEventListener('change', update);
    };
  }, [root]);
  useEffect(() => {
    const controller = new AbortController();
    void store.getState().loadDocument({ signal: controller.signal });
    return () => {
      controller.abort();
    };
  }, [store]);
  return (
    <div
      ref={attachRoot}
      className="blx-editor"
      data-editor-theme={resolved}
      lang={lang}
      dir={dir}
      data-testid="editor-root"
    >
      <StoreProvider store={store}>
        <MediaProvider bootstrap={bootstrap} client={mediaClient}>
          <I18nProvider editorLocale={bootstrap.editorLocale}>
            <DirectionProvider dir={dir}>
              <PortalContainerProvider container={root}>
                <TooltipProvider>
                  <Shell
                    bootstrap={bootstrap}
                    client={client}
                    canvas={canvas}
                    preference={preference}
                    onPreference={setPreference}
                    dir={dir}
                  />
                </TooltipProvider>
              </PortalContainerProvider>
            </DirectionProvider>
          </I18nProvider>
        </MediaProvider>
      </StoreProvider>
    </div>
  );
}
