import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertGolden } from './golden.ts';

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

  it('rewrites goldens only with UPDATE_GOLDEN=1, and never in CI', () => {
    const path = join(tmp(), 'sub', 'new.golden');
    vi.stubEnv('UPDATE_GOLDEN', '1');
    vi.stubEnv('CI', '');
    vi.stubEnv('CI', undefined);
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
});
