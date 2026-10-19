// Checks every Blixis admin page and exercises Assets in Herd using Chrome DevTools Protocol.
// Development only. Run: node tooling/herd/blixis-admin-browser-check.mjs
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

const SITE = process.env.BLX_SITE ?? 'https://blixis.test';
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SCREENSHOT = process.env.BLX_SCREENSHOT;
const wpDir = join(process.env.HERD_SITES ?? join(homedir(), 'Sites'), 'blixis');
const wp = execFileSync('which', ['wp'], { encoding: 'utf8' }).trim();
const cli = (...args) =>
  execFileSync('php', ['-d', 'memory_limit=512M', wp, ...args], { cwd: wpDir, encoding: 'utf8' }).trim();
const profile = mkdtempSync(join(tmpdir(), 'blx-admin-'));
const png = join(profile, 'blixis-admin-check.png');
writeFileSync(
  png,
  Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aJ0AAAAASUVORK5CYII=', 'base64'),
);
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--remote-debugging-port=9336',
    `--user-data-dir=${profile}`,
    '--ignore-certificate-errors',
    '--no-first-run',
    '--window-size=1440,1000',
    'about:blank',
  ],
  { stdio: 'ignore' },
);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let ws;
let uploadedId;
try {
  let targets = [];
  for (let i = 0; i < 50 && !targets.length; i += 1) {
    try {
      targets = await (await fetch('http://127.0.0.1:9336/json')).json();
    } catch {
      await sleep(200);
    }
  }
  const target = targets.find((item) => item.type === 'page');
  assert.ok(target, 'Chrome exposes a page target');
  ws = new WebSocket(target.webSocketDebuggerUrl);
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
    }).then((message) => {
      assert.equal(message.error, undefined, `${method} succeeds`);
      return message.result;
    });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    assert.equal(result.exceptionDetails, undefined, 'browser evaluation succeeds');
    return result.result.value;
  };
  const navigate = async (url) => {
    await send('Page.navigate', { url });
    await sleep(500);
  };
  const waitFor = async (expression, message) => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (await evaluate(expression)) return;
      await sleep(100);
    }
    throw new Error(message);
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('DOM.enable');
  await navigate(`${SITE}/wp-login.php`);
  await waitFor(`!!document.querySelector('#user_login')`, 'WordPress login form becomes available');
  await evaluate(
    `document.querySelector('#user_login').value='admin';document.querySelector('#user_pass').value='password';document.querySelector('#wp-submit').click()`,
  );
  await sleep(1000);
  const pages = [
    ['blixis-setup', 'Welcome to'],
    ['blixis-global-styles', 'Global Styles is coming soon'],
    ['blixis-templates', 'Use templates from the Setup Wizard'],
    ['blixis-theme-builder', 'Theme Builder is coming soon'],
    ['blixis-assets', 'Upload Files'],
    ['blixis-settings', 'Demo preview · no license server is connected'],
    ['blixis-help', 'Copy diagnostics'],
  ];
  for (const [slug, expected] of pages) {
    await navigate(`${SITE}/wp-admin/admin.php?page=${slug}`);
    const state = await evaluate(
      `({text:document.body.innerText,menu:[...document.querySelectorAll('#adminmenu a.menu-top')].map(x=>x.innerText.trim())})`,
    );
    assert.ok(state.text.includes(expected), `${slug} opens and displays expected content`);
    assert.ok(state.menu.includes('Blixis'), 'the WordPress sidebar contains Blixis');
  }
  await navigate(`${SITE}/wp-admin/admin.php?page=blixis-settings`);
  await waitFor(`!!document.querySelector('[data-license-renew]')`, 'license demo controls are available');
  await evaluate(`document.querySelector('[data-license-renew]').click()`);
  assert.ok(
    await evaluate(`document.querySelector('[data-license-feedback]').textContent.includes('no request was made')`),
    'renew shows a clear demo-only message without contacting a service',
  );
  await evaluate(`document.querySelector('[data-license-replace]').click()`);
  await evaluate(
    `document.querySelector('[data-license-input]').value='mock-key-1234';document.querySelector('[data-license-apply]').click()`,
  );
  const licensePreview = await evaluate(
    `({key:document.querySelector('[data-license-key]').textContent,body:document.body.innerText,hidden:document.querySelector('[data-license-replace-panel]').hidden})`,
  );
  assert.equal(licensePreview.key, 'BLIXIS-DEMO-••••-1234', 'replacement only changes the masked in-memory preview');
  assert.ok(!licensePreview.body.includes('mock-key-1234'), 'raw license input is not shown in page text');
  assert.ok(licensePreview.hidden, 'the replacement form closes after preview');
  const labels = await evaluate(
    `(document.querySelector('#adminmenu').innerText.match(/Setup Wizard[\\s\\S]*?Help & Support/)||[])[0]`,
  );
  const positions = [
    'Setup Wizard',
    'Global Styles',
    'Templates',
    'Theme Builder',
    'Assets',
    'Settings',
    'Help & Support',
  ].map((label) => labels?.indexOf(label) ?? -1);
  assert.ok(
    positions.every((position, index) => position >= 0 && (!index || position > positions[index - 1])),
    'sidebar entries appear in the expected order',
  );
  await navigate(`${SITE}/wp-admin/admin.php?page=blixis-assets`);
  await sleep(1200);
  const gridState = await evaluate(
    `({grid:!!document.querySelector('.blx-assets__items'),status:document.querySelector('[data-status]').textContent})`,
  );
  assert.ok(gridState.grid && gridState.status.includes('media items'), 'Assets grid loaded the media REST results');
  await evaluate(
    `document.querySelector('[data-search]').value='blixis-no-match';document.querySelector('[data-search]').dispatchEvent(new Event('input',{bubbles:true}))`,
  );
  await sleep(600);
  assert.ok(
    await evaluate(`document.querySelector('[data-status]').textContent.includes('0 media items')`),
    'Assets search filters the REST results',
  );
  await evaluate(
    `document.querySelector('[data-search]').value='';document.querySelector('[data-search]').dispatchEvent(new Event('input',{bubbles:true}))`,
  );
  await sleep(600);
  await evaluate(`document.querySelector('[data-upload]').click()`);
  const root = await send('DOM.getDocument');
  const input = await send('DOM.querySelector', { nodeId: root.root.nodeId, selector: '[data-file]' });
  await send('DOM.setFileInputFiles', { files: [png], nodeId: input.nodeId });
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const state = await evaluate(
      `({status:document.querySelector('[data-status]').textContent,items:[...document.querySelectorAll('[role="option"]')].map(x=>x.innerText)})`,
    );
    if (state.status.includes('uploaded.') || state.items.some((name) => name.includes('blixis-admin-check'))) {
      uploadedId = cli(
        'post',
        'list',
        '--post_type=attachment',
        '--post_status=any',
        '--s=blixis-admin-check',
        '--field=ID',
      ).split('\n')[0];
      break;
    }
    await sleep(500);
  }
  assert.ok(uploadedId, 'a tiny PNG uploads through the Assets UI');
  if (SCREENSHOT) {
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(SCREENSHOT, Buffer.from(shot.data, 'base64'));
  }
  console.log('Blixis admin browser checks passed.');
} finally {
  if (uploadedId) {
    try {
      cli('post', 'delete', uploadedId, '--force');
    } catch (error) {
      console.warn(`Could not remove browser-check upload: ${error.message}`);
    }
  }
  ws?.close();
  const exited = new Promise((resolve) => chrome.once('exit', resolve));
  chrome.kill();
  await exited;
  rmSync(profile, { recursive: true, force: true });
}
