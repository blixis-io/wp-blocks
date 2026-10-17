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

const linkForm = (): HTMLFormElement => {
  const form = screen.getByLabelText('URL').closest('form');
  if (!form) throw new Error('missing link popover form');
  return form;
};

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
  options: {
    canvasUrl?: string | null;
    editorLocale?: string;
    withClient?: boolean;
    neverLoad?: boolean;
    editingEnabled?: boolean;
  } = {},
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
    ...(options.editingEnabled === undefined ? {} : { editingEnabled: options.editingEnabled }),
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
  it('handles the canvas save shortcut only when editable and waits for an inline commit before saving', async () => {
    const s = setup();
    await ready(s);
    const save = vi.fn(() => Promise.resolve());
    s.store.setState({ saveDraft: save });
    const endpoint = s.endpoints.last();
    endpoint.deliver({ type: 'shortcut', name: 'save' });
    expect(save).not.toHaveBeenCalled();
    act(() => void s.store.getState().dispatch({ type: 'update-props', id: 'el-heading-1', set: { level: 3 } }));
    endpoint.deliver({ type: 'shortcut', name: 'save' });
    expect(save).toHaveBeenCalledOnce();
    save.mockClear();
    endpoint.deliver({ type: 'edit-request', id: 'el-heading-1' });
    endpoint.deliver({ type: 'edit-change', id: 'el-heading-1', prop: 'text', value: 'Committed heading' });
    endpoint.deliver({ type: 'shortcut', name: 'save' });
    expect(endpoint.sent).toContainEqual({ type: 'edit-end', commit: true });
    expect(save).not.toHaveBeenCalled();
    endpoint.deliver({ type: 'edit-ended', id: 'el-heading-1', reason: 'commit' });
    expect(s.store.getState().document?.translations['fr_FR']?.['el-heading-1']?.values['text']).toBe(
      'Committed heading',
    );
    expect(save).toHaveBeenCalledOnce();
  });

  it('ignores canvas save shortcuts in read-only mode', async () => {
    const s = setup({ editingEnabled: false });
    await ready(s);
    const save = vi.fn(() => Promise.resolve());
    s.store.setState({ saveDraft: save });
    s.endpoints.last().deliver({ type: 'shortcut', name: 'save' });
    expect(save).not.toHaveBeenCalled();
  });

  it('commits an active inline edit before an empty-canvas pick clears selection', async () => {
    const s = setup();
    await ready(s);
    const endpoint = s.endpoints.last();
    act(() => {
      s.store.getState().select('el-heading-1');
    });
    endpoint.sent.length = 0;
    endpoint.deliver({ type: 'edit-request', id: 'el-heading-1' });
    endpoint.deliver({ type: 'pick', id: null, shift: false, alt: false });
    expect(endpoint.sent).toContainEqual({ type: 'edit-end', commit: true });
    expect(s.store.getState().selectedId).toBeNull();
    expect(s.store.getState().hoveredId).toBeNull();
    expect(endpoint.sent.findIndex((message) => message.type === 'edit-end')).toBeLessThan(
      endpoint.sent.findIndex((message) => message.type === 'select' && message.id === null),
    );
  });

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
    expect(screen.getByText('Connecting to the preview...')).toBeTruthy();
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
  it.each([
    ['Italic', 'toggle-mark', { mark: 'italic' }],
    ['Underline', 'toggle-mark', { mark: 'underline' }],
    ['Strikethrough', 'toggle-mark', { mark: 'strike' }],
  ])('dispatches the exact %s toolbar command', async (label, name, args) => {
    const s = setup();
    await ready(s);
    const endpoint = s.endpoints.last();
    endpoint.deliver({ type: 'edit-request', id: 'el-heading-1' });
    endpoint.deliver({
      type: 'edit-selection',
      id: 'el-heading-1',
      empty: false,
      marks: {},
      text: 'Hello',
      rect: { x: 30, y: 20, w: 30, h: 24 },
    });
    fireEvent.click(
      within(screen.getByRole('toolbar', { name: 'Text formatting' })).getByRole('button', { name: label }),
    );
    expect(endpoint.sent).toContainEqual({ type: 'edit-command', name, args });
  });

  it.each([
    ['Text color', 'Primary', 'set-style', { color: 'color-primary' }],
    ['Text color', 'Default', 'set-style', { color: null }],
    ['Background highlight', 'Surface', 'set-style', { highlight: 'color-surface' }],
    ['Background highlight', 'None', 'set-style', { highlight: null }],
  ])('dispatches exact %s option %s command', async (triggerLabel, optionLabel, name, args) => {
    const s = setup();
    await ready(s);
    const endpoint = s.endpoints.last();
    endpoint.deliver({ type: 'edit-request', id: 'el-heading-1' });
    endpoint.deliver({
      type: 'edit-selection',
      id: 'el-heading-1',
      empty: false,
      marks: {},
      text: 'Hello',
      rect: { x: 30, y: 20, w: 30, h: 24 },
    });
    fireEvent.click(screen.getByRole('button', { name: triggerLabel }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: optionLabel }));
    expect(endpoint.sent).toContainEqual({ type: 'edit-command', name, args });
  });

  it('toggles the inline code mark from the compact format toolbar', async () => {
    const s = setup();
    await ready(s);
    const endpoint = s.endpoints.last();
    endpoint.deliver({ type: 'edit-request', id: 'el-heading-1' });
    endpoint.deliver({
      type: 'edit-selection',
      id: 'el-heading-1',
      empty: false,
      marks: {},
      text: 'Hello',
      rect: { x: 30, y: 20, w: 30, h: 24 },
    });
    fireEvent.click(within(screen.getByTestId('format-toolbar')).getByRole('button', { name: 'Code' }));
    expect(endpoint.sent).toContainEqual({ type: 'edit-command', name: 'toggle-mark', args: { mark: 'code' } });
  });

  it('renders resolved swatches from the selected website appearance without exposing token ids', async () => {
    const s = setup();
    await ready(s);
    const endpoint = s.endpoints.last();
    endpoint.deliver({ type: 'token-colors', mode: 'light', colors: [{ id: 'color-primary', value: '#112233' }] });
    endpoint.deliver({ type: 'token-colors', mode: 'dark', colors: [{ id: 'color-primary', value: '#abcdef' }] });
    endpoint.deliver({ type: 'edit-request', id: 'el-heading-1' });
    endpoint.deliver({
      type: 'edit-selection',
      id: 'el-heading-1',
      empty: false,
      marks: {},
      text: 'Hello',
      rect: { x: 30, y: 20, w: 30, h: 24 },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Text color' }));
    const primary = screen.getByRole('menuitemradio', { name: 'Primary' });
    expect(primary.textContent).not.toContain('color-primary');
    expect(primary.querySelector('.blx-format-swatch')).toBeTruthy();
    expect(primary.getAttribute('aria-checked')).toBe('false');
    expect(primary.querySelector('.blx-format-swatch')?.getAttribute('style')).toContain('#112233');
    vi.useRealTimers();
    expect(await axeViolations(screen.getByRole('toolbar', { name: 'Text formatting' }))).toEqual([]);
    expect(await axeViolations(screen.getByRole('menu', { name: 'Text color' }))).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Text color' }));
    fireEvent.click(screen.getByRole('button', { name: 'Background highlight' }));
    expect(await axeViolations(screen.getByRole('menu', { name: 'Background highlight' }))).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Background highlight' }));
    fireEvent.click(screen.getByRole('button', { name: 'Link' }));
    expect(await axeViolations(linkForm())).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Link' }));
    fireEvent.click(screen.getByRole('button', { name: 'Text color' }));
    act(() => {
      s.store.getState().setPreviewMode('dark');
    });
    expect(
      screen.getByRole('menuitemradio', { name: 'Primary' }).querySelector('.blx-format-swatch')?.getAttribute('style'),
    ).toContain('#abcdef');
    expect(await axeViolations(screen.getByRole('toolbar', { name: 'Text formatting' }))).toEqual([]);
    expect(await axeViolations(screen.getByRole('menu', { name: 'Text color' }))).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Text color' }));
    fireEvent.click(screen.getByRole('button', { name: 'Background highlight' }));
    expect(await axeViolations(screen.getByRole('menu', { name: 'Background highlight' }))).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Background highlight' }));
    fireEvent.click(screen.getByRole('button', { name: 'Link' }));
    expect(await axeViolations(linkForm())).toEqual([]);
  });
  it('shows the inline toolbar only for a non-empty edit selection and dispatches mark commands', async () => {
    const s = setup();
    await ready(s);
    const endpoint = s.endpoints.last();
    endpoint.deliver({ type: 'edit-request', id: 'el-heading-1' });
    expect(screen.queryByRole('toolbar', { name: 'Text formatting' })).toBeNull();
    endpoint.deliver({
      type: 'edit-selection',
      id: 'el-heading-1',
      empty: false,
      marks: { strong: false },
      text: 'Hello',
      rect: { x: 30, y: 20, w: 0, h: 24 },
    });
    const toolbar = screen.getByRole('toolbar', { name: 'Text formatting' });
    expect(toolbar).toBeTruthy();
    expect(within(toolbar).getByRole('button', { name: 'Bold' }).getAttribute('aria-pressed')).toBe('false');
    const activeBeforeMouseDown = document.activeElement;
    fireEvent.mouseDown(toolbar);
    expect(document.activeElement).toBe(activeBeforeMouseDown);
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Bold' }));
    expect(endpoint.sent).toContainEqual({ type: 'edit-command', name: 'toggle-mark', args: { mark: 'bold' } });
    endpoint.deliver({ type: 'edit-selection', id: 'el-heading-1', empty: true, marks: {}, text: '' });
    expect(screen.queryByRole('toolbar', { name: 'Text formatting' })).toBeNull();
  });

  it('shows Selected Text only for a non-empty selection in an active edit session', async () => {
    const s = setup();
    await ready(s);
    const endpoint = s.endpoints.last();
    expect(screen.queryByRole('region', { name: 'Selected Text' })).toBeNull();
    endpoint.deliver({ type: 'edit-request', id: 'el-heading-1' });
    endpoint.deliver({ type: 'edit-selection', id: 'el-heading-1', empty: false, marks: {}, text: 'Selected' });
    expect(screen.getByRole('region', { name: 'Selected Text' })).toBeTruthy();
    endpoint.deliver({ type: 'edit-selection', id: 'el-heading-1', empty: true, marks: {}, text: '' });
    expect(screen.queryByRole('region', { name: 'Selected Text' })).toBeNull();
  });

  it('truncates and escapes selected text in the info card and preview', async () => {
    const s = setup();
    await ready(s);
    const endpoint = s.endpoints.last();
    const hostile = '<img onerror=alert(1)>' + 'x'.repeat(50);
    endpoint.deliver({ type: 'edit-request', id: 'el-heading-1' });
    endpoint.deliver({ type: 'edit-selection', id: 'el-heading-1', empty: false, marks: {}, text: hostile });
    const section = screen.getByRole('region', { name: 'Selected Text' });
    expect(section.querySelector('.blx-selected-info')?.textContent).toContain(hostile.slice(0, 40));
    expect(section.querySelector('img')).toBeNull();
    expect(section.querySelector('.blx-format-preview')?.textContent).toBe(hostile);
  });

  it.each([
    ['strong', { strong: true }],
    ['em', { em: true }],
    ['u', { u: true }],
    ['s', { s: true }],
    ['code', { code: true }],
  ])('renders the selected text %s mark in the preview', async (tag, marks) => {
    const s = setup();
    await ready(s);
    const endpoint = s.endpoints.last();
    endpoint.deliver({ type: 'edit-request', id: 'el-heading-1' });
    endpoint.deliver({ type: 'edit-selection', id: 'el-heading-1', empty: false, marks, text: 'Marked' });
    const preview = screen.getByText('Marked').closest('.blx-format-preview');
    expect(preview?.querySelector(tag)?.textContent).toBe('Marked');
  });

  it.each([
    ['Text color', 'Primary', 'set-style', { color: 'color-primary' }],
    ['Text color', 'Default', 'set-style', { color: null }],
    ['Background highlight', 'Surface', 'set-style', { highlight: 'color-surface' }],
    ['Background highlight', 'None', 'set-style', { highlight: null }],
  ])('dispatches Selected Text %s %s exactly', async (control, value, name, args) => {
    const s = setup();
    await ready(s);
    const endpoint = s.endpoints.last();
    endpoint.deliver({ type: 'edit-request', id: 'el-heading-1' });
    endpoint.deliver({ type: 'edit-selection', id: 'el-heading-1', empty: false, marks: {}, text: 'Hello' });
    const section = screen.getByRole('region', { name: 'Selected Text' });
    fireEvent.change(within(section).getByRole('combobox', { name: control }), {
      target: {
        value: value === 'Default' || value === 'None' ? '' : value === 'Primary' ? 'color-primary' : 'color-surface',
      },
    });
    expect(endpoint.sent).toContainEqual({ type: 'edit-command', name, args });
  });

  it('uses resolved token colors in CSSOM swatches and keeps token ids out of visible text', async () => {
    const s = setup();
    await ready(s);
    const endpoint = s.endpoints.last();
    endpoint.deliver({ type: 'token-colors', mode: 'light', colors: [{ id: 'color-primary', value: '#112233' }] });
    endpoint.deliver({ type: 'edit-request', id: 'el-heading-1' });
    endpoint.deliver({
      type: 'edit-selection',
      id: 'el-heading-1',
      empty: false,
      marks: { style: { color: 'color-primary', highlight: 'color-primary' } },
      text: 'Hello',
    });
    const section = screen.getByRole('region', { name: 'Selected Text' });
    const preview = section.querySelector<HTMLElement>('.blx-format-preview');
    const swatch = section.querySelector<HTMLElement>('.blx-selected-token-swatch');
    expect(preview?.style.getPropertyValue('--blx-selected-text-color')).toBe('#112233');
    expect(preview?.style.getPropertyValue('--blx-selected-text-highlight')).toBe('#112233');
    expect(swatch?.style.getPropertyValue('--blx-selected-token-swatch')).toBe('#112233');
    const visibleText = [...section.querySelectorAll<HTMLElement>('*')]
      .filter((node) => node.childElementCount === 0)
      .map((node) => node.textContent)
      .join(' ');
    expect(visibleText).not.toContain('color-primary');
  });

  it('wraps Selected Text commands atomically when Apply to is Whole element', async () => {
    const s = setup();
    await ready(s);
    const endpoint = s.endpoints.last();
    endpoint.deliver({ type: 'edit-request', id: 'el-heading-1' });
    endpoint.deliver({ type: 'edit-selection', id: 'el-heading-1', empty: false, marks: {}, text: 'Hello' });
    const section = screen.getByRole('region', { name: 'Selected Text' });
    fireEvent.change(within(section).getByRole('combobox', { name: 'Apply to' }), { target: { value: 'whole' } });
    fireEvent.change(within(section).getByRole('combobox', { name: 'Text color' }), {
      target: { value: 'color-primary' },
    });
    expect(endpoint.sent).toContainEqual({
      type: 'edit-command',
      name: 'apply-to-all',
      args: { name: 'set-style', args: { color: 'color-primary' } },
    });
  });

  it('clears selection through collapse-selection', async () => {
    const s = setup();
    await ready(s);
    const endpoint = s.endpoints.last();
    endpoint.deliver({ type: 'edit-request', id: 'el-heading-1' });
    endpoint.deliver({ type: 'edit-selection', id: 'el-heading-1', empty: false, marks: {}, text: 'Hello' });
    fireEvent.click(
      within(screen.getByRole('region', { name: 'Selected Text' })).getByRole('button', { name: 'Clear selection' }),
    );
    expect(endpoint.sent).toContainEqual({ type: 'edit-command', name: 'collapse-selection' });
  });

  it.each(['en_US', 'nl_NL'] as const)('keeps Selected Text labels translated in %s', async (locale) => {
    const s = setup({ editorLocale: locale });
    await ready(s);
    const endpoint = s.endpoints.last();
    endpoint.deliver({ type: 'edit-request', id: 'el-heading-1' });
    endpoint.deliver({ type: 'edit-selection', id: 'el-heading-1', empty: false, marks: {}, text: 'Hello' });
    const title = locale === 'en_US' ? 'Selected Text' : 'Geselecteerde tekst';
    expect(screen.getByRole('region', { name: title })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: locale === 'en_US' ? 'Clear selection' : 'Selectie wissen' }),
    ).toBeTruthy();
  });

  it.each([
    ['javascript:', false],
    ['data:text/html,x', false],
    ['vbscript:msgbox(1)', false],
    ['', false],
    ['x'.repeat(2049), false],
    ['https://example.test/', true],
    ['http://example.test/', true],
    ['mailto:hello@example.test', true],
    ['tel:+31201234567', true],
    ['/relative/path', true],
    ['relative/path', true],
    ['?query=1', true],
    ['#section', true],
    ['https://example.test/\u0001bad', false],
  ])('validates link draft %j and dispatches only safe URLs', async (href, safe) => {
    const s = setup();
    await ready(s);
    const endpoint = s.endpoints.last();
    endpoint.deliver({ type: 'edit-request', id: 'el-heading-1' });
    endpoint.deliver({
      type: 'edit-selection',
      id: 'el-heading-1',
      empty: false,
      marks: {},
      text: 'Hello',
      rect: { x: 30, y: 20, w: 30, h: 24 },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Link' }));
    const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'URL' });
    fireEvent.change(input, { target: { value: href } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    if (safe) {
      expect(endpoint.sent).toContainEqual({ type: 'edit-command', name: 'set-link', args: { href, newTab: false } });
      expect(screen.queryByRole('alert')).toBeNull();
    } else {
      expect(endpoint.sent.some((message) => message.type === 'edit-command' && message.name === 'set-link')).toBe(
        false,
      );
      expect(screen.getByRole('alert').textContent).toBe(
        'Enter a safe link using http, https, mailto, tel, or a relative address.',
      );
      expect(input.getAttribute('aria-describedby')).toBe('blx-rich-link-error');
      expect(input.value).toBe(href);
    }
  });

  it.each([false, true])('prefills active link and applies newTab=%s', async (newTab) => {
    const s = setup();
    await ready(s);
    const endpoint = s.endpoints.last();
    endpoint.deliver({ type: 'edit-request', id: 'el-heading-1' });
    endpoint.deliver({
      type: 'edit-selection',
      id: 'el-heading-1',
      empty: false,
      marks: { link: { href: 'https://example.test/', newTab } },
      text: 'Hello',
      rect: { x: 30, y: 20, w: 30, h: 24 },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Link' }));
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'URL' }).value).toBe('https://example.test/');
    expect(within(linkForm()).getByRole<HTMLInputElement>('checkbox', { name: 'Open in new tab' }).checked).toBe(
      newTab,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(endpoint.sent).toContainEqual({
      type: 'edit-command',
      name: 'set-link',
      args: { href: 'https://example.test/', newTab },
    });
  });

  it('removes an active link and exposes no remove action when none is selected', async () => {
    const s = setup();
    await ready(s);
    const endpoint = s.endpoints.last();
    endpoint.deliver({ type: 'edit-request', id: 'el-heading-1' });
    endpoint.deliver({
      type: 'edit-selection',
      id: 'el-heading-1',
      empty: false,
      marks: { link: { href: 'https://example.test/' } },
      text: 'Hello',
      rect: { x: 30, y: 20, w: 30, h: 24 },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Link' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(endpoint.sent).toContainEqual({ type: 'edit-command', name: 'clear-link' });
  });

  it('uses the popover radio menu keyboard model and sends a token style command', async () => {
    const s = setup();
    await ready(s);
    const endpoint = s.endpoints.last();
    endpoint.deliver({ type: 'edit-request', id: 'el-heading-1' });
    endpoint.deliver({
      type: 'edit-selection',
      id: 'el-heading-1',
      empty: false,
      marks: { style: { color: 'color-primary' } },
      text: 'Hello',
      rect: { x: 30, y: 20, w: 30, h: 24 },
    });
    const trigger = screen.getByRole('button', { name: 'Text color' });
    fireEvent.click(trigger);
    const menu = screen.getByRole('menu', { name: 'Text color' });
    expect(within(menu).getByRole('menuitemradio', { name: 'Primary' }).getAttribute('aria-checked')).toBe('true');
    const first = within(menu).getByRole('menuitemradio', { name: 'Default' });
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(within(menu).getByRole('menuitemradio', { name: 'Primary' }));
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' });
    expect(screen.queryByRole('menu', { name: 'Text color' })).toBeNull();
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Default' }));
    expect(endpoint.sent).toContainEqual({ type: 'edit-command', name: 'set-style', args: { color: null } });
  });

  it('runs overflow clear formatting and clear link commands with disabled state', async () => {
    const s = setup();
    await ready(s);
    const endpoint = s.endpoints.last();
    endpoint.deliver({ type: 'edit-request', id: 'el-heading-1' });
    endpoint.deliver({
      type: 'edit-selection',
      id: 'el-heading-1',
      empty: false,
      marks: {},
      text: 'Hello',
      rect: { x: 30, y: 20, w: 30, h: 24 },
    });
    fireEvent.click(screen.getByRole('button', { name: 'More formatting options' }));
    expect(screen.getByRole('menuitem', { name: 'Clear link' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Clear formatting' }));
    expect(endpoint.sent).toContainEqual({ type: 'edit-command', name: 'clear-marks' });
    endpoint.deliver({
      type: 'edit-selection',
      id: 'el-heading-1',
      empty: false,
      marks: { link: { href: 'https://example.test/' } },
      text: 'Hello',
      rect: { x: 30, y: 20, w: 30, h: 24 },
    });
    fireEvent.click(screen.getByRole('button', { name: 'More formatting options' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Clear link' }));
    expect(endpoint.sent).toContainEqual({ type: 'edit-command', name: 'clear-link' });
  });

  it('keeps one active inline edit, ignores stale changes and commits the final value as one undo step', async () => {
    const s = setup();
    await ready(s);
    const endpoint = s.endpoints.last();
    endpoint.deliver({ type: 'edit-request', id: 'el-heading-1' });
    const start = endpoint.sent.find((message) => message.type === 'edit-start');
    expect(start).toMatchObject({
      type: 'edit-start',
      id: 'el-heading-1',
      prop: 'text',
      editable: true,
      mode: 'single-line',
    });
    endpoint.deliver({ type: 'edit-ready', id: 'el-heading-1', prop: 'text' });
    endpoint.deliver({ type: 'edit-change', id: 'el-text-1', prop: 'text', value: 'forged' });
    endpoint.deliver({ type: 'edit-change', id: 'el-heading-1', prop: 'text', value: 'Hello world' });
    expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Text' }).value).toBe('Hello world');
    expect(screen.getByRole('textbox', { name: 'Text' }).getAttribute('readonly')).not.toBeNull();
    expect(s.store.getState().document?.translations['fr_FR']?.['el-heading-1']?.values['text']).toBeUndefined();
    endpoint.deliver({ type: 'edit-ended', id: 'el-heading-1', reason: 'commit' });
    expect(s.store.getState().document?.translations['fr_FR']?.['el-heading-1']?.values['text']).toBe('Hello world');
    expect(screen.getByRole('textbox', { name: 'Text' }).getAttribute('readonly')).toBeNull();
    act(() => {
      s.store.getState().undo();
    });
    expect(s.store.getState().document?.translations['fr_FR']?.['el-heading-1']?.values['text']).toBeUndefined();
  });

  it('refuses an edit request while the document is locked', async () => {
    const s = setup({ editingEnabled: false });
    await ready(s);
    const endpoint = s.endpoints.last();
    endpoint.deliver({ type: 'edit-request', id: 'el-heading-1' });
    expect(endpoint.sent.some((message) => message.type === 'edit-start')).toBe(false);
  });

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
  it('renders eight accessible resize handles and toolbar actions from the selected rectangle', async () => {
    const s = setup();
    await ready(s);
    s.pending[0]?.resolve(previewResult('<p data-blx-id="el-text-1">x</p>'));
    await flush(0);
    s.endpoints.last().deliver({ type: 'rendered', revision: 1 });
    await act(() =>
      Promise.resolve().then(() => {
        s.store.getState().select('el-text-1');
      }),
    );
    await flush(20);
    s.endpoints
      .last()
      .deliver({ type: 'rects', revision: 1, items: [{ id: 'el-text-1', x: 20, y: 80, w: 120, h: 28 }] });
    expect(screen.getAllByTestId('selection-overlay')).toHaveLength(1);
    expect(screen.getByTestId('selection-handles').querySelectorAll('[data-handle]')).toHaveLength(8);
    const handles = [...screen.getByTestId('selection-handles').querySelectorAll<HTMLButtonElement>('[data-handle]')];
    expect(handles.every((handle) => handle.getAttribute('aria-label')?.includes('Use arrow keys'))).toBe(true);
    expect(screen.getByRole('button', { name: /Resize from right edge/ }).getAttribute('aria-disabled')).toBe('false');
    expect(screen.getByRole('button', { name: /Resize from top edge/ }).getAttribute('aria-disabled')).toBe('false');
    const toolbar = screen.getByRole('toolbar', { name: 'Selected element actions' });
    expect(
      toolbar.compareDocumentPosition(screen.getByTestId('selection-handles')) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(within(toolbar).getByRole<HTMLButtonElement>('button', { name: 'Duplicate' }).disabled).toBe(false);
    expect(within(toolbar).getByRole<HTMLButtonElement>('button', { name: 'Delete' }).disabled).toBe(false);
    vi.useRealTimers();
    const editorRoot = screen.getByTestId('editor-root');
    editorRoot.setAttribute('data-editor-theme', 'light');
    expect(await axeViolations(editorRoot)).toEqual([]);
    editorRoot.setAttribute('data-editor-theme', 'dark');
    expect(await axeViolations(editorRoot)).toEqual([]);
    vi.useFakeTimers();
  }, 15000);

  it('captures a pointer resize, dispatches responsive width, and cancels on Escape', async () => {
    const s = setup();
    await ready(s);
    act(() => {
      s.store.getState().select('el-text-1');
    });
    await flush(20);
    s.endpoints
      .last()
      .deliver({ type: 'rects', revision: 0, items: [{ id: 'el-text-1', x: 20, y: 50, w: 120, h: 28 }] });
    const handle = screen.getByRole('button', { name: /Resize from right edge/ });
    const capture = vi.fn();
    Object.defineProperty(handle, 'setPointerCapture', { value: capture });
    Object.defineProperty(handle, 'hasPointerCapture', { value: () => false });
    fireEvent.pointerDown(handle, { pointerId: 7, clientX: 100, clientY: 50 });
    expect(capture).toHaveBeenCalledWith(7);
    fireEvent.pointerMove(handle, { pointerId: 7, clientX: 160, clientY: 50 });
    await flush(20);
    expect(screen.getByText('180 × 28')).toBeTruthy();
    fireEvent.pointerUp(handle, { pointerId: 7, clientX: 160, clientY: 50 });
    expect(s.store.getState().document?.root[0]?.children[0]?.children[1]?.style?.[0]?.declarations).toMatchObject({
      width: '180px',
    });
    expect(s.store.getState().history?.past).toHaveLength(1);
    expect(s.store.getState().undo().ok).toBe(true);
    expect(s.store.getState().document?.root[0]?.children[0]?.children[1]?.style).toBeUndefined();
    fireEvent.pointerDown(handle, { pointerId: 8, clientX: 100, clientY: 50 });
    fireEvent.pointerMove(handle, { pointerId: 8, clientX: 145, clientY: 50 });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByText('165 × 28')).toBeNull();
    expect(s.store.getState().history?.past).toHaveLength(0);
    fireEvent.pointerDown(handle, { pointerId: 10, clientX: 100, clientY: 50 });
    fireEvent.pointerMove(handle, { pointerId: 10, clientX: 140, clientY: 50 });
    fireEvent.pointerCancel(handle, { pointerId: 10 });
    expect(s.store.getState().history?.past).toHaveLength(0);
  });

  it('resizes from keyboard in one debounced undo step and leaves locked handles inert', async () => {
    const s = setup();
    await ready(s);
    act(() => {
      s.store.getState().select('el-text-1');
    });
    await flush(20);
    s.endpoints
      .last()
      .deliver({ type: 'rects', revision: 0, items: [{ id: 'el-text-1', x: 20, y: 50, w: 120, h: 28 }] });
    const right = screen.getByRole('button', { name: /Resize from right edge/ });
    right.focus();
    fireEvent.keyDown(right, { key: 'ArrowRight' });
    await flush(301);
    expect(s.store.getState().document?.root[0]?.children[0]?.children[1]?.style?.[0]?.declarations).toMatchObject({
      width: '121px',
    });
    expect(s.store.getState().history?.past).toHaveLength(1);
    s.view.unmount();

    const locked = setup({ editingEnabled: false });
    await ready(locked);
    act(() => {
      locked.store.getState().select('el-text-1');
    });
    await flush(20);
    locked.endpoints
      .last()
      .deliver({ type: 'rects', revision: 0, items: [{ id: 'el-text-1', x: 20, y: 50, w: 120, h: 28 }] });
    const inert = screen.getByRole('button', { name: /Resize from right edge/ });
    expect(inert.getAttribute('aria-disabled')).toBe('true');
    const capture = vi.fn();
    Object.defineProperty(inert, 'setPointerCapture', { value: capture });
    fireEvent.pointerDown(inert, { pointerId: 9, clientX: 100, clientY: 50 });
    expect(capture).not.toHaveBeenCalled();
  });

  it('duplicates through one atomic insert command and Undo removes the copy; Delete removes the selected element', async () => {
    const s = setup();
    await ready(s);
    await act(() =>
      Promise.resolve().then(() => {
        s.store.getState().select('el-text-1');
      }),
    );
    await flush(20);
    s.endpoints.last().deliver({ type: 'rects', revision: 0, items: [{ id: 'el-text-1', x: 5, y: 40, w: 60, h: 20 }] });
    const count = (): number => {
      const document = s.store.getState().document;
      if (!document) return 0;
      let total = 0;
      const pending = [...document.root];
      while (pending.length) {
        const node = pending.pop();
        if (node) {
          total += 1;
          pending.push(...node.children);
        }
      }
      return total;
    };
    const before = count();
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
    expect(count()).toBe(before + 1);
    expect(s.store.getState().selectedId).not.toBe('el-text-1');
    expect(s.store.getState().undo()).toMatchObject({ ok: true, changed: true });
    expect(count()).toBe(before);
    await act(() =>
      Promise.resolve().then(() => {
        s.store.getState().select('el-text-1');
      }),
    );
    await flush(20);
    s.endpoints.last().deliver({ type: 'rects', revision: 0, items: [{ id: 'el-text-1', x: 5, y: 40, w: 60, h: 20 }] });
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(count()).toBe(before - 1);
  });

  it('hides mutation controls in read-only mode', async () => {
    const s = setup({ editingEnabled: false });
    await ready(s);
    s.pending[0]?.resolve(previewResult('<p data-blx-id="el-text-1">x</p>'));
    await flush(0);
    s.endpoints.last().deliver({ type: 'rendered', revision: 1 });
    await act(() =>
      Promise.resolve().then(() => {
        s.store.getState().select('el-text-1');
      }),
    );
    await flush(20);
    s.endpoints
      .last()
      .deliver({ type: 'rects', revision: 1, items: [{ id: 'el-text-1', x: 20, y: 80, w: 120, h: 28 }] });
    expect(screen.queryByRole('button', { name: 'Duplicate' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });

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

  it('shows a decorative hover chip for an unselected element and hides it for selected or edited elements', async () => {
    const s = setup();
    await ready(s);
    const endpoint = s.endpoints.last();
    act(() => {
      s.store.getState().hover('el-text-1');
    });
    endpoint.deliver({ type: 'rects', revision: 0, items: [{ id: 'el-text-1', x: 20, y: 80, w: 120, h: 28 }] });
    const chip = screen.getByTestId('canvas-hover-chip');
    expect(chip.textContent).toContain('Text');
    expect(chip.getAttribute('aria-hidden')).toBe('true');
    expect(chip.className).toContain('blx-hover-chip');
    await act(async () => {
      s.store.getState().select('el-text-1');
      await Promise.resolve();
    });
    expect(screen.queryByTestId('canvas-hover-chip')).toBeNull();
    await act(async () => {
      s.store.getState().select(null);
      await Promise.resolve();
    });
    endpoint.deliver({ type: 'edit-request', id: 'el-text-1' });
    expect(screen.queryByTestId('canvas-hover-chip')).toBeNull();
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
    endpoint.deliver({ type: 'pick', id: null, shift: false, alt: false });
    expect(s.store.getState().selectedId).toBeNull();
    expect(s.store.getState().hoveredId).toBeNull();
    expect(screen.queryByTestId('selection-toolbar')).toBeNull();
    expect(screen.queryByTestId('selection-handles')).toBeNull();
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
        .hasAttribute('title'),
    ).toBe(false);
    expect(within(breadcrumb).getByLabelText('el-heading-1').textContent).toBe('el-heading-1');
    expect(within(breadcrumb).getByRole('button', { name: /Heading.*el-heading/ }).className).toContain(
      'blx-breadcrumb-item',
    );
    expect(breadcrumb.hasAttribute('title')).toBe(false);
    fireEvent.click(within(breadcrumb).getByRole('button', { name: /Section.*el-section-1/ }));
    expect(s.store.getState().selectedId).toBe('el-section-1');
    fireEvent.click(within(breadcrumb).getByRole('button', { name: 'Page root' }));
    expect(s.store.getState().selectedId).toBeNull();
  });

  it('uses toolbar roving focus and returns focus to the canvas on Escape', async () => {
    const s = setup();
    await ready(s);
    await act(() =>
      Promise.resolve().then(() => {
        s.store.getState().select('el-text-1');
      }),
    );
    await flush(20);
    s.endpoints.last().deliver({ type: 'rects', revision: 0, items: [{ id: 'el-text-1', x: 5, y: 40, w: 60, h: 20 }] });
    const stage = screen.getByTestId('canvas-stage');
    fireEvent.keyDown(stage, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Edit text' }));
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Duplicate' }));
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' });
    expect(document.activeElement).toBe(stage);
  });

  it('opens the accessible action menu, focuses its item, and returns to the trigger on Escape', async () => {
    const s = setup();
    await ready(s);
    await act(() =>
      Promise.resolve().then(() => {
        s.store.getState().select('el-text-1');
      }),
    );
    await flush(20);
    s.endpoints.last().deliver({ type: 'rects', revision: 0, items: [{ id: 'el-text-1', x: 5, y: 40, w: 60, h: 20 }] });
    const trigger = screen.getByRole('button', { name: 'More element actions' });
    fireEvent.click(trigger);
    const item = screen.getByRole('menuitem', { name: 'Select parent' });
    expect(document.activeElement).toBe(item);
    s.endpoints.last().deliver({ type: 'rects', revision: 0, items: [{ id: 'el-text-1', x: 8, y: 2, w: 60, h: 20 }] });
    expect(screen.getByRole('menu', { name: 'More element actions' })).toBeTruthy();
    fireEvent.keyDown(item, { key: 'Escape' });
    expect(document.activeElement).toBe(trigger);
  });

  it('opens the action menu from ArrowDown and closes it when selection changes', async () => {
    const s = setup();
    await ready(s);
    await act(() => Promise.resolve().then(() => s.store.getState().select('el-text-1')));
    await flush(20);
    s.endpoints.last().deliver({ type: 'rects', revision: 0, items: [{ id: 'el-text-1', x: 5, y: 40, w: 60, h: 20 }] });
    const trigger = screen.getByRole('button', { name: 'More element actions' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(screen.getByRole('menu', { name: 'More element actions' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Select parent' }));
    act(() => {
      s.store.getState().select('el-heading-1');
    });
    expect(screen.queryByRole('menu', { name: 'More element actions' })).toBeNull();
  });

  it('requests and retains a hovered element rectangle when there is no selection', async () => {
    const s = setup();
    await ready(s);
    const endpoint = s.endpoints.last();
    endpoint.deliver({ type: 'size', width: 900, height: 1200 });
    act(() => {
      s.store.getState().hover('el-text-1');
    });
    await flush(20);
    expect(endpoint.sent.filter((message) => message.type === 'request-rects')).toEqual([
      { type: 'request-rects', revision: 0 },
    ]);
    endpoint.deliver({ type: 'rects', revision: 0, items: [{ id: 'el-text-1', x: 5, y: 40, w: 60, h: 20 }] });
    expect(screen.getByTestId('canvas-hover-chip').textContent).toContain('Text');
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
    expect(screen.getByText('Connecting to the preview...')).toBeTruthy();
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
    expect(screen.getByText('Verbinden met de voorvertoning...')).toBeTruthy();
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
