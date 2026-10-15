import {
  defaultRandom,
  makeNonce,
  type EndpointState,
  type MessageEventLike,
  type MessageSource,
  type PortLike,
  type PostTarget,
  type RandomBytes,
} from './environment.ts';
import { parseInit, type Init } from './handshake.ts';
import { HELLO_TYPE, PROTOCOL_VERSION, type ViolationReason } from './limits.ts';
import { parseCanvasMessage, parseParentMessage, type CanvasMessage, type ParentMessage } from './messages.ts';
import { attachPort, type PortSession } from './port.ts';

export interface CanvasEndpointOptions {
  /** The canvas window: it receives the init and its `parent` receives the hello. */
  window: MessageSource & { readonly parent: PostTarget };
  /** The canvas' own origin: the hello's target origin and the only origin an init may come from. */
  origin: string;
  /** Called once with the validated init after the port is in place. */
  onInit: (init: Init) => void;
  onMessage: (message: ParentMessage) => void;
  onViolation: (reason: ViolationReason) => void;
  random?: RandomBytes;
}

export interface CanvasEndpoint {
  /** Posts the hello to the parent window. */
  connect(): boolean;
  send(message: CanvasMessage): boolean;
  close(): void;
  readonly state: EndpointState;
}

/**
 * The canvas side. The init is accepted only when `event.origin === origin`, `event.source === window.parent`, the nonce is
 * the one this endpoint sent, exactly one port is transferred, the schema is valid, and no init was accepted before.
 */
export function createCanvasEndpoint(options: CanvasEndpointOptions): CanvasEndpoint {
  const random = options.random ?? defaultRandom;
  let state: EndpointState = 'idle';
  let nonce: string | null = null;
  let session: PortSession | null = null;
  let listening = false;

  const detach = (): void => {
    if (!listening) return;
    listening = false;
    options.window.removeEventListener('message', onWindowMessage);
  };

  function onWindowMessage(event: MessageEventLike): void {
    if (state !== 'waiting' || nonce === null) return;
    if (event.origin !== options.origin) return;
    if (event.source !== options.window.parent) return;
    if (event.ports.length !== 1) return;
    const init = parseInit(event.data);
    if (!init.ok || init.value.nonce !== nonce) return;
    const port = event.ports[0] as PortLike | undefined;
    if (port === undefined || typeof port.postMessage !== 'function') return;
    state = 'connected';
    detach();
    session = attachPort(port, parseParentMessage, parseCanvasMessage, {
      onMessage: options.onMessage,
      onViolation: () => {
        state = 'closed';
        session = null;
        options.onViolation('protocol-violation');
      },
    });
    options.onInit(init.value);
  }

  return {
    connect() {
      if (state !== 'idle') return false;
      nonce = makeNonce(random);
      options.window.addEventListener('message', onWindowMessage);
      listening = true;
      state = 'waiting';
      try {
        options.window.parent.postMessage({ type: HELLO_TYPE, version: PROTOCOL_VERSION, nonce }, options.origin);
      } catch {
        detach();
        state = 'closed';
        options.onViolation('handshake-failed');
        return false;
      }
      return true;
    },
    send(message) {
      return state === 'connected' && session !== null ? session.send(message) : false;
    },
    close() {
      if (state === 'closed') return;
      detach();
      session?.close();
      session = null;
      state = 'closed';
    },
    get state() {
      return state;
    },
  };
}
