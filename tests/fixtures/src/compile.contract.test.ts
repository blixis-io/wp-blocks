import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { validateDocument } from '@blixis/wp-core';
import { compile, type CompileInput } from '@blixis/wp-style-engine';
import { describe, expect, it } from 'vitest';
import { assertGolden } from './golden.ts';
import { FIXTURES_ROOT, listFixtureFiles, loadFixture } from './load.ts';

// The compile contract: documents, classes and tokens in; the exact stylesheet and the render metadata out. The PHP compiler
// (BWB-044) must produce the same bytes for the same fixtures (tests/fixtures/contracts.json, suite compile-goldens).
const dir = join(FIXTURES_ROOT, 'compile');
const files = listFixtureFiles(dir);

describe('compile goldens', () => {
  it('has fixtures', () => {
    expect(files.length).toBeGreaterThanOrEqual(9);
  });

  it.each(files.map((file) => [loadFixture(file).id, file] as const))('%s', (_id, file) => {
    const fixture = loadFixture(file);
    const input = fixture.input as unknown as Omit<CompileInput, 'document'> & { document: unknown };
    const validated = validateDocument(input.document);
    if (!validated.ok) throw new Error(`fixture document is invalid: ${JSON.stringify(validated.errors)}`);
    const result = compile({ ...input, document: validated.document });
    const expected = fixture.expected as {
      classNames: Record<string, string[]>;
      issues: { code: string; path: string }[];
    };
    expect(Object.fromEntries(result.classNames)).toEqual(expected.classNames);
    expect(result.issues.map((i) => ({ code: i.code, path: i.path }))).toEqual(expected.issues);
    assertGolden(result.css, file.replace(/\.fixture\.json$/, '.golden.css'));
  });

  it('is byte-stable: compiling twice gives the same bytes', () => {
    for (const file of files) {
      const input = loadFixture(file).input as unknown as Omit<CompileInput, 'document'> & { document: unknown };
      const validated = validateDocument(input.document);
      if (!validated.ok) throw new Error('invalid');
      expect(compile({ ...input, document: validated.document }).css).toBe(
        compile({ ...input, document: validated.document }).css,
      );
    }
  });
});

// Hand-derived expectations: written from ADR 0005 section 3, not copied from compiler output, with class names computed by
// Node's crypto (independent of the TypeScript SHA-256 in the style engine). They keep the goldens from being the only oracle.
const name = (text: string): string => createHash('sha256').update(text).digest('hex').slice(0, 12);
const LAYERS = [
  'blx.theme',
  'blx.tokens',
  'blx.marks',
  ...['class', 'el'].flatMap((origin) =>
    ['s0', 'hover', 'focus', 'focus-visible', 'active'].flatMap((state) =>
      ['base', 'bp', 'mode', 'modebp'].map((kind) => `blx.${origin}.${state}.${kind}`),
    ),
  ),
];
const AUTO = ':where(html:not([data-theme="light"]):not([data-theme="dark"]))';
const doc = (root: unknown[], classIds: string[] = []): unknown => ({
  schemaVersion: 1,
  documentId: 'doc-001',
  layoutRevision: 1,
  defaultLocale: 'en_US',
  locales: ['en_US'],
  root,
  classListVersion: 0,
  classRefs: Object.fromEntries(classIds.map((id) => [id, 1])),
  translations: { en_US: {} },
  metadata: { updatedAt: '2026-01-01T00:00:00Z', editorVersion: '0.0.0' },
});
const run = (document: unknown, extra: Partial<CompileInput> = {}): string => {
  const validated = validateDocument(document);
  if (!validated.ok) throw new Error('invalid document');
  return compile({ document: validated.document, ...extra }).css;
};
const header = `/*blx-css:1*/\n@layer ${LAYERS.join(',')};\n@layer blx.marks{.blx-mw-normal{font-weight:400}.blx-mw-medium{font-weight:500}.blx-mw-bold{font-weight:700}}\n`;

describe('compile: hand-derived stylesheets', () => {
  it('owner example: base, mobile, dark and dark+mobile in the four layers, dark and auto forms', () => {
    const n = `blx-${name('doc-001:el-a')}`;
    const element = {
      id: 'el-a',
      type: 'blixis/text',
      props: {},
      children: [],
      style: [
        { declarations: { color: 'black' } },
        { breakpoint: 'mobile', declarations: { color: 'gray' } },
        { mode: 'dark', declarations: { color: 'white' } },
        { mode: 'dark', breakpoint: 'mobile', declarations: { color: 'lightgray' } },
      ],
    };
    expect(run(doc([element]))).toBe(
      header +
        `@layer blx.el.s0.base{.${n}{color:black}}\n` +
        `@layer blx.el.s0.bp{@media (max-width:640px){.${n}{color:gray}}}\n` +
        `@layer blx.el.s0.mode{:where(html[data-theme="dark"]) .${n}{color:white}@media (prefers-color-scheme:dark){${AUTO} .${n}{color:white}}}\n` +
        `@layer blx.el.s0.modebp{@media (max-width:640px){:where(html[data-theme="dark"]) .${n}{color:lightgray}}@media (prefers-color-scheme:dark){@media (max-width:640px){${AUTO} .${n}{color:lightgray}}}}\n`,
    );
  });

  it('classes: precedence is the order of the global list, light mode uses the negated media query', () => {
    const a = `blx-c-${name('cls-a')}`;
    const b = `blx-c-${name('cls-b')}`;
    const n = `blx-${name('doc-001:el-a')}`;
    const element = {
      id: 'el-a',
      type: 'blixis/text',
      props: {},
      children: [],
      classIds: ['cls-b', 'cls-a'],
      style: [{ mode: 'light', state: 'hover', declarations: { color: 'navy' } }],
    };
    const css = run(doc([element], ['cls-b', 'cls-a']), {
      classes: [
        { id: 'cls-a', rules: [{ declarations: { color: 'red' } }] },
        { id: 'cls-b', rules: [{ declarations: { color: 'blue' } }] },
      ],
    });
    expect(css).toBe(
      header +
        `@layer blx.class.s0.base{.${a}{color:red}.${b}{color:blue}}\n` +
        `@layer blx.el.hover.mode{:where(html[data-theme="light"]) .${n}:where(:hover){color:navy}@media not all and (prefers-color-scheme:dark){${AUTO} .${n}:where(:hover){color:navy}}}\n`,
    );
  });
});
