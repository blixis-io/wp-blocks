import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const initial = await readFile(new URL('../wordpress/theme/assets/js/appearance-init.js', import.meta.url), 'utf8');
const enhancement = await readFile(new URL('../wordpress/theme/assets/js/appearance.js', import.meta.url), 'utf8');

function fixture(stored = null, throws = false) {
  const attributes = new Map();
  const metaAttributes = new Map([['content', 'light dark']]);
  const meta = { setAttribute: (name, value) => metaAttributes.set(name, value) };
  const buttons = ['system', 'light', 'dark'].map((appearance) => {
    const attrs = new Map();
    return {
      dataset: { appearance },
      setAttribute: (name, value) => attrs.set(name, value),
      getAttribute: (name) => attrs.get(name),
      closest: () => buttons.find((button) => button.dataset.appearance === appearance),
    };
  });
  const listeners = {};
  const status = { textContent: '' };
  const control = {
    hidden: true,
    dataset: {
      announcements: JSON.stringify({ system: 'System chosen', light: 'Light chosen', dark: 'Dark chosen' }),
    },
    querySelectorAll: () => buttons,
    querySelector: () => status,
    addEventListener: (name, fn) => (listeners[name] = fn),
    contains: (button) => buttons.includes(button),
  };
  const storage = new Map();
  if (stored !== null) storage.set('blixis-appearance', stored);
  const localStorage = {
    getItem: (key) => {
      if (throws) throw Error('blocked');
      return storage.get(key) ?? null;
    },
    setItem: (key, value) => {
      if (throws) throw Error('blocked');
      storage.set(key, value);
    },
    removeItem: (key) => {
      if (throws) throw Error('blocked');
      storage.delete(key);
    },
  };
  const document = {
    documentElement: {
      setAttribute: (name, value) => attributes.set(name, value),
      removeAttribute: (name) => attributes.delete(name),
    },
    querySelector: (selector) => (selector === '.appearance-toggle' ? control : meta),
  };
  const window = { addEventListener: (name, fn) => (listeners[name] = fn) };
  const context = vm.createContext({ document, window, localStorage });
  return { context, attributes, metaAttributes, buttons, control, listeners, status, storage, localStorage };
}

test('early paint accepts only exact light and dark and survives storage errors', () => {
  for (const value of ['light', 'dark']) {
    const f = fixture(value);
    vm.runInContext(initial, f.context);
    assert.equal(f.attributes.get('data-theme'), value);
    assert.equal(f.metaAttributes.get('content'), value);
  }
  for (const value of [null, 'system', '<script>', 'DARK', 'dark ', 'x'.repeat(5000), '__proto__']) {
    const f = fixture(value);
    vm.runInContext(initial, f.context);
    assert.equal(f.attributes.has('data-theme'), false);
    assert.equal(f.metaAttributes.get('content'), 'light dark');
  }
  const blocked = fixture('dark', true);
  assert.doesNotThrow(() => vm.runInContext(initial, blocked.context));
  assert.equal(blocked.attributes.has('data-theme'), false);
});

test('control changes mode, announces it, removes system key and syncs tabs', () => {
  const f = fixture('dark');
  vm.runInContext(enhancement, f.context);
  assert.equal(f.control.hidden, false);
  assert.equal(f.buttons[2].getAttribute('aria-pressed'), 'true');
  f.listeners.click({ target: f.buttons[1] });
  assert.equal(f.storage.get('blixis-appearance'), 'light');
  assert.equal(f.attributes.get('data-theme'), 'light');
  assert.equal(f.metaAttributes.get('content'), 'light');
  assert.equal(f.status.textContent, 'Light chosen');
  f.listeners.click({ target: f.buttons[0] });
  assert.equal(f.storage.has('blixis-appearance'), false);
  assert.equal(f.attributes.has('data-theme'), false);
  assert.equal(f.metaAttributes.get('content'), 'light dark');
  f.listeners.storage({ storageArea: f.localStorage, key: 'blixis-appearance', newValue: 'dark' });
  assert.equal(f.buttons[2].getAttribute('aria-pressed'), 'true');
  assert.equal(f.status.textContent, 'Dark chosen');
  f.listeners.storage({ storageArea: f.localStorage, key: 'blixis-appearance', newValue: '__proto__' });
  assert.equal(f.buttons[0].getAttribute('aria-pressed'), 'true');
  vm.runInContext(enhancement, f.context);
  assert.equal(f.control.hidden, false);
});

test('storage events affect only the appearance key in localStorage', () => {
  const f = fixture('dark');
  vm.runInContext(enhancement, f.context);
  const otherArea = {};
  for (const event of [
    { storageArea: otherArea, key: 'blixis-appearance', newValue: 'light' },
    { storageArea: otherArea, key: null, newValue: null },
    { storageArea: f.localStorage, key: 'other-key', newValue: 'light' },
  ]) {
    f.listeners.storage(event);
    assert.equal(f.attributes.get('data-theme'), 'dark');
    assert.equal(f.buttons[2].getAttribute('aria-pressed'), 'true');
  }
  f.listeners.storage({ storageArea: f.localStorage, key: null, newValue: null });
  assert.equal(f.attributes.has('data-theme'), false);
  assert.equal(f.metaAttributes.get('content'), 'light dark');
  assert.equal(f.buttons[0].getAttribute('aria-pressed'), 'true');
});

test('bfcache restore reconciles stored choice only for persisted pageshow', () => {
  const f = fixture('dark');
  vm.runInContext(enhancement, f.context);
  f.storage.set('blixis-appearance', 'light');
  f.listeners.pageshow({ persisted: false });
  assert.equal(f.attributes.get('data-theme'), 'dark');
  f.listeners.pageshow({ persisted: true });
  assert.equal(f.attributes.get('data-theme'), 'light');
  assert.equal(f.metaAttributes.get('content'), 'light');
  assert.equal(f.buttons[1].getAttribute('aria-pressed'), 'true');
  f.storage.set('blixis-appearance', 'garbage');
  f.listeners.pageshow({ persisted: true });
  assert.equal(f.attributes.has('data-theme'), false);
  assert.equal(f.metaAttributes.get('content'), 'light dark');
  assert.equal(f.buttons[0].getAttribute('aria-pressed'), 'true');
});

test('control remains usable if storage is blocked', () => {
  const f = fixture(null, true);
  assert.doesNotThrow(() => vm.runInContext(enhancement, f.context));
  f.listeners.click({ target: f.buttons[2] });
  assert.equal(f.attributes.get('data-theme'), 'dark');
  assert.equal(f.status.textContent, 'Dark chosen');
});
