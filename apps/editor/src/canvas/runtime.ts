/**
 * Canvas runtime: the ONLY script that runs inside the canvas iframe (bundled to `canvas.js`, no React). It is loaded from the
 * same origin under a nonce-only `script-src`; document content arrives as sanitized text and is inserted here, where no inline
 * script or handler can run. It never calls eval or Function, never reads cookies or storage and never navigates.
 */
import {
  createCanvasEndpoint,
  isElementId,
  LIMITS,
  type CanvasEndpoint,
  type CanvasEndpointOptions,
  type CanvasErrorCode,
  type CanvasMessage,
  type ElementRect,
  type Init,
  type MessageSource,
  type ParentMessage,
  type PostTarget,
} from '@blixis/wp-canvas-bridge';
import { checkHtml, isCssSafe } from './guards';

export const ROOT_ID = 'blx-canvas-root';
export const META_NAME = 'blixis-canvas';
export const SELECTED_ATTRIBUTE = 'data-blx-selected';
export const HOVER_ATTRIBUTE = 'data-blx-hover';
const MAX_META_LENGTH = 1024;
const NONCE_PATTERN = /^[A-Za-z0-9+/_=-]{16,64}$/;

/** Selection and hover are drawn by this stylesheet (a nonce'd `<style>`), never by inline styles. */
const CHROME_CSS =
  `[${HOVER_ATTRIBUTE}]{outline:2px dashed #2563eb!important;outline-offset:-2px!important}` +
  `[${SELECTED_ATTRIBUTE}]{outline:2px solid #2563eb!important;outline-offset:-2px!important}`;

export interface CanvasMeta {
  version: 1;
  cspNonce: string;
}

/** Reads `<meta name="blixis-canvas" content='{"version":1,"cspNonce":"..."}'>`; anything unexpected yields `null`. */
export function readCanvasMeta(doc: Document): CanvasMeta | null {
  const element = doc.querySelector(`meta[name="${META_NAME}"]`);
  const content = element?.getAttribute('content');
  if (content === null || content === undefined || content.length > MAX_META_LENGTH) return null;
  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch {
    return null;
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return null;
  const keys = Object.keys(json);
  if (keys.length !== 2 || !keys.includes('version') || !keys.includes('cspNonce')) return null;
  const record = json as Record<string, unknown>;
  const nonce = record['cspNonce'];
  if (record['version'] !== 1 || typeof nonce !== 'string' || !NONCE_PATTERN.test(nonce)) return null;
  return { version: 1, cspNonce: nonce };
}

export interface RuntimeEnv {
  document: Document;
  window: Window & typeof globalThis;
  /** Creates the protocol endpoint; tests inject a fake. */
  createEndpoint?: (handlers: Pick<CanvasEndpointOptions, 'onInit' | 'onMessage' | 'onViolation'>) => CanvasEndpoint;
  ResizeObserverCtor?: typeof ResizeObserver | undefined;
  /** Schedules a layout pass for the next frame; defaults to `window.requestAnimationFrame`. Tests inject a manual queue. */
  requestFrame?: (callback: () => void) => number;
  cancelFrame?: (handle: number) => void;
  /** Minimum time between two hover reports. */
  hoverThrottleMs?: number;
}

export interface Runtime {
  close(): void;
}

const clampInt = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? Math.round(value) : min));

const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * Starts the runtime in `env.document`. Returns `null` (and does nothing) when the meta tag or the root element is missing or
 * invalid. Every message from the parent has already been validated by the endpoint; invalid ones never reach this code.
 */
