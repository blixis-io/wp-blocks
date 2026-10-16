import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { contrastRatio, relativeLuminance } from '@blixis/wp-design-tokens';
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

function tooltipColor(
  theme: 'light' | 'dark',
  role: 'bg' | 'fg' | 'muted' | 'border' | 'header-bg' | 'surface',
): string {
  const block = new RegExp(`\\[data-editor-theme='${theme}'\\]\\s*\\{([^}]*)\\}`).exec(source)?.[1] ?? '';
  const roles: Record<string, string> = {};
  for (const match of block.matchAll(
    /--ed-([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,6}|var\(--ed-[a-z0-9-]+\)|color-mix\(in srgb, [^;]+\));/g,
  )) {
    if (match[1] && match[2]) roles[match[1]] = match[2];
  }
  const resolve = (input: string | undefined, depth = 0): string => {
    if (!input || depth > 8) return '';
    if (input.startsWith('var(')) return resolve(roles[input.slice(4, -1).replace(/^--ed-/, '')], depth + 1);
    const mix = /^color-mix\(in srgb,\s*(.+?)\s+(\d+)%,\s*(.+)\)$/.exec(input);
    if (mix?.[1] && mix[2] && mix[3]) {
      const a = channels(resolve(mix[1], depth + 1));
      const b = channels(resolve(mix[3], depth + 1));
      const weight = Number(mix[2]) / 100;
      return `#${a
        .map((channel, index) =>
          Math.round(channel * weight + (b[index] ?? 0) * (1 - weight))
            .toString(16)
            .padStart(2, '0'),
        )
        .join('')}`;
    }
    return input;
  };
  const channels = (value: string): number[] => {
    if (value === 'white') return [255, 255, 255];
    if (value === 'black') return [0, 0, 0];
    const hex = value.slice(1);
    const normalized = hex.length === 3 ? hex.replace(/./g, (part) => part + part) : hex;
    return [0, 2, 4].map((index) => Number.parseInt(normalized.slice(index, index + 2), 16));
  };
  return resolve(roles[role === 'header-bg' ? 'header-bg' : role === 'surface' ? 'surface' : `tooltip-${role}`]);
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
    ['fg-muted', 'surface-2'],
    ['fg', 'surface-2'],
    ['selected-fg', 'selected'],
    ['primary-fg', 'primary'],
    ['primary-fg', 'primary-hover'],
    ['destructive-fg', 'destructive'],
    ['destructive-fg', 'destructive-hover'],
    ['banner-fg', 'banner'],
    ['fg', 'selected'],
    ['fg', 'surface'],
    ['fg-muted', 'surface'],
    ['fg', 'surface-raised'],
    ['fg-muted', 'surface-raised'],
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

describe('box model theme tokens and layout contract', () => {
  it.each(['light', 'dark'] as const)('%s box model aliases retain readable value and outline roles', (theme) => {
    const block = new RegExp(`\\[data-editor-theme='${theme}'\\]\\s*\\{([^}]*)\\}`).exec(source)?.[1] ?? '';
    const t = tokens(theme);
    expect(block).toMatch(/--ed-boxmodel-margin:\s*var\(--ed-surface-2\)/);
    expect(block).toMatch(/--ed-boxmodel-outline:\s*var\(--ed-border-strong\)/);
    expect(block).toMatch(/--ed-boxmodel-padding:\s*color-mix\(in srgb, var\(--ed-primary\) 9%, var\(--ed-surface\)\)/);
    expect(block).toMatch(
      /--ed-boxmodel-content:\s*color-mix\(in srgb, var\(--ed-primary\) 18%, var\(--ed-surface\)\)/,
    );
    expect(block).toMatch(/--ed-boxmodel-(?:margin|border|padding|content)-label:\s*var\(--ed-(?:fg|fg-muted)\)/);
    const mix = (weight: number) => {
      const channels = (value: string) => {
        const hex = value.slice(1);
        const normalized = hex.length === 3 ? hex.replace(/./g, (part) => part + part) : hex;
        return [0, 2, 4].map((index) => Number.parseInt(normalized.slice(index, index + 2), 16));
      };
      const primary = channels(t['primary'] ?? '#000000');
      const surface = channels(t['surface'] ?? '#ffffff');
      return `#${primary
        .map((channel, index) =>
          Math.round(channel * weight + (surface[index] ?? 0) * (1 - weight))
            .toString(16)
            .padStart(2, '0'),
        )
        .join('')}`;
    };
    expect(contrastRatio(t['fg-muted'] ?? '', t['surface-2'] ?? '')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(t['border-strong'] ?? '', t['surface-2'] ?? '')).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(t['fg'] ?? '', mix(0.09))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(t['fg-muted'] ?? '', mix(0.18))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(t['primary'] ?? '', mix(0.09))).toBeGreaterThanOrEqual(3);
  });
  it('uses no literal hex colours in box model widget rules and keeps focused geometry readable', () => {
    const rules = source.match(/[^{}]*\.blx-box-model[^{}]*\{[^}]*\}/g)?.join('\n') ?? '';
    expect(rules).not.toMatch(/#[\da-f]{3,8}\b/i);
    expect(rules).toMatch(/\.blx-box-model-value input:focus\s*\{[^}]*min-inline-size:\s*52px;[^}]*font-size:\s*13px;/);
    expect(rules).toMatch(
      /\.blx-box-model-value input\s*\{[^}]*min-inline-size:\s*44px;[^}]*block-size:\s*24px;[^}]*font:[\s\S]*?500 12px/,
    );
    expect(rules).toMatch(/\.blx-box-model-diagram\s*\{[^}]*block-size:\s*228px/);
    expect(rules).toMatch(/\.blx-box-model-layer-border\s*\{[^}]*inset:\s*32px/);
    expect(rules).toMatch(/\.blx-box-model-layer-padding\s*\{[^}]*inset:\s*32px/);
    expect(rules).toMatch(/\.blx-box-model-block-start\s*\{[^}]*inset-inline-start:\s*50%/);
    expect(rules).toMatch(/\.blx-box-model-block-start\s*\{[^}]*inset-block-start:\s*4px/);
    expect(rules).toMatch(/\.blx-box-model-inline-end\s*\{[^}]*inset-inline-end:\s*2px/);
    expect(rules).toMatch(/\.blx-box-model-inline-start\s*\{[^}]*inset-inline-start:\s*2px/);
    expect(rules).not.toMatch(/\.blx-box-model-caption/);
    expect(rules).toMatch(/\.blx-box-model-content\s*\{[^}]*min-inline-size:\s*56px/);
    expect(rules).toMatch(/\.blx-box-model-legend-dot\s*\{[^}]*inline-size:\s*8px;[^}]*block-size:\s*8px/);
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
  it('uses shared inspector row variables and keeps rich text controls in flow', () => {
    expect(source).toMatch(
      /\.blx-selected-text-controls\s*\{[^}]*--blx-inspector-label-column:\s*84px;[^}]*--blx-inspector-control-gap:/,
    );
    expect(source).toContain('grid-template-columns: var(--blx-inspector-label-column) minmax(0, 1fr)');
    expect(source).toMatch(/\.blx-format-popover\s*\{[^}]*position:\s*static;/);
    const richRules =
      source.match(
        /[^{}]*\.blx-(?:selected-text-controls|selected-link-field|selected-color-field|rich-weight-segments|rich-text-style|text-formatting-controls)[^{}]*\{[^}]*\}/g,
      ) ?? [];
    expect(richRules.join('\n')).not.toMatch(/position:\s*absolute/);
  });

  it('keeps tooltip background, foreground, and border on explicit tokens', () => {
    expect(source).toMatch(/--ed-tooltip-bg:\s*color-mix\(in srgb, var\(--ed-header-bg\) 92%, white\)/);
    expect(source).toMatch(/--ed-tooltip-fg:\s*var\(--ed-header-fg\)/);
    expect(source).toMatch(/--ed-tooltip-muted:\s*var\(--ed-header-muted\)/);
    expect(source).toMatch(/--ed-tooltip-border:\s*color-mix\(in srgb, white 24%, var\(--ed-tooltip-bg\)\)/);
    expect(source).toMatch(/--ed-tooltip-shadow:\s*0 0 0 1px var\(--ed-tooltip-border\), 0 8px 24px/);
    expect(source).not.toMatch(/bg-ed-tooltip|text-ed-tooltip-fg/);
  });
  it.each(['light', 'dark'] as const)('%s tooltip title and muted text meet 4.5:1', (theme) => {
    const bg = tooltipColor(theme, 'bg');
    for (const role of ['fg', 'muted'] as const) {
      expect(contrastRatio(tooltipColor(theme, role), bg)).toBeGreaterThanOrEqual(4.5);
    }
  });
  it.each(['light', 'dark'] as const)('%s tooltip edge separates from header and panel surfaces', (theme) => {
    const bg = tooltipColor(theme, 'bg');
    const border = tooltipColor(theme, 'border');
    const header = tooltipColor(theme, 'header-bg');
    const panel = tooltipColor(theme, 'surface');
    const delta = Math.abs((relativeLuminance(bg) ?? 0) - (relativeLuminance(header) ?? 0));
    expect(delta >= 0.02 || (contrastRatio(border, header) ?? 0) >= 1.5).toBe(true);
    expect(contrastRatio(border, header)).toBeGreaterThanOrEqual(1.5);
    expect(contrastRatio(border, panel)).toBeGreaterThanOrEqual(1.5);
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
    expect(block).toMatch(/--ed-tooltip-bg:\s*(?:var\(|color-mix\()/);
    expect(block).toMatch(/--ed-tooltip-fg:\s*var\(/);
    expect(block).toMatch(/--ed-tooltip-muted:\s*(?:var\(|color-mix\()/);
    expect(block).toMatch(/--ed-tooltip-border:\s*color-mix\(/);
    expect(block).toMatch(/--ed-tooltip-shadow:\s*0 0 0 1px var\(--ed-tooltip-border\),/);
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

describe('editor motion contracts', () => {
  it.each([
    '--ed-motion-fast: 120ms',
    '--ed-motion-hover: 80ms',
    '--ed-motion-base: 160ms',
    '--ed-motion-slow: 200ms',
    '--ed-ease-standard:',
    '--ed-ease-emphasized:',
  ])('defines motion token %s', (token) => {
    expect(source).toContain(token);
  });
  it('uses token durations for every transition and animation declaration', () => {
    const declarations = [...source.matchAll(/\b(?:transition|animation):\s*([^;]+);/g)].map((match) => match[1] ?? '');
    expect(declarations.length).toBeGreaterThan(8);
    for (const declaration of declarations) {
      expect(declaration).toMatch(/var\(--ed-motion-(?:hover|fast|base|slow)\)/);
      expect(declaration).not.toMatch(/\b\d+(?:\.\d+)?\s*(?:ms|s)\b/);
    }
  });
  it('has one reduced motion block with duration overrides and transform suppression', () => {
    const blocks = source.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)/g) ?? [];
    expect(blocks).toHaveLength(1);
    const block = source.slice(source.indexOf(blocks[0] ?? ''));
    expect(block).toContain('--ed-motion-fast: 0.01ms');
    expect(block).toContain('--ed-motion-hover: 0.01ms');
    expect(block).toContain('--ed-motion-base: 0.01ms');
    expect(block).toContain('--ed-motion-slow: 0.01ms');
    expect(block).toContain('transform: none !important');
  });
  it.each([
    '.blx-body',
    ".blx-inspector-section [role='region']",
    '.blx-frame',
    '.blx-panel',
    '.blx-row-menu',
    '.ed-menu',
    "[role='tooltip']",
    '.blx-selection-toolbar',
    '.blx-selection-handles',
    '.blx-selection-overlay',
    '.blx-outline-item',
    '.blx-tree-toggle svg',
    '& button:active',
    '.ed-focus-ring',
    '.blx-skip',
    '.blx-inspector-section-heading button',
    '.ed-menu-item',
    "[role='status']",
  ])('includes chrome motion coverage for %s', (selector) => {
    expect(source).toContain(selector);
  });
  it('guards entrance keyframes until motion is ready', () => {
    expect(source).toMatch(/&\[data-motion-ready='true'\][^{]*\{\s*animation:/);
    expect(source).toContain("data-motion-ready='true'");
  });
  it('keeps the frame resize transition on inline-size and under 300ms', () => {
    expect(source).toMatch(/\.blx-frame \{[\s\S]*?\}/);
    expect(source).toContain('inline-size var(--ed-motion-slow)');
    expect(source).not.toContain('width: 200ms');
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
    for (const file of [
      'editor.js',
      'canvas.js',
      'richtext.js',
      'editor.css',
      'manifest.json',
      'editor.js.LEGAL.txt',
      'NOTICE.txt',
    ]) {
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
      richtextJs: 'richtext.js',
      richtextJsSha256: sha('richtext.js'),
    });
    expect(Object.keys(manifest)).toEqual([
      'version',
      'js',
      'css',
      'jsSha256',
      'cssSha256',
      'canvasJs',
      'canvasJsSha256',
      'richtextJs',
      'richtextJsSha256',
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
    const richtext = readFileSync(join(a, 'richtext.js'), 'utf8');
    expect(richtext).toContain('blx-richtext-root');
    expect(richtext).not.toMatch(
      /\beval\s*\(|new\s+Function|document\.write|localStorage|sessionStorage|indexedDB|fetch\s*\(|XMLHttpRequest|WebSocket|window\.open/,
    );
    expect(gzipSync(readFileSync(join(a, 'richtext.js'))).byteLength).toBeLessThan(200_000);
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
      ['@tiptap/core', 'MIT'],
      ['@tiptap/pm', 'MIT'],
      ['prosemirror-history', 'MIT'],
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

describe('editor token references', () => {
  it('only references --ed-* tokens that are defined (an undefined token renders transparent)', () => {
    const defined = new Set([...source.matchAll(/^\s*--ed-([a-z0-9-]+):/gm)].map((m) => m[1]));
    const used = [...source.matchAll(/var\(--ed-([a-z0-9-]+)/g)].map((m) => m[1] ?? '');
    expect([...new Set(used.filter((name) => !defined.has(name)))]).toEqual([]);
  });
});
