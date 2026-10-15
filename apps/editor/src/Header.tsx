import {
  Icon,
  Menu,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  Toolbar,
  ToolbarButton,
  ToolbarLink,
  ToolbarSeparator,
  ToolbarToggleGroup,
  ToolbarToggleItem,
  type IconName,
} from '@blixis/wp-editor-ui';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { EditorBootstrap } from './bootstrap';
import { CHROME_PREFERENCES, type ChromePreference } from './chrome-theme';
import type { MessageKey } from './i18n';
import { useI18n } from './i18n-react';
import type { PanelState } from './panels';
import { ShortcutsDialog } from './ShortcutsDialog';
import { VIEWPORTS as VIEWPORT_IDS, useEditorStore, useEditorStoreApi, type Viewport } from './state';

const APPEARANCE_ICONS: Record<ChromePreference, IconName> = { system: 'system', light: 'light', dark: 'dark' };
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
}
function Hint({ text, children }: { text: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  );
}
function validLocalUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw, location.origin);
    return url.origin === location.origin &&
      ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
function relativeSaved(now: number, saved: number, locale: string): string {
  const seconds = Math.max(0, Math.floor((now - saved) / 1000));
  const [value, unit] =
    seconds < 60
      ? [seconds, 'second']
      : seconds < 3600
        ? [Math.floor(seconds / 60), 'minute']
        : [Math.floor(seconds / 3600), 'hour'];
  const text = new Intl.RelativeTimeFormat(locale.replace('_', '-'), { numeric: 'auto', style: 'long' }).format(
    -value,
    unit as Intl.RelativeTimeFormatUnit,
  );
  return text;
}

