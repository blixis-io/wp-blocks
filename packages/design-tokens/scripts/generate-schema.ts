// Generates schema/token-set.schema.json from the Zod schema. `--check` fails if the committed file is stale.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { CURRENT_TOKEN_SCHEMA_VERSION, TokenSetSchema } from '../src/schema.ts';

const target = join(dirname(fileURLToPath(import.meta.url)), '..', 'schema', 'token-set.schema.json');

export function generate(): string {
  const schema = z.toJSONSchema(TokenSetSchema, {
    target: 'draft-2020-12',
    io: 'input',
    unrepresentable: 'throw',
    reused: 'ref',
  });
  const out = {
    ...schema,
    $id: `urn:blixis:wp-blocks:token-set:${String(CURRENT_TOKEN_SCHEMA_VERSION)}`,
    title: 'Blixis design token set',
    description:
      'Generated from packages/design-tokens/src/schema.ts (do not edit). Shape only: value grammars, unique names and references are checked by validateTokenSet in @blixis/wp-style-engine.',
  };
  return `${JSON.stringify(out, null, 2)}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const text = generate();
  if (process.argv.includes('--check')) {
    if (readFileSync(target, 'utf8') !== text) {
      console.error(
        'schema/token-set.schema.json is stale: run `pnpm --filter @blixis/wp-design-tokens schema:generate`',
      );
      process.exit(1);
    }
    console.log('token-set.schema.json is up to date');
  } else {
    writeFileSync(target, text);
    console.log(`wrote ${target}`);
  }
}
