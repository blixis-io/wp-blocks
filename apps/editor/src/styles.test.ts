import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { contrastRatio } from '@blixis/wp-design-tokens';
import { afterAll, describe, expect, it } from 'vitest';
import { findScopeViolations } from './test/css-walker';

// Vitest runs inside the package directory (pnpm --filter or cd).
const appRoot = process.cwd();
const source = readFileSync(join(appRoot, 'src/styles/editor.src.css'), 'utf8');

function tokens(theme: 'light' | 'dark'): Record<string, string> {
  const block = new RegExp(`\\[data-editor-theme='${theme}'\\]\\s*\\{([^}]*)\\}`).exec(source)?.[1] ?? '';
  return Object.fromEntries(
    [...block.matchAll(/--ed-([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,6});/g)].map((m): [string, string] => [
      m[1] ?? '',
      m[2] ?? '',
    ]),
  );
}

describe.each(['light', 'dark'] as const)('%s chrome contrast', (theme) => {
  const t = tokens(theme);
  const text: [string, string][] = [
    ['fg', 'bg'],
    ['fg-muted', 'bg'],
    ['fg', 'surface-2'],
    ['fg-muted', 'surface-2'],
    ['fg', 'surface-hover'],
    ['fg-muted', 'surface-hover'],
    ['selected-fg', 'selected'],
    ['primary-fg', 'primary'],
    ['primary-fg', 'primary-hover'],
    ['destructive-fg', 'destructive'],
    ['destructive-fg', 'destructive-hover'],
    ['tooltip-fg', 'tooltip-bg'],
    ['tooltip-border', 'tooltip-bg'],
    ['banner-fg', 'banner'],
    ['fg', 'selected'],
    ['fg', 'surface'],
    ['fg-muted', 'surface'],
    ['fg', 'surface-raised'],
    ['fg-muted', 'surface-raised'],
    ['boxmodel-margin-label', 'boxmodel-margin'],
    ['boxmodel-border-label', 'boxmodel-border'],
    ['boxmodel-padding-label', 'boxmodel-padding'],
    ['boxmodel-content-label', 'boxmodel-content'],
    ['danger', 'bg'],
    ['success', 'bg'],
    ['warning', 'bg'],
    ['header-fg', 'header'],
  ];
  const ui: [string, string][] = [
    ['border-strong', 'bg'],
    ['focus', 'bg'],
    ['focus', 'surface-2'],
    ['border-strong', 'surface-2'],
    // Selected toggles and tabs: the inset ring must stand out from the page and from the selected fill (WCAG 1.4.11).
    ['selected-ring', 'bg'],
    ['selected-ring', 'selected'],
    ['selected-ring', 'surface-2'],
    ['selection-outline', 'bg'],
    ['hover-outline', 'bg'],
    ['selection-outline', 'selected'],
    ['hover-outline', 'surface'],
  ];
  it('defines every token', () => {
    expect(Object.keys(t).length).toBeGreaterThanOrEqual(20);
  });
  it.each(text)('text %s on %s has 4.5:1', (fg, bg) => {
    expect(contrastRatio(t[fg] ?? '', t[bg] ?? '')).toBeGreaterThanOrEqual(4.5);
  });
  it.each(ui)('UI %s against %s has 3:1', (fg, bg) => {
    expect(contrastRatio(t[fg] ?? '', t[bg] ?? '')).toBeGreaterThanOrEqual(3);
  });
});

describe('selected state indicator', () => {
  it('draws a ring from --ed-selected-ring on selected toggles, not colour alone', () => {
    expect(source).toMatch(
      /aria-checked='true'\]:not\(\.ed-menu-item\),[\s\S]*aria-current='true'\]\s*\{\s*box-shadow: inset 0 0 0 2px var\(--ed-selected-ring\)/,
    );
  });
  it('shows checked menu rows with a check mark, never the selected-toggle ring', () => {
    expect(source).toMatch(/aria-checked='true'\]:not\(\.ed-menu-item\)/);
  });
  it('uses the primary underline for the active inspector tab', () => {
    expect(source).toMatch(/\[role='tab'\]\[aria-selected='true'\]::after[\s\S]*?background: var\(--ed-primary\)/);
  });
  it('keeps the narrow layout scrollable instead of clipping panels', () => {
    const narrow = /@media \(max-width: 52rem\) \{([\s\S]*?)\n {4}\}\n/.exec(source)?.[1] ?? '';
    expect(narrow).toMatch(/overflow: auto/);
    expect(narrow).toMatch(/min-block-size: 14rem/);
  });
});

