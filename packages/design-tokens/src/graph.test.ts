import { describe, expect, it } from 'vitest';
import { checkTokenSet, referencesIn, resolveToken, resolveTokens } from './graph.ts';
import type { Token } from './schema.ts';

/** An element the test knows exists. */
const get = <T>(list: readonly T[], index: number): T => {
  const value = list[index];
  if (value === undefined) throw new RangeError(`no element at ${String(index)}`);
  return value;
};
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

describe('resolveTokens: results do not depend on token order', () => {
  const chain = (n: number): Token[] =>
    Array.from({ length: n }, (_v, i) => t(`n${String(i)}`, i === n - 1 ? 'red' : `var(--blx-n${String(i + 1)})`));

  it('measures the depth of each chain itself: 16 tokens resolve, the 17th is too deep, wherever it appears', () => {
    const tokens = chain(17);
    const forward = resolveTokens({ tokens }, 'light');
    const backward = resolveTokens({ tokens: [...tokens].reverse() }, 'light');
    const shortFirst = resolveTokens(
      { tokens: [get(tokens, 16), get(tokens, 1), ...tokens.slice(2, 16), get(tokens, 0)] },
      'light',
    );
    for (const result of [forward, backward, shortFirst]) {
      expect(result.issues.map((i) => i.code)).toEqual(['reference-too-deep']);
      expect([...result.values.keys()].sort()).toEqual(
        tokens
          .slice(1)
          .map((x) => x.name)
          .sort(),
      );
    }
    expect(forward.issues[0]?.path).toBe('tokens[0].value');
  });

  it('gives identical results for any permutation of a set with every kind of problem', () => {
    const base: Token[] = [
      t('ok', 'red'),
      t('alias', 'var(--blx-ok)'),
      t('c1', 'var(--blx-c2)'),
      t('c2', 'var(--blx-c1)'),
      t('onc', 'var(--blx-c1)'),
      t('missing', 'var(--blx-nope)'),
      t('fb', 'var(--blx-nope, blue)'),
      t('self', 'var(--blx-self)'),
    ];
    const snapshot = (tokens: Token[]): string => {
      const r = resolveTokens({ tokens }, 'light');
      return JSON.stringify([
        [...r.values].sort(),
        r.issues.map((i) => `${i.code}:${tokens[Number(/\[(\d+)\]/.exec(i.path)?.[1])]?.name ?? '?'}`).sort(),
      ]);
    };
    const expected = snapshot(base);
    let seed = 11;
    for (let n = 0; n < 40; n += 1) {
      const shuffled = [...base];
      for (let i = shuffled.length - 1; i > 0; i -= 1) {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        const j = seed % (i + 1);
        [shuffled[i], shuffled[j]] = [get(shuffled, j), get(shuffled, i)];
      }
      expect(snapshot(shuffled)).toBe(expected);
    }
  });

  it('names the tokens on a cycle and the ones that depend on it', () => {
    const tokens = [t('a', 'var(--blx-b)'), t('b', 'var(--blx-a)'), t('user', 'var(--blx-a)')];
    const { issues } = resolveTokens({ tokens }, 'light');
    expect(issues.map((i) => i.message)).toEqual([
      'a, b refer back to each other',
      'a, b refer back to each other',
      'depends on "a", which cannot be resolved because of a reference cycle',
    ]);
  });

  it('stays fast when a diamond feeds a cycle', () => {
    const tokens: Token[] = [
      t('loop-a', 'var(--blx-loop-b)'),
      t('loop-b', 'var(--blx-loop-a)'),
      t('d0', 'var(--blx-loop-a)'),
    ];
    for (let i = 1; i <= 40; i += 1) {
      tokens.push(t(`d${String(i)}`, `min(var(--blx-d${String(i - 1)}), var(--blx-d${String(i - 1)}))`));
    }
    const started = Date.now();
    const { issues } = resolveTokens({ tokens }, 'light');
    expect(Date.now() - started).toBeLessThan(500);
    expect(issues).toHaveLength(tokens.length);
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
