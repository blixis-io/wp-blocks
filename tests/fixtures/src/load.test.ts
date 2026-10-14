import { describe, expect, it } from 'vitest';
import { loadAllFixtures, listFixtureFiles, parseFixture, FIXTURES_ROOT } from './load.ts';
import { canonicalJson } from './canonical.ts';

const valid = (overrides: Record<string, unknown> = {}): string =>
  `${JSON.stringify({ description: 'd', expected: { ok: true }, fixtureVersion: 1, id: 'sample', input: {}, tags: ['a'], ...overrides }, null, 2)}\n`;

describe('fixture envelopes', () => {
  it('accepts a well-formed fixture', () => {
    expect(parseFixture(valid(), 'sample.fixture.json').id).toBe('sample');
  });

  it.each([
    ['CRLF line endings', valid().replace(/\n/g, '\r\n'), 'sample.fixture.json', /LF/],
    ['missing final newline', valid().trimEnd(), 'sample.fixture.json', /newline/],
    ['two final newlines', `${valid()}\n`, 'sample.fixture.json', /newline/],
    ['id different from the file name', valid(), 'other.fixture.json', /file name/],
    ['id not kebab-case', valid({ id: 'Not_Kebab' }), 'Not_Kebab.fixture.json', /kebab/],
    ['unknown extra key', valid({ extra: 1 }), 'sample.fixture.json', /keys must be exactly/],
    ['missing description text', valid({ description: ' ' }), 'sample.fixture.json', /description/],
    ['wrong fixtureVersion', valid({ fixtureVersion: 2 }), 'sample.fixture.json', /fixtureVersion/],
    ['bad tag', valid({ tags: ['Fine', 1] }), 'sample.fixture.json', /tags/],
    ['float in input', valid({ input: { a: 1.5 } }), 'sample.fixture.json', /safe integers/],
    ['array instead of object', '[]\n', 'sample.fixture.json', /JSON object/],
  ])('rejects %s', (_name, text, file, message) => {
    expect(() => parseFixture(text, file)).toThrow(message);
  });
});

describe('the committed fixtures', () => {
  const files = listFixtureFiles();

  it('exist and have unique ids', () => {
    expect(files.length).toBeGreaterThanOrEqual(4);
    const fixtures = loadAllFixtures();
    expect(new Set(fixtures.map((f) => f.id)).size).toBe(fixtures.length);
  });

  it('are exactly as Prettier would format them (stable diffs)', async () => {
    const { readFileSync } = await import('node:fs');
    const prettier = await import('prettier');
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      const formatted = await prettier.format(text, { filepath: file, ...(await prettier.resolveConfig(file)) });
      expect(formatted, file).toBe(text);
    }
  });

  it('live under the fixtures root', () => {
    for (const file of files) expect(file.startsWith(FIXTURES_ROOT)).toBe(true);
  });

  it('invalid fixtures declare an error or an escaped output; valid ones declare validity', () => {
    for (const f of loadAllFixtures()) {
      const expected = JSON.parse(canonicalJson(f.expected)) as Record<string, unknown>;
      expect(
        Object.keys(expected).some((k) => ['valid', 'error', 'escapedOutput'].includes(k)),
        f.id,
      ).toBe(true);
    }
  });
});
