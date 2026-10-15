import type {
  CanvasMessage,
  InitPayload,
  ParentEndpoint,
  ParentEndpointOptions,
  ParentMessage,
} from '@blixis/wp-canvas-bridge';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorApp } from '../App';
import type { ApiResult, PreviewRequestBody, PreviewResult, RestClient } from '../api/types';
import { CHROME_STORAGE_KEY } from '../chrome-theme';
import { axeViolations } from '../test/axe';
import { makeBootstrap } from '../test/fixtures';
import { fakeClient, makeDocument, makeStore, streamsOf } from '../test/state-helpers';

const CANVAS_URL = `${location.origin}/wp-admin/admin.php?page=blixis-canvas&post=42&locale=fr_FR`;

interface FakeEndpoint extends ParentEndpoint {
  options: ParentEndpointOptions;
  sent: ParentMessage[];
  init: InitPayload | null;
  srcAtConnect: string | null | undefined;
  closed: boolean;
  loads: number;
  deliver: (message: CanvasMessage) => void;
  violate: (reason: 'protocol-violation' | 'handshake-timeout' | 'handshake-failed') => void;
}

function fakeEndpoints() {
  const created: FakeEndpoint[] = [];
  const create = (options: ParentEndpointOptions): ParentEndpoint => {
    const endpoint: FakeEndpoint = {
      options,
      sent: [],
      init: null,
      srcAtConnect: undefined,
      closed: false,
      loads: 0,
      state: 'idle',
      connect(init) {
        endpoint.init = init;
        endpoint.srcAtConnect = (options.iframe as HTMLIFrameElement).getAttribute('src');
        return true;
      },
      reset: () => undefined,
      notifyLoad() {
        endpoint.loads += 1;
      },
      send(message) {
        if (endpoint.closed) return false;
        endpoint.sent.push(message);
        return true;
      },
      close() {
        endpoint.closed = true;
      },
      deliver(message) {
        act(() => {
          options.onMessage(message);
        });
      },
      violate(reason) {
        act(() => {
          options.onViolation(reason);
        });
      },
    };
    created.push(endpoint);
    return endpoint;
  };
  return {
    created,
    create,
    last: (): FakeEndpoint => {
      const endpoint = created[created.length - 1];
      if (endpoint === undefined) throw new Error('no endpoint was created');
      return endpoint;
    },
  };
}

interface Pending {
  body: PreviewRequestBody;
  signal: AbortSignal | undefined;
  resolve: (result: ApiResult<PreviewResult>) => void;
}

function previewResult(html: string, mode: 'light' | 'dark' = 'light'): ApiResult<PreviewResult> {
  return {
    ok: true,
    value: {
      html,
      css: '.x{color:red}',
      locale: 'fr_FR',
      mode,
      layoutRevision: 1,
      contentRevision: 1,
      source: 'request',
    },
  };
}

function setup(
  options: { canvasUrl?: string | null; editorLocale?: string; withClient?: boolean; neverLoad?: boolean } = {},
) {
  const document_ = makeDocument();
  const base = fakeClient({
    ...streamsOf(document_),
    ...(options.neverLoad === true ? { layout: () => new Promise<never>(() => undefined) } : {}),
  });
  const pending: Pending[] = [];
  const calls: PreviewRequestBody[] = [];
  const client: RestClient = {
    ...base,
    preview: (body, opts) => {
      calls.push(body);
      return new Promise((resolve) => {
        pending.push({ body, signal: opts?.signal, resolve });
      });
    },
  };
  const { store } = makeStore({ deps: { client } });
  const endpoints = fakeEndpoints();
  const bootstrap = makeBootstrap({
    ...(options.canvasUrl === null ? {} : { canvasUrl: options.canvasUrl ?? CANVAS_URL }),
    ...(options.editorLocale === undefined ? {} : { editorLocale: options.editorLocale }),
  });
  const view = render(
    <EditorApp
      bootstrap={bootstrap}
      store={store}
      {...(options.withClient === false ? {} : { client })}
      canvas={{ createEndpoint: endpoints.create, debounceMs: 150 }}
    />,
  );
  return { store, client, pending, calls, endpoints, view, bootstrap };
}

const flush = async (ms = 0) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

const frame = (): HTMLIFrameElement => {
  const element = document.querySelector('iframe');
  if (element === null) throw new Error('no canvas iframe');
  return element;
};

