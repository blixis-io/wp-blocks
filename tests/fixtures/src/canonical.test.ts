import { describe, expect, it } from 'vitest';
import { assertFixtureValue, canonicalHash, canonicalJson, compareCodePoints } from './canonical.ts';

describe('canonicalJson', () => {
  it('sorts keys recursively and removes whitespace', () => {
    expect(canonicalJson({ b: 1, a: { z: [{ y: 2, x: 1 }], c: null } })).toBe(
      '{"a":{"c":null,"z":[{"x":1,"y":2}]},"b":1}',
    );
  });

  it('keeps empty objects and arrays', () => {
    expect(canonicalJson({ b: [], a: {} })).toBe('{"a":{},"b":[]}');
  });

  it('does not escape slashes or non-ASCII characters', () => {
    expect(canonicalJson({ k: 'a/b é 日本 😀' })).toBe('{"k":"a/b é 日本 😀"}');
  });

  it('is independent of key insertion order', () => {
    expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }));
    expect(canonicalHash({ a: 1, b: 2 })).toBe(canonicalHash({ b: 2, a: 1 }));
  });

  it('orders integer-like keys by bytes too, not numerically as JavaScript objects do', () => {
    expect(canonicalJson({ '2': 'a', '10': 'b', '1': 'c' })).toBe('{"1":"c","10":"b","2":"a"}');
  });

  it('orders keys by UTF-8 bytes, not UTF-16 code units', () => {
    // U+FF5E (BMP, 3 UTF-8 bytes) sorts before U+1F600 (astral, 4 bytes) in UTF-8 and code points, but after it in UTF-16.
    expect(compareCodePoints('～', '\u{1F600}')).toBeLessThan(0);
    expect(canonicalJson({ '\u{1F600}': 1, '～': 2 })).toBe('{"～":2,"\u{1F600}":1}');
  });
});

describe('assertFixtureValue', () => {
  it.each([
    ['float', { a: 1.5 }],
    ['float that looks like an integer', { a: 1e21 }],
    ['unsafe integer', { a: 2 ** 53 }],
    ['NaN', { a: Number.NaN }],
    ['undefined', { a: undefined }],
    ['function', { a: () => 1 }],
    ['bigint', { a: 1n }],
    ['non-NFC string', { a: 'é' }],
    ['non-NFC key', { é: 1 }],
    ['nested float', { a: [{ b: 0.1 }] }],
  ])('rejects %s', (_name, value) => {
    expect(() => assertFixtureValue(value)).toThrow();
  });

  it.each([
    ['null', null],
    ['booleans', [true, false]],
    ['safe integers', [0, -1, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER]],
    ['NFC text', 'é'],
    ['nesting', { a: [{ b: [null] }] }],
  ])('accepts %s', (_name, value) => {
    expect(() => assertFixtureValue(value)).not.toThrow();
  });
});
