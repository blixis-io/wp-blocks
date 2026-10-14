// Generates schema/token-set.schema.json from the Zod schema. `--check` fails if the committed file is stale.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  CURRENT_PRESET_SCHEMA_VERSION,
  CURRENT_TOKEN_SCHEMA_VERSION,
  PresetSchema,
  TokenSetSchema,
} from '../src/schema.ts';

const directory = join(dirname(fileURLToPath(import.meta.url)), '..', 'schema');

function generateSchema(
  schema: typeof TokenSetSchema | typeof PresetSchema,
  id: string,
  title: string,
  description: string,
): string {
  const json = z.toJSONSchema(schema, {
    target: 'draft-2020-12',
    io: 'input',
    unrepresentable: 'throw',
    reused: 'ref',
  });
  const out = {
    ...json,
    $id: id,
    title,
    description,
  };
  return `${JSON.stringify(out, null, 2)}\n`;
}

export function generate(): string {
  return generateSchema(
    TokenSetSchema,
    `urn:blixis:wp-blocks:token-set:${String(CURRENT_TOKEN_SCHEMA_VERSION)}`,
    'Blixis design token set',
    'Generated from packages/design-tokens/src/schema.ts (do not edit). Shape only: value grammars, unique names and references are checked by validateTokenSet in @blixis/wp-style-engine.',
  );
}

export function generatePresetSchema(): string {
  return generateSchema(
    PresetSchema,
    `urn:blixis:wp-blocks:preset:${String(CURRENT_PRESET_SCHEMA_VERSION)}`,
    'Blixis design preset',
    'Generated from packages/design-tokens/src/schema.ts (do not edit). Shape only: CSS value grammars, unique names and references are checked by validateTokenSet in @blixis/wp-style-engine; contrast is checked by checkPresetAccessibility.',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const outputs = [
    ['token-set.schema.json', generate()],
    ['preset.schema.json', generatePresetSchema()],
  ] as const;
  for (const [name, content] of outputs) {
    const target = join(directory, name);
    if (process.argv.includes('--check')) {
      if (readFileSync(target, 'utf8') !== content) {
        console.error(`${name} is stale: run \`pnpm --filter @blixis/wp-design-tokens schema:generate\``);
        process.exit(1);
      }
      console.log(`${name} is up to date`);
    } else {
      writeFileSync(target, content);
      console.log(`wrote ${target}`);
    }
  }
}
