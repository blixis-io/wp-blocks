import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertGolden } from './golden.ts';
import { FIXTURES_ROOT } from './load.ts';

describe('assertGolden', () => {
  const dirs: string[] = [];
  const tmp = (): string => {
    const dir = mkdtempSync(join(tmpdir(), 'blx-golden-'));
    dirs.push(dir);
    return dir;
  };
  afterEach(() => {
    vi.unstubAllEnvs();
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it('passes when output equals the golden file, adding the final newline', () => {
    const path = join(tmp(), 'a.golden.css');
    writeFileSync(path, '.a{color:red}\n');
    expect(() => {
      assertGolden('.a{color:red}', path);
    }).not.toThrow();
  });

  it('fails when output differs', () => {
    const path = join(tmp(), 'a.golden.css');
    writeFileSync(path, '.a{color:red}\n');
    expect(() => {
      assertGolden('.a{color:blue}', path);
    }).toThrow(/differs from golden/);
  });

  it('fails when the golden file is missing, telling how to create it', () => {
    expect(() => {
      assertGolden('x', join(tmp(), 'missing.golden'));
    }).toThrow(/UPDATE_GOLDEN=1/);
  });

  it('rejects CRLF output', () => {
    expect(() => {
      assertGolden('a\r\nb', join(tmp(), 'x'));
    }).toThrow(/LF/);
  });

  it('requires exactly one final newline in output and in the golden file', () => {
    const path = join(tmp(), 'a.golden.css');
    writeFileSync(path, 'x\n\n');
    expect(() => {
      assertGolden('x\n\n', path);
    }).toThrow(/more than one newline/);
    expect(() => {
      assertGolden('x', path);
    }).toThrow(/exactly one newline/);
  });

  it('rewrites goldens only with UPDATE_GOLDEN=1, and never in CI', () => {
    const dir = join(FIXTURES_ROOT, `.tmp-golden-${String(process.pid)}`);
    dirs.push(dir);
    const path = join(dir, 'sub', 'new.golden.css');
    vi.stubEnv('UPDATE_GOLDEN', '1');
    delete process.env['CI'];
    assertGolden('fresh', path);
    vi.unstubAllEnvs();
    expect(() => {
      assertGolden('fresh', path);
    }).not.toThrow();
    vi.stubEnv('UPDATE_GOLDEN', '1');
    vi.stubEnv('CI', 'true');
    expect(() => {
      assertGolden('changed', path);
    }).toThrow(/CI/);
  });

  it('refuses to update files that are not *.golden.<ext> inside tests/fixtures', () => {
    vi.stubEnv('UPDATE_GOLDEN', '1');
    delete process.env['CI'];
    expect(() => {
      assertGolden('x', join(tmp(), 'a.golden.css'));
    }).toThrow(/refusing to write/);
    expect(() => {
      assertGolden('x', join(FIXTURES_ROOT, 'documents', 'valid', 'minimal-heading.fixture.json'));
    }).toThrow(/refusing to write/);
    expect(() => {
      assertGolden('x', join(FIXTURES_ROOT, '..', 'outside.golden.css'));
    }).toThrow(/refusing to write/);
  });
});
