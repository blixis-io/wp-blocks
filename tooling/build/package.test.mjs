import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  symlinkSync,
  utimesSync,
  chmodSync,
  existsSync,
} from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createZip, ZIP32_LIMIT, ZIP_MAX_ENTRIES } from './zip.mjs';
import { buildAll, matches, readVersion, collectFiles, isSemver, hasHeader } from './package.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(join(here, 'distributions.json'), 'utf8'));
const roots = [];
test.after(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));

/** A temporary repository root with a scaffolded theme and plugin. */
function repo(extra = (r) => r) {
  const root = mkdtempSync(join(tmpdir(), 'blx-pack-'));
  roots.push(root);
  const put = (p, c, mode) => {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), c);
    if (mode) chmodSync(join(root, p), mode);
  };
  put('wordpress/theme/style.css', '/*\nTheme Name: Blixis\nVersion: 1.2.3\n*/\n');
  put('wordpress/theme/index.php', '<?php // theme\n');
  put('wordpress/theme/assets/app.css', 'body{}\n');
  put('wordpress/theme/assets/css/theme.css', '.mx-auto{margin-inline:auto}\n');
  put('wordpress/theme/assets/css/tokens.css', '@layer blx.theme, blx.tokens;\n');
  put('wordpress/theme/assets/css/theme.src.css', '@import "tailwindcss";\n');
  put('wordpress/theme/theme.json', '{"version":3}\n');
  put('wordpress/theme/design/default-tokens.json', '{"tokens":[]}\n');
  for (const id of ['ocean', 'forest', 'sunset', 'minimal'])
    put(`wordpress/theme/design/presets/${id}.json`, '{"tokens":[]}\n');
  put('wordpress/theme/build-tokens.mjs', '// source only\n');
  put('wordpress/theme/assets/app.css.map', '{"secret":"map"}');
  put('wordpress/theme/package.json', JSON.stringify({ name: '@blixis/wp-theme', version: '1.2.3' }));
  put('wordpress/theme/tests/ThemeTest.php', '<?php // test\n');
  put('wordpress/theme/node_modules/x/index.js', 'x');
  put('wordpress/plugin/blixis-builder.php', '<?php\n/**\n * Plugin Name: Blixis Builder\n * Version: 0.1.0\n */\n');
  put('wordpress/plugin/bin/tool.php', '<?php // cli\n', 0o755);
  put('wordpress/plugin/data/core-elements.json', '{"apiVersion":1,"elements":[]}\n');
  put('wordpress/plugin/data/css-properties.json', '{"properties":{}}\n');
  put('wordpress/plugin/assets/editor/editor.js', '(()=>{})();\n');
  put('wordpress/plugin/assets/editor/editor.css', '.blx-editor{}\n');
  put('wordpress/plugin/assets/editor/canvas.js', '(()=>{})();\n');
  put('wordpress/plugin/assets/editor/richtext.js', '(()=>{})();\n');
  put('wordpress/plugin/assets/editor/manifest.json', '{"version":1}\n');
  put('wordpress/plugin/assets/editor/NOTICE.txt', 'Solar Icon Set by 480 Design, CC BY 4.0; used unmodified.\n');
  put('wordpress/plugin/assets/editor/editor.js.LEGAL.txt', 'legal\n');
  put('wordpress/plugin/package.json', JSON.stringify({ name: '@blixis/wp-plugin', version: '0.1.0' }));
  extra({ root, put });
  return root;
}
const build = (root, out, opts = {}) =>
  buildAll({ root, config, outDir: join(root, out), allowMissing: true, ...opts });
const py = (code, ...args) => spawnSync('python3', ['-I', '-c', code, ...args], { encoding: 'utf8' });
const listZip = (zip) =>
  JSON.parse(
    py(
      'import zipfile,sys,json\nz=zipfile.ZipFile(sys.argv[1])\nassert z.testzip() is None\nprint(json.dumps([[i.filename,i.date_time,(i.external_attr>>16)&0o777,i.flag_bits&0x800,i.compress_type] for i in z.infolist()]))',
      zip,
    ).stdout,
  );
