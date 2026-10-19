import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';

const theme = new URL('../wordpress/theme/', import.meta.url);
const cssFiles = ['style.css', 'assets/css/theme.src.css'];
const templates = [
  '404.php',
  'archive.php',
  'comments.php',
  'footer.php',
  'header.php',
  'index.php',
  'page.php',
  'search.php',
  'single.php',
];
const parts = (await readdir(new URL('template-parts/', theme)))
  .filter((name) => name.endsWith('.php'))
  .map((name) => 'template-parts/' + name);

test('theme CSS and template classes use logical directions', async () => {
  for (const file of cssFiles) {
    const css = await readFile(new URL(file, theme), 'utf8');
    // Allow physical direction only on lines marked RTL-ALLOW with a reason.
    const lines = css.split('\n').filter((line) => !line.includes('RTL-ALLOW:'));
    assert.doesNotMatch(
      lines.join('\n'),
      /(?:^|[;{\s])(?:margin|padding|border(?:-(?:top|bottom))?)-(?:left|right)\s*:|(?:^|[;{\s])(?:left|right)\s*:|\bfloat\s*:\s*(?:left|right)\b|\btext-align\s*:\s*(?:left|right)\b/i,
      file,
    );
  }
  for (const file of [...templates, ...parts]) {
    const php = await readFile(new URL(file, theme), 'utf8');
    for (const match of php.matchAll(/\bclass\s*=\s*["']([^"']+)["']/g)) {
      for (const name of match[1].split(/\s+/))
        assert.doesNotMatch(
          name,
          /^(?:-?(?:ml|mr|pl|pr)|text-left|text-right|float-left|float-right|left|right)(?:-|$)/,
          file,
        );
    }
  }
});

test('theme text and background use semantic color tokens', async () => {
  const css =
    (await readFile(new URL('style.css', theme), 'utf8')) +
    (await readFile(new URL('assets/css/theme.src.css', theme), 'utf8'));
  assert.match(css, /background\s*:\s*var\(--blx-color-bg\)/);
  assert.match(css, /color\s*:\s*var\(--blx-color-text\)/);
  // COLOR-ALLOW: documented literal color exceptions may be added on their own line.
  assert.doesNotMatch(
    css
      .split('\n')
      .filter((line) => !line.includes('COLOR-ALLOW:'))
      .join('\n'),
    /#[0-9a-f]{3,8}\b/i,
  );
});

test('native forms use responsive token colors and visible keyboard focus', async () => {
  const css = await readFile(new URL('assets/css/theme.src.css', theme), 'utf8');
  assert.match(css, /form\[data-blx-form\]\s*\{[\s\S]*?display:\s*grid/);
  assert.match(css, /form\[data-blx-form\][\s\S]*?max-inline-size:\s*100%/);
  assert.match(css, /form\[data-blx-form\][\s\S]*?background:\s*var\(--blx-color-bg/);
  assert.match(css, /form\[data-blx-form\][\s\S]*?color:\s*var\(--blx-color-text/);
  assert.match(css, /form\[data-blx-form\][\s\S]*?:focus-visible\s*\{[\s\S]*?outline:\s*3px solid/);
  assert.match(css, /form\[data-blx-form\][\s\S]*?min-block-size:\s*2\.75rem/);
  assert.doesNotMatch(css, /form\[data-blx-form\][^}]*#[0-9a-f]{3,8}\b/i);
});
