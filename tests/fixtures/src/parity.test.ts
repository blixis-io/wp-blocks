import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonicalHash, canonicalJson } from './canonical.ts';
import { FIXTURES_ROOT, listFixtureFiles, loadFixture } from './load.ts';

// The PHP and TypeScript implementations must serialise every fixture byte-for-byte alike (FR-071). Needs PHP with ext-intl;
// set BLX_SKIP_PHP=1 to skip deliberately.
const skip = process.env['BLX_SKIP_PHP'] === '1';
const script = join(FIXTURES_ROOT, '..', '..', 'tooling', 'php', 'bin', 'canonicalize.php');

function php(args: string[]): string[] {
  const r = spawnSync('php', [script, ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`php failed: ${r.stderr}`);
  return r.stdout.trimEnd().split('\n');
}

describe.skipIf(skip)('PHP / TypeScript canonical JSON parity', () => {
  it('every committed fixture has the same canonical JSON and SHA-256 in both languages', () => {
    const files = listFixtureFiles();
    const lines = php(files);
    expect(lines).toHaveLength(files.length);
    files.forEach((file, i) => {
      const [path, hash, json] = (lines[i] ?? '').split('\t');
      const fixture = loadFixture(file);
      expect(path).toBe(file);
      expect(json, fixture.id).toBe(canonicalJson(fixture));
      expect(hash, fixture.id).toBe(canonicalHash(fixture));
    });
  });

  it('agrees on tricky values: key order by bytes, escapes, empty containers, line separators', () => {
    const cases: unknown[] = [
      { '\u{1F600}': 1, '～': 2, b: [], a: {}, é: 'x' },
      { path: 'a/b\\c', quote: '"', ctl: '\u0001\u001f\u007f', sep: '  ', emoji: '😀', nul: '\u0000' },
      [[], {}, [{}], { a: [[]] }, null, true, false, 0, -5, 9007199254740991, -9007199254740991],
      { 'a b': 1, 'a-b': 2, a_b: 3, A: 4, a: 5, '10': 6, '2': 7, '': 8 },
    ];
    const raw = cases.map((c) => `raw:${JSON.stringify(c)}`);
    const lines = php(raw);
    cases.forEach((c, i) => {
      const [, hash, json] = (lines[i] ?? '').split('\t');
      expect(json, JSON.stringify(c)).toBe(canonicalJson(c));
      expect(hash).toBe(canonicalHash(c));
    });
  });

  it('PHP rejects what TypeScript rejects', () => {
    for (const bad of ['{"a":1.5}', '{"a":9007199254740993}', JSON.stringify({ k: 'é' })]) {
      const r = spawnSync('php', [script, `raw:${bad}`], { encoding: 'utf8' });
      expect(r.status, bad).not.toBe(0);
    }
  });
});
