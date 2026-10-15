import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  Toolbar,
  ToolbarButton,
  ToolbarLink,
  ToolbarSeparator,
  ToolbarToggleGroup,
  ToolbarToggleItem,
  VisuallyHidden,
  Icon,
  type IconName,
} from '@blixis/wp-editor-ui';

import type { ReactNode } from 'react';
import type { EditorBootstrap } from './bootstrap';
import { CHROME_PREFERENCES, isChromePreference, type ChromePreference } from './chrome-theme';
import type { MessageKey } from './i18n';
import { useI18n } from './i18n-react';
import type { PanelState } from './panels';
import { ShortcutsDialog } from './ShortcutsDialog';
import { VIEWPORTS as VIEWPORT_IDS, useEditorStore, useEditorStoreApi, type Viewport } from './state';

const APPEARANCE_ICONS: Record<ChromePreference, IconName> = {
  system: 'system',
  light: 'light',
  dark: 'dark',
};

const VIEWPORTS = [
  { id: 'desktop', label: 'header.viewport.desktop', icon: 'desktop' },
  { id: 'tablet', label: 'header.viewport.tablet', icon: 'tablet' },
  { id: 'mobile', label: 'header.viewport.mobile', icon: 'mobile' },
] as const satisfies readonly { id: string; label: MessageKey; icon: IconName }[];

interface HeaderProps {
  bootstrap: EditorBootstrap;
  panels: PanelState;
  onTogglePanel: (side: keyof PanelState) => void;
  appearance: ChromePreference;
  onAppearance: (next: ChromePreference) => void;
  structureId: string;
  inspectorId: string;
}

/** Wraps a toolbar control in a tooltip that also opens on keyboard focus. */
function Hint({ text, children }: { text: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  );
}

export function Header({
  bootstrap,
  panels,
  onTogglePanel,
  appearance,
  onAppearance,
  structureId,
  inspectorId,
}: HeaderProps) {
  const { t, locale } = useI18n();
  const store = useEditorStoreApi();
  const viewport = useEditorStore((state) => state.viewport);
  const contentLocale = useEditorStore((state) => state.contentLocale);
  const canUndo = useEditorStore((state) => state.canUndo);
  const canRedo = useEditorStore((state) => state.canRedo);
  const title = bootstrap.postTitle.trim() === '' ? t('header.untitled') : bootstrap.postTitle;
  const structureLabel = t('panel.structure.toggle');
  const inspectorLabel = t('panel.inspector.toggle');
  const icon = 'size-4';

  return (
    <header role="banner" className="blx-header">
      <Toolbar aria-label={t('header.toolbar')}>
        <ToolbarLink href={bootstrap.adminUrl}>
          <Icon name="back" className={icon} mirrorInRtl />
          {t('header.back')}
        </ToolbarLink>
        <ToolbarSeparator />
        <ToolbarButton
          size="icon"
          aria-label={structureLabel}
          aria-expanded={panels.left}
          aria-controls={structureId}
          onClick={() => {
            onTogglePanel('left');
          }}
        >
          <Icon name="panelLeft" className={icon} />
        </ToolbarButton>
        <span className="blx-title">
          <span className="blx-title-text">{title}</span>
          <span className="blx-chip">
            <VisuallyHidden>{`${t('header.contentLocale')}: `}</VisuallyHidden>
            {contentLocale}
          </span>
        </span>
        <span className="blx-spacer" />
        <Hint text={t('header.undo.hint')}>
          <ToolbarButton
            size="icon"
            disabled={!canUndo}
            aria-label={t('header.undo')}
            onClick={() => {
              store.getState().undo();
            }}
          >
            <Icon name="undo" className={icon} />
          </ToolbarButton>
        </Hint>
        <Hint text={t('header.redo.hint')}>
          <ToolbarButton
            size="icon"
            disabled={!canRedo}
            aria-label={t('header.redo')}
            onClick={() => {
              store.getState().redo();
            }}
          >
            <Icon name="refresh" className={icon} />
          </ToolbarButton>
        </Hint>
        <ToolbarSeparator />
        <ToolbarToggleGroup
          type="single"
          value={viewport}
          onValueChange={(value) => {
            if ((VIEWPORT_IDS as readonly string[]).includes(value)) store.getState().setViewport(value as Viewport);
          }}
          aria-label={t('header.viewport')}
        >
          {VIEWPORTS.map((item) => (
            <Hint key={item.id} text={t('header.viewport.hint')}>
              <ToolbarToggleItem value={item.id} size="icon" aria-label={t(item.label)}>
                <Icon name={item.icon} />
              </ToolbarToggleItem>
            </Hint>
          ))}
        </ToolbarToggleGroup>
        <ToolbarSeparator />
        {bootstrap.viewUrl === null ? (
          <Hint text={t('header.preview.unavailable')}>
            <ToolbarButton variant="outline" disabled>
              <Icon name="preview" className={icon} />
              {t('header.preview')}
            </ToolbarButton>
          </Hint>
        ) : (
          <ToolbarLink variant="outline" href={bootstrap.viewUrl} target="_blank" rel="noopener noreferrer">
            <Icon name="preview" className={icon} />
            {t('header.preview')}
          </ToolbarLink>
        )}
        <Hint text={t('header.save.hint')}>
          <ToolbarButton variant="secondary" disabled>
            <Icon name="save" className={icon} />
            {t('header.save')}
          </ToolbarButton>
        </Hint>
        <Hint text={t('header.publish.hint')}>
          <ToolbarButton variant="default" disabled>
            <Icon name="publish" className={icon} />
            {t('header.publish')}
          </ToolbarButton>
        </Hint>
        <ToolbarSeparator />
        <ShortcutsDialog
          trigger={
            <ToolbarButton size="icon" aria-label={t('header.shortcuts')}>
              <Icon name="shortcuts" className={icon} />
            </ToolbarButton>
          }
        />
        <ToolbarToggleGroup
          type="single"
          value={appearance}
          onValueChange={(value) => {
            if (isChromePreference(value)) onAppearance(value);
          }}
          aria-label={`${t('header.appearance')}. ${t('header.appearance.hint')}`}
        >
          {CHROME_PREFERENCES.map((preference) => (
            <ToolbarToggleItem
              key={preference}
              value={preference}
              size="icon"
              aria-label={t(`appearance.${preference}`)}
            >
              <Icon name={APPEARANCE_ICONS[preference]} className={icon} />
            </ToolbarToggleItem>
          ))}
        </ToolbarToggleGroup>
        <span className="blx-chip">
          <Icon name="language" size={14} />
          <VisuallyHidden>{`${t('header.editorLanguage')}: `}</VisuallyHidden>
          {locale}
        </span>
        <ToolbarButton
          size="icon"
          aria-label={inspectorLabel}
          aria-expanded={panels.right}
          aria-controls={inspectorId}
          onClick={() => {
            onTogglePanel('right');
          }}
        >
          <Icon name="panelRight" className={icon} />
        </ToolbarButton>
      </Toolbar>
    </header>
  );
}
