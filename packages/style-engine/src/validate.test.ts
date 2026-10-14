import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { validateDeclaration } from './validate.ts';

interface Corpus {
  valid: { name: string; value: string | number; normalized: string }[];
  invalid: { name: string; value: string; code: string }[];
}
const corpus = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'corpus', 'declarations.json'), 'utf8'),
) as Corpus;

describe('the declaration corpus (shared with the PHP twin)', () => {
  it.each(corpus.valid.map((c) => [c.name, String(c.value), c] as const))('accepts %s: %s', (_n, _v, c) => {
    const result = validateDeclaration(c.name, c.value);
    expect(result).toEqual({ ok: true, name: c.name, value: c.normalized });
  });

  it.each(corpus.invalid.map((c) => [c.name, JSON.stringify(c.value), c] as const))('rejects %s: %s', (_n, _v, c) => {
    const result = validateDeclaration(c.name, c.value);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(c.code);
  });

  it('has a meaningful corpus', () => {
    expect(corpus.valid.length).toBeGreaterThan(80);
    expect(corpus.invalid.length).toBeGreaterThan(120);
  });
});
