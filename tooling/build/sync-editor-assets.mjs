#!/usr/bin/env node
// Copies the built editor bundle (apps/editor/dist) into the Builder plugin (wordpress/plugin/assets/editor), where the PHP
// editor screen and the distributable package expect it. The copy is generated, git-ignored and verified against the
// manifest hashes, so a stale or tampered bundle is never shipped. Run through `pnpm build:editor`.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const from = join(root, 'apps', 'editor', 'dist');
const to = join(root, 'wordpress', 'plugin', 'assets', 'editor');
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

const manifestPath = join(from, 'manifest.json');
if (!existsSync(manifestPath))
  throw new Error('apps/editor/dist/manifest.json is missing; run `pnpm --filter @blixis/wp-editor run build` first');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (
  manifest.version !== 1 ||
  manifest.js !== 'editor.js' ||
  manifest.css !== 'editor.css' ||
  manifest.canvasJs !== 'canvas.js' ||
  manifest.richtextJs !== 'richtext.js'
) {
  throw new Error('unexpected editor manifest');
}
if (
  sha256(join(from, manifest.js)) !== manifest.jsSha256 ||
  sha256(join(from, manifest.css)) !== manifest.cssSha256 ||
  sha256(join(from, manifest.canvasJs)) !== manifest.canvasJsSha256 ||
  sha256(join(from, manifest.richtextJs)) !== manifest.richtextJsSha256
) {
  throw new Error('editor bundle does not match its manifest hashes');
}
rmSync(to, { recursive: true, force: true });
mkdirSync(to, { recursive: true });
// The third-party licence texts of what the bundle contains travel with it (ADR 0008 section 4).
for (const legal of ['NOTICE.txt', 'editor.js.LEGAL.txt']) {
  if (!existsSync(join(from, legal))) throw new Error(`apps/editor/dist/${legal} is missing; rebuild the editor`);
}
for (const name of [
  'editor.js',
  'editor.css',
  'canvas.js',
  'richtext.js',
  'manifest.json',
  'NOTICE.txt',
  'editor.js.LEGAL.txt',
  'richtext.js.LEGAL.txt',
])
  if (existsSync(join(from, name))) copyFileSync(join(from, name), join(to, name));
console.log(`editor assets copied to wordpress/plugin/assets/editor (${manifest.jsSha256.slice(0, 12)}…)`);
