import type {
  ChannelFactory,
  MessageEventLike,
  MessageListener,
  MessageSource,
  PortLike,
  PostTarget,
} from './environment.ts';

/** A port that queues messages until a handler is assigned, like a real `MessagePort`. Delivery is synchronous. */
export class FakePort implements PortLike {
  peer: FakePort | null = null;
  closed = false;
  readonly received: unknown[] = [];
  private handler: PortLike['onmessage'] = null;
  private queue: unknown[] = [];
  onmessageerror: PortLike['onmessageerror'] = null;

  get onmessage(): PortLike['onmessage'] {
    return this.handler;
  }
  set onmessage(value: PortLike['onmessage']) {
    this.handler = value;
    if (value !== null) {
      const pending = this.queue;
      this.queue = [];
      for (const data of pending) value({ data });
    }
  }
  postMessage(message: unknown): void {
    if (this.closed) return;
    this.peer?.deliver(message);
  }
  deliver(data: unknown): void {
    this.received.push(data);
    if (this.closed) return;
    if (this.handler === null) this.queue.push(data);
    else this.handler({ data });
  }
  close(): void {
    this.closed = true;
    this.handler = null;
  }
}

export function makeChannel(): { port1: FakePort; port2: FakePort } {
  const port1 = new FakePort();
  const port2 = new FakePort();
  port1.peer = port2;
  port2.peer = port1;
  return { port1, port2 };
}

export class FakeWindow implements MessageSource, PostTarget {
  readonly listeners = new Set<MessageListener>();
  readonly posts: { message: unknown; targetOrigin: string; transfer: unknown[] | undefined }[] = [];
  parent: FakeWindow | null = null;
  throwOnPost = false;
  addEventListener(_type: 'message', listener: MessageListener): void {
    this.listeners.add(listener);
  }
  removeEventListener(_type: 'message', listener: MessageListener): void {
    this.listeners.delete(listener);
  }
  postMessage(message: unknown, targetOrigin: string, transfer?: unknown[]): void {
    if (this.throwOnPost) throw new Error('detached');
    this.posts.push({ message, targetOrigin, transfer });
  }
  dispatch(event: Partial<MessageEventLike>): void {
    const full: MessageEventLike = { data: undefined, origin: '', source: null, ports: [], ...event };
    for (const listener of [...this.listeners]) listener(full);
  }
}

export const ORIGIN = 'https://site.test';
export const NONCE = 'AbCdEfGhIjKlMnOp-_123456';
export const INIT_PAYLOAD = {
  viewport: { width: 1280, breakpoint: 'base' },
  mode: 'light' as const,
  locale: 'nl_NL',
  dir: 'ltr' as const,
};

export function recordingChannel(): { factory: ChannelFactory; created: ReturnType<typeof makeChannel>[] } {
  const created: ReturnType<typeof makeChannel>[] = [];
  return {
    created,
    factory: () => {
      const channel = makeChannel();
      created.push(channel);
      return channel;
    },
  };
}

export const fixedRandom = (byte: number) => (length: number) => new Uint8Array(length).fill(byte);
