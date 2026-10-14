import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { generate } from '../scripts/generate-schema.ts';
import { TOKEN_CATEGORIES, TOKEN_LIMITS, TokenSetSchema, tokenProperty, tokenValueFor } from './schema.ts';

const here = dirname(fileURLToPath(import.meta.url));
const good = {
  schemaVersion: 1,
  tokenVersion: 3,
  tokens: [
    { name: 'color-primary', category: 'color', value: '#1a56db', dark: '#76a9fa', label: 'Primary' },
    { name: 'space-4', category: 'spacing', value: '1rem' },
  ],
};

describe('TokenSetSchema', () => {
  it('accepts a normal set and keeps unknown fields (forward compatibility)', () => {
    expect(TokenSetSchema.safeParse(good).success).toBe(true);
    const parsed = TokenSetSchema.safeParse({ ...good, future: { a: 1 } });
    expect(parsed.success && (parsed.data as Record<string, unknown>)['future']).toEqual({ a: 1 });
  });

  it('knows the seven categories of FR-004', () => {
    expect([...TOKEN_CATEGORIES]).toEqual([
      'color',
      'font-family',
      'font-size',
      'spacing',
      'radius',
      'container',
      'shadow',
    ]);
  });

  it.each([
    ['a wrong schema version', { ...good, schemaVersion: 2 }],
    ['a negative token version', { ...good, tokenVersion: -1 }],
    ['a decimal token version', { ...good, tokenVersion: 1.5 }],
    ['a missing tokens list', { schemaVersion: 1, tokenVersion: 0 }],
    ['an upper-case name', { ...good, tokens: [{ name: 'Color', category: 'color', value: 'red' }] }],
    ['a name with underscores', { ...good, tokens: [{ name: 'a_b', category: 'color', value: 'red' }] }],
    ['a name with a trailing hyphen', { ...good, tokens: [{ name: 'a-', category: 'color', value: 'red' }] }],
    ['a name that starts with a digit', { ...good, tokens: [{ name: '1a', category: 'color', value: 'red' }] }],
    ['a name that is too long', { ...good, tokens: [{ name: 'a'.repeat(49), category: 'color', value: 'red' }] }],
    ['an unknown category', { ...good, tokens: [{ name: 'a', category: 'animation', value: 'red' }] }],
    ['an empty value', { ...good, tokens: [{ name: 'a', category: 'color', value: '' }] }],
    ['a value that is too long', { ...good, tokens: [{ name: 'a', category: 'color', value: 'x'.repeat(513) }] }],
    ['an empty dark value', { ...good, tokens: [{ name: 'a', category: 'color', value: 'red', dark: '' }] }],
    ['a numeric value', { ...good, tokens: [{ name: 'a', category: 'spacing', value: 4 }] }],
    [
      'too many tokens',
      {
        ...good,
        tokens: Array.from({ length: TOKEN_LIMITS.maxTokens + 1 }, (_v, i) => ({
          name: `t${String(i)}`,
          category: 'color',
          value: 'red',
        })),
      },
    ],
  ])('rejects %s', (_name, input) => {
    expect(TokenSetSchema.safeParse(input).success).toBe(false);
  });

  it('exposes the custom property and the mode value of a token', () => {
    expect(tokenProperty('color-primary')).toBe('--blx-color-primary');
    expect(tokenValueFor({ value: 'a', dark: 'b' }, 'light')).toBe('a');
    expect(tokenValueFor({ value: 'a', dark: 'b' }, 'dark')).toBe('b');
    expect(tokenValueFor({ value: 'a' }, 'dark')).toBe('a');
  });

  it('matches the committed JSON Schema', () => {
    expect(readFileSync(join(here, '..', 'schema', 'token-set.schema.json'), 'utf8')).toBe(generate());
  });
});
