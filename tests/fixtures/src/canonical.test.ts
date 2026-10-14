import { describe, expect, it } from 'vitest';
import { assertFixtureValue, canonicalHash, canonicalJson, compareCodePoints } from './canonical.ts';

/** Builds text from code points so editors and Prettier can never rewrite or hide special characters. */
const cp = (...codes: number[]): string => String.fromCodePoint(...codes);

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
    const text = `a/b ${cp(0xe9)} ${cp(0x65e5, 0x672c)} ${cp(0x1f600)}`;
    expect(canonicalJson({ k: text })).toBe(`{"k":"${text}"}`);
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
    expect(compareCodePoints(cp(0xff5e), cp(0x1f600))).toBeLessThan(0);
    expect(canonicalJson({ [cp(0x1f600)]: 1, [cp(0xff5e)]: 2 })).toBe(`{"${cp(0xff5e)}":2,"${cp(0x1f600)}":1}`);
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
    ['non-NFC string', { a: 'e' + cp(0x301) }],
    ['non-NFC key', { ['e' + cp(0x301)]: 1 }],
    ['lone surrogate', { a: '\ud800' }],
    ['lone surrogate key', { '\udc00': 1 }],
    ['nested float', { a: [{ b: 0.1 }] }],
    ['sparse array', new Array(2)],
    ['array with an extra property', Object.assign([1], { extra: true })],
    ['class instance', new Date(0)],
    ['Map', new Map()],
    ['object with a symbol key', { [Symbol('s')]: 1 }],
    ['object with a non-enumerable property', Object.defineProperty({}, 'hidden', { value: 1, enumerable: false })],
  ])('rejects %s', (_name, value) => {
    expect(() => assertFixtureValue(value)).toThrow();
  });

  it.each([
    ['null', null],
    ['booleans', [true, false]],
    ['safe integers', [0, -1, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER]],
    ['NFC text', cp(0xe9)],
    ['nesting', { a: [{ b: [null] }] }],
    ['an object without a prototype', Object.assign(Object.create(null) as object, { a: 1 })],
    ['a __proto__ key from JSON', JSON.parse('{"__proto__":1}') as unknown],
  ])('accepts %s', (_name, value) => {
    expect(() => assertFixtureValue(value)).not.toThrow();
  });
});
