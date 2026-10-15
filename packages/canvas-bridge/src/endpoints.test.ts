import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCanvasEndpoint } from './canvas.ts';
import { createParentEndpoint, type ParentEndpoint } from './parent.ts';
import type { ViolationReason } from './limits.ts';
import type { CanvasMessage, ParentMessage } from './messages.ts';
import type { Init, InitPayload } from './handshake.ts';
import {
  FakePort,
  FakeWindow,
  INIT_PAYLOAD,
  NONCE,
  ORIGIN,
  fixedRandom,
  makeChannel,
  recordingChannel,
} from './fakes.test-helper.ts';

const hello = (nonce = NONCE) => ({ type: 'blx-canvas-hello', version: 1, nonce });

function parentSetup(options: { timeoutMs?: number } = {}) {
  const editor = new FakeWindow();
  const frame = new FakeWindow();
  const iframe = { contentWindow: frame as unknown };
  const recorder = recordingChannel();
  const messages: CanvasMessage[] = [];
  const violations: ViolationReason[] = [];
  const states: string[] = [];
  const endpoint: ParentEndpoint = createParentEndpoint({
    window: editor,
    iframe,
    origin: ORIGIN,
    onMessage: (m) => messages.push(m),
    onViolation: (r) => violations.push(r),
    onState: (s) => states.push(s),
    channel: recorder.factory,
    ...options,
  });
  const sendHello = (over: Partial<{ origin: string; source: unknown; data: unknown }> = {}) => {
    editor.dispatch({ origin: ORIGIN, source: frame, data: hello(), ...over });
  };
  return { editor, frame, iframe, recorder, messages, violations, states, endpoint, sendHello };
}