describe('structure tree layout contract', () => {
  it('uses depth variables for full-width row indentation and parent-centred guides', () => {
    expect(source).toMatch(
      /padding-inline-start:\s*calc\(var\(--tree-pad,\s*8px\)\s*\+\s*var\(--tree-depth\)\s*\*\s*var\(--tree-indent,\s*16px\)\)/,
    );
    expect(source).toMatch(
      /inset-inline-start:\s*calc\([\s\S]*var\(--tree-pad\)\s*\+\s*var\(--tree-chevron\)\s*\+\s*var\(--tree-gap\)\s*\+\s*var\(--tree-icon-center\)\s*\+[\s\S]*var\(--guide-depth,\s*0\)\s*\*\s*var\(--tree-indent\)/,
    );
    expect(source).toMatch(
      /border-inline-start:\s*1px solid color-mix\(in srgb, var\(--ed-border\) 35%, transparent\)/,
    );
    expect(source).not.toMatch(/data-on-path|color-mix\(in srgb, var\(--ed-primary\) 45%, transparent\)/);
  });
  it('keeps row geometry fixed and changes hover/selection appearance only', () => {
    expect(source).toMatch(
      /\.blx-outline-item\s*\{[^}]*block-size:\s*28px;[^}]*box-sizing:\s*border-box;[^}]*line-height:\s*20px;/,
    );
    expect(source).toMatch(/\.blx-row-menu-trigger\s*\{[^}]*visibility:\s*hidden;[^}]*opacity:\s*0;/);
    expect(source).toMatch(/\.blx-outline-item:hover\s*\{\s*background:/);
    expect(source).toMatch(/\.blx-outline-item\[aria-selected='true'\]\s*\{\s*background:[^}]*color:/);
    expect(source).not.toMatch(
      /\.blx-outline-item:hover\s*\{[^}]*\b(?:padding|margin|border|font-weight|height|line-height)\s*:/,
    );
    expect(source).not.toMatch(
      /\.blx-outline-item\[aria-selected='true'\]\s*\{[^}]*\b(?:padding|margin|border|font-weight|height|line-height)\s*:/,
    );
    expect(source).toMatch(/\.blx-left-tabs \[role='tab'\]\[aria-selected='true'\]::after\s*\{\s*content:\s*none;/);
  });
});

describe('editor polish CSS contracts', () => {
  it('keeps tooltip background, foreground, and border on explicit tokens', () => {
    expect(source).toMatch(/--ed-tooltip-bg:\s*#[0-9a-f]{6}/i);
    expect(source).toMatch(/--ed-tooltip-fg:\s*#[0-9a-f]{6}/i);
    expect(source).toMatch(/--ed-tooltip-border:\s*#[0-9a-f]{6}/i);
    expect(source).not.toMatch(/bg-ed-tooltip|text-ed-tooltip-fg/);
  });
  it('uses the Solar check icon only as the checked item affordance', () => {
    expect(source).not.toMatch(/\.ed-menu-item\[aria-checked='true'\][^{]*\{[^}]*outline/);
    expect(source).toMatch(/\.ed-menu-item:focus-visible\s*\{[^}]*outline:/);
  });
  it('keeps the inspector tabs sticky with a single scrolling tab panel', () => {
    expect(source).toMatch(/\.blx-inspector-tabs \[role='tablist'\][^{]*\{[^}]*position: sticky/);
    expect(source).toMatch(/\.blx-inspector-tabs \[role='tabpanel'\][^{]*\{[^}]*overflow: auto/);
  });
  it('resets the Content fieldset frame and uses shared section borders', () => {
    expect(source).toMatch(
      /\.blx-inspector-group\s*\{[^}]*min-inline-size: 0;[^}]*border: 0;[^}]*padding: 0;[^}]*margin: 0;/,
    );
    expect(source).toMatch(/\.blx-inspector-section\s*\{[^}]*border-block-end: 1px solid var\(--ed-border\)/);
  });
  it('draws CSS handles as rounded white squares', () => {
    expect(source).toMatch(
      /\.blx-selection-handle\s*\{[^}]*inline-size: 8px;[^}]*block-size: 8px;[^}]*border: 1\.5px solid var\(--ed-primary\);[^}]*border-radius: 2px;[^}]*background: #fff;/,
    );
  });
  it.each(['light', 'dark'])('%s tooltip border and text tokens are present', (theme) => {
    const block = new RegExp(`\\[data-editor-theme='${theme}'\\]\\s*\\{([^}]*)\\}`).exec(source)?.[1] ?? '';
    expect(block).toMatch(/--ed-tooltip-bg:/);
    expect(block).toMatch(/--ed-tooltip-fg:/);
    expect(block).toMatch(/--ed-tooltip-border:/);
  });
  it.each([
    '.blx-inspector-selection',
    '.blx-inspector-tabs',
    "[role='tabpanel']",
    '.blx-inspector-section',
    '.blx-inspector-group',
    '.blx-outline-id',
    ".blx-outline-item[aria-selected='true']",
    '.blx-tree-guides',
    '.blx-tree-guide::before',
    '.blx-tree-guide:last-child::after',
    '.blx-tree-toggle',
    '.blx-tree-icon',
    '.blx-breadcrumb-item',
    '.blx-selection-overlay',
    '.blx-selection-handles',
    '.blx-selection-handle.is-nw',
    '.blx-selection-handle.is-n',
    '.blx-selection-handle.is-ne',
    '.blx-selection-handle.is-e',
    '.blx-selection-handle.is-se',
    '.blx-selection-handle.is-s',
    '.blx-selection-handle.is-sw',
    '.blx-selection-handle.is-w',
    '.ed-menu-item:focus-visible',
  ])('retains the scoped %s polish selector', (selector) => {
    expect(source).toContain(selector);
  });
});

