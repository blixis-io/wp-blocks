// Generates manifest/core-elements.json from the core registry: the JSON description of the six core elements that the PHP
// side (renderers, REST GET /elements) consumes. `--check` fails if the committed file is stale.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '@blixis/wp-core';
import { createCoreRegistry } from '../src/core-elements.ts';

const target = join(dirname(fileURLToPath(import.meta.url)), '..', 'manifest', 'core-elements.json');

export function generate(): string {
  // Canonical JSON (sorted keys) re-indented for review: identical on every machine and in PHP.
  return `${JSON.stringify(JSON.parse(canonicalJson(createCoreRegistry().manifest())), null, 2)}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const text = generate();
  if (process.argv.includes('--check')) {
    if (readFileSync(target, 'utf8') !== text) {
      console.error(
        'manifest/core-elements.json is stale: run `pnpm --filter @blixis/wp-element-registry manifest:generate`',
      );
      process.exit(1);
    }
    console.log('core-elements.json is up to date');
  } else {
    writeFileSync(target, text);
    console.log(`wrote ${target}`);
  }
}