describe('parent endpoint: handshake', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('accepts a valid hello and answers with init plus exactly one port to the expected origin', () => {
    const s = parentSetup();
    expect(s.endpoint.state).toBe('idle');
    expect(s.endpoint.connect(INIT_PAYLOAD)).toBe(true);
    expect(s.endpoint.state).toBe('waiting');
    s.sendHello();
    expect(s.endpoint.state).toBe('connected');
    expect(s.frame.posts).toHaveLength(1);
    const post = s.frame.posts[0];
    expect(post?.targetOrigin).toBe(ORIGIN);
    expect(post?.message).toEqual({ type: 'blx-canvas-init', version: 1, nonce: NONCE, ...INIT_PAYLOAD });
    expect(post?.transfer).toEqual([s.recorder.created[0]?.port2]);
    expect(s.states).toEqual(['waiting', 'connected']);
  });

  it('refuses a second connect and an invalid init payload', () => {
    const s = parentSetup();
    expect(s.endpoint.connect({ ...INIT_PAYLOAD, mode: 'x' as 'light' })).toBe(false);
    expect(s.endpoint.state).toBe('idle');
    expect(s.endpoint.connect(INIT_PAYLOAD)).toBe(true);
    expect(s.endpoint.connect(INIT_PAYLOAD)).toBe(false);
  });

  it('ignores a hello before connect()', () => {
    const s = parentSetup();
    s.sendHello();
    expect(s.frame.posts).toHaveLength(0);
  });

  it.each([
    ['wrong origin', { origin: 'https://evil.test' }],
    ['null origin', { origin: 'null' }],
    ['origin with path-like suffix', { origin: `${ORIGIN}.evil.test` }],
    ['wrong source (another window)', { source: new FakeWindow() }],
    ['null source', { source: null }],
    ['wrong nonce shape', { data: hello('short') }],
    ['extra key', { data: { ...hello(), x: 1 } }],
    ['wrong version', { data: { ...hello(), version: 2 } }],
    ['init instead of hello', { data: { type: 'blx-canvas-init', version: 1, nonce: NONCE } }],
    ['string', { data: 'blx-canvas-hello' }],
  ])('ignores a forged hello: %s', (_name, over) => {
    const s = parentSetup();
    s.endpoint.connect(INIT_PAYLOAD);
    s.sendHello(over);
    expect(s.frame.posts).toHaveLength(0);
    expect(s.endpoint.state).toBe('waiting');
    // and the real one still works afterwards
    s.sendHello();
    expect(s.endpoint.state).toBe('connected');
  });

  it('refuses a hello when the iframe has no content window', () => {
    const s = parentSetup();
    s.iframe.contentWindow = null;
    s.endpoint.connect(INIT_PAYLOAD);
    s.sendHello({ source: null });
    expect(s.endpoint.state).toBe('waiting');
  });

  it('follows the iframe contentWindow as it changes', () => {
    const s = parentSetup();
    const next = new FakeWindow();
    s.endpoint.connect(INIT_PAYLOAD);
    s.iframe.contentWindow = next;
    s.sendHello({ source: s.frame });
    expect(s.endpoint.state).toBe('waiting');
    s.sendHello({ source: next });
    expect(s.endpoint.state).toBe('connected');
    expect(next.posts).toHaveLength(1);
  });

  it('refuses a replayed or second hello after the handshake', () => {
    const s = parentSetup();
    s.endpoint.connect(INIT_PAYLOAD);
    s.sendHello();
    s.sendHello();
    s.sendHello({ data: hello('Z'.repeat(20)) });
    expect(s.frame.posts).toHaveLength(1);
    expect(s.recorder.created).toHaveLength(1);
  });

  it('accepts a new handshake after reset(), closes the old port and refuses a replayed nonce', () => {
    const s = parentSetup();
    s.endpoint.connect(INIT_PAYLOAD);
    s.sendHello();
    const first = s.recorder.created[0];
    s.endpoint.reset();
    expect(first?.port1.closed).toBe(true);
    expect(s.endpoint.state).toBe('waiting');
    s.sendHello(); // same nonce again: a replay
    expect(s.endpoint.state).toBe('waiting');
    s.sendHello({ data: hello('N'.repeat(24)) });
    expect(s.endpoint.state).toBe('connected');
    expect(s.recorder.created).toHaveLength(2);
    // messages from the old port are not delivered any more
    first?.port2.postMessage({ type: 'ready' });
    expect(s.messages).toEqual([]);
  });

  it('reset() before connect() or after close() does nothing', () => {
    const s = parentSetup();
    s.endpoint.reset();
    expect(s.endpoint.state).toBe('idle');
    s.endpoint.connect(INIT_PAYLOAD);
    s.endpoint.close();
    s.endpoint.reset();
    expect(s.endpoint.state).toBe('closed');
  });

  it('times out when no hello arrives, once, and can be reset to try again', () => {
    const s = parentSetup({ timeoutMs: 500 });
    s.endpoint.connect(INIT_PAYLOAD);
    vi.advanceTimersByTime(499);
    expect(s.violations).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(s.violations).toEqual(['handshake-timeout']);
    expect(s.endpoint.state).toBe('timed-out');
    s.sendHello(); // late hello after a timeout is ignored
    expect(s.frame.posts).toHaveLength(0);
    s.endpoint.reset();
    expect(s.endpoint.state).toBe('waiting');
    s.sendHello({ data: hello('Q'.repeat(24)) });
    expect(s.endpoint.state).toBe('connected');
    vi.advanceTimersByTime(10_000);
    expect(s.violations).toEqual(['handshake-timeout']);
  });

  it('does not time out once connected', () => {
    const s = parentSetup({ timeoutMs: 500 });
    s.endpoint.connect(INIT_PAYLOAD);
    s.sendHello();
    vi.advanceTimersByTime(5000);
    expect(s.violations).toEqual([]);
  });

  it('reports handshake-failed when the frame cannot be posted to', () => {
    const s = parentSetup();
    s.endpoint.connect(INIT_PAYLOAD);
    s.frame.throwOnPost = true;
    s.sendHello();
    expect(s.violations).toEqual(['handshake-failed']);
    expect(s.endpoint.state).toBe('closed');
    expect(s.recorder.created[0]?.port1.closed).toBe(true);
    expect(s.editor.listeners.size).toBe(0);
  });

  it('reports handshake-failed when the channel cannot be created', () => {
    const editor = new FakeWindow();
    const frame = new FakeWindow();
    const violations: ViolationReason[] = [];
    const endpoint = createParentEndpoint({
      window: editor,
      iframe: { contentWindow: frame },
      origin: ORIGIN,
      onMessage: () => undefined,
      onViolation: (r) => violations.push(r),
      channel: () => {
        throw new Error('no channels');
      },
    });
    endpoint.connect(INIT_PAYLOAD);
    editor.dispatch({ origin: ORIGIN, source: frame, data: hello() });
    expect(violations).toEqual(['handshake-failed']);
  });
});

