import { Icon, Menu } from '@blixis/wp-editor-ui';
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
import { boxesOverlap, placeHoverChip, placeSelectionToolbar } from './selection-chrome';
import { findPath, nodeAt, type ElementNode } from '@blixis/wp-core';
import { elementLabel } from '../element-label';
import { ElementId } from '../ElementId';
import {
  FRAME_WIDTHS,
  useCanvasSession,
  type CanvasSession,
  type CanvasSessionOptions,
  type PreviewProblem,
} from './useCanvasSession';
import {
  rectAtScroll,
  resizeCssValue,
  resizeFromDelta,
  RESIZE_HANDLES,
  resizeDimensions,
  type ResizeHandle,
  type ResizeRect,
} from './resize';
import { styleSelector } from '../inspector/style-mapping';
import { PROPERTIES } from '@blixis/wp-style-engine';
import { isSafeUrl } from '@blixis/wp-element-registry';
import { shortcutKeys } from '../shortcuts';

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
              <Icon name="info" size={14} />
            </button>
          </TooltipTrigger>
          <TooltipContent description={t('canvas.appearance.hint')}>{t('canvas.appearance')}</TooltipContent>
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
  onEditSessionChange?: (session: CanvasSession['editSession']) => void;
  onEditSelectionChange?: (selection: CanvasSession['editSelection']) => void;
  onTokenColorsChange?: (colors: CanvasSession['tokenColors']) => void;
  onEditCommandApiChange?: (send: CanvasSession['sendEditCommand']) => void;
  onEditStartApiChange?: (start: CanvasSession['startEdit']) => void;
  inlineEditing?: boolean;
}

