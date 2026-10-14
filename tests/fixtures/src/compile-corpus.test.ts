import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FIXTURES_ROOT } from './load.ts';
import { generated } from './generate-compile-corpus.ts';

describe('style-resolution compile corpus', () => {
  it('matches regenerated TypeScript output', () => {
    const dir = join(FIXTURES_ROOT, 'compile-corpus');
    const files = generated();
    expect(readdirSync(dir).sort()).toEqual([...files.keys()].sort());
    for (const [name, data] of files) expect(readFileSync(join(dir, name), 'utf8')).toBe(data);
  });
});