describe('parent endpoint: frame reloads (notifyLoad)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  const second = 'Q'.repeat(24);

  it('does not react to the first load, whether the hello came before or after it', () => {
    const before = parentSetup();
    before.endpoint.connect(INIT_PAYLOAD);
    before.sendHello();
    before.endpoint.notifyLoad(); // hello won the race against load
    expect(before.endpoint.state).toBe('connected');
    expect(before.recorder.created[0]?.port1.closed).toBe(false);
    expect(before.states).toEqual(['waiting', 'connected']);

    const after = parentSetup();
    after.endpoint.connect(INIT_PAYLOAD);
    after.endpoint.notifyLoad(); // load won the race against hello
    expect(after.endpoint.state).toBe('waiting');
    after.sendHello();
    expect(after.endpoint.state).toBe('connected');
  });

  it('treats a later load as a reload: closes the port and accepts a new hello', () => {
    const s = parentSetup();
    s.endpoint.connect(INIT_PAYLOAD);
    s.sendHello();
    s.endpoint.notifyLoad();
    s.endpoint.notifyLoad(); // the frame was reloaded; the new hello has not arrived yet
    expect(s.recorder.created[0]?.port1.closed).toBe(true);
    expect(s.endpoint.state).toBe('waiting');
    expect(s.endpoint.send({ type: 'ping', n: 1 })).toBe(false);
    s.sendHello({ data: hello(second) });
    expect(s.endpoint.state).toBe('connected');
    expect(s.recorder.created).toHaveLength(2);
    expect(s.frame.posts).toHaveLength(2);
    expect(s.frame.posts[1]?.message).toMatchObject({ nonce: second });
    expect(s.endpoint.send({ type: 'ping', n: 1 })).toBe(true);
  });

  it('keeps the connection of a good hello that raced ahead of the load event of the reloaded document', () => {
    const s = parentSetup();
    s.endpoint.connect(INIT_PAYLOAD);
    s.sendHello();
    s.endpoint.notifyLoad();
    s.sendHello({ data: hello(second) }); // the reloaded document said hello before its load event: remembered
    expect(s.endpoint.state).toBe('connected');
    expect(s.frame.posts).toHaveLength(1);
    s.endpoint.notifyLoad(); // the load event confirms the reload: the remembered hello is answered at once
    expect(s.endpoint.state).toBe('connected');
    expect(s.recorder.created).toHaveLength(2);
    expect(s.recorder.created[0]?.port1.closed).toBe(true);
    expect(s.recorder.created[1]?.port1.closed).toBe(false);
    expect(s.frame.posts[1]?.message).toMatchObject({ nonce: second });
    expect(s.states).toEqual(['waiting', 'connected', 'waiting', 'connected']);
  });

  it('does not let a hello alone replace a live connection, and a replayed nonce is refused on reload', () => {
    const s = parentSetup();
    s.endpoint.connect(INIT_PAYLOAD);
    s.endpoint.notifyLoad();
    s.sendHello();
    s.sendHello({ data: hello(second) });
    expect(s.recorder.created).toHaveLength(1);
    s.endpoint.notifyLoad();
    s.endpoint.notifyLoad(); // a recorded hello with the first nonce cannot start a handshake again
    s.sendHello();
    expect(s.endpoint.state).toBe('waiting');
  });

  it('ignores a hello from the wrong source or origin when remembering', () => {
    const s = parentSetup();
    s.endpoint.connect(INIT_PAYLOAD);
    s.endpoint.notifyLoad();
    s.sendHello();
    s.sendHello({ source: new FakeWindow(), data: hello(second) });
    s.sendHello({ origin: 'https://evil.test', data: hello(second) });
    s.endpoint.notifyLoad();
    expect(s.endpoint.state).toBe('waiting'); // nothing remembered
    expect(s.recorder.created).toHaveLength(1);
  });

  it('times out when a reloaded frame never says hello, and recovers on the next load', () => {
    const s = parentSetup({ timeoutMs: 1000 });
    s.endpoint.connect(INIT_PAYLOAD);
    s.endpoint.notifyLoad();
    s.sendHello();
    s.endpoint.notifyLoad();
    vi.advanceTimersByTime(1000);
    expect(s.endpoint.state).toBe('timed-out');
    expect(s.violations).toEqual(['handshake-timeout']);
    s.endpoint.notifyLoad();
    expect(s.endpoint.state).toBe('waiting');
    s.sendHello({ data: hello(second) });
    expect(s.endpoint.state).toBe('connected');
  });

  it('does nothing before connect() or after close()', () => {
    const s = parentSetup();
    s.endpoint.notifyLoad();
    s.endpoint.notifyLoad();
    expect(s.endpoint.state).toBe('idle');
    s.endpoint.connect(INIT_PAYLOAD);
    s.endpoint.close();
    s.endpoint.notifyLoad();
    expect(s.endpoint.state).toBe('closed');
  });

  it('uses current init values for a handshake after a reload when getInit is given', () => {
    const editor = new FakeWindow();
    const frame = new FakeWindow();
    const recorder = recordingChannel();
    let now: InitPayload = { ...INIT_PAYLOAD };
    const endpoint = createParentEndpoint({
      window: editor,
      iframe: { contentWindow: frame },
      origin: ORIGIN,
      onMessage: () => undefined,
      onViolation: () => undefined,
      channel: recorder.factory,
      getInit: () => now,
    });
    endpoint.connect(INIT_PAYLOAD);
    editor.dispatch({ origin: ORIGIN, source: frame, data: hello() });
    now = { ...INIT_PAYLOAD, mode: 'dark', viewport: { width: 768, breakpoint: 'tablet' } };
    endpoint.notifyLoad();
    endpoint.notifyLoad();
    editor.dispatch({ origin: ORIGIN, source: frame, data: hello(second) });
    expect(frame.posts[1]?.message).toMatchObject({ mode: 'dark', viewport: { width: 768, breakpoint: 'tablet' } });
  });
});

