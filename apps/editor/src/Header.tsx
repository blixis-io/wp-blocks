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
} from '@blixis/wp-editor-ui';
import {
  ArrowLeft,
  Eye,
  Keyboard,
  Languages,
  Monitor,
  Moon,
  PanelLeft,
  PanelRight,
  Redo2,
  Save,
  Smartphone,
  SunMoon,
  Sun,
  Tablet,
  Undo2,
  Upload,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { EditorBootstrap } from './bootstrap';
import { CHROME_PREFERENCES, isChromePreference, type ChromePreference } from './chrome-theme';
import type { MessageKey } from './i18n';
import { useI18n } from './i18n-react';
import type { PanelState } from './panels';
import { ShortcutsDialog } from './ShortcutsDialog';
import { VIEWPORTS as VIEWPORT_IDS, useEditorStore, useEditorStoreApi, type Viewport } from './state';

const APPEARANCE_ICONS: Record<ChromePreference, ReactNode> = {
  system: <SunMoon aria-hidden="true" className="size-4" />,
  light: <Sun aria-hidden="true" className="size-4" />,
  dark: <Moon aria-hidden="true" className="size-4" />,
};

const VIEWPORTS = [
  { id: 'desktop', label: 'header.viewport.desktop', icon: <Monitor aria-hidden="true" className="size-4" /> },
  { id: 'tablet', label: 'header.viewport.tablet', icon: <Tablet aria-hidden="true" className="size-4" /> },
  { id: 'mobile', label: 'header.viewport.mobile', icon: <Smartphone aria-hidden="true" className="size-4" /> },
] as const satisfies readonly { id: string; label: MessageKey; icon: ReactNode }[];

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
          <ArrowLeft aria-hidden="true" className={`${icon} rtl:-scale-x-100`} />
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
          <PanelLeft aria-hidden="true" className={icon} />
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
            <Undo2 aria-hidden="true" className={icon} />
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
            <Redo2 aria-hidden="true" className={icon} />
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
                {item.icon}
              </ToolbarToggleItem>
            </Hint>
          ))}
        </ToolbarToggleGroup>
        <ToolbarSeparator />
        {bootstrap.viewUrl === null ? (
          <Hint text={t('header.preview.unavailable')}>
            <ToolbarButton variant="outline" disabled>
              <Eye aria-hidden="true" className={icon} />
              {t('header.preview')}
            </ToolbarButton>
          </Hint>
        ) : (
          <ToolbarLink variant="outline" href={bootstrap.viewUrl} target="_blank" rel="noopener noreferrer">
            <Eye aria-hidden="true" className={icon} />
            {t('header.preview')}
          </ToolbarLink>
        )}
        <Hint text={t('header.save.hint')}>
          <ToolbarButton variant="secondary" disabled>
            <Save aria-hidden="true" className={icon} />
            {t('header.save')}
          </ToolbarButton>
        </Hint>
        <Hint text={t('header.publish.hint')}>
          <ToolbarButton variant="default" disabled>
            <Upload aria-hidden="true" className={icon} />
            {t('header.publish')}
          </ToolbarButton>
        </Hint>
        <ToolbarSeparator />
        <ShortcutsDialog
          trigger={
            <ToolbarButton size="icon" aria-label={t('header.shortcuts')}>
              <Keyboard aria-hidden="true" className={icon} />
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
              {APPEARANCE_ICONS[preference]}
            </ToolbarToggleItem>
          ))}
        </ToolbarToggleGroup>
        <span className="blx-chip">
          <Languages aria-hidden="true" className="size-3.5" />
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
          <PanelRight aria-hidden="true" className={icon} />
        </ToolbarButton>
      </Toolbar>
    </header>
  );
}
