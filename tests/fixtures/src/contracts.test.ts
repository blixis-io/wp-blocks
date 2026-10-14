import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonicalJson } from './canonical.ts';
import { REPO_ROOT, checkRegistry, findOrphans, jsonFilesUnder, loadRegistry, sharedDataFiles } from './contracts.ts';

describe('orphan detection', () => {
  it('finds shared data files in any data directory, whatever its depth, and ignores only exact configuration paths', () => {
    const files = sharedDataFiles();
    expect(files).toContain('tests/fixtures/compile/compile-tokens.fixture.json');
    expect(files).toContain('packages/style-engine/corpus/token-sets.json');
    expect(files).not.toContain('tooling/package.json');
    const covered = new Set(files);
    expect(findOrphans(files, covered)).toEqual([]);
    expect(
      findOrphans(
        [
          'packages/new-area/corpus/cases.json',
          'apps/editor/fixtures/state.json',
          'tests/fixtures/package.json',
          'tests/fixtures/deep/package.json',
          'tooling/fixtures/bad/x.json',
        ],
        new Set(),
      ),
    ).toEqual([
      'packages/new-area/corpus/cases.json',
      'apps/editor/fixtures/state.json',
      'tests/fixtures/deep/package.json',
    ]);
  });
});

describe('contract registry (tests/fixtures/contracts.json)', () => {
  it('is consistent: files exist and are strict JSON, runners exist, PHP gaps point at roadmap issues, no orphan data files', () => {
    expect(checkRegistry()).toEqual([]);
  });

  it('lists the suites that matter', () => {
    const ids = loadRegistry().suites.map((s) => s.id);
    for (const id of [
      'document-fixtures',
      'document-schema',
      'token-set-corpus',
      'css-declaration-corpus',
      'style-resolution',
      'compile-goldens',
      'element-manifest',
      'render-goldens',
    ]) {
      expect(ids).toContain(id);
    }
  });

  it('detects the problems it exists to catch', () => {
    const base = loadRegistry();
    const first = base.suites[0];
    if (first === undefined) throw new Error('empty registry');
    const broken = (patch: Partial<typeof first>) =>
      checkRegistry({ ...base, suites: [{ ...first, ...patch }, ...base.suites.slice(1)] });
    expect(broken({ paths: ['tests/fixtures/nope'] }).join('\n')).toContain('has no JSON files');
    expect(broken({ ts: ['nope.test.ts'] }).join('\n')).toContain('does not exist');
    expect(broken({ ts: [] }).join('\n')).toContain('no TypeScript runner');
    expect(broken({ ts: ['packages/core/src/document/validate.test.ts'], phpOnly: true }).join('\n')).toContain(
      'phpOnly needs an empty ts list and a full PHP runner',
    );
    expect(broken({ php: { level: 'pending', issue: 'BWB-999' } }).join('\n')).toContain('roadmap issue');
    expect(broken({ php: { level: 'full' } }).join('\n')).toContain('php.runner is required');
    expect(checkRegistry({ ...base, suites: base.suites.slice(1) }).join('\n')).toContain(
      'is not part of any contract suite',
    );
    expect(checkRegistry({ ...base, suites: [...base.suites, { ...first }] }).join('\n')).toContain('duplicate id');
    expect(
      broken({ php: { level: 'shape', runner: 'tooling/php/tests/ContractsTest.php', issue: 'BWB-043' } }).join('\n'),
    ).toContain('php.covers must name');
    expect(
      broken({
        php: {
          level: 'shape',
          runner: 'tooling/php/tests/ContractsTest.php',
          issue: 'BWB-043',
          covers: ['test_nothing'],
        },
      }).join('\n'),
    ).toContain('has no test method test_nothing');
    expect(
      broken({ php: { level: 'pending', issue: 'BWB-043', runner: 'tooling/php/tests/ContractsTest.php' } }).join('\n'),
    ).toContain('promote its level');
  });
});

// Every file of every suite must serialise to the same canonical JSON in PHP (which also proves PHP can read it with its
// strict scanner). Needs PHP with ext-intl; BLX_SKIP_PHP=1 skips deliberately.
const skip = process.env['BLX_SKIP_PHP'] === '1';
describe.skipIf(skip)('PHP / TypeScript canonical JSON parity for all contract files', () => {
  it('matches byte for byte', () => {
    const files = loadRegistry().suites.flatMap((s) => s.paths.flatMap((p) => jsonFilesUnder(p)));
    expect(files.length).toBeGreaterThan(20);
    const script = join(REPO_ROOT, 'tooling', 'php', 'bin', 'canonicalize.php');
    const args = files.map((f) => `json:${join(REPO_ROOT, f)}`);
    const r = spawnSync('php', [script, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (r.status !== 0) throw new Error(`php failed: ${r.stderr}`);
    const lines = r.stdout.trimEnd().split('\n');
    expect(lines).toHaveLength(files.length);
    files.forEach((file, i) => {
      const json = (lines[i] ?? '').split('\t')[2];
      expect(json, file).toBe(canonicalJson(JSON.parse(readFileSync(join(REPO_ROOT, file), 'utf8'))));
    });
  });
});
