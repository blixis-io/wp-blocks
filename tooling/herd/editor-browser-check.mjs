// Drives headless Chrome over the DevTools protocol against the Herd dev site to check the Blixis editor shell in a real
// browser: it signs in with the development credentials (admin / password, see HERD-DEVELOPMENT.md), opens the editor for the
// demo page and asserts landmarks, toolbar keyboard navigation, the shortcuts dialog (focus trap and return), the editor
// chrome appearance (independent of the website), panel collapse, persistence across a reload, and that nothing logs a
// console error or a content-security-policy violation. Development only. Run: node tooling/herd/editor-browser-check.mjs
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

const SITE = process.env.BLX_SITE ?? 'https://blixis.test';
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SCREENSHOT = process.env.BLX_SCREENSHOT;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const wpDir = join(process.env.HERD_SITES ?? join(homedir(), 'Sites'), 'blixis');
const postId = execFileSync(
  'php',
  [
    '-d',
    'memory_limit=512M',
    execFileSync('which', ['wp'], { encoding: 'utf8' }).trim(),
    'post',
    'list',
    '--post_type=page',
    '--name=builder-demo',
    '--field=ID',
  ],
  { cwd: wpDir, encoding: 'utf8' },
).trim();
assert.match(postId, /^\d+$/, 'the demo page exists (run pnpm dev:demo)');

