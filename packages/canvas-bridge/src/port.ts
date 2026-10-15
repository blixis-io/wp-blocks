import { LIMITS } from './limits.ts';
import type { Parsed } from './guards.ts';
import type { PortLike } from './environment.ts';

export interface PortSession {
  send: (message: unknown) => boolean;
  close: () => void;
  readonly invalidCount: number;
}

/**
 * Wires a transferred/kept port: every incoming message is validated by `parse`; invalid ones are dropped and counted, never
 * thrown. After `LIMITS.invalidMessagesMax` invalid messages the session closes itself and calls `onViolation` once. A
 * consumer callback that throws cannot break the session.
 */
export function attachPort<T>(
  port: PortLike,
  parse: (data: unknown) => Parsed<T>,
  parseOutgoing: (data: unknown) => Parsed<unknown>,
  handlers: { onMessage: (message: T) => void; onViolation: () => void },
): PortSession {
  let invalid = 0;
  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    port.onmessage = null;
    if ('onmessageerror' in port) port.onmessageerror = null;
    try {
      port.close();
    } catch {
      /* already closed */
    }
  };
  const countInvalid = (): void => {
    if (closed) return;
    invalid += 1;
    if (invalid >= LIMITS.invalidMessagesMax) {
      close();
      try {
        handlers.onViolation();
      } catch {
        /* the owner must not break the endpoint */
      }
    }
  };
  port.onmessage = (event) => {
    if (closed) return;
    let parsed: Parsed<T>;
    try {
      parsed = parse(event.data);
    } catch {
      parsed = { ok: false, reason: 'malformed' };
    }
    if (!parsed.ok) {
      countInvalid();
      return;
    }
    try {
      handlers.onMessage(parsed.value);
    } catch {
      /* a faulty consumer must not break the protocol */
    }
  };
  port.onmessageerror = () => {
    countInvalid();
  };
  return {
    send(message) {
      if (closed) return false;
      if (!parseOutgoing(message).ok) return false;
      try {
        port.postMessage(message);
        return true;
      } catch {
        return false;
      }
    },
    close,
    get invalidCount() {
      return invalid;
    },
  };
}
