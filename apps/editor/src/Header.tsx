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
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { EditorBootstrap } from './bootstrap';
import type { PublicationState } from './api/types';
import { CHROME_PREFERENCES, type ChromePreference } from './chrome-theme';
import type { MessageKey } from './i18n';
import { useI18n } from './i18n-react';
import type { PanelState } from './panels';
import { shortcutKeys, type ShortcutAction } from './shortcuts';
import { ShortcutsDialog } from './ShortcutsDialog';
import { Dialog, DialogContent } from '@blixis/wp-editor-ui';
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
  onPageSettings: () => void;
}
function Hint({
  text,
  description,
  shortcut,
  children,
}: {
  text: string;
  description?: string;
  shortcut?: ShortcutAction;
  children: ReactNode;
}) {
  const keys = shortcut ? shortcutKeys(shortcut, navigator.platform) : undefined;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent {...(keys ? { shortcut: keys } : {})} {...(description ? { description } : {})}>
        {text}
      </TooltipContent>
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
function hasPublicationPending(state: PublicationState | null): boolean {
  if (state === null) return true;
  return state.layout.state !== 'published' || Object.values(state.locales).some((item) => item.state !== 'published');
}

export function Header({ bootstrap, panels, onTogglePanel, appearance, onAppearance, onPageSettings }: HeaderProps) {
  const { t, locale } = useI18n();
  const store = useEditorStoreApi();
  const viewport = useEditorStore((state) => state.viewport);
  const contentLocale = useEditorStore((state) => state.contentLocale);
  const canUndo = useEditorStore((state) => state.canUndo);
  const canRedo = useEditorStore((state) => state.canRedo);
  const dirty = useEditorStore((state) => state.dirty);
  const pageSettingsDirty = useEditorStore((state) => state.pageSettingsDirty);
  const pageSettingsTitle = useEditorStore((state) => state.pageSettingsSaved?.title);
  const saveStatus = useEditorStore((state) => state.saveStatus);
  const saveError = useEditorStore((state) => state.saveError);
  const saveErrorKey = useEditorStore((state) => state.saveErrorKey);
  const retryAfterMs = useEditorStore((state) => state.retryAfterMs);
  const publication = useEditorStore((state) => state.publication);
  const publicationStatus = useEditorStore((state) => state.publicationStatus);
  const publicationError = useEditorStore((state) => state.publicationError);
  const saveLocked = useEditorStore((state) => state.saveLocked);
  const savedAt = useEditorStore((state) => state.lastSavedAt);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [conflictConfirm, setConflictConfirm] = useState<'reload' | 'overwrite' | null>(null);
  const rateRetryUsed = useRef(false);
  const [now, setNow] = useState(0);
  const [rateCountdown, setRateCountdown] = useState<{ delay: number; seconds: number } | null>(null);
  const rateSeconds =
    saveErrorKey === 'save.error.rate' && retryAfterMs !== null
      ? rateCountdown?.delay === retryAfterMs
        ? rateCountdown.seconds
        : Math.ceil(retryAfterMs / 1000)
      : 0;
  const [width, setWidth] = useState(() => (typeof window === 'undefined' ? 1200 : window.innerWidth));
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publicationAction, setPublicationAction] = useState<'publish' | 'rollback'>('publish');
  const [selectedLocales, setSelectedLocales] = useState<string[]>([]);
  const hasDirty = dirty.layout || Object.values(dirty.content).some(Boolean) || pageSettingsDirty;
  const publishPending = hasDirty || hasPublicationPending(publication);
  const publishDisabled =
    !bootstrap.editingEnabled || saveLocked || publicationStatus === 'publishing' || !publishPending;
  const publishLabel =
    publication &&
    (publication.layout.state !== 'unpublished' ||
      Object.values(publication.locales).some((item) => item.state !== 'unpublished'))
      ? t('header.publishChanges')
      : t('header.publish');
  const publishHint =
    !bootstrap.editingEnabled || saveLocked
      ? t('publication.lockedHint')
      : publicationStatus === 'publishing'
        ? t('publication.publishing')
        : publishPending
          ? publishLabel
          : t('publication.nothingToPublish');
  const publicationStreams = publication ? [publication.layout, ...Object.values(publication.locales)] : [];
  const hasLivePublication = publicationStreams.some((item) => item.state !== 'unpublished');
  const hasPublicationChanges = publicationStreams.some((item) => item.state !== 'published');
  const publicationStatusLabel = !hasLivePublication
    ? t('publication.notPublished')
    : hasDirty || hasPublicationChanges
      ? t('publication.pendingChanges')
      : t('publication.published');
  const openPublish = () => {
    setPublicationAction('publish');
    const state = store.getState().publication;
    const current = store.getState();
    setSelectedLocales(
      bootstrap.enabledLocales.filter(
        (item) => current.dirty.content[item] === true || state?.locales[item]?.state !== 'published',
      ),
    );
    setPublishOpen(true);
  };
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
    const unsubscribe = store.subscribe((state) => {
      if (state.saveError?.kind === 'http' && state.saveError.status === 409) setConflictOpen(true);
    });
    return () => {
      unsubscribe();
    };
  }, [store]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 's') return;
      event.preventDefault();
      void store.getState().saveDraft();
    };
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
    };
  }, [store]);
  useEffect(
    () => () => {
      store.getState().cancelSave();
    },
    [store],
  );
  useEffect(() => {
    if (saveStatus !== 'saving' && !hasDirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => {
      window.removeEventListener('beforeunload', handler);
    };
  }, [hasDirty, saveStatus]);
  useEffect(() => {
    if (saveError?.kind !== 'network') return;
    const retry = () => {
      void store.getState().saveDraft();
    };
    window.addEventListener('online', retry);
    return () => {
      window.removeEventListener('online', retry);
    };
  }, [saveError, store]);
  useEffect(() => {
    if (saveErrorKey !== 'save.error.rate' || retryAfterMs === null || rateRetryUsed.current) return;
    rateRetryUsed.current = true;
    const timer = window.setTimeout(() => void store.getState().saveDraft(), retryAfterMs);
    return () => {
      window.clearTimeout(timer);
    };
  }, [saveErrorKey, retryAfterMs, store]);
  useEffect(() => {
    if (saveErrorKey !== 'save.error.rate' || retryAfterMs === null) return;
    let seconds = Math.ceil(retryAfterMs / 1000);
    const interval = window.setInterval(() => {
      seconds = Math.max(0, seconds - 1);
      setRateCountdown({ delay: retryAfterMs, seconds });
    }, 1000);
    return () => {
      window.clearInterval(interval);
    };
  }, [saveErrorKey, retryAfterMs]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 30_000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);
  const relative = useMemo(
    () => (savedAt === null ? t('header.time.now') : relativeSaved(now, savedAt, locale)),
    [now, savedAt, locale, t],
  );
  const viewUrl = validLocalUrl(bootstrap.viewUrl);
  const previewUrl = validLocalUrl(bootstrap.previewUrl);
  const previewLabel = hasDirty ? t('header.saveAndPreview') : t('header.preview');
  const openPreview = async () => {
    if (!previewUrl) return;
    if (hasDirty) {
      await store.getState().saveDraft();
      const state = store.getState();
      if (
        state.saveError ||
        state.dirty.layout ||
        Object.values(state.dirty.content).some(Boolean) ||
        state.pageSettingsDirty
      )
        return;
    }
    const target = `blixis-preview-${String(bootstrap.postId)}`;
    const opened = window.open(previewUrl, target);
    if (opened) opened.opener = null;
  };
  const pagesUrl = validLocalUrl(new URL('edit.php', bootstrap.adminUrl).href);
  const headerTitle = pageSettingsTitle ?? bootstrap.postTitle;
  const title = headerTitle.trim() === '' ? t('header.untitled') : headerTitle;
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
            label: t('header.viewPage'),
            href: viewUrl ?? undefined,
            disabled: viewUrl === null,
            icon: <Icon name="preview" size={15} />,
          },
          {
            label: previewLabel,
            disabled: previewUrl === null || !bootstrap.editingEnabled || saveLocked || saveStatus === 'saving',
            describedBy: previewUrl === null ? 'blx-preview-hint' : undefined,
            icon: <Icon name="preview" size={15} />,
            onSelect: () => void openPreview(),
          },
          {
            label: t('header.saveDraft'),
            disabled: !bootstrap.editingEnabled || saveLocked || saveStatus === 'saving' || !hasDirty,
            describedBy: 'blx-save-hint',
            icon: <Icon name="save" size={15} />,
            onSelect: () => void store.getState().saveDraft(),
          },
          {
            label: publishLabel,
            disabled: !bootstrap.editingEnabled || saveLocked || publicationStatus === 'publishing' || !publishPending,
            describedBy: 'blx-publish-hint',
            icon: <Icon name="publish" size={15} />,
            onSelect: openPublish,
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
              { label: t('header.pageSettings'), onSelect: onPageSettings },
              { label: t('header.back'), href: bootstrap.adminUrl },
            ]}
            className="blx-menu-control"
            toolbarTrigger
          >
            <span className="blx-menu-trigger-content">
              <Icon name="pages" size={16} />
              <span className="blx-pages-label">{t('header.pages')}</span>
              <Icon name="chevronDown" size={14} />
            </span>
          </Menu>
          <ToolbarSeparator />
          <span className="blx-header-title">
            <button type="button" className="blx-title-text" onClick={onPageSettings}>
              {title}
            </button>
            <span
              className="blx-saved"
              data-save-state={
                saveStatus === 'saving' ? 'saving' : saveStatus === 'failed' ? 'failed' : hasDirty ? 'dirty' : 'saved'
              }
              role="status"
              aria-live="polite"
            >
              <i aria-hidden="true" />
              {saveStatus === 'saving' ? (
                t('save.saving')
              ) : saveStatus === 'failed' ? (
                <>
                  <span>{t('save.failed')}</span>{' '}
                  <button type="button" aria-label={t('save.retry')} onClick={() => void store.getState().saveDraft()}>
                    {t('save.retry')}
                  </button>
                </>
              ) : hasDirty ? (
                t('header.unsaved')
              ) : (
                t('header.saved', { time: relative })
              )}
            </span>
          </span>
          <span
            className="blx-publication-chip"
            aria-label={`${t('publication.statusLabel')}: ${publicationStatusLabel}`}
          >
            {publicationStatusLabel}
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
            <Hint key={item.id} text={t(item.label)}>
              <ToolbarToggleItem value={item.id} size="icon" aria-label={t(item.label)}>
                <Icon name={item.icon} className={icon} />
              </ToolbarToggleItem>
            </Hint>
          ))}
        </ToolbarToggleGroup>
        <div className="blx-header-end">
          <Hint text={t('header.undo.hint')} shortcut="undo">
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
          <Hint text={t('header.redo.hint')} shortcut="redo">
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
              {previewUrl ? (
                <ToolbarButton
                  className="blx-header-secondary"
                  variant="outline"
                  disabled={!bootstrap.editingEnabled || saveLocked || saveStatus === 'saving'}
                  aria-label={previewLabel}
                  aria-busy={saveStatus === 'saving'}
                  onClick={() => void openPreview()}
                >
                  <Icon name="preview" className={icon} />
                  <span>{previewLabel}</span>
                </ToolbarButton>
              ) : (
                <Hint text={t('header.preview.hint')} description={t('header.preview.unavailable')}>
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
              {viewUrl && (
                <ToolbarLink
                  className="blx-header-secondary"
                  variant="ghost"
                  href={viewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t('header.viewPage')}
                >
                  <span>{t('header.viewPage')}</span>
                </ToolbarLink>
              )}
              <Hint text={t('header.save.hint')} shortcut="save">
                <ToolbarButton
                  className="blx-header-secondary"
                  variant="outline"
                  disabled={!bootstrap.editingEnabled || saveLocked || saveStatus === 'saving' || !hasDirty}
                  aria-disabled={!bootstrap.editingEnabled || saveLocked || saveStatus === 'saving' || !hasDirty}
                  aria-busy={saveStatus === 'saving'}
                  aria-label={t('header.saveDraft')}
                  aria-describedby="blx-save-hint"
                  onClick={() => void store.getState().saveDraft()}
                >
                  <Icon name="save" className={icon} />
                  <span>{saveStatus === 'saving' ? t('save.saving') : t('header.saveDraft')}</span>
                </ToolbarButton>
              </Hint>
              <Hint text={publishHint}>
                <ToolbarButton
                  className="blx-header-secondary"
                  variant="default"
                  aria-disabled={publishDisabled}
                  aria-label={publishLabel}
                  aria-describedby="blx-publish-hint"
                  onClick={() => {
                    if (!publishDisabled) openPublish();
                  }}
                >
                  <Icon name="publish" className={icon} />
                  <span>{publishLabel}</span>
                </ToolbarButton>
              </Hint>
              <Menu
                label={t('header.publishMenu')}
                items={[
                  {
                    label: publishLabel,
                    disabled:
                      !bootstrap.editingEnabled || saveLocked || publicationStatus === 'publishing' || !publishPending,
                    describedBy: 'blx-publish-hint',
                    onSelect: openPublish,
                  },
                  { label: t('header.schedule'), disabled: true },
                  { label: t('header.unpublish'), disabled: true, describedBy: 'blx-unpublish-hint' },
                  {
                    label: t('publication.rollback'),
                    disabled:
                      !publication || publication.layout.state === 'unpublished' || publication.layout.snapshot < 2,
                    onSelect: () => {
                      setPublicationAction('rollback');
                      setPublishOpen(true);
                    },
                  },
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
          {publishHint}
        </span>
        <span id="blx-unpublish-hint" className="sr-only">
          {t('publication.unpublishUnavailable')}
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
      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent
          title={t(publicationAction === 'rollback' ? 'publication.rollbackTitle' : 'publication.confirmTitle')}
          description={t(
            publicationAction === 'rollback' ? 'publication.rollbackDescription' : 'publication.confirmDescription',
          )}
          closeLabel={t('dialog.close')}
        >
          {publicationAction === 'publish' && (
            <div className="blx-publication-summary">
              <p>
                {t('publication.layout')}: {t(`publication.state.${publication?.layout.state ?? 'unpublished'}`)}
              </p>
              <fieldset>
                <legend>{t('publication.locales')}</legend>
                {bootstrap.enabledLocales.map((item) => {
                  const state = publication?.locales[item]?.state ?? 'unpublished';
                  return (
                    <label key={item}>
                      <input
                        type="checkbox"
                        className="accent-ed-primary"
                        checked={selectedLocales.includes(item)}
                        onChange={(event) => {
                          setSelectedLocales((current) =>
                            event.target.checked ? [...current, item] : current.filter((localeId) => localeId !== item),
                          );
                        }}
                      />{' '}
                      {item} — {t(`publication.state.${state}`)}
                    </label>
                  );
                })}
              </fieldset>
            </div>
          )}
          {publicationError && (
            <div role="alert" className="blx-save-alert">
              {publicationError.message ?? t('publication.error')}
              {publicationError.status === 429 && (
                <span>
                  {t('publication.retryAfter', {
                    seconds: publicationError.retryAfter ?? Number(publicationError.data?.['retryAfter'] ?? 1),
                  })}
                </span>
              )}
              {publicationError.status === 409 && (
                <button
                  type="button"
                  onClick={() => {
                    void store.getState().refreshPublication();
                  }}
                >
                  {t('publication.reloadState')}
                </button>
              )}
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              className="ed-focus-ring rounded-md bg-ed-primary px-3 py-2 text-ed-primary-fg hover:bg-ed-primary-hover"
              disabled={
                publicationStatus === 'publishing' ||
                (publicationAction === 'publish' &&
                  !selectedLocales.length &&
                  publication?.layout.state === 'published')
              }
              onClick={() => {
                const action =
                  publicationAction === 'rollback'
                    ? store.getState().rollback()
                    : store.getState().publish(selectedLocales);
                void action.then(() => {
                  if (store.getState().publicationStatus === 'idle') setPublishOpen(false);
                });
              }}
            >
              {publicationStatus === 'publishing'
                ? t('publication.publishing')
                : t(publicationAction === 'rollback' ? 'publication.rollbackConfirm' : 'header.publish')}
            </button>
            <button
              type="button"
              className="ed-focus-ring rounded-md bg-ed-surface-2 px-3 py-2 text-ed-fg hover:bg-ed-surface-hover"
              onClick={() => {
                setPublishOpen(false);
              }}
            >
              {t('save.conflict.cancel')}
            </button>
          </div>
        </DialogContent>
      </Dialog>
      {saveError !== null && (
        <div role="alert" className="blx-save-alert">
          <span>{t((saveErrorKey ?? 'save.error.server') as MessageKey)}</span>
          {saveErrorKey === 'save.error.rate' && rateSeconds > 0 && (
            <span>{t('save.error.rateCountdown', { seconds: rateSeconds })}</span>
          )}
          {saveError.kind !== 'invalid-document' &&
            saveError.status === 423 &&
            typeof saveError.data?.['reason'] === 'string' && <span>{saveError.data['reason']}</span>}
          {saveError.kind !== 'invalid-document' && (saveError.status === 401 || saveError.status === 403) ? (
            <a href={new URL('../wp-login.php', bootstrap.adminUrl).href} target="_blank" rel="noopener noreferrer">
              {t('save.signIn')}
            </a>
          ) : null}
          {saveError.kind !== 'invalid-document' && saveError.status !== 423 && saveError.status !== 409 ? (
            <button
              type="button"
              onClick={() => {
                rateRetryUsed.current = true;
                void store.getState().saveDraft();
              }}
            >
              {t('save.retry')}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              store.getState().dismissSaveError();
            }}
          >
            {t('dialog.close')}
          </button>
        </div>
      )}
      <Dialog
        open={conflictOpen}
        onOpenChange={(next) => {
          setConflictOpen(next);
          if (!next) setConflictConfirm(null);
        }}
      >
        <DialogContent
          dir={bootstrap.editorLocale === 'ar' || bootstrap.editorLocale.startsWith('ar_') ? 'rtl' : 'ltr'}
          title={t(
            conflictConfirm
              ? conflictConfirm === 'reload'
                ? 'save.conflict.confirmReloadTitle'
                : 'save.conflict.confirmOverwriteTitle'
              : 'save.conflict.title',
          )}
          description={t(
            conflictConfirm
              ? conflictConfirm === 'reload'
                ? 'save.conflict.confirmReloadBody'
                : 'save.conflict.confirmOverwriteBody'
              : 'save.conflict.body',
          )}
          closeLabel={t('dialog.close')}
        >
          {!conflictConfirm && (
            <button
              type="button"
              onClick={() => {
                setConflictConfirm('reload');
              }}
            >
              {t('save.conflict.reload')}
            </button>
          )}
          {!conflictConfirm && (
            <button
              type="button"
              onClick={() => {
                setConflictConfirm('overwrite');
              }}
            >
              {t('save.conflict.overwrite')}
            </button>
          )}
          {conflictConfirm && (
            <button
              type="button"
              onClick={() => {
                const choice = conflictConfirm;
                setConflictConfirm(null);
                if (choice === 'reload') setConflictOpen(false);
                void store.getState().resolveConflict(choice);
              }}
            >
              {t('save.conflict.confirm')}
            </button>
          )}
          {conflictConfirm && (
            <button
              type="button"
              onClick={() => {
                setConflictConfirm(null);
              }}
            >
              {t('save.conflict.cancel')}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setConflictOpen(false);
            }}
          >
            {t('save.conflict.keep')}
          </button>
        </DialogContent>
      </Dialog>
    </header>
  );
}
