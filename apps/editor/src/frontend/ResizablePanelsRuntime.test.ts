// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';

const repositoryRoot = process.cwd().endsWith('/apps/editor') ? resolve(process.cwd(), '../..') : process.cwd();
const runtime = readFileSync(resolve(repositoryRoot, 'wordpress/plugin/assets/frontend/elements.js'), 'utf8');
const originalDialogShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
const originalDialogClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');

type InitResizablePanels = (root: HTMLElement) => void;
type InitMarquee = (root: HTMLElement) => void;
type InitFrontendElement = (root: HTMLElement) => void;
type InitLightbox = (root: HTMLElement) => void;
type InitImageComparison = (root: HTMLElement) => void;
type InitMap = (root: HTMLElement) => void;
type InitPanorama = (root: HTMLElement) => void;

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
  delete (window as Window & { blxInitCodeBlock?: InitFrontendElement }).blxInitCodeBlock;
  delete (window as Window & { blxInitCountdown?: InitFrontendElement }).blxInitCountdown;
  delete (window as Window & { blxInitActionButton?: InitFrontendElement }).blxInitActionButton;
  delete (window as Window & { blxInitLightbox?: InitLightbox }).blxInitLightbox;
  delete (window as Window & { blxInitImageComparison?: InitImageComparison }).blxInitImageComparison;
  delete (window as Window & { blxInitMap?: InitMap }).blxInitMap;
  delete (window as Window & { blxInitPanorama?: InitPanorama }).blxInitPanorama;
  if (originalDialogShowModal) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', originalDialogShowModal);
  else delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).showModal;
  if (originalDialogClose) Object.defineProperty(HTMLDialogElement.prototype, 'close', originalDialogClose);
  else delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).close;
});

describe('public content element enhancement', () => {
  it('copies code and reports the result through a live status', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: { writeText } });
    const root = document.createElement('div');
    root.innerHTML =
      '<button data-blx-code-copy data-blx-copy-success="Copied." data-blx-copy-failed="Copy failed." hidden></button><code>const safe = 1;</code><span data-blx-code-status aria-live="polite"></span>';
    document.body.append(root);
    loadInitializer();
    const initialize = (window as Window & { blxInitCodeBlock?: InitFrontendElement }).blxInitCodeBlock;
    const button = root.querySelector<HTMLButtonElement>('[data-blx-code-copy]');
    const status = root.querySelector<HTMLElement>('[data-blx-code-status]');
    if (!initialize || !button || !status) throw new Error('code block controls missing');
    initialize(root);
    button.click();
    await vi.waitFor(() => {
      expect(status.textContent).toBe('Copied.');
    });
    expect(writeText).toHaveBeenCalledWith('const safe = 1;');
  });

  it('updates a completed countdown without starting visible motion', () => {
    const root = document.createElement('time');
    root.setAttribute('data-blx-countdown-target', '2000-01-01T00:00:00Z');
    root.setAttribute('data-blx-countdown-format', 'days-hours-minutes-seconds');
    root.setAttribute('data-blx-countdown-complete', 'Countdown complete');
    loadInitializer();
    const countdown = (window as Window & { blxInitCountdown?: InitFrontendElement }).blxInitCountdown;
    if (!countdown) throw new Error('countdown initializer missing');
    countdown(root);
    expect(root.textContent).toBe('Countdown complete');
    expect(root.dataset['blxCountdownReady']).toBe('true');
  });

  it('toggles a target and reports its expanded state', () => {
    const target = document.createElement('div');
    target.id = 'details';
    target.hidden = true;
    const button = document.createElement('button');
    button.setAttribute('data-blx-action', 'toggle');
    button.setAttribute('data-blx-action-target', 'details');
    button.setAttribute('aria-expanded', 'false');
    document.body.append(target, button);
    loadInitializer();
    const action = (window as Window & { blxInitActionButton?: InitFrontendElement }).blxInitActionButton;
    if (!action) throw new Error('action initializer missing');
    action(button);
    button.click();
    expect(target.hidden).toBe(false);
    expect(button.getAttribute('aria-expanded')).toBe('true');
  });
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

