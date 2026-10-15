// Checks visitor appearance in headless Chrome against https://blixis.test/builder-demo/.
// The body-insertion observer checks that stored Dark is on <html> when document.body first exists,
// before the body renders. This is not a pixel-level paint test. Exits non-zero on the first failure.
// Development only. Run: node tooling/herd/appearance-browser-check.mjs

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'cdp-'));
const proc = spawn(
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  [
    '--headless=new',
    '--remote-debugging-port=9333',
    `--user-data-dir=${dir}`,
    '--ignore-certificate-errors',
    '--no-first-run',
    '--window-size=1200,800',
    'about:blank',
  ],
  { stdio: 'ignore' },
);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let ws;

try {
  let targets;
  for (let i = 0; i < 50; i++) {
    try {
      targets = await (await fetch('http://127.0.0.1:9333/json')).json();
      if (targets.length) break;
    } catch {
      // Chrome is still starting.
    }
    await sleep(200);
  }
  const page = targets?.find((target) => target.type === 'page');
  assert.ok(page, 'Chrome did not open a debuggable page');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const requestId = ++id;
      pending.set(requestId, resolve);
      ws.send(JSON.stringify({ id: requestId, method, params }));
    }).then((response) => {
      assert.equal(response.error, undefined, `${method}: ${response.error?.message}`);
      return response.result;
    });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    assert.equal(result.exceptionDetails, undefined, `Browser evaluation failed: ${expression}`);
    return result.result.value;
  };
  const navigate = async () => {
    await send('Page.navigate', { url: 'https://blixis.test/builder-demo/' });
    await sleep(2500);
  };
  const state = () =>
    evaluate(`(() => {
      const control = document.querySelector('.appearance-toggle');
      return {
        hidden: control?.hidden,
        attr: document.documentElement.getAttribute('data-theme'),
        stored: localStorage.getItem('blixis-appearance'),
        bg: getComputedStyle(document.body).backgroundColor,
        pressed: Object.fromEntries([...control.querySelectorAll('button[data-appearance]')].map(
          button => [button.dataset.appearance, button.getAttribute('aria-pressed')]
        )),
        status: control.querySelector('[aria-live]')?.textContent
      };
    })()`);

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  await navigate();
  const initial = await state();
  assert.equal(initial.hidden, false, 'Appearance control should be visible with JavaScript');
  assert.equal(initial.attr, null, 'Initial System mode should leave data-theme absent');
  assert.equal(initial.pressed.system, 'true', 'System should initially be pressed');
  const lightBackground = initial.bg;

  await evaluate(`document.querySelector('.appearance-toggle button[data-appearance="dark"]').click()`);
  const dark = await state();
  assert.equal(dark.attr, 'dark', 'Clicking Dark should set data-theme');
  assert.equal(dark.stored, 'dark', 'Clicking Dark should store the choice');
  assert.equal(dark.pressed.dark, 'true', 'Dark should be pressed');
  assert.ok(dark.status?.trim(), 'Mode change should announce a non-empty status');
  assert.notEqual(dark.bg, lightBackground, 'Dark body background should differ from system light');

  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
      window.__appearanceAtBody = { seen: false, value: null };
      const watchBody = () => {
        const root = document.documentElement;
        if (!root) return false;
        const observer = new MutationObserver(() => {
          if (!window.__appearanceAtBody.seen && document.body) {
            window.__appearanceAtBody = { seen: true, value: root.getAttribute('data-theme') };
            observer.disconnect();
          }
        });
        observer.observe(root, { childList: true });
        return true;
      };
      if (!watchBody()) {
        const observer = new MutationObserver(() => {
          if (watchBody()) observer.disconnect();
        });
        observer.observe(document, { childList: true });
      }
    })();`,
  });
  await navigate();
  const reloaded = await state();
  const atBody = await evaluate('window.__appearanceAtBody');
  assert.equal(reloaded.attr, 'dark', 'Reload should retain Dark');
  assert.deepEqual(atBody, { seen: true, value: 'dark' }, 'Dark should be set when body first exists');

  await evaluate(`document.querySelector('.appearance-toggle button[data-appearance="system"]').click()`);
  const system = await state();
  assert.equal(system.attr, null, 'System should clear data-theme');
  assert.equal(system.stored, null, 'System should remove the stored choice');
  assert.equal(system.pressed.system, 'true', 'System should be pressed after selection');

  await evaluate(`localStorage.setItem('blixis-appearance', '<script>alert(1)</script>')`);
  await navigate();
  const garbage = await state();
  assert.equal(garbage.attr, null, 'Invalid stored value should be ignored');
  assert.equal(garbage.pressed.system, 'true', 'Invalid stored value should select System');

  await evaluate('localStorage.clear()');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  await navigate();
  const systemDark = await state();
  assert.equal(systemDark.attr, null, 'System dark should leave data-theme absent');
  assert.equal(systemDark.bg, dark.bg, 'System dark should use the dark body background');

  await send('Emulation.setScriptExecutionDisabled', { value: true });
  await navigate();
  const documentNode = await send('DOM.getDocument');
  const control = await send('DOM.querySelector', {
    nodeId: documentNode.root.nodeId,
    selector: '.appearance-toggle',
  });
  assert.ok(control.nodeId, 'Appearance control should exist without JavaScript');
  const attributes = await send('DOM.getAttributes', { nodeId: control.nodeId });
  assert.ok(attributes.attributes.includes('hidden'), 'Appearance control should stay hidden without JavaScript');
  console.log('Appearance browser checks passed.');
} finally {
  ws?.close();
  const exited = new Promise((resolve) => proc.once('exit', resolve));
  proc.kill();
  await exited;
  // Chrome may still be flushing its profile for a moment after it exits.
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
