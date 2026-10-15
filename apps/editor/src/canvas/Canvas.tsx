import { Moon, Sun } from 'lucide-react';
import { useLayoutEffect, useState, type CSSProperties } from 'react';
import type { RestClient } from '../api/types';
import type { MessageKey } from '../i18n';
import { useI18n } from '../i18n-react';
import { useEditorStore, useEditorStoreApi, type PreviewMode } from '../state';
import { Toolbar, ToolbarToggleGroup, ToolbarToggleItem } from '@blixis/wp-editor-ui';
import { languageName } from './language-name';
import { FRAME_WIDTHS, useCanvasSession, type CanvasSessionOptions, type PreviewProblem } from './useCanvasSession';

const PREVIEW_MODES = [
  { id: 'light', label: 'canvas.appearance.light', icon: <Sun aria-hidden="true" className="size-4" /> },
  { id: 'dark', label: 'canvas.appearance.dark', icon: <Moon aria-hidden="true" className="size-4" /> },
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
    <div className="blx-canvas-bar">
      <Toolbar aria-label={t('canvas.appearance')} aria-describedby="blx-appearance-hint">
        {/* The same single-choice pattern as the viewport control in the header: role=radio with aria-checked. */}
        <ToolbarToggleGroup
          type="single"
          value={previewMode}
          aria-label={t('canvas.appearance')}
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
      <span id="blx-appearance-hint" className="text-ed-fg-muted text-xs">
        {t('canvas.appearance.hint')}
      </span>
    </div>
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
}

/** The preview iframe and its connection, error and retry states. */
export function Canvas({ canvasUrl, client, createEndpoint, debounceMs }: CanvasProps) {
  const { t, lang } = useI18n();
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
  const restart = (): void => {
    setAttempt((value) => value + 1);
  };

  return (
    <div className="blx-canvas-stage" data-testid="canvas-stage" ref={setStage}>
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
        </div>
      ) : null}
    </div>
  );
}