describe('css walker', () => {
  it('flags unscoped selectors and accepts scoped ones', () => {
    const css =
      '@layer blx-editor{.blx-editor .a,.blx-editor:where(.x,.y){color:red}@media (a){.blx-editor b{c:d}}}html{}body,.x{}*{}:root{}@layer other{.blx-editor a{}}@keyframes k{from{a:b}}';
    expect(findScopeViolations(css).map((v) => v.selector)).toEqual([
      'html',
      'body',
      '.x',
      '*',
      ':root',
      '@layer other',
    ]);
  });
});

describe('editor build', () => {
  const dirs: string[] = [];
  const build = () => {
    const out = mkdtempSync(join(tmpdir(), 'blx-editor-'));
    dirs.push(out);
    execFileSync(process.execPath, [join(appRoot, 'scripts/build.mjs'), '--out', out], { cwd: appRoot, stdio: 'pipe' });
    return out;
  };
  afterAll(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  });

  it('scopes every CSS rule and is reproducible, with a matching manifest', { timeout: 120_000 }, () => {
    const a = build();
    const b = build();
    for (const file of ['editor.js', 'canvas.js', 'editor.css', 'manifest.json', 'editor.js.LEGAL.txt', 'NOTICE.txt']) {
      expect(readFileSync(join(a, file)).equals(readFileSync(join(b, file)))).toBe(true);
    }
    const css = readFileSync(join(a, 'editor.css'), 'utf8');
    expect(css.length).toBeGreaterThan(1000);
    expect(findScopeViolations(css)).toEqual([]);
    const manifest = JSON.parse(readFileSync(join(a, 'manifest.json'), 'utf8')) as Record<string, unknown>;
    const sha = (file: string) =>
      createHash('sha256')
        .update(readFileSync(join(a, file)))
        .digest('hex');
    expect(manifest).toEqual({
      version: 1,
      js: 'editor.js',
      css: 'editor.css',
      jsSha256: sha('editor.js'),
      cssSha256: sha('editor.css'),
      canvasJs: 'canvas.js',
      canvasJsSha256: sha('canvas.js'),
    });
    expect(Object.keys(manifest)).toEqual([
      'version',
      'js',
      'css',
      'jsSha256',
      'cssSha256',
      'canvasJs',
      'canvasJsSha256',
    ]);
    // The canvas runtime is the only script inside the preview iframe: plain TypeScript, no React, no dynamic code.
    const canvas = readFileSync(join(a, 'canvas.js'), 'utf8');
    expect(canvas.length).toBeGreaterThan(2000);
    expect(canvas.length).toBeLessThan(100_000);
    expect(canvas).not.toMatch(/react/i);
    expect(canvas).not.toMatch(/gsap|sourceMappingURL/i);
    // no dynamic code, no storage, no navigation, no new windows: the runtime only renders, measures and reports
    expect(canvas).not.toMatch(/\beval\s*\(|new\s+Function/);
    expect(canvas).not.toMatch(/document\.cookie|localStorage|sessionStorage|indexedDB/);
    expect(canvas).not.toMatch(/location\.assign|location\.replace|window\.open/);
    expect(canvas).toContain('blx-canvas-hello');
    const js = readFileSync(join(a, 'editor.js'), 'utf8');
    expect(js).not.toMatch(/sourceMappingURL/);
    expect(js).not.toMatch(/gsap/i);
    // Legal notices (ADR 0008 section 4): every shipped third-party package is listed with version, licence and text.
    const notice = readFileSync(join(a, 'NOTICE.txt'), 'utf8');
    for (const [name, licence] of [
      ['react', 'MIT'],
      ['react-dom', 'MIT'],
      ['zod', 'MIT'],
      ['tailwind-merge', 'MIT'],
      ['class-variance-authority', 'Apache-2.0'],
      ['@iconify-icons/solar', 'CC-BY-4.0'],
      ['@radix-ui/react-direction', 'MIT'],
    ] as const) {
      expect(notice).toMatch(new RegExp(`^${name}@\\d+\\.\\d+\\.\\d+\\nLicense: ${licence}\\n`, 'm'));
    }
    expect(notice).toContain('Solar Icon Set by 480 Design, CC BY 4.0');
    expect(notice).toContain('Solar icons are used unmodified.');
    expect(notice).toContain('https://creativecommons.org/licenses/by/4.0/');
    expect(notice).not.toMatch(/@blixis\//);
    expect(readFileSync(join(a, 'editor.js.LEGAL.txt'), 'utf8')).toMatch(/@license React/);
  });
});
