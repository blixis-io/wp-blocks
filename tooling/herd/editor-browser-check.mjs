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
const mediaUploadDir = mkdtempSync(join(tmpdir(), 'blx-media-check-'));
const mediaUploadPath = join(mediaUploadDir, 'blixis-check-image.png');
writeFileSync(
  mediaUploadPath,
  Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pXcAAAAASUVORK5CYII=', 'base64'),
);
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
let restoreDemoHeading = null;
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
    } else if (message.method === 'Page.javascriptDialogOpening') {
      // The unsaved-changes guard (beforeunload) opens a dialog when the check reloads a dirty editor: accept, as "Leave".
      ws.send(JSON.stringify({ id: (seq += 1), method: 'Page.handleJavaScriptDialog', params: { accept: true } }));
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
  const send = (method, params = {}, sessionId = undefined) =>
    new Promise((resolve) => {
      const id = (seq += 1);
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  const ev = async (expression) => {
    const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    return response.result?.result?.value;
  };
  const waitForMotion = async () => {
    await ev(`Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => undefined)))`);
    await sleep(350);
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
  const checkUndoTooltip = async (theme) => {
    const point = await ev(
      `(() => { const r = document.querySelector('button[aria-label="Undo"]')?.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; })()`,
    );
    assert.ok(point, `${theme} chrome has a real Undo trigger`);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y });
    await sleep(500);
    const actual = await ev(
      `(() => { const trigger = document.querySelector('button[aria-label="Undo"]'); const tip = document.querySelector('[role="tooltip"]'); if (!trigger || !tip) return null; const a=trigger.getBoundingClientRect(), b=tip.getBoundingClientRect(), style=getComputedStyle(tip), header=getComputedStyle(trigger.closest('.blx-header') ?? trigger.parentElement); const rgb=(v)=>{const n=v.match(/[\\d.]+/g)?.slice(0,3).map(Number)??[];return v.startsWith('color(')?n.map(x=>x*255):n}; const lum=(v)=>{const [r,g,b]=rgb(v).map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return .2126*r+.7152*g+.0722*b}; const ratio=(x,y)=>{const p=lum(x),q=lum(y);return (Math.max(p,q)+.05)/(Math.min(p,q)+.05)}; const border=style.borderTopColor; return {text:tip.querySelector('.ed-tooltip-title')?.textContent, keys:[...tip.querySelectorAll('kbd')].map(k=>k.textContent), bg:style.backgroundColor, header:header.backgroundColor, border, borderHeaderRatio:ratio(border,header.backgroundColor), fg:style.color, muted:getComputedStyle(tip.querySelector('.ed-tooltip-keys')?.firstElementChild??tip).color, fgRatio:ratio(style.color,style.backgroundColor), mutedRatio:ratio(getComputedStyle(tip.querySelector('.ed-tooltip-keys')?.firstElementChild??tip).color,style.backgroundColor), arrow:!!tip.querySelector('.ed-tooltip-arrow'), pointer:style.pointerEvents, gap:Math.max(a.top-b.bottom,b.top-a.bottom,a.left-b.right,b.left-a.right), intersects:!(a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top), inside:b.left>=0&&b.top>=0&&b.right<=innerWidth&&b.bottom<=innerHeight, rect:{x:b.left+b.width/2,y:b.top+b.height/2}}; })()`,
    );
    assert.ok(actual, `${theme} Undo tooltip opens after the hover delay`);
    assert.equal(actual.text, 'Undo', `${theme} tooltip uses the concise title`);
    assert.ok(actual.keys.includes('Z') && actual.keys.length >= 2, `${theme} tooltip shows shortcut keycaps`);
    assert.ok(
      actual.bg !== actual.header || actual.borderHeaderRatio >= 1.5,
      `${theme} tooltip is distinguishable from header surface (${JSON.stringify({ bg: actual.bg, header: actual.header, border: actual.border, borderHeaderRatio: actual.borderHeaderRatio })})`,
    );
    assert.ok(actual.fgRatio >= 4.5 && actual.mutedRatio >= 4.5, `${theme} tooltip title and shortcut contrast pass`);
    assert.equal(actual.arrow, true, `${theme} tooltip arrow is present`);
    assert.equal(actual.pointer, 'none', `${theme} tooltip does not receive pointer events`);
    assert.equal(actual.intersects, false, `${theme} tooltip does not cover its trigger`);
    assert.ok(actual.gap >= 4, `${theme} tooltip clears its trigger by at least 4px`);
    assert.equal(actual.inside, true, `${theme} tooltip stays inside the viewport`);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: actual.rect.x, y: actual.rect.y });
    await sleep(140);
    assert.equal(
      await ev(`!!document.querySelector('[role="tooltip"]')`),
      false,
      `${theme} moving over tooltip does not keep it open`,
    );
    await ev(`document.querySelector('button[aria-label="Undo"]')?.focus()`);
    await sleep(80);
    assert.equal(
      await ev(`!!document.querySelector('[role="tooltip"]')`),
      true,
      `${theme} keyboard focus opens Undo tooltip immediately`,
    );
    await press('Escape');
    assert.equal(
      await ev(`!!document.querySelector('[role="tooltip"]')`),
      false,
      `${theme} Escape dismisses Undo tooltip`,
    );
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
  await press('ArrowDown');
  const focusedMenuRows = await ev(
    `(() => [...document.querySelectorAll('[role="menu"] [role^="menuitem"]')].filter(item => getComputedStyle(item).outlineStyle !== 'none' && parseFloat(getComputedStyle(item).outlineWidth) > 0).length)()`,
  );
  assert.equal(focusedMenuRows, 1, 'only the roving keyboard-focused menu row shows a focus ring');
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
  await sleep(500);
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
  await checkUndoTooltip('dark');
  const bgDark = await ev(`getComputedStyle(document.querySelector('.blx-editor')).backgroundColor`);
  const tooltipTrigger = await ev(
    `(() => { const el = document.querySelector('.blx-appearance-help'); const r = el?.getBoundingClientRect(); return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; })()`,
  );
  assert.ok(tooltipTrigger, 'appearance help tooltip trigger exists');
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: tooltipTrigger.x, y: tooltipTrigger.y });
  await sleep(650);
  const tooltipStyle = await ev(
    `(() => { const tip = document.querySelector('[role="tooltip"]'); if (!tip) return null; const style = getComputedStyle(tip); const page = getComputedStyle(document.querySelector('.blx-editor')); const rgb = (value) => { const n = value.match(/[\\d.]+/g)?.slice(0, 3).map(Number) ?? []; return value.startsWith('color(') ? n.map((x) => x * 255) : n; }; const lum = (value) => { const [r,g,b] = rgb(value).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return .2126*r + .7152*g + .0722*b; }; const a=lum(style.color), b=lum(style.backgroundColor); return { bg: style.backgroundColor, fg: style.color, page: page.backgroundColor, contrast: (Math.max(a,b)+.05)/(Math.min(a,b)+.05), insideFrame: !!tip.ownerDocument.defaultView?.frameElement }; })()`,
  );
  assert.ok(tooltipStyle, 'hover opens the editor tooltip');
  assert.notEqual(tooltipStyle.bg, 'rgba(0, 0, 0, 0)', 'tooltip background is opaque');
  assert.notEqual(tooltipStyle.bg, tooltipStyle.page, 'tooltip background differs from the editor page');
  assert.ok(tooltipStyle.contrast >= 4.5, `tooltip text contrast passes (${JSON.stringify(tooltipStyle)})`);
  assert.equal(tooltipStyle.insideFrame, false, 'tooltip is rendered in editor chrome outside the canvas iframe');
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 3, y: 3 });
  await nav(editorUrl, 2000);
  assert.equal(
    await ev(`document.querySelector('.blx-editor').getAttribute('data-editor-theme')`),
    'dark',
    'the chrome theme survives a reload',
  );
  await clickReal('button[aria-label="More options"]');
  await ev(`${buttonByText('Editor appearance: Light')}.click()`);
  await sleep(300);
  await checkUndoTooltip('light');
  const bgLight = await ev(`getComputedStyle(document.querySelector('.blx-editor')).backgroundColor`);
  assert.notEqual(bgDark, bgLight, 'light and dark chrome render different backgrounds');
  await clickReal('button[aria-label="More options"]');
  await ev(`${buttonByText('Editor appearance: System')}.click()`);

  // Panels collapse with correct ARIA.
  await clickReal('button[aria-label="More options"]');
  const toggle = buttonByText('Structure panel');
  const expandedBefore = await ev(`${toggle}?.getAttribute('aria-checked')`);
  await ev(`${toggle}.click()`);
  await waitForMotion();
  assert.equal(
    await ev(`document.querySelector('nav[aria-label="Structure"]')?.contains(document.activeElement)`),
    false,
    'focus does not remain inside the closed structure panel',
  );
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
  await waitForMotion();
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
    const heading = [...document.querySelectorAll('h2')].find((h) => /inspector|page settings/i.test(h.textContent));
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
  const inlineHeadingPoint = await ev(
    `(() => { const frame=document.querySelector('main iframe'), target=frame?.contentDocument?.querySelector('[data-blx-id="hero-h1"]'); target?.scrollIntoView({block:'center'}); const fr=frame?.getBoundingClientRect(), r=target?.getBoundingClientRect(); return fr&&r ? {x:fr.left+frame.clientLeft+r.left+r.width/2,y:fr.top+frame.clientTop+r.top+r.height/2} : null; })()`,
  );
  assert.ok(inlineHeadingPoint, 'demo heading has a visible canvas click point');
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: inlineHeadingPoint.x, y: inlineHeadingPoint.y });
  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: inlineHeadingPoint.x,
    y: inlineHeadingPoint.y,
    button: 'left',
    clickCount: 1,
  });
  await send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: inlineHeadingPoint.x,
    y: inlineHeadingPoint.y,
    button: 'left',
    clickCount: 1,
  });
  await sleep(500);
  const activeEdit = await ev(
    `(() => { const frame=document.querySelector('main iframe'), heading=frame?.contentDocument?.querySelector('[data-blx-id="hero-h1"]'), root=heading?.querySelector('[data-blx-richtext-root]'), style=heading&&frame.contentWindow.getComputedStyle(heading); return { active:!!root, editing:heading?.hasAttribute('data-blx-editing'), outlineStyle:style?.outlineStyle, outlineWidth:style?.outlineWidth, text:heading?.textContent ?? '' }; })()`,
  );
  assert.ok(activeEdit.active, 'a single CDP click starts inline editing on the demo heading');
  assert.equal(activeEdit.editing, true, 'the edited heading receives the runtime editing attribute');
  assert.equal(activeEdit.outlineStyle, 'solid', 'the active edit ring has a visible solid outline');
  assert.equal(activeEdit.outlineWidth, '2px', 'the active edit ring is two pixels wide');
  await send('Input.insertText', { text: 'X' });
  await sleep(200);
  assert.ok(
    await ev(
      `document.querySelector('main iframe')?.contentDocument?.querySelector('[data-blx-id="hero-h1"]')?.textContent.includes('X')`,
    ),
    'typing reaches the heading after one click',
  );
  await press('Escape');
  await sleep(500);
  assert.equal(
    await ev(
      `!!document.querySelector('main iframe')?.contentDocument?.querySelector('[data-blx-id="hero-h1"] [data-blx-richtext-root]')`,
    ),
    false,
    'Escape cancels and removes the inline editor',
  );
  assert.equal(
    await ev(
      `document.querySelector('main iframe')?.contentDocument?.querySelector('[data-blx-id="hero-h1"]')?.hasAttribute('data-blx-editing')`,
    ),
    false,
    'Escape removes the active edit ring attribute',
  );
  assert.equal(
    await ev(
      `document.querySelector('main iframe')?.contentDocument?.querySelector('[data-blx-id="hero-h1"]')?.textContent`,
    ),
    activeEdit.text,
    'Escape restores the original heading text',
  );
  await ev(
    `[...document.querySelectorAll('nav[aria-label="Structure"] [role="treeitem"]')].find((b) => b.textContent.includes('hero-h1')).click()`,
  );
  await sleep(300);
  const picked = await ev(
    `({ current: document.querySelector('nav[aria-label="Structure"] [role="treeitem"][aria-selected="true"]')?.textContent.trim(), inspector: document.querySelector('aside[aria-label="Inspector"]').textContent })`,
  );
  assert.ok(picked.current?.includes('hero-h1'), 'the clicked element is marked aria-current');
  assert.ok(picked.inspector.includes('hero-h1'), 'the visually hidden inspector live region announces the selection');
  assert.equal(
    await ev(`!!document.querySelector('[data-testid="selection-toolbar"]')`),
    true,
    'the selected element shows its toolbar before the background-click check',
  );
  const emptyCanvasPoint = await ev(`(() => {
    const frame=document.querySelector('main iframe'), doc=frame?.contentDocument, fr=frame?.getBoundingClientRect();
    if (!frame || !doc || !fr) return null;
    const root=doc.querySelector('#blx-canvas-root'); root?.scrollIntoView({block:'start'});
    for (const [x,y] of [[doc.documentElement.clientWidth-12,80],[12,80],[doc.documentElement.clientWidth-12,doc.documentElement.clientHeight-20],[12,doc.documentElement.clientHeight-20]]) {
      const target=doc.elementFromPoint(x,y);
      if (target && !target.closest('[data-blx-id]')) return {x:fr.left+frame.clientLeft+x,y:fr.top+frame.clientTop+y};
    }
    return null;
  })()`);
  assert.ok(emptyCanvasPoint, 'the canvas has a visible background point with no builder element ancestor');
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: emptyCanvasPoint.x, y: emptyCanvasPoint.y });
  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: emptyCanvasPoint.x,
    y: emptyCanvasPoint.y,
    button: 'left',
    clickCount: 1,
  });
  await send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: emptyCanvasPoint.x,
    y: emptyCanvasPoint.y,
    button: 'left',
    clickCount: 1,
  });
  await sleep(500);
  const emptySelection = await ev(
    `({ toolbar:!!document.querySelector('[data-testid="selection-toolbar"]'), inspector:document.querySelector('[data-testid="inspector-selection"]')?.textContent ?? '', editingChip:!!document.querySelector('[data-testid="canvas-hover-chip"]') })`,
  );
  assert.equal(emptySelection.toolbar, false, 'empty canvas click clears the selection toolbar');
  assert.match(
    emptySelection.inspector,
    /No element selected/i,
    'empty canvas click clears the inspector element chip',
  );
  assert.equal(emptySelection.editingChip, false, 'empty canvas click clears the hover chip');
  assert.equal(
    await ev(`!!document.querySelector('nav[aria-label="Structure"] [role="treeitem"][data-on-path]')`),
    false,
    'tree ancestors do not receive a selected-path highlight',
  );

  // Hover chrome follows a real pointer move into the iframe and stays out of the selected element toolbar.
  const pagesGeometry = await ev(
    `(() => { const c = document.querySelector('.blx-menu-trigger-content'); if (!c) return null; const mid = (el) => { const r = el.getBoundingClientRect(); return r.top + r.height / 2; }; const t = c.closest('.ed-menu-trigger'); return [...c.children].map(mid).concat(mid(t)); })()`,
  );
  assert.ok(pagesGeometry, 'the Pages trigger content exists');
  assert.ok(
    Math.max(...pagesGeometry) - Math.min(...pagesGeometry) <= 1,
    `Pages icon, label, chevron and trigger share one centre line (${JSON.stringify(pagesGeometry)})`,
  );
  await ev(
    `document.querySelector('main iframe')?.contentDocument?.querySelector('[data-blx-id="body-img"]')?.scrollIntoView({ block: 'center' })`,
  );
  await sleep(500);
  const hoverPoint = await ev(
    `(() => { const frame=document.querySelector('main iframe'), target=frame?.contentDocument?.querySelector('[data-blx-id="body-img"]'), fr=frame?.getBoundingClientRect(), r=target?.getBoundingClientRect(); return fr&&r ? {x:fr.left+frame.clientLeft+r.left+r.width/2,y:fr.top+frame.clientTop+r.top+r.height/2,label:target.getAttribute('data-blx-id')} : null; })()`,
  );
  assert.ok(hoverPoint, 'a non-selected canvas element has a measurable pointer target');
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: hoverPoint.x, y: hoverPoint.y });
  await sleep(250);
  const hoverChip = await ev(
    `(() => { const chip=document.querySelector('[data-testid="canvas-hover-chip"]'); if(!chip) return null; const r=chip.getBoundingClientRect(),s=getComputedStyle(chip); return {text:chip.textContent, bg:s.backgroundColor, pointer:s.pointerEvents, inside:r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight}; })()`,
  );
  assert.ok(hoverChip, 'hovering a non-selected element shows its editor chrome chip');
  assert.ok(hoverChip.text.includes('Image'), `chip includes the hovered element label (${hoverChip.text})`);
  assert.notEqual(hoverChip.bg, 'rgba(0, 0, 0, 0)', 'hover chip background is opaque');
  assert.equal(hoverChip.pointer, 'none', 'hover chip does not intercept pointer events');
  assert.equal(hoverChip.inside, true, 'hover chip stays inside the viewport');
  const selectedPoint = await ev(
    `(() => { const frame=document.querySelector('main iframe'), target=frame?.contentDocument?.querySelector('[data-blx-id="hero-h1"]'), fr=frame?.getBoundingClientRect(), r=target?.getBoundingClientRect(); return fr&&r ? {x:fr.left+frame.clientLeft+r.left+r.width/2,y:fr.top+frame.clientTop+r.top+r.height/2} : null; })()`,
  );
  assert.ok(selectedPoint, 'the selected canvas element has a measurable pointer target');
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: selectedPoint.x, y: selectedPoint.y });
  await sleep(200);
  assert.equal(
    await ev(`!!document.querySelector('[data-testid="canvas-hover-chip"]')`),
    false,
    'hovering the selected element hides the chip',
  );

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
    `(() => { const tab = [...document.querySelectorAll('aside[aria-label="Inspector"] [role=tab]')].find((item) => item.textContent.trim() === 'Content'); tab?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, ctrlKey: false })); })()`,
  );
  await sleep(400);
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
    const diagram = document.querySelector('.blx-box-model-diagram');
    const margin = diagram?.querySelector(':scope > .blx-box-model-layer-margin');
    const border = margin?.querySelector(':scope > .blx-box-model-layer-border');
    const padding = border?.querySelector(':scope > .blx-box-model-layer-padding');
    const content = padding?.querySelector(':scope > .blx-box-model-content');
    const focusedBoxInput = diagram?.querySelector('.blx-box-model-layer-padding .blx-box-model-block-start input');
    focusedBoxInput?.focus();
    const boxRects = [margin, border, padding, content].map((item) => {
      const rect = item?.getBoundingClientRect();
      return rect ? { x: rect.x, y: rect.y, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height } : null;
    });
    const sideRects = ['block-start', 'inline-end', 'block-end', 'inline-start'].map((side) => {
      const value = diagram?.querySelector('.blx-box-model-layer-padding .blx-box-model-' + side);
      const rect = value?.getBoundingClientRect();
      return rect ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height } : null;
    });
    const allValueRects = [...(diagram?.querySelectorAll('.blx-box-model-layer') ?? [])].flatMap((layer) =>
      [...layer.querySelectorAll(':scope > .blx-box-model-value')].map((item) => {
        const r = item.getBoundingClientRect();
        return {
          layer: layer.classList.contains('blx-box-model-layer-margin') ? 'margin' : layer.classList.contains('blx-box-model-layer-border') ? 'border' : 'padding',
          side: [...item.classList].find((name) => /^blx-box-model-(block-start|inline-end|block-end|inline-start|border-width)$/.test(name))?.replace('blx-box-model-', ''),
          left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height,
        };
      }),
    );
    const controls = document.querySelector('.blx-box-model-controls');
    const controlRects = [...(controls?.querySelectorAll('button, select, .blx-box-model-legend') ?? [])].map((item) => { const r = item.getBoundingClientRect(); return { left:r.left,right:r.right,top:r.top,bottom:r.bottom }; });
    const captions = [...(diagram?.querySelectorAll('.blx-box-model-caption') ?? [])].map((item) => { const r=item.getBoundingClientRect(); return { left:r.left,right:r.right,top:r.top,bottom:r.bottom }; });
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
      boxRects, sideRects, controlRects, captions, allValueRects,
      controlsRect: controls ? (() => { const r=controls.getBoundingClientRect(); return { top:r.top,bottom:r.bottom }; })() : null,
      diagramRect: diagram ? (() => { const r=diagram.getBoundingClientRect(); return { left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height }; })() : null,
      wrapWidth: document.querySelector('.blx-box-model-wrap')?.getBoundingClientRect().width,
      contentText: content?.textContent?.trim() ?? '',
      focusedInput: focusedBoxInput ? (() => { const r=focusedBoxInput.getBoundingClientRect(); const s=getComputedStyle(focusedBoxInput); const rgb=(v)=>v.match(/[0-9.]+/g)?.slice(0,3).map(Number) ?? [0,0,0]; const lum=(v)=>{const c=rgb(v).map((n)=>{n/=255;return n<=0.04045?n/12.92:((n+0.055)/1.055)**2.4});return .2126*c[0]+.7152*c[1]+.0722*c[2]}; const a=lum(s.color),b=lum(s.backgroundColor); return { left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,fontSize:parseFloat(s.fontSize),color:s.color,background:s.backgroundColor,contrast:(Math.max(a,b)+.05)/(Math.min(a,b)+.05) }; })() : null,
      segmentWidths: segments,
      stickyTabs: getComputedStyle(document.querySelector('.blx-inspector-tabs [role="tablist"]')).position,
      layoutExpanded: document.querySelector('button[aria-label="Toggle Layout"]')?.getAttribute('aria-expanded'),
      effectsExpanded: document.querySelector('button[aria-label="Toggle Border & Effects"]')?.getAttribute('aria-expanded'),
      typographyExpanded: document.querySelector('button[aria-label="Toggle Typography"]')?.getAttribute('aria-expanded'),
      colorExpanded: document.querySelector('button[aria-label="Toggle Color"]')?.getAttribute('aria-expanded'),
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
  assert.equal(inspectorLayout.stickyTabs, 'sticky', 'inspector tab bar remains sticky');
  assert.equal(inspectorLayout.typographyExpanded, 'true', 'Typography starts open');
  assert.equal(inspectorLayout.colorExpanded, 'true', 'Color starts open');
  assert.equal(inspectorLayout.unitValue, 'rem', 'font size unit selector is rem');
  assert.deepEqual(inspectorLayout.range, [0.5, 6], 'font size slider uses the rem range');
  assert.ok(inspectorLayout.thumbWithinTrack, 'slider thumb stays inside the track');
  assert.ok(
    inspectorLayout.thumbFraction >= 0.25 && inspectorLayout.thumbFraction <= 0.6,
    `rem thumb reflects 2.75 (${JSON.stringify(inspectorLayout)})`,
  );
  assert.ok(inspectorLayout.colorRight <= inspectorLayout.panelRight + 1, 'color token field stays within the panel');
  assert.ok(inspectorLayout.gradientTopDelta <= 8, 'gradient toggle and label share a row');
  assert.equal(inspectorLayout.boxRects.length, 4, 'box model has margin, border, padding and content rectangles');
  assert.ok(inspectorLayout.boxRects.every(Boolean), 'all box model layer rectangles are measurable');
  assert.ok(Math.abs(inspectorLayout.diagramRect.height - 228) <= 2, 'box model diagram is 228px tall');
  assert.ok(Math.abs(inspectorLayout.boxRects[0].height - 228) <= 1, 'margin fills the diagram height');
  assert.ok(
    Math.abs(inspectorLayout.boxRects[0].width - inspectorLayout.diagramRect.width) <= 1,
    'margin fills diagram width',
  );
  assert.ok(
    Math.abs(inspectorLayout.diagramRect.width - inspectorLayout.wrapWidth) <= 1,
    'diagram equals panel inner width',
  );
  for (let index = 0; index < 3; index += 1) {
    const outer = inspectorLayout.boxRects[index];
    const inner = inspectorLayout.boxRects[index + 1];
    for (const inset of [
      inner.left - outer.left,
      outer.right - inner.right,
      inner.top - outer.top,
      outer.bottom - inner.bottom,
    ]) {
      assert.ok(Math.abs(inset - 32) <= 1, `box model band ${index + 1} is 32px on each side (${inset})`);
    }
  }
  assert.equal(inspectorLayout.sideRects.length, 4, 'padding exposes four logical side values');
  assert.ok(inspectorLayout.sideRects.every(Boolean), 'all four side value positions are measurable');
  for (const rect of inspectorLayout.sideRects) assert.ok(Math.abs(rect.height - 24) <= 1, 'side cells are 24px high');
  assert.ok(
    Math.abs(inspectorLayout.sideRects[0].width - 44) <= 1 && Math.abs(inspectorLayout.sideRects[2].width - 44) <= 1,
    'top and bottom cells are 44px wide',
  );
  assert.ok(
    inspectorLayout.sideRects[1].width >= 28 &&
      inspectorLayout.sideRects[1].width <= 36 &&
      inspectorLayout.sideRects[3].width >= 28 &&
      inspectorLayout.sideRects[3].width <= 36,
    'start and end cells are 28–36px wide',
  );
  assert.ok(
    inspectorLayout.focusedInput.width >= 52 &&
      Math.abs(inspectorLayout.focusedInput.height - 28) <= 1 &&
      inspectorLayout.focusedInput.fontSize >= 13,
    'focused input is 52px minimum, 28px high and 13px text',
  );
  assert.ok(inspectorLayout.focusedInput.contrast >= 4.5, 'focused input text contrast is at least 4.5:1');
  assert.ok(
    inspectorLayout.focusedInput.left >= inspectorLayout.boxRects[0].left &&
      inspectorLayout.focusedInput.right <= inspectorLayout.boxRects[0].right &&
      inspectorLayout.focusedInput.top >= inspectorLayout.boxRects[0].top &&
      inspectorLayout.focusedInput.bottom <= inspectorLayout.boxRects[0].bottom,
    'editing input stays inside the margin layer rect',
  );
  for (const cell of inspectorLayout.allValueRects) {
    const layer = inspectorLayout.boxRects[cell.layer === 'margin' ? 0 : cell.layer === 'border' ? 1 : 2];
    const band =
      cell.side === 'block-start' || cell.side === 'border-width'
        ? { left: layer.left, right: layer.right, top: layer.top, bottom: layer.top + 32 }
        : cell.side === 'block-end'
          ? { left: layer.left, right: layer.right, top: layer.bottom - 32, bottom: layer.bottom }
          : cell.side === 'inline-end'
            ? { left: layer.right - 32, right: layer.right, top: layer.top, bottom: layer.bottom }
            : { left: layer.left, right: layer.left + 32, top: layer.top, bottom: layer.bottom };
    const clearance = cell.side === 'inline-start' || cell.side === 'inline-end' ? 2 : 3;
    assert.ok(
      Math.abs(cell.height - 24) <= 1 &&
        cell.left >= band.left + clearance &&
        cell.right <= band.right - clearance &&
        cell.top >= band.top + 3 &&
        cell.bottom <= band.bottom - 3,
      `${cell.layer} ${cell.side} cell fits its band`,
    );
  }
  const paddingRect = inspectorLayout.boxRects[2];
  for (let index = 0; index < 4; index += 1) {
    const value = inspectorLayout.sideRects[index];
    const band =
      index === 0
        ? { left: paddingRect.left, right: paddingRect.right, top: paddingRect.top, bottom: paddingRect.top + 32 }
        : index === 1
          ? { left: paddingRect.right - 32, right: paddingRect.right, top: paddingRect.top, bottom: paddingRect.bottom }
          : index === 2
            ? {
                left: paddingRect.left,
                right: paddingRect.right,
                top: paddingRect.bottom - 32,
                bottom: paddingRect.bottom,
              }
            : {
                left: paddingRect.left,
                right: paddingRect.left + 32,
                top: paddingRect.top,
                bottom: paddingRect.bottom,
              };
    const clearance = index === 1 || index === 3 ? 2 : 3;
    assert.ok(
      value.left >= band.left + clearance &&
        value.right <= band.right - clearance &&
        value.top >= band.top + 3 &&
        value.bottom <= band.bottom - 3,
      `side cell ${index + 1} fits its band`,
    );
  }
  assert.equal(
    inspectorLayout.boxRects[3].width >= 56 && inspectorLayout.boxRects[3].height >= 28,
    true,
    'content meets 56 × 28px minimum',
  );
  assert.ok(
    Math.abs(
      (inspectorLayout.boxRects[3].left + inspectorLayout.boxRects[3].right) / 2 -
        (paddingRect.left + paddingRect.right) / 2,
    ) <= 2,
    'content is horizontally centered',
  );
  assert.ok(
    Math.abs(
      (inspectorLayout.boxRects[3].top + inspectorLayout.boxRects[3].bottom) / 2 -
        (paddingRect.top + paddingRect.bottom) / 2,
    ) <= 2,
    'content is vertically centered',
  );
  assert.match(inspectorLayout.contentText, /×/, 'content displays auto dimensions');
  assert.equal(inspectorLayout.captions.length, 0, 'diagram has no colliding captions');
  assert.ok(
    inspectorLayout.controlRects.every((rect, index, all) =>
      all
        .slice(index + 1)
        .every(
          (next) =>
            rect.right <= next.left || next.right <= rect.left || rect.bottom <= next.top || next.bottom <= rect.top,
        ),
    ),
    'legend and controls do not overlap',
  );
  assert.ok(
    inspectorLayout.segmentWidths.length >= 4 &&
      Math.max(...inspectorLayout.segmentWidths) - Math.min(...inspectorLayout.segmentWidths) <= 1,
    `segmented options have equal widths (${JSON.stringify(inspectorLayout.segmentWidths)})`,
  );
  const typographyToggle = `document.querySelector('button[aria-label="Toggle Typography"]')`;
  const before = await ev(`${typographyToggle}?.getAttribute('aria-expanded')`);
  await ev(`${typographyToggle}?.focus()`);
  await ev(`${typographyToggle}?.click()`);
  assert.equal(
    await ev(`document.activeElement === ${typographyToggle}`),
    true,
    'section focus stays on its toggle while collapsing',
  );
  assert.equal(
    await ev(`document.activeElement === ${typographyToggle}`),
    true,
    'section focus stays on its toggle while collapsing',
  );
  const collapsedSemantics = await ev(
    `(() => { const panel = document.querySelector('#inspector-section-style-typography-panel'); return { inert: panel?.inert, hidden: panel?.hidden, ariaHidden: panel?.getAttribute('aria-hidden') }; })()`,
  );
  assert.ok(
    collapsedSemantics.inert && collapsedSemantics.ariaHidden === 'true',
    'collapsed content is immediately inert and hidden from accessibility APIs',
  );
  await sleep(300);
  const collapsed = await ev(`${typographyToggle}?.getAttribute('aria-expanded')`);
  assert.equal(
    await ev(`document.querySelector('#inspector-section-style-typography-panel')?.hidden`),
    true,
    'collapsed content is hidden after transition',
  );
  await ev(`${typographyToggle}?.click()`);
  await sleep(300);
  const expanded = await ev(`${typographyToggle}?.getAttribute('aria-expanded')`);
  const sectionState = { before, collapsed, expanded };
  assert.deepEqual(
    sectionState,
    { before: 'true', collapsed: 'false', expanded: 'true' },
    'Typography section toggles with aria-expanded',
  );
  assert.equal(
    await ev(`document.activeElement === ${typographyToggle}`),
    true,
    'section focus stays on its toggle after collapse',
  );
  assert.equal(
    await ev(`document.activeElement === ${typographyToggle}`),
    true,
    'section focus stays on its toggle after collapse',
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

  // Box model keyboard editing uses the responsive style command and participates in Undo.
  await ev(
    `(() => { const tab = [...document.querySelectorAll('[role=tab]')].find((item) => item.textContent.trim() === 'Style'); tab?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, ctrlKey: false })); })()`,
  );
  await sleep(300);
  await ev(
    `(() => { const toggle = document.querySelector('button[aria-label="Toggle Box model"]'); if (toggle?.getAttribute('aria-expanded') === 'false') toggle.click(); })()`,
  );
  await sleep(250);
  const paddingBefore = await ev(
    `(() => { const frame = document.querySelector('main iframe'); const heading = frame?.contentDocument?.querySelector('h1'); return heading && frame?.contentWindow ? frame.contentWindow.getComputedStyle(heading).paddingTop : null; })()`,
  );
  const paddingInput = await ev(
    `(() => { const input = document.querySelector('aside[aria-label="Inspector"] input[aria-label="Padding Top"]'); input?.focus(); return !!input; })()`,
  );
  assert.equal(paddingInput, true, 'box model padding top input receives focus');
  await send('Input.insertText', { text: '16' });
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await sleep(1500);
  const paddingAfter = await ev(
    `(() => { const frame = document.querySelector('main iframe'); const heading = frame?.contentDocument?.querySelector('h1'); return heading && frame?.contentWindow ? frame.contentWindow.getComputedStyle(heading).paddingTop : null; })()`,
  );
  assert.notEqual(paddingAfter, paddingBefore, 'keyboard input changes canvas padding-top');
  await ev(`document.querySelector('button[aria-label="Undo"]')?.click()`);
  await sleep(1500);
  const paddingUndone = await ev(
    `(() => { const frame = document.querySelector('main iframe'); const heading = frame?.contentDocument?.querySelector('h1'); return heading && frame?.contentWindow ? frame.contentWindow.getComputedStyle(heading).paddingTop : null; })()`,
  );
  assert.equal(paddingUndone, paddingBefore, 'one Undo restores the original canvas padding-top');

  const narrowWidget = await ev(`(() => {
    const panel = document.querySelector('.blx-panel-right');
    const widget = document.querySelector('.blx-box-model-wrap');
    if (!panel || !widget) return null;
    const layouts = [320, 380].map((width) => {
      panel.style.inlineSize = width + 'px'; panel.style.width = width + 'px';
      const diagram = widget.querySelector('.blx-box-model-diagram');
      const layers = [...widget.querySelectorAll('.blx-box-model-layer-margin, .blx-box-model-layer-border, .blx-box-model-layer-padding, .blx-box-model-content')];
      const rect = (element) => { const r=element.getBoundingClientRect(); return { left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height }; };
      return { panelWidth: width, wrapWidth: widget.getBoundingClientRect().width, diagram: rect(diagram), layers: layers.map(rect), scrollWidth: widget.scrollWidth, clientWidth: widget.clientWidth };
    });
    return layouts;
  })()`);
  assert.ok(narrowWidget, 'box model is measurable at 260px and 320px inspector inner widths');
  for (const [index, layout] of narrowWidget.entries()) {
    const expectedInnerWidth = index === 0 ? 260 : 320;
    assert.ok(Math.abs(layout.wrapWidth - expectedInnerWidth) <= 1, `panel inner width is ${expectedInnerWidth}px`);
    assert.ok(
      layout.scrollWidth <= layout.clientWidth,
      `box model has no horizontal overflow at ${layout.panelWidth}px (${JSON.stringify(layout)})`,
    );
    assert.ok(Math.abs(layout.diagram.height - 228) <= 2, `diagram remains 228px high at ${layout.panelWidth}px`);
    assert.ok(
      Math.abs(layout.diagram.width - layout.wrapWidth) <= 1,
      `diagram fills panel inner width at ${layout.panelWidth}px`,
    );
    assert.ok(
      Math.abs(layout.layers[0].height - layout.diagram.height) <= 1,
      `margin fills diagram at ${layout.panelWidth}px`,
    );
    assert.ok(
      layout.layers[3].width >= 56 && layout.layers[3].height >= 28,
      `content keeps its minimum dimensions at ${layout.panelWidth}px`,
    );
    for (let layer = 0; layer < 3; layer += 1) {
      const outer = layout.layers[layer];
      const inner = layout.layers[layer + 1];
      for (const inset of [
        inner.left - outer.left,
        outer.right - inner.right,
        inner.top - outer.top,
        outer.bottom - inner.bottom,
      ]) {
        assert.ok(Math.abs(inset - 32) <= 1, `32px bands remain fixed at inner width ${expectedInnerWidth}px`);
      }
    }
  }
  for (const section of ['Layout', 'Border & Effects']) {
    await ev(
      `(() => { const b = document.querySelector('button[aria-label=${JSON.stringify(`Toggle ${section}`)}]'); if (b && b.getAttribute('aria-expanded') === 'false') b.click(); })()`,
    );
    await sleep(300);
  }
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
        titleTooltips: root ? root.querySelectorAll('[title]').length : 0,
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
      childIcon: iconLeft(child), lineWidth: Number.parseFloat(guideLine?.borderInlineStartWidth ?? '0px'), guideColor, textColor,
      hasPathHighlight: rows.some((row) => row.hasAttribute('data-on-path')),
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
  assert.equal(initialStageLayout.hasPathHighlight, false, 'ancestor rows stay free of selected-path highlighting');
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
  assert.equal(canvas.titleTooltips, 0, 'the canvas emits no native title-based tooltips');
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
  const resizeId = 'hero-con';
  await ev(`document.querySelector('[role="treeitem"][data-id="${resizeId}"]')?.click()`);
  await sleep(450);
  const layoutExpanded = await ev(
    `document.querySelector('[aria-label="Toggle Layout"]')?.getAttribute('aria-expanded')`,
  );
  if (layoutExpanded === 'false') await ev(`document.querySelector('[aria-label="Toggle Layout"]')?.click()`);
  const resizeStart = await ev(`(() => {
    const frame = document.querySelector('main iframe');
    const element = frame.contentDocument.querySelector('[data-blx-id="' + ${JSON.stringify(resizeId)} + '"]');
    const handle = document.querySelector('[data-testid="selection-handles"] [data-handle="e"]');
    const r = handle?.getBoundingClientRect();
    return element && r ? { width: parseFloat(getComputedStyle(element).width), x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  })()`);
  assert.ok(
    resizeStart && Number.isFinite(resizeStart.width),
    'the selected interactive demo element has a measurable width handle',
  );
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: resizeStart.x, y: resizeStart.y });
  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: resizeStart.x,
    y: resizeStart.y,
    button: 'left',
    clickCount: 1,
  });
  for (let step = 1; step <= 8; step += 1) {
    await send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: resizeStart.x + step * 10,
      y: resizeStart.y,
      button: 'left',
      buttons: 1,
    });
  }
  await send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: resizeStart.x + 80,
    y: resizeStart.y,
    button: 'left',
    clickCount: 1,
  });
  await sleep(1900);
  const resizedWidth = await ev(
    `parseFloat(getComputedStyle(document.querySelector('main iframe').contentDocument.querySelector('[data-blx-id="' + ${JSON.stringify(resizeId)} + '"]')).width)`,
  );
  assert.ok(
    Math.abs(resizedWidth - resizeStart.width - 80) <= 2,
    `a real 80px canvas drag changes computed width by 80px (${resizeStart.width} -> ${resizedWidth})`,
  );
  await ev(
    `(() => { const tab = [...document.querySelectorAll('aside[aria-label="Inspector"] [role=tab]')].find((item) => item.textContent.trim() === 'Style'); tab?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, ctrlKey: false })); })()`,
  );
  await sleep(400);
  await ev(
    `(() => { const b = document.querySelector('button[aria-label="Toggle Layout"]'); if (b && b.getAttribute('aria-expanded') === 'false') b.click(); })()`,
  );
  await sleep(400);
  assert.equal(
    await ev(`document.querySelector('#style-${resizeId}-width-custom')?.value`),
    String(Math.round(resizedWidth)),
    'the inspector Width control follows the resized custom value',
  );
  assert.ok(
    (await ev(`document.querySelector('.blx-box-model-content')?.textContent`)).startsWith(
      `${String(Math.round(resizedWidth))}px ×`,
    ),
    'the box model content follows the resized width',
  );
  await clickReal('button[aria-label="Undo"]');
  await sleep(1900);
  const undoneWidth = await ev(
    `parseFloat(getComputedStyle(document.querySelector('main iframe').contentDocument.querySelector('[data-blx-id="' + ${JSON.stringify(resizeId)} + '"]')).width)`,
  );
  assert.ok(
    Math.abs(undoneWidth - resizeStart.width) <= 2,
    `one Undo restores the original width (${resizeStart.width} -> ${undoneWidth})`,
  );
  const cancelStart = await ev(
    `(() => { const h = document.querySelector('[data-testid="selection-handles"] [data-handle="e"]')?.getBoundingClientRect(); return h ? { x: h.left + h.width / 2, y: h.top + h.height / 2 } : null; })()`,
  );
  assert.ok(cancelStart, 'the width handle remains available after undo');
  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: cancelStart.x,
    y: cancelStart.y,
    button: 'left',
    clickCount: 1,
  });
  await send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: cancelStart.x + 45,
    y: cancelStart.y,
    button: 'left',
    buttons: 1,
  });
  await press('Escape');
  await send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: cancelStart.x + 45,
    y: cancelStart.y,
    button: 'left',
    clickCount: 1,
  });
  await sleep(400);
  const cancelledWidth = await ev(
    `parseFloat(getComputedStyle(document.querySelector('main iframe').contentDocument.querySelector('[data-blx-id="' + ${JSON.stringify(resizeId)} + '"]')).width)`,
  );
  assert.ok(
    Math.abs(cancelledWidth - resizeStart.width) <= 2,
    'Escape cancels a resize preview without changing the element',
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
    `document.querySelector('[aria-label="Selected element path"] .blx-breadcrumb-item')?.textContent.trim().split(/\\s+/).pop()`,
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

  // Layout parity: compare the same published demo document in a separate frontend target.
  // Earlier steps edited the local draft (alignment, spacing); reload so the canvas shows the saved working document,
  // which `pnpm dev:demo` keeps equal to the published one.
  await nav(editorUrl, 3000);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const ready = await frameInfo();
    if (ready.found && ready.elements > 0) break;
    await sleep(250);
  }
  // The frontend runs in its own tab with its own DevTools socket (Target.* commands are not available on a page socket).
  const parityTab = await (
    await fetch(`http://127.0.0.1:9334/json/new?${encodeURIComponent(`${SITE}/builder-demo/`)}`, { method: 'PUT' })
  ).json();
  const frontWs = new WebSocket(parityTab.webSocketDebuggerUrl);
  await new Promise((resolve) => (frontWs.onopen = resolve));
  let frontSeq = 0;
  const frontPending = new Map();
  frontWs.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && frontPending.has(message.id)) {
      frontPending.get(message.id)(message);
      frontPending.delete(message.id);
    }
  };
  const frontSend = (method, params = {}) =>
    new Promise((resolve) => {
      const id = (frontSeq += 1);
      frontPending.set(id, resolve);
      frontWs.send(JSON.stringify({ id, method, params }));
    });
  await frontSend('Page.enable');
  await frontSend('Runtime.enable');
  await frontSend('Emulation.setDeviceMetricsOverride', {
    width: 1200,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const frontEval = async (expression) => {
    const result = await frontSend('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    assert.ok(
      !result.result?.exceptionDetails,
      `frontend parity evaluation succeeded: ${JSON.stringify(result.result?.exceptionDetails)}`,
    );
    return result.result?.result?.value;
  };
  const collectParity = (doc) => {
    const section = doc.querySelector(
      '.blx-page [data-blx-type*="section"], .blx-page section, .blx-page [data-blx-id]',
    );
    const container = section?.querySelector('[data-blx-max-width], [data-blx-type*="container"]') ?? section;
    const heading = section?.querySelector('h1, h2, h3');
    const text = section?.querySelector('p');
    const button = section?.querySelector('a.blx-button, button, .blx-button');
    return [section, container, heading, text, button].map((node) => {
      if (!node) return null;
      const style = doc.defaultView.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return {
        width: rect.width,
        left: rect.left,
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        margin: [style.marginTop, style.marginRight, style.marginBottom, style.marginLeft],
        padding: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft],
        backgroundColor: style.backgroundColor,
        color: style.color,
      };
    });
  };
  const canvasParity = `(${collectParity.toString()})(document.querySelector('main iframe').contentDocument)`;
  const frontendParity = `(${collectParity.toString()})(document)`;
  for (let attempt = 0; attempt < 25; attempt += 1) {
    try {
      if (await frontEval(`!!document.querySelector('.blx-page[data-blx-document]')`)) break;
    } catch {
      await sleep(200);
      continue;
    }
    await sleep(200);
  }
  assert.equal(
    await frontEval(`!!document.querySelector('.blx-page[data-blx-document]')`),
    true,
    'the published demo page opened in the frontend target',
  );
  const loadedFamilies = (doc) =>
    [...doc.fonts]
      .filter((font) => font.status === 'loaded')
      .map((font) => font.family.replace(/["']/g, '').trim())
      .filter((family) => family && family.toLowerCase() !== 'dashicons');
  const canvasFontFamilies = await ev(
    `document.querySelector('main iframe').contentDocument.fonts.ready.then(() => (${loadedFamilies.toString()})(document.querySelector('main iframe').contentDocument))`,
  );
  const frontendFontFamilies = await frontEval(
    `document.fonts.ready.then(() => (${loadedFamilies.toString()})(document))`,
  );
  assert.ok(
    frontendFontFamilies.every((family) => canvasFontFamilies.includes(family)),
    `canvas loads every frontend font family (${JSON.stringify({ canvasFontFamilies, frontendFontFamilies })})`,
  );
  const parity = async (label, width) => {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
    await ev(
      `[...document.querySelectorAll('[role=radio]')].find((b) => b.getAttribute('aria-label') === ${JSON.stringify(label)}).click()`,
    );
    await sleep(500);
    const canvasViewport = await frameInfo();
    await frontSend('Emulation.setDeviceMetricsOverride', {
      width: Math.round(canvasViewport.width),
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await sleep(350);
    const frameDoc = await ev(canvasParity);
    const front = await frontEval(frontendParity);
    assert.ok(
      Array.isArray(frameDoc) && frameDoc.length === 5,
      `${label} canvas exposes hero, container, heading, text and button`,
    );
    assert.ok(
      Array.isArray(front) && front.length === 5,
      `${label} frontend exposes hero, container, heading, text and button`,
    );
    for (let i = 0; i < 5; i += 1) {
      assert.ok(frameDoc[i] && front[i], `${label} parity target ${i} exists in both documents`);
      for (const key of ['width', 'left'])
        assert.ok(
          Math.abs(frameDoc[i][key] - front[i][key]) <= 2,
          `${label} target ${i} ${key} is within 2px (${frameDoc[i][key]} vs ${front[i][key]})`,
        );
      for (const key of ['fontSize', 'lineHeight'])
        assert.equal(frameDoc[i][key], front[i][key], `${label} target ${i} ${key} matches exactly`);
      for (const key of ['margin', 'padding'])
        assert.deepEqual(frameDoc[i][key], front[i][key], `${label} target ${i} ${key} matches`);
    }
    for (const [appearance, mode] of [
      ['Light', 'light'],
      ['Dark', 'dark'],
    ]) {
      await ev(
        `[...document.querySelectorAll('[role=radiogroup][aria-label="Preview appearance"] [role=radio]')].find((b) => b.textContent.trim() === ${JSON.stringify(appearance)}).click()`,
      );
      await frontEval(`document.documentElement.setAttribute('data-theme', ${JSON.stringify(mode)}); true`);
      await sleep(500);
      const canvasColors = await ev(canvasParity);
      const frontColors = await frontEval(frontendParity);
      for (let i = 0; i < 5; i += 1) {
        for (const key of ['backgroundColor', 'color'])
          assert.equal(canvasColors[i][key], frontColors[i][key], `${label} ${appearance} target ${i} ${key} matches`);
      }
    }
    await ev(
      `[...document.querySelectorAll('[role=radiogroup][aria-label="Preview appearance"] [role=radio]')].find((b) => b.textContent.trim() === 'Light').click()`,
    );
    await frontEval(`document.documentElement.setAttribute('data-theme', 'light'); true`);
    return { frameDoc, front };
  };
  for (const [label, width] of [
    ['Desktop', 1200],
    ['Tablet', 768],
    ['Mobile', 375],
  ])
    await parity(label, width);
  frontWs.close();
  await fetch(`http://127.0.0.1:9334/json/close/${parityTab.id}`);
  await send('Emulation.setDeviceMetricsOverride', {
    width: savedMetrics.width,
    height: savedMetrics.height,
    deviceScaleFactor: 1,
    mobile: false,
  });
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
  const readMotion = async (preference) => {
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: preference }] });
    await sleep(300);
    return ev(`(() => {
      const root = document.querySelector('.blx-editor');
      const probe = document.createElement('div');
      probe.innerHTML = '<section class="blx-inspector-section"><h3 class="blx-inspector-section-heading"><button>Probe</button></h3><div role="region"></div></section><div class="ed-menu"></div><div class="blx-selection-toolbar"></div>';
      root.appendChild(probe);
      const section = probe.querySelector('.blx-inspector-section-heading button');
      const menu = probe.querySelector('.ed-menu');
      const toolbar = probe.querySelector('.blx-selection-toolbar');
      const duration = (element, property) => element ? getComputedStyle(element)[property] : null;
      const result = { mirror: root?.getAttribute('data-reduced-motion'), section: duration(section, 'transitionDuration'), menu: duration(menu, 'animationDuration'), toolbar: duration(toolbar, 'animationDuration') };
      probe.remove();
      return result;
    })()`);
  };
  const floating = await ev(`(() => {
    const root = document.querySelector('.blx-editor');
    const probe = document.createElement('div');
    probe.innerHTML = '<div class="blx-selection-toolbar"></div><div class="blx-selection-menu"></div>';
    root.appendChild(probe);
    const result = [...probe.children].map((el) => getComputedStyle(el).backgroundColor);
    probe.remove();
    return result;
  })()`);
  for (const background of floating) {
    assert.ok(
      !/rgba\(.*, 0\)$|^transparent$/.test(background),
      `canvas floating toolbar and menu are opaque (${background})`,
    );
  }
  const reduced = await readMotion('reduce');
  assert.equal(reduced.mirror, 'true', 'reduced-motion preference is mirrored on the root');
  for (const [name, value] of Object.entries(reduced).filter(([key]) => key !== 'mirror')) {
    if (value !== null)
      assert.ok(
        value.split(',').every((duration) => parseFloat(duration) <= 0.01),
        `${name} reduced: ${value}`,
      );
  }
  const standard = await readMotion('no-preference');
  assert.equal(standard.mirror, 'false', 'normal-motion preference is mirrored on the root');
  for (const [name, value] of Object.entries(standard).filter(([key]) => key !== 'mirror')) {
    if (value !== null)
      assert.ok(
        value.split(',').every((duration) => parseFloat(duration) > 0 && parseFloat(duration) <= 0.3),
        `${name} bounded: ${value}`,
      );
  }
  await waitForMotion();
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
  // Rich text editing (BWB-135 stage 2A): a double click mounts the lazily loaded Tiptap engine inside the heading.
  await nav(editorUrl, 3000);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const ready = await frameInfo();
    if (ready.found && ready.elements > 0) break;
    await sleep(250);
  }
  const modifier = (await ev(`/Mac|iPhone|iPad/.test(navigator.platform)`)) ? 4 : 2;
  const headingPoint = async () =>
    ev(
      `(() => { const f = document.querySelector('main iframe'); const h = f.contentDocument.querySelector('[data-blx-id="hero-h1"]'); const r = h.getBoundingClientRect(); const fr = f.getBoundingClientRect(); return { x: fr.left + r.left + r.width / 2, y: fr.top + r.top + r.height / 2 }; })()`,
    );
  const doubleClickHeading = async () => {
    const point = await headingPoint();
    for (const count of [1, 2]) {
      await send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: point.x,
        y: point.y,
        button: 'left',
        clickCount: count,
      });
      await send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: point.x,
        y: point.y,
        button: 'left',
        clickCount: count,
      });
      await sleep(120); // a human double click: the first click already started the edit session
    }
    await sleep(2500);
  };
  const headingEditable = () =>
    ev(
      `!!document.querySelector('main iframe').contentDocument.querySelector('[data-blx-id="hero-h1"] [contenteditable="true"]')`,
    );
  const chord = async (key, code, keyCode) => {
    await send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key,
      code,
      modifiers: modifier,
      windowsVirtualKeyCode: keyCode,
    });
    await send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key,
      code,
      modifiers: modifier,
      windowsVirtualKeyCode: keyCode,
    });
  };
  const headingText = () =>
    ev(
      `document.querySelector('main iframe').contentDocument.querySelector('[data-blx-id="hero-h1"]')?.textContent.trim()`,
    );
  const originalHeading = await headingText();
  let demoRestoreNeeded = true;
  const waitForSaveState = async (state) => {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const found = await ev(`document.querySelector('.blx-saved')?.dataset.saveState`);
      if (found === state) return;
      await sleep(250);
    }
    throw new Error(`timed out waiting for save state ${state}`);
  };
  const replaceHeadingInline = async (value) => {
    await doubleClickHeading();
    await chord('a', 'KeyA', 65);
    await send('Input.insertText', { text: value });
    await sleep(300);
    await ev(
      `[...document.querySelectorAll('nav[aria-label="Structure"] [role="treeitem"]')].find((row) => row.dataset.id === 'hero-txt')?.click()`,
    );
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (!(await headingEditable())) return;
      await sleep(100);
    }
    throw new Error('timed out waiting for the inline heading edit to commit');
  };
  restoreDemoHeading = async () => {
    if (!demoRestoreNeeded) return;
    try {
      await nav(editorUrl, 2500);
      for (let attempt = 0; attempt < 40; attempt += 1) {
        if (await headingText()) break;
        await sleep(250);
      }
      if ((await headingText()) !== originalHeading) {
        await replaceHeadingInline(originalHeading);
        await waitForSaveState('dirty');
        const button = await ev(
          `(() => [...document.querySelectorAll('button')].find((item) => /^(Save Draft|Concept opslaan)$/.test(item.getAttribute('aria-label') ?? ''))?.getAttribute('aria-label'))()`,
        );
        assert.ok(button, 'Save Draft button is available for restoring the original heading');
        await clickReal(`button[aria-label=${JSON.stringify(button)}]`);
        await waitForSaveState('saved');
      }
      const publishControl = await ev(
        `(() => [...document.querySelectorAll('.blx-header button')].find((item) => /Publish|Publiceren/.test(item.getAttribute('aria-label') ?? ''))?.getAttribute('aria-label'))()`,
      );
      const publishDisabled = await ev(
        `(() => [...document.querySelectorAll('.blx-header button')].find((item) => /Publish|Publiceren/.test(item.getAttribute('aria-label') ?? ''))?.getAttribute('aria-disabled'))()`,
      );
      if (publishControl && publishDisabled !== 'true') {
        await clickReal(`button[aria-label=${JSON.stringify(publishControl)}]`);
        if (await ev(`!!document.querySelector('[role="dialog"]')`)) {
          await clickReal(`[role="dialog"] button:not([aria-label])`);
          for (let attempt = 0; attempt < 80; attempt += 1) {
            if (!(await ev(`!!document.querySelector('[role="dialog"]')`))) break;
            await sleep(250);
          }
        }
      }
      await nav(editorUrl, 2500);
      assert.equal(await headingText(), originalHeading, 'cleanup restores the original stored demo heading');
      const published = execFileSync('curl', ['-sk', `${SITE}/builder-demo/`], { encoding: 'utf8' });
      assert.ok(published.includes(originalHeading), 'cleanup restores the original anonymous published page');
      demoRestoreNeeded = false;
    } catch (error) {
      console.error(`Best effort demo heading restoration failed: ${error.message}`);
    }
  };
  const richProblemsBefore = problems.length;
  await doubleClickHeading();
  assert.equal(await headingEditable(), true, 'a double click starts an inline edit session in the heading');
  const richScripts = await ev(
    `[...document.querySelector('main iframe').contentDocument.querySelectorAll('script[src*="richtext.js"]')].map((script) => script.nonce !== '')`,
  );
  assert.deepEqual(richScripts, [true], 'the editor script is loaded exactly once, with the per-response nonce');
  const richProblems = problems
    .slice(richProblemsBefore)
    .filter(
      (entry) => !/Executing inline (script|event handler) violates the following Content Security Policy/.test(entry),
    );
  assert.deepEqual(richProblems, [], 'loading the editor script causes no CSP violation or console error');
  // Escape cancels and restores the original content.
  await chord('a', 'KeyA', 65);
  await send('Input.insertText', { text: 'Cancelled heading text' });
  await sleep(300);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(1500);
  assert.equal(await headingEditable(), false, 'Escape ends the edit session');
  assert.equal(await headingText(), originalHeading, 'Escape discards the typed changes');
  // Type, bold the selection, and end the session by selecting another element: one coalesced undo step.
  await doubleClickHeading();
  await chord('a', 'KeyA', 65);
  await send('Input.insertText', { text: 'Rich heading text' });
  await sleep(300);
  await chord('a', 'KeyA', 65);
  await sleep(500); // the toolbar enters with a short motion; measure it at rest
  const formatToolbar = await ev(`(() => {
    const toolbar = document.querySelector('[data-testid="format-toolbar"]');
    const selection = document.querySelector('main iframe').contentDocument.getSelection();
    if (!toolbar || !selection || selection.isCollapsed) return null;
    const toolbarRect = toolbar.getBoundingClientRect();
    const selectionRect = selection.getRangeAt(0).getBoundingClientRect();
    const frameRect = document.querySelector('main iframe').getBoundingClientRect();
    return { top: toolbarRect.top, bottom: toolbarRect.bottom, selectionTop: selectionRect.top + frameRect.top, frameTop: frameRect.top, frameBottom: frameRect.bottom, pressed: toolbar.querySelector('button[aria-label="Bold"]')?.getAttribute('aria-pressed') };
  })()`);
  assert.equal(
    await ev(
      `[...document.querySelectorAll('aside[aria-label="Inspector"] [role=tab]')].find((tab) => tab.getAttribute('aria-selected') === 'true')?.textContent.trim()`,
    ),
    'Content',
    'starting an edit session shows the Content tab with the Selected Text section',
  );
  assert.ok(formatToolbar, 'a non-empty text selection displays the formatting toolbar');
  assert.equal(formatToolbar.pressed, 'false', 'Bold starts unpressed for unformatted selected text');
  assert.ok(formatToolbar.bottom <= formatToolbar.selectionTop, 'the formatting toolbar is above the selection');
  assert.ok(
    formatToolbar.top >= formatToolbar.frameTop && formatToolbar.bottom <= formatToolbar.frameBottom,
    'the formatting toolbar stays inside the canvas frame',
  );
  const boldPoint = await ev(
    `(() => { const r = document.querySelector('[data-testid="format-toolbar"] button[aria-label="Bold"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`,
  );
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: boldPoint.x, y: boldPoint.y });
  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: boldPoint.x,
    y: boldPoint.y,
    button: 'left',
    clickCount: 1,
  });
  await send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: boldPoint.x,
    y: boldPoint.y,
    button: 'left',
    clickCount: 1,
  });
  await sleep(300);
  assert.equal(
    await ev(
      `document.querySelector('[data-testid="format-toolbar"] button[aria-label="Bold"]')?.getAttribute('aria-pressed')`,
    ),
    'true',
    'clicking Bold keeps the selection and updates its pressed state',
  );
  await sleep(600);
  assert.equal(
    await ev(
      `!!document.querySelector('main iframe').contentDocument.querySelector('[data-blx-id="hero-h1"] [contenteditable] strong')`,
    ),
    true,
    'the bold shortcut wraps the selection in a strong mark inside the editor',
  );
  // Token color and safe link controls retain the live canvas selection and only store semantic marks.
  const colorProblemsBefore = problems.length;
  await clickReal('[data-testid="format-toolbar"] button[aria-label="Text color"]');
  const swatchColors = await ev(
    `(() => [...document.querySelectorAll('[data-testid="format-toolbar"] [role="menuitemradio"] .blx-format-swatch')].map((node) => getComputedStyle(node).backgroundColor))()`,
  );
  assert.ok(swatchColors.length >= 3, 'resolved token swatches appear in the color popover');
  assert.ok(
    swatchColors.every((color) => color !== 'transparent' && color !== 'rgba(0, 0, 0, 0)'),
    'resolved swatches have non-transparent backgrounds',
  );
  assert.notEqual(swatchColors[1], swatchColors[2], 'two color tokens resolve to different swatch colors');
  await clickReal('[data-testid="format-toolbar"] [role="menuitemradio"]:nth-child(2)');
  await clickReal('[data-testid="format-toolbar"] button[aria-label="Text color"]');
  const clickedSwatchColor = await ev(
    `(() => getComputedStyle(document.querySelector('[data-testid="format-toolbar"] [role="menuitemradio"]:nth-child(2) .blx-format-swatch')).backgroundColor)()`,
  );
  assert.ok(
    clickedSwatchColor !== 'transparent' && clickedSwatchColor !== 'rgba(0, 0, 0, 0)',
    'clicked token swatch retains its resolved background',
  );
  await sleep(500);
  const coloredMarkup = await ev(`(() => {
    const doc = document.querySelector('main iframe').contentDocument;
    const heading = doc.querySelector('[data-blx-id="hero-h1"]');
    return { marked: !!heading?.querySelector('[class^="blx-mc-"]'), inlineStyles: [...(heading?.querySelectorAll('*') ?? [])].some((node) => node.hasAttribute('style')) || heading?.hasAttribute('style') };
  })()`);
  assert.equal(coloredMarkup.marked, true, 'a color token renders as a generated blx-mc class in the heading');
  assert.equal(
    coloredMarkup.inlineStyles,
    false,
    'color editing adds no style attribute to the heading or descendants',
  );
  const colorProblems = problems
    .slice(colorProblemsBefore)
    .filter(
      (entry) => !/Executing inline (script|event handler) violates the following Content Security Policy/.test(entry),
    );
  assert.deepEqual(colorProblems, [], 'color editing adds no console or CSP problems');
  // Selected Text inspector controls share the canvas selection and execute through the existing edit-command bridge.
  const contentTabPoint = await ev(
    `(() => { const tab = [...document.querySelectorAll('aside[aria-label="Inspector"] [role="tab"]')].find((item) => item.textContent.trim() === 'Content'); const r = tab?.getBoundingClientRect(); return r ? { x:r.left+r.width/2,y:r.top+r.height/2 } : null; })()`,
  );
  assert.ok(contentTabPoint, 'the inspector Content tab exists during inline editing');
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...contentTabPoint });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...contentTabPoint, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...contentTabPoint, button: 'left', clickCount: 1 });
  await sleep(300);
  assert.equal(
    await ev(
      `document.querySelector('aside[aria-label="Inspector"] [role="tab"][aria-selected="true"]')?.textContent.trim()`,
    ),
    'Content',
    'Content is the active inspector tab',
  );
  assert.equal(
    await ev(
      `!!document.querySelector('#inspector-section-selected-text-panel')?.textContent.includes('Rich heading text')`,
    ),
    true,
    'Selected Text contains the active canvas selection',
  );
  const inspectorGeometry = await ev(`(() => {
    const inspect = (id) => {
      const root = document.querySelector(id);
      if (!root) return { missing: true };
      const visible = [...root.querySelectorAll('button,select,input,label')].filter((node) => {
        const r = node.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(node).visibility !== 'hidden';
      });
      const overlaps = [];
      for (let i = 0; i < visible.length; i++) for (let j = i + 1; j < visible.length; j++) {
        const a = visible[i].getBoundingClientRect(), b = visible[j].getBoundingClientRect();
        const area = Math.max(0, Math.min(a.right,b.right)-Math.max(a.left,b.left)) * Math.max(0, Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
        if (area > 1) overlaps.push([visible[i].tagName, visible[j].tagName, area]);
      }
      const selects = [...root.querySelectorAll('select')].map((node) => {
        const option = node.selectedOptions[0];
        const context = document.createElement('canvas').getContext('2d');
        if (context) context.font = getComputedStyle(node).font;
        const textWidth = option && context ? context.measureText(option.textContent ?? '').width : 0;
        const style = getComputedStyle(node);
        const available = node.clientWidth - parseFloat(style.paddingInlineStart) - parseFloat(style.paddingInlineEnd) - 20;
        return { clipped: node.scrollWidth > node.clientWidth + 1, optionFits: textWidth <= available + 1 };
      });
      const link = root.querySelector('.blx-selected-link-field');
      const rect = (node) => {
        const r = node?.getBoundingClientRect();
        return r ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom } : null;
      };
      const linkLabels = [rect(link?.querySelector('label[for="rich-link"]')), rect(link?.querySelector('label[for="rich-new-tab"]'))];
      const switches = [...(link?.querySelectorAll('.blx-selected-link-toggle, #rich-new-tab') ?? [])].map((node) => {
        const r = node.getBoundingClientRect(), bounds = link.getBoundingClientRect();
        return r.left >= bounds.left - 1 && r.right <= bounds.right + 1 && r.top >= bounds.top - 1 && r.bottom <= bounds.bottom + 1;
      });
      const styleButtons = [...root.querySelectorAll('.blx-rich-text-style button')].map((node) => ({
        clipped: node.scrollWidth > node.clientWidth + 1,
        accessibleName: node.getAttribute('aria-label'),
      }));
      return { overlaps, selects, overflow: root.scrollWidth > root.clientWidth + 1, linkLabels, switches, styleButtons };
    };
    const selected = inspect('#inspector-section-selected-text-panel');
    const formatting = inspect('#inspector-section-text-formatting-panel');
    const segments = [...document.querySelectorAll('#inspector-section-selected-text-panel .blx-rich-weight-segments button')].map((node) => node.getBoundingClientRect().width);
    return { selected, formatting, segments };
  })()`);
  assert.deepEqual(inspectorGeometry.selected.overlaps, [], 'Selected Text visible labels and controls do not overlap');
  assert.deepEqual(
    inspectorGeometry.formatting.overlaps,
    [],
    'Text Formatting visible labels and controls do not overlap',
  );
  assert.equal(inspectorGeometry.selected.overflow, false, 'Selected Text has no horizontal overflow');
  const [linkLabelRect, newTabLabelRect] = inspectorGeometry.selected.linkLabels;
  assert.ok(linkLabelRect && newTabLabelRect, 'Selected Text link and new-tab labels are present');
  assert.ok(
    linkLabelRect.bottom <= newTabLabelRect.top || newTabLabelRect.bottom <= linkLabelRect.top,
    'Link and Open in new tab labels do not overlap',
  );
  assert.ok(
    inspectorGeometry.selected.switches.length === 2 && inspectorGeometry.selected.switches.every(Boolean),
    'Selected Text link switches stay inside the link section',
  );
  assert.equal(
    inspectorGeometry.selected.styleButtons.some((button) => button.clipped || !button.accessibleName),
    false,
    'Selected Text style labels fit or retain an accessible name',
  );
  assert.equal(inspectorGeometry.formatting.overflow, false, 'Text Formatting has no horizontal overflow');
  assert.equal(
    inspectorGeometry.selected.selects.some((select) => select.clipped || !select.optionFits),
    false,
    'Selected Text selects do not clip their text',
  );
  assert.ok(
    inspectorGeometry.segments.length === 3 &&
      Math.max(...inspectorGeometry.segments) - Math.min(...inspectorGeometry.segments) <= 1,
    'font weight segments have equal widths',
  );
  const inspectorButtonPoint = async (label) =>
    ev(
      `(() => { const section = document.querySelector('#inspector-section-selected-text-panel'); const button = [...(section?.querySelectorAll('button') ?? [])].find((item) => item.textContent.trim() === ${JSON.stringify(label)} || item.getAttribute('aria-label') === ${JSON.stringify(label)}); button?.scrollIntoView({ block: 'center' }); const r = button?.getBoundingClientRect(); return r ? { x:r.left+r.width/2,y:r.top+r.height/2 } : null; })()`,
    );
  const italicPoint = await inspectorButtonPoint('Italic');
  assert.ok(italicPoint, 'Selected Text exposes its Italic control');
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...italicPoint });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...italicPoint, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...italicPoint, button: 'left', clickCount: 1 });
  await sleep(400);
  assert.equal(
    await ev(`!!document.querySelector('main iframe').contentDocument.querySelector('[data-blx-id="hero-h1"] em')`),
    true,
    'inspector Italic creates an em mark in the canvas',
  );
  assert.equal(
    await ev(
      `document.querySelector('[data-testid="format-toolbar"] button[aria-label="Italic"]')?.getAttribute('aria-pressed')`,
    ),
    'true',
    'the toolbar Italic state follows the inspector command',
  );
  assert.equal(
    await ev(`document.activeElement === document.querySelector('main iframe')`),
    true,
    'the canvas regains focus after the inspector command',
  );
  const inspectorColorProblemsBefore = problems.length;
  const inspectorColorChanged = await ev(
    `(() => { const select = document.querySelector('#rich-color'); if (!select) return false; const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set; setter?.call(select, 'color-text'); select.dispatchEvent(new Event('input', { bubbles: true })); select.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`,
  );
  assert.equal(inspectorColorChanged, true, 'Selected Text exposes its text color token select');
  await sleep(400);
  const inspectorColorMarkup = await ev(
    `(() => { const heading = document.querySelector('main iframe').contentDocument.querySelector('[data-blx-id="hero-h1"]'); return { token: !!heading?.querySelector('[class^="blx-mc-"]'), inlineStyle: !!heading?.querySelector('[style]') || heading?.hasAttribute('style') }; })()`,
  );
  assert.equal(inspectorColorMarkup.token, true, 'inspector color token renders a generated blx-mc class');
  assert.equal(
    inspectorColorMarkup.inlineStyle,
    false,
    'inspector color token adds no style attribute to the edited element',
  );
  const inspectorColorProblems = problems
    .slice(inspectorColorProblemsBefore)
    .filter(
      (entry) => !/Executing inline (script|event handler) violates the following Content Security Policy/.test(entry),
    );
  assert.deepEqual(inspectorColorProblems, [], 'inspector color editing adds no console or CSP problems');
  const selectedWeightBold = await ev(
    `(() => { const select = document.querySelector('#rich-weight'); if (!select) return false; const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set; setter?.call(select, 'bold'); select.dispatchEvent(new Event('input', { bubbles: true })); select.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`,
  );
  assert.equal(selectedWeightBold, true, 'Selected Text exposes the Font weight select');
  await sleep(400);
  assert.equal(
    await ev(
      `!!document.querySelector('main iframe').contentDocument.querySelector('[data-blx-id="hero-h1"] [class~="blx-mw-bold"]')`,
    ),
    true,
    'weight Bold renders the generated blx-mw-bold class',
  );
  const wholeAndUnderline = await ev(
    `(() => { const apply = document.querySelector('#rich-apply-to'); if (!apply) return false; const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set; setter?.call(apply, 'whole'); apply.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`,
  );
  assert.equal(wholeAndUnderline, true, 'Apply to offers Whole element');
  const underlinePoint = await inspectorButtonPoint('Underline');
  assert.ok(underlinePoint, 'Selected Text exposes its Underline control');
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...underlinePoint });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...underlinePoint, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...underlinePoint, button: 'left', clickCount: 1 });
  await sleep(400);
  const underlineCoverage = await ev(
    `(() => { const root = document.querySelector('main iframe').contentDocument.querySelector('[data-blx-id="hero-h1"] [contenteditable]'); const text = root?.textContent ?? ''; const underlined = [...(root?.querySelectorAll('u') ?? [])].map((node) => node.textContent).join(''); return { text, underlined }; })()`,
  );
  assert.equal(
    underlineCoverage.underlined,
    underlineCoverage.text,
    'Whole element underlines every character in the heading',
  );
  // "Clear selection" collapsed the selection above: select the heading text again so Content tab formatting has a target.
  await ev(
    `(() => { const root = document.querySelector('main iframe').contentDocument.querySelector('[data-blx-id="hero-h1"] [contenteditable]'); root.editor.commands.selectAll(); root.editor.commands.focus(); })()`,
  );
  await sleep(600);
  const formattingUnderlinePoint = await ev(
    `(() => { const button = [...document.querySelectorAll('#inspector-section-text-formatting-panel button')].find((item) => item.getAttribute('aria-label') === 'Underline'); button?.scrollIntoView({ block: 'center' }); const r = button?.getBoundingClientRect(); return r ? { x:r.left+r.width/2,y:r.top+r.height/2 } : null; })()`,
  );
  assert.ok(formattingUnderlinePoint, 'Content Text Formatting exposes its Underline button during canvas editing');
  const hasUnderline = () =>
    ev(
      `!!document.querySelector('main iframe').contentDocument.querySelector('[data-blx-id="hero-h1"] [contenteditable] u')`,
    );
  const clickFormattingUnderline = async () => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...formattingUnderlinePoint });
    await send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      ...formattingUnderlinePoint,
      button: 'left',
      clickCount: 1,
    });
    await send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      ...formattingUnderlinePoint,
      button: 'left',
      clickCount: 1,
    });
    await sleep(400);
  };
  // The whole heading is already underlined (previous step), so the toggle first removes the mark and then restores it.
  await clickFormattingUnderline();
  assert.equal(await hasUnderline(), false, 'Content Text Formatting Underline toggles an existing u mark off');
  await clickFormattingUnderline();
  assert.equal(
    await hasUnderline(),
    true,
    'Content Text Formatting Underline creates a u mark in the canvas edit root',
  );
  await clickReal('#inspector-section-text-formatting-panel button[aria-label="Text Formatting link"]');
  const formattingLinkUrl = await ev(
    `(() => { const input = document.querySelector('#inspector-section-text-formatting-panel input[aria-label="Text Formatting link URL"]'); input?.focus(); input?.scrollIntoView({ block: 'center' }); return !!input; })()`,
  );
  assert.equal(formattingLinkUrl, true, 'Text Formatting link popover exposes its distinct URL field');
  await ev(
    `(() => { const input = document.querySelector('#inspector-section-text-formatting-panel input[aria-label="Text Formatting link URL"]'); input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); })()`,
  );
  await send('Input.insertText', { text: 'https://example.test/formatting' });
  await ev(
    `document.querySelector('#inspector-section-text-formatting-panel button[type="submit"]')?.scrollIntoView({ block: 'center' })`,
  );
  await sleep(300);
  await clickReal('#inspector-section-text-formatting-panel button[type="submit"]');
  await sleep(400);
  assert.equal(
    await ev(
      `!!document.querySelector('main iframe').contentDocument.querySelector('[data-blx-id="hero-h1"] [contenteditable] a[href="https://example.test/formatting"]')`,
    ),
    true,
    'Text Formatting link Apply creates the expected anchor in the canvas edit root',
  );
  await clickReal('[data-testid="format-toolbar"] button[aria-label="Link"]');
  await ev(
    `(() => { const input = document.querySelector('[data-testid="format-toolbar"] input:not([type="checkbox"])'); input.focus(); input.value = ''; })()`,
  );
  await send('Input.insertText', { text: 'https://example.test/' });
  await clickReal('[data-testid="format-toolbar"] input[type="checkbox"]');
  await clickReal('[data-testid="format-toolbar"] button[type="submit"]');
  await sleep(350);
  const linked = await ev(`(() => {
    const doc = document.querySelector('main iframe').contentDocument;
    const root = doc.querySelector('[data-blx-id="hero-h1"] [contenteditable]');
    const anchor = root?.querySelector('a[href="https://example.test/"][target="_blank"][rel~="noopener"]');
    return { found: !!anchor, href: location.href, frame: document.querySelector('main iframe').src, box: anchor ? (() => { const r = anchor.getBoundingClientRect(); return { x:r.left+r.width/2,y:r.top+r.height/2 }; })() : null };
  })()`);
  assert.equal(linked.found, true, 'Apply creates a safe new-tab anchor with noopener in the canvas edit root');
  const editorUrlBeforeLinkClick = await ev('location.href');
  const iframeUrlBeforeLinkClick = await ev(`document.querySelector('main iframe').src`);
  const iframeBox = await ev(`document.querySelector('main iframe').getBoundingClientRect().toJSON()`);
  const linkPoint = { x: iframeBox.left + linked.box.x, y: iframeBox.top + linked.box.y };
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...linkPoint });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...linkPoint, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...linkPoint, button: 'left', clickCount: 1 });
  await sleep(350);
  assert.equal(
    await ev('location.href'),
    editorUrlBeforeLinkClick,
    'clicking the link leaves the editor URL unchanged',
  );
  assert.equal(
    await ev(`document.querySelector('main iframe').src`),
    iframeUrlBeforeLinkClick,
    'clicking the link leaves the preview iframe URL unchanged',
  );
  // Clicking inside the live editor moves the caret natively (the click does not drop focus), so select the text again.
  await chord('a', 'KeyA', 65);
  await sleep(500);
  const clearPoint = await ev(
    `(() => { const button = document.querySelector('#inspector-section-selected-text-panel button.blx-inspector-clear-selection'); button?.scrollIntoView({ block: 'center' }); const r = button?.getBoundingClientRect(); return r ? { x:r.left+r.width/2,y:r.top+r.height/2 } : null; })()`,
  );
  assert.ok(clearPoint, 'Selected Text exposes Clear selection');
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...clearPoint });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...clearPoint, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...clearPoint, button: 'left', clickCount: 1 });
  await sleep(300);
  assert.equal(
    await ev(`document.querySelector('main iframe').contentDocument.getSelection()?.isCollapsed`),
    true,
    'Clear selection collapses the canvas selection',
  );
  assert.equal(
    await ev(`!!document.querySelector('#inspector-section-selected-text-panel')`),
    false,
    'the Selected Text section disappears after clearing selection',
  );
  await ev(
    `[...document.querySelectorAll('nav[aria-label="Structure"] [role="treeitem"]')].find((row) => row.dataset.id === 'hero-txt')?.click()`,
  );
  await sleep(2500);
  assert.equal(await headingEditable(), false, 'selecting another element ends the edit session');
  assert.equal(
    await ev(
      `document.querySelector('main iframe').contentDocument.querySelector('[data-blx-id="hero-h1"] strong')?.textContent`,
    ),
    'Rich heading text',
    'the committed rich value renders a strong element in the canvas preview',
  );
  assert.equal(await headingText(), 'Rich heading text', 'the committed text replaces the heading');
  await ev(
    `[...document.querySelectorAll('nav[aria-label="Structure"] [role="treeitem"]')].find((row) => row.dataset.id === 'hero-h1')?.click()`,
  );
  await sleep(1200);
  await ev(
    `(() => { const tab = [...document.querySelectorAll('aside[aria-label="Inspector"] [role=tab]')].find((item) => item.textContent.trim() === 'Content'); tab?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, ctrlKey: false })); })()`,
  );
  await sleep(500);
  const richInspector = await ev(`document.querySelector('textarea[aria-label="Text"]')?.value`);
  assert.equal(richInspector, 'Rich heading text', 'the Content field shows the rich value as editable plain text');
  await ev(`document.querySelector('textarea[aria-label="Text"]')?.scrollIntoView({ block: 'center' })`);
  await sleep(300);
  await clickReal('textarea[aria-label="Text"]');
  await ev(`document.querySelector('textarea[aria-label="Text"]')?.select()`);
  await send('Input.insertText', { text: 'Inspector preserves bold' });
  await sleep(400);
  await clickReal('nav[aria-label="Structure"] [role="treeitem"][data-id="hero-txt"]');
  await sleep(1800);
  assert.equal(await headingText(), 'Inspector preserves bold', 'the inspector text edit updates the canvas');
  assert.equal(
    await ev(
      `document.querySelector('main iframe').contentDocument.querySelector('[data-blx-id="hero-h1"] strong')?.textContent`,
    ),
    'Inspector preserves bold',
    'the inspector text edit preserves the strong mark',
  );
  await clickReal('button[aria-label="Undo"]');
  await sleep(1500);
  assert.equal(await headingText(), 'Rich heading text', 'one Undo restores the rich value after the inspector edit');
  assert.equal(
    await ev(
      `document.querySelector('main iframe').contentDocument.querySelector('[data-blx-id="hero-h1"] strong')?.textContent`,
    ),
    'Rich heading text',
    'one Undo restores the strong-marked text',
  );
  await ev(`document.querySelector('button[aria-label="Undo"]')?.click()`);
  await sleep(2000);
  assert.equal(await headingText(), originalHeading, 'one Undo restores the heading after the whole edit session');
  assert.equal(
    await ev(`!!document.querySelector('main iframe').contentDocument.querySelector('[data-blx-id="hero-h1"] strong')`),
    false,
    'Undo also removes the bold mark',
  );

  // A real iframe shortcut must commit the just-ended inline session and persist it through the draft REST streams.
  await nav(editorUrl, 2500);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await headingText()) break;
    await sleep(250);
  }
  await replaceHeadingInline('Saved by the check');
  assert.equal(await headingEditable(), false, 'selecting another tree item ends the heading edit session');
  await waitForSaveState('dirty');
  const dirtyStatus = await ev(`document.querySelector('.blx-saved')?.textContent.trim()`);
  assert.match(dirtyStatus, /Unsaved|Niet-opgeslagen/i, 'the translated header status reports unsaved changes');
  await ev(`document.querySelector('main iframe')?.focus()`);
  assert.equal(
    await ev(`document.activeElement === document.querySelector('main iframe')`),
    true,
    'canvas owns focus before the save shortcut',
  );
  await send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 's',
    code: 'KeyS',
    modifiers: modifier,
    windowsVirtualKeyCode: 83,
  });
  await send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 's',
    code: 'KeyS',
    modifiers: modifier,
    windowsVirtualKeyCode: 83,
  });
  await waitForSaveState('saved');
  assert.equal(
    await ev(
      `(() => { const button = document.querySelector('button[aria-label="Save Draft"],button[aria-label="Concept opslaan"]'); return !!button && (button.disabled || button.getAttribute('aria-disabled') === 'true' || button.hasAttribute('data-disabled')); })()`,
    ),
    true,
    'Save Draft is disabled again after the shortcut save completes',
  );
  await nav(editorUrl, 2500);
  assert.equal(await headingText(), 'Saved by the check', 'the shortcut-saved heading persists in the canvas');
  await ev(
    `[...document.querySelectorAll('nav[aria-label="Structure"] [role="treeitem"]')].find((row) => row.dataset.id === 'hero-h1')?.click()`,
  );
  await sleep(500);
  await ev(
    `(() => { const tab = [...document.querySelectorAll('aside[aria-label="Inspector"] [role=tab]')].find((item) => item.textContent.trim() === 'Content'); tab?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, ctrlKey: false })); })()`,
  );
  await sleep(400);
  const inspectorSavedHeading = await ev(
    `(() => { const label = [...document.querySelectorAll('aside[aria-label="Inspector"] label')].find((item) => item.textContent.trim() === 'Text'); return label ? document.getElementById(label.htmlFor)?.value : null; })()`,
  );
  assert.equal(inspectorSavedHeading, 'Saved by the check', 'the shortcut-saved heading appears in the inspector');

  // Draft preview saves a dirty heading before opening an authenticated front-end tab (BWB-151).
  await replaceHeadingInline('Preview smoke heading');
  await waitForSaveState('dirty');
  // A preview tab left behind by an aborted earlier run would become the first page target; start from a clean browser.
  for (const stale of (await (await fetch('http://127.0.0.1:9334/json')).json()).filter(
    (target) => target.type === 'page' && target.url.includes('blixis_preview='),
  ))
    await fetch(`http://127.0.0.1:9334/json/close/${stale.id}`);
  const targetsBeforePreview = new Set(
    (await (await fetch('http://127.0.0.1:9334/json')).json()).map((target) => target.id),
  );
  await clickReal('button[aria-label="Save and preview"]');
  await waitForSaveState('saved');
  let previewTarget = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    previewTarget = (await (await fetch('http://127.0.0.1:9334/json')).json()).find(
      (target) =>
        target.type === 'page' && !targetsBeforePreview.has(target.id) && target.url.includes('blixis_preview='),
    );
    if (previewTarget) break;
    await sleep(250);
  }
  assert.ok(previewTarget, 'Preview opens a new front-end tab with a blixis_preview nonce');
  const previewWs = new WebSocket(previewTarget.webSocketDebuggerUrl);
  await new Promise((resolve) => (previewWs.onopen = resolve));
  let previewSeq = 0;
  const previewPending = new Map();
  previewWs.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && previewPending.has(message.id)) {
      previewPending.get(message.id)(message);
      previewPending.delete(message.id);
    }
  };
  const previewSend = (method, params = {}) =>
    new Promise((resolve) => {
      const id = (previewSeq += 1);
      previewPending.set(id, resolve);
      previewWs.send(JSON.stringify({ id, method, params }));
    });
  await previewSend('Runtime.enable');
  let previewBody;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    previewBody = await previewSend('Runtime.evaluate', {
      expression: 'document.body.innerText',
      returnByValue: true,
    });
    if (previewBody.result?.result?.value.includes('Preview smoke heading')) break;
    await sleep(250);
  }
  assert.ok(
    previewBody.result?.result?.value.includes('Preview smoke heading'),
    'the draft preview tab renders the saved working heading',
  );
  assert.ok(previewBody.result?.result?.value.includes('Draft preview'), 'the real front-end preview shows its badge');
  // curl, not fetch: Herd's local certificate is not in Node's trust store. -k is limited to this local development host.
  const anonymousPublishedRaw = execFileSync('curl', ['-sk', '-w', '\n%{http_code}', `${SITE}/builder-demo/`], {
    encoding: 'utf8',
  });
  const anonymousPublishedStatus = anonymousPublishedRaw.slice(anonymousPublishedRaw.lastIndexOf('\n') + 1);
  const anonymousPublishedText = anonymousPublishedRaw.slice(0, anonymousPublishedRaw.lastIndexOf('\n'));
  assert.equal(anonymousPublishedStatus, '200', 'the anonymous published permalink remains available');
  assert.ok(
    anonymousPublishedText.includes(originalHeading) && !anonymousPublishedText.includes('Preview smoke heading'),
    'the anonymous published permalink keeps the prior published heading and does not expose working draft text',
  );

  // Publish through the editor UI, then restore the original live heading through the same UI.
  const publishHeading = async (value) => {
    await replaceHeadingInline(value);
    const buttonName = await ev(
      `(() => [...document.querySelectorAll('.blx-header button')].find((item) => /Publish|Publiceren/.test(item.getAttribute('aria-label') ?? ''))?.getAttribute('aria-label'))()`,
    );
    assert.ok(buttonName, 'the header Publish action is available');
    await clickReal(`button[aria-label=${JSON.stringify(buttonName)}]`);
    assert.ok(await ev(`!!document.querySelector('[role="dialog"]')`), 'publish opens its confirmation dialog');
    const dialogButton = await ev(
      `(() => [...document.querySelectorAll('[role="dialog"] button')].find((item) => /^(Publish|Publiceren)$/.test(item.textContent.trim()))?.textContent.trim())()`,
    );
    assert.ok(dialogButton, 'the confirmation dialog has a Publish action');
    await clickReal(`[role="dialog"] button:not([aria-label])`);
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (!(await ev(`!!document.querySelector('[role="dialog"]')`))) break;
      await sleep(250);
    }
    assert.equal(
      await ev(`document.querySelector('.blx-publication-chip')?.textContent.trim()`),
      'Published',
      'the header reports the published state',
    );
    const raw = execFileSync('curl', ['-sk', '-w', '\n%{http_code}', `${SITE}/builder-demo/`], { encoding: 'utf8' });
    const status = raw.slice(raw.lastIndexOf('\n') + 1);
    const body = raw.slice(0, raw.lastIndexOf('\n'));
    assert.equal(status, '200', 'the anonymous published URL returns 200');
    assert.ok(body.includes(value), `the anonymous published URL contains ${value}`);
  };
  await publishHeading('Publish smoke heading');
  await publishHeading(originalHeading);

  // Page settings are loaded on the empty-selection inspector and saved independently of undo history.
  await ev(
    `(() => {
    const frame=document.querySelector('main iframe'), doc=frame?.contentDocument, fr=frame?.getBoundingClientRect();
    if (!frame || !doc || !fr) return false;
    doc.querySelector('#blx-canvas-root')?.scrollIntoView({block:'start'});
    for (const [x,y] of [[doc.documentElement.clientWidth-12,80],[12,80],[doc.documentElement.clientWidth-12,doc.documentElement.clientHeight-20],[12,doc.documentElement.clientHeight-20]]) {
      const target=doc.elementFromPoint(x,y);
      if (target && !target.closest('[data-blx-id]')) return {x:fr.left+frame.clientLeft+x,y:fr.top+frame.clientTop+y};
    }
    return false;
  })()`,
  ).then(async (point) => {
    assert.ok(point, 'the canvas frame is available for empty-space deselection');
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
  });
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await ev(`!!document.querySelector('#inspector-section-page-settings-heading')`)) break;
    await sleep(250);
  }
  assert.ok(
    await ev(`!!document.querySelector('#inspector-section-page-settings-heading')`),
    'empty canvas selection shows the Page panel',
  );
  for (let attempt = 0; attempt < 40 && !(await ev(`!!document.querySelector('#page-title')`)); attempt += 1)
    await sleep(150);
  const originalPageTitle = await ev(`document.querySelector('#page-title')?.value`);
  const originalPageSlug = await ev(`document.querySelector('#page-slug')?.value`);
  const originalSeoDescription = await ev(`document.querySelector('#seo-meta-description')?.value`);
  const originalFeaturedId = Number(
    (await ev(`document.querySelector('.blx-page-settings .blx-media-id-disclosure input')?.value`)) ?? 0,
  );
  assert.ok(originalPageTitle && originalPageSlug, 'the page title and slug have loaded');
  const fillPageField = async (selector, value) => {
    await ev(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({ block: 'center' })`);
    await clickReal(selector);
    await ev(`document.querySelector(${JSON.stringify(selector)})?.select()`);
    await send('Input.insertText', { text: value });
    await sleep(200);
  };
  const openPagePanel = async () => {
    await clickReal('.blx-title-text');
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (await ev(`!!document.querySelector('#page-title')`)) break;
      await sleep(250);
    }
    await sleep(300);
  };
  const savePageSettings = async () => {
    const saveName = await ev(
      `(() => [...document.querySelectorAll('.blx-header button')].find((item) => /^(Save Draft|Concept opslaan)$/.test(item.getAttribute('aria-label') ?? ''))?.getAttribute('aria-label'))()`,
    );
    assert.ok(saveName, 'Save Draft is available for page settings');
    await ev(
      `document.querySelector(${JSON.stringify(`button[aria-label=${JSON.stringify(saveName)}]`)})?.scrollIntoView({ block: 'center' })`,
    );
    await clickReal(`button[aria-label=${JSON.stringify(saveName)}]`);
    await waitForSaveState('saved');
  };
  const openFeaturedPicker = async () => {
    await ev(`document.querySelector('.blx-page-settings .blx-media-field')?.scrollIntoView({ block: 'center' })`);
    const action = await ev(
      `document.querySelector('.blx-page-settings .blx-media-field .blx-media-field-actions button')?.textContent.trim()`,
    );
    assert.ok(action, 'the featured image picker action is visible');
    await clickReal('.blx-page-settings .blx-media-field .blx-media-field-actions button');
    await sleep(500);
  };
  const searchMedia = async (query) => {
    await ev(`document.querySelector('#blx-media-search')?.scrollIntoView({ block: 'center' })`);
    await clickReal('#blx-media-search');
    await ev(`document.querySelector('#blx-media-search')?.select()`);
    if (query) await send('Input.insertText', { text: query });
    else await press('Backspace');
    await sleep(1800); // debounce plus the list request
  };
  const selectFirstMedia = async () => {
    const selector = '.blx-media-card';
    const count = await ev(`document.querySelectorAll(${JSON.stringify(selector)}).length`);
    if (count < 1) return false;
    await ev(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({ block: 'center' })`);
    await clickReal(selector);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if ((await ev(`document.querySelector(${JSON.stringify(selector)})?.getAttribute('aria-selected')`)) === 'true')
        break;
      await sleep(200);
    }
    assert.equal(
      await ev(`document.querySelector(${JSON.stringify(selector)})?.getAttribute('aria-selected')`),
      'true',
      `the existing media card is selected (${JSON.stringify(
        await ev(
          `(() => { const c=[...document.querySelectorAll('.blx-media-card')]; const r=c[0]?.getBoundingClientRect(); const top=r?document.elementFromPoint(r.x+r.width/2,r.y+r.height/2):null; return { n:c.length, sel:c.map(x=>x.getAttribute('aria-selected')), top: top&&(top.tagName+'.'+top.className), search: document.querySelector('#blx-media-search')?.value, dialogs: document.querySelectorAll('[role=dialog]').length, text: document.querySelector('[role=dialog]')?.textContent.slice(0,160) }; })()`,
        ),
      )})`,
    );
    await clickReal('button.ed-button-primary');
    await sleep(500);
    return true;
  };
  await openFeaturedPicker();
  await searchMedia('image');
  let hasExistingMedia = await selectFirstMedia();
  if (!hasExistingMedia) {
    await searchMedia('');
    hasExistingMedia = await selectFirstMedia();
  }
  if (hasExistingMedia) await openFeaturedPicker();
  await searchMedia('blixis-check-image'); // WordPress searches the attachment title (the file name without its extension)
  const reusable = await ev(`document.querySelectorAll('.blx-media-card').length`);
  if (reusable > 0) {
    await selectFirstMedia();
  } else {
    await searchMedia('');
    const uploadInput = await send('DOM.getDocument', { depth: -1, pierce: true });
    const inputNode = await send('DOM.querySelector', {
      nodeId: uploadInput.result.root.nodeId,
      selector: 'input[aria-label="Upload image"]',
    });
    assert.ok(inputNode.result.nodeId, 'the real media upload input exists');
    await send('DOM.setFileInputFiles', { files: [mediaUploadPath], nodeId: inputNode.result.nodeId });
    let selectedUpload = '';
    for (let attempt = 0; attempt < 50 && !/blixis-check-image/.test(selectedUpload); attempt += 1) {
      await sleep(300);
      selectedUpload = await ev(
        `(() => { const selected=document.querySelector('.blx-media-card[aria-selected="true"]'); return selected?.querySelector('img')?.getAttribute('src') ?? ''; })()`,
      );
    }
    assert.match(
      selectedUpload,
      /blixis-check-image/,
      `the generated upload appears and is selected (${JSON.stringify(
        await ev(
          `(() => ({ cards: [...document.querySelectorAll('.blx-media-card')].map((c) => (c.getAttribute('aria-selected') ?? '') + ':' + (c.querySelector('img')?.getAttribute('src') ?? '').slice(-40)), status: [...document.querySelectorAll('[role=dialog] [role=status],[role=dialog] [role=alert],[role=dialog] .blx-media-upload')].map((e) => e.textContent.slice(0, 120)), dialog: document.querySelector('[role=dialog]')?.textContent.slice(0, 260) }))()`,
        ),
      )})`,
    );
    await clickReal('button.ed-button-primary');
    await sleep(500);
  }
  const featuredIdBeforeReload = Number(
    await ev(`document.querySelector('.blx-page-settings .blx-media-id-disclosure input')?.value`),
  );
  assert.ok(featuredIdBeforeReload > 0, 'a chosen featured image has an attachment ID');
  await savePageSettings();
  await nav(editorUrl, 2500);
  await openPagePanel();
  assert.equal(
    Number(await ev(`document.querySelector('.blx-page-settings .blx-media-id-disclosure input')?.value`)),
    featuredIdBeforeReload,
    'the featured image persisted after reload',
  );
  await clickReal('.blx-page-settings .blx-media-field-actions button:last-child');
  await savePageSettings();
  if (originalFeaturedId > 0) {
    await ev(`document.querySelector('.blx-page-settings .blx-media-id-disclosure summary')?.click()`);
    const idInput = '.blx-page-settings .blx-media-id-disclosure input';
    await clickReal(idInput);
    await ev(`document.querySelector(${JSON.stringify(idInput)})?.select()`);
    await send('Input.insertText', { text: String(originalFeaturedId) });
    await savePageSettings();
  }
  const priorRestore = restoreDemoHeading;
  restoreDemoHeading = async () => {
    await priorRestore?.();
    try {
      await nav(editorUrl, 2500);
      await openPagePanel();
      await fillPageField('#page-title', originalPageTitle);
      await fillPageField('#page-slug', originalPageSlug);
      await fillPageField('#seo-meta-description', originalSeoDescription ?? '');
      await savePageSettings();
      const currentFeaturedId = Number(
        (await ev(`document.querySelector('.blx-page-settings .blx-media-id-disclosure input')?.value`)) ?? 0,
      );
      if (currentFeaturedId !== originalFeaturedId) {
        const removeButton = '.blx-page-settings .blx-media-field-actions button:last-child';
        if (await ev(`!!document.querySelector(${JSON.stringify(removeButton)})`)) {
          await clickReal(removeButton);
        }
        if (originalFeaturedId > 0) {
          const disclosure = '.blx-page-settings .blx-media-id-disclosure summary';
          await clickReal(disclosure);
          const idInput = '.blx-page-settings .blx-media-id-disclosure input';
          await clickReal(idInput);
          await ev(`document.querySelector(${JSON.stringify(idInput)})?.select()`);
          await send('Input.insertText', { text: String(originalFeaturedId) });
        }
        await savePageSettings();
      }
    } catch (error) {
      console.error(`Best effort page settings restoration failed: ${error.message}`);
    }
  };
  const changedTitle = `${originalPageTitle} SEO check`;
  const changedSlug = `bwb-252-check-${Date.now()}`;
  const changedDescription = 'Page settings SEO description from the browser check.';
  await fillPageField('#page-title', changedTitle);
  await fillPageField('#page-slug', changedSlug);
  await fillPageField('#seo-meta-description', changedDescription);
  await savePageSettings();
  await nav(editorUrl, 2500);
  await openPagePanel();
  assert.equal(await ev(`document.querySelector('#page-title')?.value`), changedTitle, 'the saved page title reloads');
  assert.equal(await ev(`document.querySelector('#page-slug')?.value`), changedSlug, 'the saved slug reloads');
  assert.equal(
    await ev(`document.querySelector('#seo-meta-description')?.value`),
    changedDescription,
    'the SEO description reloads',
  );
  // Return the slug before the existing publication round-trip so its known public test URL remains valid.
  await fillPageField('#page-slug', originalPageSlug);
  await savePageSettings();
  await publishHeading('SEO settings publication check');
  await publishHeading(originalHeading);
  const publishedSeoRaw = execFileSync('curl', ['-sk', '-w', '\n%{http_code}', `${SITE}/${originalPageSlug}/`], {
    encoding: 'utf8',
  });
  const publishedSeoStatus = publishedSeoRaw.slice(publishedSeoRaw.lastIndexOf('\n') + 1);
  const publishedSeoHtml = publishedSeoRaw.slice(0, publishedSeoRaw.lastIndexOf('\n'));
  assert.equal(publishedSeoStatus, '200', 'the published page remains available after its SEO update');
  assert.ok(
    publishedSeoHtml.includes(`<meta name="description" content="${changedDescription}">`),
    'published page HTML contains the edited SEO description',
  );
  await ev(`document.querySelector('.blx-title-text')?.scrollIntoView({ block: 'center' })`);
  await clickReal('.blx-title-text');
  await fillPageField('#page-title', originalPageTitle);
  await fillPageField('#page-slug', originalPageSlug);
  await fillPageField('#seo-meta-description', originalSeoDescription ?? '');
  await savePageSettings();
  assert.equal(
    await ev(`document.querySelector('#page-title')?.value`),
    originalPageTitle,
    'page settings cleanup restores the original title through the UI',
  );
  assert.equal(
    await ev(`document.querySelector('#page-slug')?.value`),
    originalPageSlug,
    'page settings cleanup restores the original slug through the UI',
  );
  assert.equal(
    await ev(`document.querySelector('#seo-meta-description')?.value`),
    originalSeoDescription ?? '',
    'page settings cleanup restores the original SEO description through the UI',
  );

  previewWs.close();
  await fetch(`http://127.0.0.1:9334/json/close/${previewTarget.id}`);

  // The publish round trip already restored the original heading; only repair the draft if it drifted.
  if ((await headingText()) !== originalHeading) {
    await replaceHeadingInline(originalHeading);
    await waitForSaveState('dirty');
    const restoreButton = await ev(
      `(() => [...document.querySelectorAll('button')].find((item) => /^(Save Draft|Concept opslaan)$/.test(item.getAttribute('aria-label') ?? ''))?.getAttribute('aria-label'))()`,
    );
    assert.ok(restoreButton, 'the header Save Draft action is available for restoration');
    await clickReal(`button[aria-label=${JSON.stringify(restoreButton)}]`);
    await waitForSaveState('saved');
    assert.equal(
      await ev(`document.querySelector('.blx-saved')?.dataset.saveState`),
      'saved',
      'no Saving or Save failed state remains after restoration',
    );
  }
  await nav(editorUrl, 2500);
  assert.equal(await headingText(), originalHeading, 'the final stored demo heading equals the original value');
  demoRestoreNeeded = false;

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
  await restoreDemoHeading?.();
  ws?.close();
  const exited = new Promise((resolve) => chrome.once('exit', resolve));
  chrome.kill();
  await exited;
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  rmSync(mediaUploadDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
