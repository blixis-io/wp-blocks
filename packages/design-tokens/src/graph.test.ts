import { describe, expect, it } from 'vitest';
import { checkTokenSet, referencesIn, resolveToken, resolveTokens } from './graph.ts';
import type { Token } from './schema.ts';

const t = (name: string, value: string, extra: Partial<Token> = {}): Token => ({
  name,
  category: 'color',
  value,
  ...extra,
});

describe('referencesIn', () => {
  it('lists referenced tokens in order, including fallbacks, without duplicates', () => {
    expect(referencesIn('var(--blx-a)')).toEqual(['a']);
    expect(referencesIn('calc(var(--blx-a) + var(--blx-b) * 2)')).toEqual(['a', 'b']);
    expect(referencesIn('var(--blx-a, var(--blx-b, 1px)) var(--blx-a)')).toEqual(['a', 'b']);
    expect(referencesIn('red')).toEqual([]);
    expect(referencesIn('var(--other)')).toEqual([]);
    expect(referencesIn('var(--blx-a')).toEqual([]);
  });
});

describe('resolveTokens', () => {
  it('follows alias chains and substitutes into composite values', () => {
    const tokens = [
      t('brand', '#1a56db'),
      t('primary', 'var(--blx-brand)'),
      t('gap', '1rem', { category: 'spacing' }),
      t('pad', 'clamp(var(--blx-gap), 2vw, calc(var(--blx-gap) * 2))', { category: 'spacing' }),
    ];
    const { values, issues } = resolveTokens({ tokens }, 'light');
    expect(issues).toEqual([]);
    expect(values.get('primary')).toBe('#1a56db');
    expect(values.get('pad')).toBe('clamp(1rem, 2vw, calc(1rem * 2))');
  });

  it('uses the dark value per mode and shares everything else', () => {
    const tokens = [t('brand', '#111111', { dark: '#eeeeee' }), t('text', 'var(--blx-brand)'), t('line', '#cccccc')];
    expect(resolveTokens({ tokens }, 'light').values.get('text')).toBe('#111111');
    expect(resolveTokens({ tokens }, 'dark').values.get('text')).toBe('#eeeeee');
    expect(resolveTokens({ tokens }, 'dark').values.get('line')).toBe('#cccccc');
  });

  it('uses a fallback only when the token does not exist', () => {
    const tokens = [t('a', 'var(--blx-missing, #fff)'), t('b', 'var(--blx-a, #000)'), t('c', 'var(--blx-missing)')];
    const { values, issues } = resolveTokens({ tokens }, 'light');
    expect(values.get('a')).toBe('#fff');
    expect(values.get('b')).toBe('#fff');
    expect(issues).toEqual([
      { code: 'unknown-reference', path: 'tokens[2].value', message: 'the token "missing" does not exist' },
    ]);
  });

  it('reports cycles for every token on the cycle and keeps the others', () => {
    const tokens = [t('a', 'var(--blx-b)'), t('b', 'var(--blx-c)'), t('c', 'var(--blx-a)'), t('ok', 'red')];
    const { values, issues } = resolveTokens({ tokens }, 'light');
    expect(issues.map((i) => i.code)).toEqual(['reference-cycle', 'reference-cycle', 'reference-cycle']);
    expect([...values.keys()]).toEqual(['ok']);
    expect(resolveTokens({ tokens: [t('self', 'var(--blx-self)')] }, 'light').issues[0]?.code).toBe('reference-cycle');
  });

  it('finds a cycle that exists only in dark mode', () => {
    const tokens = [t('a', 'red', { dark: 'var(--blx-b)' }), t('b', 'var(--blx-a)')];
    expect(resolveTokens({ tokens }, 'light').issues).toEqual([]);
    const dark = resolveTokens({ tokens }, 'dark').issues;
    expect(dark.map((i) => i.code)).toEqual(['reference-cycle', 'reference-cycle']);
    expect(dark[0]?.path).toBe('tokens[0].dark');
    expect(checkTokenSet({ tokens }).filter((i) => i.code === 'reference-cycle')).toHaveLength(2);
  });

  it('limits chain depth and expansion size', () => {
    const chain = Array.from({ length: 40 }, (_v, i) =>
      t(`n${String(i)}`, i === 39 ? 'red' : `var(--blx-n${String(i + 1)})`),
    );
    expect(resolveTokens({ tokens: chain }, 'light').issues.map((i) => i.code)).toContain('reference-too-deep');
    const blowup: Token[] = [t('x0', 'abcdefghij')];
    for (let i = 1; i <= 12; i += 1)
      blowup.push(
        t(`x${String(i)}`, `var(--blx-x${String(i - 1)}) var(--blx-x${String(i - 1)}) var(--blx-x${String(i - 1)})`),
      );
    const result = resolveTokens({ tokens: blowup }, 'light');
    expect(result.issues.some((i) => i.code === 'expansion-too-large')).toBe(true);
  });

  it('resolves diamonds quickly (memoized)', () => {
    const tokens: Token[] = [t('d0', '1px', { category: 'spacing' })];
    for (let i = 1; i <= 14; i += 1) {
      tokens.push(
        t(`d${String(i)}`, `min(var(--blx-d${String(i - 1)}), var(--blx-d${String(i - 1)}))`, { category: 'spacing' }),
      );
    }
    const started = Date.now();
    resolveTokens({ tokens }, 'light');
    expect(Date.now() - started).toBeLessThan(500);
  });

  it('refuses a reference that is not a token reference', () => {
    expect(resolveTokens({ tokens: [t('a', 'var(--evil)')] }, 'light').issues[0]?.code).toBe('invalid-reference');
    expect(resolveTokens({ tokens: [t('a', 'var(x y)')] }, 'light').issues[0]?.code).toBe('invalid-reference');
  });
});

describe('checkTokenSet and resolveToken', () => {
  it('reports duplicate names once and uses the first token', () => {
    const tokens = [t('a', 'red'), t('a', 'blue'), t('b', 'var(--blx-a)')];
    expect(checkTokenSet({ tokens })).toEqual([
      { code: 'duplicate-name', path: 'tokens[1].name', message: 'the name "a" is used twice' },
    ]);
    expect(resolveToken({ tokens }, 'b', 'light')).toEqual({ ok: true, value: 'red' });
  });

  it('explains why a token cannot be resolved', () => {
    const tokens = [t('a', 'var(--blx-b)'), t('b', 'var(--blx-a)')];
    const result = resolveToken({ tokens }, 'a', 'light');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issue.code).toBe('reference-cycle');
    const missing = resolveToken({ tokens }, 'zzz', 'light');
    expect(missing.ok).toBe(false);
  });
});
