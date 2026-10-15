import { Icon } from '@blixis/wp-editor-ui';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { RestClient } from '../api/types';
import type { MessageKey } from '../i18n';
import { useI18n } from '../i18n-react';
import { useEditorStore, useEditorStoreApi, type PreviewMode } from '../state';
import {
  Toolbar,
  ToolbarToggleGroup,
  ToolbarToggleItem,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@blixis/wp-editor-ui';
import { languageName } from './language-name';
import { elementIconName } from '@blixis/wp-editor-ui';
import { HANDLE_POSITIONS, placeSelectionToolbar } from './selection-chrome';
import { findPath, nodeAt, type ElementNode } from '@blixis/wp-core';
import { elementLabel } from '../element-label';
import { FRAME_WIDTHS, useCanvasSession, type CanvasSessionOptions, type PreviewProblem } from './useCanvasSession';

const PREVIEW_MODES = [
  { id: 'light', label: 'canvas.appearance.light', icon: <Icon name="light" /> },
  { id: 'dark', label: 'canvas.appearance.dark', icon: <Icon name="dark" /> },
] as const satisfies readonly { id: PreviewMode; label: MessageKey; icon: unknown }[];

const PROBLEM_KEYS: Record<PreviewProblem, MessageKey> = {
  offline: 'canvas.preview.error.offline',
  unauthenticated: 'canvas.preview.error.unauthenticated',
  forbidden: 'canvas.preview.error.forbidden',
  locked: 'canvas.preview.error.locked',
  'rate-limited': 'canvas.preview.error.rate-limited',
  invalid: 'canvas.preview.error.invalid',
  server: 'canvas.preview.error.server',
  canvas: 'canvas.preview.error.canvas',
};
let nextDuplicateId = 0;

/** The canvas URL for the language being edited (the PHP document renders the content locale it is asked for). */
export function canvasSrc(base: string, locale: string): string {
  const url = new URL(base);
  url.searchParams.set('locale', locale);
  return url.href;
}

/**
 * The website CONTENT appearance (light/dark) of the preview. Deliberately separate from the editor chrome appearance menu in
 * the toolbar: it changes `previewMode` in the settings slice, which is what the server renders and the canvas shows.
 */
export function PreviewAppearance() {
  const { t } = useI18n();
  const store = useEditorStoreApi();
  const previewMode = useEditorStore((state) => state.previewMode);
  return (
    <TooltipProvider>
      <div className="blx-canvas-bar">
        <Toolbar aria-label={t('canvas.appearance')}>
          {/* The same single-choice pattern as the viewport control in the header: role=radio with aria-checked. */}
          <ToolbarToggleGroup
            type="single"
            value={previewMode}
            aria-label={t('canvas.appearance')}
            aria-describedby="blx-appearance-hint"
            onValueChange={(value) => {
              if (value === 'light' || value === 'dark') store.getState().setPreviewMode(value);
            }}
          >
            {PREVIEW_MODES.map((mode) => (
              <ToolbarToggleItem key={mode.id} value={mode.id}>
                {mode.icon}
                {t(mode.label)}
              </ToolbarToggleItem>
            ))}
          </ToolbarToggleGroup>
        </Toolbar>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="blx-appearance-help ed-focus-ring"
              aria-label={t('canvas.appearance.hint')}
            >
              <Icon name="shortcuts" size={14} />
            </button>
          </TooltipTrigger>
          <TooltipContent>{t('canvas.appearance.hint')}</TooltipContent>
        </Tooltip>
        <span id="blx-appearance-hint" className="sr-only">
          {t('canvas.appearance.hint')}
        </span>
      </div>
    </TooltipProvider>
  );
}

/** Test seams of the session hook. */
export interface CanvasTestOptions {
  createEndpoint?: CanvasSessionOptions['createEndpoint'];
  debounceMs?: number;
}

export interface CanvasProps extends CanvasTestOptions {
  canvasUrl: string;
  client: RestClient;
  selected?: ElementNode | null;
  editingEnabled?: boolean;
}

/** The preview iframe and its connection, error and retry states. */
export function Canvas({
  canvasUrl,
  client,
  createEndpoint,
  debounceMs,
  selected = null,
  editingEnabled = true,
}: CanvasProps) {
  const { t, lang, dir } = useI18n();
  const store = useEditorStoreApi();
  const contentLocale = useEditorStore((state) => state.contentLocale);
  const viewport = useEditorStore((state) => state.viewport);
  const previewMode = useEditorStore((state) => state.previewMode);
  const selectedId = useEditorStore((state) => state.selectedId);
  const [frame, setFrame] = useState<HTMLIFrameElement | null>(null);
  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [overlayBox, setOverlayBox] = useState<{ left: number; top: number; width: number; height: number } | null>(
    null,
  );
  const [toolbarSize, setToolbarSize] = useState({ width: 250, height: 36 });
  const [toolbar, setToolbar] = useState<HTMLDivElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuItem = useRef<HTMLButtonElement>(null);
  const canvasRegion = useRef<HTMLDivElement>(null);
  const src = canvasSrc(canvasUrl, contentLocale);
  const session = useCanvasSession({
    store,
    client,
    frame,
    src,
    attempt,
    ...(createEndpoint === undefined ? {} : { createEndpoint }),
    ...(debounceMs === undefined ? {} : { debounceMs }),
  });
  const width = FRAME_WIDTHS[viewport];
  useLayoutEffect(() => {
    if (!frame || !stage) {
      return;
    }
    const measure = (): void => {
      const frameBox = frame.getBoundingClientRect();
      const stageBox = stage.getBoundingClientRect();
      setOverlayBox({
        left: frameBox.left - stageBox.left + frame.clientLeft,
        top: frameBox.top - stageBox.top + frame.clientTop,
        width: frame.clientWidth,
        height: frame.clientHeight,
      });
    };
    measure();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(stage);
    observer?.observe(frame);
    return () => observer?.disconnect();
  }, [frame, stage]);
  const selectedRect = selectedId === null ? undefined : session.rects.find((rect) => rect.id === selectedId);
  useLayoutEffect(() => {
    if (!toolbar || typeof ResizeObserver !== 'function') return;
    const observer = new ResizeObserver(() => {
      setToolbarSize({ width: toolbar.offsetWidth || 250, height: toolbar.offsetHeight || 36 });
    });
    observer.observe(toolbar);
    return () => {
      observer.disconnect();
    };
  }, [toolbar]);
  const toolbarPosition =
    selectedRect && overlayBox
      ? placeSelectionToolbar(
          overlayBox,
          {
            left: overlayBox.left + selectedRect.x - session.scroll.x,
            top: overlayBox.top + selectedRect.y - session.scroll.y,
            width: selectedRect.w,
            height: selectedRect.h,
          },
          toolbarSize,
          8,
          dir,
        )
      : null;
  const focusToolbar = useCallback((): void => {
    toolbar?.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
  }, [toolbar]);
  const attachToolbar = useCallback((node: HTMLDivElement | null): void => {
    setToolbar(node);
    if (node) setToolbarSize({ width: node.offsetWidth || 250, height: node.offsetHeight || 36 });
  }, []);
  useEffect(() => {
    if (menuOpen) menuItem.current?.focus();
  }, [menuOpen]);
  useEffect(() => {
    if (!stage) return;
    const onStageKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Tab' && !event.shiftKey && selectedRect) {
        event.preventDefault();
        focusToolbar();
      }
    };
    stage.addEventListener('keydown', onStageKeyDown);
    return () => {
      stage.removeEventListener('keydown', onStageKeyDown);
    };
  }, [stage, selectedRect, toolbar, focusToolbar]);
  const onToolbarKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      canvasRegion.current?.focus();
      return;
    }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const items = [...(toolbar?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? [])];
    const index = items.indexOf(document.activeElement as HTMLElement);
    const step = event.key === 'ArrowRight' ? 1 : -1;
    const next = items[(index + step + items.length) % items.length];
    if (next) {
      event.preventDefault();
      next.focus();
    }
  };
  const duplicate = (): void => {
    if (!selected || !editingEnabled) return;
    const state = store.getState();
    if (!state.document) return;
    const path = findPath(state.document.root, selected.id);
    if (!path) return;
    const parentPath = path.slice(0, -1);
    const parent = parentPath.length ? nodeAt(state.document.root, parentPath) : undefined;
    const index = path[path.length - 1];
    if (index === undefined) return;
    const idMap = new Map<string, string>();
    const copyTree = (node: ElementNode): ElementNode => {
      nextDuplicateId += 1;
      const nextId = `el-copy-${Date.now().toString(36)}-${nextDuplicateId.toString(36)}`.slice(0, 64);
      idMap.set(node.id, nextId);
      return { ...structuredClone(node), id: nextId, children: node.children.map(copyTree) };
    };
    const copy = copyTree(selected);
    const translations = Object.entries(state.document.translations).flatMap(([locale, entries]) =>
      [...idMap].flatMap(([oldId, newId]) => {
        const entry = entries[oldId];
        return entry ? [{ locale, elementId: newId, entry: structuredClone(entry) }] : [];
      }),
    );
    if (
      !state.dispatch({ type: 'insert', parentId: parent?.id ?? null, index: index + 1, element: copy, translations })
        .ok
    )
      return;
    state.select(copy.id);
  };
  const restart = (): void => {
    setAttempt((value) => value + 1);
  };

  return (
    <div
      className="blx-canvas-stage"
      data-testid="canvas-stage"
      role="group"
      aria-label={t('canvas.title')}
      ref={(node) => {
        setStage(node);
        canvasRegion.current = node;
      }}
      tabIndex={-1}
    >
      {session.status === 'connecting' ? (
        <p role="status" className="blx-canvas-note" data-testid="canvas-connecting">
          {t('canvas.connecting')}
        </p>
      ) : null}
      {session.status === 'timeout' || session.status === 'violation' ? (
        <div role="alert" className="blx-load-error" data-testid="canvas-connection-error">
          <p className="font-medium">
            {t(session.status === 'timeout' ? 'canvas.timeout.title' : 'canvas.violation.title')}
          </p>
          <p>{t(session.status === 'timeout' ? 'canvas.timeout.body' : 'canvas.violation.body')}</p>
          <button type="button" className="ed-focus-ring underline" onClick={restart}>
            {t('canvas.reload')}
          </button>
        </div>
      ) : null}
      {session.status === 'ready' && session.problem !== null ? (
        <div role="alert" className="blx-load-error" data-testid="canvas-preview-error">
          <p className="font-medium">{t('canvas.preview.error.title')}</p>
          <p>{t(PROBLEM_KEYS[session.problem])}</p>
          <button type="button" className="ed-focus-ring underline" onClick={session.refresh}>
            {t('canvas.retry')}
          </button>
        </div>
      ) : null}
      <iframe
        key={`${src}|${String(attempt)}`}
        ref={setFrame}
        title={t('canvas.frame', { locale: languageName(contentLocale, lang) })}
        sandbox="allow-scripts allow-same-origin"
        referrerPolicy="same-origin"
        className="blx-frame"
        data-viewport={viewport}
        data-preview-mode={previewMode}
        data-session={session.status}
        style={width === null ? undefined : ({ '--blx-frame-width': `${String(width)}px` } as CSSProperties)}
      />
      {frame && overlayBox && selectedId !== null ? (
        <div
          className="blx-overlay-viewport"
          data-testid="canvas-overlay-viewport"
          aria-hidden="true"
          style={overlayBox}
        >
          {session.rects
            .filter((rect) => rect.id === selectedId)
            .map((rect) => (
              <div
                key={rect.id}
                data-testid="selection-overlay"
                className="blx-selection-overlay"
                style={{
                  left: rect.x - session.scroll.x,
                  top: rect.y - session.scroll.y,
                  width: rect.w,
                  height: rect.h,
                }}
              />
            ))}
          {selectedRect ? (
            <div
              className="blx-selection-handles"
              data-testid="selection-handles"
              style={{
                left: selectedRect.x - session.scroll.x,
                top: selectedRect.y - session.scroll.y,
                width: selectedRect.w,
                height: selectedRect.h,
              }}
            >
              {HANDLE_POSITIONS.map((position) => (
                <span key={position} data-handle={position} className={`blx-selection-handle is-${position}`} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {selected && selectedRect && overlayBox ? (
        <div
          ref={attachToolbar}
          className="blx-selection-toolbar"
          data-testid="selection-toolbar"
          role="toolbar"
          aria-label={t('canvas.selection.toolbar')}
          style={toolbarPosition ?? { left: overlayBox.left, top: overlayBox.top }}
          onKeyDown={onToolbarKeyDown}
          onFocusCapture={(event) => {
            const buttons = toolbar?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [];
            buttons.forEach((button) => {
              button.tabIndex = button.contains(event.target) ? 0 : -1;
            });
          }}
        >
          <span className="blx-selection-toolbar-label">
            <Icon name={elementIconName(selected.type)} size={14} />
            {elementLabel(selected.type, t)}
          </span>
          {!editingEnabled ? (
            <span id="blx-selection-disabled" className="sr-only">
              {t('canvas.selection.disabled')}
            </span>
          ) : null}
          <button
            type="button"
            tabIndex={0}
            onClick={duplicate}
            disabled={!editingEnabled}
            aria-label={t('canvas.selection.duplicate')}
            aria-describedby={!editingEnabled ? 'blx-selection-disabled' : undefined}
            title={!editingEnabled ? t('canvas.selection.disabled') : undefined}
          >
            <Icon name="add" size={14} />
          </button>
          <button
            type="button"
            tabIndex={-1}
            onClick={() => {
              if (editingEnabled && selectedId) store.getState().dispatch({ type: 'remove', id: selectedId });
            }}
            disabled={!editingEnabled}
            aria-label={t('canvas.selection.delete')}
            aria-describedby={!editingEnabled ? 'blx-selection-disabled' : undefined}
            title={!editingEnabled ? t('canvas.selection.disabled') : undefined}
          >
            <Icon name="delete" size={14} />
          </button>
          <button
            type="button"
            tabIndex={-1}
            aria-label={t('canvas.selection.more')}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => {
              setMenuOpen((open) => !open);
            }}
          >
            <Icon name="menuDots" size={14} />
          </button>
          <div
            role="menu"
            tabIndex={-1}
            aria-label={t('canvas.selection.more')}
            className="blx-selection-menu"
            hidden={!menuOpen}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                setMenuOpen(false);
                toolbar?.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')?.focus();
              }
            }}
          >
            <button
              ref={menuItem}
              type="button"
              role="menuitem"
              onClick={() => {
                const document = store.getState().document;
                const path = selectedId && document ? findPath(document.root, selectedId) : null;
                const parent = path && path.length > 1 && document ? nodeAt(document.root, path.slice(0, -1)) : null;
                store.getState().select(parent?.id ?? null);
                setMenuOpen(false);
              }}
            >
              {' '}
              {t('canvas.selection.parent')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
