import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDocument } from '@blixis/wp-core';
import { describe, expect, it } from 'vitest';
import { generate } from '../scripts/generate-manifest.ts';
import { checkDocumentStyles } from './document.ts';
import { PROPERTIES } from './properties.ts';
import { FORBIDDEN_CHARACTERS, parseValue } from './tokenize.ts';
import { sanitizeDeclarations, validateDeclaration, validateDeclarations } from './validate.ts';

/** Small seeded generator (mulberry32) so failures reproduce. */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PIECES = [
  'red',
  '#fff',
  '#12',
  '0',
  '1px',
  '-2px',
  '1.5rem',
  '50%',
  '100vh',
  '1fr',
  '45deg',
  '200ms',
  'auto',
  'none',
  'calc(',
  'min(',
  'clamp(',
  'rgb(',
  'var(--blx-a',
  'var(--evil',
  'url(',
  'linear-gradient(',
  'repeat(',
  ')',
  ',',
  '/',
  '*',
  '+',
  '-',
  ' ',
  ' ',
  ' ',
  ';',
  '{',
  '}',
  '\\',
  '/*',
  '*/',
  '"',
  "'",
  '@import',
  '!important',
  'expression(',
  'javascript',
  '\ud800',
  '\u00e9',
  '"Open Sans"',
  'cubic-bezier(',
  'steps(',
  ':',
  'e3',
  '--blx-x',
  'inset',
  'solid',
  'center',
];
const NAMES = [...PROPERTIES.keys(), '--blx-x', '--evil', 'behavior', '__proto__', 'constructor'];
const DANGEROUS = [/url\s*\(/i, /expression/i, /@/, /[;{}\\<>"'`!:]/, /\/\*/, /--(?!blx-)/];

describe('hardening', () => {
  it('never throws, never lets anything dangerous through, and is idempotent (seeded fuzz)', () => {
    const next = rng(20261014);
    let accepted = 0;
    for (let n = 0; n < 40_000; n += 1) {
      const pieces = Math.floor(next() * 10) + 1;
      let value = '';
      for (let i = 0; i < pieces; i += 1) value += PIECES[Math.floor(next() * PIECES.length)] ?? '';
      const name = NAMES[Math.floor(next() * NAMES.length)] ?? 'color';
      const result = validateDeclaration(name, value);
      if (!result.ok) continue;
      accepted += 1;
      for (const pattern of DANGEROUS)
        expect(pattern.test(result.value), `${name}: ${value} -> ${result.value}`).toBe(false);
      const again = validateDeclaration(name, result.value);
      expect(again, `${name}: ${value}`).toEqual({ ok: true, name, value: result.value });
    }
    expect(accepted).toBeGreaterThan(300);
  });

  it('every allow-listed property accepts its own default keyword form and rejects url()', () => {
    for (const name of PROPERTIES.keys()) {
      expect(validateDeclaration(name, 'url(https://x.example/a.png)').ok, name).toBe(false);
      expect(validateDeclaration(name, 'inherit').ok, name).toBe(true);
    }
  });

  it('is bounded: long, deep and wide values are refused quickly', () => {
    const started = Date.now();
    expect(validateDeclaration('width', 'calc('.repeat(40) + '1px' + ')'.repeat(40))).toMatchObject({
      ok: false,
      code: 'too-complex',
    });
    expect(validateDeclaration('width', '('.repeat(2000))).toMatchObject({ ok: false });
    expect(validateDeclaration('width', '1px '.repeat(600))).toMatchObject({ ok: false, code: 'value-too-long' });
    expect(validateDeclaration('width', '1px,'.repeat(300))).toMatchObject({ ok: false });
    expect(validateDeclaration('width', '1'.repeat(2049))).toMatchObject({ ok: false, code: 'value-too-long' });
    expect(validateDeclaration('width', '9'.repeat(20) + 'px')).toMatchObject({ ok: false });
    expect(validateDeclaration('color', 'a'.repeat(2000))).toMatchObject({ ok: false });
    expect(Date.now() - started).toBeLessThan(500);
  });

  it('accepts exactly eight levels of nesting and refuses nine', () => {
    const nest = (levels: number): string => 'calc('.repeat(levels) + '1px' + ')'.repeat(levels);
    expect(validateDeclaration('width', nest(8)).ok).toBe(true);
    expect(validateDeclaration('width', nest(10))).toMatchObject({ ok: false, code: 'too-complex' });
  });

  it('handles hostile names and non-string values without throwing', () => {
    for (const name of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', '', ' color', 'color ']) {
      expect(validateDeclaration(name, 'red').ok).toBe(false);
    }
    expect(validateDeclaration('width', Number.NaN).ok).toBe(false);
    expect(validateDeclaration('width', 1.5).ok).toBe(false);
    expect(validateDeclaration('width', 0)).toEqual({ ok: true, name: 'width', value: '0' });
    expect(validateDeclaration('color', '').ok).toBe(false);
    expect(validateDeclaration('color', '   ')).toMatchObject({ ok: false, code: 'empty-value' });
  });

  it('parses into a tree and serializes canonically', () => {
    const parsed = parseValue('RGB(0 0 0/ 50%)');
    expect(parsed.ok).toBe(true);
    expect(validateDeclaration('color', 'RGB(0 0 0/ 50%)')).toMatchObject({ ok: true, value: 'rgb(0 0 0 / 50%)' });
  });
});

describe('character and limit boundaries', () => {
  it.each(FORBIDDEN_CHARACTERS)('refuses %s in a value before any other rule applies', (c) => {
    expect(validateDeclaration('color', `red${c}`)).toMatchObject({ ok: false, code: 'forbidden-character' });
    expect(validateDeclaration('color', `${c}red`)).toMatchObject({ ok: false, code: 'forbidden-character' });
    if (c !== '"')
      expect(validateDeclaration('font-family', `serif${c}`)).toMatchObject({ ok: false, code: 'forbidden-character' });
  });

  it('refuses lone surrogates, non-ASCII and control characters', () => {
    for (const bad of [
      '\ud800',
      '\udc00',
      're\u00e9d',
      '\u202ered',
      'red\u0000',
      'red\u007f',
      'red\u0085',
      'red\u2028',
    ]) {
      expect(validateDeclaration('color', bad)).toMatchObject({ ok: false, code: 'forbidden-character' });
    }
  });

  it('counts digits exactly: ten are fine, eleven are not (with or without a fraction)', () => {
    expect(validateDeclaration('width', '1234567890px').ok).toBe(true);
    expect(validateDeclaration('width', '12345678901px').ok).toBe(false);
    expect(validateDeclaration('width', '12345.67890px').ok).toBe(true);
    expect(validateDeclaration('width', '12345.678901px').ok).toBe(false);
  });

  it('counts functions toward the component limit', () => {
    expect(parseValue('a,'.repeat(130))).toMatchObject({ ok: false, code: 'too-complex' });
    expect(parseValue('calc(1px) '.repeat(100))).toMatchObject({ ok: false, code: 'too-complex' });
  });
});

describe('var() as one term of a longer value', () => {
  it('has to fit the property grammar around it', () => {
    expect(validateDeclaration('border', '1px solid var(--blx-c)').ok).toBe(true);
    expect(validateDeclaration('padding', 'var(--blx-a) var(--blx-b) var(--blx-c) var(--blx-d)').ok).toBe(true);
    expect(validateDeclaration('padding', 'var(--blx-a) var(--blx-b) var(--blx-c) var(--blx-d) var(--blx-e)').ok).toBe(
      false,
    );
    expect(validateDeclaration('color', 'var(--blx-c) garbage').ok).toBe(false);
    expect(validateDeclaration('display', 'var(--blx-d)').ok).toBe(true);
    expect(validateDeclaration('display', 'var(--blx-d) flex').ok).toBe(false);
    expect(validateDeclaration('width', 'var(--evil)')).toMatchObject({ ok: false, code: 'invalid-var' });
  });
});

describe('sanitizeDeclarations and validateDeclarations', () => {
  it('keeps valid declarations in canonical form and name order, drops and reports the rest', () => {
    const result = sanitizeDeclarations({
      width: '10PX',
      color: 'RED',
      behavior: 'url(x)',
      margin: 'bad',
      'z-index': 3,
    });
    expect(result.declarations).toEqual({ color: 'red', width: '10px', 'z-index': '3' });
    expect(Object.keys(result.declarations)).toEqual(['color', 'width', 'z-index']);
    expect(result.issues.map((i) => [i.name, i.code])).toEqual([
      ['behavior', 'unknown-property'],
      ['margin', 'invalid-value'],
    ]);
    expect(validateDeclarations({ color: 'red' })).toEqual([]);
  });

  it('keeps an own __proto__ key out of the output', () => {
    const hostile = JSON.parse('{"__proto__": "red", "color": "red"}') as Record<string, string>;
    const result = sanitizeDeclarations(hostile);
    expect(Object.keys(result.declarations)).toEqual(['color']);
    expect(result.issues.map((i) => i.name)).toEqual(['__proto__']);
  });
});

describe('checkDocumentStyles', () => {
  const base = (style: unknown) => ({
    schemaVersion: 1,
    documentId: 'doc-001',
    layoutRevision: 1,
    defaultLocale: 'en_US',
    locales: ['en_US'],
    root: [
      {
        id: 'el-sec',
        type: 'blixis/section',
        props: {},
        children: [{ id: 'el-h', type: 'blixis/heading', props: {}, children: [], style }],
      },
    ],
    classListVersion: 0,
    classRefs: {},
    translations: { en_US: {} },
    metadata: { updatedAt: '2026-01-01T00:00:00Z', editorVersion: '0.0.0' },
  });
  const load = (style: unknown) => {
    const result = validateDocument(base(style));
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    return result.document;
  };

  it('accepts safe rules and reports unsafe declarations with their path', () => {
    expect(checkDocumentStyles(load([{ declarations: { color: 'red' } }]))).toEqual([]);
    const issues = checkDocumentStyles(
      load([
        { declarations: { color: 'red' } },
        { mode: 'dark', declarations: { 'background-image': 'url(javascript:alert(1))', width: '1px' } },
      ]),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: 'forbidden-character',
      path: '$.root[0].children[0].style[1].declarations.background-image',
    });
  });

  it('stops collecting at 50 issues', () => {
    const declarations: Record<string, string> = {};
    for (let i = 0; i < 60; i += 1) declarations[`x${String(i)}`] = 'red';
    const rules = [{ declarations }, { breakpoint: 'mobile', declarations }];
    expect(checkDocumentStyles(load(rules))).toHaveLength(50);
  });
});

describe('the manifest', () => {
  it('is up to date', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    expect(readFileSync(join(here, '..', 'manifest', 'css-properties.json'), 'utf8')).toBe(generate());
  });
});