const readZip = (zip, name) =>
  py('import zipfile,sys\nsys.stdout.write(zipfile.ZipFile(sys.argv[1]).read(sys.argv[2]).decode())', zip, name).stdout;

test('builds valid archives for scaffolded distributions and skips the others', () => {
  const root = repo();
  const results = build(root, 'dist');
  assert.deepEqual(
    results.map((r) => `${r.slug}:${r.status}`),
    ['blixis:built', 'blixis-builder:built', 'blixis-plus:not-built-paid', 'blixis-pro:not-built-paid'],
  );
  const entries = listZip(join(root, 'dist', 'blixis-1.2.3.zip'));
  assert.deepEqual(
    entries.map((e) => e[0]),
    [
      'blixis/assets/app.css',
      'blixis/assets/css/theme.css',
      'blixis/assets/css/tokens.css',
      'blixis/design/default-tokens.json',
      'blixis/design/presets/forest.json',
      'blixis/design/presets/minimal.json',
      'blixis/design/presets/ocean.json',
      'blixis/design/presets/sunset.json',
      'blixis/index.php',
      'blixis/style.css',
      'blixis/theme.json',
    ],
  );
  assert.ok(
    entries.every((e) => e[0].startsWith('blixis/')),
    'single top-level folder',
  );
  assert.deepEqual(
    readZip(join(root, 'dist', 'blixis-1.2.3.zip'), 'blixis/style.css'),
    readFileSync(join(root, 'wordpress/theme/style.css'), 'utf8'),
  );
});

test('entries are sorted, timestamps fixed to the DOS epoch, permissions normalised, names UTF-8', () => {
  const root = repo();
  utimesSync(
    join(root, 'wordpress/theme/style.css'),
    new Date('2031-05-05T05:05:05Z'),
    new Date('2031-05-05T05:05:05Z'),
  );
  build(root, 'dist');
  const entries = listZip(join(root, 'dist', 'blixis-builder-0.1.0.zip'));
  assert.ok(
    entries.some(([name]) => name === 'blixis-builder/assets/editor/NOTICE.txt'),
    'Solar attribution NOTICE ships in the plugin zip',
  );
  assert.deepEqual(
    entries.map((e) => e[0]),
    [
      'blixis-builder/assets/editor/NOTICE.txt',
      'blixis-builder/assets/editor/canvas.js',
      'blixis-builder/assets/editor/editor.css',
      'blixis-builder/assets/editor/editor.js',
      'blixis-builder/assets/editor/editor.js.LEGAL.txt',
      'blixis-builder/assets/editor/manifest.json',
      'blixis-builder/assets/editor/richtext.js',
      'blixis-builder/bin/tool.php',
      'blixis-builder/blixis-builder.php',
      'blixis-builder/data/core-elements.json',
      'blixis-builder/data/css-properties.json',
    ],
  );
  for (const [, date] of entries) assert.deepEqual(date, [1980, 1, 1, 0, 0, 0]);
  assert.deepEqual(
    entries.map((e) => e[2]),
    [0o644, 0o644, 0o644, 0o644, 0o644, 0o644, 0o644, 0o755, 0o644, 0o644, 0o644],
  );
  assert.ok(
    entries.every((e) => e[3] === 0x800),
    'UTF-8 flag set',
  );
});

test('two builds are byte-identical even when file times change', () => {
  const root = repo();
  build(root, 'one');
  utimesSync(
    join(root, 'wordpress/theme/index.php'),
    new Date('2040-01-01T00:00:00Z'),
    new Date('2040-01-01T00:00:00Z'),
  );
  build(root, 'two');
  for (const f of ['blixis-1.2.3.zip', 'blixis-builder-0.1.0.zip', 'blixis-1.2.3.manifest.json', 'SHA256SUMS']) {
    assert.ok(readFileSync(join(root, 'one', f)).equals(readFileSync(join(root, 'two', f))), f);
  }
});

