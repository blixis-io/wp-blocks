import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
for (const [sourcePath, targetPath] of [
  ['packages/element-registry/manifest/core-elements.json', 'wordpress/plugin/data/core-elements.json'],
  ['packages/style-engine/manifest/css-properties.json', 'wordpress/plugin/data/css-properties.json'],
]) {
  const expected = await readFile(path.join(root, sourcePath), 'utf8');
  const target = path.join(root, targetPath);
  if (process.argv.includes('--check')) {
    let actual = '';
    try {
      actual = await readFile(target, 'utf8');
    } catch {
      // A missing generated copy is stale.
    }
    if (actual !== expected) {
      throw new Error(`Plugin manifest ${targetPath} is stale; run pnpm sync:plugin-manifest`);
    }
  } else {
    await writeFile(target, expected);
  }
}
