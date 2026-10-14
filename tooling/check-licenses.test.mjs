import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluate, classify } from './check-licenses.mjs';

const policy = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'licenses.json'), 'utf8'));
const dep = (license, name = 'x') => ({ ecosystem: 'npm', name, version: '1.0.0', license });

test('permissive and GPL-compatible licences are accepted for distribution', () => {
  for (const id of ['MIT', 'ISC', 'BSD-3-Clause', 'Apache-2.0', 'GPL-2.0-or-later', 'LGPL-3.0-or-later'])
    assert.deepEqual(classify([dep(id)], 'distributed', policy), [], id);
});

test('dev-only licences are rejected for distributed dependencies but accepted for development', () => {
  for (const id of ['MPL-2.0', 'Python-2.0', 'CC-BY-4.0', 'BlueOak-1.0.0']) {
    assert.equal(classify([dep(id)], 'distributed', policy).length, 1, id);
    assert.deepEqual(classify([dep(id)], 'dev', policy), [], id);
  }
});

test('GPL-2.0-only, AGPL, proprietary, unknown and missing licences are rejected everywhere', () => {
  for (const id of [
    'GPL-2.0-only',
    'AGPL-3.0-only',
    'SSPL-1.0',
    'UNLICENSED',
    'UNKNOWN',
    '',
    undefined,
    'SEE LICENSE IN LICENSE.md',
  ]) {
    assert.equal(classify([dep(id)], 'dev', policy).length, 1, String(id));
  }
});

test('SPDX expressions: OR needs one acceptable id, AND needs all', () => {
  const ok = new Set(['MIT', 'ISC']);
  assert.equal(evaluate('MIT OR GPL-2.0-only', ok), true);
  assert.equal(evaluate('(MIT AND ISC)', ok), true);
  assert.equal(evaluate('MIT AND GPL-2.0-only', ok), false);
  assert.equal(evaluate('GPL-2.0-only OR AGPL-3.0-only', ok), false);
});

test('"or later" shorthand maps to the -or-later id', () => {
  assert.equal(evaluate('GPL-2.0+', new Set(['GPL-2.0-or-later'])), true);
});

test('violations name the offending package', () => {
  const [v] = classify([dep('SSPL-1.0', 'evil')], 'dev', policy);
  assert.match(v, /npm:evil@1\.0\.0/);
});
