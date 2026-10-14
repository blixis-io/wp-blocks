#!/usr/bin/env node
// Reproducible distributable packaging (BWB-017, ADR 0009).
//   node tooling/build/package.mjs [--out dist] [--only slug] [--allow-missing] [--verify-reproducible]
// For each distribution in distributions.json whose source is scaffolded, writes
//   <out>/<slug>-<version>.zip, <slug>-<version>.manifest.json and SHA256SUMS.
// The zip contains a single top-level folder <slug>/. Output is deterministic; the manifest lists every file with its
// SHA-256 so releases can be verified independently of zlib versions.
import { readFileSync, readdirSync, lstatSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createZip } from './zip.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const sha256 = (data) => createHash('sha256').update(data).digest('hex');

/** Glob-lite: `*` matches any characters except `/`; everything else is literal. */
export function matches(name, pattern) {
  const re = new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')}$`);
  return re.test(name);
}

/** Reads the `Version:` header from the first 8 KB of a file. */
export function readVersion(text) {
  const m = /^[ \t/*#@]*Version:\s*([0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?)\s*$/m.exec(text.slice(0, 8192));
  return m ? m[1] : null;
}

/** Collects files to ship. Throws on symlinks, forbidden (secret-like) files and paths that escape the source. */
export function collectFiles(sourceDir, config) {
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const abs = join(dir, name);
      const rel = relative(sourceDir, abs).split(sep).join('/');
      const stat = lstatSync(abs);
      if (config.forbidden.some((p) => matches(name, p))) throw new Error(`forbidden file would be packaged: ${rel}`);
      if (config.exclude.some((p) => matches(name, p))) continue;
      if (stat.isSymbolicLink()) throw new Error(`symbolic links are not allowed in packages: ${rel}`);
      if (stat.isDirectory()) walk(abs);
      else if (stat.isFile()) files.push({ rel, abs, mode: stat.mode & 0o111 ? 0o755 : 0o644 });
      else throw new Error(`unsupported file type: ${rel}`);
    }
  };
  walk(sourceDir);
  return files;
}

export function buildDistribution(root, dist, config, outDir) {
  const sourceDir = join(root, dist.source);
  const missing = dist.required.filter((f) => !existsSync(join(sourceDir, f)));
  if (!existsSync(sourceDir) || missing.length) return { status: 'missing', missing };
  const main = readFileSync(join(sourceDir, dist.main), 'utf8');
  const version = readVersion(main);
  if (!version) throw new Error(`${dist.slug}: no "Version:" header in ${dist.main}`);
  const pkgFile = join(sourceDir, 'package.json');
  if (existsSync(pkgFile)) {
    const pkgVersion = JSON.parse(readFileSync(pkgFile, 'utf8')).version;
    if (pkgVersion !== version)
      throw new Error(`${dist.slug}: header version ${version} differs from package.json version ${pkgVersion}`);
  }
  const files = collectFiles(sourceDir, config);
  for (const r of dist.required)
    if (!files.some((f) => f.rel === r)) throw new Error(`${dist.slug}: required file ${r} is excluded or missing`);
  const entries = files.map((f) => ({ path: `${dist.slug}/${f.rel}`, data: readFileSync(f.abs), mode: f.mode }));
  const zip = createZip(entries);
  const base = `${dist.slug}-${version}`;
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${base}.zip`), zip);
  const manifest = {
    slug: dist.slug,
    kind: dist.kind,
    version,
    files: entries.map((e) => ({
      path: e.path,
      size: e.data.length,
      sha256: sha256(e.data),
      mode: e.mode.toString(8),
    })),
  };
  writeFileSync(join(outDir, `${base}.manifest.json`), `${JSON.stringify(manifest, null, 2)}\n`);
  return { status: 'built', base, zipSha256: sha256(zip), fileCount: entries.length };
}

export function buildAll({ root, config, outDir, only, allowMissing }) {
  const results = [];
  for (const dist of config.distributions) {
    if (only && dist.slug !== only) continue;
    results.push({ slug: dist.slug, ...buildDistribution(root, dist, config, outDir) });
  }
  const missing = results.filter((r) => r.status === 'missing');
  if (missing.length && !allowMissing)
    throw new Error(
      `not scaffolded yet: ${missing.map((m) => `${m.slug} (missing ${m.missing.join(', ') || 'source directory'})`).join('; ')}`,
    );
  const built = results.filter((r) => r.status === 'built');
  if (built.length)
    writeFileSync(join(outDir, 'SHA256SUMS'), built.map((r) => `${r.zipSha256}  ${r.base}.zip\n`).join(''));
  return results;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const args = process.argv.slice(2);
  const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const root = join(here, '..', '..');
  const config = JSON.parse(readFileSync(join(here, 'distributions.json'), 'utf8'));
  const outDir = join(root, opt('--out') ?? 'dist');
  const run = () =>
    buildAll({ root, config, outDir, only: opt('--only'), allowMissing: args.includes('--allow-missing') });
  try {
    rmSync(outDir, { recursive: true, force: true });
    const first = run();
    for (const r of first)
      console.log(
        r.status === 'built'
          ? `built ${r.base}.zip (${r.fileCount} files, sha256 ${r.zipSha256.slice(0, 12)})`
          : `skipped ${r.slug}: not scaffolded yet (missing ${r.missing.join(', ') || 'source directory'})`,
      );
    if (args.includes('--verify-reproducible')) {
      const second = buildAll({
        root,
        config,
        outDir: join(outDir, '.verify'),
        only: opt('--only'),
        allowMissing: args.includes('--allow-missing'),
      });
      rmSync(join(outDir, '.verify'), { recursive: true, force: true });
      const a = first
        .filter((r) => r.status === 'built')
        .map((r) => `${r.base}:${r.zipSha256}`)
        .join();
      const b = second
        .filter((r) => r.status === 'built')
        .map((r) => `${r.base}:${r.zipSha256}`)
        .join();
      if (a !== b) throw new Error('builds are not reproducible: two consecutive builds produced different archives');
      console.log('reproducible: two consecutive builds are byte-identical');
    }
  } catch (e) {
    console.error(`packaging failed: ${e.message}`);
    process.exit(1);
  }
}
