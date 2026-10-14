import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, resolveTarget, readWorkspaceGlobs } from './check-boundaries.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const realRoot = join(here, '..');
const realConfig = JSON.parse(readFileSync(join(here, 'boundaries.json'), 'utf8'));
const roots = [];

/** Builds a conforming tree in a temp directory; `overrides` patch individual package.json files. */
function fixture(config, { overrides = {}, rootPkg = {}, lock = '', yaml, extraDirs = [] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'blx-boundaries-'));
  roots.push(root);
  for (const [path, w] of Object.entries(config.workspaces)) {
    mkdirSync(join(root, path), { recursive: true });
    const pkg = {
      name: w.name,
      version: '0.0.0',
      private: true,
      dependencies: Object.fromEntries(w.allow.map((a) => [config.scope + a, 'workspace:*'])),
    };
    writeFileSync(join(root, path, 'package.json'), JSON.stringify({ ...pkg, ...(overrides[path] ?? {}) }));
  }
  for (const d of extraDirs) mkdirSync(join(root, d), { recursive: true });
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'root', private: true, ...rootPkg }));
  writeFileSync(join(root, 'pnpm-lock.yaml'), lock);
  writeFileSync(
    join(root, 'pnpm-workspace.yaml'),
    yaml ?? 'packages:\n  - apps/*\n  - packages/*\n  - wordpress/*\n  - tests/*\n  - tooling\n',
  );
  return root;
}
const has = (errors, ...parts) => errors.some((e) => parts.every((p) => e.includes(p)));
test.after(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));

test('the real repository satisfies its boundary rules', () => {
  assert.deepEqual(check(realRoot, realConfig), []);
});

test('a generated conforming tree passes', () => {
  assert.deepEqual(check(fixture(realConfig), realConfig), []);
});

test('resolveTarget unwraps npm: and workspace: aliases', () => {
  assert.equal(resolveTarget('x', 'npm:gsap@^3.12.0'), 'gsap');
  assert.equal(resolveTarget('x', 'npm:@gsap/react@2.1.0'), '@gsap/react');
  assert.equal(resolveTarget('x', 'workspace:*'), 'x');
  assert.equal(resolveTarget('x', 'workspace:^'), 'x');
  assert.equal(resolveTarget('x', 'workspace:@blixis/wp-core@*'), '@blixis/wp-core');
  assert.equal(resolveTarget('x', '^1.0.0'), 'x');
});

test('reads package globs from pnpm-workspace.yaml', () => {
  assert.deepEqual(readWorkspaceGlobs(realRoot), ['apps/*', 'packages/*', 'wordpress/*', 'tests/*', 'tooling']);
});

test('rejects an internal dependency that is not allowed', () => {
  const errors = check(
    fixture(realConfig, {
      overrides: { 'packages/core': { dependencies: { '@blixis/wp-editor-ui': 'workspace:*' } } },
    }),
    realConfig,
  );
  assert.ok(has(errors, 'packages/core', 'may not depend on @blixis/wp-editor-ui'), errors.join('\n'));
});

test('Plus and Pro may only depend on the public extension API (ADR 0009)', () => {
  for (const p of ['wordpress/plus', 'wordpress/pro']) {
    const errors = check(
      fixture(realConfig, { overrides: { [p]: { dependencies: { '@blixis/wp-core': 'workspace:*' } } } }),
      realConfig,
    );
    assert.ok(has(errors, p, 'may not depend on @blixis/wp-core'), errors.join('\n'));
  }
});

test('forbidden and disallowed dependencies are caught in every dependency field', () => {
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    const react = check(
      fixture(realConfig, { overrides: { 'packages/style-engine': { [field]: { react: '^19.0.0' } } } }),
      realConfig,
    );
    assert.ok(has(react, 'forbidden dependency "react"'), `${field}: ${react.join('\n')}`);
    const internal = check(
      fixture(realConfig, { overrides: { 'packages/core': { [field]: { '@blixis/wp-editor-ui': 'workspace:*' } } } }),
      realConfig,
    );
    assert.ok(has(internal, 'may not depend on @blixis/wp-editor-ui'), `${field}: ${internal.join('\n')}`);
  }
});