test('the manifest and SHA256SUMS match the archive contents', () => {
  const root = repo();
  build(root, 'dist');
  const manifest = JSON.parse(readFileSync(join(root, 'dist', 'blixis-1.2.3.manifest.json'), 'utf8'));
  assert.equal(manifest.version, '1.2.3');
  for (const f of manifest.files)
    assert.equal(
      f.sha256,
      createHash('sha256')
        .update(readZip(join(root, 'dist', 'blixis-1.2.3.zip'), f.path))
        .digest('hex'),
      f.path,
    );
  const sums = readFileSync(join(root, 'dist', 'SHA256SUMS'), 'utf8');
  const zipHash = createHash('sha256')
    .update(readFileSync(join(root, 'dist', 'blixis-1.2.3.zip')))
    .digest('hex');
  assert.match(sums, new RegExp(`^${zipHash}  blixis-1\\.2\\.3\\.zip$`, 'm'));
});

test('development files, tests, source maps and dependencies are not shipped', () => {
  const root = repo();
  build(root, 'dist');
  const names = listZip(join(root, 'dist', 'blixis-1.2.3.zip'))
    .map((e) => e[0])
    .join();
  for (const bad of [
    'package.json',
    'tests',
    'node_modules',
    '.map',
    'theme.src.css',
    'build-tokens.mjs',
    'tooling/',
    'blixis-child-fixture',
    'blixis-other-fixture',
  ])
    assert.ok(!names.includes(bad), bad);
});

test('secret-like files abort the build, even inside excluded-looking folders', () => {
  for (const name of [
    '.env',
    '.env.local',
    'deploy.pem',
    'server.key',
    'dump.sql',
    'id_rsa',
    '.npmrc',
    'auth.json',
    'cert.pfx',
    'credentials.json',
    'vault.kdbx',
    'wp-config.php',
    '.aws',
    '.htpasswd',
    'store.jks',
  ]) {
    const root = repo(({ put }) => put(`wordpress/theme/assets/${name}`, 'secret'));
    assert.throws(() => build(root, 'dist'), /forbidden file would be packaged/, name);
  }
});

test('symbolic links abort the build', () => {
  const root = repo(({ root: r }) => symlinkSync('/etc/passwd', join(r, 'wordpress/theme/link.php')));
  assert.throws(() => build(root, 'dist'), /symbolic links are not allowed/);
});

test('version problems abort the build: no header, or header differs from package.json', () => {
  assert.throws(
    () =>
      build(
        repo(({ put }) => put('wordpress/theme/style.css', '/* Theme Name: x */')),
        'dist',
      ),
    /no valid SemVer "Version:" header/,
  );
  assert.throws(
    () =>
      build(
        repo(({ put }) => put('wordpress/theme/package.json', JSON.stringify({ version: '9.9.9' }))),
        'dist',
      ),
    /differs from package\.json/,
  );
});

test('missing required files fail unless missing distributions are allowed', () => {
  const root = repo(({ root: r }) => rmSync(join(r, 'wordpress/theme/index.php')));
  assert.throws(
    () => build(root, 'dist', { allowMissing: false }),
    /not scaffolded yet: blixis \(missing index\.php\)/,
  );
  assert.equal(build(root, 'dist', { only: 'blixis' })[0].status, 'missing');
});

test('paid distributions are never built by default, even when scaffolded (ADR 0009: no paid source in public PR builds)', () => {
  const root = repo(({ put }) => {
    put('wordpress/plus/blixis-plus.php', '<?php\n/**\n * Plugin Name: Plus\n * Version: 1.0.0\n */\n');
    put('wordpress/plus/package.json', JSON.stringify({ version: '1.0.0' }));
  });
  const results = build(root, 'dist');
  assert.equal(results.find((r) => r.slug === 'blixis-plus').status, 'not-built-paid');
  assert.ok(!existsSync(join(root, 'dist', 'blixis-plus-1.0.0.zip')));
  const paid = build(root, 'dist2', { includePaid: true });
  assert.equal(paid.find((r) => r.slug === 'blixis-plus').status, 'built');
  assert.ok(existsSync(join(root, 'dist2', 'blixis-plus-1.0.0.zip')));
  assert.deepEqual(
    config.distributions.map((d) => `${d.slug}:${d.tier}`),
    ['blixis:free', 'blixis-builder:free', 'blixis-plus:paid', 'blixis-pro:paid'],
  );
});

