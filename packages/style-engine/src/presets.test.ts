import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkPresetAccessibility,
  CUSTOM_PRESET_ID,
  PRESET_SEMANTIC_COLORS,
  PresetSchema,
} from '@blixis/wp-design-tokens';
import { expect, test } from 'vitest';
import { validateTokenSet } from './tokens.ts';

const directory = fileURLToPath(new URL('../../../wordpress/theme/design/presets/', import.meta.url));

test('all four named seeds have valid, accessible token sets in both modes', () => {
  const files = readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .sort();
  expect(files).toEqual(['forest.json', 'minimal.json', 'ocean.json', 'sunset.json']);
  const ids = new Set<string>([CUSTOM_PRESET_ID]);
  for (const file of files) {
    const input: unknown = JSON.parse(readFileSync(join(directory, file), 'utf8'));
    const preset = PresetSchema.parse(input);
    expect(file).toBe(`${preset.id}.json`);
    expect(ids.has(preset.id)).toBe(false);
    ids.add(preset.id);
    const result = validateTokenSet({ schemaVersion: 1, tokenVersion: 1, tokens: preset.tokens });
    expect(result.ok ? [] : result.issues).toEqual([]);
    expect(checkPresetAccessibility(preset)).toEqual([]);
    for (const name of PRESET_SEMANTIC_COLORS) {
      expect(preset.tokens.find((token) => token.name === name)?.dark).toBeTruthy();
    }
  }
});
