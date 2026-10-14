// Safety checks for the local WordPress environment (BWB-012). Runtime behaviour is covered by `pnpm wp:smoke`
// (needs Docker, runs in CI). These tests resolve the real Compose configuration, so they need Docker too;
// set BLX_SKIP_DOCKER=1 to skip them deliberately.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const skip = process.env.BLX_SKIP_DOCKER === '1' ? 'BLX_SKIP_DOCKER=1' : false;
const read = (f) => readFileSync(join(root, f), 'utf8');

function resolved() {
  const r = spawnSync(
    'docker',
    ['compose', '-f', join(root, 'docker', 'compose.yml'), '--profile', 'tools', 'config', '--format', 'json'],
    { cwd: root, encoding: 'utf8' },
  );
  assert.equal(r.status, 0, `docker compose config failed (is Docker installed?): ${r.stderr}`);
  return JSON.parse(r.stdout);
}

test('every resolved default image is pinned by digest and none uses :latest', { skip }, () => {
  for (const [name, svc] of Object.entries(resolved().services)) {
    assert.match(svc.image, /@sha256:[0-9a-f]{64}$/, `${name}: ${svc.image}`);
    assert.doesNotMatch(svc.image, /:latest/, name);
  }
});

test('every published port is bound to the loopback interface and the database publishes none', { skip }, () => {
  const { services } = resolved();
  for (const [name, svc] of Object.entries(services)) {
    for (const p of svc.ports ?? []) assert.equal(p.host_ip, '127.0.0.1', `${name} publishes ${JSON.stringify(p)}`);
  }
  assert.equal((services.db.ports ?? []).length, 0);
  assert.ok((services.wordpress.ports ?? []).length >= 1);
});

test('no privileged containers, host networking, extra capabilities or docker socket mounts', { skip }, () => {
  for (const [name, svc] of Object.entries(resolved().services)) {
    assert.notEqual(svc.privileged, true, name);
    assert.notEqual(svc.network_mode, 'host', name);
    assert.equal((svc.cap_add ?? []).length, 0, name);
    for (const v of svc.volumes ?? []) assert.doesNotMatch(String(v.source), /docker\.sock/, name);
  }
});

test('the fixture guards are defined by the stack', { skip }, () => {
  // WP-CLI runs the seed script, so it needs the same guards as the web container.
  for (const service of ['wordpress', 'cli']) {
    const env = resolved().services[service].environment.WORDPRESS_CONFIG_EXTRA;
    assert.match(env, /define\( 'WP_ENVIRONMENT_TYPE', 'local' \)/, service);
    assert.match(env, /define\( 'BLIXIS_DEV_FIXTURES', true \)/, service);
  }
  const seed = read('tooling/wp-env/fixtures/seed.php');
  assert.ok(
    seed.indexOf('BLIXIS_DEV_FIXTURES') < seed.indexOf('wp_insert_user'),
    'the guard must come before any write',
  );
});

test('the project name is distinctive and always passed explicitly; reset never removes orphans', () => {
  assert.match(read('docker/compose.yml'), /^name:\s*blixis-wp-blocks\s*$/m);
  const js = read('tooling/wp-env/wp-env.mjs');
  assert.match(js, /'-p', PROJECT/);
  assert.match(js, /delete env\.COMPOSE_PROJECT_NAME/);
  assert.doesNotMatch(js, /--remove-orphans/);
});

test('the CI matrix images are pinned by digest', () => {
  const ci = read('.github/workflows/ci.yml');
  const images = [...ci.matchAll(/^\s+(?:wp|cli)_image:\s*'([^']+)'/gm)].map((m) => m[1]);
  assert.ok(images.length >= 4);
  for (const i of images) assert.match(i, /@sha256:[0-9a-f]{64}$/, i);
});

test('development credentials are labelled as development-only', () => {
  const compose = read('docker/compose.yml');
  for (const secret of ['wordpress-dev-only', 'root-dev-only']) assert.ok(compose.includes(secret));
});
