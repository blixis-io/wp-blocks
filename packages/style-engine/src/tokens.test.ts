import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTokens } from '@blixis/wp-design-tokens';
import { describe, expect, it } from 'vitest';
import { parse, resolveRoot } from './cascade.test-helper.ts';
import { compile } from './compile.ts';
import { TOKEN_GRAMMAR, tokensForCompile, validateTokenSet } from './tokens.ts';

const set = (tokens: unknown[], extra: Record<string, unknown> = {}): unknown => ({
  schemaVersion: 1,
  tokenVersion: 1,
  tokens,
  ...extra,
});
const codes = (input: unknown): string[] => {
  const result = validateTokenSet(input);
  return result.ok ? [] : result.issues.map((i) => i.code);
};

const GOOD = set([
  { name: 'color-primary', category: 'color', value: '#1a56db', dark: '#76a9fa' },
  { name: 'color-link', category: 'color', value: 'var(--blx-color-primary)' },
  { name: 'font-body', category: 'font-family', value: '"Source Sans 3", system-ui, sans-serif' },
  { name: 'text-base', category: 'font-size', value: 'clamp(1rem, 0.9rem + 0.5vw, 1.125rem)' },
  { name: 'space-4', category: 'spacing', value: '1rem' },
  { name: 'radius-md', category: 'radius', value: '0.5rem' },
  { name: 'container', category: 'container', value: '72rem' },
  { name: 'shadow-sm', category: 'shadow', value: '0 1px 2px rgba(0,0,0,.2)', dark: '0 1px 2px rgb(0 0 0 / 60%)' },
]);

describe('validateTokenSet', () => {
  it('accepts a complete design system', () => {
    const result = validateTokenSet(GOOD);
    expect(result.ok).toBe(true);
  });

  it('maps every category to a grammar', () => {
    expect(Object.keys(TOKEN_GRAMMAR).sort()).toEqual([
      'color',
      'container',
      'font-family',
      'font-size',
      'radius',
      'shadow',
      'spacing',
    ]);
  });

  it.each([
    ['a colour that is not a colour', { name: 'a', category: 'color', value: '12px' }, 'invalid-value'],
    ['a url in a colour', { name: 'a', category: 'color', value: 'url(https://x.example/a.png)' }, 'invalid-value'],
    [
      'a dark value that is invalid',
      { name: 'a', category: 'color', value: 'red', dark: 'notacolor' },
      'invalid-value',
    ],
    ['a spacing with a negative length', { name: 'a', category: 'spacing', value: '-1rem' }, 'invalid-value'],
    ['a font stack with a string injection', { name: 'a', category: 'font-family', value: 'a; b' }, 'invalid-value'],
    ['a radius that is a colour', { name: 'a', category: 'radius', value: 'red' }, 'invalid-value'],
    [
      'a reference to a custom property outside --blx',
      { name: 'a', category: 'color', value: 'var(--evil)' },
      'invalid-value',
    ],
    ['an unknown category', { name: 'a', category: 'animation', value: 'x' }, 'schema'],
  ])('rejects %s', (_name, token, code) => {
    expect(codes(set([token]))).toContain(code);
  });

  it('reports set-level problems: duplicates, unknown references, cycles, category mismatches', () => {
    expect(
      codes(
        set([
          { name: 'a', category: 'color', value: 'red' },
          { name: 'a', category: 'color', value: 'blue' },
        ]),
      ),
    ).toEqual(['duplicate-name']);
    expect(codes(set([{ name: 'a', category: 'color', value: 'var(--blx-nope)' }]))).toEqual(['unknown-reference']);
    expect(
      codes(
        set([
          { name: 'a', category: 'color', value: 'var(--blx-b)' },
          { name: 'b', category: 'color', value: 'var(--blx-a)' },
        ]),
      ),
    ).toEqual(['reference-cycle', 'reference-cycle']);
    expect(
      codes(
        set([
          { name: 'a', category: 'color', value: 'var(--blx-b)' },
          { name: 'b', category: 'spacing', value: '1rem' },
        ]),
      ),
    ).toEqual(['category-mismatch', 'invalid-resolved-value']);
  });

  it('gives issue paths into the set', () => {
    const result = validateTokenSet(
      set([
        { name: 'a', category: 'color', value: 'red' },
        { name: 'b', category: 'color', value: 'red', dark: '12px' },
      ]),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]?.path).toBe('tokens[1].dark');
  });

  it('refuses hostile input without throwing', () => {
    const getter = {
      get schemaVersion(): number {
        throw new Error('boom');
      },
    };
    expect(codes(getter)).toEqual(['unreadable']);
    expect(codes(JSON.parse('{"schemaVersion":1,"tokenVersion":0,"tokens":[],"__proto__":{"x":1}}'))).toEqual([
      'reserved-key',
    ]);
    expect(
      codes(
        JSON.parse(
          '{"schemaVersion":1,"tokenVersion":0,"tokens":[{"name":"a","category":"color","value":"red","constructor":1}]}',
        ),
      ),
    ).toEqual(['reserved-key']);
    expect(codes(null)).toEqual(['schema']);
    expect(codes('{}')).toEqual(['schema']);
    expect(codes({ ...(GOOD as object), tokenVersion: 1.5 })).toEqual(['schema']);
    expect(codes({ ...(GOOD as object), tokenVersion: -1 })).toEqual(['schema']);
    expect(
      codes(
        new Proxy(
          {},
          {
            ownKeys() {
              throw new Error('boom');
            },
          },
        ),
      ),
    ).toEqual(['unreadable']);
  });

  it('stops at 50 issues', () => {
    const many = Array.from({ length: 120 }, (_v, i) => ({ name: `t${String(i)}`, category: 'color', value: '12px' }));
    const result = validateTokenSet(set(many));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toHaveLength(50);
  });
});

