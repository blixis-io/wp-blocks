/**
 * The minimal structural views of the browser objects the endpoints use. Real `Window`, `MessageEvent`, `MessagePort` and
 * `MessageChannel` satisfy them; tests pass fakes. Nothing here depends on DOM types.
 */
export interface MessageEventLike {
  readonly data: unknown;
  readonly origin: string;
  readonly source: unknown;
  readonly ports: readonly unknown[];
}

export type MessageListener = (event: MessageEventLike) => void;

/** Something `message` events can be listened to on (a window). */
export interface MessageSource {
  addEventListener(type: 'message', listener: MessageListener): void;
  removeEventListener(type: 'message', listener: MessageListener): void;
}

/** Something a message can be posted to with an explicit target origin (a window). */
export interface PostTarget {
  postMessage(message: unknown, targetOrigin: string, transfer?: unknown[]): void;
}

export interface PortLike {
  postMessage(message: unknown): void;
  close(): void;
  /** Assigning a handler starts the port, as `MessagePort.onmessage` does. */
  onmessage: ((event: { readonly data: unknown }) => void) | null;
  onmessageerror?: ((event: unknown) => void) | null | undefined;
}

export type ChannelFactory = () => { port1: PortLike; port2: PortLike };

export type RandomBytes = (byteLength: number) => Uint8Array;

export type EndpointState = 'idle' | 'waiting' | 'connected' | 'timed-out' | 'closed';

export const defaultChannel: ChannelFactory = () => {
  const channel = new MessageChannel();
  return { port1: channel.port1 as unknown as PortLike, port2: channel.port2 as unknown as PortLike };
};

export const defaultRandom: RandomBytes = (byteLength) => crypto.getRandomValues(new Uint8Array(byteLength));

/** Random nonce of 32 base64url characters (192 bits). */
export function makeNonce(random: RandomBytes): string {
  const bytes = random(24);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
