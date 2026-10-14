// Generates schema/document.schema.json from the Zod schema (ADR 0003). `--check` fails if the committed file is stale.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { BuilderDocumentSchema, CURRENT_SCHEMA_VERSION } from '../src/schema/document.ts';

const target = join(dirname(fileURLToPath(import.meta.url)), '..', 'schema', 'document.schema.json');

export function generate(): string {
  const schema = z.toJSONSchema(BuilderDocumentSchema, {
    target: 'draft-2020-12',
    io: 'input',
    unrepresentable: 'throw',
    reused: 'ref',
  });
  const out = {
    ...schema,
    $id: `urn:blixis:wp-blocks:document:${String(CURRENT_SCHEMA_VERSION)}`,
    title: 'Blixis builder document',
    description:
      'Generated from packages/core/src/schema (do not edit). Shape only: unique ids, tree depth and size caps, NFC text and cross-references are checked by validateDocument.',
  };
  return `${JSON.stringify(out, null, 2)}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const text = generate();
  if (process.argv.includes('--check')) {
    if (readFileSync(target, 'utf8') !== text) {
      console.error('schema/document.schema.json is stale: run `pnpm --filter @blixis/wp-core schema:generate`');
      process.exit(1);
    }
    console.log('document.schema.json is up to date');
  } else {
    writeFileSync(target, text);
    console.log(`wrote ${target}`);
  }
}
