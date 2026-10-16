import {
  createParentEndpoint,
  LIMITS,
  type CanvasMessage,
  type EndpointState,
  type ParentEndpoint,
  type ParentEndpointOptions,
  type ViolationReason,
} from '@blixis/wp-canvas-bridge';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiError, RestClient } from '../api/types';
import { directionOf } from '../i18n';
import { createCoreRegistry } from '@blixis/wp-element-registry';
import { findPath, nodeAt, validateRichText, type Json, type RichText } from '@blixis/wp-core';
import { isDirty, type EditorStore, type Viewport } from '../state';

/** Debounce between the last document change and the preview request. */
export const PREVIEW_DEBOUNCE_MS = 150;

/** Width of the canvas frame per viewport in CSS px; `null` fills the available width. The content is not scaled. */
export const FRAME_WIDTHS: Readonly<Record<Viewport, number | null>> = { desktop: null, tablet: 768, mobile: 375 };

/** Width reported to the canvas when the frame fills the area and has no layout (tests, hidden panel). */
const FALLBACK_WIDTH = 1280;

/** `requestAnimationFrame` with a timer fallback, so layout reads happen at most once per frame and also work in tests. */
const frames = {
  request: (callback: () => void): number =>
    typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame(callback)
      : (setTimeout(callback, 16) as unknown as number),
  cancel: (handle: number): void => {
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(handle);
    else clearTimeout(handle);
  },
};

export type CanvasStatus = 'connecting' | 'ready' | 'timeout' | 'violation';

/** Why the last preview update failed; mapped to catalog texts by the component, never to server text. */
export type PreviewProblem =
  'offline' | 'unauthenticated' | 'forbidden' | 'locked' | 'rate-limited' | 'invalid' | 'server' | 'canvas';

export function problemOf(error: ApiError): PreviewProblem | null {
  if (error.kind === 'aborted') return null;
  if (error.kind === 'network') return 'offline';
  if (error.kind === 'invalid-response' || error.kind === 'too-large') return 'invalid';
  if (error.status === 401 || (error.status === 403 && error.code === 'rest_cookie_invalid_nonce')) {
    return 'unauthenticated';
  }
  if (error.status === 403) return 'forbidden';
  if (error.status === 423) return 'locked';
  if (error.status === 429) return 'rate-limited';
  if (error.status === 400 || error.status === 413 || error.status === 422) return 'invalid';
  return 'server';
}

interface Snapshot {
  owner: HTMLIFrameElement | null;
  status: CanvasStatus;
  problem: PreviewProblem | null;
  contentSize: { width: number; height: number } | null;
  rects: readonly { id: string; x: number; y: number; w: number; h: number }[];
  scroll: { x: number; y: number };
}
const INITIAL: Snapshot = {
  owner: null,
  status: 'connecting',
  problem: null,
  contentSize: null,
  rects: [],
  scroll: { x: 0, y: 0 },
};
const EMPTY_TOKEN_COLORS: CanvasSession['tokenColors'] = Object.freeze({});

export type CreateParentEndpoint = (options: ParentEndpointOptions) => ParentEndpoint;

export interface CanvasSessionOptions {
  store: EditorStore;
  client: RestClient;
  /** The iframe element; `null` until it is mounted. */
  frame: HTMLIFrameElement | null;
  /** The canvas document URL; assigned to the iframe only after the endpoint listens, so the hello cannot be missed. */
  src: string;
  /** Changes to restart the whole session (a new iframe element is expected with it). */
  attempt: number;
  /** Replaced in tests with a fake endpoint. */
  createEndpoint?: CreateParentEndpoint;
  debounceMs?: number;
  editingEnabled?: boolean;
  inlineEditing?: boolean;
}