test('rejects GSAP directly, through npm: aliases, in the root and in the lockfile (ADR 0008)', () => {
  assert.ok(
    has(
      check(fixture(realConfig, { overrides: { 'apps/editor': { dependencies: { gsap: '^3.0.0' } } } }), realConfig),
      'forbidden dependency "gsap"',
    ),
  );
  assert.ok(
    has(
      check(
        fixture(realConfig, { overrides: { 'apps/editor': { dependencies: { animate: 'npm:gsap@^3.12.0' } } } }),
        realConfig,
      ),
      'forbidden dependency "gsap"',
      'alias',
    ),
  );
  assert.ok(
    has(
      check(fixture(realConfig, { rootPkg: { devDependencies: { gsap: '^3.0.0' } } }), realConfig),
      'package.json (root)',
      'gsap',
    ),
  );
  assert.ok(
    has(
      check(
        fixture(realConfig, { lock: 'packages:\n  gsap@3.12.5:\n    resolution: {integrity: sha512-x}\n' }),
        realConfig,
      ),
      'pnpm-lock.yaml',
      'gsap',
    ),
  );
  assert.ok(
    has(
      check(
        fixture(realConfig, {
          lock: "importers:\n  .:\n    dependencies:\n      '@gsap/react':\n        specifier: 2.1.0\n",
        }),
        realConfig,
      ),
      'pnpm-lock.yaml',
      '@gsap/react',
    ),
  );
  assert.deepEqual(check(fixture(realConfig, { lock: 'packages:\n  not-gsap-related@1.0.0:\n' }), realConfig), []);
});

test('a workspace: alias cannot smuggle a disallowed internal package', () => {
  const errors = check(
    fixture(realConfig, {
      overrides: { 'packages/core': { dependencies: { innocent: 'workspace:@blixis/wp-editor-ui@*' } } },
    }),
    realConfig,
  );
  assert.ok(has(errors, 'packages/core', 'may not depend on @blixis/wp-editor-ui'), errors.join('\n'));
});

test('rejects unknown internal package names', () => {
  const errors = check(
    fixture(realConfig, { overrides: { 'packages/core': { dependencies: { '@blixis/wp-nope': 'workspace:*' } } } }),
    realConfig,
  );
  assert.ok(has(errors, 'unknown internal package @blixis/wp-nope'), errors.join('\n'));
});

test('rejects non-workspace protocol for internal dependencies but accepts workspace:^', () => {
  assert.ok(
    has(
      check(
        fixture(realConfig, {
          overrides: { 'packages/element-registry': { dependencies: { '@blixis/wp-core': '^0.0.0' } } },
        }),
        realConfig,
      ),
      'must use the workspace: protocol',
    ),
  );
  assert.deepEqual(
    check(
      fixture(realConfig, {
        overrides: { 'packages/element-registry': { dependencies: { '@blixis/wp-core': 'workspace:^' } } },
      }),
      realConfig,
    ),
    [],
  );
});

test('rejects a package that is published (not private)', () => {
  assert.ok(
    has(
      check(fixture(realConfig, { overrides: { 'packages/core': { private: false } } }), realConfig),
      'must be "private": true',
    ),
  );
});

test('rejects a wrong package name', () => {
  assert.ok(
    has(
      check(fixture(realConfig, { overrides: { 'packages/core': { name: '@blixis/wp-other' } } }), realConfig),
      'expected "@blixis/wp-core"',
    ),
  );
});

test('detects dependency cycles', () => {
  const cyclic = structuredClone(realConfig);
  cyclic.workspaces['packages/core'].allow = ['element-registry'];
  const errors = check(fixture(cyclic), cyclic);
  assert.ok(
    errors.some((e) => e.startsWith('dependency cycle')),
    errors.join('\n'),
  );
});

