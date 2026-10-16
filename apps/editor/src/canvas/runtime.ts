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
import { isSafeCanvasUrl } from '@blixis/wp-canvas-bridge';

export const ROOT_ID = 'blx-canvas-root';
export const META_NAME = 'blixis-canvas';
export const SELECTED_ATTRIBUTE = 'data-blx-selected';
export const HOVER_ATTRIBUTE = 'data-blx-hover';
const canvasScriptAtStart =
  typeof document === 'undefined' ? null : (document.currentScript as HTMLScriptElement | null);
const MAX_META_LENGTH = 1024;
const NONCE_PATTERN = /^[A-Za-z0-9+/_=-]{16,64}$/;

/** Selection and hover are drawn by this stylesheet (a nonce'd `<style>`), never by inline styles. */
const CHROME_CSS = `[${HOVER_ATTRIBUTE}]{outline:2px dashed #2563ebaa!important;outline-offset:-2px!important}a,area,button,input,textarea,select,summary,[role="button"],[tabindex]{cursor:default!important}/* Base rules Tiptap would inject as an un-nonced <style>, which the canvas CSP blocks (injectCSS is off). */.ProseMirror{position:relative;word-wrap:break-word;white-space:pre-wrap;white-space:break-spaces;font-variant-ligatures:none;font-feature-settings:"liga" 0;outline:none}.ProseMirror p{margin:0}.ProseMirror-hideselection *::selection{background:transparent}`;

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
  let hoveredId: string | null = null;
  let closed = false;
  let observer: ResizeObserver | null = null;
  let lastSize = '';
  let pointerDown: { x: number; y: number } | null = null;
  // The lazy bundle is loaded as a separately compiled IIFE; its narrow runtime surface is verified after the load event.
  /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
  let activeEdit: {
    id: string;
    prop: string;
    initial: unknown;
    caret?: number;
    element: HTMLElement;
    editor: any;
    destroy(): void;
  } | null = null;
  let richTextLoading: Promise<
    ((element: HTMLElement, value: unknown, host: Record<string, unknown>) => { editor: any; destroy(): void }) | null
  > | null = null;
  const ensureRichText = (): Promise<
    ((element: HTMLElement, value: unknown, host: Record<string, unknown>) => { editor: any; destroy(): void }) | null
  > => {
    if (richTextLoading) return richTextLoading;
    richTextLoading = new Promise((resolve) => {
      const current = canvasScriptAtStart ?? doc.querySelector<HTMLScriptElement>('script[data-blx-canvas]');
      if (!current?.nonce) {
        resolve(null);
        return;
      }
      const url = new URL(current.src, doc.baseURI);
      if (url.origin !== win.location.origin) {
        resolve(null);
        return;
      }
      url.pathname = url.pathname.replace(/canvas\.js$/, 'richtext.js');
      if (!url.pathname.endsWith('richtext.js')) {
        resolve(null);
        return;
      }
      const version = url.searchParams.get('ver');
      if (version) url.searchParams.set('ver', version);
      const script = doc.createElement('script');
      script.src = url.href;
      script.nonce = current.nonce;
      script.onload = () => {
        resolve((win as any).BlixisRichText?.mountRichText ?? null);
      };
      script.onerror = () => {
        resolve(null);
      };
      doc.head.appendChild(script);
    });
    return richTextLoading;
  };
  let hoverWanted: string | null = null;
  let hoverSent: string | null = null;
  let hoverTimer: ReturnType<typeof setTimeout> | null = null;
  let lastHoverAt = Number.NEGATIVE_INFINITY;
  const throttle = env.hoverThrottleMs ?? 50;

  const send = (message: CanvasMessage): void => {
    endpoint?.send(message);
  };
  const setAppearance = (mode: 'light' | 'dark'): void => {
    doc.documentElement.setAttribute('data-theme', mode);
    const colorScheme = doc.querySelector('meta[name="color-scheme"]');
    colorScheme?.setAttribute('content', mode);
    root.setAttribute('data-blx-mode', mode);
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
      for (const element of checked.fragment.querySelectorAll('[title]')) element.removeAttribute('title');
      contentStyle.textContent = css;
      root.replaceChildren(checked.fragment);
      lastRevision = revision;
      mark(HOVER_ATTRIBUTE, hoveredId);
      send({ type: 'rendered', revision });
      queueTokenColors(revision);
      scrollWanted = true;
      scheduleLayout();
    } catch {
      fail('render-failed');
    }
  };

  const activeTokenIds = (): ReadonlySet<string> => {
    const tokens = new Set<string>();
    const pattern = /\.blx-m(?:c|h)-([a-z][a-z0-9]*(?:-[a-z0-9]+)*)/g;
    for (const sheet of Array.from(doc.styleSheets)) {
      try {
        for (const rule of Array.from(sheet.cssRules)) {
          let match: RegExpExecArray | null;
          pattern.lastIndex = 0;
          while ((match = pattern.exec(rule.cssText)) !== null) if (match[1]) tokens.add(match[1]);
        }
      } catch {
        // Cross-origin theme styles cannot reveal token ids; local model conversion still enforces token id syntax.
      }
    }
    // jsdom does not expose CSSOM rules for nonce style elements; this also keeps token discovery deterministic there.
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(contentStyle.textContent)) !== null) if (match[1]) tokens.add(match[1]);
    for (const element of Array.from(root.querySelectorAll('[class]'))) {
      for (const className of (element.getAttribute('class') ?? '').split(/\s+/)) {
        const id = className.startsWith('blx-mc-') ? className.slice('blx-mc-'.length) : '';
        if (/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id)) tokens.add(id);
      }
    }
    return tokens;
  };
  const queueTokenColors = (revision?: number): void => {
    const mode = root.getAttribute('data-blx-mode');
    if (mode !== 'light' && mode !== 'dark') return;
    const knownIds = new Set(activeTokenIds());
    for (const match of contentStyle.textContent.matchAll(/\.blx-mc-([a-z][a-z0-9]*(?:-[a-z0-9]+)*)/g)) {
      const id = match[1];
      if (id) knownIds.add(id);
    }
    for (const element of Array.from(root.querySelectorAll('[class]'))) {
      for (const className of (element.getAttribute('class') ?? '').split(/\s+/)) {
        if (className.startsWith('blx-mc-')) knownIds.add(className.slice(7));
      }
    }
    const tokenIds = [...knownIds].slice(0, 64);
    if (tokenIds.length === 0) return;
    const colors = tokenIds.flatMap((id) => {
      const propertyId = id.startsWith('color-') ? id.slice('color-'.length) : id;
      const value = win.getComputedStyle(doc.documentElement).getPropertyValue(`--blx-color-${propertyId}`).trim();
      return value.length <= 40 &&
        /^(?:#[\da-fA-F]{3}|#[\da-fA-F]{6}(?:[\da-fA-F]{2})?|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)|hsla?\(\s*\d{1,3}(?:deg)?\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\))$/i.test(
          value,
        )
        ? [{ id, value }]
        : [];
    });
    send({ type: 'token-colors', mode, colors, ...(revision === undefined ? {} : { revision }) });
  };

  const onMessage = (message: ParentMessage): void => {
    if (closed) return;
    switch (message.type) {
      case 'render':
        if (activeEdit !== null) {
          deferredRender = { html: message.html, css: message.css, revision: message.revision };
          break;
        }
        render(message.html, message.css, message.revision);
        break;
      case 'edit-start':
        void startEdit(message);
        break;
      case 'edit-command':
        runEditCommand(message.name, message.args);
        break;
      case 'edit-end':
        finishEdit(message.commit ? 'commit' : 'cancel');
        break;
      case 'viewport':
        root.setAttribute('data-blx-breakpoint', message.breakpoint);
        break;
      case 'mode':
        setAppearance(message.mode);
        queueTokenColors(lastRevision < 0 ? undefined : lastRevision);
        break;
      case 'select':
        break;
      case 'hover':
        hoveredId = message.id;
        mark(HOVER_ATTRIBUTE, activeEdit === null ? hoveredId : null);
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

  let deferredRender: { html: string; css: string; revision: number } | null = null;
  const finishEdit = (reason: 'commit' | 'cancel') => {
    if (activeEdit === null) return;
    const session = activeEdit;
    activeEdit = null;
    session.destroy();
    mark(HOVER_ATTRIBUTE, hoveredId);
    send({ type: 'edit-ended', id: session.id, reason });
    if (deferredRender) {
      const pending = deferredRender;
      deferredRender = null;
      render(pending.html, pending.css, pending.revision);
    }
  };
  const startEdit = async (message: Extract<ParentMessage, { type: 'edit-start' }>) => {
    if (activeEdit !== null) {
      send({ type: 'edit-error', code: 'session-active' });
      return;
    }
    const element = root.querySelector<HTMLElement>(`[data-blx-id="${message.id}"]`);
    if (!element) {
      send({ type: 'edit-error', code: 'target-missing' });
      return;
    }
    const mount = await ensureRichText();
    if (!mount) {
      send({ type: 'edit-error', code: 'load-failed' });
      return;
    }
    if (closed) return;
    const session = mount(element, message.value, {
      multiline: message.mode === 'inline',
      onChange: (value: unknown) => {
        send({ type: 'edit-change', id: message.id, prop: message.prop, value });
      },
      onSelection: (value: any) => {
        send({
          type: 'edit-selection',
          id: message.id,
          empty: value.empty,
          marks: value.marks,
          text: value.text,
          rect: value.rect,
        });
      },
      onEnd: (reason: 'commit' | 'cancel') => {
        finishEdit(reason);
      },
      tokens: activeTokenIds(),
      caret: message.caret,
    });
    activeEdit = {
      id: message.id,
      prop: message.prop,
      initial: message.value,
      element,
      ...(message.caret === undefined ? {} : { caret: message.caret }),
      ...session,
    };
    mark(HOVER_ATTRIBUTE, null);
    send({ type: 'edit-ready', id: message.id, prop: message.prop });
  };
  const runEditCommand = (name: string, args?: Record<string, unknown>) => {
    const editor = activeEdit?.editor;
    if (!editor) return;
    const commands = editor.commands;
    if (name === 'apply-to-all' && typeof args?.['name'] === 'string') {
      const previous = editor.state.selection;
      editor.commands.selectAll();
      runEditCommand(args['name'], args['args'] as Record<string, unknown> | undefined);
      const max = editor.state.doc.content.size;
      const from = Math.min(previous.from, max);
      const to = Math.min(previous.to, max);
      editor.commands.setTextSelection({ from, to });
      editor.commands.focus();
      return;
    }
    if (name === 'focus-end') {
      commands.focus?.('end');
      return;
    }
    if (name === 'select-all') commands.selectAll?.();
    else if (name === 'collapse-selection') commands.setTextSelection?.(editor.state.selection.to);
    else if (name === 'clear-marks') commands.unsetAllMarks?.();
    else if (
      name === 'toggle-mark' &&
      typeof args?.['mark'] === 'string' &&
      ['bold', 'italic', 'underline', 'strike', 'code'].includes(args['mark'])
    )
      commands.toggleMark?.(args['mark']);
    else if (name === 'clear-link') commands.unsetMark?.('link');
    else if (name === 'set-link' && typeof args?.['href'] === 'string' && isSafeCanvasUrl(args['href']))
      commands.setMark?.('link', { href: args['href'], ...(args['newTab'] === true ? { target: '_blank' } : {}) });
    else if (name === 'set-style' && args) commands.setMark?.('blxStyle', args);
    commands.focus?.();
  };
  /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */

  const onInit = (init: Init): void => {
    setAppearance(init.mode);
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

  const INTERACTIVE =
    'a[href],area[href],button,input,textarea,select,option,summary,label,[role="button"],[tabindex],[contenteditable="true"],audio[controls],video[controls]';
  const ACTIVATABLE = 'a[href],area[href],button,input,summary,[role="button"],[tabindex]';
  const stop = (event: Event, prevent = true): void => {
    if (prevent && event.cancelable) event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  };
  const onClick = (event: MouseEvent): void => {
    const interactive = closestElement(event.target, INTERACTIVE);
    if (interactive !== null) stop(event); // activation, navigation, submission and native controls are editor picks only
    pick(event);
    if (pointerDown && Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 4) return;
    if (event.shiftKey || event.altKey || event.metaKey || event.ctrlKey || activeEdit !== null) return;
    const holder = closestElement(event.target, '[data-blx-id]') as HTMLElement | null;
    const id = holder?.getAttribute('data-blx-id');
    if (!holder || !id || !isElementId(id) || !root.contains(holder) || !/^H[1-6]$|^P$/.test(holder.tagName)) return;
    const caret = textOffsetAtPoint(holder, event.clientX, event.clientY);
    send({ type: 'edit-request', id, ...(caret === undefined ? {} : { caret }) });
  };
  const rememberPointerDown = (event: MouseEvent): void => {
    pointerDown = { x: event.clientX, y: event.clientY };
  };
  const textOffsetAtPoint = (holder: HTMLElement, x: number, y: number): number | undefined => {
    const docAny = doc as unknown as Record<string, unknown>;
    const positionGetter = docAny['caretPositionFromPoint'];
    const rangeGetter = docAny['caretRangeFromPoint'];
    const position =
      typeof positionGetter === 'function'
        ? (positionGetter.call(doc, x, y) as { offsetNode: Node; offset: number } | null)
        : null;
    const range = position || typeof rangeGetter !== 'function' ? null : (rangeGetter.call(doc, x, y) as Range | null);
    const node = position?.offsetNode ?? range?.startContainer;
    const offset = position?.offset ?? range?.startOffset;
    if (!node || offset === undefined || (!holder.contains(node) && node !== holder)) return undefined;
    const before = doc.createRange();
    try {
      before.selectNodeContents(holder);
      before.setEnd(
        node,
        Math.min(offset, node.nodeType === Node.TEXT_NODE ? (node.textContent?.length ?? 0) : node.childNodes.length),
      );
      return clampInt(before.toString().length, 0, 20_000);
    } catch {
      return undefined;
    }
  };
  const onAuxClick = (event: MouseEvent): void => {
    if (closestElement(event.target, INTERACTIVE) !== null) stop(event);
    pick(event);
  };
  const pick = (event: MouseEvent): void => {
    const holder = closestElement(event.target, '[data-blx-id]');
    const id = holder?.getAttribute('data-blx-id');
    if (id !== null && id !== undefined && isElementId(id) && root.contains(holder)) {
      send({ type: 'pick', id, shift: event.shiftKey, alt: event.altKey });
    }
  };
  const onContextMenu = (event: MouseEvent): void => {
    stop(event);
    pick(event);
  };
  const onSubmit = (event: Event): void => {
    stop(event);
  };
  const onKeyboard = (event: KeyboardEvent): void => {
    if (activeEdit?.element.contains(event.target as Node)) return;
    if ((event.ctrlKey || event.metaKey) && (event.key === 's' || event.key === 'S')) return;
    const editable = closestElement(event.target, 'input,textarea,select,option,[contenteditable="true"]');
    const activation =
      (event.key === 'Enter' || event.key === ' ') && closestElement(event.target, ACTIVATABLE) !== null;
    if (editable !== null || activation) {
      stop(event);
      if (activation && event.type === 'keydown') pick(event as unknown as MouseEvent);
    }
  };
  const onShortcut = (event: KeyboardEvent): void => {
    if (
      (event.ctrlKey || event.metaKey) &&
      !event.shiftKey &&
      !event.altKey &&
      (event.key === 's' || event.key === 'S')
    ) {
      event.preventDefault();
      if (!event.repeat) send({ type: 'shortcut', name: 'save' });
    }
  };
  const onPointerActivation = (event: Event): void => {
    // A press on the element's own padding (outside the inline editor) must not drop the focus out of the live session.
    if (
      event.type === 'mousedown' &&
      activeEdit !== null &&
      activeEdit.element.contains(event.target as Node) &&
      closestElement(event.target, '[data-blx-richtext-root]') === null
    ) {
      event.preventDefault();
      runEditCommand('focus-end');
      return;
    }
    if (
      activeEdit?.element.contains(event.target as Node) &&
      ['pointerdown', 'mousedown', 'touchstart'].includes(event.type)
    )
      return;
    if (activeEdit && !activeEdit.element.contains(event.target as Node)) finishEdit('commit');
    if (closestElement(event.target, INTERACTIVE) !== null) stop(event, event.type !== 'touchstart');
  };
  const onEditOutside = (event: Event): void => {
    if (activeEdit !== null && !activeEdit.element.contains(event.target as Node)) finishEdit('commit');
  };
  const onControlAction = (event: Event): void => {
    if (event.type === 'dblclick') {
      // A double click inside the live editor selects a word natively; restarting the session would drop the focus.
      if (activeEdit?.element.contains(event.target as Node)) return;
      const holder = closestElement(event.target, '[data-blx-id]');
      const id = holder?.getAttribute('data-blx-id');
      if (id && isElementId(id) && root.contains(holder)) {
        stop(event);
        send({ type: 'edit-request', id });
        return;
      }
    }
    const selector =
      event.type === 'dblclick'
        ? INTERACTIVE
        : 'input,textarea,select,option,details,summary,audio,video,[contenteditable="true"]';
    if (closestElement(event.target, selector) !== null) stop(event);
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
    if (activeEdit !== null) return;
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
  doc.addEventListener('mousedown', rememberPointerDown, true);
  doc.addEventListener('auxclick', onAuxClick, true);
  doc.addEventListener('contextmenu', onContextMenu, true);
  doc.addEventListener('submit', onSubmit, true);
  doc.addEventListener('reset', onSubmit, true);
  for (const type of ['keydown', 'keyup', 'keypress']) doc.addEventListener(type, onKeyboard as EventListener, true);
  doc.addEventListener('keydown', onShortcut, true);
  for (const type of ['pointerdown', 'mousedown', 'dragstart', 'drop', 'touchstart']) {
    doc.addEventListener(type, onPointerActivation, true);
  }
  doc.addEventListener('pointerdown', onEditOutside, true);
  for (const type of ['dblclick', 'change', 'input', 'toggle', 'play'])
    doc.addEventListener(type, onControlAction, true);
  doc.addEventListener('pointerover', onPointerOver, true);
  doc.documentElement.addEventListener('pointerleave', onPointerLeave);
  win.addEventListener('scroll', onScroll, { passive: true });

  function close(): void {
    if (closed) return;
    closed = true;
    activeEdit?.destroy();
    activeEdit = null;
    doc.removeEventListener('click', onClick, true);
    doc.removeEventListener('mousedown', rememberPointerDown, true);
    doc.removeEventListener('auxclick', onAuxClick, true);
    doc.removeEventListener('contextmenu', onContextMenu, true);
    doc.removeEventListener('submit', onSubmit, true);
    doc.removeEventListener('reset', onSubmit, true);
    for (const type of ['keydown', 'keyup', 'keypress'])
      doc.removeEventListener(type, onKeyboard as EventListener, true);
    doc.removeEventListener('keydown', onShortcut, true);
    for (const type of ['pointerdown', 'mousedown', 'dragstart', 'drop', 'touchstart']) {
      doc.removeEventListener(type, onPointerActivation, true);
    }
    doc.removeEventListener('pointerdown', onEditOutside, true);
    for (const type of ['dblclick', 'change', 'input', 'toggle', 'play'])
      doc.removeEventListener(type, onControlAction, true);
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
