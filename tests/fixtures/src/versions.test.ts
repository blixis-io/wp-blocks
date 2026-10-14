import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CURRENT_SCHEMA_VERSION } from '@blixis/wp-core';
import { CURRENT_TOKEN_SCHEMA_VERSION } from '@blixis/wp-design-tokens';
import { EXTENSION_API_VERSION } from '@blixis/wp-element-registry';
import { COMPILER_VERSION } from '@blixis/wp-style-engine';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from './contracts.ts';

// docs/architecture/VERSIONING-AND-COMPATIBILITY.md lists every version constant with its current value. The table is parsed
// here so that bumping a constant without updating the document (or the reverse) fails the build.
const doc = readFileSync(join(REPO_ROOT, 'docs', 'architecture', 'VERSIONING-AND-COMPATIBILITY.md'), 'utf8');
const ACTUAL: Record<string, number> = {
  CURRENT_SCHEMA_VERSION,
  CURRENT_TOKEN_SCHEMA_VERSION,
  EXTENSION_API_VERSION,
  COMPILER_VERSION,
};

describe('the version inventory in docs/architecture/VERSIONING-AND-COMPATIBILITY.md', () => {
  const rows = [...doc.matchAll(/^\| [^|]+ \| `([A-Z_]+)` \([a-z-]+\) \| (\d+) \|/gm)].map(
    (m) => [m[1] ?? '', Number(m[2])] as const,
  );

  it('lists exactly the version constants the code has', () => {
    expect(rows.map(([name]) => name).sort()).toEqual(Object.keys(ACTUAL).sort());
  });

  it.each(rows)('%s is documented as its current value', (name, documented) => {
    expect(documented).toBe(ACTUAL[name]);
  });
});
