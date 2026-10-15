import {
  DirectionProvider,
  PortalContainerProvider,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TooltipProvider,
} from '@blixis/wp-editor-ui';
import { Lock } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { ElementNode } from '@blixis/wp-core';
import type { EditorBootstrap } from './bootstrap';
import { useChromeTheme, type ChromePreference } from './chrome-theme';
import { elementLabel } from './element-label';
import { Header } from './Header';
import { LoadStatus } from './LoadStatus';
import { createTranslator } from './i18n';
import { I18nProvider, useI18n } from './i18n-react';
import { StructurePanel } from './StructurePanel';
import { StoreProvider, useEditorStore, type EditorStore } from './state';

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
  preference,
  onPreference,
}: {
  bootstrap: EditorBootstrap;
  preference: ChromePreference;
  onPreference: (next: ChromePreference) => void;
}) {
  const { t } = useI18n();
  const panels = useEditorStore((state) => state.panels);
  const togglePanel = useEditorStore((state) => state.togglePanel);
  const contentLocale = useEditorStore((state) => state.contentLocale);
  const selectedId = useEditorStore((state) => state.selectedId);
  const document = useEditorStore((state) => state.document);
  const selected = useMemo(
    () => (selectedId === null ? null : findElement(document?.root, selectedId)),
    [selectedId, document],
  );
  const locked = !bootstrap.editingEnabled;
  return (
    <>
      <a className="blx-skip" href={`#${CANVAS_ID}`}>
        {t('skip.toCanvas')}
      </a>
      <div className="blx-top">
        <Header
          bootstrap={bootstrap}
          panels={panels}
          onTogglePanel={togglePanel}
          appearance={preference}
          onAppearance={onPreference}
          structureId={STRUCTURE_ID}
          inspectorId={INSPECTOR_ID}
        />
        {locked ? (
          <div role="status" className="blx-banner" data-testid="lock-banner">
            <Lock aria-hidden="true" className="me-2 inline size-4 align-text-bottom" />
            {t('lock.banner', { reason: bootstrap.lockReason ?? t('lock.default') })}
          </div>
        ) : null}
      </div>
      <div
        className="blx-body"
        data-left={panels.left ? 'open' : 'closed'}
        data-right={panels.right ? 'open' : 'closed'}
      >
        <nav
          id={STRUCTURE_ID}
          aria-label={t('panel.structure')}
          className="blx-panel blx-panel-left"
          hidden={!panels.left}
        >
          <h2 className="blx-panel-title">{t('panel.structure')}</h2>
          <StructurePanel />
        </nav>
        <main id={CANVAS_ID} tabIndex={-1} className="blx-main" aria-label={t('canvas.title')}>
          <LoadStatus />
          <div className="blx-canvas">
            <p>{t('canvas.placeholder')}</p>
            <p className="text-ed-fg-muted" data-testid="content-locale">
              {t('canvas.contentLocale', { locale: contentLocale })}
            </p>
          </div>
        </main>
        <aside
          id={INSPECTOR_ID}
          aria-label={t('panel.inspector')}
          className="blx-panel blx-panel-right"
          hidden={!panels.right}
        >
          <h2 className="blx-panel-title">{t('panel.inspector')}</h2>
          <p className="blx-empty" data-testid="inspector-selection">
            {selected === null ? (
              t('inspector.noSelection')
            ) : (
              <>
                <span className="sr-only">{t('inspector.selected')}: </span>
                <span className="font-medium">{elementLabel(selected.type)}</span>{' '}
                <span className="blx-outline-id">{selected.id}</span>
              </>
            )}
          </p>
          <Tabs defaultValue="content" className="min-h-0 flex-1">
            <TabsList aria-label={t('inspector.tabs')}>
              <TabsTrigger value="content">{t('inspector.content')}</TabsTrigger>
              <TabsTrigger value="style">{t('inspector.style')}</TabsTrigger>
              <TabsTrigger value="settings">{t('inspector.settings')}</TabsTrigger>
            </TabsList>
            <TabsContent value="content">
              <p className="blx-empty">{t('inspector.content.empty')}</p>
            </TabsContent>
            <TabsContent value="style">
              <p className="blx-empty">{t('inspector.style.empty')}</p>
            </TabsContent>
            <TabsContent value="settings">
              <p className="blx-empty">{t('inspector.settings.empty')}</p>
            </TabsContent>
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
export function EditorApp({ bootstrap, store }: { bootstrap: EditorBootstrap; store: EditorStore }) {
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const { preference, resolved, setPreference } = useChromeTheme();
  const { lang, dir } = createTranslator(bootstrap.editorLocale);
  useEffect(() => {
    const controller = new AbortController();
    void store.getState().loadDocument({ signal: controller.signal });
    return () => {
      controller.abort();
    };
  }, [store]);
  return (
    <div
      ref={setRoot}
      className="blx-editor"
      data-editor-theme={resolved}
      lang={lang}
      dir={dir}
      data-testid="editor-root"
    >
      <StoreProvider store={store}>
        <I18nProvider editorLocale={bootstrap.editorLocale}>
          <DirectionProvider dir={dir}>
            <PortalContainerProvider container={root}>
              <TooltipProvider>
                <Shell bootstrap={bootstrap} preference={preference} onPreference={setPreference} />
              </TooltipProvider>
            </PortalContainerProvider>
          </DirectionProvider>
        </I18nProvider>
      </StoreProvider>
    </div>
  );
}
