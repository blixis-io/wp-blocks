import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CanvasEndpoint,
  CanvasEndpointOptions,
  CanvasMessage,
  Init,
  ParentMessage,
} from '@blixis/wp-canvas-bridge';
import { checkHtml, isCssSafe } from './guards';
import { EDITING_ATTRIBUTE, HOVER_ATTRIBUTE, readCanvasMeta, startRuntime, type Runtime } from './runtime';

const NONCE = 'dGVzdC1ub25jZS1mb3ItanNkb20=';
const META = JSON.stringify({ version: 1, cspNonce: NONCE });
const INIT: Init = {
  type: 'blx-canvas-init',
  version: 1,
  nonce: 'n'.repeat(24),
  viewport: { width: 1280, breakpoint: 'base' },
  mode: 'light',
  locale: 'nl_NL',
  dir: 'ltr',
};
const PAGE =
  '<section data-blx-id="el-section-1"><h2 data-blx-id="el-heading-1">Hello</h2><a href="/x" data-blx-id="el-link-1">go</a></section>';

function mountDocument(meta: string | null = META, withRoot = true): void {
  document.head.innerHTML =
    meta === null ? '' : '<meta name="blixis-canvas" content=""><meta name="color-scheme" content="light">';
  if (meta !== null) document.querySelector('meta[name="blixis-canvas"]')?.setAttribute('content', meta);
  document.body.innerHTML = withRoot ? '<div id="blx-canvas-root"></div>' : '';
}

interface Harness {
  runtime: Runtime;
  sent: CanvasMessage[];
  handlers: Pick<CanvasEndpointOptions, 'onInit' | 'onMessage' | 'onViolation'>;
  endpoint: { connect: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };
  deliver: (message: ParentMessage) => void;
  root: HTMLElement;
  observer: { callback: () => void; disconnect: ReturnType<typeof vi.fn<() => void>> };
  frames: { requested: number; cancelled: number; pending: () => number; run: () => void };
}

function start(options: { hoverThrottleMs?: number; init?: boolean } = {}): Harness {
  const sent: CanvasMessage[] = [];
  const endpoint = {
    connect: vi.fn(() => true),
    close: vi.fn(),
    send: (message: CanvasMessage) => {
      sent.push(message);
      return true;
    },
    state: 'connected' as const,
  };
  let handlers: Harness['handlers'] | undefined;
  const observer = { callback: () => undefined, disconnect: vi.fn<() => void>() } as Harness['observer'];
  class FakeObserver {
    constructor(callback: () => void) {
      observer.callback = callback;
    }
    observe(): void {
      /* noop */
    }
    unobserve(): void {
      /* noop */
    }
    disconnect(): void {
      observer.disconnect();
    }
  }
  // A manual animation-frame queue: nothing measures the layout until `frames.run()`.
  const queue = new Map<number, () => void>();
  let nextHandle = 1;
  const frames: Harness['frames'] = {
    requested: 0,
    cancelled: 0,
    pending: () => queue.size,
    run: () => {
      const callbacks = [...queue.values()];
      queue.clear();
      for (const callback of callbacks) callback();
    },
  };
  const runtime = startRuntime({
    document,
    window,
    requestFrame: (callback) => {
      frames.requested += 1;
      const handle = nextHandle++;
      queue.set(handle, callback);
      return handle;
    },
    cancelFrame: (handle) => {
      frames.cancelled += 1;
      queue.delete(handle);
    },
    createEndpoint: (h) => {
      handlers = h;
      return endpoint;
    },
    ResizeObserverCtor: FakeObserver as unknown as typeof ResizeObserver,
    ...(options.hoverThrottleMs === undefined ? {} : { hoverThrottleMs: options.hoverThrottleMs }),
  });
  if (runtime === null || handlers === undefined) throw new Error('runtime did not start');
  if (options.init !== false) handlers.onInit(INIT);
  const h = handlers;
  return {
    runtime,
    sent,
    handlers: h,
    endpoint,
    deliver: (message) => {
      h.onMessage(message);
    },
    root: need(document.getElementById('blx-canvas-root')),
    observer,
    frames,
  };
}

function need<T>(value: T | null): T {
  if (value === null) throw new Error('missing element');
  return value;
}

let current: Harness | null = null;
let restoreTokenColorSpy: (() => void) | null = null;
const begin = (options?: Parameters<typeof start>[0]): Harness => {
  current = start(options);
  return current;
};
const render = (h: Harness, html: string, css = '', revision = 1) => {
  h.deliver({ type: 'render', html, css, revision });
};
const types = (h: Harness) => h.sent.map((m) => m.type);

