import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { basename, dirname, resolve, sep } from 'node:path';
import { FIXTURES_ROOT } from './load.ts';

/**
 * Compares generated text with a committed golden file. Goldens change only deliberately: run with `UPDATE_GOLDEN=1`
 * to rewrite them, then review the diff like any other code change. In CI the variable is never set.
 */
export function assertGolden(actual: string, goldenPath: string): void {
  if (actual.includes('\r')) throw new Error('golden output must use LF line endings');
  if (actual.endsWith('\n\n')) throw new Error('golden output must not end with more than one newline');
  const text = actual.endsWith('\n') ? actual : `${actual}\n`;
  if (process.env['UPDATE_GOLDEN'] === '1') {
    if (process.env['CI'] !== undefined) throw new Error('refusing to update golden files in CI');
    const target = resolve(goldenPath);
    if (!/\.golden\.[a-z]+$/.test(basename(target)) || !target.startsWith(FIXTURES_ROOT + sep)) {
      throw new Error(
        `refusing to write ${goldenPath}: update targets must be *.golden.<ext> files inside tests/fixtures`,
      );
    }
    mkdirSync(dirname(goldenPath), { recursive: true });
    writeFileSync(goldenPath, text);
    return;
  }
  if (!existsSync(goldenPath))
    throw new Error(`missing golden file ${goldenPath}; create it with UPDATE_GOLDEN=1 and review it`);
  const expected = readFileSync(goldenPath, 'utf8');
  if (expected.endsWith('\n\n')) throw new Error(`golden file ${goldenPath} must end with exactly one newline`);
  if (expected !== text) throw new Error(`output differs from golden file ${goldenPath}`);
}
