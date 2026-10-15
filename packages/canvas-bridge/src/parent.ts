import {
  defaultChannel,
  type ChannelFactory,
  type EndpointState,
  type MessageEventLike,
  type MessageSource,
  type PortLike,
  type PostTarget,
} from './environment.ts';
import { parseHello, parseInitPayload, type Hello, type InitPayload } from './handshake.ts';
import { INIT_TYPE, LIMITS, PROTOCOL_VERSION, type ViolationReason } from './limits.ts';
import { parseCanvasMessage, parseParentMessage, type CanvasMessage, type ParentMessage } from './messages.ts';
import { attachPort, type PortSession } from './port.ts';

export interface ParentEndpointOptions {
  /** The window that receives the canvas hello (the editor window). */
  window: MessageSource;
  /** The iframe element; only its `contentWindow` is used, and it is read again for every message. */
  iframe: { readonly contentWindow: unknown };
  /** The only origin the hello may come from and the only target origin used for the init. */
  origin: string;
  onMessage: (message: CanvasMessage) => void;
  onViolation: (reason: ViolationReason) => void;
  /** Called when the handshake completes (`connected`) and on every later state change. */
  onState?: (state: EndpointState) => void;
  /** Supplies the init values for a handshake after a frame reload (so they are current, not those of `connect`). */
  getInit?: () => InitPayload;
  timeoutMs?: number;
  channel?: ChannelFactory;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface ParentEndpoint {
  /** Starts listening for the canvas hello (and the handshake timeout). */
  connect(init: InitPayload): boolean;
  /** The iframe was (re)loaded on purpose: forget the old connection and accept one new handshake. */
  reset(): void;
  /**
   * Call for EVERY `load` event of the iframe. The first load is the document `connect` was made for and changes nothing
   * (its hello may arrive before or after the event). Every later load is a new document: the endpoint behaves like `reset()`
   * and, when that document's hello already arrived, answers it at once.
   */
  notifyLoad(): void;
  /** Sends a validated message to the canvas. `false` when not connected or when the message is invalid. */
  send(message: ParentMessage): boolean;
  close(): void;
  readonly state: EndpointState;
}

const USED_NONCES_MAX = 32;

/**
 * The editor side of the canvas protocol. It accepts a hello only when `event.origin === origin`, `event.source` is the
 * iframe's current `contentWindow`, the schema is valid, the endpoint is waiting. A later hello while connected is only remembered and acted on when the iframe's next `load` confirms a reload.
 * It then creates a `MessageChannel`, keeps `port1` and transfers `port2` with the init, to `origin` only. From then on only
 * the port is used; `window.postMessage` traffic is never trusted again.
 */
export function createParentEndpoint(options: ParentEndpointOptions): ParentEndpoint {
  const channel = options.channel ?? defaultChannel;
  const setTimer = options.setTimer ?? ((callback, ms) => setTimeout(callback, ms));
  const clearTimer =
    options.clearTimer ??
    ((handle) => {
      clearTimeout(handle as ReturnType<typeof setTimeout>);
    });
  const timeoutMs = options.timeoutMs ?? LIMITS.handshakeTimeoutMs;
  let state: EndpointState = 'idle';
  let init: InitPayload | null = null;
  let session: PortSession | null = null;
  let timer: unknown = null;
  let listening = false;
  const usedNonces: string[] = [];
  let loads = 0;
  // A valid hello that arrived while connected: only a new document sends one (each sends exactly one). It is answered when
  // the load event confirms the reload, so a forged or duplicate hello alone cannot replace a live connection.
  let pendingHello: Hello | null = null;

  const setState = (next: EndpointState): void => {
    if (state === next) return;
    state = next;
    try {
      options.onState?.(next);
    } catch {
      /* the owner must not break the endpoint */
    }
  };
  const stopTimer = (): void => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };
  const report = (reason: ViolationReason): void => {
    try {
      options.onViolation(reason);
    } catch {
      /* the owner must not break the endpoint */
    }
  };
  const dropSession = (): void => {
    session?.close();
    session = null;
  };

  const handshake = (hello: Hello): void => {
    if (usedNonces.includes(hello.nonce)) return;
    let current: InitPayload | null = init;
    if (options.getInit !== undefined) {
      try {
        const checked = parseInitPayload(options.getInit());
        if (checked.ok) current = checked.value;
      } catch {
        /* keep the previous values */
      }
    }
    if (current === null) return;
    const target = options.iframe.contentWindow;
    if (target === null || target === undefined) return;
    usedNonces.push(hello.nonce);
    if (usedNonces.length > USED_NONCES_MAX) usedNonces.shift();

    let ports: { port1: PortLike; port2: PortLike };
    try {
      ports = channel();
      session = attachPort(ports.port1, parseCanvasMessage, parseParentMessage, {
        onMessage: options.onMessage,
        onViolation: () => {
          stopTimer();
          dropSession();
          setState('closed');
          detach();
          report('protocol-violation');
        },
      });
      (target as PostTarget).postMessage(
        {
          type: INIT_TYPE,
          version: PROTOCOL_VERSION,
          nonce: hello.nonce,
          viewport: current.viewport,
          mode: current.mode,
          locale: current.locale,
          dir: current.dir,
        },
        options.origin,
        [ports.port2],
      );
    } catch {
      stopTimer();
      dropSession();
      setState('closed');
      detach();
      report('handshake-failed');
      return;
    }
    stopTimer();
    setState('connected');
  };

  const onWindowMessage = (event: MessageEventLike): void => {
    if (state !== 'waiting' && state !== 'connected') return; // not started, timed out or closed
    if (event.origin !== options.origin) return;
    const target = options.iframe.contentWindow;
    if (target === null || target === undefined || event.source !== target) return;
    const parsed = parseHello(event.data);
    if (!parsed.ok) return;
    if (state === 'connected') {
      pendingHello = parsed.value; // replay or second hello: never replaces the live connection by itself
      return;
    }
    handshake(parsed.value);
  };

  const attach = (): void => {
    if (listening) return;
    listening = true;
    options.window.addEventListener('message', onWindowMessage);
  };
  const detach = (): void => {
    if (!listening) return;
    listening = false;
    options.window.removeEventListener('message', onWindowMessage);
  };
  const startTimer = (): void => {
    stopTimer();
    timer = setTimer(() => {
      timer = null;
      if (state !== 'waiting') return;
      setState('timed-out');
      report('handshake-timeout');
    }, timeoutMs);
  };

  return {
    connect(payload) {
      if (state !== 'idle') return false;
      const checked = parseInitPayload(payload);
      if (!checked.ok) return false;
      init = checked.value;
      attach();
      setState('waiting');
      startTimer();
      return true;
    },
    reset() {
      if (state === 'idle' || state === 'closed') return;
      pendingHello = null;
      dropSession();
      attach();
      setState('waiting');
      startTimer();
    },
    notifyLoad() {
      loads += 1;
      if (loads === 1 || state === 'idle' || state === 'closed') return;
      const hello = pendingHello;
      pendingHello = null;
      dropSession();
      attach();
      setState('waiting');
      startTimer();
      if (hello !== null) handshake(hello);
    },
    send(message) {
      return state === 'connected' && session !== null ? session.send(message) : false;
    },
    close() {
      if (state === 'closed') return;
      stopTimer();
      dropSession();
      detach();
      setState('closed');
    },
    get state() {
      return state;
    },
  };
}
