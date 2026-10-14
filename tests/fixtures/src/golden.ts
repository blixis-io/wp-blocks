import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Compares generated text with a committed golden file. Goldens change only deliberately: run with `UPDATE_GOLDEN=1`
 * to rewrite them, then review the diff like any other code change. In CI the variable is never set.
 */
export function assertGolden(actual: string, goldenPath: string): void {
  if (actual.includes('\r')) throw new Error('golden output must use LF line endings');
  const text = actual.endsWith('\n') ? actual : `${actual}\n`;
  if (process.env['UPDATE_GOLDEN'] === '1') {
    if (process.env['CI'] !== undefined) throw new Error('refusing to update golden files in CI');
    mkdirSync(dirname(goldenPath), { recursive: true });
    writeFileSync(goldenPath, text);
    return;
  }
  if (!existsSync(goldenPath))
    throw new Error(`missing golden file ${goldenPath}; create it with UPDATE_GOLDEN=1 and review it`);
  const expected = readFileSync(goldenPath, 'utf8');
  if (expected !== text) throw new Error(`output differs from golden file ${goldenPath}`);
}
