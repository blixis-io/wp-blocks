/**
 * The REAL parent and canvas endpoints over Node's real `MessageChannel`/`MessagePort`: the port is transferred with
 * `postMessage(..., [port])`, started by assigning `onmessage`, closed, and posted to after close. Only the two windows (and
 * their `postMessage` wire, which is itself a real `MessageChannel`) are simulated.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCanvasEndpoint, type CanvasEndpoint } from './canvas.ts';
import type { MessageEventLike } from './environment.ts';
import { FakeWindow, INIT_PAYLOAD, ORIGIN } from './fakes.test-helper.ts';
import type { ViolationReason } from './limits.ts';
import type { CanvasMessage, ParentMessage } from './messages.ts';
import { createParentEndpoint, type ParentEndpoint } from './parent.ts';

/** The web-style view of Node's real `MessagePort` that the test needs (events with `data` and `ports`). */
interface WebPort {
  onmessage: ((event: { readonly data: unknown; readonly ports: readonly unknown[] }) => void) | null;
  postMessage: (message: unknown, transfer?: unknown[]) => void;
  close: () => void;
}
const wire = (): { port1: WebPort; port2: WebPort } =>
  new MessageChannel() as unknown as { port1: WebPort; port2: WebPort };
const isRealPort = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && value.constructor.name === 'MessagePort';

const open: { close: () => void }[] = [];
afterEach(() => {
  for (const handle of open.splice(0)) handle.close();
});

interface Rig {
  parent: ParentEndpoint;
  canvas: CanvasEndpoint;
  fromCanvas: CanvasMessage[];
  fromParent: ParentMessage[];
  parentViolations: ViolationReason[];
  canvasViolations: ViolationReason[];
  initPorts: unknown[][];
  /** Delivers a window message to the editor as if the frame sent it. */
  forge: (event: Partial<MessageEventLike>) => void;
}

function rig(): Rig {
  const editor = new FakeWindow();
  const frame = new FakeWindow();
  // `window.postMessage` is asynchronous and can transfer ports: use a real channel as the wire, one per direction.
  const toEditor = wire();
  const toFrame = wire();
  open.push(toEditor.port1, toEditor.port2, toFrame.port1, toFrame.port2);
  const editorHandle = {
    postMessage: (message: unknown, _origin: string, transfer?: unknown[]) => {
      toEditor.port1.postMessage(message, transfer ?? []);
    },
  };
  const frameHandle = {
    postMessage: (message: unknown, _origin: string, transfer?: unknown[]) => {
      toFrame.port1.postMessage(message, transfer ?? []);
    },
  };
  const initPorts: unknown[][] = [];
  toEditor.port2.onmessage = (event) => {
    editor.dispatch({ data: event.data, origin: ORIGIN, source: frameHandle, ports: event.ports });
  };
  toFrame.port2.onmessage = (event) => {
    initPorts.push([...event.ports]);
    frame.dispatch({ data: event.data, origin: ORIGIN, source: editorHandle, ports: event.ports });
  };

  const fromCanvas: CanvasMessage[] = [];
  const fromParent: ParentMessage[] = [];
  const parentViolations: ViolationReason[] = [];
  const canvasViolations: ViolationReason[] = [];
  const parent = createParentEndpoint({
    window: editor,
    iframe: { contentWindow: frameHandle },
    origin: ORIGIN,
    onMessage: (m) => fromCanvas.push(m),
    onViolation: (r) => parentViolations.push(r),
  });
  const canvas = createCanvasEndpoint({
    window: Object.assign(frame, { parent: editorHandle }),
    origin: ORIGIN,
    onInit: () => undefined,
    onMessage: (m) => fromParent.push(m),
    onViolation: (r) => canvasViolations.push(r),
  });
  open.push(parent, canvas);
  return {
    parent,
    canvas,
    fromCanvas,
    fromParent,
    parentViolations,
    canvasViolations,
    initPorts,
    forge: (event) => {
      editor.dispatch({ origin: ORIGIN, source: frameHandle, ...event });
    },
  };
}

const settle = (ms = 25) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function connected(): Promise<Rig> {
  const r = rig();
  expect(r.parent.connect(INIT_PAYLOAD)).toBe(true);
  expect(r.canvas.connect()).toBe(true);
  await vi.waitFor(() => {
    expect(r.parent.state).toBe('connected');
    expect(r.canvas.state).toBe('connected');
  });
  return r;
}

