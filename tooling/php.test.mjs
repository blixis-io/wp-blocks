// Proves the PHP tooling enforces what it claims (BWB-014). Skipped when `composer install` has not been run.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ready = existsSync(join(root, 'vendor/bin/phpcs')) && existsSync(join(root, 'vendor/bin/phpstan'));
const opts = { skip: ready ? false : 'run `composer install` first' };
const run = (bin, args) => spawnSync(join(root, 'vendor/bin', bin), args, { cwd: root, encoding: 'utf8' });

test('PHPCS accepts conforming code', opts, () => {
  const r = run('phpcs', ['tooling/php/fixtures/good/Ok.php']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('PHPCS rejects style, documentation and escaping violations (WordPress standards)', opts, () => {
  const r = run('phpcs', ['-q', '--report=json', 'tooling/php/fixtures/bad/style.php']);
  assert.notEqual(r.status, 0);
  const messages = Object.values(JSON.parse(r.stdout).files)[0].messages.map((m) => m.source);
  assert.ok(
    messages.some((s) => s.startsWith('Generic.WhiteSpace') || s.startsWith('WordPress.WhiteSpace')),
    messages.join(),
  );
  assert.ok(
    messages.some((s) => s.startsWith('WordPress.Security.')),
    `expected a security sniff: ${messages.join()}`,
  );
});

test(
  'the ruleset enforces PHP 8.2+ compatibility, the WordPress minimum version and the text domain (ADR 0001)',
  opts,
  () => {
    const xml = readFileSync(join(root, 'phpcs.xml.dist'), 'utf8');
    assert.match(xml, /name="testVersion" value="8\.2-"/);
    assert.match(xml, /name="minimum_wp_version" value="7\.0"/);
    assert.match(xml, /<rule ref="PHPCompatibilityWP"\/>/);
    const sniffs = run('phpcs', ['-e']).stdout;
    assert.match(sniffs, /PHPCompatibility/);
  },
);

test('PHPStan accepts conforming code and rejects a return type error', opts, () => {
  const ok = run('phpstan', ['analyse', '--no-progress', '--error-format=json', 'tooling/php/fixtures/good/Ok.php']);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  const bad = run('phpstan', ['analyse', '--no-progress', '--error-format=json', 'tooling/php/fixtures/bad/types.php']);
  assert.notEqual(bad.status, 0);
  assert.match(bad.stdout, /return\.type/);
});

test('the default PHPCS and PHPStan runs do not scan the bad fixtures', opts, () => {
  assert.equal(run('phpcs', []).status, 0);
  assert.equal(run('phpstan', ['analyse', '--no-progress']).status, 0);
});

test('PHPUnit runs the tooling suite with strict settings', opts, () => {
  const r = run('phpunit', []);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /OK \(\d+ tests/);
});
