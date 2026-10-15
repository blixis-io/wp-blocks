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
    `[...document.querySelectorAll('header [role=toolbar] button, header [role=toolbar] a')].map((b) => (b.getAttribute('aria-label') ?? b.textContent).trim() + ':' + b.tabIndex + (b.disabled ? ':disabled' : '')).join(' | ')`,
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
    `End and Home jump to the ends of the toolbar (first=${first}, second=${second}, last=${last}, home=${home}, items=${await ev(`[...document.querySelectorAll('header [role=toolbar] button, header [role=toolbar] a')].map((b) => (b.getAttribute('aria-label') ?? b.textContent).trim() + ':' + b.tabIndex).join(' | ')`)})`,
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
  assert.notEqual(paletteInsert.undo, 'true', 'undo becomes available after palette insertion');
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

  // A spacing token change is sent through the responsive style command and appears in compiled preview CSS.
  await ev(
    `(() => { const tab = [...document.querySelectorAll('[role=tab]')].find((item) => item.textContent.trim() === 'Style'); tab?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, ctrlKey: false })); })()`,
  );
  await sleep(300);
  const spacingBefore = await ev(
    `document.querySelector('main iframe')?.contentDocument?.styleSheets ? [...document.querySelector('main iframe').contentDocument.styleSheets].map((sheet) => { try { return [...sheet.cssRules].map((rule) => rule.cssText).join(''); } catch { return ''; } }).join('') : ''`,
  );
  await ev(
    `(() => { const label = [...document.querySelectorAll('label')].find((item) => item.textContent.trim() === 'Top'); const select = label && document.getElementById(label.htmlFor); if (!select) return false; select.value = 'var(--blx-space-4)'; select.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`,
  );
  await sleep(1500);
  const spacingAfter = await ev(
    `document.querySelector('main iframe')?.contentDocument ? [...document.querySelector('main iframe').contentDocument.styleSheets].map((sheet) => { try { return [...sheet.cssRules].map((rule) => rule.cssText).join(''); } catch { return ''; } }).join('') : ''`,
  );
  assert.notEqual(spacingAfter, spacingBefore, 'spacing changes the compiled canvas preview CSS');
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
    const el = [...frame.contentDocument.querySelectorAll('[data-blx-id]')].find((e) => e.getAttribute('data-blx-id').includes('hero-h1'));
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    const f = frame.getBoundingClientRect();
    return { id: el.getAttribute('data-blx-id'), x: f.x + r.x + Math.min(r.width / 2, 40), y: f.y + r.y + Math.min(r.height / 2, 10) };
  })()`);
  assert.ok(target, 'the canvas contains the hero heading');
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
  const afterPick = await ev(
    `({ inspector: document.querySelector('aside[aria-label="Inspector"]').textContent, focusInFrame: document.activeElement?.tagName === 'IFRAME', marked: document.querySelector('main iframe').contentDocument.querySelectorAll('[data-blx-selected]').length })`,
  );
  assert.ok(afterPick.inspector.includes(target.id), 'picking an element in the canvas selects it in the editor');
  assert.equal(afterPick.marked, 1, 'the selected element is marked in the canvas');
  assert.equal(afterPick.focusInFrame, false, 'focus does not stay inside the iframe after a pick');
  await sleep(200);
  const overlay = await ev(`(() => {
    const frame = document.querySelector('main iframe');
    const el = frame.contentDocument.querySelector('[data-blx-selected]');
    const box = el?.getBoundingClientRect();
    const fb = frame.getBoundingClientRect();
    const outline = document.querySelector('[data-testid="selection-overlay"]')?.getBoundingClientRect();
    return box && outline ? { dx: Math.abs(outline.left - fb.left - box.left), dy: Math.abs(outline.top - fb.top - box.top), dw: Math.abs(outline.width - box.width), dh: Math.abs(outline.height - box.height) } : null;
  })()`);
  assert.ok(
    overlay && Math.max(overlay.dx, overlay.dy, overlay.dw, overlay.dh) <= 2,
    `the editor overlay matches the canvas element within 2px (${JSON.stringify(overlay)})`,
  );
  await ev(`document.querySelector('main iframe').contentWindow.scrollTo(0, 100)`);
  await sleep(250);
  const scrolledOverlay = await ev(`(() => {
    const frame = document.querySelector('main iframe');
    const box = frame.contentDocument.querySelector('[data-blx-selected]')?.getBoundingClientRect();
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
    `document.querySelector('[aria-label="Selected element path"] button[aria-current="location"]')?.textContent.trim()`,
  );
  assert.ok(crumb, 'the selected element breadcrumb renders');
  const firstCrumbId = await ev(
    `document.querySelector('[aria-label="Selected element path"] button:first-child')?.getAttribute('title')`,
  );
  await ev(`document.querySelector('[aria-label="Selected element path"] button:first-child')?.click()`);
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
  await ev(`${buttonByText(otherChrome)}.click()`);
  await sleep(100);
  assert.equal(
    (await frameInfo()).bodyBackground,
    lightBackground,
    'the editor chrome toggle does not alter the canvas website background',
  );
  await ev(`${buttonByText(chromeBefore)}.click()`);
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
  assert.deepEqual(problems, [], 'no console errors, exceptions or content-security-policy violations');
  console.log('Editor browser checks passed.');
} finally {
  ws?.close();
  const exited = new Promise((resolve) => chrome.once('exit', resolve));
  chrome.kill();
  await exited;
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
