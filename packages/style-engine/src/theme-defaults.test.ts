import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { validateTokenSet } from './tokens.ts';

test('the shipped theme defaults are a valid version-one token set', () => {
  const input: unknown = JSON.parse(
    readFileSync(
      fileURLToPath(new URL('../../../wordpress/theme/design/default-tokens.json', import.meta.url)),
      'utf8',
    ),
  );
  const result = validateTokenSet(input);
  expect(result.ok ? result.set.schemaVersion : result.issues).toEqual(1);
  if (result.ok) {
    expect(result.set.tokenVersion).toBe(1);
    expect(new Set(result.set.tokens.map((token) => token.category))).toEqual(
      new Set(['color', 'font-family', 'font-size', 'spacing', 'radius', 'container', 'shadow']),
    );
  }
});
