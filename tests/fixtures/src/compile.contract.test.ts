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