export function Header({ bootstrap, panels, onTogglePanel, appearance, onAppearance }: HeaderProps) {
  const { t, locale } = useI18n();
  const store = useEditorStoreApi();
  const viewport = useEditorStore((state) => state.viewport);
  const contentLocale = useEditorStore((state) => state.contentLocale);
  const canUndo = useEditorStore((state) => state.canUndo);
  const canRedo = useEditorStore((state) => state.canRedo);
  const dirty = useEditorStore((state) => state.dirty);
  const [savedAt, setSavedAt] = useState(0);
  const [now, setNow] = useState(0);
  const [width, setWidth] = useState(() => (typeof window === 'undefined' ? 1200 : window.innerWidth));
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  useEffect(() => {
    const resize = () => {
      setWidth(window.innerWidth);
    };
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
    };
  }, []);
  useEffect(() => {
    const unsubscribe = store.subscribe((state, previous) => {
      const clean = !state.dirty.layout && !Object.values(state.dirty.content).some(Boolean);
      const loaded = state.status === 'ready' && previous.status !== 'ready';
      const saved = state.savedDocument !== previous.savedDocument;
      if (clean && (loaded || saved)) setSavedAt(Date.now());
    });
    return () => {
      unsubscribe();
    };
  }, [store]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 30_000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);
  const relative = useMemo(
    () => (savedAt === 0 ? t('header.time.now') : relativeSaved(now, savedAt, locale)),
    [now, savedAt, locale, t],
  );
  const viewUrl = validLocalUrl(bootstrap.viewUrl);
  const pagesUrl = validLocalUrl(new URL('edit.php', bootstrap.adminUrl).href);
  const title = bootstrap.postTitle.trim() === '' ? t('header.untitled') : bootstrap.postTitle;
  const icon = 'size-4';
  const appearanceItems = CHROME_PREFERENCES.map((preference) => ({
    label: t(`appearance.${preference}`),
    checked: appearance === preference,
    role: 'menuitemradio' as const,
    onSelect: () => {
      onAppearance(preference);
    },
    icon: <Icon name={APPEARANCE_ICONS[preference]} size={15} />,
  }));
  const overflowItems = [
    {
      label: t('header.shortcuts'),
      icon: <Icon name="shortcuts" size={15} />,
      onSelect: () => {
        setShortcutsOpen(true);
      },
    },
    {
      label: t('panel.structure.toggle'),
      checked: panels.left,
      onSelect: () => {
        onTogglePanel('left');
      },
    },
    {
      label: t('panel.inspector.toggle'),
      checked: panels.right,
      onSelect: () => {
        onTogglePanel('right');
      },
    },
    ...appearanceItems.map((item) => ({ ...item, label: `${t('header.appearance')}: ${item.label}` })),
    { label: `${t('header.contentLocale')}: ${contentLocale}`, disabled: true },
    { label: `${t('header.editorLanguage')}: ${locale}`, disabled: true },
    { label: t('header.back'), href: bootstrap.adminUrl, icon: <Icon name="back" size={15} mirrorInRtl /> },
    ...(width < 900
      ? [
          {
            label: t('header.preview'),
            href: viewUrl ?? undefined,
            disabled: viewUrl === null,
            describedBy: viewUrl === null ? 'blx-preview-hint' : undefined,
            icon: <Icon name="preview" size={15} />,
          },
          {
            label: t('header.saveDraft'),
            disabled: true,
            describedBy: 'blx-save-hint',
            icon: <Icon name="save" size={15} />,
          },
          {
            label: t('header.publish'),
            disabled: true,
            describedBy: 'blx-publish-hint',
            icon: <Icon name="publish" size={15} />,
          },
        ]
      : []),
    ...(width < 520
      ? [
          {
            label: t('header.undo'),
            disabled: !canUndo,
            describedBy: 'blx-undo-hint',
            icon: <Icon name="undo" size={15} mirrorInRtl />,
            onSelect: () => {
              store.getState().undo();
            },
          },
          {
            label: t('header.redo'),
            disabled: !canRedo,
            describedBy: 'blx-redo-hint',
            icon: <Icon name="redo" size={15} mirrorInRtl />,
            onSelect: () => {
              store.getState().redo();
            },
          },
        ]
      : []),
  ];
  return (
    <header
      role="banner"
      className="blx-header"
      data-compact={width < 1100}
      data-narrow={width < 900}
      data-tiny={width < 520}
    >
      <Toolbar aria-label={t('header.toolbar')} className="blx-header-toolbar">
        <div className="blx-header-start">
          <a className="blx-brand" href={bootstrap.adminUrl} aria-label={t('header.brand')}>
            <svg viewBox="0 0 24 24" aria-hidden="true" className="blx-brand-mark">
              <path d="M4 3v18l15-9L4 3Z" fill="currentColor" />
              <path d="M7 7v10l8-5-8-5Z" fill="var(--ed-header)" />
            </svg>
            <strong>Blixis</strong>
          </a>
          <ToolbarSeparator />
          <Menu
            label={t('header.pages')}
            items={[
              { label: t('header.allPages'), href: pagesUrl ?? undefined, disabled: pagesUrl === null },
              { label: t('header.back'), href: bootstrap.adminUrl },
            ]}
            className="blx-menu-control"
            toolbarTrigger
          >
            <span>
              <Icon name="pages" size={15} /> <span className="blx-pages-label">{t('header.pages')}</span>{' '}
              <Icon name="chevronDown" size={14} />
            </span>
          </Menu>
          <ToolbarSeparator />
          <span className="blx-header-title">
            <strong className="blx-title-text">{title}</strong>
            <span className="blx-saved">
              <i aria-hidden="true" />
              {dirty.layout || Object.values(dirty.content).some(Boolean)
                ? t('header.unsaved')
                : t('header.saved', { time: relative })}
            </span>
          </span>
        </div>
        <ToolbarToggleGroup
          type="single"
          value={viewport}
          onValueChange={(value) => {
            if ((VIEWPORT_IDS as readonly string[]).includes(value)) store.getState().setViewport(value as Viewport);
          }}
          aria-label={t('header.viewport')}
          className="blx-viewport-switcher"
        >
          {VIEWPORTS.map((item) => (
            <ToolbarToggleItem key={item.id} value={item.id} size="icon" aria-label={t(item.label)}>
              <Icon name={item.icon} className={icon} />
            </ToolbarToggleItem>
          ))}
        </ToolbarToggleGroup>
        <div className="blx-header-end">
          <Hint text={t('header.undo.hint')}>
            <ToolbarButton
              size="icon"
              className="blx-history-control"
              disabled={!canUndo}
              aria-label={t('header.undo')}
              onClick={() => {
                store.getState().undo();
              }}
            >
              <Icon name="undo" className={icon} mirrorInRtl />
            </ToolbarButton>
          </Hint>
          <Hint text={t('header.redo.hint')}>
            <ToolbarButton
              size="icon"
              className="blx-history-control"
              disabled={!canRedo}
              aria-label={t('header.redo')}
              onClick={() => {
                store.getState().redo();
              }}
            >
              <Icon name="redo" className={icon} mirrorInRtl />
            </ToolbarButton>
          </Hint>
          <ToolbarSeparator />
          {width >= 900 && (
            <>
              {viewUrl ? (
                <ToolbarLink
                  className="blx-header-secondary"
                  variant="outline"
                  href={viewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t('header.preview')}
                >
                  <Icon name="preview" className={icon} />
                  <span>{t('header.preview')}</span>
                </ToolbarLink>
              ) : (
                <Hint text={t('header.preview.unavailable')}>
                  <ToolbarButton
                    className="blx-header-secondary"
                    variant="outline"
                    disabled
                    aria-label={t('header.preview')}
                    aria-describedby="blx-preview-hint"
                  >
                    <Icon name="preview" className={icon} />
                    <span>{t('header.preview')}</span>
                  </ToolbarButton>
                </Hint>
              )}
              <Hint text={t('header.save.hint')}>
                <ToolbarButton
                  className="blx-header-secondary"
                  variant="outline"
                  disabled
                  aria-label={t('header.saveDraft')}
                  aria-describedby="blx-save-hint"
                >
                  <Icon name="save" className={icon} />
                  <span>{t('header.saveDraft')}</span>
                </ToolbarButton>
              </Hint>
              <Hint text={t('header.publish.hint')}>
                <ToolbarButton
                  className="blx-header-secondary"
                  variant="default"
                  disabled
                  aria-label={t('header.publish')}
                  aria-describedby="blx-publish-hint"
                >
                  <Icon name="publish" className={icon} />
                  <span>{t('header.publish')}</span>
                </ToolbarButton>
              </Hint>
              <Menu
                label={t('header.publishMenu')}
                items={[
                  { label: t('header.publish'), disabled: true, describedBy: 'blx-publish-hint' },
                  { label: t('header.schedule'), disabled: true },
                  { label: t('header.unpublish'), disabled: true },
                ]}
                className="blx-menu-control blx-publish-split"
                toolbarTrigger
              >
                <Icon name="chevronDown" size={14} />
              </Menu>
            </>
          )}
          <Menu label={t('header.more')} items={overflowItems} className="blx-menu-control blx-overflow" toolbarTrigger>
            <Icon name="more" className={icon} />
          </Menu>
        </div>
        <span id="blx-preview-hint" className="sr-only">
          {t('header.preview.unavailable')}
        </span>
        <span id="blx-save-hint" className="sr-only">
          {t('header.save.hint')}
        </span>
        <span id="blx-publish-hint" className="sr-only">
          {t('header.publish.hint')}
        </span>
        <span id="blx-undo-hint" className="sr-only">
          {t('header.undo.hint')}
        </span>
        <span id="blx-redo-hint" className="sr-only">
          {t('header.redo.hint')}
        </span>
      </Toolbar>
      <ShortcutsDialog
        trigger={null}
        open={shortcutsOpen}
        onOpenChange={(next) => {
          setShortcutsOpen(next);
          if (!next)
            requestAnimationFrame(() => {
              document.querySelector<HTMLButtonElement>('.blx-overflow button')?.focus();
            });
        }}
      />
    </header>
  );
}
