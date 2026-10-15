import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom lacks a few browser APIs that Radix primitives use.
class ResizeObserverStub {
  observe() {
    /* noop */
  }
  unobserve() {
    /* noop */
  }
  disconnect() {
    /* noop */
  }
}
Object.defineProperty(globalThis, 'ResizeObserver', { value: ResizeObserverStub, configurable: true });
for (const [name, value] of [
  ['hasPointerCapture', () => false],
  ['setPointerCapture', () => undefined],
  ['releasePointerCapture', () => undefined],
  ['scrollIntoView', () => undefined],
] as const) {
  Object.defineProperty(Element.prototype, name, { value, configurable: true, writable: true });
}

afterEach(() => {
  cleanup();
  try {
    localStorage.clear();
  } catch {
    /* storage unavailable */
  }
});
