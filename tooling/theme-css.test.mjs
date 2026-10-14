import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const theme = join(root, 'wordpress/theme');

test('theme CSS is current and scans only theme PHP templates', () => {
  const temp = mkdtempSync(join(tmpdir(), 'blx-theme-css-'));
  try {
    const output = join(temp, 'theme.css');
    const cli = process.env.BLX_TAILWIND_BIN ?? join(theme, 'node_modules/.bin/tailwindcss');
    const result = spawnSync(cli, ['-i', 'assets/css/theme.src.css', '-o', output, '--minify'], {
      cwd: theme,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
    const css = readFileSync(output, 'utf8');
    assert.equal(css, readFileSync(join(theme, 'assets/css/theme.css'), 'utf8'), 'theme.css is stale');
    assert.match(css, /\.max-w-6xl\b/);
    assert.match(readFileSync(join(root, 'tooling/fixtures/tailwind-outside.php'), 'utf8'), /bg-fuchsia-700/);
    assert.doesNotMatch(css, /\.bg-fuchsia-700\b/, 'class from outside theme source was included');
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