describe('public gallery lightbox enhancement', () => {
  it('opens a native dialog and restores focus after closing', () => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value: function showModal(this: HTMLDialogElement) {
        this.setAttribute('open', '');
      },
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value: function close(this: HTMLDialogElement) {
        this.removeAttribute('open');
        this.dispatchEvent(new window.Event('close'));
      },
    });
    const root = document.createElement('div');
    root.setAttribute('data-blx-lightbox-gallery', '');
    root.setAttribute('data-blx-lightbox-label', 'Image preview');
    root.innerHTML =
      '<a href="https://example.test/photo.jpg" data-blx-lightbox-trigger aria-label="Photo"><img alt="Garden"></a>';
    document.body.append(root);
    const trigger = root.querySelector<HTMLAnchorElement>('a');
    if (!trigger) throw new Error('lightbox trigger missing');
    const initializer = (loadInitializer(), (window as Window & { blxInitLightbox?: InitLightbox }).blxInitLightbox);
    if (!initializer) throw new Error('lightbox initializer missing');
    initializer(root);
    trigger.focus();
    trigger.click();

    const dialog = root.querySelector<HTMLDialogElement>('dialog');
    const close = dialog?.querySelector<HTMLButtonElement>('button');
    expect(dialog?.getAttribute('aria-label')).toBe('Image preview');
    expect(dialog?.hasAttribute('open')).toBe(true);
    expect(close?.getAttribute('aria-label')).toBe('Close image preview');
    close?.click();
    expect(root.querySelector('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});

describe('public image comparison enhancement', () => {
  it('progressively reveals and updates the range control', () => {
    const root = document.createElement('figure');
    root.setAttribute('data-blx-image-comparison', '');
    root.innerHTML =
      '<div data-blx-comparison-canvas><img data-blx-comparison-before alt="Before"><img data-blx-comparison-after alt="After"></div><label data-blx-comparison-label>Compare images<input type="range" min="0" max="100" value="35" data-blx-comparison-control hidden></label>';
    document.body.append(root);
    loadInitializer();
    const initialize = (window as Window & { blxInitImageComparison?: InitImageComparison }).blxInitImageComparison;
    const input = root.querySelector<HTMLInputElement>('[data-blx-comparison-control]');
    if (!initialize || !input) throw new Error('image comparison control missing');
    initialize(root);
    initialize(root);

    expect(root.dataset['blxComparisonReady']).toBe('true');
    expect(input.hidden).toBe(false);
    expect(root.style.getPropertyValue('--blx-comparison-position')).toBe('35%');
    input.value = '75';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(root.style.getPropertyValue('--blx-comparison-position')).toBe('75%');
  });
});

describe('consent-aware map enhancement', () => {
  it('loads an approved provider only after the visitor activates the button', () => {
    const root = document.createElement('figure');
    root.setAttribute('data-blx-map', '');
    root.innerHTML =
      '<button type="button" data-blx-map-load data-blx-map-src="https://www.openstreetmap.org/export/embed.html?layer=mapnik" data-blx-map-title="Office map">Load map</button><a href="https://www.openstreetmap.org/">Open map</a>';
    document.body.append(root);
    loadInitializer();
    const initialize = (window as Window & { blxInitMap?: InitMap }).blxInitMap;
    const button = root.querySelector<HTMLButtonElement>('[data-blx-map-load]');
    if (!initialize || !button) throw new Error('map initializer missing');
    initialize(root);
    expect(root.querySelector('iframe')).toBeNull();
    button.click();
    const frame = root.querySelector<HTMLIFrameElement>('iframe');
    expect(frame?.src).toBe('https://www.openstreetmap.org/export/embed.html?layer=mapnik');
    expect(frame?.title).toBe('Office map');
    expect(frame?.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin');
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.disabled).toBe(true);
  });

  it('refuses an unapproved frame host', () => {
    const root = document.createElement('figure');
    root.setAttribute('data-blx-map', '');
    root.innerHTML =
      '<button type="button" data-blx-map-load data-blx-map-src="https://evil.example/frame" data-blx-map-title="Map">Load map</button>';
    document.body.append(root);
    loadInitializer();
    const initialize = (window as Window & { blxInitMap?: InitMap }).blxInitMap;
    const button = root.querySelector<HTMLButtonElement>('[data-blx-map-load]');
    if (!initialize || !button) throw new Error('map initializer missing');
    initialize(root);
    button.click();
    expect(root.querySelector('iframe')).toBeNull();
    expect(button.disabled).toBe(false);
  });
});

describe('panorama keyboard enhancement', () => {
  it('moves the horizontal view with arrow keys and keeps a focusable fallback', () => {
    const root = document.createElement('figure');
    root.setAttribute('data-blx-panorama', '');
    root.innerHTML =
      '<div tabindex="0" role="region" aria-label="Panorama" data-blx-panorama-viewer><img alt="Coast"></div>';
    document.body.append(root);
    loadInitializer();
    const initialize = (window as Window & { blxInitPanorama?: InitPanorama }).blxInitPanorama;
    const viewer = root.querySelector<HTMLElement>('[data-blx-panorama-viewer]');
    if (!initialize || !viewer) throw new Error('panorama initializer missing');
    initialize(root);
    expect(viewer.dataset['blxPanoramaReady']).toBe('true');
    viewer.scrollLeft = 100;
    viewer.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(viewer.scrollLeft).toBe(148);
    viewer.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true, bubbles: true }));
    expect(viewer.scrollLeft).toBe(0);
  });
});