describe('parent endpoint: port traffic', () => {
  function connected() {
    const s = parentSetup();
    s.endpoint.connect(INIT_PAYLOAD);
    s.sendHello();
    const channel = s.recorder.created[0];
    if (channel === undefined) throw new Error('no channel');
    return { ...s, canvasPort: channel.port2 };
  }

  it('delivers valid canvas messages and ignores nothing else', () => {
    const s = connected();
    s.canvasPort.postMessage({ type: 'ready' });
    s.canvasPort.postMessage({ type: 'pick', id: 'el-heading-1', shift: false, alt: true });
    expect(s.messages).toEqual([{ type: 'ready' }, { type: 'pick', id: 'el-heading-1', shift: false, alt: true }]);
  });

  it('sends validated messages over the port only, never over window.postMessage', () => {
    const s = connected();
    const postsBefore = s.frame.posts.length;
    expect(s.endpoint.send({ type: 'ping', n: 1 })).toBe(true);
    expect(s.canvasPort.received).toEqual([{ type: 'ping', n: 1 }]);
    expect(s.frame.posts.length).toBe(postsBefore);
  });

  it('refuses to send an invalid message and to send before the connection', () => {
    const s = connected();
    expect(s.endpoint.send({ type: 'select', id: 'x' })).toBe(false);
    expect(s.canvasPort.received).toEqual([]);
    const idle = parentSetup();
    expect(idle.endpoint.send({ type: 'ping', n: 1 })).toBe(false);
  });

  it('drops invalid messages, counts them, and closes with protocol-violation after 20', () => {
    const s = connected();
    for (let i = 0; i < 19; i += 1) s.canvasPort.postMessage({ type: 'evil', i });
    expect(s.violations).toEqual([]);
    expect(s.endpoint.state).toBe('connected');
    s.canvasPort.postMessage({ type: 'ready' }); // valid messages do not reset the counter
    s.canvasPort.postMessage('x');
    expect(s.violations).toEqual(['protocol-violation']);
    expect(s.endpoint.state).toBe('closed');
    expect(s.editor.listeners.size).toBe(0);
    s.canvasPort.postMessage({ type: 'ready' });
    expect(s.messages).toEqual([{ type: 'ready' }]);
    expect(s.endpoint.send({ type: 'ping', n: 1 })).toBe(false);
  });

  it('counts message errors as invalid messages', () => {
    const s = connected();
    const port = s.recorder.created[0]?.port1;
    for (let i = 0; i < 20; i += 1) port?.onmessageerror?.(new Error('x'));
    expect(s.violations).toEqual(['protocol-violation']);
  });

  it('survives a throwing consumer', () => {
    const editor = new FakeWindow();
    const frame = new FakeWindow();
    const recorder = recordingChannel();
    const seen: CanvasMessage[] = [];
    const endpoint = createParentEndpoint({
      window: editor,
      iframe: { contentWindow: frame },
      origin: ORIGIN,
      onMessage: (m) => {
        seen.push(m);
        throw new Error('consumer bug');
      },
      onViolation: () => undefined,
      channel: recorder.factory,
    });
    endpoint.connect(INIT_PAYLOAD);
    editor.dispatch({ origin: ORIGIN, source: frame, data: hello() });
    const port = recorder.created[0]?.port2;
    port?.postMessage({ type: 'ready' });
    port?.postMessage({ type: 'ready' });
    expect(seen).toHaveLength(2);
    expect(endpoint.state).toBe('connected');
  });

  it('close() closes the port, removes the listener and silences everything', () => {
    const s = connected();
    s.endpoint.close();
    expect(s.endpoint.state).toBe('closed');
    expect(s.recorder.created[0]?.port1.closed).toBe(true);
    expect(s.editor.listeners.size).toBe(0);
    s.canvasPort.postMessage({ type: 'ready' });
    expect(s.messages).toEqual([]);
    s.endpoint.close(); // idempotent
    expect(s.states.filter((x) => x === 'closed')).toHaveLength(1);
  });

  it('close() while waiting cancels the timer', () => {
    vi.useFakeTimers();
    const s = parentSetup({ timeoutMs: 100 });
    s.endpoint.connect(INIT_PAYLOAD);
    s.endpoint.close();
    vi.advanceTimersByTime(1000);
    expect(s.violations).toEqual([]);
    expect(s.editor.listeners.size).toBe(0);
    vi.useRealTimers();
  });

  it('does not leak listeners across connect/close cycles', () => {
    const editor = new FakeWindow();
    for (let i = 0; i < 5; i += 1) {
      const endpoint = createParentEndpoint({
        window: editor,
        iframe: { contentWindow: new FakeWindow() },
        origin: ORIGIN,
        onMessage: () => undefined,
        onViolation: () => undefined,
      });
      endpoint.connect(INIT_PAYLOAD);
      endpoint.close();
    }
    expect(editor.listeners.size).toBe(0);
  });
});

