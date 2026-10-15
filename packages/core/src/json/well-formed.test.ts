import { afterEach, describe, expect, it } from 'vitest';
import { isWellFormed } from './well-formed.ts';

const proto = String.prototype as { isWellFormed?: () => boolean };
const native = proto.isWellFormed;

const corpus: string[] = [
  '',
  'plain ascii',
  'café über',
  '😀',
  'a😀b😀',
  '\uD800',
  '\uDBFF',
  '\uDC00',
  '\uDFFF',
  'a\uD800',
  '\uD800a',
  '\uDC00a',
  'a\uDC00',
  '\uDC00\uD800',
  '\uD800𐀀',
  '𐀀\uDC00',
  '\uDC00\uDC00',
  '\uD800\uD800',
  '\u{10FFFF}\u{1F600}',
  'x'.repeat(100_000),
  '\u{1F600}'.repeat(50_000),
  `${'\u{1F600}'.repeat(50_000)}\uD800`,
  `\uDC00${'ab'.repeat(50_000)}`,
];

afterEach(() => {
  if (native === undefined) delete proto.isWellFormed;
  else proto.isWellFormed = native;
});

describe('isWellFormed', () => {
  it('has the native method available to compare against (Node >= 20)', () => {
    expect(typeof native).toBe('function');
  });

  it.each(corpus.map((s, i) => [i, s] as const))('matches the native method on corpus entry %i', (_i, s) => {
    expect(isWellFormed(s)).toBe(native?.call(s));
  });

  it.each(corpus.map((s, i) => [i, s] as const))('matches the native method without it on entry %i', (_i, s) => {
    const expected = native?.call(s);
    delete proto.isWellFormed;
    expect(typeof ''.isWellFormed).toBe('undefined');
    expect(isWellFormed(s)).toBe(expected);
  });

  it('matches the native method on every single code unit and pair of code units', () => {
    const units = [0x41, 0xd7ff, 0xd800, 0xdbff, 0xdc00, 0xdfff, 0xe000];
    const strings: string[] = [];
    for (const a of units) {
      strings.push(String.fromCharCode(a));
      for (const b of units) {
        strings.push(String.fromCharCode(a, b));
        for (const c of units) strings.push(String.fromCharCode(a, b, c));
      }
    }
    const expected = strings.map((s) => native?.call(s));
    delete proto.isWellFormed;
    strings.forEach((s, i) => {
      expect(isWellFormed(s)).toBe(expected[i]);
    });
  });
});