/** The preview iframe and its connection, error and retry states. */
export function Canvas({
  canvasUrl,
  client,
  createEndpoint,
  debounceMs,
  selected = null,
  editingEnabled = true,
  onEditSessionChange,
  onEditSelectionChange,
  onTokenColorsChange,
  onEditCommandApiChange,
  onEditStartApiChange,
  inlineEditing = true,
}: CanvasProps) {
  const { t, lang, dir } = useI18n();
  const store = useEditorStoreApi();
  const contentLocale = useEditorStore((state) => state.contentLocale);
  const viewport = useEditorStore((state) => state.viewport);
  const previewMode = useEditorStore((state) => state.previewMode);
  const selectedId = useEditorStore((state) => state.selectedId);
  const hoveredId = useEditorStore((state) => state.hoveredId);
  const editorDocument = useEditorStore((state) => state.document);
  const [frame, setFrame] = useState<HTMLIFrameElement | null>(null);
  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [overlayBox, setOverlayBox] = useState<{ left: number; top: number; width: number; height: number } | null>(
    null,
  );
  const [toolbarSize, setToolbarSize] = useState({ width: 250, height: 36 });
  const [toolbar, setToolbar] = useState<HTMLDivElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [formatMenu, setFormatMenu] = useState<'color' | 'highlight' | 'link' | null>(null);
  const formatPopover = useRef<HTMLDivElement>(null);
  const linkPopover = useRef<HTMLFormElement>(null);
  const [linkDraft, setLinkDraft] = useState('');
  const [linkNewTab, setLinkNewTab] = useState(false);
  const [linkError, setLinkError] = useState(false);
  const [resizePreview, setResizePreview] = useState<ResizeRect | null>(null);
  const [resizeError, setResizeError] = useState(false);
  const resizeRef = useRef<{
    handle: ResizeHandle;
    pointerId: number;
    x: number;
    y: number;
    rect: ResizeRect;
    shift: boolean;
    alt: boolean;
    snap: boolean;
    capture: HTMLButtonElement;
  } | null>(null);
  const resizeFrame = useRef<number | null>(null);
  const pendingResize = useRef<ResizeRect | null>(null);
  const keyboardResize = useRef<{ rect: ResizeRect; timer: ReturnType<typeof setTimeout> } | null>(null);
  const menuItem = useRef<HTMLButtonElement>(null);
  const canvasRegion = useRef<HTMLDivElement>(null);
  const attachStage = useCallback((node: HTMLDivElement | null) => {
    setStage(node);
    canvasRegion.current = node;
  }, []);
  const src = canvasSrc(canvasUrl, contentLocale);
  const session = useCanvasSession({
    store,
    client,
    frame,
    src,
    attempt,
    editingEnabled,
    inlineEditing,
    ...(createEndpoint === undefined ? {} : { createEndpoint }),
    ...(debounceMs === undefined ? {} : { debounceMs }),
  });
  const sendEditCommandRef = useRef(session.sendEditCommand);
  const startEditRef = useRef(session.startEdit);
  useEffect(() => {
    sendEditCommandRef.current = session.sendEditCommand;
    startEditRef.current = session.startEdit;
  }, [session.sendEditCommand, session.startEdit]);
  const stableSendEditCommand = useCallback(
    (name: string, args?: Record<string, unknown>) => {
      sendEditCommandRef.current(name, args);
      frame?.focus();
    },
    [frame],
  );
  const stableStartEdit = useCallback((id: string, prop: string) => {
    startEditRef.current(id, prop);
  }, []);
  useEffect(() => {
    onEditSessionChange?.(session.editSession);
  }, [onEditSessionChange, session.editSession]);
  useEffect(() => onEditSelectionChange?.(session.editSelection), [onEditSelectionChange, session.editSelection]);
  useEffect(() => onTokenColorsChange?.(session.tokenColors), [onTokenColorsChange, session.tokenColors]);
  useEffect(() => onEditCommandApiChange?.(stableSendEditCommand), [onEditCommandApiChange, stableSendEditCommand]);
  useEffect(() => onEditStartApiChange?.(stableStartEdit), [onEditStartApiChange, stableStartEdit]);
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
  const selectedRect =
    selectedId === null || session.editSession !== null
      ? undefined
      : session.rects.find((rect) => rect.id === selectedId);
  const hoveredPath = hoveredId && editorDocument ? findPath(editorDocument.root, hoveredId) : null;
  const hoveredNode = hoveredPath && editorDocument ? nodeAt(editorDocument.root, hoveredPath) : null;
  const hoveredRect =
    hoveredId === null || hoveredId === selectedId || session.editSession !== null || resizePreview !== null
      ? undefined
      : session.rects.find((rect) => rect.id === hoveredId);
  const selectedDefinition = selected ? store.getState().registry.get(selected.type) : undefined;
  const locked = selected?.['locked'] === true;
  const canResizeWidth =
    selectedDefinition?.styleProperties.includes('width') === true &&
    PROPERTIES.has('width') &&
    !locked &&
    editingEnabled;
  const canResizeHeight =
    selectedDefinition?.styleProperties.includes('height') === true &&
    PROPERTIES.has('height') &&
    !locked &&
    editingEnabled;
  const commitResize = useCallback(
    (rect: ResizeRect): void => {
      if (!selected || !editingEnabled) return;
      const state = store.getState();
      const breakpoint = state.breakpointId;
      const declarations: Record<string, string> = Object.fromEntries(
        Object.entries(
          selected.style?.find(
            (item) => (item.breakpoint ?? 'base') === breakpoint && item.mode === undefined && item.state === undefined,
          )?.declarations ?? {},
        ).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
      );
      const changed: string[] = [];
      for (const property of ['width', 'height'] as const) {
        const allowed = property === 'width' ? canResizeWidth : canResizeHeight;
        const px = property === 'width' ? rect.w : rect.h;
        const startPx = property === 'width' ? (selectedRect?.w ?? px) : (selectedRect?.h ?? px);
        if (!allowed || Math.round(px) === Math.round(startPx)) continue;
        const parent = selected['parentId']
          ? session.rects.find((item) => item.id === selected['parentId'])
          : undefined;
        const parentPx =
          property === 'width' ? (parent?.w ?? overlayBox?.width ?? 1) : (parent?.h ?? overlayBox?.height ?? 1);
        const rule = selected.style?.find(
          (item) => (item.breakpoint ?? 'base') === breakpoint && item.mode === undefined && item.state === undefined,
        );
        const declared = rule?.declarations[property];
        const value = resizeCssValue(
          px,
          typeof declared === 'string' ? declared : undefined,
          parentPx,
          overlayBox?.width ?? parentPx,
        );
        declarations[property] = value;
        changed.push(property);
      }
      if (changed.length) {
        const result = state.dispatch(
          { type: 'set-style-rule', id: selected.id, selector: styleSelector(breakpoint), declarations },
          { coalesceKey: `style:${selected.id}:${breakpoint}:${changed.sort().join(',')}`, coalesceWindowMs: 60_000 },
        );
        setResizeError(!result.ok);
      }
    },
    [selected, editingEnabled, store, canResizeWidth, canResizeHeight, selectedRect, session.rects, overlayBox],
  );
  const finishResize = useCallback(
    (commit: boolean): void => {
      const active = resizeRef.current;
      if (!active) return;
      resizeRef.current = null;
      active.capture.closest('.blx-editor')?.removeAttribute('data-motion-paused');
      if (resizeFrame.current !== null) cancelAnimationFrame(resizeFrame.current);
      resizeFrame.current = null;
      const preview = pendingResize.current;
      pendingResize.current = null;
      setResizePreview(null);
      if (active.capture.hasPointerCapture(active.pointerId)) active.capture.releasePointerCapture(active.pointerId);
      if (commit && preview) commitResize(preview);
    },
    [commitResize],
  );
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && resizeRef.current) {
        event.preventDefault();
        finishResize(false);
        canvasRegion.current?.focus();
      }
      if (event.key === 'Escape' && keyboardResize.current) {
        clearTimeout(keyboardResize.current.timer);
        keyboardResize.current = null;
        event.preventDefault();
        canvasRegion.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (keyboardResize.current) clearTimeout(keyboardResize.current.timer);
      if (resizeFrame.current !== null) cancelAnimationFrame(resizeFrame.current);
    };
  }, [finishResize]);
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
  const focusFormatToolbar = useCallback((): void => {
    stage?.querySelector<HTMLElement>('[data-testid="format-toolbar"] button:not(:disabled)')?.focus();
  }, [stage]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!session.editSession || !event.altKey || event.key !== 'F10') return;
      event.preventDefault();
      focusFormatToolbar();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [session.editSession, focusFormatToolbar]);
  const attachToolbar = useCallback((node: HTMLDivElement | null): void => {
    setToolbar(node);
    if (node) setToolbarSize({ width: node.offsetWidth || 250, height: node.offsetHeight || 36 });
  }, []);
  useEffect(() => {
    if (menuOpen) menuItem.current?.focus();
  }, [menuOpen]);
  useEffect(() => {
    if (formatMenu === 'color' || formatMenu === 'highlight')
      formatPopover.current?.querySelector<HTMLButtonElement>('[role="menuitemradio"]')?.focus();
    else if (formatMenu === 'link')
      linkPopover.current?.querySelector<HTMLInputElement>('input:not([type="checkbox"])')?.focus();
  }, [formatMenu]);
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
    // The canvas stage is a keyboard interaction target for Enter-to-edit.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      className="blx-canvas-stage"
      data-testid="canvas-stage"
      role="group"
      aria-label={t('canvas.title')}
      ref={attachStage}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && selected && editingEnabled && session.editSession === null) {
          event.preventDefault();
          session.startEdit(selected.id, selected.type === 'blixis/button' ? 'label' : 'text');
        }
      }}
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
            <ElementId id={selected.id} />
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
          >
            <Icon name="copy" size={14} />
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
      {session.editSession &&
      session.editSelection &&
      !session.editSelection.empty &&
      session.editSelection.rect &&
      overlayBox ? (
        <div
          className="blx-selection-toolbar blx-format-toolbar"
          data-testid="format-toolbar"
          role="toolbar"
          aria-label={t('rich.toolbar')}
          style={placeSelectionToolbar(
            overlayBox,
            {
              left: overlayBox.left + session.editSelection.rect.x,
              top: overlayBox.top + session.editSelection.rect.y,
              width: session.editSelection.rect.w,
              height: session.editSelection.rect.h,
            },
            { width: 440, height: 42 },
            6,
            dir,
          )}
          onMouseDown={(event) => {
            event.preventDefault();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              setFormatMenu(null);
              const trigger = event.currentTarget.querySelector<HTMLButtonElement>(
                '.blx-format-popover-anchor > button[aria-expanded="true"]',
              );
              if (trigger) trigger.focus();
              else frame?.contentWindow?.focus();
            }
            if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
            const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
            const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
            const next = buttons[(index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length];
            event.preventDefault();
            next?.focus();
          }}
        >
          <select
            aria-label={t('rich.inlineStyle')}
            value={session.editSelection.marks['code'] ? 'code' : 'span'}
            onChange={() => {
              session.sendEditCommand('toggle-mark', { mark: 'code' });
            }}
          >
            <option value="span">{t('rich.span')}</option>
            <option value="code">{t('rich.code')}</option>
          </select>
          {(['bold', 'italic', 'underline', 'strike'] as const).map((mark) => (
            <Tooltip key={mark}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={t(`rich.${mark}`)}
                  aria-pressed={Boolean(
                    session.editSelection?.marks[
                      mark === 'bold' ? 'strong' : mark === 'italic' ? 'em' : mark === 'underline' ? 'u' : 's'
                    ],
                  )}
                  onClick={() => {
                    session.sendEditCommand('toggle-mark', { mark });
                    frame?.contentWindow?.focus();
                  }}
                >
                  {mark === 'bold' ? (
                    <Icon name="bold" />
                  ) : mark === 'italic' ? (
                    <Icon name="italic" />
                  ) : mark === 'underline' ? (
                    <Icon name="underline" />
                  ) : (
                    <Icon name="strikethrough" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent
                {...(mark === 'bold' || mark === 'italic' || mark === 'underline'
                  ? { shortcut: shortcutKeys(mark, navigator.platform) }
                  : {})}
              >
                {mark === 'strike' ? t('rich.strike') : t(`rich.shortcut.${mark}`)}
              </TooltipContent>
            </Tooltip>
          ))}
          {(['color', 'highlight'] as const).map((kind) => (
            <span className="blx-format-popover-anchor" key={kind}>
              <button
                type="button"
                aria-label={t(`rich.${kind}`)}
                aria-expanded={formatMenu === kind}
                onClick={() => {
                  setFormatMenu(formatMenu === kind ? null : kind);
                }}
              >
                <Icon name={kind === 'color' ? 'textColor' : 'highlighter'} />
              </button>
              {formatMenu === kind ? (
                <div
                  ref={formatPopover}
                  className="blx-format-popover"
                  role="menu"
                  aria-label={t(`rich.${kind}`)}
                  tabIndex={-1}
                  onFocusCapture={(event) => {
                    event.currentTarget
                      .querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')
                      .forEach((item, index) => {
                        item.tabIndex =
                          event.target === (item as HTMLElement)
                            ? 0
                            : index === 0 && !event.currentTarget.contains(document.activeElement)
                              ? 0
                              : -1;
                      });
                  }}
                  onKeyDown={(event) => {
                    const items = [
                      ...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'),
                    ];
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      event.stopPropagation();
                      setFormatMenu(null);
                      event.currentTarget.parentElement
                        ?.querySelector<HTMLButtonElement>('button[aria-expanded="true"]')
                        ?.focus();
                    } else if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
                      event.preventDefault();
                      const index = items.indexOf(document.activeElement as HTMLButtonElement);
                      const horizontalForward = (event.key === 'ArrowRight') !== (dir === 'rtl');
                      const delta =
                        event.key === 'ArrowDown' ||
                        (event.key === 'ArrowRight' && horizontalForward) ||
                        (event.key === 'ArrowLeft' && !horizontalForward)
                          ? 1
                          : -1;
                      const next = items[(index + delta + items.length) % items.length];
                      items.forEach((item) => {
                        item.tabIndex = item === next ? 0 : -1;
                      });
                      next?.focus();
                    }
                  }}
                >
                  {(() => {
                    const activeStyle = session.editSelection?.marks['style'] as
                      { color?: string; highlight?: string } | undefined;
                    const activeValue = kind === 'color' ? activeStyle?.color : activeStyle?.highlight;
                    const options =
                      kind === 'color'
                        ? ['default', 'color-primary', 'color-text', 'color-link']
                        : ['none', 'color-primary', 'color-surface'];
                    return options.map((token, index) => {
                      const selected =
                        token === (kind === 'color' ? 'default' : 'none') ? !activeValue : activeValue === token;
                      const tokenId = token.startsWith('color-')
                        ? token
                        : token === 'default'
                          ? 'color-text'
                          : 'color-surface';
                      const swatchColor = session.tokenColors[previewMode]?.[tokenId];
                      return (
                        <button
                          type="button"
                          key={token}
                          role="menuitemradio"
                          aria-checked={selected}
                          tabIndex={index === 0 ? 0 : -1}
                          onMouseDown={(event) => {
                            event.preventDefault();
                          }}
                          onClick={() => {
                            session.sendEditCommand(
                              'set-style',
                              kind === 'color'
                                ? { color: token === 'default' ? null : token }
                                : { highlight: token === 'none' ? null : token },
                            );
                            setFormatMenu(null);
                            frame?.contentWindow?.focus();
                          }}
                        >
                          <span
                            className={`blx-format-swatch${swatchColor ? '' : ' is-unresolved'}`}
                            aria-hidden="true"
                            ref={(node) => {
                              if (node) {
                                if (swatchColor) node.style.setProperty('--swatch', swatchColor);
                                else node.style.removeProperty('--swatch');
                              }
                            }}
                            data-token={tokenId}
                          />
                          {selected ? <Icon name="check" size={14} /> : null}
                          {t(
                            (token === 'color-text'
                              ? 'inspector.token.color.text'
                              : token === 'color-link'
                                ? 'inspector.token.color.link'
                                : token === 'color-surface'
                                  ? 'inspector.token.color.surface'
                                  : token === 'color-primary'
                                    ? 'inspector.token.color.primary'
                                    : `rich.token.${token}`) as never,
                          )}
                        </button>
                      );
                    });
                  })()}
                </div>
              ) : null}
            </span>
          ))}
          <span className="blx-format-popover-anchor">
            <button
              type="button"
              aria-label={t('rich.link')}
              aria-expanded={formatMenu === 'link'}
              onClick={() => {
                const activeLink = session.editSelection?.marks['link'] as
                  { href?: string; newTab?: boolean } | undefined;
                setLinkDraft(activeLink?.href ?? '');
                setLinkNewTab(activeLink?.newTab ?? false);
                setLinkError(false);
                setFormatMenu(formatMenu === 'link' ? null : 'link');
              }}
            >
              <Icon name="link" />
            </button>
            {formatMenu === 'link' ? (
              <form
                ref={linkPopover}
                className="blx-format-popover"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (linkDraft === '' || !isSafeUrl(linkDraft)) {
                    setLinkError(true);
                    return;
                  }
                  session.sendEditCommand('set-link', { href: linkDraft, newTab: linkNewTab });
                  setFormatMenu(null);
                  frame?.contentWindow?.focus();
                }}
              >
                <label>
                  {t('rich.linkUrl')}
                  <input
                    value={linkDraft}
                    aria-describedby={linkError ? 'blx-rich-link-error' : undefined}
                    onChange={(e) => {
                      setLinkDraft(e.target.value);
                    }}
                    maxLength={2048}
                  />
                </label>
                {linkError ? (
                  <span id="blx-rich-link-error" role="alert">
                    {t('inspector.error.url')}
                  </span>
                ) : null}
                <label className="blx-format-new-tab">
                  <input
                    type="checkbox"
                    checked={linkNewTab}
                    onChange={(event) => {
                      setLinkNewTab(event.target.checked);
                    }}
                  />
                  {t('rich.newTab')}
                </label>
                <button type="submit">{t('rich.apply')}</button>
                {session.editSelection.marks['link'] ? (
                  <button
                    type="button"
                    onClick={() => {
                      session.sendEditCommand('clear-link');
                      setFormatMenu(null);
                      frame?.contentWindow?.focus();
                    }}
                  >
                    {t('rich.remove')}
                  </button>
                ) : null}
              </form>
            ) : null}
          </span>
          <Menu
            label={t('rich.more')}
            items={[
              {
                label: t('rich.clear'),
                icon: <Icon name="clearFormatting" />,
                onSelect: () => {
                  session.sendEditCommand('clear-marks');
                  frame?.contentWindow?.focus();
                },
              },
              {
                label: t('rich.removeLink'),
                icon: <Icon name="link" />,
                disabled: !session.editSelection.marks['link'],
                onSelect: () => {
                  session.sendEditCommand('clear-link');
                  frame?.contentWindow?.focus();
                },
              },
            ]}
            className="blx-format-more"
          >
            <Icon name="more" />
          </Menu>
        </div>
      ) : null}
      {frame && overlayBox && session.editSession === null && (selectedId !== null || hoveredRect !== undefined) ? (
        <div className="blx-overlay-viewport" data-testid="canvas-overlay-viewport" style={overlayBox}>
          {session.rects
            .filter((rect) => rect.id === selectedId)
            .map((rect) => (
              <div
                key={rect.id}
                data-testid="selection-overlay"
                className="blx-selection-overlay"
                style={{
                  left: rectAtScroll(resizePreview ?? rect, session.scroll).x,
                  top: rectAtScroll(resizePreview ?? rect, session.scroll).y,
                  width: resizePreview?.w ?? rect.w,
                  height: resizePreview?.h ?? rect.h,
                }}
              />
            ))}
          {selectedRect ? (
            <div
              className="blx-selection-handles"
              data-testid="selection-handles"
              style={{
                left: rectAtScroll(resizePreview ?? selectedRect, session.scroll).x,
                top: rectAtScroll(resizePreview ?? selectedRect, session.scroll).y,
                width: resizePreview?.w ?? selectedRect.w,
                height: resizePreview?.h ?? selectedRect.h,
              }}
            >
              {RESIZE_HANDLES.map((position) => {
                const dims = resizeDimensions(position);
                const enabled =
                  (!dims.width || canResizeWidth) && (!dims.height || canResizeHeight) && editingEnabled && !locked;
                const reason = !editingEnabled || locked ? t('canvas.resize.disabled') : t('canvas.resize.unsupported');
                const edge =
                  position === 'e'
                    ? dir === 'rtl'
                      ? 'left'
                      : 'right'
                    : position === 'w'
                      ? dir === 'rtl'
                        ? 'right'
                        : 'left'
                      : position === 'n'
                        ? 'top'
                        : position === 's'
                          ? 'bottom'
                          : `top-${position.includes('w') !== (dir === 'rtl') ? 'left' : 'right'}`;
                return (
                  <Tooltip key={position}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        data-handle={position}
                        className={`blx-selection-handle is-${position} ed-focus-ring`}
                        aria-label={t('canvas.resize.handle', { edge })}
                        aria-disabled={!enabled}
                        tabIndex={0}
                        onPointerDown={(event) => {
                          if (!enabled) return;
                          event.preventDefault();
                          event.currentTarget.setPointerCapture(event.pointerId);
                          event.currentTarget.closest('.blx-editor')?.setAttribute('data-motion-paused', 'true');
                          resizeRef.current = {
                            handle: position,
                            pointerId: event.pointerId,
                            x: event.clientX,
                            y: event.clientY,
                            rect: { x: selectedRect.x, y: selectedRect.y, w: selectedRect.w, h: selectedRect.h },
                            shift: event.shiftKey || selected?.type === 'blixis/image',
                            alt: event.altKey,
                            snap: event.ctrlKey || event.metaKey,
                            capture: event.currentTarget,
                          };
                        }}
                        onPointerMove={(event) => {
                          const active = resizeRef.current;
                          if (active?.pointerId !== event.pointerId) return;
                          pendingResize.current = resizeFromDelta(
                            active.rect,
                            active.handle,
                            event.clientX - active.x,
                            event.clientY - active.y,
                            {
                              shift: event.shiftKey || active.shift,
                              alt: event.altKey || active.alt,
                              snap: event.ctrlKey || event.metaKey || active.snap,
                              rtl: dir === 'rtl',
                            },
                          );
                          resizeFrame.current ??= requestAnimationFrame(() => {
                            resizeFrame.current = null;
                            setResizePreview(pendingResize.current);
                          });
                        }}
                        onPointerUp={() => {
                          finishResize(true);
                        }}
                        onPointerCancel={() => {
                          finishResize(false);
                        }}
                        onLostPointerCapture={() => {
                          finishResize(false);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') {
                            finishResize(false);
                            if (keyboardResize.current) clearTimeout(keyboardResize.current.timer);
                            keyboardResize.current = null;
                            canvasRegion.current?.focus();
                            return;
                          }
                          if (!event.key.startsWith('Arrow') || !enabled) return;
                          event.preventDefault();
                          const dx =
                            event.key === 'ArrowRight'
                              ? (dir === 'rtl' ? -1 : 1) * (event.altKey ? 1.6 : event.shiftKey ? 10 : 1)
                              : event.key === 'ArrowLeft'
                                ? (dir === 'rtl' ? 1 : -1) * (event.altKey ? 1.6 : event.shiftKey ? 10 : 1)
                                : 0;
                          const dy =
                            event.key === 'ArrowDown'
                              ? event.shiftKey
                                ? 10
                                : event.altKey
                                  ? 1.6
                                  : 1
                              : event.key === 'ArrowUp'
                                ? -(event.altKey ? 1.6 : event.shiftKey ? 10 : 1)
                                : 0;
                          const starting = keyboardResize.current?.rect ?? {
                            x: selectedRect.x,
                            y: selectedRect.y,
                            w: selectedRect.w,
                            h: selectedRect.h,
                          };
                          const next = resizeFromDelta(starting, position, dx, dy, { rtl: dir === 'rtl' });
                          if (keyboardResize.current) clearTimeout(keyboardResize.current.timer);
                          const timer = setTimeout(() => {
                            keyboardResize.current = null;
                            commitResize(next);
                          }, 300);
                          keyboardResize.current = { rect: next, timer };
                        }}
                      />
                    </TooltipTrigger>
                    {!enabled ? <TooltipContent>{reason}</TooltipContent> : null}
                  </Tooltip>
                );
              })}
              {resizePreview ? (
                <span className="blx-resize-badge" role="status">
                  {Math.round(resizePreview.w)} × {Math.round(resizePreview.h)}
                </span>
              ) : null}
              {resizeError ? (
                <span className="sr-only" role="alert">
                  {t('inspector.error.invalid')}
                </span>
              ) : null}
            </div>
          ) : null}
          {hoveredNode && hoveredRect
            ? (() => {
                const element = {
                  left: hoveredRect.x - session.scroll.x,
                  top: hoveredRect.y - session.scroll.y,
                  width: hoveredRect.w,
                  height: hoveredRect.h,
                };
                const position = placeHoverChip(
                  { left: 0, top: 0, width: overlayBox.width, height: overlayBox.height },
                  element,
                  { width: 156, height: 24 },
                );
                const toolbarBox = toolbarPosition
                  ? {
                      left: toolbarPosition.left - overlayBox.left,
                      top: toolbarPosition.top - overlayBox.top,
                      ...toolbarSize,
                    }
                  : null;
                return toolbarBox && boxesOverlap({ ...position, width: 156, height: 24 }, toolbarBox) ? null : (
                  <div className="blx-hover-chip" data-testid="canvas-hover-chip" aria-hidden="true" style={position}>
                    <Icon name={elementIconName(hoveredNode.type)} size={14} />
                    <span>{elementLabel(hoveredNode.type, t)}</span>
                    <ElementId id={hoveredNode.id} tooltip={false} />
                  </div>
                );
              })()
            : null}
        </div>
      ) : null}
    </div>
  );
}