beforeEach(() => {
  mountDocument();
});
afterEach(() => {
  restoreTokenColorSpy?.();
  restoreTokenColorSpy = null;
  current?.runtime.close();
  current = null;
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

describe('meta and startup', () => {
  it('reads valid meta', () => {
    expect(readCanvasMeta(document)).toEqual({ version: 1, cspNonce: NONCE });
  });
  it.each([
    ['not json', '{nope'],
    ['array', '[]'],
    ['wrong version', JSON.stringify({ version: 2, cspNonce: NONCE })],
    ['short nonce', JSON.stringify({ version: 1, cspNonce: 'abc' })],
    ['nonce with quote', JSON.stringify({ version: 1, cspNonce: `${NONCE}"` })],
    ['extra key', JSON.stringify({ version: 1, cspNonce: NONCE, extra: 1 })],
    ['missing nonce', JSON.stringify({ version: 1 })],
    ['oversized', JSON.stringify({ version: 1, cspNonce: NONCE, pad: 'x'.repeat(2000) })],
    ['null', 'null'],
  ])('refuses meta: %s', (_name, content) => {
    mountDocument(content);
    expect(readCanvasMeta(document)).toBeNull();
    expect(startRuntime({ document, window })).toBeNull();
  });
  it('does nothing without meta or root', () => {
    mountDocument(null);
    expect(startRuntime({ document, window })).toBeNull();
    mountDocument(META, false);
    expect(startRuntime({ document, window })).toBeNull();
  });
  it('connects the endpoint, sends ready after init and applies init values to the root', () => {
    const h = begin({ init: false });
    expect(h.endpoint.connect).toHaveBeenCalledOnce();
    expect(h.sent).toEqual([]);
    h.handlers.onInit(INIT);
    expect(h.sent).toEqual([{ type: 'ready' }]);
    expect(h.root.getAttribute('data-blx-mode')).toBe('light');
    expect(h.root.getAttribute('lang')).toBe('nl-NL');
    expect(h.root.getAttribute('dir')).toBe('ltr');
    expect(h.root.getAttribute('data-blx-breakpoint')).toBe('base');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.querySelector('meta[name="color-scheme"]')?.getAttribute('content')).toBe('light');
  });
  it('closes when the endpoint cannot connect', () => {
    const sent: CanvasMessage[] = [];
    const endpoint = {
      connect: () => false,
      close: vi.fn(),
      send: (m: CanvasMessage) => sent.push(m) > 0,
      state: 'closed',
    };
    startRuntime({
      document,
      window,
      createEndpoint: () => endpoint as unknown as CanvasEndpoint,
    });
    expect(endpoint.close).toHaveBeenCalled();
  });
  it('closes on a protocol violation', () => {
    const h = begin();
    h.handlers.onViolation('protocol-violation');
    expect(h.endpoint.close).toHaveBeenCalled();
    const before = h.sent.length;
    h.deliver({ type: 'ping', n: 1 });
    expect(h.sent.length).toBe(before);
  });
  it('never touches cookies or storage', () => {
    const cookie = vi.spyOn(document, 'cookie', 'get');
    const storage = vi.spyOn(Storage.prototype, 'getItem');
    const h = begin();
    render(h, PAGE, '.a{color:red}');
    expect(cookie).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
  });
});

describe('save shortcut forwarding', () => {
  it('forwards Ctrl/Cmd+S once, prevents browser save, and ignores repeats and modified variants', () => {
    const h = begin();
    const target = document.body;
    const event = (init: KeyboardEventInit) => {
      const key = new KeyboardEvent('keydown', { key: 's', bubbles: true, cancelable: true, ...init });
      target.dispatchEvent(key);
      return key;
    };
    const save = event({ ctrlKey: true });
    expect(save.defaultPrevented).toBe(true);
    expect(h.sent.filter((message) => message.type === 'shortcut')).toEqual([{ type: 'shortcut', name: 'save' }]);
    expect(event({ metaKey: true, repeat: true }).defaultPrevented).toBe(true);
    expect(event({ ctrlKey: true, key: 'x' }).defaultPrevented).toBe(false);
    expect(event({ ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(false);
    expect(event({ ctrlKey: true, altKey: true }).defaultPrevented).toBe(false);
    expect(h.sent.filter((message) => message.type === 'shortcut')).toHaveLength(1);
  });
});

describe('lazy rich text asset loading', () => {
  it('loads the same-origin sibling once with the canvas nonce on the first edit', async () => {
    const script = document.createElement('script');
    script.src = `${window.location.origin}/wp/canvas.js?ver=manifest-hash`;
    script.nonce = NONCE;
    script.setAttribute('data-blx-canvas', '');
    document.head.append(script);
    const h = begin();
    render(h, PAGE);
    h.deliver({
      type: 'edit-start',
      id: 'el-heading-1',
      prop: 'text',
      value: 'Hello',
      editable: true,
      mode: 'single-line',
      locale: 'en_US',
      dir: 'ltr',
    });
    await Promise.resolve();
    const lazy = document.querySelector<HTMLScriptElement>('script[src*="richtext.js"]');
    expect(lazy?.src).toBe(`${window.location.origin}/wp/richtext.js?ver=manifest-hash`);
    expect(lazy?.nonce).toBe(NONCE);
    Object.defineProperty(window, 'BlixisRichText', {
      value: { mountRichText: vi.fn(() => ({ editor: {}, destroy: vi.fn() })) },
      configurable: true,
    });
    lazy?.dispatchEvent(new Event('load'));
    await Promise.resolve();
    expect(h.sent.some((message) => message.type === 'edit-ready')).toBe(true);
    const edited = need(h.root.querySelector('[data-blx-id="el-heading-1"]'));
    expect(edited.hasAttribute(EDITING_ATTRIBUTE)).toBe(true);
    expect(document.getElementById('blx-canvas-chrome')?.textContent).toContain(
      'outline:2px solid var(--ed-selection-outline',
    );
    expect(document.getElementById('blx-canvas-chrome')?.textContent).toContain('prefers-reduced-motion');
    h.sent.length = 0;
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(h.sent).toEqual([]);
    h.deliver({ type: 'edit-end', commit: false });
    expect(edited.hasAttribute(EDITING_ATTRIBUTE)).toBe(false);
    expect(document.querySelectorAll('script[src*="richtext.js"]')).toHaveLength(1);
  });
  it('refuses loading without a nonce', async () => {
    const script = document.createElement('script');
    script.src = 'https://localhost/wp/canvas.js';
    script.setAttribute('data-blx-canvas', '');
    document.head.append(script);
    const h = begin();
    render(h, PAGE);
    h.deliver({
      type: 'edit-start',
      id: 'el-heading-1',
      prop: 'text',
      value: 'Hello',
      editable: true,
      mode: 'single-line',
      locale: 'en_US',
      dir: 'ltr',
    });
    await Promise.resolve();
    expect(document.querySelector('script[src*="richtext.js"]')).toBeNull();
    expect(h.sent).toContainEqual({ type: 'edit-error', code: 'load-failed' });
  });
  it('refuses a cross-origin canvas script URL', async () => {
    const script = document.createElement('script');
    script.src = 'https://evil.test/canvas.js';
    script.nonce = NONCE;
    script.setAttribute('data-blx-canvas', '');
    document.head.append(script);
    const h = begin();
    render(h, PAGE);
    h.deliver({
      type: 'edit-start',
      id: 'el-heading-1',
      prop: 'text',
      value: 'Hello',
      editable: true,
      mode: 'single-line',
      locale: 'en_US',
      dir: 'ltr',
    });
    await Promise.resolve();
    expect(document.querySelector('script[src*="richtext.js"]')).toBeNull();
    expect(h.sent).toContainEqual({ type: 'edit-error', code: 'load-failed' });
  });
});

describe('render', () => {
  it('sends only resolved active token colors after render and again when preview appearance changes', () => {
    const view = document.defaultView;
    if (!view) throw new Error('missing jsdom window');
    const native = view.getComputedStyle.bind(view);
    const styleSpy = vi.spyOn(view, 'getComputedStyle').mockImplementation((element: Element) => {
      const result = native(element);
      if (element === document.documentElement) {
        const values: Record<string, string> = {
          '--blx-color-primary': document.documentElement.getAttribute('data-theme') === 'dark' ? '#112233' : '#abcdef',
        };
        const mocked = Object.create(result) as CSSStyleDeclaration;
        Object.defineProperty(mocked, 'getPropertyValue', { value: (name: string) => values[name] ?? '' });
        return mocked;
      }
      return result;
    });
    restoreTokenColorSpy = () => {
      styleSpy.mockRestore();
    };
    const h = start();
    render(
      h,
      '<p data-blx-id="el-text-1"><span class="blx-mc-color-primary">Hello</span></p>',
      '.blx-mc-color-primary{color:var(--blx-color-primary)}',
      7,
    );
    expect(document.getElementById('blx-canvas-style')?.textContent).toContain('.blx-mc-color-primary');
    expect(document.querySelector('#blx-canvas-root .blx-mc-color-primary')).not.toBeNull();
    expect(view.getComputedStyle(document.documentElement).getPropertyValue('--blx-color-primary')).toBe('#abcdef');
    expect(h.sent.find((message) => message.type === 'token-colors')).toEqual({
      type: 'token-colors',
      mode: 'light',
      revision: 7,
      colors: [{ id: 'color-primary', value: '#abcdef' }],
    });
    h.deliver({ type: 'mode', mode: 'dark' });
    expect(h.sent.filter((message) => message.type === 'token-colors').at(-1)).toEqual({
      type: 'token-colors',
      mode: 'dark',
      revision: 7,
      colors: [{ id: 'color-primary', value: '#112233' }],
    });
    h.runtime.close();
    restoreTokenColorSpy();
    restoreTokenColorSpy = null;
  });
  it('inserts the fragment into the root, the css into one nonce style, and reports rendered', () => {
    const h = begin();
    render(h, PAGE, '.a{color:red}', 3);
    expect(h.root.querySelectorAll('[data-blx-id]')).toHaveLength(3);
    const styles = document.querySelectorAll('style#blx-canvas-style');
    expect(styles).toHaveLength(1);
    expect(styles[0]?.textContent).toBe('.a{color:red}');
    expect(styles[0]?.getAttribute('nonce')).toBe(NONCE);
    expect(types(h)).toEqual(['ready', 'rendered']); // layout waits for the next frame, rects are never pushed
    h.frames.run();
    expect(types(h)).toEqual(['ready', 'rendered', 'size', 'scroll']);
    expect(h.sent[1]).toEqual({ type: 'rendered', revision: 3 });
    // a second render replaces content and css instead of adding elements
    render(h, '<p data-blx-id="el-text-1">x</p>', '.b{}', 4);
    expect(document.querySelectorAll('style#blx-canvas-style')).toHaveLength(1);
    expect(document.getElementById('blx-canvas-style')?.textContent).toBe('.b{}');
    expect(h.root.querySelectorAll('[data-blx-id]')).toHaveLength(1);
  });

  it('ignores a render older than the last applied one', () => {
    const h = begin();
    render(h, '<p data-blx-id="el-text-1">new</p>', '', 5);
    render(h, '<p data-blx-id="el-text-1">old</p>', '', 4);
    expect(h.root.textContent).toBe('new');
  });

  it('renders text with markup characters as text', () => {
    const h = begin();
    render(h, '<p data-blx-id="el-text-1">&lt;script&gt;alert(1)&lt;/script&gt;</p>');
    expect(h.root.querySelector('script')).toBeNull();
    expect(h.root.textContent).toBe('<script>alert(1)</script>');
  });

  const hostile: [string, string][] = [
    ['script', '<p>x</p><script>alert(1)</script>'],
    ['uppercase script', '<SCRIPT>alert(1)</SCRIPT>'],
    ['iframe', '<iframe src="/x"></iframe>'],
    ['object', '<object data="/x"></object>'],
    ['embed', '<embed src="/x">'],
    ['form', '<form action="/x"><input name="a"></form>'],
    ['link', '<link rel="stylesheet" href="/x.css">'],
    ['meta refresh', '<meta http-equiv="refresh" content="0;url=/x">'],
    ['base', '<base href="https://evil.test/">'],
    ['style element', '<style>p{color:red}</style>'],
    ['onerror', '<img src="/a.png" onerror="alert(1)">'],
    ['onclick uppercase', '<p ONCLICK="alert(1)">x</p>'],
    ['onload svg', '<svg onload="alert(1)"></svg>'],
    ['svg script', '<svg><script>alert(1)</script></svg>'],
    ['svg use', '<svg><use href="https://evil.test/x.svg#a"></use></svg>'],
    ['svg animate', '<svg><a><animate attributeName="href" values="javascript:alert(1)"></animate></a></svg>'],
    ['javascript href', '<a href="javascript:alert(1)">x</a>'],
    ['obfuscated javascript href', '<a href="  jav&#x09;ascript:alert(1)">x</a>'],
    ['entity javascript href', '<a href="&#106;avascript:alert(1)">x</a>'],
    ['data href', '<a href="data:text/html,<p>x</p>">x</a>'],
    ['data src', '<img src="data:image/svg+xml,<svg/>">'],
    ['vbscript', '<a href="vbscript:x">x</a>'],
    ['srcset data', '<img srcset="/a.png 1x, data:image/png;base64,AAAA 2x">'],
    ['formaction', '<button formaction="javascript:alert(1)">x</button>'],
    ['srcdoc', '<p srcdoc="<script>">x</p>'],
    ['style attribute url', '<p style="background:url(https://evil.test/x)">x</p>'],
    ['template', '<template><script>alert(1)</script></template>'],
    ['math', '<math><mi xlink:href="javascript:alert(1)">x</mi></math>'],
    ['noscript', '<noscript><p title="</noscript><img src=x onerror=alert(1)>"></noscript>'],
  ];
  it.each(hostile)('refuses %s with unsafe-html and keeps the previous content', (_name, html) => {
    const h = begin();
    render(h, '<p data-blx-id="el-text-1">safe</p>', '', 1);
    h.sent.length = 0;
    render(h, html, '', 2);
    expect(h.sent).toEqual([{ type: 'error', code: 'unsafe-html' }]);
    expect(h.root.textContent).toBe('safe');
    expect(document.querySelector('script')).toBeNull();
  });

  it('keeps ordinary attributes while removing native title tooltips from canvas content', () => {
    const h = begin();
    render(
      h,
      '<a href="/about" title="data: sheet" class="a" data-blx-id="el-link-1" target="_blank">on</a><img src="/a.png" alt="onion" srcset="/a.png 1x">',
    );
    expect(types(h)).toContain('rendered');
    expect(h.root.querySelector('[title]')).toBeNull();
    expect(h.root.querySelector('[data-blx-id="el-link-1"]')?.getAttribute('href')).toBe('/about');
  });

  it('refuses too many elements', () => {
    const h = begin();
    render(h, '<i></i>'.repeat(50_001));
    expect(h.sent.at(-1)).toEqual({ type: 'error', code: 'too-large' });
  });

  const badCss: [string, string][] = [
    ['closing style', '.a{} </style><script>alert(1)</script>'],
    ['closing style spaced', '.a{} < /style >'],
    ['import', '@import "https://evil.test/x.css";'],
    ['uppercase import', '@IMPORT url(x);'],
    ['url', '.a{background:url(https://evil.test/x)}'],
    ['uppercase URL', '.a{background:URL( x )}'],
    ['url with comment', '.a{background:ur/**/l(x)}u/**/rl(x)'],
    ['escaped url', '.a{background:\\75 rl(x)}'],
    ['escaped url hex', '.a{background:\\000075rl(x)}'],
    ['expression', '.a{width:expression(alert(1))}'],
    ['image-set', '.a{background:image-set("x" 1x)}'],
    ['src()', '.a{background:src("x")}'],
    ['moz-binding', '.a{-moz-binding:x}'],
    ['null byte', '.a{color:red}\u0000'],
    ['control char', '.a{color:\u0007red}'],
    ['bidi override', '.a{content:"‮"}'],
    ['too long', 'a'.repeat(262_145)],
  ];
  it.each(badCss)('refuses css: %s', (_name, css) => {
    expect(isCssSafe(css)).toBe(false);
    const h = begin();
    render(h, '<p data-blx-id="el-text-1">x</p>', '.ok{color:red}', 1);
    h.sent.length = 0;
    render(h, '<p data-blx-id="el-text-1">y</p>', css, 2);
    expect(h.sent).toEqual([{ type: 'error', code: 'unsafe-css' }]);
    expect(document.getElementById('blx-canvas-style')?.textContent).toBe('.ok{color:red}');
    expect(h.root.textContent).toBe('x');
  });

  it('allows ordinary css', () => {
    for (const css of [
      '',
      '.a{color:#fff;margin:0 auto}@media (min-width:640px){.b{display:flex}}',
      '.md\\:flex{display:flex}',
      '.a::after{content:"é ü ñ"}',
      '[data-blx-id="el-heading-1"]{font-size:2rem}\n\t',
      '.a{font-family:system-ui,sans-serif}',
    ]) {
      expect(isCssSafe(css)).toBe(true);
    }
  });

  it('refuses a fragment check on the raw function too', () => {
    expect(checkHtml('<script></script>', document).ok).toBe(false);
    expect(checkHtml('<p>x</p>', document).ok).toBe(true);
  });
});

describe('viewport, mode, selection, hover', () => {
  it('applies viewport and mode to the root only (no inline styles)', () => {
    const h = begin();
    h.deliver({ type: 'mode', mode: 'dark' });
    h.deliver({ type: 'viewport', width: 375, breakpoint: 'mobile' });
    expect(h.root.getAttribute('data-blx-mode')).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.querySelector('meta[name="color-scheme"]')?.getAttribute('content')).toBe('dark');
    expect(h.root.getAttribute('data-blx-breakpoint')).toBe('mobile');
    expect(h.root.hasAttribute('style')).toBe(false);
    expect(document.documentElement.hasAttribute('data-blx-mode')).toBe(false);
  });

  it('leaves selection chrome to the parent overlay and keeps canvas hover after a re-render', () => {
    const h = begin();
    render(h, PAGE);
    h.deliver({ type: 'select', id: 'el-heading-1' });
    h.deliver({ type: 'hover', id: 'el-link-1' });
    expect(h.root.querySelector('[data-blx-selected]')).toBeNull();
    expect(h.root.querySelector('[data-blx-hover]')?.getAttribute('data-blx-id')).toBe('el-link-1');
    render(h, PAGE, '', 2);
    expect(h.root.querySelectorAll('[data-blx-selected]')).toHaveLength(0);
    h.deliver({ type: 'select', id: 'el-section-1' });
    expect(h.root.querySelectorAll('[data-blx-selected]')).toHaveLength(0);
    h.deliver({ type: 'select', id: null });
    h.deliver({ type: 'hover', id: null });
    expect(h.root.querySelector('[data-blx-selected]')).toBeNull();
    expect(h.root.querySelector('[data-blx-hover]')).toBeNull();
    h.deliver({ type: 'select', id: 'el-missing-9' });
    expect(h.root.querySelector('[data-blx-selected]')).toBeNull();
  });

  it('draws only hover from a nonce stylesheet, not inline styles', () => {
    begin();
    const chrome = document.getElementById('blx-canvas-chrome');
    expect(chrome?.getAttribute('nonce')).toBe(NONCE);
    expect(chrome?.textContent).not.toContain('[data-blx-selected]');
    expect(chrome?.textContent).toContain('outline');
  });

  it('scrolls an element into view and ignores unknown ids', () => {
    const h = begin();
    render(h, PAGE);
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView');
    h.deliver({ type: 'scroll-to', id: 'el-heading-1' });
    expect(spy).toHaveBeenCalledOnce();
    h.deliver({ type: 'scroll-to', id: 'el-missing-9' });
    expect(spy).toHaveBeenCalledOnce();
  });

  it('answers ping with pong', () => {
    const h = begin();
    h.deliver({ type: 'ping', n: 41 });
    expect(h.sent.at(-1)).toEqual({ type: 'pong', n: 41 });
  });
});

describe('pointer interaction', () => {
  it('click reports pick with modifier keys for the closest element with an id', () => {
    const h = begin();
    render(h, '<div data-blx-id="el-box-1"><span id="inner">t</span></div><p>no id</p>');
    h.sent.length = 0;
    document
      .getElementById('inner')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true }));
    expect(h.sent).toEqual([{ type: 'pick', id: 'el-box-1', shift: true, alt: false }]);
    h.sent.length = 0;
    h.root
      .querySelector('p')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, altKey: true }));
    expect(h.sent).toEqual([]);
  });

  it('a link click does not navigate but still picks', () => {
    const h = begin();
    render(h, PAGE);
    h.sent.length = 0;
    const link = h.root.querySelector('a');
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    link?.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(h.sent).toEqual([{ type: 'pick', id: 'el-link-1', shift: false, alt: false }]);
    const aux = new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 });
    link?.dispatchEvent(aux);
    expect(aux.defaultPrevented).toBe(true);
  });

  it('a click on plain content is not default-prevented', () => {
    const h = begin();
    render(h, PAGE);
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    h.root.querySelector('h2')?.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('deselects on an unmodified primary click on empty canvas and clears hover', () => {
    const h = begin();
    render(h, '<p data-blx-id="el-text-1">x</p><div class="gap">gap</div>');
    h.deliver({ type: 'hover', id: 'el-text-1' });
    h.sent.length = 0;
    document.querySelector('.gap')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(h.sent).toEqual([
      { type: 'hover', id: null },
      { type: 'pick', id: null, shift: false, alt: false },
    ]);
    expect(h.root.querySelector(`[${HOVER_ATTRIBUTE}]`)).toBeNull();
  });

  it('ignores modified, dragged, non-primary, auxiliary and context clicks on empty canvas', () => {
    const h = begin();
    render(h, '<div id="gap">gap</div>');
    h.sent.length = 0;
    const gap = need(document.getElementById('gap'));
    gap.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, shiftKey: true }));
    gap.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, metaKey: true }));
    gap.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 1 }));
    gap.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 0, clientY: 0 }));
    gap.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 5, clientY: 0 }));
    gap.dispatchEvent(new MouseEvent('auxclick', { bubbles: true, button: 1 }));
    gap.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect(h.sent).toEqual([]);
  });

  it('does not deselect on an empty click when an inline edit is active', async () => {
    const script = document.createElement('script');
    script.src = `${window.location.origin}/wp/canvas.js?ver=manifest-hash`;
    script.nonce = NONCE;
    script.setAttribute('data-blx-canvas', '');
    document.head.append(script);
    const h = begin();
    render(h, '<h2 data-blx-id="el-heading-1">Hello</h2><div id="gap"></div>');
    h.deliver({
      type: 'edit-start',
      id: 'el-heading-1',
      prop: 'text',
      value: 'Hello',
      editable: true,
      mode: 'single-line',
      locale: 'en_US',
      dir: 'ltr',
    });
    await Promise.resolve();
    Object.defineProperty(window, 'BlixisRichText', {
      value: { mountRichText: vi.fn(() => ({ editor: {}, destroy: vi.fn() })) },
      configurable: true,
    });
    document.querySelector('script[src*="richtext.js"]')?.dispatchEvent(new Event('load'));
    await Promise.resolve();
    h.sent.length = 0;
    document.getElementById('gap')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(h.sent.filter((message) => message.type === 'pick')).toEqual([]);
  });

  it('prevents form submits anywhere in the document', () => {
    begin();
    document.body.insertAdjacentHTML('beforeend', '<form id="f"></form>');
    const event = new Event('submit', { bubbles: true, cancelable: true });
    document.getElementById('f')?.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it.each([
    ['link', '<a href="/next" data-blx-id="el-link-1"><span id="inside">link</span></a>'],
    ['blank link', '<a href="/next" target="_blank" data-blx-id="el-link-1">link</a>'],
    ['button', '<button data-blx-id="el-button-1">go</button>'],
    ['submit button', '<button type="submit" data-blx-id="el-button-1">go</button>'],
    ['input', '<input data-blx-id="el-input-1">'],
    ['textarea', '<textarea data-blx-id="el-textarea-1"></textarea>'],
    ['select', '<select data-blx-id="el-select-1"><option>x</option></select>'],
    ['summary', '<details><summary data-blx-id="el-summary-1">more</summary></details>'],
    ['label', '<label for="x" data-blx-id="el-label-1">name</label><input id="x">'],
    ['video controls', '<video controls data-blx-id="el-video-1"></video>'],
    ['audio controls', '<audio controls data-blx-id="el-audio-1"></audio>'],
    ['iframe-like', '<div role="document" tabindex="0" data-blx-id="el-frame-1">frame</div>'],
    ['role button', '<div role="button" data-blx-id="el-role-1">go</div>'],
    ['tabindex', '<div tabindex="0" data-blx-id="el-tab-1">go</div>'],
  ])('blocks click activation and emits one pick for %s', (_name, html) => {
    const h = begin();
    render(h, html);
    h.sent.length = 0;
    const target = need(h.root.querySelector('[data-blx-id]'));
    let bubbled = false;
    target.addEventListener('click', () => {
      bubbled = true;
    });
    const href = window.location.href;
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(bubbled).toBe(false);
    expect(h.sent).toEqual([{ type: 'pick', id: target.getAttribute('data-blx-id'), shift: false, alt: false }]);
    expect(window.location.href).toBe(href);
    expect(open).not.toHaveBeenCalled();
  });

  it.each(['Enter', ' '])('keyboard %s on a link picks without activation', (key) => {
    const h = begin();
    render(h, '<a href="/next" data-blx-id="el-link-1">link</a>');
    h.sent.length = 0;
    const link = need(h.root.querySelector('a'));
    let bubbled = false;
    link.addEventListener('keydown', () => {
      bubbled = true;
    });
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    link.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(bubbled).toBe(false);
    expect(h.sent).toEqual([{ type: 'pick', id: 'el-link-1', shift: false, alt: false }]);
  });

  it('keeps body scrolling keys and wheel available', () => {
    const h = begin();
    render(h, PAGE);
    for (const key of [' ', 'ArrowDown', 'PageDown', 'Home', 'End']) {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      document.body.dispatchEvent(event);
      expect(event.defaultPrevented, `${key} remains available for scrolling`).toBe(false);
    }
    const wheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 40 });
    document.body.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(false);
  });

  it('selects text inside links and blocks middle and right activation', () => {
    const h = begin();
    render(h, '<a href="/next" data-blx-id="el-link-1">text</a>');
    const link = need(h.root.querySelector('a'));
    h.sent.length = 0;
    // A real pointer event whose visible hit target is the text still resolves to the containing link.
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(h.sent).toEqual([{ type: 'pick', id: 'el-link-1', shift: false, alt: false }]);
    h.sent.length = 0;
    const middle = new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 });
    link.dispatchEvent(middle);
    expect(middle.defaultPrevented).toBe(true);
    expect(h.sent).toEqual([{ type: 'pick', id: 'el-link-1', shift: false, alt: false }]);
    h.sent.length = 0;
    const right = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
    link.dispatchEvent(right);
    expect(right.defaultPrevented).toBe(true);
    expect(h.sent).toEqual([{ type: 'pick', id: 'el-link-1', shift: false, alt: false }]);
  });

  it('single click requests inline editing for text with the caret offset, while buttons remain selection only', () => {
    const h = begin();
    render(h, '<h2 data-blx-id="el-heading-1">Hello</h2><button data-blx-id="el-button-1">Go</button>');
    const heading = need(h.root.querySelector('h2'));
    const textNode = heading.firstChild;
    if (!textNode) throw new Error('missing heading text node');
    Object.defineProperty(document, 'caretPositionFromPoint', {
      configurable: true,
      value: () => ({ offsetNode: textNode, offset: 3, getClientRect: () => null }),
    });
    heading.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
    expect(h.sent).toContainEqual({ type: 'edit-request', id: 'el-heading-1', caret: 3 });
    h.sent.length = 0;
    h.root.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(h.sent.some((message) => message.type === 'edit-request')).toBe(false);
  });

  it('modifier clicks select without requesting inline editing', () => {
    const h = begin();
    render(h, '<h2 data-blx-id="el-heading-1">Hello</h2>');
    const heading = need(h.root.querySelector('h2'));
    h.sent.length = 0;
    heading.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
    expect(h.sent).toEqual([{ type: 'pick', id: 'el-heading-1', shift: true, alt: false }]);
  });

  it.each([
    ['dblclick', '<button data-blx-id="el-button-1">button</button>', 'button'],
    ['keyup', '<a href="/next" data-blx-id="el-link-1">link</a>', 'a'],
    ['keypress', '<a href="/next" data-blx-id="el-link-1">link</a>', 'a'],
    ['pointerdown', '<button data-blx-id="el-button-1">button</button>', 'button'],
    ['mousedown', '<button data-blx-id="el-button-1">button</button>', 'button'],
    ['dragstart', '<a href="/next" data-blx-id="el-link-1">link</a>', 'a'],
    ['drop', '<a href="/next" data-blx-id="el-link-1">link</a>', 'a'],
    ['touchstart', '<button data-blx-id="el-button-1">button</button>', 'button'],
    ['change', '<input data-blx-id="el-input-1">', 'input'],
    ['input', '<textarea data-blx-id="el-textarea-1"></textarea>', 'textarea'],
    ['toggle', '<details data-blx-id="el-details-1"><summary>details</summary></details>', 'details'],
    ['play', '<video controls data-blx-id="el-video-1"></video>', 'video'],
  ])('captures %s on its interactive element', (type, html, selector) => {
    const h = begin();
    render(h, html);
    const target = need(h.root.querySelector(selector));
    let bubbled = false;
    target.addEventListener(type, () => {
      bubbled = true;
    });
    const event =
      type === 'keyup' || type === 'keypress'
        ? new KeyboardEvent(type, { key: 'Enter', bubbles: true, cancelable: true })
        : new Event(type, { bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(type !== 'touchstart');
    expect(bubbled).toBe(false);
  });

  it('captures reset before the form handler', () => {
    const h = begin();
    const form = document.createElement('form');
    document.body.append(form);
    let bubbled = false;
    form.addEventListener('reset', () => {
      bubbled = true;
    });
    const event = new Event('reset', { bubbles: true, cancelable: true });
    form.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(bubbled).toBe(false);
    form.remove();
    h.runtime.close();
  });

  it('prevents a submit button inside a form from dispatching a submit', () => {
    const h = begin();
    h.root.innerHTML = '<form><button type="submit" data-blx-id="el-submit-1">send</button></form>';
    const form = need(h.root.querySelector('form'));
    const button = need(form.querySelector('button'));
    let submitted = false;
    form.addEventListener('submit', () => {
      submitted = true;
    });
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    button.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(submitted).toBe(false);
    expect(h.sent.at(-1)).toEqual({ type: 'pick', id: 'el-submit-1', shift: false, alt: false });
  });

  it('ignores elements outside the root and ids that do not match the pattern', () => {
    const h = begin();
    document.body.insertAdjacentHTML('beforeend', '<p id="outside" data-blx-id="el-outside-1">x</p>');
    render(h, '<p id="bad" data-blx-id="BAD ID">x</p>');
    h.sent.length = 0;
    document.getElementById('outside')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    document.getElementById('bad')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(h.sent).toEqual([]);
  });

  describe('hover throttling', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('reports the first hover at once and collapses a burst into the last value', () => {
      const h = begin({ hoverThrottleMs: 100 });
      render(h, '<p data-blx-id="el-aaa-1">a</p><p data-blx-id="el-bbb-1">b</p><p data-blx-id="el-ccc-1">c</p>');
      h.sent.length = 0;
      const over = (selector: string) =>
        h.root.querySelector(selector)?.dispatchEvent(new Event('pointerover', { bubbles: true }));
      over('[data-blx-id="el-aaa-1"]');
      expect(h.sent).toEqual([{ type: 'hover', id: 'el-aaa-1' }]);
      over('[data-blx-id="el-bbb-1"]');
      over('[data-blx-id="el-ccc-1"]');
      expect(h.sent).toHaveLength(1);
      vi.advanceTimersByTime(100);
      expect(h.sent).toEqual([
        { type: 'hover', id: 'el-aaa-1' },
        { type: 'hover', id: 'el-ccc-1' },
      ]);
    });

    it('does not repeat an unchanged hover and reports leaving', () => {
      const h = begin({ hoverThrottleMs: 0 });
      render(h, '<p data-blx-id="el-aaa-1">a</p>');
      h.sent.length = 0;
      const p = h.root.querySelector('p');
      p?.dispatchEvent(new Event('pointerover', { bubbles: true }));
      p?.dispatchEvent(new Event('pointerover', { bubbles: true }));
      expect(h.sent).toEqual([{ type: 'hover', id: 'el-aaa-1' }]);
      document.documentElement.dispatchEvent(new Event('pointerleave'));
      expect(h.sent.at(-1)).toEqual({ type: 'hover', id: null });
    });

    it('sends nothing after close', () => {
      const h = begin({ hoverThrottleMs: 100 });
      render(h, '<p data-blx-id="el-aaa-1">a</p><p data-blx-id="el-bbb-1">b</p>');
      const ps = h.root.querySelectorAll('p');
      ps[0]?.dispatchEvent(new Event('pointerover', { bubbles: true }));
      ps[1]?.dispatchEvent(new Event('pointerover', { bubbles: true }));
      h.sent.length = 0;
      h.runtime.close();
      vi.advanceTimersByTime(500);
      expect(h.sent).toEqual([]);
    });
  });
});