const profile = mkdtempSync(join(tmpdir(), 'blx-editor-'));
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--remote-debugging-port=9334',
    `--user-data-dir=${profile}`,
    '--ignore-certificate-errors',
    '--no-first-run',
    '--window-size=1440,900',
    'about:blank',
  ],
  { stdio: 'ignore' },
);
let ws;
try {
  let targets = [];
  for (let i = 0; i < 50 && targets.length === 0; i += 1) {
    try {
      targets = await (await fetch('http://127.0.0.1:9334/json')).json();
    } catch {
      await sleep(200);
    }
  }
  const page = targets.find((target) => target.type === 'page');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve) => (ws.onopen = resolve));
  let seq = 0;
  const pending = new Map();
  const problems = [];
  const apiResponses = [];
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    } else if (
      message.method === 'Network.responseReceived' &&
      /blixis\/v1|rest_route=\/blixis\/v1/.test(message.params.response.url)
    ) {
      apiResponses.push({ url: message.params.response.url, status: message.params.response.status });
    } else if (message.method === 'Runtime.exceptionThrown') {
      problems.push(`exception: ${message.params.exceptionDetails.text}`);
    } else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      problems.push(
        `console.error: ${JSON.stringify(message.params.args.map((a) => a.value ?? a.description)).slice(0, 200)}`,
      );
    } else if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
      problems.push(`log: ${message.params.entry.text}`.slice(0, 200));
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = (seq += 1);
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  const ev = async (expression) => {
    const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    return response.result?.result?.value;
  };
  const press = (key, code = key) =>
    send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key,
      code,
      windowsVirtualKeyCode: { Tab: 9, Escape: 27, ArrowRight: 39, ArrowLeft: 37, Home: 36, End: 35 }[key] ?? 0,
    })
      .then(() => send('Input.dispatchKeyEvent', { type: 'keyUp', key, code }))
      .then(() => sleep(250));
  const nav = async (url, wait = 1800) => {
    await send('Page.navigate', { url });
    await sleep(wait);
  };
  const buttonByText = (text) =>
    `[...document.querySelectorAll('button')].find((b) => b.textContent.trim().toLowerCase().includes(${JSON.stringify(text.toLowerCase())}) || (b.getAttribute('aria-label') ?? '').toLowerCase().includes(${JSON.stringify(text.toLowerCase())}))`;
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Network.enable');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });

  // Sign in (development credentials only).
  await nav(`${SITE}/wp-login.php`, 1500);
  await ev(
    `document.querySelector('#user_login').value = 'admin'; document.querySelector('#user_pass').value = 'password'; document.querySelector('#wp-submit').click();`,
  );
  await sleep(2500);

  const editorUrl = `${SITE}/wp-admin/admin.php?page=blixis-editor&post=${postId}`;
  await nav(editorUrl, 2500);
  const shell = await ev(`({
    root: !!document.querySelector('#blixis-editor-root .blx-editor'),
    banner: !!document.querySelector('[role=banner], header'),
    toolbar: !!document.querySelector('[role=toolbar]'),
    structure: !!document.querySelector('nav[aria-label="Structure"]'),
    main: !!document.querySelector('main'),
    inspector: !!document.querySelector('aside[aria-label="Inspector"]'),
    adminChrome: !!document.querySelector('#adminmenu, #wpadminbar'),
    scrolls: document.documentElement.scrollHeight > window.innerHeight + 1,
    lang: document.querySelector('.blx-editor')?.getAttribute('lang') ?? document.documentElement.lang,
  })`);
  assert.ok(
    shell.root && shell.banner && shell.toolbar && shell.structure && shell.main && shell.inspector,
    `the shell landmarks render: ${JSON.stringify(shell)}`,
  );
  assert.equal(shell.adminChrome, false, 'no wp-admin chrome in the editor document');
  assert.equal(shell.scrolls, false, 'the editor fills the viewport without page scroll');

  // Toolbar roving tabindex: arrows, Home and End.
  await ev(`document.querySelector('[role=toolbar] button:not([disabled])')?.focus()`);
  const first = await ev(
    `document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent.trim()`,
  );
  await press('ArrowRight');
  const second = await ev(
    `document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent.trim()`,
  );
  const items = await ev(
    `[...document.querySelectorAll('[role=toolbar] button, [role=toolbar] a')].map((b) => (b.getAttribute('aria-label') ?? b.textContent).trim() + ':' + b.tabIndex + (b.disabled ? ':disabled' : '')).join(' | ')`,
  );
  assert.notEqual(second, first, `ArrowRight moves focus along the toolbar (${items})`);
  await press('End');
  const last = await ev(
    `document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent.trim()`,
  );
  await press('Home');
  const home = await ev(
    `document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent.trim()`,
  );
  assert.notEqual(
    last,
    home,
    `End and Home jump to the ends of the toolbar (first=${first}, second=${second}, last=${last}, home=${home}, items=${await ev(`[...document.querySelectorAll('[role=toolbar] button, [role=toolbar] a')].map((b) => (b.getAttribute('aria-label') ?? b.textContent).trim() + ':' + b.tabIndex).join(' | ')`)})`,
  );
  assert.equal(home, items.split(' | ')[0]?.split(':')[0], 'Home jumps to the first toolbar item');
  assert.equal(last, items.split(' | ').at(-1)?.split(':')[0], 'End jumps to the last toolbar item');

  // Shortcuts dialog: opens, traps focus, Escape closes, focus returns to the opener.
  await ev(`${buttonByText('keyboard shortcuts')}.focus(); ${buttonByText('keyboard shortcuts')}.click()`);
  await sleep(300);
  assert.equal(await ev(`!!document.querySelector('[role=dialog]')`), true, 'the shortcuts dialog opens');
  for (let i = 0; i < 8; i += 1) await press('Tab');
  assert.equal(
    await ev(`document.querySelector('[role=dialog]').contains(document.activeElement)`),
    true,
    'focus stays inside the open dialog',
  );
  await press('Escape');
  await sleep(300);
  assert.equal(await ev(`!!document.querySelector('[role=dialog]')`), false, 'Escape closes the dialog');
  assert.ok(
    await ev(
      `/keyboard shortcuts/i.test(document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent ?? '')`,
    ),
    'focus returns to the button that opened the dialog',
  );

  // Editor chrome appearance is independent of the website.
  const htmlBefore = await ev(`document.documentElement.getAttribute('data-theme')`);
  await ev(`${buttonByText('dark')}.click()`);
  await sleep(300);
  const dark = await ev(
    `({ editor: document.querySelector('.blx-editor').getAttribute('data-editor-theme'), html: document.documentElement.getAttribute('data-theme'), stored: localStorage.getItem('blixis-editor-chrome'), site: localStorage.getItem('blixis-appearance') })`,
  );
  assert.equal(dark.editor, 'dark', 'the editor chrome switches to dark');
  assert.equal(dark.html, htmlBefore, 'the document element is not touched by the editor chrome theme');
  assert.equal(dark.stored, 'dark', 'the choice is stored under its own key');
  assert.equal(dark.site, null, 'the website appearance preference is untouched');
  const bgDark = await ev(`getComputedStyle(document.querySelector('.blx-editor')).backgroundColor`);
  await nav(editorUrl, 2000);
  assert.equal(
    await ev(`document.querySelector('.blx-editor').getAttribute('data-editor-theme')`),
    'dark',
    'the chrome theme survives a reload',
  );
  await ev(`${buttonByText('light')}.click()`);
  await sleep(300);
  const bgLight = await ev(`getComputedStyle(document.querySelector('.blx-editor')).backgroundColor`);
  assert.notEqual(bgDark, bgLight, 'light and dark chrome render different backgrounds');
  await ev(`${buttonByText('system')}.click()`);

  // Panels collapse with correct ARIA.
  const toggle = `document.querySelector('button[aria-controls="blx-structure"]')`;
  const expandedBefore = await ev(`${toggle}?.getAttribute('aria-expanded')`);
  await ev(`${toggle}.click()`);
  await sleep(200);
  const expandedAfter = await ev(`${toggle}?.getAttribute('aria-expanded')`);
  assert.notEqual(expandedAfter, expandedBefore, 'the structure panel toggle flips aria-expanded');
  // Layout, not just ARIA: with the structure panel hidden the canvas keeps the middle and the inspector stays on the right.
  const geometry = await ev(
    `(() => { const box = (selector) => { const r = document.querySelector(selector)?.getBoundingClientRect(); return r ? { x: Math.round(r.x), w: Math.round(r.width) } : null; }; return { main: box('main'), inspector: box('aside[aria-label="Inspector"]'), viewport: window.innerWidth }; })()`,
  );
  assert.ok(geometry.main && geometry.inspector, 'canvas and inspector render');
  assert.ok(geometry.main.w > 600, `the canvas keeps the available width (${JSON.stringify(geometry)})`);
  assert.ok(
    geometry.inspector.x >= geometry.main.x + geometry.main.w - 1,
    'the inspector sits to the right of the canvas',
  );
  assert.ok(
    geometry.inspector.w >= 240 && geometry.inspector.w <= 480,
    `the inspector keeps its width (${JSON.stringify(geometry)})`,
  );
  await ev(`${toggle}.click()`);
  await sleep(200);
  const reopened = await ev(
    `(() => { const r = document.querySelector('nav[aria-label="Structure"]').getBoundingClientRect(); const m = document.querySelector('main').getBoundingClientRect(); return { structure: Math.round(r.width), mainX: Math.round(m.x) }; })()`,
  );
  assert.ok(
    reopened.structure >= 200 && reopened.mainX >= reopened.structure - 1,
    `reopening the structure panel restores the three-column layout (${JSON.stringify(reopened)})`,
  );

  // Reflow (WCAG 1.4.10): at 320 CSS px (400% zoom of 1280) nothing is clipped horizontally and every panel is reachable
  // by scrolling, in particular the inspector.
  await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 640, deviceScaleFactor: 1, mobile: false });
  await sleep(400);
  const reflow = await ev(`(() => {
    const doc = document.documentElement;
    const root = document.querySelector('.blx-editor');
    const heading = [...document.querySelectorAll('h2')].find((h) => /inspector/i.test(h.textContent));
    const scroller = (() => { for (let el = heading?.parentElement; el; el = el.parentElement) { if (el.scrollHeight > el.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) return el; } return null; })();
    const before = scroller ? scroller.scrollTop : null;
    heading?.scrollIntoView({ block: 'center' });
    const rect = heading?.getBoundingClientRect();
    return {
      docOverflowX: doc.scrollWidth > doc.clientWidth,
      rootOverflowX: root.scrollWidth > root.clientWidth + 1,
      headingFound: !!heading,
      scrollerFound: !!scroller,
      scrolled: scroller ? scroller.scrollTop > before : false,
      inView: !!rect && rect.top >= 0 && rect.bottom <= window.innerHeight && rect.left >= 0 && rect.right <= window.innerWidth,
    };
  })()`);
  assert.equal(reflow.docOverflowX, false, `no horizontal page overflow at 320px (${JSON.stringify(reflow)})`);
  assert.equal(
    reflow.rootOverflowX,
    false,
    `no clipped horizontal content in the editor at 320px (${JSON.stringify(reflow)})`,
  );
  assert.ok(
    reflow.headingFound && reflow.scrollerFound,
    `the inspector is inside a vertically scrollable container (${JSON.stringify(reflow)})`,
  );
  assert.ok(reflow.inView, `the inspector heading can be scrolled into view at 320px (${JSON.stringify(reflow)})`);
  await send('Emulation.clearDeviceMetricsOverride');
  await sleep(400);

  // Real data: the editor loads the demo page's working streams through the REST API and shows them (BWB-050).
  await nav(editorUrl, 3000);
  const loaded = await ev(`(() => {
    const outline = [...document.querySelectorAll('nav[aria-label="Structure"] button')].map((b) => b.textContent.trim());
    return { outline, undo: document.querySelector('button[aria-label*="ndo" i]')?.getAttribute('aria-disabled') };
  })()`);
  assert.ok(
    loaded.outline.length >= 10,
    `the structure outline lists the loaded elements (${JSON.stringify(loaded.outline)})`,
  );
  assert.ok(
    loaded.outline.some((label) => label.includes('hero-h1')) &&
      loaded.outline.some((label) => label.includes('body-img')),
    'the outline shows the demo elements by type and id',
  );
  assert.equal(loaded.undo, 'true', 'undo is disabled before any command');
  await ev(
    `[...document.querySelectorAll('nav[aria-label="Structure"] button')].find((b) => b.textContent.includes('hero-h1')).click()`,
  );
  await sleep(300);
  const picked = await ev(
    `({ current: document.querySelector('nav[aria-label="Structure"] [aria-current="true"]')?.textContent.trim(), inspector: document.querySelector('aside[aria-label="Inspector"]').textContent })`,
  );
  assert.ok(picked.current?.includes('hero-h1'), 'the clicked element is marked aria-current');
  assert.ok(picked.inspector.includes('hero-h1'), 'the inspector header shows the selected element');
  const contentLocale = await ev(`document.querySelector('[data-testid="content-locale"]')?.textContent`);
  assert.ok(/en_US/.test(contentLocale ?? ''), 'the canvas shows the content locale from the settings');
  const wrong = apiResponses.filter((entry) => entry.status !== 200);
  assert.ok(
    apiResponses.length >= 3 && wrong.length === 0,
    `layout and both content streams load with 200 (${JSON.stringify(apiResponses)})`,
  );

  if (SCREENSHOT) {
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(SCREENSHOT, Buffer.from(shot.result.data, 'base64'));
  }
  assert.deepEqual(problems, [], 'no console errors, exceptions or content-security-policy violations');
  console.log('Editor browser checks passed.');
} finally {
  ws?.close();
  const exited = new Promise((resolve) => chrome.once('exit', resolve));
  chrome.kill();
  await exited;
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
