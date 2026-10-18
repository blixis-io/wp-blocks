// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it } from 'vitest';

const repositoryRoot = process.cwd().endsWith('/apps/editor') ? resolve(process.cwd(), '../..') : process.cwd();
const runtime = readFileSync(resolve(repositoryRoot, 'wordpress/plugin/assets/frontend/elements.js'), 'utf8');

type InitResizablePanels = (root: HTMLElement) => void;
type InitMarquee = (root: HTMLElement) => void;

function makePanels(orientation = 'horizontal', minimum = 20) {
  const root = document.createElement('div');
  root.setAttribute('data-blx-resizable-panels', orientation);
  root.setAttribute('data-blx-resize-min', String(minimum));
  root.innerHTML =
    '<div data-blx-resizable-panel>first</div><div role="separator" aria-valuenow="50" data-blx-resize-handle></div><div data-blx-resizable-panel>second</div>';
  document.body.append(root);
  const panels = Array.from(root.querySelectorAll<HTMLElement>('[data-blx-resizable-panel]'));
  const handle = root.querySelector<HTMLElement>('[data-blx-resize-handle]');
  if (!handle) throw new Error('resize handle missing');
  return { root, panels, handle };
}

function loadInitializer(): InitResizablePanels {
  runInNewContext(runtime, { window, document });
  const initializer = (window as Window & { blxInitResizablePanels?: InitResizablePanels }).blxInitResizablePanels;
  if (!initializer) throw new Error('panel initializer missing');
  return initializer;
}

afterEach(() => {
  document.body.replaceChildren();
  delete (window as Window & { blxInitResizablePanels?: InitResizablePanels }).blxInitResizablePanels;
  delete (window as Window & { blxInitMarquee?: InitMarquee }).blxInitMarquee;
});

describe('public marquee enhancement', () => {
  it('adds the pause and resume control behavior once', () => {
    const root = document.createElement('div');
    root.setAttribute('data-blx-marquee', 'left');
    root.setAttribute('data-blx-marquee-duration', '45');
    root.innerHTML =
      '<div data-blx-marquee-track><div data-blx-marquee-group>content</div><div data-blx-marquee-group aria-hidden="true" inert>content</div></div><button data-blx-marquee-toggle data-blx-pause-label="Pause scrolling" data-blx-resume-label="Resume scrolling" aria-label="Pause scrolling" aria-pressed="false">Pause scrolling</button>';
    document.body.append(root);
    runInNewContext(runtime, { window, document });
    const initialize = (window as Window & { blxInitMarquee?: InitMarquee }).blxInitMarquee;
    const toggle = root.querySelector<HTMLButtonElement>('[data-blx-marquee-toggle]');
    if (!initialize || !toggle) throw new Error('marquee initializer or control missing');
    initialize(root);
    initialize(root);

    expect(root.dataset['blxMarqueeReady']).toBe('true');
    expect(root.style.getPropertyValue('--blx-marquee-duration')).toBe('45s');
    toggle.click();
    expect(root.hasAttribute('data-blx-marquee-paused')).toBe(true);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(toggle.getAttribute('aria-label')).toBe('Resume scrolling');
    toggle.click();
    expect(root.hasAttribute('data-blx-marquee-paused')).toBe(false);
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(toggle.getAttribute('aria-label')).toBe('Pause scrolling');
  });
});

describe('public resizable-panels enhancement', () => {
  it('resizes a horizontal pair with arrow keys and clamps to the configured minimum', () => {
    const { root, panels, handle } = makePanels();
    const initialize = loadInitializer();
    initialize(root);
    initialize(root);

    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(handle.getAttribute('aria-valuenow')).toBe('51');
    expect(Number(panels[0]?.style.flexGrow)).toBeCloseTo(1.02);
    expect(Number(panels[1]?.style.flexGrow)).toBeCloseTo(0.98);

    for (let index = 0; index < 20; index += 1) {
      handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }));
    }
    expect(handle.getAttribute('aria-valuenow')).toBe('80');
  });

  it('uses vertical arrow keys for a vertical pair', () => {
    const { root, handle } = makePanels('vertical');
    loadInitializer()(root);

    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(handle.getAttribute('aria-valuenow')).toBe('51');
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(handle.getAttribute('aria-valuenow')).toBe('51');
  });

  it('supports pointer resizing relative to the adjacent panels', () => {
    const { root, panels, handle } = makePanels();
    const first = panels[0];
    const second = panels[1];
    if (!first || !second) throw new Error('panels missing');
    first.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      top: 0,
      right: 100,
      bottom: 100,
      left: 0,
      toJSON: () => ({}),
    });
    second.getBoundingClientRect = () => ({
      x: 100,
      y: 0,
      width: 100,
      height: 100,
      top: 0,
      right: 200,
      bottom: 100,
      left: 100,
      toJSON: () => ({}),
    });
    loadInitializer()(root);

    handle.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientX: 100, bubbles: true }));
    handle.dispatchEvent(new MouseEvent('pointermove', { clientX: 140, bubbles: true }));
    expect(handle.getAttribute('aria-valuenow')).toBe('70');
    expect(Number(first.style.flexGrow)).toBeCloseTo(1.4);
    expect(Number(second.style.flexGrow)).toBeCloseTo(0.6);
  });
});
