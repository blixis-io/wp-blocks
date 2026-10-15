import {
  DirectionProvider,
  PortalContainerProvider,
  ScrollArea,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TooltipProvider,
} from '@blixis/wp-editor-ui';
import { Lock } from 'lucide-react';
import { useState } from 'react';
import type { EditorBootstrap } from './bootstrap';
import { useChromeTheme, type ChromePreference } from './chrome-theme';
import { Header } from './Header';
import { createTranslator } from './i18n';
import { I18nProvider, useI18n } from './i18n-react';
import { usePanelState } from './panels';

const STRUCTURE_ID = 'blx-structure';
const INSPECTOR_ID = 'blx-inspector';
export const CANVAS_ID = 'blx-canvas';

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
  const { state: panels, toggle } = usePanelState();
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
          onTogglePanel={toggle}
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
          <ScrollArea label={t('panel.structure')} className="min-h-0 flex-1">
            <p className="blx-empty">{t('panel.structure.empty')}</p>
          </ScrollArea>
        </nav>
        <main id={CANVAS_ID} tabIndex={-1} className="blx-main" aria-label={t('canvas.title')}>
          <div className="blx-canvas">
            <p>{t('canvas.placeholder')}</p>
            <p className="text-ed-fg-muted" data-testid="content-locale">
              {t('canvas.contentLocale', { locale: bootstrap.contentLocale })}
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
export function EditorApp({ bootstrap }: { bootstrap: EditorBootstrap }) {
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const { preference, resolved, setPreference } = useChromeTheme();
  const { lang, dir } = createTranslator(bootstrap.editorLocale);
  return (
    <div
      ref={setRoot}
      className="blx-editor"
      data-editor-theme={resolved}
      lang={lang}
      dir={dir}
      data-testid="editor-root"
    >
      <I18nProvider editorLocale={bootstrap.editorLocale}>
        <DirectionProvider dir={dir}>
          <PortalContainerProvider container={root}>
            <TooltipProvider>
              <Shell bootstrap={bootstrap} preference={preference} onPreference={setPreference} />
            </TooltipProvider>
          </PortalContainerProvider>
        </DirectionProvider>
      </I18nProvider>
    </div>
  );
}
