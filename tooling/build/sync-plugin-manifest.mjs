import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = path.join(root, 'packages/element-registry/manifest/core-elements.json');
const target = path.join(root, 'wordpress/plugin/data/core-elements.json');
const expected = await readFile(source, 'utf8');
if (process.argv.includes('--check')) {
  let actual = '';
  try {
    actual = await readFile(target, 'utf8');
  } catch {
    // A missing generated copy is stale.
  }
  if (actual !== expected) {
    throw new Error('Plugin core element manifest is stale; run pnpm sync:plugin-manifest');
  }
} else {
  await writeFile(target, expected);
}
