// Proves the PHP tooling enforces what it claims (BWB-014). These tests FAIL, they do not skip, when
// `composer install` has not been run, so `pnpm test:tooling` cannot pass without checking the PHP tools.
// Set BLX_SKIP_PHP=1 to skip them deliberately (for example on a machine without PHP).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const skip = process.env.BLX_SKIP_PHP === '1' ? 'BLX_SKIP_PHP=1' : false;
const run = (bin, args) => spawnSync(join(root, 'vendor/bin', bin), args, { cwd: root, encoding: 'utf8' });
const read = (file) => readFileSync(join(root, file), 'utf8');

/** Sniff codes PHPCS reports for a fixture. */
function sniffs(fixture) {
  const r = run('phpcs', ['-q', '--report=json', `tooling/php/fixtures/bad/${fixture}`]);
  assert.notEqual(r.status, 0, `${fixture} must be rejected`);
  return Object.values(JSON.parse(r.stdout).files).flatMap((f) => f.messages.map((m) => m.source));
}

test('PHP tools are installed (run `composer install`)', { skip }, () => {
  for (const bin of ['phpcs', 'phpstan', 'phpunit'])
    assert.ok(existsSync(join(root, 'vendor/bin', bin)), `vendor/bin/${bin} missing: run composer install`);
});

test('PHPCS accepts conforming code', { skip }, () => {
  const r = run('phpcs', ['tooling/php/fixtures/good/ok.php']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('PHPCS rejects style violations', { skip }, () => {
  const codes = sniffs('style.php');
  assert.ok(
    codes.some((c) => c.startsWith('WordPress.WhiteSpace.ControlStructureSpacing')),
    codes.join(),
  );
  assert.ok(codes.includes('WordPress.PHP.YodaConditions.NotYoda'), codes.join());
});

test('PHPCS rejects missing documentation', { skip }, () => {
  assert.ok(sniffs('style.php').includes('Squiz.Commenting.FunctionComment.Missing'));
});

test('PHPCS rejects unescaped output', { skip }, () => {
  assert.ok(sniffs('style.php').includes('WordPress.Security.EscapeOutput.OutputNotEscaped'));
});

test('PHPCS rejects a missing nonce check', { skip }, () => {
  assert.ok(sniffs('nonce.php').includes('WordPress.Security.NonceVerification.Missing'));
});

test('PHPCS rejects interpolated SQL', { skip }, () => {
  assert.ok(sniffs('sql.php').includes('WordPress.DB.PreparedSQL.InterpolatedNotPrepared'));
});

test('PHPCS rejects an unregistered text domain', { skip }, () => {
  assert.ok(sniffs('text-domain.php').includes('WordPress.WP.I18n.TextDomainMismatch'));
});

test('the ruleset declares the PHP and WordPress floors and the compatibility standard (ADR 0001)', { skip }, () => {
  const xml = read('phpcs.xml.dist');
  assert.match(xml, /name="testVersion" value="8\.2-"/);
  assert.match(xml, /name="minimum_wp_version" value="7\.0"/);
  assert.match(xml, /<rule ref="PHPCompatibilityWP"\/>/);
  assert.match(run('phpcs', ['-e']).stdout, /PHPCompatibility/);
});

test('PHPStan accepts conforming code and rejects a return type error', { skip }, () => {
  assert.equal(run('phpstan', ['analyse', '--no-progress', 'tooling/php/fixtures/good/ok.php']).status, 0);
  const bad = run('phpstan', ['analyse', '--no-progress', '--error-format=json', 'tooling/php/fixtures/bad/types.php']);
  assert.notEqual(bad.status, 0);
  assert.match(bad.stdout, /return\.type/);
});

test('PHPStan enforces the PHP 8.2 floor: a PHP 8.3 function is rejected', { skip }, () => {
  const r = run('phpstan', [
    'analyse',
    '--no-progress',
    '--error-format=json',
    'tooling/php/fixtures/bad/php83-only.php',
  ]);
  assert.notEqual(r.status, 0);
  assert.match(r.stdout, /function\.notFound/);
});

test('PHPStan runs at level 8 or higher against PHP 8.2, covering wordpress/', { skip }, () => {
  const neon = read('phpstan.neon.dist');
  assert.match(neon, /^\s*level:\s*(8|9|max)\s*$/m);
  assert.match(neon, /^\s*phpVersion:\s*80200\s*$/m);
  assert.match(neon, /^\s*-\s*wordpress\s*$/m);
});

test('the default PHPCS and PHPStan runs pass on the repository and do not scan the bad fixtures', { skip }, () => {
  assert.equal(run('phpcs', []).status, 0);
  assert.equal(run('phpstan', ['analyse', '--no-progress']).status, 0);
});

test('PHPUnit runs the tooling suite with strict settings', { skip }, () => {
  const xml = read('phpunit.xml.dist');
  for (const flag of ['failOnWarning', 'failOnRisky', 'failOnDeprecation', 'beStrictAboutOutputDuringTests'])
    assert.match(xml, new RegExp(`${flag}="true"`));
  const r = run('phpunit', []);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /OK \(\d+ tests/);
});
