import { resolveModes } from '@blixis/wp-design-tokens';
import { validateDocument, type BuilderDocument } from '@blixis/wp-core';
import { describe, expect, it } from 'vitest';
import { parse, resolve, resolveRoot, type Context } from './cascade.test-helper.ts';
import { compile } from './compile.ts';
import { tokensForCompile, validateTokenSet } from './tokens.ts';

const tokenSet = {
  schemaVersion: 1,
  tokenVersion: 1,
  tokens: [
    { name: 'color-bg', category: 'color', value: '#ffffff', dark: '#101418' },
    { name: 'color-text', category: 'color', value: '#111827', dark: '#e5e7eb' },
    { name: 'color-link', category: 'color', value: 'var(--blx-color-text)' },
    { name: 'color-line', category: 'color', value: '#d1d5db', dark: '#d1d5db' },
    { name: 'space-md', category: 'spacing', value: '1rem' },
  ],
};

const document = (): BuilderDocument => {
  const result = validateDocument({
    schemaVersion: 1,
    documentId: 'doc-001',
    layoutRevision: 1,
    defaultLocale: 'en_US',
    locales: ['en_US'],
    root: [
      {
        id: 'el-card',
        type: 'blixis/container',
        props: {},
        children: [
          {
            id: 'el-text',
            type: 'blixis/text',
            props: {},
            children: [],
            style: [{ declarations: { color: 'var(--blx-color-link)', padding: 'var(--blx-space-md)' } }],
          },
          {
            id: 'el-line',
            type: 'blixis/text',
            props: {},
            children: [],
            style: [{ declarations: { 'border-top-color': 'var(--blx-color-line)' } }],
          },
        ],
        style: [{ declarations: { 'background-color': 'var(--blx-color-bg)' } }],
      },
    ],
    classListVersion: 0,
    classRefs: {},
    translations: { en_US: {} },
    metadata: { updatedAt: '2026-01-01T00:00:00Z', editorVersion: '0.0.0' },
  });
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.document;
};

/** What a browser would compute: the winning declaration, then its custom properties looked up on the root. */
function computed(css: ReturnType<typeof parse>, property: string, ctx: Context): string | undefined {
  const expand = (value: string, depth = 0): string => {
    if (depth > 8) throw new Error('too deep');
    return value.replace(/var\((--blx-[a-z0-9-]+)\)/g, (_m, name: string) =>
      expand(resolveRoot(css, name, ctx) ?? '', depth + 1),
    );
  };
  const declared = resolve(css, property, ctx);
  return declared === undefined ? undefined : expand(declared);
}

describe('light and dark tokens end to end (tokens -> compiler -> cascade)', () => {
  const validated = validateTokenSet(tokenSet);
  if (!validated.ok) throw new Error(JSON.stringify(validated.issues));
  const doc = document();
  const before = JSON.stringify(doc);
  const result = compile({ document: doc, tokens: tokensForCompile(validated.set) });
  const css = parse(result.css);
  const modes = resolveModes(validated.set);
  const contexts = (mode: 'light' | 'dark'): Context[] => {
    const base = { states: [], width: 1000 };
    const classesFor = (id: string): string[] => result.classNames.get(id) ?? [];
    return [
      ...(['el-text', 'el-card', 'el-line'] as const).flatMap((id) => [
        {
          ...base,
          dataTheme: mode,
          system: mode === 'dark' ? ('light' as const) : ('dark' as const),
          classes: classesFor(id),
        },
        { ...base, dataTheme: 'auto' as const, system: mode, classes: classesFor(id) },
        { ...base, dataTheme: undefined, system: mode, classes: classesFor(id) },
      ]),
    ];
  };

  it('emits no dark rule for a dark value that repeats the base value', () => {
    const dark = /:where\(html\[data-theme="dark"\]\)\{([^}]*)\}/.exec(result.css)?.[1] ?? '';
    expect(dark).toBe('--blx-color-bg:#101418;--blx-color-text:#e5e7eb');
    expect(tokensForCompile(validated.set).filter((t) => t.name === '--blx-color-line')).toEqual([
      { name: '--blx-color-line', value: '#d1d5db' },
    ]);
  });

  it.each(['light', 'dark'] as const)(
    'computes the same values as the token engine in %s mode, whichever way the mode is selected',
    (mode) => {
      const expected = mode === 'light' ? modes.light : modes.dark;
      const check = (id: string, property: string, token: string): void => {
        for (const ctx of contexts(mode).filter((c) => c.classes.join() === (result.classNames.get(id) ?? []).join())) {
          expect(computed(css, property, ctx), `${id} ${property} ${JSON.stringify([ctx.dataTheme, ctx.system])}`).toBe(
            expected.get(token),
          );
        }
      };
      check('el-text', 'color', 'color-link');
      check('el-card', 'background-color', 'color-bg');
      check('el-line', 'border-top-color', 'color-line');
      check('el-text', 'padding', 'space-md');
    },
  );

  it('does not clone nodes or classes for a mode: one class per element, the document is untouched, output is identical on every run', () => {
    expect(JSON.stringify(doc)).toBe(before);
    expect([...result.classNames.values()].every((names) => names.length === 1)).toBe(true);
    expect(result.classNames.size).toBe(3);
    expect(compile({ document: doc, tokens: tokensForCompile(validated.set) }).css).toBe(result.css);
    // dark mode adds only custom property rules (and no element rule) because the elements do not declare mode rules
    expect(result.css.match(/\.blx-[0-9a-f]{12}/g)?.length).toBe(3);
  });

  it('a mode override on an alias target moves every token built on it', () => {
    expect(modes.differing.sort()).toEqual(['color-bg', 'color-link', 'color-text']);
    expect(modes.overrides.sort()).toEqual(['color-bg', 'color-text']);
  });
});
