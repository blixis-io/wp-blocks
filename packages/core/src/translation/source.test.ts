import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Json } from '../schema/primitives.ts';
import { sourceDigest } from './source.ts';

interface Corpus {
  cases: { id: string; values: Record<string, Json>; propertyIds?: string[]; expected: string }[];
}
const corpus = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'corpus', 'source-digest.json'), 'utf8'),
) as Corpus;

describe('sourceDigest (shared with the PHP twin)', () => {
  it.each(corpus.cases.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    expect(sourceDigest(c.values, c.propertyIds)).toBe(c.expected);
  });

  it('ignores properties outside the list, so locale-specific values never change the marker', () => {
    expect(sourceDigest({ text: 'a', href: '/x' }, ['text'])).toBe(sourceDigest({ text: 'a', href: '/y' }, ['text']));
    expect(sourceDigest({ text: 'a', href: '/x' })).not.toBe(sourceDigest({ text: 'a', href: '/y' }));
  });

  it('changes when a counted value changes and is sixteen hex characters', () => {
    expect(sourceDigest({ text: 'a' })).toMatch(/^[0-9a-f]{16}$/);
    expect(sourceDigest({ text: 'a' })).not.toBe(sourceDigest({ text: 'b' }));
    expect(sourceDigest({ text: 'a' }, ['text'])).not.toBe(sourceDigest({ text: 'a ' }, ['text']));
  });

  it('treats prototype-named property ids as data', () => {
    const values = JSON.parse('{"toString":"a","constructor":"b"}') as Record<string, Json>;
    expect(sourceDigest(values, ['toString'])).not.toBe(sourceDigest(values, ['constructor']));
    expect(sourceDigest({}, ['toString'])).toBe(sourceDigest({}, []));
  });
});
