import type { BuilderDocument } from '@blixis/wp-core';

/** What happened to the document. `load` also fires for a reload; canvas bridge and autosave subscribe to these. */
export interface DocumentEvent {
  type: 'command' | 'undo' | 'redo' | 'load';
  document: BuilderDocument;
}
export type DocumentListener = (event: DocumentEvent) => void;

export interface Emitter {
  subscribe: (listener: DocumentListener) => () => void;
  emit: (event: DocumentEvent) => void;
}

/**
 * Listener registry of one store. Listeners run after the store was updated (so `getState()` is consistent) in the order they
 * subscribed. Events go through a FIFO queue drained by a single loop: an event emitted while listeners are running (a
 * listener that dispatches, undoes, ...) is queued and delivered to EVERY listener only after the current event reached all
 * of them, so each listener sees events in the order the store changed. A listener that throws neither stops the others nor
 * breaks the dispatch; one unsubscribed during delivery is not called afterwards.
 */
export function createEmitter(): Emitter {
  const listeners = new Set<DocumentListener>();
  const queue: DocumentEvent[] = [];
  let draining = false;
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    emit(event) {
      queue.push(event);
      if (draining) return;
      draining = true;
      try {
        for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
          for (const listener of [...listeners]) {
            if (!listeners.has(listener)) continue;
            try {
              listener(next);
            } catch {
              /* a faulty subscriber must not break editing */
            }
          }
        }
      } finally {
        draining = false;
      }
    },
  };
}
