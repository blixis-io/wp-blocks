// Drives headless Chrome over the DevTools protocol against the Herd dev site to check the Blixis editor shell in a real
// browser: it signs in with the development credentials (admin / password, see HERD-DEVELOPMENT.md), opens the editor for the
// demo page and asserts landmarks, the sandboxed canvas iframe (strict CSP, render, pick, viewport, preview appearance, a forged handshake from a second frame, a frame reload and a CSP enforcement probe), toolbar keyboard navigation, the shortcuts dialog (focus trap and return), the editor
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
  const contexts = new Map(); // frameId -> default execution context id (for evaluating inside a specific frame)
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
    } else if (message.method === 'Runtime.executionContextCreated') {
      const { id, auxData } = message.params.context;
      if (auxData?.frameId && auxData.isDefault) contexts.set(auxData.frameId, id);
    } else if (message.method === 'Runtime.executionContextDestroyed') {
      for (const [frameId, id] of contexts) if (id === message.params.executionContextId) contexts.delete(frameId);
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
  // Evaluates inside another frame's own JavaScript realm (so `parent.postMessage` really comes from that frame's window).
  const evIn = async (frameId, expression) => {
    const contextId = contexts.get(frameId);
    assert.ok(contextId, `an execution context exists for frame ${frameId}`);
    const response = await send('Runtime.evaluate', { expression, contextId, awaitPromise: true, returnByValue: true });
    assert.ok(
      !response.result?.exceptionDetails,
      `evaluation in frame ${frameId} failed: ${JSON.stringify(response.result?.exceptionDetails ?? response.error)}`,
    );
    return response.result?.result?.value;
  };
  const childFrameId = async (name) => {
    const tree = (await send('Page.getFrameTree')).result.frameTree;
    return tree.childFrames?.find((child) => child.frame.name === name)?.frame.id ?? null;
  };
  const press = (key, code = key) =>
    send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key,
      code,
      windowsVirtualKeyCode:
        { Tab: 9, Escape: 27, ArrowRight: 39, ArrowLeft: 37, Home: 36, End: 35, PageDown: 34, PageUp: 33 }[key] ?? 0,
    })
      .then(() => send('Input.dispatchKeyEvent', { type: 'keyUp', key, code }))
      .then(() => sleep(250));
  const nav = async (url, wait = 1800) => {
    await send('Page.navigate', { url });
    await sleep(wait);
  };
  const buttonByText = (text) =>
    `[...document.querySelectorAll('button')].find((b) => b.textContent.trim().toLowerCase().includes(${JSON.stringify(text.toLowerCase())}) || (b.getAttribute('aria-label') ?? '').toLowerCase().includes(${JSON.stringify(text.toLowerCase())}))`;
  const clickReal = async (selector) => {
    const point = await ev(
      `(() => { const r = document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; })()`,
    );
    assert.ok(point, `a visible click target exists for ${selector}`);
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
    await sleep(150);
  };
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
    toolbar: !!document.querySelector('header [role=toolbar]'),
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

  // Redesigned header: menus use real pointer activation, Escape restores focus, and the fixed header row never grows.
  const headerBottom = await ev(`document.querySelector('.blx-header').getBoundingClientRect().bottom`);
  await clickReal('button[aria-label="Pages"]');
  assert.equal(
    await ev(
      `!![...document.querySelectorAll('[role=menuitem]')].find((item) => item.textContent.trim() === 'All pages')`,
    ),
    true,
    'Pages opens with a real click and lists All pages',
  );
  await press('Escape');
  assert.equal(
    await ev(`document.activeElement?.getAttribute('aria-label')`),
    'Pages',
    'Escape returns focus to Pages',
  );
  await clickReal('button[aria-label="More options"]');
  assert.equal(
    await ev(
      `!![...document.querySelectorAll('[role=menuitem]')].find((item) => /keyboard shortcuts/i.test(item.textContent))`,
    ),
    true,
    'overflow lists Keyboard shortcuts',
  );
  await press('Escape');
  const savedMetrics = await ev(`({ width: window.innerWidth, height: window.innerHeight })`);
  await send('Emulation.setDeviceMetricsOverride', {
    width: 800,
    height: savedMetrics.height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await sleep(350);
  const narrowHeader = await ev(
    `(() => { const h = document.querySelector('.blx-header'); return { width: h.clientWidth, scrollWidth: h.scrollWidth, bottom: h.getBoundingClientRect().bottom, viewport: !!document.querySelector('[aria-label="Preview width"]') }; })()`,
  );
  assert.ok(
    narrowHeader.scrollWidth <= narrowHeader.width,
    `header has no horizontal overflow at 800 px (${JSON.stringify(narrowHeader)})`,
  );
  assert.equal(narrowHeader.bottom, headerBottom, 'header bottom stays fixed across responsive collapse');
  await send('Emulation.setDeviceMetricsOverride', {
    width: savedMetrics.width,
    height: savedMetrics.height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await sleep(250);

  // Toolbar roving tabindex: arrows, Home and End.
  await ev(`document.querySelector('header [role=toolbar] button:not([disabled])')?.focus()`);
  const first = await ev(
    `document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent.trim()`,
  );
  await press('ArrowRight');
  const second = await ev(
    `document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent.trim()`,
  );
  const items = await ev(
    `[...document.querySelectorAll('header [role=toolbar] [data-radix-collection-item]')].map((b) => (b.getAttribute('aria-label') ?? b.textContent).trim() + ':' + b.tabIndex + (b.disabled ? ':disabled' : '')).join(' | ')`,
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
    `End and Home jump to the ends of the toolbar (first=${first}, second=${second}, last=${last}, home=${home}, items=${await ev(`[...document.querySelectorAll('header [role=toolbar] [data-radix-collection-item]')].map((b) => (b.getAttribute('aria-label') ?? b.textContent).trim() + ':' + b.tabIndex).join(' | ')`)})`,
  );
  assert.equal(home, items.split(' | ')[0]?.split(':')[0], 'Home jumps to the first toolbar item');
  assert.equal(last, items.split(' | ').at(-1)?.split(':')[0], 'End jumps to the last toolbar item');

  // Shortcuts dialog: opens, traps focus, Escape closes, focus returns to the opener.
  await clickReal('button[aria-label="More options"]');
  await ev(`${buttonByText('Keyboard shortcuts')}.click()`);
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
      `/more options/i.test(document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent ?? '')`,
    ),
    'focus returns to the overflow trigger',
  );

  // Editor chrome appearance is independent of the website.
  const htmlBefore = await ev(`document.documentElement.getAttribute('data-theme')`);
  await clickReal('button[aria-label="More options"]');
  await ev(`${buttonByText('Editor appearance: Dark')}.click()`);
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
  await clickReal('button[aria-label="More options"]');
  await ev(`${buttonByText('Editor appearance: Light')}.click()`);
  await sleep(300);
  const bgLight = await ev(`getComputedStyle(document.querySelector('.blx-editor')).backgroundColor`);
  assert.notEqual(bgDark, bgLight, 'light and dark chrome render different backgrounds');
  await clickReal('button[aria-label="More options"]');
  await ev(`${buttonByText('Editor appearance: System')}.click()`);

  // Panels collapse with correct ARIA.
  await clickReal('button[aria-label="More options"]');
  const toggle = buttonByText('Structure panel');
  const expandedBefore = await ev(`${toggle}?.getAttribute('aria-checked')`);
  await ev(`${toggle}.click()`);
  await sleep(200);
  await clickReal('button[aria-label="More options"]');
  const expandedAfter = await ev(`${buttonByText('Structure panel')}?.getAttribute('aria-checked')`);
  assert.notEqual(expandedAfter, expandedBefore, 'the structure panel menu checkbox toggles aria-checked');
  await press('Escape');
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
  await clickReal('button[aria-label="More options"]');
  await ev(`${buttonByText('Structure panel')}.click()`);
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
    const outline = [...document.querySelectorAll('nav[aria-label="Structure"] [role="treeitem"]')].map((b) => b.textContent.trim());
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
    `[...document.querySelectorAll('nav[aria-label="Structure"] [role="treeitem"]')].find((b) => b.textContent.includes('hero-h1')).click()`,
  );
  await sleep(300);
  const picked = await ev(
    `({ current: document.querySelector('nav[aria-label="Structure"] [role="treeitem"][aria-selected="true"]')?.textContent.trim(), inspector: document.querySelector('aside[aria-label="Inspector"]').textContent })`,
  );
  assert.ok(picked.current?.includes('hero-h1'), 'the clicked element is marked aria-current');
  assert.ok(picked.inspector.includes('hero-h1'), 'the inspector header shows the selected element');

  // BWB-129 palette insert updates both the tree and live canvas; undo removes the inserted element again.
  await ev(`document.querySelector('[data-element-type="blixis/text"]')?.click()`);
  await sleep(1500);
  const paletteInsert = await ev(`(() => {
    const row = [...document.querySelectorAll('nav[aria-label="Structure"] [role="treeitem"]')].find((item) => item.dataset.id?.startsWith('el-new-'));
    const id = row?.dataset.id;
    const previewHas = id ? !!document.querySelector('main iframe')?.contentDocument?.querySelector('[data-blx-id="' + CSS.escape(id) + '"]') : false;
    return { id, previewHas, undo: document.querySelector('button[aria-label="Undo"]')?.getAttribute('aria-disabled') };
  })()`);
  assert.ok(paletteInsert.id, 'clicking a Text palette card inserts and selects a new structure element');
  assert.equal(paletteInsert.previewHas, true, 'the canvas preview gains the inserted Text element');
  assert.equal(paletteInsert.undo, null, 'enabled header Undo has no aria-disabled attribute');
  await ev(`document.querySelector('button[aria-label="Undo"]')?.click()`);
  await sleep(1200);
  const paletteUndo = await ev(`(() => {
    const treeHas = [...document.querySelectorAll('nav[aria-label="Structure"] [role="treeitem"]')].some((item) => item.dataset.id?.startsWith('el-new-'));
    const previewHas = [...(document.querySelector('main iframe')?.contentDocument?.querySelectorAll('[data-blx-id]') ?? [])].some((item) => item.getAttribute('data-blx-id')?.startsWith('el-new-'));
    return { treeHas, previewHas };
  })()`);
  assert.equal(paletteUndo.treeHas, false, 'undo removes the inserted element from the structure tree');
  assert.equal(paletteUndo.previewHas, false, 'undo removes the inserted element from the canvas preview');

  await ev(
    `(() => { const input = document.querySelector('nav[aria-label="Structure"] input[placeholder="Search elements..."]'); if (!input) return false; const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set; setter?.call(input, 'hero-h1'); input.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`,
  );
  const searchResult = await ev(
    `(() => ({ rows: [...document.querySelectorAll('nav[aria-label="Structure"] [role="treeitem"]')].map((item) => item.dataset.id), count: document.querySelector('nav[aria-label="Structure"] [aria-live="polite"]')?.textContent }))()`,
  );
  assert.ok(
    searchResult.rows.some((id) => id?.includes('hero-h1')),
    'the Structure search keeps matching rows visible',
  );
  assert.ok(searchResult.rows.length < loaded.outline.length, 'the Structure search filters out nonmatching tree rows');
  await ev(
    `(() => { const input = document.querySelector('nav[aria-label="Structure"] input[placeholder="Search elements..."]'); if (input) { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set; setter?.call(input, ''); input.dispatchEvent(new Event('input', { bubbles: true })); } })()`,
  );

  // Inspector text edits reach the live preview and undo restores the original document value.
  await ev(
    `[...document.querySelectorAll('nav[aria-label="Structure"] [role="treeitem"]')].find((b) => b.textContent.includes('hero-h1')).click()`,
  );
  await sleep(400);
  await ev(
    `(() => { const label = [...document.querySelectorAll('aside[aria-label="Inspector"] label')].find((item) => item.textContent.trim() === 'Text'); document.getElementById(label?.htmlFor)?.focus(); })()`,
  );
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Control', code: 'ControlLeft' });
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 2 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 2 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Control', code: 'ControlLeft' });
  await send('Input.insertText', { text: 'Inspector smoke heading' });
  await sleep(1500);
  assert.ok(
    await ev(
      `document.querySelector('main iframe')?.contentDocument?.body.textContent.includes('Inspector smoke heading')`,
    ),
    'the heading edit updates the canvas preview',
  );
  await ev(`document.querySelector('button[aria-label="Undo"]')?.click()`);
  await sleep(1500);
  assert.ok(
    await ev(
      `!document.querySelector('main iframe')?.contentDocument?.body.textContent.includes('Inspector smoke heading')`,
    ),
    'undo restores the heading preview',
  );

  // Style sections collapse accessibly; drag the real font-size slider and verify preview + one-step Undo.
  const styleTabPoint = await ev(
    `(() => { const e = [...document.querySelectorAll('[role="tab"]')].find((item) => item.textContent.trim() === 'Style'); const r = e?.getBoundingClientRect(); return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; })()`,
  );
  assert.ok(styleTabPoint, 'Style tab is present');
  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: styleTabPoint.x,
    y: styleTabPoint.y,
    button: 'left',
    clickCount: 1,
  });
  await send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: styleTabPoint.x,
    y: styleTabPoint.y,
    button: 'left',
    clickCount: 1,
  });
  await sleep(500);
  await ev(`(() => {
    const row = [...document.querySelectorAll('.blx-inspector-field')].find((item) => item.querySelector('input[aria-label="Size"]'));
    const input = row?.querySelector('input[aria-label="Size"]');
    const unit = row?.querySelector('select[aria-label="Size unit"]');
    if (!input || !unit) return false;
    unit.value = 'rem';
    unit.dispatchEvent(new Event('change', { bubbles: true }));
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, '2.75');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  await sleep(350);
  const inspectorLayout = await ev(`(() => {
    const row = [...document.querySelectorAll('aside[aria-label="Inspector"] .blx-inspector-field')].find((item) => item.querySelector('input[aria-label="Size"]'));
    const label = row?.querySelector('.blx-inspector-label > label');
    const slider = row?.querySelector('[role="slider"]');
    const input = row?.querySelector('input[aria-label="Size"]');
    const unit = row?.querySelector('select[aria-label="Size unit"]');
    const thumb = slider?.querySelector('.blx-slider-thumb');
    const track = slider?.getBoundingClientRect();
    const thumbRect = thumb?.getBoundingClientRect();
    const color = document.querySelector('.blx-color-field');
    const panel = document.querySelector('aside[aria-label="Inspector"]');
    const gradient = document.querySelector('.blx-gradient-field');
    const gradientLabel = gradient?.querySelector('.blx-inspector-toggle-row > span');
    const gradientToggle = gradient?.querySelector('input[type="checkbox"]');
    const margin = [...document.querySelectorAll('.blx-spacing-field')].find((item) => item.querySelector('legend')?.textContent === 'Margin');
    const marginInputs = [...(margin?.querySelectorAll('.blx-spacing-sides input[role="spinbutton"]') ?? [])].map((item) => item.getBoundingClientRect().width);
    const segments = [...(document.querySelector('[role="radiogroup"][aria-label="Text align"]')?.querySelectorAll('[role="radio"]') ?? [])].map((item) => item.getBoundingClientRect().width);
    return label && slider && input && unit && track && thumbRect && color && panel && gradientLabel && gradientToggle ? {
      sliderWidth: slider.getBoundingClientRect().width,
      unitWidth: unit.getBoundingClientRect().width,
      inputWidth: input.getBoundingClientRect().width,
      unitTextFits: unit.scrollWidth <= unit.clientWidth,
      rowOverflow: row.scrollWidth <= row.clientWidth + 1,
      value: Number(input.value), unitValue: unit.value,
      range: [Number(slider.getAttribute('aria-valuemin')), Number(slider.getAttribute('aria-valuemax'))],
      thumbFraction: (thumbRect.left + thumbRect.width / 2 - track.left) / track.width,
      thumbWithinTrack: thumbRect.left >= track.left - 1 && thumbRect.right <= track.right + 1,
      colorRight: color.getBoundingClientRect().right,
      panelRight: panel.getBoundingClientRect().right,
      gradientTopDelta: Math.abs(gradientLabel.getBoundingClientRect().top - gradientToggle.getBoundingClientRect().top),
      marginWidths: marginInputs,
      segmentWidths: segments,
    } : null;
  })()`);
  assert.ok(inspectorLayout, 'font size row layout is measurable');
  assert.ok(
    inspectorLayout.sliderWidth >= 56,
    `font size slider has usable width (${JSON.stringify(inspectorLayout)})`,
  );
  assert.ok(
    inspectorLayout.inputWidth >= 46 && inspectorLayout.inputWidth <= 52,
    `font size input is 48px (${JSON.stringify(inspectorLayout)})`,
  );
  assert.ok(
    inspectorLayout.unitWidth >= 48 && inspectorLayout.unitWidth <= 56,
    `font size unit select is 52px (${JSON.stringify(inspectorLayout)})`,
  );
  assert.equal(inspectorLayout.unitTextFits, true, 'font size unit text is not clipped');
  assert.equal(inspectorLayout.rowOverflow, true, 'font size row has no horizontal overflow');
  assert.equal(inspectorLayout.value, 2.75, 'font size input retains the rem value');
  assert.equal(inspectorLayout.unitValue, 'rem', 'font size unit selector is rem');
  assert.deepEqual(inspectorLayout.range, [0.5, 6], 'font size slider uses the rem range');
  assert.ok(inspectorLayout.thumbWithinTrack, 'slider thumb stays inside the track');
  assert.ok(
    inspectorLayout.thumbFraction >= 0.25 && inspectorLayout.thumbFraction <= 0.6,
    `rem thumb reflects 2.75 (${JSON.stringify(inspectorLayout)})`,
  );
  assert.ok(inspectorLayout.colorRight <= inspectorLayout.panelRight + 1, 'color token field stays within the panel');
  assert.ok(inspectorLayout.gradientTopDelta <= 8, 'gradient toggle and label share a row');
  assert.equal(inspectorLayout.marginWidths.length, 4, 'margin row has four side inputs');
  assert.ok(
    Math.max(...inspectorLayout.marginWidths) - Math.min(...inspectorLayout.marginWidths) <= 1,
    'margin inputs have equal widths',
  );
  assert.ok(
    inspectorLayout.segmentWidths.length >= 4 &&
      Math.max(...inspectorLayout.segmentWidths) - Math.min(...inspectorLayout.segmentWidths) <= 1,
    `segmented options have equal widths (${JSON.stringify(inspectorLayout.segmentWidths)})`,
  );
  const typographyToggle = `document.querySelector('button[aria-label="Toggle Typography"]')`;
  const before = await ev(`${typographyToggle}?.getAttribute('aria-expanded')`);
  await ev(`${typographyToggle}?.click()`);
  await sleep(300);
  const collapsed = await ev(`${typographyToggle}?.getAttribute('aria-expanded')`);
  await ev(`${typographyToggle}?.click()`);
  await sleep(300);
  const expanded = await ev(`${typographyToggle}?.getAttribute('aria-expanded')`);
  const sectionState = { before, collapsed, expanded };
  assert.deepEqual(
    sectionState,
    { before: 'true', collapsed: 'false', expanded: 'true' },
    'Typography section toggles with aria-expanded',
  );
  const fontBefore = await ev(
    `document.querySelector('main iframe')?.contentDocument?.querySelector('h1')?.computedStyleMap?.().get('font-size')?.toString() ?? document.querySelector('main iframe')?.contentWindow?.getComputedStyle(document.querySelector('main iframe')?.contentDocument?.querySelector('h1')).fontSize`,
  );
  const sliderPoint = await ev(
    `(() => { const e = document.querySelector('[role="slider"][aria-label="Size"]'); const r = e?.getBoundingClientRect(); return r ? { x: r.x + r.width * 0.72, y: r.y + r.height / 2 } : null; })()`,
  );
  assert.ok(sliderPoint, 'font-size slider is present');
  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: sliderPoint.x,
    y: sliderPoint.y,
    button: 'left',
    buttons: 1,
    clickCount: 1,
  });
  await send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: sliderPoint.x + 12,
    y: sliderPoint.y,
    button: 'left',
    buttons: 1,
  });
  await send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: sliderPoint.x + 12,
    y: sliderPoint.y,
    button: 'left',
    clickCount: 1,
  });
  await sleep(1000);
  const fontAfter = await ev(
    `document.querySelector('main iframe')?.contentWindow?.getComputedStyle(document.querySelector('main iframe')?.contentDocument?.querySelector('h1')).fontSize`,
  );
  const sizeValue = await ev(`document.querySelector('aside[aria-label="Inspector"] input[aria-label="Size"]')?.value`);
  assert.notEqual(sizeValue, '16', 'the numeric field follows the pointer drag');
  assert.notEqual(fontAfter, fontBefore, 'the canvas heading font size follows the slider');
  await ev(`document.querySelector('button[aria-label="Undo"]')?.click()`);
  await sleep(1000);
  const fontUndone = await ev(
    `document.querySelector('main iframe')?.contentWindow?.getComputedStyle(document.querySelector('main iframe')?.contentDocument?.querySelector('h1')).fontSize`,
  );
  assert.equal(fontUndone, fontBefore, 'one Undo restores the pre-drag font size');

  // A spacing token change is sent through the responsive style command and appears in compiled preview CSS.
  await ev(
    `(() => { const tab = [...document.querySelectorAll('[role=tab]')].find((item) => item.textContent.trim() === 'Style'); tab?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, ctrlKey: false })); })()`,
  );
  await sleep(300);
  const spacingBefore = await ev(
    `document.querySelector('main iframe')?.contentDocument?.styleSheets ? [...document.querySelector('main iframe').contentDocument.styleSheets].map((sheet) => { try { return [...sheet.cssRules].map((rule) => rule.cssText).join(''); } catch { return ''; } }).join('') : ''`,
  );
  await ev(
    `(() => { const input = document.querySelector('input[aria-label="Top"]'); if (!input) return false; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, '16'); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`,
  );
  await sleep(1500);
  const spacingAfter = await ev(
    `document.querySelector('main iframe')?.contentDocument ? [...document.querySelector('main iframe').contentDocument.styleSheets].map((sheet) => { try { return [...sheet.cssRules].map((rule) => rule.cssText).join(''); } catch { return ''; } }).join('') : ''`,
  );
  assert.notEqual(spacingAfter, spacingBefore, 'spacing changes the compiled canvas preview CSS');
  const alignPoint = await ev(
    `(() => { const e = [...document.querySelectorAll('[role="radio"]')].find((item) => item.getAttribute('aria-label') === 'Align right'); e?.scrollIntoView({ block: 'center' }); const r = e?.getBoundingClientRect(); return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; })()`,
  );
  assert.ok(alignPoint, 'text alignment segmented control is present');
  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: alignPoint.x,
    y: alignPoint.y,
    button: 'left',
    clickCount: 1,
  });
  await send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: alignPoint.x,
    y: alignPoint.y,
    button: 'left',
    clickCount: 1,
  });
  await sleep(1000);
  const alignmentAfter = await ev(
    `document.querySelector('main iframe')?.contentWindow?.getComputedStyle(document.querySelector('main iframe')?.contentDocument?.querySelector('h1')).textAlign`,
  );
  assert.equal(alignmentAfter, 'right', 'segmented text alignment updates the canvas heading');
  await ev(
    `(() => { const tab = [...document.querySelectorAll('[role=tab]')].find((item) => item.textContent.trim() === 'Content'); tab?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, ctrlKey: false })); })()`,
  );

  // Canvas (BWB-051): a sandboxed same-origin iframe with the dedicated canvas document and its trusted runtime.
  const normalizeColor = (value) => {
    const hex = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(value?.trim() ?? '');
    if (!hex) return value?.trim().toLowerCase() ?? null;
    const digits = hex[1].length === 3 ? [...hex[1]].map((part) => part + part).join('') : hex[1];
    return `rgb(${Number.parseInt(digits.slice(0, 2), 16)}, ${Number.parseInt(digits.slice(2, 4), 16)}, ${Number.parseInt(digits.slice(4, 6), 16)})`;
  };
  const frameInfo = () =>
    ev(`(() => {
      const frame = document.querySelector('main iframe');
      const doc = frame?.contentDocument ?? null;
      const root = doc?.getElementById('blx-canvas-root') ?? null;
      const box = frame?.getBoundingClientRect();
      return {
        found: !!frame,
        sandbox: frame?.getAttribute('sandbox') ?? null,
        title: frame?.getAttribute('title') ?? null,
        src: frame?.getAttribute('src') ?? null,
        sameOrigin: doc !== null,
        elements: root ? root.querySelectorAll('[data-blx-id]').length : 0,
        scripts: root ? root.querySelectorAll('script, iframe, object, embed, form, style, link').length : 0,
        inlineHandlers: root ? [...root.querySelectorAll('*')].filter((el) => [...el.attributes].some((a) => a.name.startsWith('on'))).length : 0,
        mode: root?.getAttribute('data-blx-mode') ?? null,
        htmlMode: doc?.documentElement.getAttribute('data-theme') ?? null,
        colorScheme: doc?.querySelector('meta[name="color-scheme"]')?.getAttribute('content') ?? null,
        bodyBackground: doc ? getComputedStyle(doc.body).backgroundColor : null,
        bgToken: root ? getComputedStyle(root).getPropertyValue('--blx-color-bg').trim() : null,
        headingFont: doc?.querySelector('h1, h2, h3, h4, h5, h6') ? getComputedStyle(doc.querySelector('h1, h2, h3, h4, h5, h6')).fontFamily.toLowerCase().replace(/\\s+/g, ' ').trim() : null,
        headingToken: root ? getComputedStyle(root).getPropertyValue('--blx-font-heading').toLowerCase().replace(/\\s+/g, ' ').trim() : null,
        width: box ? Math.round(box.width) : 0,
        x: box ? box.x : 0,
        y: box ? box.y : 0,
      };
    })()`);
  let canvas = await frameInfo();
  for (let i = 0; i < 25 && canvas.elements === 0; i += 1) {
    await sleep(200);
    canvas = await frameInfo();
  }
  assert.ok(canvas.found, 'the editor shows the canvas iframe');
  const initialStageLayout = await ev(`(() => {
    const frame = document.querySelector('main iframe');
    const bar = document.querySelector('.blx-stage-bar');
    const crumbs = bar?.querySelector('.blx-stage-crumbs');
    const toggle = bar?.querySelector('.blx-canvas-bar');
    const a = crumbs?.getBoundingClientRect(); const b = toggle?.getBoundingClientRect();
    const rows = [...document.querySelectorAll('nav[aria-label="Structure"] [role=treeitem]')];
    const levels = [1, 2, 3].map((level) => rows.find((row) => row.getAttribute('aria-level') === String(level)));
    const iconLeft = (row) => row?.querySelector('.blx-tree-icon')?.getBoundingClientRect().left;
    const child = levels[1];
    const parentIcon = levels[0]?.querySelector('.blx-tree-icon')?.getBoundingClientRect();
    const guide = child?.querySelector('.blx-tree-guide');
    const guideBox = guide?.getBoundingClientRect();
    const elbow = guide ? getComputedStyle(guide, '::after') : null;
    const guideLine = guide ? getComputedStyle(guide, '::before') : null;
    const guideColor = guideLine?.borderInlineStartColor ?? '';
    const textColor = child ? getComputedStyle(child).color : '';
    const colorAlpha = Number(guideColor.match(/(?:\\/|,)\\s*([\\d.]+)\\s*\\)$/)?.[1] ?? 1);
    const rowTarget = child;
    const initialRow = rowTarget?.getBoundingClientRect();
    const initialLabel = rowTarget?.querySelector('.blx-outline-label')?.getBoundingClientRect();
    const topActive = document.querySelector('.blx-left-tabs[aria-label] [role="tab"][aria-selected="true"]');
    const activeStyle = topActive ? getComputedStyle(topActive) : null;
    const underline = topActive ? getComputedStyle(topActive, '::after') : null;
    const dockActive = document.querySelector('.blx-dock-tabs .blx-left-tabs [role="tab"][aria-selected="true"]');
    const dockUnderline = dockActive ? getComputedStyle(dockActive, '::after') : null;
    return { top: frame?.getBoundingClientRect().top, crumbTop: a?.top, crumbBottom: a?.bottom, toggleTop: b?.top, toggleBottom: b?.bottom, crumbRight: a?.right, toggleLeft: b?.left,
      levels: levels.map((row) => row?.getAttribute('aria-level')), iconLefts: levels.map(iconLeft),
      parentIconCenter: parentIcon ? parentIcon.left + parentIcon.width / 2 : null, guideX: guideBox?.left,
      elbowWidth: Number.parseFloat(elbow?.width ?? '0'), elbowRight: (guideBox?.left ?? 0) + Number.parseFloat(elbow?.width ?? '0'),
      childIcon: iconLeft(child), lineWidth: Number.parseFloat(guideLine?.borderInlineStartWidth ?? '0px'), guideColor, textColor, colorAlpha,
      rowHeight: initialRow?.height, labelTop: initialLabel?.top,
      topUnderlineBorder: activeStyle?.borderBlockEndWidth, topUnderlineContent: underline?.content,
      dockUnderlineBorder: dockActive ? getComputedStyle(dockActive).borderBlockEndWidth : null, dockUnderlineContent: dockUnderline?.content };
  })()`);
  assert.ok(
    initialStageLayout.toggleTop < initialStageLayout.crumbBottom &&
      initialStageLayout.toggleBottom > initialStageLayout.crumbTop,
    'appearance toggle shares the breadcrumb row',
  );
  assert.ok(
    initialStageLayout.toggleLeft >= initialStageLayout.crumbRight,
    'appearance toggle sits at the end side in LTR',
  );
  assert.deepEqual(initialStageLayout.levels, ['1', '2', '3'], 'the browser fixture exposes three nested tree levels');
  for (let index = 1; index < 3; index += 1) {
    assert.ok(
      Math.abs(initialStageLayout.iconLefts[index] - initialStageLayout.iconLefts[index - 1] - 16) <= 1,
      `level ${index + 1} icon is indented exactly 16px from its parent`,
    );
  }
  assert.ok(
    Math.abs(initialStageLayout.guideX - initialStageLayout.parentIconCenter) <= 1,
    'guide line sits under parent icon centre',
  );
  assert.ok(
    Math.abs(initialStageLayout.elbowRight - initialStageLayout.childIcon) <= 1,
    'child elbow reaches the child icon column',
  );
  assert.ok(initialStageLayout.lineWidth <= 1, 'guide line is at most one pixel wide');
  assert.ok(
    initialStageLayout.colorAlpha > 0 && initialStageLayout.colorAlpha <= 0.5,
    'guide line has intentionally subtle alpha',
  );
  assert.notEqual(
    initialStageLayout.guideColor,
    initialStageLayout.textColor,
    'guide line colour differs from tree text',
  );
  assert.equal(initialStageLayout.rowHeight, 28, 'tree rows use a fixed 28px height');
  assert.equal(initialStageLayout.topUnderlineContent, 'none', 'Structure tab has no duplicate pseudo underline');
  assert.equal(initialStageLayout.topUnderlineBorder, '2px', 'Structure tab has one 2px border underline');
  assert.equal(initialStageLayout.dockUnderlineContent, 'none', 'Add Elements tab has no duplicate pseudo underline');
  assert.equal(initialStageLayout.dockUnderlineBorder, '2px', 'Add Elements tab has one 2px border underline');
  const rowBox = await ev(
    `(() => { const row = document.querySelector('nav[aria-label="Structure"] [role="treeitem"][aria-level="2"]'); const label = row?.querySelector('.blx-outline-label'); const r = row?.getBoundingClientRect(); const l = label?.getBoundingClientRect(); return { x: r?.x + r?.width / 2, y: r?.y + r?.height / 2, height: r?.height, labelTop: l?.top }; })()`,
  );
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rowBox.x, y: rowBox.y });
  const hoveredTreeRow = await ev(
    `(() => { const row = document.querySelector('nav[aria-label="Structure"] [role="treeitem"][aria-level="2"]'); return { height: row?.getBoundingClientRect().height, labelTop: row?.querySelector('.blx-outline-label')?.getBoundingClientRect().top }; })()`,
  );
  assert.equal(hoveredTreeRow.height, rowBox.height, 'hover preserves the tree row height');
  assert.equal(hoveredTreeRow.labelTop, rowBox.labelTop, 'hover preserves the label vertical position');
  await ev(`document.querySelector('nav[aria-label="Structure"] [role="treeitem"][aria-level="2"]')?.click()`);
  const selectedTreeRow = await ev(
    `(() => { const row = document.querySelector('nav[aria-label="Structure"] [role="treeitem"][aria-level="2"]'); return { selected: row?.getAttribute('aria-selected'), height: row?.getBoundingClientRect().height, labelTop: row?.querySelector('.blx-outline-label')?.getBoundingClientRect().top }; })()`,
  );
  assert.equal(selectedTreeRow.selected, 'true', 'the browser row is selected for the selection geometry check');
  assert.equal(selectedTreeRow.height, rowBox.height, 'selection preserves the tree row height');
  assert.equal(selectedTreeRow.labelTop, rowBox.labelTop, 'selection preserves the label vertical position');
  const noSelectionTop = initialStageLayout.top;
  const assertBreadcrumbHomeIcon = async (state) => {
    const icon = await ev(`(() => {
      const button = document.querySelector('.blx-breadcrumb-home');
      const svg = button?.querySelector(':scope > svg');
      return { width: Number(svg?.getAttribute('width') ?? 0), path: svg?.querySelector('path[d]')?.getAttribute('d') ?? null };
    })()`);
    assert.ok(
      icon.width >= 12 && typeof icon.path === 'string' && icon.path.length > 0,
      `the breadcrumb home button has a visible SVG path in the ${state} state (${JSON.stringify(icon)})`,
    );
  };
  await ev(`document.querySelector('.blx-breadcrumb-home')?.click()`);
  await sleep(200);
  await assertBreadcrumbHomeIcon('no-selection');
  assert.equal(
    canvas.sandbox,
    'allow-scripts allow-same-origin',
    'the canvas iframe uses exactly the documented sandbox',
  );
  assert.ok(canvas.title && canvas.title.length > 3, 'the canvas iframe has a title');
  assert.ok(/page=blixis-canvas/.test(canvas.src ?? ''), 'the iframe loads the dedicated canvas document');
  assert.ok(canvas.sameOrigin, 'the canvas document is same-origin (its trusted runtime needs it)');
  assert.ok(canvas.elements > 0, `the preview renders elements with data-blx-id (${JSON.stringify(canvas)})`);
  assert.ok(
    canvas.headingFont && canvas.headingFont !== 'serif',
    'the canvas heading does not use the browser default serif',
  );
  const unquote = (value) => String(value).replaceAll('"', '').replaceAll("'", '').toLowerCase();
  assert.equal(
    unquote(canvas.headingFont),
    unquote(canvas.headingToken),
    'the canvas heading uses the theme heading font token',
  );
  assert.equal(canvas.scripts, 0, 'no script, frame, object, form, style or link element in the rendered content');
  assert.equal(canvas.inlineHandlers, 0, 'no inline event handler attributes in the rendered content');
  const policy = await ev(
    `fetch(document.querySelector('main iframe').getAttribute('src'), { credentials: 'same-origin' }).then((r) => r.headers.get('content-security-policy'))`,
  );
  assert.ok(
    /script-src 'nonce-[^']+'(;|$)/.test(policy ?? '') &&
      !/script-src[^;]*'self'/.test(policy ?? '') &&
      !/unsafe-inline|unsafe-eval/.test(policy ?? ''),
    `the canvas document has a strict CSP (${policy})`,
  );
  assert.equal(
    await ev(`document.querySelector('[data-testid="canvas-stage"] [role=alert]') === null`),
    true,
    'no preview or connection error is shown',
  );

  // A click inside the canvas selects the element (pick over the MessageChannel), and focus does not stay in the iframe.
  const target = await ev(`(() => {
    const frame = document.querySelector('main iframe');
    const el = [...frame.contentDocument.querySelectorAll('a[href][data-blx-id],button[data-blx-id]')][0];
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    const f = frame.getBoundingClientRect();
    return { id: el.getAttribute('data-blx-id'), x: f.x + r.x + Math.min(r.width / 2, 40), y: f.y + r.y + Math.min(r.height / 2, 10) };
  })()`);
  assert.ok(target, 'the canvas contains an interactive demo element');
  const editorBeforeActivation = await ev('location.href');
  const iframeBeforeActivation = await ev('document.querySelector("main iframe").contentWindow.location.href');
  const targetsBeforeActivation = (await send('Target.getTargets')).result.targetInfos.length;
  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: target.x,
    y: target.y,
    button: 'left',
    clickCount: 1,
  });
  await send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: target.x,
    y: target.y,
    button: 'left',
    clickCount: 1,
  });
  await sleep(600);
  await assertBreadcrumbHomeIcon('selected');
  assert.equal(
    await ev(`document.querySelector('main iframe').getBoundingClientRect().top`),
    noSelectionTop,
    'selecting an element does not move the canvas iframe',
  );
  const longBreadcrumbTop = await ev(`(() => {
    const crumbs = document.querySelector('.blx-stage-crumbs');
    const label = crumbs.querySelector('.blx-breadcrumb-item');
    const original = label?.textContent;
    if (label) label.textContent = 'Long breadcrumb '.repeat(80);
    const top = document.querySelector('main iframe').getBoundingClientRect().top;
    if (label && original !== undefined && original !== null) label.textContent = original;
    return top;
  })()`);
  assert.equal(longBreadcrumbTop, noSelectionTop, 'a long breadcrumb does not move the canvas iframe');
  const afterPick = await ev(
    `({ inspector: document.querySelector('aside[aria-label="Inspector"]').textContent, focusInFrame: document.activeElement?.tagName === 'IFRAME', marked: document.querySelector('main iframe').contentDocument.querySelectorAll('[data-blx-selected]').length, outlines: document.querySelectorAll('[data-testid="selection-overlay"]').length })`,
  );
  assert.ok(afterPick.inspector.includes(target.id), 'picking an element in the canvas selects it in the editor');
  assert.equal(
    await ev('location.href'),
    editorBeforeActivation,
    'clicking the canvas element leaves the editor URL unchanged',
  );
  assert.equal(
    await ev('document.querySelector("main iframe").contentWindow.location.href'),
    iframeBeforeActivation,
    'clicking the canvas element leaves the iframe URL unchanged',
  );
  assert.equal(
    (await send('Target.getTargets')).result.targetInfos.length,
    targetsBeforeActivation,
    'clicking does not open a new target',
  );
  assert.equal(afterPick.marked, 0, 'selected styling is absent from the canvas document');
  assert.equal(afterPick.outlines, 1, 'the editor renders exactly one selected outline');
  assert.equal(afterPick.focusInFrame, false, 'focus does not stay inside the iframe after a pick');
  await ev(`(() => {
    const frame = document.querySelector('main iframe');
    const link = frame.contentDocument.createElement('a');
    link.href = '/?blx-canvas-guard-keyboard-probe';
    link.textContent = 'Keyboard guard probe';
    link.setAttribute('data-blx-id', '${target.id}');
    frame.contentDocument.querySelector('#blx-canvas-root').append(link);
    link.focus();
  })()`);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await sleep(500);
  assert.equal(
    await ev('location.href'),
    editorBeforeActivation,
    'Enter on the focused canvas link leaves the editor URL unchanged',
  );
  assert.equal(
    await ev('document.querySelector("main iframe").contentWindow.location.href'),
    iframeBeforeActivation,
    'Enter on the focused canvas link leaves the iframe URL unchanged',
  );
  await ev(
    `(() => { const frame = document.querySelector('main iframe'); frame.contentWindow.scrollTo(0, 0); frame.contentDocument.activeElement?.blur?.(); frame.focus(); frame.contentWindow.focus(); })()`,
  );
  await sleep(300);
  const canvasScrollBefore = await ev('document.querySelector("main iframe").contentWindow.scrollY');
  await press('PageDown');
  await sleep(600);
  const canvasScrollAfter = await ev('document.querySelector("main iframe").contentWindow.scrollY');
  assert.ok(
    canvasScrollAfter > canvasScrollBefore,
    `PageDown still scrolls the canvas body (${canvasScrollBefore} -> ${canvasScrollAfter})`,
  );
  await ev(`document.querySelector('main iframe').contentWindow.scrollTo(0, 0)`);
  await sleep(400);
  await ev(`${buttonByText('style')}.click()`);
  await sleep(250);
  const styleInspector = await ev(`(() => {
    const panel = document.querySelector('aside[aria-label="Inspector"]');
    const labels = [...panel.querySelectorAll('.blx-inspector-label > label, .blx-inspector-label > span')].map((label) => ({
      text: label.textContent.trim(), clipped: label.scrollWidth > label.clientWidth,
    }));
    return { text: panel.innerText, labels };
  })()`);
  assert.ok(!/var\(--/i.test(styleInspector.text), 'the Style tab never displays raw CSS token syntax');
  assert.ok(
    styleInspector.labels.every(({ text, clipped }) => text.length > 0 && !text.endsWith('…') && !clipped),
    `Style labels are readable and unclipped (${JSON.stringify(styleInspector.labels)})`,
  );
  assert.equal(
    new Set(styleInspector.labels.map(({ text }) => text)).size,
    styleInspector.labels.length,
    `Style labels are unique (${JSON.stringify(styleInspector.labels.map(({ text }) => text))})`,
  );
  await sleep(200);
  const overlay = await ev(`(() => {
    const frame = document.querySelector('main iframe');
    const el = frame.contentDocument.querySelector('[data-blx-id="' + ${JSON.stringify(target.id)} + '"]');
    const box = el?.getBoundingClientRect();
    const fb = frame.getBoundingClientRect();
    const outline = document.querySelector('[data-testid="selection-overlay"]')?.getBoundingClientRect();
    const toolbar = document.querySelector('[data-testid="selection-toolbar"]')?.getBoundingClientRect();
    const handles = [...document.querySelectorAll('[data-testid="selection-handles"] [data-handle]')].map((h) => { const r = h.getBoundingClientRect(); return { key: h.dataset.handle, x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    const expected = outline ? { nw:[outline.left,outline.top], n:[outline.left+outline.width/2,outline.top], ne:[outline.right,outline.top], e:[outline.right,outline.top+outline.height/2], se:[outline.right,outline.bottom], s:[outline.left+outline.width/2,outline.bottom], sw:[outline.left,outline.bottom], w:[outline.left,outline.top+outline.height/2] } : {};
    const maxHandleDelta = Math.max(0, ...handles.map((h) => Math.max(Math.abs(h.x-expected[h.key][0]),Math.abs(h.y-expected[h.key][1]))));
    return box && outline ? { dx: Math.abs(outline.left - fb.left - box.left), dy: Math.abs(outline.top - fb.top - box.top), dw: Math.abs(outline.width - box.width), dh: Math.abs(outline.height - box.height), maxHandleDelta, handleCount: handles.length, toolbarAbove: toolbar ? toolbar.bottom <= outline.top + 1 : false, toolbarInside: toolbar ? toolbar.left >= fb.left && toolbar.right <= fb.right : false } : null;
  })()`);
  assert.ok(
    overlay && Math.max(overlay.dx, overlay.dy, overlay.dw, overlay.dh) <= 2,
    `the editor overlay matches the canvas element within 2px (${JSON.stringify(overlay)})`,
  );
  assert.equal(overlay.handleCount, 8, 'the selection has eight visual handles');
  assert.ok(
    overlay.maxHandleDelta <= 1,
    `the handles are centred on the eight outline points (${JSON.stringify(overlay)})`,
  );
  assert.ok(
    overlay.toolbarAbove && overlay.toolbarInside,
    `the toolbar sits above selection inside frame (${JSON.stringify(overlay)})`,
  );
  const iframeTopBeforeDuplicate = await ev(`document.querySelector('main iframe').getBoundingClientRect().top`);
  const treeRows = `[...document.querySelectorAll('nav[aria-label="Structure"] [role="treeitem"]')].map((row) => row.dataset.id)`;
  const treeBeforeDuplicate = await ev(treeRows);
  await ev(`document.querySelector('[data-testid="selection-toolbar"] button[aria-label="Duplicate"]')?.click()`);
  await sleep(1800);
  const treeAfterDuplicate = await ev(treeRows);
  const copyId = treeAfterDuplicate.find((id) => !treeBeforeDuplicate.includes(id));
  assert.equal(treeAfterDuplicate.length, treeBeforeDuplicate.length + 1, 'Duplicate inserts a copy');
  assert.ok(copyId?.startsWith('el-copy-'), 'the duplicate has a fresh element id');
  assert.ok(
    await ev(
      `!!document.querySelector('main iframe').contentDocument.querySelector('[data-blx-id="' + ${JSON.stringify(copyId)} + '"]')`,
    ),
    'the canvas preview shows the duplicate',
  );
  await ev(`document.querySelector('button[aria-label="Undo"]')?.click()`);
  await sleep(1800);
  assert.deepEqual(await ev(treeRows), treeBeforeDuplicate, 'Undo removes the duplicate');
  assert.equal(
    await ev(`document.querySelector('main iframe').getBoundingClientRect().top`),
    iframeTopBeforeDuplicate,
    'selection actions do not move the iframe',
  );
  await ev(
    `[...document.querySelectorAll('nav[aria-label="Structure"] [role="treeitem"]')].find((row) => row.dataset.id === ${JSON.stringify(target.id)})?.click()`,
  );
  await sleep(500);
  await ev(`document.querySelector('main iframe').contentWindow.scrollTo(0, 100)`);
  await sleep(250);
  const scrolledOverlay = await ev(`(() => {
    const frame = document.querySelector('main iframe');
    const box = frame.contentDocument.querySelector('[data-blx-id="' + ${JSON.stringify(target.id)} + '"]')?.getBoundingClientRect();
    const fb = frame.getBoundingClientRect();
    const outline = document.querySelector('[data-testid="selection-overlay"]')?.getBoundingClientRect();
    return box && outline ? { dx: Math.abs(outline.left - fb.left - box.left), dy: Math.abs(outline.top - fb.top - box.top), dw: Math.abs(outline.width - box.width), dh: Math.abs(outline.height - box.height) } : null;
  })()`);
  assert.ok(
    scrolledOverlay && Math.max(scrolledOverlay.dx, scrolledOverlay.dy, scrolledOverlay.dw, scrolledOverlay.dh) <= 2,
    `the editor overlay stays aligned after canvas scrolling (${JSON.stringify(scrolledOverlay)})`,
  );
  await ev(`document.querySelector('[role="treeitem"][data-id=${JSON.stringify(target.id)}]')?.click()`);
  await sleep(300);
  assert.ok(
    await ev(
      `document.querySelector('aside[aria-label="Inspector"]').textContent.includes(${JSON.stringify(target.id)})`,
    ),
    'tree selection selects the element',
  );
  const crumb = await ev(
    `document.querySelector('[aria-label="Selected element path"] .blx-breadcrumb-item[aria-current="location"]')?.textContent.trim()`,
  );
  assert.ok(crumb, 'the selected element breadcrumb renders');
  const firstCrumbId = await ev(
    `document.querySelector('[aria-label="Selected element path"] .blx-breadcrumb-item')?.getAttribute('title')`,
  );
  await ev(`document.querySelector('[aria-label="Selected element path"] .blx-breadcrumb-item')?.click()`);
  await sleep(300);
  assert.ok(
    await ev(
      `document.querySelector('aside[aria-label="Inspector"]').textContent.includes(${JSON.stringify(firstCrumbId)})`,
    ),
    'breadcrumb selection is interactive',
  );

  // Viewport buttons size the frame; the content is not scaled.
  for (const [name, width] of [
    ['Tablet', 768],
    ['Mobile', 375],
  ]) {
    await ev(
      `[...document.querySelectorAll('[role=radio]')].find((b) => b.getAttribute('aria-label') === ${JSON.stringify(name)}).click()`,
    );
    await sleep(500);
    const sized = await frameInfo();
    assert.ok(Math.abs(sized.width - width) <= 2, `${name} sizes the canvas frame to ${width}px (got ${sized.width})`);
  }
  await ev(
    `[...document.querySelectorAll('[role=radio]')].find((b) => b.getAttribute('aria-label') === 'Desktop').click()`,
  );
  await sleep(400);

  // Preview appearance is the WEBSITE content appearance and independent of the editor chrome appearance.
  const chromeBefore = await ev(`document.querySelector('.blx-editor').getAttribute('data-editor-theme')`);
  await ev(
    `[...document.querySelectorAll('[role=radiogroup][aria-label="Preview appearance"] [role=radio]')].find((b) => b.textContent.trim() === 'Dark').click()`,
  );
  await sleep(1200);
  const previewDark = await frameInfo();
  assert.equal(previewDark.mode, 'dark', 'the canvas content switches to the dark website appearance');
  assert.equal(previewDark.htmlMode, 'dark', 'the canvas html uses the website dark appearance attribute');
  assert.equal(previewDark.colorScheme, 'dark', 'the native color scheme follows the dark website appearance');
  assert.equal(
    previewDark.bodyBackground,
    normalizeColor(previewDark.bgToken),
    'the dark canvas body uses the dark background token',
  );
  assert.equal(
    await ev(`document.querySelector('.blx-editor').getAttribute('data-editor-theme')`),
    chromeBefore,
    'the editor chrome appearance is not changed by the preview appearance',
  );
  await ev(
    `[...document.querySelectorAll('[role=radiogroup][aria-label="Preview appearance"] [role=radio]')].find((b) => b.textContent.trim() === 'Light').click()`,
  );
  await sleep(800);
  const previewLight = await frameInfo();
  assert.equal(previewLight.mode, 'light', 'the canvas content returns to the light website appearance');
  assert.equal(previewLight.htmlMode, 'light', 'the canvas html returns to the website light appearance attribute');
  assert.equal(previewLight.colorScheme, 'light', 'the native color scheme returns to light');
  assert.equal(
    previewLight.bodyBackground,
    normalizeColor(previewLight.bgToken),
    'the light canvas body uses the light background token',
  );
  const lightBackground = previewLight.bodyBackground;
  const otherChrome = chromeBefore === 'dark' ? 'light' : 'dark';
  await ev(`document.querySelector('button[aria-label="More options"]')?.click()`);
  await sleep(200);
  await ev(
    `[...document.querySelectorAll('[role="menuitemradio"]')].find((item) => item.textContent.trim().toLowerCase().includes(${JSON.stringify(otherChrome)}))?.click()`,
  );
  await sleep(300);
  assert.equal(
    (await frameInfo()).bodyBackground,
    lightBackground,
    'the editor chrome toggle does not alter the canvas website background',
  );
  await ev(`document.querySelector('button[aria-label="More options"]')?.click()`);
  await sleep(200);
  await ev(
    `[...document.querySelectorAll('[role="menuitemradio"]')].find((item) => item.textContent.trim().toLowerCase().includes(${JSON.stringify(chromeBefore)}))?.click()`,
  );
  await sleep(300);
  // The preview appearance and the viewport control are the same kind of single-choice group (role=radio + aria-checked).
  const choice = await ev(`(() => {
    const groups = ['Preview width', 'Preview appearance'].map((name) => document.querySelector('[role=radiogroup][aria-label="' + name + '"]'));
    return groups.map((g) => g ? [...g.querySelectorAll('[role=radio]')].map((r) => r.getAttribute('aria-checked')) : null);
  })()`);
  assert.ok(
    choice.every((items) => items && items.length >= 2 && items.filter((v) => v === 'true').length === 1),
    `both choice controls are radio groups with exactly one checked item (${JSON.stringify(choice)})`,
  );
  const frameTitle = (await frameInfo()).title ?? '';
  assert.ok(
    !/\([a-z]{2,3}_[A-Za-z0-9]+\)/.test(frameTitle),
    `the frame title shows a language name, not the raw id (${frameTitle})`,
  );

  // ---- Handshake hardening in a real browser -------------------------------------------------------------------------
  // Count every MessageChannel the editor creates: one per accepted handshake, so a forged hello would show as an extra one.
  await ev(`(() => {
    const Native = window.MessageChannel;
    window.__blxChannels = 0;
    window.MessageChannel = function () { window.__blxChannels += 1; return new Native(); };
  })()`);
  const channels = () => ev(`window.__blxChannels`);
  const sessionState = () => ev(`document.querySelector('main iframe')?.getAttribute('data-session')`);
  assert.equal(await sessionState(), 'ready', 'the canvas session is connected before the handshake checks');
  const desktopWidth = (await frameInfo()).width;
  const viewportWidthIs = async (name, width) => {
    await ev(
      `[...document.querySelectorAll('[role=radio]')].find((b) => b.getAttribute('aria-label') === ${JSON.stringify(name)}).click()`,
    );
    for (let i = 0; i < 20; i += 1) {
      await sleep(100);
      if (Math.abs((await frameInfo()).width - width) <= 2) return true;
    }
    return false;
  };

  // (a) A forged handshake from a SECOND same-origin frame: it posts valid-looking hellos from its own window.
  const problemsBeforeForgery = problems.length;
  const channelsBeforeForgery = await channels();
  await ev(`(() => {
    const forger = document.createElement('iframe');
    forger.name = 'blx-forger';
    forger.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    forger.setAttribute('title', 'forger');
    forger.srcdoc = '<p>forger</p>';
    document.body.appendChild(forger);
  })()`);
  await sleep(500);
  const forgerId = await childFrameId('blx-forger');
  assert.ok(forgerId, 'the forger frame exists');
  await evIn(
    forgerId,
    `window.__received = 0; window.addEventListener('message', () => { window.__received += 1; }); true`,
  );
  const forged = await evIn(
    forgerId,
    `(() => {
      for (let i = 0; i < 5; i += 1) {
        parent.postMessage({ type: 'blx-canvas-hello', version: 1, nonce: 'Forged' + i + 'ABCDEFGHIJKLMNOPQ' }, window.origin);
      }
      return { origin: window.origin, sameOrigin: window.origin === parent.window.origin };
    })()`,
  );
  assert.ok(forged.sameOrigin, `the forger is same-origin with the editor (${JSON.stringify(forged)})`);
  await sleep(500);
  assert.equal(await channels(), channelsBeforeForgery, 'a hello from a second frame creates no MessageChannel');
  assert.equal(
    await evIn(forgerId, `window.__received`),
    0,
    'the forger never receives an init (no port is sent to it)',
  );
  assert.equal(await sessionState(), 'ready', 'the real canvas stays connected after the forged hellos');
  assert.ok(await viewportWidthIs('Tablet', 768), 'the real canvas still follows viewport changes after the forgery');
  assert.ok(await viewportWidthIs('Desktop', desktopWidth), 'back to the desktop viewport');
  assert.deepEqual(problems.slice(problemsBeforeForgery), [], 'the forged handshake logged no error');

  // (b) Frame reload: the canvas document is reloaded; the editor must notice, re-handshake (exactly one new channel, even
  // while the forger keeps posting hellos) and show the content again.
  await evIn(
    forgerId,
    `window.__spam = setInterval(() => parent.postMessage({ type: 'blx-canvas-hello', version: 1, nonce: 'Spam' + Math.random().toString(36).slice(2).padEnd(18, 'x') }, window.origin), 15); true`,
  );
  const channelsBeforeReload = await channels();
  await ev(`(() => {
    const win = document.querySelector('main iframe').contentWindow;
    win.__blxMarker = 'old-document';
    win.location.reload();
  })()`);
  let recovered = false;
  for (let i = 0; i < 40 && !recovered; i += 1) {
    await sleep(250);
    recovered = await ev(`(() => {
      const frame = document.querySelector('main iframe');
      let fresh = false;
      let elements = 0;
      try {
        fresh = frame.contentWindow.__blxMarker === undefined;
        elements = frame.contentDocument.querySelectorAll('#blx-canvas-root [data-blx-id]').length;
      } catch { /* the document is navigating */ }
      return fresh && elements > 0 && frame.getAttribute('data-session') === 'ready';
    })()`);
  }
  assert.ok(
    recovered,
    `after a frame reload the canvas shows its content again and the state is connected (${await sessionState()})`,
  );
  await sleep(500);
  assert.equal(
    await channels(),
    channelsBeforeReload + 1,
    'the reload produced exactly one new handshake, none for the forger',
  );
  assert.equal(await sessionState(), 'ready', 'the editor is still connected after the spam');
  await ev(
    `[...document.querySelectorAll('[role=radiogroup][aria-label="Preview appearance"] [role=radio]')].find((b) => b.textContent.trim() === 'Dark').click()`,
  );
  await sleep(1200);
  assert.equal((await frameInfo()).mode, 'dark', 'the reloaded canvas receives the editor messages again (appearance)');
  await ev(
    `[...document.querySelectorAll('[role=radiogroup][aria-label="Preview appearance"] [role=radio]')].find((b) => b.textContent.trim() === 'Light').click()`,
  );
  await sleep(800);
  assert.equal((await frameInfo()).mode, 'light', 'and back to light');
  assert.ok(await viewportWidthIs('Mobile', 375), 'the reloaded canvas follows the viewport');
  assert.ok(await viewportWidthIs('Desktop', desktopWidth), 'back to the desktop viewport after the reload');
  await evIn(forgerId, `clearInterval(window.__spam); true`);
  await ev(`document.querySelector('iframe[name="blx-forger"]')?.remove()`);
  assert.deepEqual(problems.slice(problemsBeforeForgery), [], 'the reload and the spam logged no error');

  // (c) CSP enforcement: inject an inline script and an inline handler into the canvas document the way a bug would. The
  // policy must stop both (a flag stays unset) and the browser must report the violations.
  const problemsBeforeProbe = problems.length;
  await ev(`(() => {
    const frame = document.querySelector('main iframe');
    const win = frame.contentWindow;
    const doc = frame.contentDocument;
    win.__blxPwn = undefined;
    win.__blxImgErrored = false;
    const script = doc.createElement('script');
    script.textContent = 'window.__blxPwn = "inline-script"';
    doc.body.appendChild(script);
    const img = doc.createElement('img');
    img.setAttribute('onerror', 'window.__blxPwn = "inline-handler"');
    img.addEventListener('error', () => { win.__blxImgErrored = true; });
    img.setAttribute('src', 'data:image/png;base64,AAAA');
    doc.body.appendChild(img);
  })()`);
  await sleep(1000);
  const probe = await ev(`(() => {
    const win = document.querySelector('main iframe').contentWindow;
    return { pwn: win.__blxPwn ?? null, imgErrored: win.__blxImgErrored };
  })()`);
  assert.equal(
    probe.pwn,
    null,
    `neither the injected inline script nor the inline handler ran (${JSON.stringify(probe)})`,
  );
  assert.equal(probe.imgErrored, true, 'control: the broken image really failed, so its onerror handler was exercised');
  const probeProblems = problems.splice(problemsBeforeProbe);
  const violations = probeProblems.filter((entry) => /Content Security Policy/i.test(entry));
  assert.ok(
    violations.some((entry) => /inline script/i.test(entry)),
    `the browser reported the blocked inline script (${JSON.stringify(probeProblems)})`,
  );
  assert.ok(
    violations.some((entry) => /inline event handler/i.test(entry)),
    `the browser reported the blocked inline handler (${JSON.stringify(probeProblems)})`,
  );
  assert.deepEqual(
    probeProblems.filter((entry) => !violations.includes(entry)),
    [],
    'the probe caused only the expected CSP reports',
  );
  await ev(
    `(() => { const doc = document.querySelector('main iframe').contentDocument; doc.body.querySelectorAll('script, img').forEach((el) => el.remove()); })()`,
  );
  const wrong = apiResponses.filter((entry) => entry.status !== 200);
  assert.ok(
    apiResponses.length >= 3 && wrong.length === 0,
    `layout, both content streams and the previews load with 200 (${JSON.stringify(apiResponses)})`,
  );

  if (SCREENSHOT) {
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(SCREENSHOT, Buffer.from(shot.result.data, 'base64'));
  }
  // The deliberate CSP probes inject exactly one inline script and one inline event handler; their violation reports can
  // arrive after the probe's own cleanup, so drop only those two expected messages. Any other problem still fails.
  for (let index = problems.length - 1; index >= 0; index -= 1) {
    if (
      /Executing inline (script|event handler) violates the following Content Security Policy/.test(problems[index])
    ) {
      problems.splice(index, 1);
    }
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
