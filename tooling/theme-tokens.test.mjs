import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import prettier from 'prettier';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const theme = join(root, 'wordpress/theme');

test('theme.json and token CSS are current, parseable and map palette slugs to tokens', async () => {
  const temp = mkdtempSync(join(tmpdir(), 'blx-theme-tokens-'));
  try {
    const jsonPath = join(temp, 'theme.json');
    const cssPath = join(temp, 'tokens.css');
    const result = spawnSync(process.execPath, ['build-tokens.mjs', jsonPath, cssPath], {
      cwd: theme,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
    const json = readFileSync(jsonPath, 'utf8');
    const css = readFileSync(cssPath, 'utf8');
    assert.equal(json, readFileSync(join(theme, 'theme.json'), 'utf8'), 'theme.json is stale');
    assert.equal(css, readFileSync(join(theme, 'assets/css/tokens.css'), 'utf8'), 'tokens.css is stale');
    const parsed = JSON.parse(json);
    assert.equal(parsed.version, 3);
    assert.equal(parsed.$schema, 'https://schemas.wp.org/wp/7.0/theme.json');
    const source = JSON.parse(readFileSync(join(theme, 'design/default-tokens.json'), 'utf8'));
    const tokens = new Map(source.tokens.map((token) => [token.name, token]));
    for (const entry of parsed.settings.color.palette) {
      assert.equal(tokens.get(entry.slug)?.category, 'color');
      assert.equal(entry.color, `var(--blx-${entry.slug})`);
    }
    for (const [entries, category, field] of [
      [parsed.settings.typography.fontSizes, 'font-size', 'size'],
      [parsed.settings.typography.fontFamilies, 'font-family', 'fontFamily'],
      [parsed.settings.spacing.spacingSizes, 'spacing', 'size'],
    ]) {
      for (const entry of entries) {
        assert.equal(tokens.get(entry.slug)?.category, category);
        assert.equal(entry[field], `var(--blx-${entry.slug})`);
      }
    }
    assert.equal(parsed.settings.layout.contentSize, 'var(--blx-container-content)');
    assert.equal(parsed.settings.layout.wideSize, 'var(--blx-container-wide)');
    assert.match(css, /^\/\*blx-css:\d+\*\/\n@layer blx\.theme,blx\.tokens,/);
    assert.match(css, /:where\(:root\)/);
    assert.match(css, /:where\(html\[data-theme="dark"\]\)/);
    assert.match(css, /prefers-color-scheme:dark/);
    await prettier.format(css, { parser: 'css' });
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
