import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluate, classify, pnpmDeps, composerDeps } from './check-licenses.mjs';

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

test('SPDX parentheses and precedence are honoured', () => {
  const ok = new Set(['MIT']);
  assert.equal(evaluate('(MIT OR GPL-2.0-only) AND GPL-2.0-only', ok), false);
  assert.equal(evaluate('MIT OR GPL-2.0-only AND AGPL-3.0-only', ok), true); // AND binds tighter: MIT OR (A AND B)
  assert.equal(evaluate('(MIT OR GPL-2.0-only) AND MIT', ok), true);
  assert.equal(evaluate('MIT AND (GPL-2.0-only OR AGPL-3.0-only)', ok), false);
  assert.equal(evaluate('((MIT))', ok), true);
});

test('WITH exceptions, LicenseRef ids and malformed expressions are rejected', () => {
  const ok = new Set(['MIT', 'GPL-2.0-or-later']);
  for (const e of [
    'GPL-2.0-or-later WITH Classpath-exception-2.0',
    'LicenseRef-custom',
    'MIT AND',
    'OR MIT',
    '(MIT',
    'MIT)',
    'MIT MIT',
    'MIT OR (',
    '',
  ])
    assert.equal(evaluate(e, ok), false, e);
});

const okExec = (stdout) => () => ({ status: 0, stdout, stderr: '' });
const failExec = () => ({ status: 1, stdout: '{"MIT":[{"name":"a","versions":["1"]}]}', stderr: 'boom' });

test('pnpm inventory: multiple versions, missing versions, empty production list', () => {
  const deps = pnpmDeps(
    '.',
    false,
    okExec(JSON.stringify({ MIT: [{ name: 'a', versions: ['1.0.0', '2.0.0'] }], ISC: [{ name: 'b' }] })),
  );
  assert.deepEqual(
    deps.map((d) => `${d.name}@${d.version}:${d.license}`),
    ['a@1.0.0:MIT', 'a@2.0.0:MIT', 'b@unknown:ISC'],
  );
  assert.deepEqual(pnpmDeps('.', true, okExec('No licenses in packages found')), []);
});

test('pnpm inventory fails on a nonzero exit even when stdout looks valid, and on unexpected output', () => {
  assert.throws(() => pnpmDeps('.', false, failExec), /failed \(status 1\)/);
  assert.throws(() => pnpmDeps('.', false, okExec('Something else entirely')), /unexpected pnpm licenses output/);
  assert.throws(() => pnpmDeps('.', false, okExec('{"MIT":"oops"}')), /unexpected pnpm licenses entry/);
});

test('composer inventory joins licence arrays as alternatives and rejects bad output', () => {
  const dir = mkdtempSync(join(tmpdir(), 'blx-lic-'));
  writeFileSync(join(dir, 'composer.lock'), '{}');
  try {
    const deps = composerDeps(
      dir,
      false,
      okExec(
        JSON.stringify({
          dependencies: { 'a/b': { version: '1.0', license: ['MIT', 'GPL-2.0-or-later'] }, 'c/d': { version: '2.0' } },
        }),
      ),
    );
    assert.deepEqual(
      deps.map((d) => d.license),
      ['MIT OR GPL-2.0-or-later', ''],
    );
    assert.equal(classify(deps, 'dev', policy).length, 1); // c/d has no licence
    assert.throws(() => composerDeps(dir, false, failExec), /failed/);
    assert.throws(() => composerDeps(dir, false, okExec('{"nope":1}')), /unexpected composer licenses output/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the real inventory is not vacuous and passes the policy', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const all = [...pnpmDeps(root, false), ...composerDeps(root, false)];
  assert.ok(all.length > 50, `only ${all.length} dependencies found`);
  assert.deepEqual(
    classify(
      all.filter((d) => d.name !== 'blixis/wp-blocks-dev'),
      'dev',
      policy,
    ),
    [],
  );
});