/** Loads the document and completes the handshake. */
async function ready(s: ReturnType<typeof setup>) {
  await flush(0);
  s.endpoints.last().deliver({ type: 'ready' });
  await flush(0);
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('canvas availability', () => {
  it('keeps the placeholder without a canvas URL or without a client', () => {
    const a = setup({ canvasUrl: null });
    expect(screen.getByText('Canvas arrives with the canvas protocol.')).toBeTruthy();
    expect(screen.queryByTitle(/^Page preview/)).toBeNull();
    expect(a.endpoints.created).toHaveLength(0);
    a.view.unmount();
    const b = setup({ withClient: false });
    expect(screen.getByText('Canvas arrives with the canvas protocol.')).toBeTruthy();
    expect(b.endpoints.created).toHaveLength(0);
  });
});

describe('handshake wiring', () => {
  it('renders a titled sandboxed iframe and starts the handshake before the document loads', async () => {
    const s = setup();
    await flush(0);
    const iframe = frame();
    expect(iframe.tagName).toBe('IFRAME');
    expect(iframe.getAttribute('title')).toBe('Page preview (French (France))');
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin');
    const src = new URL(iframe.getAttribute('src') ?? '');
    expect(src.origin).toBe(location.origin);
    expect(src.searchParams.get('page')).toBe('blixis-canvas');
    expect(src.searchParams.get('locale')).toBe('fr_FR');
    expect(s.endpoints.created).toHaveLength(1);
    const endpoint = s.endpoints.last();
    expect(endpoint.options.origin).toBe(location.origin);
    expect(endpoint.options.iframe).toBe(iframe);
    expect(endpoint.srcAtConnect).toBeNull(); // the endpoint listens before the canvas document can load
    expect(endpoint.init).toEqual({
      viewport: { width: 1280, breakpoint: 'base' },
      mode: 'light',
      locale: 'fr_FR',
      dir: 'ltr',
    });
    expect(screen.getByRole('status').textContent).toBe('Connecting to the preview...');
  });

  it('hides the connecting status after ready and requests the first preview', async () => {
    const s = setup();
    await flush(0);
    expect(s.calls).toHaveLength(0); // not connected yet
    s.endpoints.last().deliver({ type: 'ready' });
    await flush(0);
    expect(screen.queryByTestId('canvas-connecting')).toBeNull();
    expect(s.calls).toEqual([{ document: s.store.getState().document, locale: 'fr_FR', mode: 'light' }]);
    expect(s.endpoints.last().sent.slice(0, 4)).toEqual([
      { type: 'viewport', width: 1280, breakpoint: 'base' },
      { type: 'mode', mode: 'light' },
      { type: 'select', id: null },
      { type: 'hover', id: null },
    ]);
  });

  it('does not request a preview while the document is not ready', async () => {
    const s = setup({ neverLoad: true });
    await flush(0);
    expect(s.store.getState().status).toBe('loading');
    s.endpoints.last().deliver({ type: 'ready' });
    await flush(500);
    expect(s.calls).toHaveLength(0);
    expect(s.pending).toHaveLength(0);
  });

  it('uses only the REST client (no raw fetch) and no window.postMessage', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const post = vi.spyOn(window, 'postMessage');
    const s = setup();
    await ready(s);
    s.pending[0]?.resolve(previewResult('<p data-blx-id="el-text-1">x</p>'));
    await flush(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('preview requests', () => {
  it('sends the preview result as a render message with a revision', async () => {
    const s = setup();
    await ready(s);
    s.pending[0]?.resolve(previewResult('<p data-blx-id="el-text-1">x</p>'));
    await flush(0);
    const render_ = s.endpoints.last().sent.find((m) => m.type === 'render');
    expect(render_).toEqual({
      type: 'render',
      html: '<p data-blx-id="el-text-1">x</p>',
      css: '.x{color:red}',
      revision: 1,
    });
  });

  it('debounces document changes by 150 ms, aborts the previous request and ignores stale answers', async () => {
    const s = setup();
    await ready(s);
    expect(s.pending).toHaveLength(1);
    const first = s.pending[0];
    act(() => {
      s.store.getState().dispatch({ type: 'update-props', id: 'el-heading-1', set: { level: 3 } });
    });
    expect(first?.signal?.aborted).toBe(true); // a change cancels the request in flight
    act(() => {
      s.store.getState().dispatch({ type: 'update-props', id: 'el-heading-1', set: { level: 4 } });
    });
    await flush(149);
    expect(s.pending).toHaveLength(1);
    await flush(1);
    expect(s.pending).toHaveLength(2);
    expect(s.calls[1]?.document).toBe(s.store.getState().document);
    // the aborted first request answers late, after the second one was sent: it must not be rendered
    first?.resolve(previewResult('<p data-blx-id="el-text-1">stale</p>'));
    await flush(0);
    expect(s.endpoints.last().sent.filter((m) => m.type === 'render')).toEqual([]);
    s.pending[1]?.resolve(previewResult('<p data-blx-id="el-text-1">fresh</p>'));
    await flush(0);
    const renders = s.endpoints.last().sent.filter((m) => m.type === 'render');
    expect(renders).toEqual([
      { type: 'render', html: '<p data-blx-id="el-text-1">fresh</p>', css: '.x{color:red}', revision: 2 },
    ]);
  });

  it('ignores an older answer even when its request was not aborted', async () => {
    const s = setup();
    await ready(s);
    const first = s.pending[0];
    // simulate a client that ignores the abort signal: the first answer comes back after the second request started
    act(() => {
      s.store.getState().dispatch({ type: 'update-props', id: 'el-heading-1', set: { level: 3 } });
    });
    await flush(150);
    s.pending[1]?.resolve(previewResult('<p data-blx-id="el-text-1">two</p>'));
    await flush(0);
    first?.resolve(previewResult('<p data-blx-id="el-text-1">one</p>'));
    await flush(0);
    const renders = s.endpoints.last().sent.filter((m) => m.type === 'render');
    expect(renders).toHaveLength(1);
    expect(renders[0]).toMatchObject({ revision: 2 });
  });

  it('requests a new preview when undo changes the document', async () => {
    const s = setup();
    await ready(s);
    s.pending[0]?.resolve(previewResult('<p data-blx-id="el-text-1">x</p>'));
    act(() => {
      s.store.getState().dispatch({ type: 'update-props', id: 'el-heading-1', set: { level: 3 } });
    });
    await flush(150);
    expect(s.calls).toHaveLength(2);
    act(() => {
      s.store.getState().undo();
    });
    await flush(150);
    expect(s.calls).toHaveLength(3);
  });
});

describe('viewport and preview appearance', () => {
  it('sizes the frame and tells the canvas when the viewport changes', async () => {
    const s = setup();
    await ready(s);
    const endpoint = s.endpoints.last();
    expect(frame().style.getPropertyValue('--blx-frame-width')).toBe('');
    fireEvent.click(screen.getByRole('radio', { name: 'Tablet' }));
    expect(frame().style.getPropertyValue('--blx-frame-width')).toBe('768px');
    expect(frame().getAttribute('data-viewport')).toBe('tablet');
    expect(endpoint.sent.at(-1)).toEqual({ type: 'viewport', width: 768, breakpoint: 'tablet' });
    fireEvent.click(screen.getByRole('radio', { name: 'Mobile' }));
    expect(frame().style.getPropertyValue('--blx-frame-width')).toBe('375px');
    expect(endpoint.sent.at(-1)).toEqual({ type: 'viewport', width: 375, breakpoint: 'mobile' });
    fireEvent.click(screen.getByRole('radio', { name: 'Desktop' }));
    expect(frame().style.getPropertyValue('--blx-frame-width')).toBe('');
    expect(endpoint.sent.at(-1)).toEqual({ type: 'viewport', width: 1280, breakpoint: 'base' });
  });

  it('has a separate preview appearance group that drives mode and the preview, not the editor chrome', async () => {
    const s = setup();
    await ready(s);
    s.pending[0]?.resolve(previewResult('<p data-blx-id="el-text-1">x</p>'));
    // the same single-choice pattern as the viewport control: a radio group of role=radio / aria-checked
    const group = screen.getByRole('radiogroup', { name: 'Preview appearance' });
    const light = within(group).getByRole('radio', { name: 'Light' });
    const dark = within(group).getByRole('radio', { name: 'Dark' });
    expect(group.contains(light) && group.contains(dark)).toBe(true);
    expect(light.getAttribute('aria-checked')).toBe('true');
    expect(dark.getAttribute('aria-checked')).toBe('false');
    expect(light.hasAttribute('aria-pressed')).toBe(false);
    const viewportGroup = screen.getByRole('radiogroup', { name: 'Preview width' });
    expect(viewportGroup.querySelectorAll('[role="radio"][aria-checked]')).toHaveLength(3);
    const root = screen.getByTestId('editor-root');
    const chrome = root.getAttribute('data-editor-theme');
    fireEvent.click(dark);
    expect(dark.getAttribute('aria-checked')).toBe('true');
    expect(light.getAttribute('aria-checked')).toBe('false');
    expect(s.store.getState().previewMode).toBe('dark');
    expect(s.endpoints.last().sent.at(-1)).toEqual({ type: 'mode', mode: 'dark' });
    expect(frame().getAttribute('data-preview-mode')).toBe('dark');
    // the editor chrome and the document element are untouched
    expect(root.getAttribute('data-editor-theme')).toBe(chrome);
    expect(localStorage.getItem(CHROME_STORAGE_KEY)).toBeNull();
    expect(document.documentElement.hasAttribute('data-editor-theme')).toBe(false);
    await flush(150);
    expect(s.calls.at(-1)).toMatchObject({ mode: 'dark', locale: 'fr_FR' });
  });

  it('reconnects with a new frame when the content language changes, and not for editor language', async () => {
    const s = setup();
    await ready(s);
    const first = s.endpoints.last();
    act(() => {
      s.store.getState().setContentLocale('en_US');
    });
    await flush(0);
    expect(first.closed).toBe(true);
    expect(s.endpoints.created).toHaveLength(2);
    const second = s.endpoints.last();
    expect(second.init).toMatchObject({ locale: 'en_US' });
    expect(new URL(frame().getAttribute('src') ?? '').searchParams.get('locale')).toBe('en_US');
    expect(frame().getAttribute('title')).toBe('Page preview (American English)');
  });
});

describe('selection and hover', () => {
  it('forwards store selection and hover to the canvas', async () => {
    const s = setup();
    await ready(s);
    const endpoint = s.endpoints.last();
    act(() => {
      s.store.getState().select('el-heading-1');
    });
    expect(endpoint.sent.at(-1)).toEqual({ type: 'select', id: 'el-heading-1' });
    act(() => {
      s.store.getState().hover('el-text-1');
    });
    expect(endpoint.sent.at(-1)).toEqual({ type: 'hover', id: 'el-text-1' });
    act(() => {
      s.store.getState().clearSelection();
    });
    expect(endpoint.sent.at(-1)).toEqual({ type: 'select', id: null });
  });

  it('maps pick to selection and hover to the hovered id; unknown ids are refused by the store', async () => {
    const s = setup();
    await ready(s);
    const endpoint = s.endpoints.last();
    endpoint.deliver({ type: 'pick', id: 'el-text-1', shift: true, alt: true });
    expect(s.store.getState().selectedId).toBe('el-text-1');
    endpoint.deliver({ type: 'pick', id: 'el-unknown-9', shift: false, alt: false });
    expect(s.store.getState().selectedId).toBe('el-text-1');
    endpoint.deliver({ type: 'hover', id: 'el-heading-1' });
    expect(s.store.getState().hoveredId).toBe('el-heading-1');
    endpoint.deliver({ type: 'hover', id: null });
    expect(s.store.getState().hoveredId).toBeNull();
    expect(screen.getByTestId('inspector-selection').textContent).toContain('el-text-1');
  });

  it('moves focus out of the iframe after a pick', async () => {
    const s = setup();
    await ready(s);
    frame().focus();
    expect(document.activeElement).toBe(frame());
    s.endpoints.last().deliver({ type: 'pick', id: 'el-text-1', shift: false, alt: false });
    expect(document.activeElement).toBe(screen.getByRole('main'));
  });

  it('records the reported size and ignores rects and pong for now', async () => {
    const s = setup();
    await ready(s);
    const endpoint = s.endpoints.last();
    endpoint.deliver({ type: 'size', width: 900, height: 1200 });
    endpoint.deliver({ type: 'rects', revision: 1, items: [] });
    endpoint.deliver({ type: 'pong', n: 1 });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('requests selected rectangles, subtracts reported canvas scroll, and clips them to the frame wrapper', async () => {
    const s = setup();
    await ready(s);
    const endpoint = s.endpoints.last();
    s.pending[0]?.resolve(previewResult('<p data-blx-id="el-text-1">x</p>'));
    await flush(0);
    endpoint.deliver({ type: 'rendered', revision: 1 });
    act(() => {
      s.store.getState().select('el-text-1');
    });
    endpoint.deliver({ type: 'size', width: 900, height: 1200 });
    await flush(20);
    expect(endpoint.sent.filter((message) => message.type === 'request-rects')).toEqual([
      { type: 'request-rects', revision: 1 },
    ]);
    endpoint.deliver({ type: 'rects', revision: 1, items: [{ id: 'el-text-1', x: 12, y: 120, w: 100, h: 24 }] });
    endpoint.deliver({ type: 'scroll', x: 0, y: 40 });
    const overlay = screen.getByTestId('selection-overlay');
    expect(overlay.getAttribute('style')).toContain('top: 80px');
    expect(screen.getByTestId('canvas-overlay-viewport').className).toContain('blx-overlay-viewport');
  });

  it('renders an accessible ancestor breadcrumb and clicking an ancestor changes selection', async () => {
    const s = setup();
    await ready(s);
    act(() => {
      s.store.getState().select('el-heading-1');
    });
    const breadcrumb = screen.getByRole('navigation', { name: 'Selected element path' });
    const items = within(breadcrumb).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(within(breadcrumb).getAllByRole('button', { current: 'location' })).toHaveLength(1);
    expect(
      within(breadcrumb)
        .getByRole('button', { name: /Heading.*el-heading/ })
        .getAttribute('title'),
    ).toBe('el-heading-1');
    fireEvent.click(within(breadcrumb).getByRole('button', { name: /Section.*el-section-1/ }));
    expect(s.store.getState().selectedId).toBe('el-section-1');
  });

  it('does not ask for rectangle scans on hover or when no element is selected', async () => {
    const s = setup();
    await ready(s);
    const endpoint = s.endpoints.last();
    endpoint.deliver({ type: 'size', width: 900, height: 1200 });
    act(() => {
      s.store.getState().hover('el-text-1');
    });
    await flush(20);
    expect(endpoint.sent.filter((message) => message.type === 'request-rects')).toEqual([]);
  });

  it('filters NaN, out-of-contract and foreign rectangle ids at the session boundary', async () => {
    const s = setup();
    await ready(s);
    const endpoint = s.endpoints.last();
    s.pending[0]?.resolve(previewResult('<p data-blx-id="el-text-1">x</p>'));
    await flush(0);
    endpoint.deliver({ type: 'rendered', revision: 1 });
    act(() => {
      s.store.getState().select('el-text-1');
    });
    await flush(20);
    endpoint.deliver({
      type: 'rects',
      revision: 1,
      items: [
        { id: 'el-text-1', x: 2, y: 3, w: 10, h: 11 },
        { id: 'el-text-1', x: Number.NaN, y: 3, w: 10, h: 11 },
        { id: 'el-text-1', x: 1_000_001, y: 3, w: 10, h: 11 },
        { id: 'el-heading-1', x: 2, y: 3, w: 10, h: 11 },
      ],
    });
    expect(screen.getByTestId('selection-overlay').getAttribute('style')).toContain('left: 2px');
    expect(screen.getAllByTestId('selection-overlay')).toHaveLength(1);
  });

  it('accepts rectangles for the canvas last-rendered revision after the next preview fails', async () => {
    const s = setup();
    await ready(s);
    const endpoint = s.endpoints.last();
    s.pending[0]?.resolve(previewResult('<p data-blx-id="el-text-1">x</p>'));
    await flush(0);
    endpoint.deliver({ type: 'rendered', revision: 1 });
    act(() => {
      s.store.getState().select('el-text-1');
    });
    await flush(20);
    act(() => {
      s.store.getState().dispatch({ type: 'update-props', id: 'el-heading-1', set: { level: 3 } });
    });
    await flush(150);
    s.pending[1]?.resolve({ ok: false, error: { kind: 'network' } });
    await flush(0);
    endpoint.deliver({ type: 'rects', revision: 1, items: [{ id: 'el-text-1', x: 2, y: 3, w: 10, h: 11 }] });
    expect(screen.getByTestId('selection-overlay').getAttribute('style')).toContain('left: 2px');
  });
});

describe('error states', () => {
  it('shows a catalog message for a failed preview, never server text, and retries', async () => {
    const s = setup();
    await ready(s);
    s.pending[0]?.resolve({
      ok: false,
      error: { kind: 'http', status: 500, code: 'blixis_preview_failed', data: { detail: 'SECRET-SERVER-TEXT' } },
    });
    await flush(0);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('The preview could not be updated.');
    expect(alert.textContent).toContain('Something went wrong while building the preview. Try again later.');
    expect(alert.textContent).not.toContain('SECRET');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await flush(0);
    expect(s.pending).toHaveLength(2);
    s.pending[1]?.resolve(previewResult('<p data-blx-id="el-text-1">ok</p>'));
    await flush(0);
    s.endpoints.last().deliver({ type: 'rendered', revision: 2 });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each([
    [{ kind: 'network' }, 'The server could not be reached'],
    [{ kind: 'http', status: 401 }, 'Your session has expired'],
    [{ kind: 'http', status: 403, code: 'rest_cookie_invalid_nonce' }, 'Your session has expired'],
    [{ kind: 'http', status: 403 }, 'not allowed to preview'],
    [{ kind: 'http', status: 423 }, 'locked by another editing session'],
    [{ kind: 'http', status: 429 }, 'Too many preview requests'],
    [{ kind: 'invalid-response' }, 'could not be used'],
    [{ kind: 'too-large' }, 'could not be used'],
  ] as const)('maps %j to a catalog text', async (error, text) => {
    const s = setup();
    await ready(s);
    s.pending[0]?.resolve({ ok: false, error });
    await flush(0);
    expect(screen.getByRole('alert').textContent).toContain(text);
  });

  it('ignores aborted requests and shows an error when the canvas refuses the content', async () => {
    const s = setup();
    await ready(s);
    s.pending[0]?.resolve({ ok: false, error: { kind: 'aborted' } });
    await flush(0);
    expect(screen.queryByRole('alert')).toBeNull();
    s.endpoints.last().deliver({ type: 'error', code: 'unsafe-html' });
    expect(screen.getByRole('alert').textContent).toContain('refused because its content is not safe');
  });

  it('shows an invalid-preview error when the protocol refuses the answer', async () => {
    const s = setup();
    await ready(s);
    s.endpoints.last().send = () => false; // what the real endpoint does for an oversized or malformed render
    s.pending[0]?.resolve(previewResult('x'));
    await flush(0);
    expect(screen.getByRole('alert').textContent).toContain('could not be used');
  });

  it('shows the protocol violation and reloads the frame on request', async () => {
    const s = setup();
    await ready(s);
    s.endpoints.last().violate('protocol-violation');
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('The preview was disconnected.');
    expect(alert.textContent).toContain('unexpected data');
    const before = frame();
    fireEvent.click(screen.getByRole('button', { name: 'Reload the preview' }));
    await flush(0);
    expect(s.endpoints.created).toHaveLength(2);
    expect(s.endpoints.created[0]?.closed).toBe(true);
    expect(frame()).not.toBe(before);
    expect(screen.queryByTestId('canvas-connection-error')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('Connecting to the preview...');
  });

  it('shows a timeout when the canvas never answers', async () => {
    const s = setup();
    await flush(0);
    s.endpoints.last().violate('handshake-timeout');
    expect(screen.getByRole('alert').textContent).toContain('The preview did not start.');
    await flush(1000);
    expect(s.calls).toHaveLength(0);
  });
});

describe('lifecycle', () => {
  it('cancels a queued rectangle request on unmount', async () => {
    const s = setup();
    await ready(s);
    const endpoint = s.endpoints.last();
    act(() => {
      s.store.getState().select('el-text-1');
    });
    s.view.unmount();
    await flush(100);
    expect(endpoint.sent.some((message) => message.type === 'request-rects')).toBe(false);
  });

  it('closes the endpoint, cancels timers and aborts the request on unmount', async () => {
    const s = setup();
    await ready(s);
    const request = s.pending[0];
    act(() => {
      s.store.getState().dispatch({ type: 'update-props', id: 'el-heading-1', set: { level: 3 } });
    });
    s.view.unmount();
    expect(s.endpoints.last().closed).toBe(true);
    expect(request?.signal?.aborted).toBe(true);
    await flush(1000);
    expect(s.pending).toHaveLength(1); // the debounced request never ran
    request?.resolve(previewResult('<p data-blx-id="el-text-1">late</p>'));
    await flush(0);
    expect(s.endpoints.last().sent.filter((m) => m.type === 'render')).toEqual([]);
  });

  it('does not send after a violation', async () => {
    const s = setup();
    await ready(s);
    s.endpoints.last().violate('protocol-violation');
    const sent = s.endpoints.last().sent.length;
    act(() => {
      s.store.getState().select('el-text-1');
    });
    expect(s.endpoints.last().sent.length).toBe(sent);
  });
});

describe('frame reloads', () => {
  it('tells the endpoint about every load of the iframe', async () => {
    const s = setup();
    await ready(s);
    fireEvent.load(frame());
    fireEvent.load(frame());
    expect(s.endpoints.last().loads).toBe(2);
  });

  it('shows connecting again after a reload and re-sends everything the new document needs on ready', async () => {
    const s = setup();
    await ready(s);
    s.pending[0]?.resolve(previewResult('<p data-blx-id="el-text-1">x</p>'));
    await flush(0);
    const endpoint = s.endpoints.last();
    act(() => {
      s.store.getState().select('el-heading-1');
    });
    fireEvent.click(screen.getByRole('radio', { name: 'Tablet' }));
    await flush(0);
    s.pending.length = 0;
    s.calls.length = 0;
    // the endpoint went back to waiting: the canvas document reloaded
    act(() => {
      endpoint.options.onState?.('waiting');
    });
    expect(screen.getByTestId('canvas-connecting')).toBeTruthy();
    expect(frame().getAttribute('data-session')).toBe('connecting');
    // nothing is requested or sent while the new document has not said ready
    act(() => {
      s.store.getState().select('el-text-1');
    });
    await flush(500);
    expect(s.calls).toHaveLength(0);
    endpoint.sent.length = 0;
    endpoint.deliver({ type: 'ready' });
    await flush(0);
    expect(screen.queryByTestId('canvas-connecting')).toBeNull();
    expect(endpoint.sent).toEqual([
      { type: 'viewport', width: 768, breakpoint: 'tablet' },
      { type: 'mode', mode: 'light' },
      { type: 'select', id: 'el-text-1' },
      { type: 'hover', id: null },
      expect.objectContaining({ type: 'render', html: '<p data-blx-id="el-text-1">x</p>' }),
    ]);
    expect(s.calls).toHaveLength(0); // the last render is re-sent, the server is not asked again
  });

  it('fetches a fresh preview after the reload when the document changed while disconnected', async () => {
    const s = setup();
    await ready(s);
    s.pending[0]?.resolve(previewResult('<p data-blx-id="el-text-1">x</p>'));
    await flush(0);
    const endpoint = s.endpoints.last();
    act(() => {
      endpoint.options.onState?.('waiting');
    });
    act(() => {
      s.store.getState().dispatch({ type: 'update-props', id: 'el-heading-1', set: { level: 3 } });
    });
    await flush(300);
    expect(s.calls).toHaveLength(1); // only the first preview so far
    endpoint.sent.length = 0;
    endpoint.deliver({ type: 'ready' });
    await flush(0);
    expect(s.calls).toHaveLength(2);
    expect(endpoint.sent.some((m) => m.type === 'render')).toBe(false); // not the stale render
    s.pending[1]?.resolve(previewResult('<p data-blx-id="el-text-1">y</p>'));
    await flush(0);
    expect(endpoint.sent.at(-1)).toMatchObject({ type: 'render', html: '<p data-blx-id="el-text-1">y</p>' });
  });

  it('aborts an in-flight preview on reload and fetches again once ready', async () => {
    const s = setup();
    await ready(s);
    const endpoint = s.endpoints.last();
    const inFlight = s.pending[0];
    act(() => {
      endpoint.options.onState?.('waiting');
    });
    expect(inFlight?.signal?.aborted).toBe(true);
    endpoint.deliver({ type: 'ready' });
    await flush(0);
    expect(s.calls).toHaveLength(2);
  });

  it('recovers from a timeout when the frame reloads', async () => {
    const s = setup();
    await flush(0);
    const endpoint = s.endpoints.last();
    endpoint.violate('handshake-timeout');
    expect(screen.getByTestId('canvas-connection-error')).toBeTruthy();
    act(() => {
      endpoint.options.onState?.('waiting');
    });
    expect(screen.queryByTestId('canvas-connection-error')).toBeNull();
    expect(screen.getByTestId('canvas-connecting')).toBeTruthy();
  });

  it('gives the endpoint current values for a handshake after a reload', async () => {
    const s = setup();
    await flush(0);
    const getInit = s.endpoints.last().options.getInit;
    expect(getInit?.()).toEqual({
      viewport: { width: 1280, breakpoint: 'base' },
      mode: 'light',
      locale: 'fr_FR',
      dir: 'ltr',
    });
    act(() => {
      s.store.getState().setPreviewMode('dark');
    });
    expect(getInit?.()).toMatchObject({ mode: 'dark' });
  });
});

describe('desktop width follows the area', () => {
  class Observed {
    static instances: Observed[] = [];
    targets: Element[] = [];
    disconnected = false;
    constructor(readonly callback: () => void) {
      Observed.instances.push(this);
    }
    observe(target: Element) {
      this.targets.push(target);
    }
    unobserve() {
      /* noop */
    }
    disconnect() {
      this.disconnected = true;
    }
  }
  beforeEach(() => {
    Observed.instances = [];
    vi.stubGlobal('ResizeObserver', Observed);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const setWidth = (width: number) => {
    Object.defineProperty(frame(), 'clientWidth', { value: width, configurable: true });
  };

  it('measures again when the container resizes, once per animation frame, and only for the desktop viewport', async () => {
    const s = setup();
    await ready(s);
    const observer = Observed.instances.find((o) => o.targets.length === 1 && o.targets[0] === frame().parentElement);
    expect(observer).toBeDefined();
    const endpoint = s.endpoints.last();
    endpoint.sent.length = 0;
    setWidth(900);
    act(() => {
      for (let i = 0; i < 10; i += 1) observer?.callback();
    });
    expect(endpoint.sent).toEqual([]); // throttled to the next frame
    await flush(20);
    expect(endpoint.sent).toEqual([{ type: 'viewport', width: 900, breakpoint: 'base' }]);
    // an unchanged width sends nothing
    act(() => {
      observer?.callback();
    });
    await flush(20);
    expect(endpoint.sent).toHaveLength(1);
    // tablet has a fixed width: resizing the area does not matter
    fireEvent.click(screen.getByRole('radio', { name: 'Tablet' }));
    endpoint.sent.length = 0;
    setWidth(700);
    act(() => {
      observer?.callback();
    });
    await flush(20);
    expect(endpoint.sent).toEqual([]);
  });

  it('does not send before ready and disconnects its observer', async () => {
    const s = setup();
    await flush(0);
    const observer = Observed.instances.find((o) => o.targets.includes(frame().parentElement as Element));
    setWidth(900);
    act(() => {
      observer?.callback();
    });
    await flush(20);
    expect(s.endpoints.last().sent).toEqual([]);
    s.view.unmount();
    expect(observer?.disconnected).toBe(true);
  });

  it('positions the clipped overlay wrapper on the iframe content box without scaling', async () => {
    const s = setup();
    await ready(s);
    const iframe = frame();
    const stage = screen.getByTestId('canvas-stage');
    const rect = (left: number, top: number, width: number, height: number): DOMRect => ({
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
      x: left,
      y: top,
      toJSON: () => ({}),
    });
    vi.spyOn(iframe, 'getBoundingClientRect').mockReturnValue(rect(100, 50, 500, 700));
    vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue(rect(20, 10, 800, 900));
    Object.defineProperties(iframe, {
      clientLeft: { value: 1, configurable: true },
      clientTop: { value: 1, configurable: true },
      clientWidth: { value: 498, configurable: true },
      clientHeight: { value: 698, configurable: true },
    });
    const observer = Observed.instances.find(
      (value) => value.targets.includes(stage) && value.targets.includes(iframe),
    );
    act(() => {
      observer?.callback();
      s.store.getState().select('el-text-1');
    });
    expect(screen.getByTestId('canvas-overlay-viewport').getAttribute('style')).toContain('left: 81px');
    expect(screen.getByTestId('canvas-overlay-viewport').getAttribute('style')).toContain('top: 41px');
    expect(screen.getByTestId('canvas-overlay-viewport').getAttribute('style')).toContain('width: 498px');
    expect(screen.getByTestId('canvas-overlay-viewport').getAttribute('style')).toContain('height: 698px');
  });
});

describe('localisation and accessibility', () => {
  it('uses the Dutch catalog for the editor language while the content language stays', async () => {
    const s = setup({ editorLocale: 'nl_NL' });
    await flush(0);
    expect(screen.getByRole('radiogroup', { name: 'Weergave van de voorvertoning' })).toBeTruthy();
    expect(
      within(screen.getByRole('radiogroup', { name: 'Weergave van de voorvertoning' })).getByRole('radio', {
        name: 'Licht',
      }),
    ).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Verbinden met de voorvertoning...');
    expect(frame().getAttribute('title')).toBe('Voorvertoning van de pagina (Frans (Frankrijk))');
    expect(s.endpoints.last().init).toMatchObject({ locale: 'fr_FR' });
  });

  it('is axe clean while connecting, ready and failed', async () => {
    vi.useRealTimers();
    const s = setup();
    await act(async () => {
      await Promise.resolve();
    });
    expect(await axeViolations(screen.getByTestId('editor-root'))).toEqual([]);
    s.endpoints.last().violate('protocol-violation');
    expect(await axeViolations(screen.getByTestId('editor-root'))).toEqual([]);
    vi.useFakeTimers();
  });

  it('is axe clean with a canvas breadcrumb and a collapsed tree node', async () => {
    const s = setup();
    await ready(s);
    act(() => {
      s.store.getState().select('el-heading-1');
      s.store.getState().setExpanded('el-section-2', false);
    });
    expect(screen.getByRole('navigation', { name: 'Selected element path' })).toBeTruthy();
    expect(screen.getByRole('treeitem', { name: /el-section-2/ }).getAttribute('aria-expanded')).toBe('false');
    vi.useRealTimers();
    expect(await axeViolations(screen.getByTestId('editor-root'))).toEqual([]);
    vi.useFakeTimers();
  });

  it('keeps the iframe keyboard reachable and named', async () => {
    setup();
    await flush(0);
    expect(frame().hasAttribute('tabindex')).toBe(false);
    expect(frame().getAttribute('title')?.length).toBeGreaterThan(3);
  });
});