function canvasSetup() {
  const win = new FakeWindow();
  const parent = new FakeWindow();
  win.parent = parent;
  const inits: Init[] = [];
  const messages: ParentMessage[] = [];
  const violations: ViolationReason[] = [];
  const endpoint = createCanvasEndpoint({
    window: Object.assign(win, { parent }),
    origin: ORIGIN,
    onInit: (i) => inits.push(i),
    onMessage: (m) => messages.push(m),
    onViolation: (r) => violations.push(r),
    random: fixedRandom(7),
  });
  const nonce = () => {
    const message = parent.posts[0]?.message as { nonce: string } | undefined;
    return message?.nonce ?? '';
  };
  const init = (over: Record<string, unknown> = {}) => ({
    type: 'blx-canvas-init',
    version: 1,
    nonce: nonce(),
    ...INIT_PAYLOAD,
    ...over,
  });
  const deliver = (over: Partial<{ origin: string; source: unknown; data: unknown; ports: unknown[] }> = {}) => {
    const channel = makeChannel();
    win.dispatch({ origin: ORIGIN, source: parent, data: init(), ports: [channel.port2], ...over });
    return channel;
  };
  return { win, parent, inits, messages, violations, endpoint, nonce, deliver, init };
}

describe('canvas endpoint', () => {
  it('posts the hello to its parent with its own origin as target', () => {
    const s = canvasSetup();
    expect(s.endpoint.connect()).toBe(true);
    expect(s.parent.posts).toHaveLength(1);
    expect(s.parent.posts[0]?.targetOrigin).toBe(ORIGIN);
    expect(s.parent.posts[0]?.message).toEqual({ type: 'blx-canvas-hello', version: 1, nonce: s.nonce() });
    expect(s.nonce()).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(s.endpoint.state).toBe('waiting');
    expect(s.endpoint.connect()).toBe(false);
  });

  it('accepts the matching init once and talks over the port', () => {
    const s = canvasSetup();
    s.endpoint.connect();
    const channel = s.deliver();
    expect(s.endpoint.state).toBe('connected');
    expect(s.inits).toHaveLength(1);
    expect(s.inits[0]).toMatchObject({ locale: 'nl_NL', dir: 'ltr', mode: 'light' });
    channel.port1.postMessage({ type: 'ping', n: 2 });
    expect(s.messages).toEqual([{ type: 'ping', n: 2 }]);
    expect(s.endpoint.send({ type: 'pong', n: 2 })).toBe(true);
    expect(channel.port1.received).toEqual([{ type: 'pong', n: 2 }]);
    expect(s.win.listeners.size).toBe(0);
  });

  it('only accepts the first valid init (double init)', () => {
    const s = canvasSetup();
    s.endpoint.connect();
    s.deliver();
    const second = s.deliver();
    expect(s.inits).toHaveLength(1);
    second.port1.postMessage({ type: 'ping', n: 1 });
    expect(s.messages).toEqual([]);
  });

  it.each([
    ['wrong origin', { origin: 'https://evil.test' }],
    ['wrong source', { source: new FakeWindow() }],
    ['null source', { source: null }],
    ['no port', { ports: [] }],
    ['two ports', { ports: [makeChannel().port2, makeChannel().port2] }],
    ['wrong nonce', { data: { type: 'blx-canvas-init', version: 1, nonce: 'W'.repeat(32), ...INIT_PAYLOAD } }],
    ['invalid schema', { data: { type: 'blx-canvas-init', version: 1, nonce: 'x', mode: 'light' } }],
    ['a hello (wrong type)', { data: { type: 'blx-canvas-hello', version: 1, nonce: 'x'.repeat(20) } }],
    [
      'hostile viewport',
      {
        data: {
          type: 'blx-canvas-init',
          version: 1,
          nonce: 'x'.repeat(32),
          ...INIT_PAYLOAD,
          viewport: { width: 9, breakpoint: 'b' },
        },
      },
    ],
  ])('rejects an init with %s and still accepts a good one', (_name, over) => {
    const s = canvasSetup();
    s.endpoint.connect();
    const forged = makeChannel();
    s.win.dispatch({ origin: ORIGIN, source: s.parent, data: s.init(), ports: [forged.port2], ...over });
    expect(s.inits).toHaveLength(0);
    expect(s.endpoint.state).toBe('waiting');
    s.deliver();
    expect(s.inits).toHaveLength(1);
  });

  it('ignores an init before the hello was sent', () => {
    const s = canvasSetup();
    s.win.dispatch({
      origin: ORIGIN,
      source: s.parent,
      data: { type: 'blx-canvas-init', version: 1, nonce: 'x'.repeat(20), ...INIT_PAYLOAD },
      ports: [makeChannel().port2],
    });
    expect(s.inits).toHaveLength(0);
  });

  it('rejects a port-like object without postMessage', () => {
    const s = canvasSetup();
    s.endpoint.connect();
    s.win.dispatch({ origin: ORIGIN, source: s.parent, data: s.init(), ports: [{}] });
    expect(s.inits).toHaveLength(0);
  });

  it('closes itself after 20 invalid port messages and reports a violation', () => {
    const s = canvasSetup();
    s.endpoint.connect();
    const channel = s.deliver();
    for (let i = 0; i < 20; i += 1) channel.port1.postMessage({ type: 'render', html: 1 });
    expect(s.violations).toEqual(['protocol-violation']);
    expect(s.endpoint.state).toBe('closed');
    expect(channel.port2.closed).toBe(true);
    expect(s.endpoint.send({ type: 'ready' })).toBe(false);
  });

  it('refuses to send an invalid canvas message', () => {
    const s = canvasSetup();
    s.endpoint.connect();
    const channel = s.deliver();
    expect(s.endpoint.send({ type: 'error', code: 'free text' } as unknown as CanvasMessage)).toBe(false);
    expect(channel.port1.received).toEqual([]);
  });

  it('reports handshake-failed when the parent is unreachable', () => {
    const s = canvasSetup();
    s.parent.throwOnPost = true;
    expect(s.endpoint.connect()).toBe(false);
    expect(s.violations).toEqual(['handshake-failed']);
    expect(s.win.listeners.size).toBe(0);
  });

  it('close() removes the listener and closes the port', () => {
    const s = canvasSetup();
    s.endpoint.connect();
    expect(s.win.listeners.size).toBe(1);
    s.endpoint.close();
    expect(s.win.listeners.size).toBe(0);
    const s2 = canvasSetup();
    s2.endpoint.connect();
    const channel = s2.deliver();
    s2.endpoint.close();
    expect(channel.port2.closed).toBe(true);
    expect(s2.endpoint.state).toBe('closed');
  });
});

