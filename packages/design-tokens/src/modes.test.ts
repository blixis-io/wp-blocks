import { describe, expect, it } from 'vitest';
import { resolveExpression } from './graph.ts';
import { resolveModes, sparseTokens } from './modes.ts';
import type { Token } from './schema.ts';

const t = (name: string, value: string, extra: Partial<Token> = {}): Token => ({
  name,
  category: 'color',
  value,
  ...extra,
});

describe('resolveModes', () => {
  const tokens = [
    t('brand', '#1a56db', { dark: '#76a9fa' }),
    t('text', 'var(--blx-brand)'),
    t('line', '#cccccc', { dark: '#cccccc' }),
    t('gap', '1rem', { category: 'spacing' }),
    t('pad', 'calc(var(--blx-gap) * 2)', { category: 'spacing' }),
  ];

  it('computes both modes at once and follows overrides through aliases without any copy', () => {
    const r = resolveModes({ tokens });
    expect(r.issues).toEqual([]);
    expect(Object.fromEntries(r.light)).toEqual({
      brand: '#1a56db',
      text: '#1a56db',
      line: '#cccccc',
      gap: '1rem',
      pad: 'calc(1rem * 2)',
    });
    expect(Object.fromEntries(r.dark)).toEqual({
      brand: '#76a9fa',
      text: '#76a9fa',
      line: '#cccccc',
      gap: '1rem',
      pad: 'calc(1rem * 2)',
    });
  });

  it('separates the sparse overrides from the tokens that merely follow them', () => {
    const r = resolveModes({ tokens });
    expect(r.overrides).toEqual(['brand']); // `line` repeats its base value, so it is no override
    expect(r.differing.sort()).toEqual(['brand', 'text']);
  });

  it('reports a problem once even when it exists in both modes, and keeps working tokens', () => {
    const r = resolveModes({ tokens: [t('a', 'var(--blx-nope)'), t('b', 'red')] });
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]?.code).toBe('unknown-reference');
    expect([...r.light.keys()]).toEqual(['b']);
    const dark = resolveModes({ tokens: [t('a', 'red', { dark: 'var(--blx-b)' }), t('b', 'var(--blx-a)')] });
    expect(dark.issues.map((i) => i.code)).toEqual(['reference-cycle', 'reference-cycle']);
    expect(dark.light.get('a')).toBe('red');
  });

  it('handles an empty set and many tokens quickly', () => {
    expect(resolveModes({ tokens: [] })).toEqual({
      light: new Map(),
      dark: new Map(),
      issues: [],
      overrides: [],
      differing: [],
    });
    const many = Array.from({ length: 500 }, (_v, i) =>
      t(`t${String(i)}`, i === 0 ? '#000000' : `var(--blx-t${String(i - 1)})`),
    );
    const started = Date.now();
    const r = resolveModes({ tokens: many });
    expect(Date.now() - started).toBeLessThan(500);
    expect(r.issues.some((i) => i.code === 'reference-too-deep')).toBe(true);
  });
});

describe('resolveModes: duplicates and fallbacks', () => {
  it('reports a repeated name and counts only the first definition', () => {
    const r = resolveModes({ tokens: [t('a', 'red', { dark: 'blue' }), t('a', 'green', { dark: 'black' })] });
    expect(r.issues.map((i) => i.code)).toEqual(['duplicate-name']);
    expect(r.overrides).toEqual(['a']);
    expect(r.light.get('a')).toBe('red');
    expect(r.dark.get('a')).toBe('blue');
  });

  it('treats a reference inside a fallback as a dependency even when the fallback would not be used (conservative)', () => {
    const r = resolveModes({ tokens: [t('a', 'var(--blx-b, var(--blx-a))'), t('b', 'red')] });
    expect(r.issues.map((i) => i.code)).toEqual(['reference-cycle']);
    expect([...r.light.keys()]).toEqual(['b']);
  });
});

describe('sparseTokens', () => {
  it('drops dark values equal to the base value and keeps everything else, order included', () => {
    const input = [t('a', 'red', { dark: 'red' }), t('b', 'red', { dark: 'blue' }), t('c', 'red')];
    const out = sparseTokens(input);
    expect(out.map((x) => x.name)).toEqual(['a', 'b', 'c']);
    expect(out[0] && 'dark' in out[0]).toBe(false);
    expect(out[1]?.dark).toBe('blue');
    expect(input[0]?.dark).toBe('red'); // the input is not modified
  });
});

describe('resolveExpression', () => {
  const tokens = [t('brand', '#1a56db', { dark: '#76a9fa' }), t('gap', '1rem', { category: 'spacing' })];

  it('shows a value that uses tokens as it is in each mode', () => {
    expect(resolveExpression({ tokens }, 'var(--blx-brand)', 'light')).toEqual({ ok: true, value: '#1a56db' });
    expect(resolveExpression({ tokens }, 'var(--blx-brand)', 'dark')).toEqual({ ok: true, value: '#76a9fa' });
    expect(resolveExpression({ tokens }, 'calc(var(--blx-gap) + 2px)', 'dark')).toEqual({
      ok: true,
      value: 'calc(1rem + 2px)',
    });
    expect(resolveExpression({ tokens }, 'red', 'dark')).toEqual({ ok: true, value: 'red' });
    expect(resolveExpression({ tokens }, 'var(--blx-missing, blue)', 'dark')).toEqual({ ok: true, value: 'blue' });
  });

  it('explains what cannot be resolved and does not collide with a token of the same name', () => {
    const failed = resolveExpression({ tokens }, 'var(--blx-missing)', 'light');
    expect(failed.ok).toBe(false);
    if (!failed.ok) expect(failed.issue).toMatchObject({ code: 'unknown-reference', path: 'value' });
    const clash = [t('preview-value', 'green'), ...tokens];
    expect(resolveExpression({ tokens: clash }, 'var(--blx-preview-value)', 'light')).toEqual({
      ok: true,
      value: 'green',
    });
  });
});