export interface CanvasSession {
  status: CanvasStatus;
  problem: PreviewProblem | null;
  /** Last size the canvas reported (informational). */
  contentSize: { width: number; height: number } | null;
  rects: Snapshot['rects'];
  scroll: Snapshot['scroll'];
  /** Requests a new preview now (after a failed one). */
  refresh: () => void;
  editSession: { id: string; prop: string; status: 'loading' | 'ready'; value?: string | RichText } | null;
  editSelection: Extract<CanvasMessage, { type: 'edit-selection' }> | null;
  tokenColors: Partial<Record<'light' | 'dark', Readonly<Record<string, string>>>>;
  startEdit: (id: string, prop: string) => void;
  endEdit: (commit: boolean) => void;
  sendEditCommand: (name: string, args?: Record<string, unknown>) => void;
}

/**
 * Connects the store to one canvas iframe. It owns the handshake, the debounced preview request (previous request aborted,
 * stale answers ignored through a request counter), and forwards viewport, appearance, selection and hover to the canvas and
 * the canvas' pick/hover back to the store. Only `client.preview` talks to the server.
 */
export function useCanvasSession(options: CanvasSessionOptions): CanvasSession {
  const { store, client, frame, src, attempt } = options;
  const create = options.createEndpoint ?? createParentEndpoint;
  const debounceMs = options.debounceMs ?? PREVIEW_DEBOUNCE_MS;
  // The snapshot belongs to one iframe element: a new element starts from the initial state without resetting in an effect.
  const [snapshot, setSnapshot] = useState<Snapshot>(INITIAL);
  const [editSession, setEditSession] = useState<CanvasSession['editSession']>(null);
  const [editSelection, setEditSelection] = useState<CanvasSession['editSelection']>(null);
  const [tokenColorSnapshot, setTokenColors] = useState<{
    owner: HTMLIFrameElement | null;
    values: CanvasSession['tokenColors'];
  }>({ owner: null, values: {} });
  const tokenColors = tokenColorSnapshot.owner === frame ? tokenColorSnapshot.values : EMPTY_TOKEN_COLORS;
  const controls = useRef<{
    start: (id: string, prop: string) => void;
    end: (commit: boolean) => void;
    command: (name: string, args?: Record<string, unknown>) => void;
  }>({ start: () => undefined, end: () => undefined, command: () => undefined });
  const current = snapshot.owner === frame ? snapshot : INITIAL;
  const refreshRef = useRef<() => void>(() => undefined);
  const refresh = useCallback(() => {
    refreshRef.current();
  }, []);

  useEffect(() => {
    if (!frame?.isConnected) return;
    const update = (patch: Partial<Omit<Snapshot, 'owner'>>): void => {
      setSnapshot((previous) => ({ ...(previous.owner === frame ? previous : INITIAL), ...patch, owner: frame }));
    };

    let disposed = false;
    let ready = false;
    let started = false;
    // The last answer that was sent to the canvas, and whether the document changed (or a request was lost) since.
    let lastRender: { html: string; css: string; revision: number } | null = null;
    let lastRenderedRevision = 0;
    let dirty = false;
    let lastWidth = 0;
    let rectHandle: number | null = null;
    const requestRects = (): void => {
      if (rectHandle !== null) return;
      rectHandle = frames.request(() => {
        rectHandle = null;
        const state = store.getState();
        if (disposed || !ready || (state.selectedId === null && state.hoveredId === null)) {
          update({ rects: [] });
          return;
        }
        endpoint.send({ type: 'request-rects', revision: lastRenderedRevision });
      });
    };
    let counter = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let controller: AbortController | null = null;
    let editing: { id: string; prop: string; last: unknown; sessionId: string } | null = null;
    let saveAfterEditCommit = false;
    const registry = createCoreRegistry();
    const startEdit = (id: string, prop: string, caret?: number) => {
      const state = store.getState();
      if (
        options.editingEnabled === false ||
        options.inlineEditing === false ||
        state.document === null ||
        editing !== null
      )
        return;
      const path = findPath(state.document.root, id);
      const node = path === null ? undefined : nodeAt(state.document.root, path);
      if (!node || node.props['locked'] === true) return;
      const definition = registry.get(node.type);
      const property = definition?.props[prop];
      if (property?.kind !== 'text' || property.classification !== 'translatable') return;
      const value = state.document.translations[state.contentLocale]?.[id]?.values[prop] ?? node.props[prop] ?? '';
      const sessionId = `${id}-${Date.now().toString(36)}`;
      editing = { id, prop, last: value, sessionId };
      setEditSession({ id, prop, status: 'loading' });
      endpoint.send({
        type: 'edit-start',
        id,
        prop,
        value: value,
        editable: true,
        mode: node.type === 'blixis/text' ? 'inline' : 'single-line',
        locale: state.contentLocale,
        dir: directionOf(state.contentLocale),
        ...(caret === undefined ? {} : { caret }),
      });
    };
    const endEdit = (commit: boolean) => {
      if (editing) endpoint.send({ type: 'edit-end', commit });
    };
    controls.current = {
      start: startEdit,
      end: endEdit,
      command: (name, args) => {
        if (editing) endpoint.send({ type: 'edit-command', name, ...(args === undefined ? {} : { args }) });
      },
    };

    const viewportNow = () => {
      const state = store.getState();
      const fixed = FRAME_WIDTHS[state.viewport];
      const measured = frame.clientWidth > 0 ? frame.clientWidth : FALLBACK_WIDTH;
      const width = Math.min(LIMITS.viewportWidthMax, Math.max(LIMITS.viewportWidthMin, fixed ?? measured));
      return { width, breakpoint: state.breakpointId };
    };

    const cancelPending = (): void => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      controller?.abort();
      controller = null;
    };

    const run = (): void => {
      timer = null;
      const state = store.getState();
      if (disposed || !ready || state.status !== 'ready' || state.document === null) return;
      counter += 1;
      const revision = counter;
      controller?.abort();
      const own = new AbortController();
      controller = own;
      void client
        .preview(
          { document: state.document, locale: state.contentLocale, mode: state.previewMode },
          { signal: own.signal },
        )
        .then((result) => {
          if (disposed || revision !== counter || own.signal.aborted) return; // stale or cancelled
          if (controller === own) controller = null;
          if (!result.ok) {
            const next = problemOf(result.error);
            if (next !== null) update({ problem: next });
            return;
          }
          const render = { html: result.value.html, css: result.value.css, revision };
          dirty = false;
          lastRenderedRevision = revision;
          lastRender = render;
          if (!endpoint.send({ type: 'render', ...render })) update({ problem: 'invalid' });
        });
    };

    const schedule = (delay: number): void => {
      if (disposed) return;
      if (!ready) {
        dirty = true; // a change while (re)connecting: the next ready fetches a fresh preview
        return;
      }
      if (timer !== null) clearTimeout(timer);
      controller?.abort();
      controller = null;
      timer = setTimeout(run, delay);
    };
    refreshRef.current = () => {
      schedule(0);
    };

    const onMessage = (message: CanvasMessage): void => {
      if (disposed) return;
      switch (message.type) {
        case 'shortcut':
          if (options.editingEnabled !== false && store.getState().saveStatus !== 'saving') {
            if (editing) {
              saveAfterEditCommit = true;
              endEdit(true);
            } else if (isDirty(store.getState())) {
              void store.getState().saveDraft();
            }
          }
          break;
        case 'ready': {
          ready = true;
          const state = store.getState();
          // The canvas document is new (first load or a reload): everything it keeps is sent again.
          const view = viewportNow();
          lastWidth = view.width;
          endpoint.send({ type: 'viewport', width: view.width, breakpoint: view.breakpoint });
          endpoint.send({ type: 'mode', mode: state.previewMode });
          endpoint.send({ type: 'select', id: state.selectedId });
          endpoint.send({ type: 'hover', id: state.hoveredId });
          update({ status: 'ready', problem: null });
          requestRects();
          if (lastRender !== null && !dirty) endpoint.send({ type: 'render', ...lastRender });
          else schedule(0);
          break;
        }
        case 'rendered':
          if (message.revision === counter) {
            lastRenderedRevision = message.revision;
            update({ problem: null });
            requestRects();
          }
          break;
        case 'size':
          update({ contentSize: { width: message.width, height: message.height } });
          requestRects();
          break;
        case 'scroll':
          update({ scroll: { x: message.x, y: message.y } });
          break;
        case 'pick':
          // Shift and Alt are reserved for multi-select and duplicate; ignored for now.
          if (editing && message.id !== editing.id) endEdit(true);
          store.getState().select(message.id);
          // A click inside the live editor keeps the caret in the canvas; any other pick hands the focus back to the host.
          if (!editing || message.id !== editing.id) releaseFocus(frame);
          break;
        case 'hover':
          store.getState().hover(message.id);
          break;
        case 'error':
          update({ problem: 'canvas' });
          break;
        case 'edit-request': {
          if (options.inlineEditing === false) break;
          const current = store.getState().document;
          const path = current ? findPath(current.root, message.id) : null;
          const node = current && path ? nodeAt(current.root, path) : undefined;
          store.getState().select(message.id);
          const prop = node?.type === 'blixis/button' ? 'label' : 'text';
          startEdit(message.id, prop, message.caret);
          break;
        }
        case 'edit-ready':
          if (editing?.id === message.id && editing.prop === message.prop)
            setEditSession({ id: message.id, prop: message.prop, status: 'ready' });
          break;
        case 'edit-selection':
          if (editing?.id === message.id) setEditSelection(message);
          break;
        case 'token-colors':
          setTokenColors((previous) => ({
            owner: frame,
            values: {
              ...(previous.owner === frame ? previous.values : {}),
              [message.mode]: Object.fromEntries(message.colors.map(({ id, value }) => [id, value])),
            },
          }));
          break;
        case 'edit-change': {
          if (editing?.id !== message.id || editing.prop !== message.prop) break;
          const value = typeof message.value === 'string' ? message.value : validateRichText(message.value);
          if (typeof value !== 'string' && !value.ok) {
            endpoint.send({ type: 'edit-end', commit: false });
            break;
          }
          const clean = typeof value === 'string' ? value : value.value;
          editing.last = clean;
          setEditSession({ id: editing.id, prop: editing.prop, status: 'ready', value: clean });
          break;
        }
        case 'edit-ended':
          if (editing?.id === message.id) {
            if (message.reason === 'commit') {
              const { id, prop, last } = editing;
              const locale = store.getState().contentLocale;
              const key = `rich:${id}:${prop}:${locale}`;
              store
                .getState()
                .dispatch(
                  { type: 'set-translation', locale, elementId: id, set: { [prop]: last as Json } },
                  { coalesceKey: key, coalesceWindowMs: 60_000 },
                );
              store.getState().finishCoalescing();
            }
            editing = null;
            setEditSession(null);
            setEditSelection(null);
            requestRects();
            if (saveAfterEditCommit) {
              saveAfterEditCommit = false;
              if (store.getState().saveStatus !== 'saving' && isDirty(store.getState()))
                void store.getState().saveDraft();
            }
          }
          break;
        case 'edit-error':
          if (editing) {
            editing = null;
            setEditSession(null);
            setEditSelection(null);
          }
          break;
        case 'rects':
          if (message.revision === lastRenderedRevision) {
            const state = store.getState();
            const valid = new Set([state.selectedId, state.hoveredId].filter((id): id is string => id !== null));
            const rects = message.items.filter(
              (item) =>
                valid.has(item.id) &&
                [item.x, item.y, item.w, item.h].every(Number.isFinite) &&
                Math.abs(item.x) <= LIMITS.coordinateMax &&
                Math.abs(item.y) <= LIMITS.coordinateMax &&
                item.w >= 0 &&
                item.h >= 0 &&
                item.w <= LIMITS.coordinateMax &&
                item.h <= LIMITS.coordinateMax,
            );
            update({ rects });
          }
          break;
        case 'pong':
          break;
      }
    };
    // The endpoint went back to `waiting` after it was connected: the canvas document reloaded.
    const onState = (state: EndpointState): void => {
      if (disposed || !started || state !== 'waiting') return;
      dirty = dirty || timer !== null || controller !== null;
      ready = false;
      cancelPending();
      update({ status: 'connecting', problem: null, contentSize: null });
    };
    const onViolation = (reason: ViolationReason): void => {
      if (disposed) return;
      ready = false;
      cancelPending();
      update({ status: reason === 'handshake-timeout' ? 'timeout' : 'violation' });
    };

    const initial = store.getState();
    const endpoint: ParentEndpoint = create({
      window,
      iframe: frame,
      origin: window.location.origin,
      onMessage,
      onViolation,
      onState,
      getInit: () => {
        const state = store.getState();
        return {
          viewport: viewportNow(),
          mode: state.previewMode,
          locale: state.contentLocale,
          dir: directionOf(state.contentLocale),
        };
      },
    });
    endpoint.connect({
      viewport: viewportNow(),
      mode: initial.previewMode,
      locale: initial.contentLocale,
      dir: directionOf(initial.contentLocale),
    });
    started = true;
    // The endpoint listens now; only then does the canvas document load. The first `load` is that document, every later one
    // a reload (the user's "Reload Frame", a navigation inside the frame).
    const onLoad = (): void => {
      if (!disposed) endpoint.notifyLoad();
    };
    frame.addEventListener('load', onLoad);
    frame.setAttribute('src', src);

    // The desktop viewport fills the area, so its width follows the window and the panels: measured at most once per frame.
    const container = frame.parentElement ?? frame;
    let measureHandle: number | null = null;
    const measure = (): void => {
      measureHandle = null;
      if (disposed || !ready || store.getState().viewport !== 'desktop') return;
      const view = viewportNow();
      if (view.width === lastWidth) return;
      lastWidth = view.width;
      endpoint.send({ type: 'viewport', width: view.width, breakpoint: view.breakpoint });
    };
    const onResize = (): void => {
      measureHandle ??= frames.request(measure);
    };
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(onResize) : null;
    observer?.observe(container);

    const unsubscribeDocument = store.getState().subscribe(() => {
      schedule(debounceMs);
    });
    const unsubscribeStore = store.subscribe((state, previous) => {
      if (!ready) return;
      if (state.viewport !== previous.viewport || state.breakpointId !== previous.breakpointId) {
        const view = viewportNow();
        lastWidth = view.width;
        endpoint.send({ type: 'viewport', width: view.width, breakpoint: view.breakpoint });
      }
      if (state.previewMode !== previous.previewMode) {
        endpoint.send({ type: 'mode', mode: state.previewMode });
        schedule(debounceMs);
      }
      if (state.selectedId !== previous.selectedId) endpoint.send({ type: 'select', id: state.selectedId });
      if (editing && state.selectedId !== editing.id) endEdit(true);
      if (state.hoveredId !== previous.hoveredId) {
        endpoint.send({ type: 'hover', id: state.hoveredId });
        requestRects();
      }
      if (state.selectedId !== previous.selectedId) {
        update({ rects: [] });
        requestRects();
      }
      if (state.status === 'ready' && previous.status !== 'ready') schedule(debounceMs);
    });

    return () => {
      disposed = true;
      ready = false;
      unsubscribeDocument();
      unsubscribeStore();
      observer?.disconnect();
      if (measureHandle !== null) frames.cancel(measureHandle);
      if (rectHandle !== null) frames.cancel(rectHandle);
      frame.removeEventListener('load', onLoad);
      cancelPending();
      refreshRef.current = () => undefined;
      endpoint.close();
    };
  }, [frame, store, client, src, attempt, create, debounceMs, options.editingEnabled, options.inlineEditing]);

  return {
    status: current.status,
    problem: current.problem,
    contentSize: current.contentSize,
    rects: current.rects,
    scroll: current.scroll,
    refresh,
    editSession,
    editSelection,
    tokenColors,
    startEdit: (id, prop) => {
      controls.current.start(id, prop);
    },
    endEdit: (commit) => {
      controls.current.end(commit);
    },
    sendEditCommand: (name, args) => {
      controls.current.command(name, args);
    },
  };
}

/**
 * Clicking inside the iframe moves keyboard focus into it. After a pick the focus goes back to the surrounding canvas region
 * so keyboard and screen reader users are not left inside the preview document.
 */
function releaseFocus(frame: HTMLIFrameElement): void {
  if (frame.ownerDocument.activeElement !== frame) return;
  frame.closest<HTMLElement>('.blx-main')?.focus({ preventScroll: true });
}
