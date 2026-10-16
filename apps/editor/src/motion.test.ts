// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

const media = (initial: boolean) => {
  let matches = initial;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  return {
    get matches() {
      return matches;
    },
    addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    },
    change(next: boolean) {
      matches = next;
      listeners.forEach((listener) => {
        listener({ matches: next } as MediaQueryListEvent);
      });
    },
  };
};

afterEach(() => vi.unstubAllGlobals());

describe('WAAPI motion helper', () => {
  it('short-circuits when reduced motion is enabled', async () => {
    const preference = media(true);
    vi.stubGlobal('matchMedia', () => preference);
    const { animate } = await import('./motion');
    const element = document.createElement('div');
    const run = vi.fn();
    element.animate = run;
    expect(animate(element, [{ opacity: 0 }, { opacity: 1 }], 120)).toBeUndefined();
    expect(run).not.toHaveBeenCalled();
  });

  it('starts WAAPI when motion is allowed and cancels it on cleanup', async () => {
    const preference = media(false);
    vi.stubGlobal('matchMedia', () => preference);
    vi.resetModules();
    const { animate, cancelMotion } = await import('./motion');
    const element = document.createElement('div');
    const cancel = vi.fn();
    const animation = { finished: Promise.resolve(), cancel } as unknown as Animation;
    element.animate = vi.fn(() => animation);
    expect(animate(element, [{ opacity: 0 }, { opacity: 1 }], 120)).toBe(animation);
    expect(element.hasAttribute('data-motion-waapi')).toBe(true);
    cancelMotion(element);
    expect(cancel).toHaveBeenCalledOnce();
    expect(element.hasAttribute('data-motion-waapi')).toBe(false);
  });

  it('cancels a running animation when reduced motion changes at runtime', async () => {
    const preference = media(false);
    vi.stubGlobal('matchMedia', () => preference);
    vi.resetModules();
    const { animate } = await import('./motion');
    const element = document.createElement('div');
    document.body.append(element);
    const cancel = vi.fn();
    const animation = { finished: new Promise<void>(() => undefined), cancel } as unknown as Animation;
    element.animate = vi.fn(() => animation);
    animate(element, [{ opacity: 0 }, { opacity: 1 }], 120);
    preference.change(true);
    expect(cancel).toHaveBeenCalledOnce();
    element.remove();
  });
});