describe('tokensForCompile and the compiled stylesheet', () => {
  it('emits base values on the root and dark overrides for explicit and auto dark', () => {
    const result = validateTokenSet(GOOD);
    if (!result.ok) throw new Error('fixture invalid');
    const tokens = tokensForCompile(result.set);
    expect(tokens.filter((t) => t.mode === 'dark').map((t) => t.name)).toEqual([
      '--blx-color-primary',
      '--blx-shadow-sm',
    ]);
    const compiled = compile({
      document: { root: [], documentId: 'doc-001' } as never,
      tokens,
    });
    expect(compiled.issues).toEqual([]);
    const parsed = parse(compiled.css);
    const ctx = (dataTheme: 'light' | 'dark' | 'auto' | undefined, system: 'light' | 'dark') => ({
      dataTheme,
      system,
      width: 1000,
      states: [],
      classes: [],
    });
    expect(resolveRoot(parsed, '--blx-color-primary', ctx('light', 'dark'))).toBe('#1a56db');
    expect(resolveRoot(parsed, '--blx-color-primary', ctx('dark', 'light'))).toBe('#76a9fa');
    expect(resolveRoot(parsed, '--blx-color-primary', ctx(undefined, 'dark'))).toBe('#76a9fa');
    expect(resolveRoot(parsed, '--blx-color-link', ctx('dark', 'light'))).toBe('var(--blx-color-primary)');
    expect(compiled.css).toContain('--blx-font-body:"Source Sans 3", system-ui, sans-serif');
  });
});

interface TokenCorpus {
  cases: {
    id: string;
    input: unknown;
    expect:
      | {
          ok: true;
          light: Record<string, string>;
          dark: Record<string, string>;
          compile: { name: string; value: string; mode?: string }[];
        }
      | { ok: false; issues: { code: string; path: string }[] };
  }[];
}
const corpus = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'corpus', 'token-sets.json'), 'utf8'),
) as TokenCorpus;

describe('the token corpus (shared with the PHP twin)', () => {
  it.each(corpus.cases.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    const result = validateTokenSet(c.input);
    if (c.expect.ok) {
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(Object.fromEntries(resolveTokens(result.set, 'light').values)).toEqual(c.expect.light);
      expect(Object.fromEntries(resolveTokens(result.set, 'dark').values)).toEqual(c.expect.dark);
      expect(tokensForCompile(result.set)).toEqual(c.expect.compile);
    } else {
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.issues.map((i) => ({ code: i.code, path: i.path }))).toEqual(c.expect.issues);
    }
  });

  it('has the cases that matter', () => {
    expect(corpus.cases.length).toBeGreaterThanOrEqual(28);
  });
});