test('rejects boundaries.json entries that allow unknown packages or duplicate names', () => {
  const bad = structuredClone(realConfig);
  bad.workspaces['packages/core'].allow = ['ghost'];
  assert.ok(has(check(fixture(realConfig), bad), 'allows unknown package "ghost"'));
  const dup = structuredClone(realConfig);
  dup.workspaces['packages/design-tokens'].name = dup.workspaces['packages/core'].name;
  assert.ok(has(check(fixture(realConfig), dup), 'duplicate package name'));
});

test('rejects an undeclared workspace package', () => {
  const root = fixture(realConfig);
  mkdirSync(join(root, 'packages', 'rogue'), { recursive: true });
  writeFileSync(
    join(root, 'packages', 'rogue', 'package.json'),
    JSON.stringify({ name: '@blixis/wp-rogue', private: true }),
  );
  assert.ok(has(check(root, realConfig), 'packages/rogue', 'not declared'));
});

test('rejects a directory under a workspace glob that has no package.json', () => {
  assert.ok(
    has(
      check(fixture(realConfig, { extraDirs: ['packages/forgotten'] }), realConfig),
      'packages/forgotten',
      'has no package.json',
    ),
  );
});

test('a reserved path that gains a manifest must be declared', () => {
  const root = fixture(realConfig);
  mkdirSync(join(root, 'apps', 'docs'), { recursive: true });
  writeFileSync(join(root, 'apps', 'docs', 'package.json'), JSON.stringify({ name: '@blixis/wp-docs', private: true }));
  assert.ok(has(check(root, realConfig), 'apps/docs', 'reserved path now in use'));
});

test('a declared package outside the pnpm workspace globs is rejected', () => {
  const root = fixture(realConfig, { yaml: 'packages:\n  - apps/*\n  - packages/*\n  - wordpress/*\n  - tooling\n' });
  assert.ok(has(check(root, realConfig), 'tests/e2e', 'not matched by pnpm-workspace.yaml'));
});

test('reports a missing manifest, invalid JSON and a missing workspace file', () => {
  const missing = structuredClone(realConfig);
  missing.workspaces['packages/ghost'] = { name: '@blixis/wp-ghost', allow: [], forbidExternal: [] };
  assert.ok(has(check(fixture(realConfig), missing), 'packages/ghost: package.json missing'));
  const root = fixture(realConfig);
  writeFileSync(join(root, 'packages', 'core', 'package.json'), '{ not json');
  assert.ok(has(check(root, realConfig), 'packages/core', 'not valid JSON'));
  rmSync(join(root, 'pnpm-workspace.yaml'));
  assert.ok(has(check(root, realConfig), 'pnpm-workspace.yaml missing'));
});

test('a package with TypeScript sources needs a typecheck script and tsconfig.json', () => {
  const root = fixture(realConfig);
  mkdirSync(join(root, 'packages', 'core', 'src'), { recursive: true });
  writeFileSync(join(root, 'packages', 'core', 'src', 'index.ts'), 'export const x = 1;\n');
  const errors = check(root, realConfig);
  assert.ok(has(errors, 'packages/core', 'no "typecheck" script'), errors.join('\n'));
  assert.ok(has(errors, 'packages/core', 'no tsconfig.json'), errors.join('\n'));
  writeFileSync(join(root, 'packages', 'core', 'tsconfig.json'), '{}');
  writeFileSync(
    join(root, 'packages', 'core', 'package.json'),
    JSON.stringify({ name: '@blixis/wp-core', private: true, scripts: { typecheck: 'tsc -p .' } }),
  );
  assert.deepEqual(check(root, realConfig), []);
});

test('fixtures, declaration files and node_modules do not count as TypeScript sources', () => {
  const root = fixture(realConfig);
  for (const d of ['fixtures', 'node_modules/x']) mkdirSync(join(root, 'tooling', d), { recursive: true });
  writeFileSync(join(root, 'tooling', 'fixtures', 'a.ts'), 'export {};\n');
  writeFileSync(join(root, 'tooling', 'node_modules', 'x', 'b.ts'), 'export {};\n');
  writeFileSync(join(root, 'tooling', 'types.d.ts'), 'export {};\n');
  assert.deepEqual(check(root, realConfig), []);
});
