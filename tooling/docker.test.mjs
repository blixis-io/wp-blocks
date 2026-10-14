// Static safety checks for the local WordPress environment (BWB-012). The runtime behaviour is covered by
// `pnpm wp:smoke`, which needs Docker and runs in CI.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const compose = readFileSync(join(root, 'docker', 'compose.yml'), 'utf8');
const lines = compose.split('\n').filter((l) => !l.trim().startsWith('#'));

test('every default image is pinned by digest and none uses :latest', () => {
  const images = lines.filter((l) => /^\s+image:/.test(l));
  assert.equal(images.length, 3);
  for (const l of images) {
    assert.match(l, /:-[^}]+@sha256:[0-9a-f]{64}\}/, l);
    assert.doesNotMatch(l, /:latest/, l);
  }
});

test('published ports are bound to the loopback interface only, and the database publishes none', () => {
  const ports = lines.filter(
    (l) => /^\s+-\s+'?\d|^\s+-\s+'?127|^\s+-\s+'?0\.0\.0\.0|^\s+-\s+'?\$\{/.test(l) && l.includes(':80'),
  );
  assert.ok(ports.length >= 1);
  for (const l of ports) assert.match(l, /127\.0\.0\.1:/, l);
  const db = compose.slice(compose.indexOf('  db:'), compose.indexOf('  wordpress:'));
  assert.doesNotMatch(db, /^\s+ports:/m);
});

test('no privileged containers, host networking or docker socket mounts', () => {
  for (const bad of [/privileged:\s*true/, /network_mode:\s*host/, /docker\.sock/, /cap_add/])
    assert.doesNotMatch(compose, bad);
});

test('the project name is distinctive, so it cannot collide with other Blixis stacks', () => {
  assert.match(compose, /^name:\s*blixis-wp-blocks\s*$/m);
});

test('the reset command never removes orphan containers (they may belong to other projects)', () => {
  assert.doesNotMatch(readFileSync(join(root, 'tooling', 'wp-env', 'wp-env.mjs'), 'utf8'), /--remove-orphans/);
});

test('development credentials are labelled as development-only', () => {
  for (const secret of ['wordpress-dev-only', 'root-dev-only']) assert.ok(compose.includes(secret));
});
