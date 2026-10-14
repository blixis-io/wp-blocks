import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FIXTURES_ROOT, listFixtureFiles, loadAllFixtures, parseFixture } from './load.ts';
import { canonicalJson } from './canonical.ts';

const envelope = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  description: 'd',
  expected: { ok: true },
  fixtureVersion: 1,
  id: 'sample',
  input: {},
  tags: ['a'],
  ...overrides,
});
const valid = (overrides: Record<string, unknown> = {}): string => `${JSON.stringify(envelope(overrides), null, 2)}\n`;
const withInput = (input: string): string => valid().replace('"input": {}', `"input": ${input}`);

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
    ['tags not an array', valid({ tags: 'a' }), 'sample.fixture.json', /tags/],
    ['float in input', valid({ input: { a: 1.5 } }), 'sample.fixture.json', /non-integer/],
    ['1.0 written as a float token', withInput('{"a": 1.0}'), 'sample.fixture.json', /non-integer/],
    ['1e3 written as an exponent', withInput('{"a": 1e3}'), 'sample.fixture.json', /non-integer/],
    ['negative zero', withInput('{"a": -0}'), 'sample.fixture.json', /negative zero/],
    ['duplicate keys', withInput('{"a": 1, "a": 2}'), 'sample.fixture.json', /duplicate key/],
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