describe('both endpoints together', () => {
  it('complete a handshake and exchange messages', () => {
    const editor = new FakeWindow();
    const frame = new FakeWindow();
    const canvasMessages: ParentMessage[] = [];
    const parentMessages: CanvasMessage[] = [];
    const parent = createParentEndpoint({
      window: editor,
      iframe: { contentWindow: frame },
      origin: ORIGIN,
      onMessage: (m) => parentMessages.push(m),
      onViolation: () => undefined,
      channel: makeChannel,
    });
    frame.parent = editor;
    const canvas = createCanvasEndpoint({
      window: Object.assign(frame, { parent: editor }),
      origin: ORIGIN,
      onInit: () => undefined,
      onMessage: (m) => canvasMessages.push(m),
      onViolation: () => undefined,
    });
    // wire the fakes the way a browser would: the hello travels from the canvas to the editor window and the init back
    const toEditor = editor.postMessage.bind(editor);
    editor.postMessage = (message, targetOrigin, transfer) => {
      toEditor(message, targetOrigin, transfer);
      editor.dispatch({ origin: ORIGIN, source: frame, data: message });
    };
    const toFrame = frame.postMessage.bind(frame);
    frame.postMessage = (message, targetOrigin, transfer) => {
      toFrame(message, targetOrigin, transfer);
      frame.dispatch({ origin: ORIGIN, source: editor, data: message, ports: transfer ?? [] });
    };
    parent.connect(INIT_PAYLOAD);
    canvas.connect();
    expect(parent.state).toBe('connected');
    expect(canvas.state).toBe('connected');
    expect(parent.send({ type: 'ping', n: 5 })).toBe(true);
    expect(canvas.send({ type: 'pong', n: 5 })).toBe(true);
    expect(canvasMessages).toEqual([{ type: 'ping', n: 5 }]);
    expect(parentMessages).toEqual([{ type: 'pong', n: 5 }]);
    parent.close();
    canvas.close();
    expect(editor.listeners.size + frame.listeners.size).toBe(0);
  });
});

describe('fake port', () => {
  it('queues messages until a handler is attached', () => {
    const { port1, port2 } = makeChannel();
    port1.postMessage('a');
    const seen: unknown[] = [];
    port2.onmessage = (e) => seen.push(e.data);
    expect(seen).toEqual(['a']);
    expect(port1 instanceof FakePort).toBe(true);
  });
});