describe('size and rects', () => {
  const box = (left: number, top: number, width: number, height: number): DOMRect => ({
    left,
    top,
    width,
    height,
    right: 0,
    bottom: 0,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });

  it('batches layout work into one animation-frame pass and reports size only when it changed', () => {
    const h = begin();
    render(h, '<p data-blx-id="el-aaa-1">a</p>');
    h.frames.run();
    Object.defineProperty(document.documentElement, 'scrollHeight', { value: 800, configurable: true });
    Object.defineProperty(document.documentElement, 'clientWidth', { value: 640, configurable: true });
    h.sent.length = 0;
    const before = h.frames.requested;
    for (let i = 0; i < 20; i += 1) h.observer.callback();
    render(h, '<p data-blx-id="el-aaa-1">b</p>', '', 2);
    expect(h.frames.requested - before).toBe(1); // 20 resize ticks and a render: one scheduled pass
    expect(types(h)).toEqual(['rendered']);
    h.frames.run();
    expect(h.sent.findLast((message) => message.type === 'size')).toEqual({ type: 'size', width: 640, height: 800 });
    h.sent.length = 0;
    h.observer.callback();
    h.frames.run();
    expect(h.sent).toEqual([]); // same size: nothing new
    delete (document.documentElement as { scrollHeight?: number }).scrollHeight;
    delete (document.documentElement as { clientWidth?: number }).clientWidth;
  });

  it('never measures element rectangles unless the parent asked, and then answers once per frame', () => {
    const h = begin();
    render(h, '<p data-blx-id="el-aaa-1">a</p>');
    const p = need(h.root.querySelector('p'));
    const spy = vi.spyOn(p, 'getBoundingClientRect').mockReturnValue(box(10.123, 20, 100, 30.5));
    h.observer.callback();
    h.frames.run();
    expect(spy).not.toHaveBeenCalled();
    expect(types(h)).not.toContain('rects');
    h.sent.length = 0;
    h.deliver({ type: 'request-rects', revision: 1 });
    h.deliver({ type: 'request-rects', revision: 1 });
    expect(spy).not.toHaveBeenCalled(); // deferred to the frame
    expect(h.frames.pending()).toBe(1);
    h.frames.run();
    expect(h.sent.filter((m) => m.type === 'rects')).toEqual([
      { type: 'rects', revision: 1, items: [{ id: 'el-aaa-1', x: 10.12, y: 20, w: 100, h: 30.5 }] },
    ]);
    expect(spy).toHaveBeenCalledTimes(1);
    h.sent.length = 0;
    h.frames.run();
    h.observer.callback();
    h.frames.run();
    expect(types(h)).not.toContain('rects'); // not repeated without a new request
  });

  it('sends bounded scroll coordinates after ready and coalesces scroll events per frame', () => {
    const h = begin();
    const previousX = Object.getOwnPropertyDescriptor(window, 'scrollX');
    const previousY = Object.getOwnPropertyDescriptor(window, 'scrollY');
    Object.defineProperty(window, 'scrollX', { value: 24.5, configurable: true });
    Object.defineProperty(window, 'scrollY', { value: 88, configurable: true });
    const before = h.frames.requested;
    window.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('scroll'));
    expect(h.frames.requested - before).toBe(0); // ready already scheduled the shared layout pass
    h.frames.run();
    expect(h.sent.filter((message) => message.type === 'scroll')).toEqual([{ type: 'scroll', x: 24.5, y: 88 }]);
    window.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('scroll'));
    expect(h.frames.pending()).toBe(1);
    h.frames.run();
    expect(h.sent.filter((message) => message.type === 'scroll')).toHaveLength(2);
    if (previousX) Object.defineProperty(window, 'scrollX', previousX);
    else delete (window as { scrollX?: number }).scrollX;
    if (previousY) Object.defineProperty(window, 'scrollY', previousY);
    else delete (window as { scrollY?: number }).scrollY;
  });

  it('answers a request-rects before any render with revision 0', () => {
    const h = begin();
    h.deliver({ type: 'request-rects', revision: 9 });
    h.frames.run();
    expect(h.sent.at(-1)).toEqual({ type: 'rects', revision: 0, items: [] });
  });

  it('caps the rects at 5,000 and skips invalid numbers', () => {
    const h = begin();
    render(h, '<i data-blx-id="el-aaa-1"></i>'.repeat(5100));
    h.deliver({ type: 'request-rects', revision: 1 });
    h.frames.run();
    const rects = h.sent.find((m) => m.type === 'rects');
    expect(
      rects?.type === 'rects' && rects.items.length,
      JSON.stringify({ types: types(h), html: h.root.children.length }),
    ).toBe(5000);
    const bad = need(h.root.querySelector('i'));
    vi.spyOn(bad, 'getBoundingClientRect').mockReturnValue(box(Number.NaN, 0, 1, 1));
    h.sent.length = 0;
    h.deliver({ type: 'request-rects', revision: 1 });
    h.frames.run();
    const next = h.sent.find((m) => m.type === 'rects');
    expect(next?.type === 'rects' && next.items.length).toBe(5000);
    expect(next?.type === 'rects' && next.items.some((i) => Number.isNaN(i.x))).toBe(false);
  });

  it('cancels a scheduled pass on close and sends nothing afterwards', () => {
    const h = begin();
    render(h, '<p data-blx-id="el-aaa-1">a</p>');
    h.deliver({ type: 'request-rects', revision: 1 });
    h.sent.length = 0;
    h.runtime.close();
    expect(h.frames.cancelled).toBe(1);
    h.frames.run();
    expect(h.sent).toEqual([]);
  });

  it('disconnects the observer on close', () => {
    const h = begin();
    h.runtime.close();
    expect(h.observer.disconnect).toHaveBeenCalled();
    h.runtime.close();
  });
});

describe('static guarantees', () => {
  it('the source never uses eval, Function, cookies, storage or navigation', () => {
    for (const file of ['runtime.ts', 'guards.ts']) {
      const code = readFileSync(join(process.cwd(), 'src/canvas', file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      expect(code).not.toMatch(/\beval\s*\(/);
      expect(code).not.toMatch(/new Function|\bFunction\s*\(/);
      expect(code).not.toMatch(/document\.cookie|localStorage|sessionStorage|indexedDB/);
      expect(code).not.toMatch(
        /location\.(href|assign|replace)\s*=|location\.(assign|replace)\(|window\.open|insertAdjacentHTML|document\.write/,
      );
      if (file === 'runtime.ts') expect(code).not.toMatch(/innerHTML/);
    }
  });
});
