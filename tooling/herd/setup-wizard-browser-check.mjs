// Drives the server-rendered setup wizard in headless Chrome. Development only.
// Run: node tooling/herd/setup-wizard-browser-check.mjs
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

const SITE = process.env.BLX_SITE ?? 'https://blixis.test';
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const wpDir = join(process.env.HERD_SITES ?? join(homedir(), 'Sites'), 'blixis');
const wp = execFileSync('which', ['wp'], { encoding: 'utf8' }).trim();
const cli = (...args) =>
  execFileSync('php', ['-d', 'memory_limit=512M', wp, ...args], { cwd: wpDir, encoding: 'utf8' }).trim();
// `wp ... get` exits 1 when the option or meta does not exist yet: that is a valid starting state.
const cliOptional = (...args) => {
  try {
    return cli(...args);
  } catch {
    return '';
  }
};
const optionBefore = cliOptional('option', 'get', 'blixis_setup', '--format=json');
const userId = cli('user', 'get', 'admin', '--field=ID');
const resumeBefore = cliOptional('user', 'meta', 'get', userId, 'blixis_setup_ui', '--format=json');
const draftBefore = cliOptional('user', 'meta', 'get', userId, 'blixis_setup_draft');
const profile = mkdtempSync(join(tmpdir(), 'blx-setup-'));
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--remote-debugging-port=9335',
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
try {
  let targets = [];
  for (let i = 0; i < 50 && targets.length === 0; i += 1) {
    try {
      targets = await (await fetch('http://127.0.0.1:9335/json')).json();
    } catch {
      await sleep(200);
    }
  }
  const page = targets.find((target) => target.type === 'page');
  assert.ok(page, 'Chrome exposes a page target');
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
    }).then((message) => {
      assert.equal(message.error, undefined, `${method} succeeds`);
      return message.result;
    });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    assert.equal(result.exceptionDetails, undefined, `browser evaluation succeeds: ${expression}`);
    return result.result.value;
  };
  const navigate = async (url, wait = 1000) => {
    await send('Page.navigate', { url });
    await sleep(wait);
  };
  const click = async (selector) => {
    const point = await evaluate(
      `(() => { const element=document.querySelector(${JSON.stringify(selector)}); if(!element) return null; element.scrollIntoView({block:'center',inline:'nearest'}); const rect=element.getBoundingClientRect(); return {x:rect.left+rect.width/2,y:rect.top+rect.height/2}; })()`,
    );
    assert.ok(point, `click target exists: ${selector}`);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y });
    await send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: point.x,
      y: point.y,
      button: 'left',
      clickCount: 1,
    });
    await send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: point.x,
      y: point.y,
      button: 'left',
      clickCount: 1,
    });
    await sleep(500);
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await navigate(`${SITE}/wp-login.php`);
  await evaluate(
    `document.querySelector('#user_login').value='admin'; document.querySelector('#user_pass').value='password'; document.querySelector('#wp-submit').click()`,
  );
  await sleep(1500);
  cli(
    'option',
    'update',
    'blixis_setup',
    JSON.stringify({ version: 1, status: 'not_started', updated_at: new Date().toISOString() }),
    '--format=json',
  );
  cliOptional('user', 'meta', 'delete', userId, 'blixis_setup_ui');
  cliOptional('user', 'meta', 'delete', userId, 'blixis_setup_draft');
  await navigate(`${SITE}/wp-admin/themes.php?page=blixis-setup`);
  const initial = await evaluate(
    `({title:document.querySelector('h1')?.textContent,steps:[...document.querySelectorAll('.blx-stepper li')].map(x=>x.textContent.trim()),radios:document.querySelectorAll('[role="radiogroup"] input[type="radio"]').length,templates:document.body.innerText.includes('View All Templates')})`,
  );
  assert.match(initial.title, /Welcome to Blixis/);
  assert.deepEqual(
    initial.steps.map((value) => value.replace(/^\d+/, '').trim()),
    ['Welcome', 'Theme', 'Style', 'Content', 'Finish'],
  );
  assert.ok(
    await evaluate(`!!document.querySelector('.blx-setup-banner')`),
    'not-started page shows inline entry actions',
  );
  assert.ok(
    await evaluate(`document.querySelector('.blx-preset-card input[value="ocean"]')?.checked`),
    'Ocean is the default without a draft',
  );
  assert.ok(
    await evaluate(`!document.querySelector('.blx-preset-preview')?.innerText.includes('Ocean')`),
    'mini preview does not repeat the preset name',
  );
  assert.equal(await evaluate(`document.querySelectorAll('.blx-preset-card').length`), 5);
  assert.ok(
    await evaluate(
      `document.querySelector('.blx-preset-card:last-child .blx-preset-title')?.textContent.includes('Start from scratch')`,
    ),
  );
  assert.equal(initial.templates, false, 'no template catalog is implied');
  assert.ok(initial.radios >= 5, 'real presets and the scratch option are keyboard-selectable radios');
  await click('.blx-preset-card input[value="ocean"]');
  assert.equal(
    await evaluate(`document.querySelector('.blx-preset-card input[value="ocean"]').checked`),
    true,
    'preset selection works',
  );
  await click('.blx-scheme-card input[value="nature"]');
  await click('.blx-font-option input[value="editorial"]');
  await click('button[name="direction"][value="next"]');
  assert.equal(
    await evaluate(`!!document.querySelector('.blx-setup-banner')`),
    false,
    'in-progress page hides the entry banner',
  );
  assert.equal(
    await evaluate(`document.querySelector('.blx-stepper li[aria-current="step"]')?.textContent.trim()`),
    '2Theme',
    'Continue advances into Theme',
  );
  assert.ok(await evaluate(`document.body.innerText.includes('Make it yours')`), 'wizard renders Style content');
  const draft = JSON.parse(cli('user', 'meta', 'get', userId, 'blixis_setup_draft'));
  assert.equal(draft.preset, 'ocean');
  assert.equal(draft.scheme, 'nature');
  assert.equal(draft.font, 'editorial');
  assert.match(draft.tokens['font-heading'].value, /Georgia/);
  await click('button[name="direction"][value="back"]');
  await sleep(700);
  assert.ok(await evaluate(`document.querySelector('.blx-preset-card input[value="ocean"]')?.checked`));
  assert.ok(await evaluate(`document.querySelector('.blx-scheme-card input[value="nature"]')?.checked`));
  assert.ok(await evaluate(`document.querySelector('.blx-font-option input[value="editorial"]')?.checked`));
  await click('button[name="direction"][value="cancel"]');
  await sleep(700);
  assert.equal(
    JSON.parse(cli('option', 'get', 'blixis_setup', '--format=json')).status,
    'dismissed',
    'Skip Setup records dismissal',
  );
} finally {
  try {
    if (optionBefore) cli('option', 'update', 'blixis_setup', optionBefore, '--format=json');
    else cliOptional('option', 'delete', 'blixis_setup');
    if (resumeBefore) cli('user', 'meta', 'update', userId, 'blixis_setup_ui', resumeBefore);
    else cliOptional('user', 'meta', 'delete', userId, 'blixis_setup_ui');
    if (draftBefore) cli('user', 'meta', 'update', userId, 'blixis_setup_draft', draftBefore);
    else cliOptional('user', 'meta', 'delete', userId, 'blixis_setup_draft');
  } finally {
    ws?.close();
    chrome.kill();
    rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  }
}
console.log('Setup wizard browser checks passed.');