test('a required file that is excluded by the exclude list is an error', () => {
  const custom = structuredClone(config);
  custom.distributions[0].required = ['package.json'];
  const root = repo();
  assert.throws(
    () => buildAll({ root, config: custom, outDir: join(root, 'dist'), allowMissing: true, only: 'blixis' }),
    /required file package\.json is excluded or missing/,
  );
});

test('zip writer rejects unsafe or duplicate paths', () => {
  const data = Buffer.from('x');
  assert.throws(() => createZip([{ path: '../evil.php', data, mode: 0o644 }]), /unsafe zip path/);
  assert.throws(() => createZip([{ path: '/abs.php', data, mode: 0o644 }]), /unsafe zip path/);
  assert.throws(
    () =>
      createZip([
        { path: 'a.php', data, mode: 0o644 },
        { path: 'a.php', data, mode: 0o644 },
      ]),
    /duplicate zip entry/,
  );
});

test('zip writer produces archives that standard tools accept, including empty files and non-ASCII names', () => {
  const dir = mkdtempSync(join(tmpdir(), 'blx-zip-'));
  roots.push(dir);
  const file = join(dir, 'a.zip');
  writeFileSync(
    file,
    createZip([
      { path: 'x/empty.txt', data: Buffer.alloc(0), mode: 0o644 },
      { path: 'x/ünï.txt', data: Buffer.from('héllo'), mode: 0o644 },
    ]),
  );
  const entries = listZip(file);
  assert.deepEqual(
    entries.map((e) => e[0]),
    ['x/empty.txt', 'x/ünï.txt'],
  );
  assert.equal(readZip(file, 'x/ünï.txt'), 'héllo');
  assert.equal(spawnSync('unzip', ['-tq', file], { encoding: 'utf8' }).status, 0);
});

test('helpers: glob-lite matching and version header parsing', () => {
  assert.ok(matches('app.css.map', '*.map') && matches('.env.local', '.env.*') && !matches('env', '.env.*'));
  assert.equal(readVersion('/*\nVersion: 2.0.0-beta.1\n*/'), '2.0.0-beta.1');
  assert.equal(readVersion(' * Version: 1.0.0\n'), '1.0.0');
  assert.equal(readVersion('Version: not-semver'), null);
  assert.equal(readVersion('Version: 1.2.3+build.5'), '1.2.3+build.5');
});

test('collectFiles never leaves the source directory', () => {
  const root = repo();
  const files = collectFiles(join(root, 'wordpress/theme'), config);
  assert.ok(files.every((f) => !f.rel.startsWith('..') && !f.rel.startsWith('/')));
});

test('the real repository build runs, reports unscaffolded packages and is reproducible', () => {
  const r = spawnSync(
    process.execPath,
    [join(here, 'package.mjs'), '--allow-missing', '--verify-reproducible', '--out', 'dist/.test'],
    { cwd: join(here, '..', '..'), encoding: 'utf8' },
  );
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /reproducible/);
  rmSync(join(here, '..', '..', 'dist'), { recursive: true, force: true });
});

test('zip bytes do not depend on the order entries are supplied in', () => {
  const entries = ['b/z.php', 'a.php', 'a/b.php', 'b/a.php'].map((path) => ({
    path,
    data: Buffer.from(path),
    mode: 0o644,
  }));
  const forward = createZip(entries);
  assert.ok(forward.equals(createZip([...entries].reverse())));
  assert.ok(forward.equals(createZip([entries[2], entries[0], entries[3], entries[1]])));
});