describe('real MessageChannel: handshake and traffic', () => {
  it('transfers exactly one real MessagePort with the init, which the canvas keeps', async () => {
    const r = await connected();
    expect(r.initPorts).toHaveLength(1);
    expect(r.initPorts[0]).toHaveLength(1);
    expect(isRealPort(r.initPorts[0]?.[0])).toBe(true);
  });

  it('exchanges validated messages in both directions over the started ports', async () => {
    const r = await connected();
    expect(r.parent.send({ type: 'ping', n: 7 })).toBe(true);
    await vi.waitFor(() => {
      expect(r.fromParent).toEqual([{ type: 'ping', n: 7 }]);
    });
    expect(r.canvas.send({ type: 'pong', n: 7 })).toBe(true);
    expect(r.canvas.send({ type: 'rendered', revision: 3 })).toBe(true);
    await vi.waitFor(() => {
      expect(r.fromCanvas).toEqual([
        { type: 'pong', n: 7 },
        { type: 'rendered', revision: 3 },
      ]);
    });
    // a message that is not in the schema is refused before it reaches the wire
    expect(r.parent.send({ type: 'request-rects', revision: -1 })).toBe(false);
    expect(r.parent.send({ type: 'request-rects', revision: 4 })).toBe(true);
    await vi.waitFor(() => {
      expect(r.fromParent.at(-1)).toEqual({ type: 'request-rects', revision: 4 });
    });
  });

  it('delivers messages posted before the receiver attached a handler once it starts the port', async () => {
    const r = await connected();
    for (let n = 0; n < 5; n += 1) r.canvas.send({ type: 'pong', n });
    await vi.waitFor(() => {
      expect(r.fromCanvas.map((m) => (m.type === 'pong' ? m.n : -1))).toEqual([0, 1, 2, 3, 4]);
    });
  });

  it('closes the connection on 20 invalid messages sent through the real port', async () => {
    const r = await connected();
    const port = r.initPorts[0]?.[0] as WebPort;
    for (let i = 0; i < 20; i += 1) port.postMessage({ type: 'eval', code: 'x' });
    await vi.waitFor(() => {
      expect(r.parentViolations).toEqual(['protocol-violation']);
    });
    expect(r.parent.state).toBe('closed');
    expect(r.parent.send({ type: 'ping', n: 1 })).toBe(false);
  });

  it('ignores a forged window hello after the handshake and creates no second channel', async () => {
    const r = await connected();
    r.forge({ data: { type: 'blx-canvas-hello', version: 1, nonce: 'F'.repeat(24) } });
    await settle();
    expect(r.initPorts).toHaveLength(1);
    expect(r.parent.state).toBe('connected');
  });
});

describe('real MessageChannel: close', () => {
  it('post after close returns false on the closed side and nothing arrives at the other side', async () => {
    const r = await connected();
    r.parent.close();
    expect(r.parent.state).toBe('closed');
    expect(r.parent.send({ type: 'ping', n: 1 })).toBe(false);
    r.parent.close(); // idempotent
    const before = r.fromParent.length;
    await settle();
    expect(r.fromParent).toHaveLength(before);
    // the canvas side posting to the closed peer never throws and nothing reaches the closed parent
    expect(() => r.canvas.send({ type: 'pong', n: 2 })).not.toThrow();
    await settle();
    expect(r.fromCanvas).toEqual([]);
  });

  it('a closed canvas endpoint refuses to send and the parent can still close cleanly', async () => {
    const r = await connected();
    r.canvas.close();
    expect(r.canvas.send({ type: 'pong', n: 1 })).toBe(false);
    expect(() => r.parent.send({ type: 'ping', n: 1 })).not.toThrow();
    await settle();
    expect(r.fromParent).toEqual([]);
    r.parent.close();
  });

  it('reset() closes the old real port: nothing is delivered through it any more', async () => {
    const r = await connected();
    expect(isRealPort(r.initPorts[0]?.[0])).toBe(true);
    r.parent.reset();
    expect(r.parent.state).toBe('waiting');
    expect(r.parent.send({ type: 'ping', n: 1 })).toBe(false);
    await settle();
    expect(r.fromParent).toEqual([]); // the old port no longer delivers to the canvas
  });
});
