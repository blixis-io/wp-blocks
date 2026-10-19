import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

test('element artifacts are generated from schema-valid definitions and are current', async () => {
  const run = spawnSync(process.execPath, ['tooling/elements/generate.mjs', '--check'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const manifest = JSON.parse(await readFile('packages/element-registry/manifest/element-definitions-v2.json', 'utf8'));
  const phpManifest = JSON.parse(await readFile('wordpress/plugin/data/element-definitions-v2.json', 'utf8'));
  const palette = JSON.parse(await readFile('packages/element-registry/manifest/palette-catalog.json', 'utf8'));
  const types = await readFile('packages/element-registry/src/generated-element-types.ts', 'utf8');
  const icons = JSON.parse(await readFile('docs/elements/reports/icon-mismatches.json', 'utf8'));
  assert.equal(manifest.definitions.length, 253);
  assert.deepEqual(phpManifest, manifest);
  assert.ok(manifest.definitions.every((definition) => typeof definition.archetype === 'string'));
  assert.doesNotMatch(types, /gsap/i, 'runtime editor metadata must not bundle the optional animation engine');
  assert.equal(palette.elements.length, 253);
  assert.ok(palette.elements.some((element) => element.status === 'planned'));
  for (const id of [
    'blixis/logo-marquee',
    'blixis/scroll-snap-carousel',
    'blixis/reading-progress',
    'blixis/number-ticker',
    'blixis/scroll-progress',
  ]) {
    assert.equal(
      palette.elements.find((element) => element.id === id)?.status,
      'ready',
      `${id} is implemented and insertable`,
    );
  }
  for (const id of [
    'blixis/form',
    'blixis/text-field',
    'blixis/email-field',
    'blixis/number-field',
    'blixis/url-field',
    'blixis/search-field',
    'blixis/hidden-field',
    'blixis/submit-button',
    'blixis/form-success',
    'blixis/form-error',
    'blixis/newsletter-signup',
    'blixis/contact-form',
  ]) {
    assert.equal(
      palette.elements.find((element) => element.id === id)?.status,
      'ready',
      `${id} has a supported native renderer and submission contract`,
    );
  }
  assert.equal(
    palette.elements.find((element) => element.id === 'blixis/password-field')?.status,
    'planned',
    'password submissions are rejected by the no-retention email handler',
  );
  assert.equal(icons.package, '@iconify-icons/solar');
  assert.ok(icons.mismatches.every((entry) => entry.resolved.startsWith('solar:')));
});
