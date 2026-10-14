import { describe, expect, it } from 'vitest';
import { MAX_DEPTH, assertStrictJson } from './strict-json.ts';

// The same inputs are rejected by the PHP implementation (tooling/php/tests/FixturesTest.php).
export const REJECTED: [string, string][] = [
  ['1.0', '{"a":1.0}'],
  ['1e3', '{"a":1e3}'],
  ['-0', '{"a":-0}'],
  ['-0.0', '{"a":-0.0}'],
  ['unsafe integer', '{"a":9007199254740992}'],
  ['duplicate key', '{"a":1,"a":2}'],
  ['duplicate nested key', '{"x":{"a":1,"a":1}}'],
  ['lone high surrogate', '{"a":"\\ud800"}'],
  ['lone low surrogate', '{"\\udc00":1}'],
  ['trailing comma', '[1,]'],
  ['single quotes', "{'a':1}"],
  ['trailing content', '{} {}'],
  ['unquoted key', '{a:1}'],
  ['raw control char', '["a\tb"]'],
  ['leading zero', '[01]'],
  ['plus sign', '[+1]'],
];

describe('assertStrictJson', () => {
  it.each(REJECTED)('rejects %s', (_name, text) => {
    expect(() => {
      assertStrictJson(text);
    }).toThrow();
  });

  it.each([
    ['empty containers', '{"a":{},"b":[]}'],
    ['safe integer limits', '[9007199254740991,-9007199254740991,0]'],
    ['escapes and paired surrogates', '{"a":"\\n\\u00e9\\ud83d\\ude00\\"\\\\"}'],
    ['whitespace', ' \n\t { "a" : [ 1 , 2 ] } \n'],
    ['same key in different objects', '{"a":{"x":1},"b":{"x":2}}'],
    ['literals', '[true,false,null]'],
  ])('accepts %s', (_name, text) => {
    expect(() => {
      assertStrictJson(text);
    }).not.toThrow();
  });

  it('shares the nesting limit with PHP: 64 levels pass, 65 fail', () => {
    expect(MAX_DEPTH).toBe(64);
    expect(() => {
      assertStrictJson('['.repeat(64) + ']'.repeat(64));
    }).not.toThrow();
    expect(() => {
      assertStrictJson('['.repeat(65) + ']'.repeat(65));
    }).toThrow(/nesting/);
    expect(() => {
      assertStrictJson('{"a":'.repeat(64) + '1' + '}'.repeat(64));
    }).not.toThrow();
  });
});