export function startRuntime(env: RuntimeEnv = { document, window }): Runtime | null {
  const { document: doc, window: win } = env;
  const meta = readCanvasMeta(doc);
  const root = doc.getElementById(ROOT_ID);
  if (meta === null || root === null) return null;

  const createStyle = (id: string): HTMLStyleElement => {
    const style = doc.createElement('style');
    style.setAttribute('nonce', meta.cspNonce);
    style.id = id;
    doc.head.appendChild(style);
    return style;
  };
  const contentStyle = createStyle('blx-canvas-style');
  const chromeStyle = createStyle('blx-canvas-chrome');
  chromeStyle.textContent = CHROME_CSS;

  let endpoint: CanvasEndpoint | null = null;
  let lastRevision = -1;
  let selectedId: string | null = null;
  let hoveredId: string | null = null;
  let closed = false;
  let observer: ResizeObserver | null = null;
  let lastSize = '';
  let hoverWanted: string | null = null;
  let hoverSent: string | null = null;
  let hoverTimer: ReturnType<typeof setTimeout> | null = null;
  let lastHoverAt = Number.NEGATIVE_INFINITY;
  const throttle = env.hoverThrottleMs ?? 50;

  const send = (message: CanvasMessage): void => {
    endpoint?.send(message);
  };
  const fail = (code: CanvasErrorCode): void => {
    send({ type: 'error', code });
  };

  const mark = (attribute: string, id: string | null): void => {
    for (const element of Array.from(root.querySelectorAll(`[${attribute}]`))) element.removeAttribute(attribute);
    if (id === null) return;
    // `id` matched core's id pattern in the endpoint, so it is safe inside an attribute selector.
    root.querySelector(`[data-blx-id="${id}"]`)?.setAttribute(attribute, '');
  };

  const reportSize = (): void => {
    const element = doc.documentElement;
    const width = clampInt(element.clientWidth || win.innerWidth, 1, LIMITS.sizeMax);
    const height = clampInt(Math.max(element.scrollHeight, root.getBoundingClientRect().height), 1, LIMITS.sizeMax);
    const key = `${String(width)}x${String(height)}`;
    if (key !== lastSize) {
      lastSize = key;
      send({ type: 'size', width, height });
    }
  };

  /** The expensive part (one `getBoundingClientRect` per element): only ever run for an explicit `request-rects`. */
  const reportRects = (): void => {
    const items: ElementRect[] = [];
    for (const target of Array.from(root.querySelectorAll('[data-blx-id]'))) {
      if (items.length >= LIMITS.rectsMax) break;
      const id = target.getAttribute('data-blx-id');
      if (id === null || !isElementId(id)) continue;
      const box = target.getBoundingClientRect();
      const x = round2(box.left + win.scrollX);
      const y = round2(box.top + win.scrollY);
      const w = round2(box.width);
      const h = round2(box.height);
      const limit = LIMITS.coordinateMax;
      if ([x, y, w, h].some((n) => !Number.isFinite(n) || Math.abs(n) > limit) || w < 0 || h < 0) continue;
      items.push({ id, x, y, w, h });
    }
    send({ type: 'rects', revision: Math.max(lastRevision, 0), items });
  };

  // All layout reads of one frame happen in ONE pass: a render, any number of resize notifications and any number of
  // `request-rects` collapse into a single `requestAnimationFrame` callback (at most one size and one rects message).
  const requestFrame = env.requestFrame ?? ((callback: () => void) => win.requestAnimationFrame(callback));
  const cancelFrame =
    env.cancelFrame ??
    ((handle: number) => {
      win.cancelAnimationFrame(handle);
    });
  let frameHandle: number | null = null;
  let rectsWanted = false;
  let scrollWanted = false;
  const scheduleLayout = (): void => {
    if (closed || frameHandle !== null) return;
    frameHandle = requestFrame(() => {
      frameHandle = null;
      if (closed) return;
      reportSize();
      if (scrollWanted) {
        scrollWanted = false;
        const limit = LIMITS.coordinateMax;
        const x = Math.max(-limit, Math.min(limit, Number.isFinite(win.scrollX) ? win.scrollX : 0));
        const y = Math.max(-limit, Math.min(limit, Number.isFinite(win.scrollY) ? win.scrollY : 0));
        send({ type: 'scroll', x, y });
      }
      if (rectsWanted) {
        rectsWanted = false;
        reportRects();
      }
    });
  };

  const render = (html: string, css: string, revision: number): void => {
    if (revision < lastRevision) return; // an older answer that arrived late
    if (!isCssSafe(css)) {
      fail('unsafe-css');
      return;
    }
    try {
      const checked = checkHtml(html, doc);
      if (!checked.ok) {
        fail(checked.code);
        return;
      }
      contentStyle.textContent = css;
      root.replaceChildren(checked.fragment);
      lastRevision = revision;
      mark(SELECTED_ATTRIBUTE, selectedId);
      mark(HOVER_ATTRIBUTE, hoveredId);
      send({ type: 'rendered', revision });
      scrollWanted = true;
      scheduleLayout();
    } catch {
      fail('render-failed');
    }
  };

  const onMessage = (message: ParentMessage): void => {
    if (closed) return;
    switch (message.type) {
      case 'render':
        render(message.html, message.css, message.revision);
        break;
      case 'viewport':
        root.setAttribute('data-blx-breakpoint', message.breakpoint);
        break;
      case 'mode':
        root.setAttribute('data-blx-mode', message.mode);
        break;
      case 'select':
        selectedId = message.id;
        mark(SELECTED_ATTRIBUTE, selectedId);
        break;
      case 'hover':
        hoveredId = message.id;
        mark(HOVER_ATTRIBUTE, hoveredId);
        break;
      case 'scroll-to':
        root.querySelector(`[data-blx-id="${message.id}"]`)?.scrollIntoView({ block: 'center', inline: 'nearest' });
        break;
      case 'request-rects':
        rectsWanted = true;
        scheduleLayout();
        break;
      case 'ping':
        send({ type: 'pong', n: message.n });
        break;
    }
  };

  const onInit = (init: Init): void => {
    root.setAttribute('data-blx-mode', init.mode);
    root.setAttribute('data-blx-breakpoint', init.viewport.breakpoint);
    root.setAttribute('lang', init.locale.replace(/_/g, '-'));
    root.setAttribute('dir', init.dir);
    const Observer = env.ResizeObserverCtor ?? (typeof ResizeObserver === 'function' ? ResizeObserver : undefined);
    if (Observer !== undefined) {
      observer = new Observer(() => {
        scheduleLayout();
      });
      observer.observe(doc.documentElement);
      observer.observe(root);
    }
    send({ type: 'ready' });
    scrollWanted = true;
    scheduleLayout();
  };

  endpoint = (env.createEndpoint ?? defaultEndpoint(win))({
    onInit,
    onMessage,
    onViolation: () => {
      close();
    },
  });

  // ---- events in the canvas document -------------------------------------------------------------------------------
  const closestElement = (target: EventTarget | null, selector: string): Element | null =>
    target !== null && typeof (target as Element).closest === 'function' ? (target as Element).closest(selector) : null;

  const onClick = (event: MouseEvent): void => {
    if (closestElement(event.target, 'a, area') !== null) event.preventDefault(); // nothing navigates
    const holder = closestElement(event.target, '[data-blx-id]');
    const id = holder?.getAttribute('data-blx-id');
    if (id === null || id === undefined || !isElementId(id) || !root.contains(holder)) return;
    send({ type: 'pick', id, shift: event.shiftKey, alt: event.altKey });
  };
  const onAuxClick = (event: MouseEvent): void => {
    if (closestElement(event.target, 'a, area') !== null) event.preventDefault();
  };
  const onSubmit = (event: Event): void => {
    event.preventDefault();
  };

  const flushHover = (): void => {
    if (hoverWanted === hoverSent) return;
    hoverSent = hoverWanted;
    lastHoverAt = Date.now();
    send({ type: 'hover', id: hoverSent });
  };
  const queueHover = (id: string | null): void => {
    hoverWanted = id;
    if (hoverTimer !== null) return;
    const wait = lastHoverAt + throttle - Date.now();
    if (wait <= 0) {
      flushHover();
      return;
    }
    hoverTimer = setTimeout(() => {
      hoverTimer = null;
      if (!closed) flushHover();
    }, wait);
  };
  const onPointerOver = (event: Event): void => {
    const holder = closestElement(event.target, '[data-blx-id]');
    const id = holder?.getAttribute('data-blx-id');
    queueHover(id !== null && id !== undefined && isElementId(id) && root.contains(holder) ? id : null);
  };
  const onPointerLeave = (): void => {
    queueHover(null);
  };
  const onScroll = (): void => {
    scrollWanted = true;
    scheduleLayout();
  };

  doc.addEventListener('click', onClick, true);
  doc.addEventListener('auxclick', onAuxClick, true);
  doc.addEventListener('submit', onSubmit, true);
  doc.addEventListener('pointerover', onPointerOver, true);
  doc.documentElement.addEventListener('pointerleave', onPointerLeave);
  win.addEventListener('scroll', onScroll, { passive: true });

  function close(): void {
    if (closed) return;
    closed = true;
    doc.removeEventListener('click', onClick, true);
    doc.removeEventListener('auxclick', onAuxClick, true);
    doc.removeEventListener('submit', onSubmit, true);
    doc.removeEventListener('pointerover', onPointerOver, true);
    doc.documentElement.removeEventListener('pointerleave', onPointerLeave);
    win.removeEventListener('scroll', onScroll);
    if (hoverTimer !== null) clearTimeout(hoverTimer);
    if (frameHandle !== null) cancelFrame(frameHandle);
    frameHandle = null;
    observer?.disconnect();
    endpoint?.close();
  }

  if (!endpoint.connect()) close();
  return { close };
}

function defaultEndpoint(win: Window) {
  return (handlers: Pick<CanvasEndpointOptions, 'onInit' | 'onMessage' | 'onViolation'>): CanvasEndpoint =>
    createCanvasEndpoint({
      window: {
        addEventListener: (type, listener) => {
          win.addEventListener(type, listener as unknown as EventListener);
        },
        removeEventListener: (type, listener) => {
          win.removeEventListener(type, listener as unknown as EventListener);
        },
        parent: win.parent as unknown as PostTarget,
      } satisfies MessageSource & { parent: PostTarget },
      origin: win.location.origin,
      ...handlers,
    });
}

// The bundle entry: start as soon as the document is ready, but only in a canvas document (the meta tag is its marker), so
// importing this module in tests or in another page has no side effect.
if (typeof document !== 'undefined' && document.querySelector(`meta[name="${META_NAME}"]`) !== null) {
  const start = (): void => {
    startRuntime();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}