test('the packaging allow-list is deny-by-default: unknown file types abort the build', () => {
  for (const name of ['run.sh', 'tool.exe', 'notes.bak', 'archive.zip', 'data.db', 'Makefile']) {
    const root = repo(({ put }) => put(`wordpress/theme/assets/${name}`, 'x'));
    assert.throws(() => build(root, 'dist'), /not on the packaging allow-list/, name);
  }
  const ok = repo(
    ({ put }) =>
      put('wordpress/theme/LICENSE', 'GPL') &&
      put('wordpress/theme/readme.txt', 'readme') &&
      put('wordpress/theme/fonts/a.woff2', 'f'),
  );
  assert.equal(build(ok, 'dist')[0].status, 'built');
});

test('SemVer validation is complete', () => {
  for (const v of ['1.2.3', '0.0.0', '1.0.0-rc.1', '1.0.0-alpha-1', '1.0.0+20260101', '1.0.0-beta.2+exp.sha.5114f85'])
    assert.equal(isSemver(v), true, v);
  for (const v of ['1.2', '01.2.3', '1.2.3-', '1.2.3-foo..bar', '1.2.3-01', '1.2.3+', 'v1.2.3', '1.2.3.4'])
    assert.equal(isSemver(v), false, v);
  assert.equal(readVersion('Version: 1.2.3-foo..bar'), null);
});

test('the WordPress identity header, valid SemVer and package.json are all required', () => {
  assert.equal(hasHeader('/*\nTheme Name: Blixis\n*/', 'Theme Name'), true);
  assert.equal(hasHeader('/*\nTheme Name:\n*/', 'Theme Name'), false);
  assert.throws(
    () =>
      build(
        repo(({ put }) => put('wordpress/theme/style.css', '/*\nVersion: 1.2.3\n*/')),
        'dist',
      ),
    /no "Theme Name:" header/,
  );
  assert.throws(
    () =>
      build(
        repo(({ put }) => put('wordpress/plugin/blixis-builder.php', '<?php\n/**\n * Version: 0.1.0\n */\n')),
        'dist',
      ),
    /no "Plugin Name:" header/,
  );
  assert.throws(
    () =>
      build(
        repo(({ root: r }) => rmSync(join(r, 'wordpress/theme/package.json'))),
        'dist',
      ),
    /package\.json is required/,
  );
});

test('size and count limits abort the build before reading files', () => {
  const root = repo(({ put }) => put('wordpress/theme/assets/big.js', 'x'.repeat(2000)));
  const small = (limits) => ({ ...config, limits: { ...config.limits, ...limits } });
  const run = (cfg) => buildAll({ root, config: cfg, outDir: join(root, 'dist'), allowMissing: true, only: 'blixis' });
  assert.throws(() => run(small({ maxFileBytes: 1000 })), /per-file size limit/);
  assert.throws(() => run(small({ maxTotalBytes: 1500 })), /total size limit/);
  assert.throws(() => run(small({ maxFiles: 2 })), /file count limit/);
  assert.equal(run(config)[0].status, 'built');
});

test('ZIP32 limits are enforced instead of silently wrapping', () => {
  const entry = (path, size) => ({ path, data: Buffer.alloc(size, 1), mode: 0o644 });
  assert.equal(ZIP32_LIMIT, 0xfffffffe);
  assert.equal(ZIP_MAX_ENTRIES, 0xfffe);
  assert.throws(() => createZip([entry('a', 10)], { maxValue: 5 }), /exceeds the ZIP32 limit/);
  assert.throws(
    () => createZip([entry('a', 1), entry('b', 1), entry('c', 1)], { maxEntries: 2 }),
    /too many zip entries/,
  );
  const noise = (path) => ({ path, data: randomBytes(1000), mode: 0o644 });
  assert.throws(() => createZip([noise('a'), noise('b')], { maxValue: 1500 }), /ZIP32 limit/); // incompressible data: offsets add up
  assert.throws(
    () => createZip(Array.from({ length: ZIP_MAX_ENTRIES + 1 }, (_, i) => entry(`f${i}`, 0))),
    /too many zip entries/,
  );
  assert.ok(createZip([entry('a', 10)], { maxValue: 1000 }).length > 0);
});
