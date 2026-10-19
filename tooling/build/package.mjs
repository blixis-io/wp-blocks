#!/usr/bin/env node
// Reproducible distributable packaging (BWB-017, ADR 0009).
//   node tooling/build/package.mjs [--out dist] [--only slug] [--allow-missing] [--include-paid] [--verify-reproducible]
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

// Full SemVer 2.0.0: no leading zeros in numeric identifiers, non-empty dot-separated pre-release and build identifiers.
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
export const isSemver = (v) => SEMVER.test(v);

/** Reads the `Version:` header from the first 8 KB of a file; null unless it is a valid SemVer version. */
export function readVersion(text) {
  const m = /^[ \t/*#@]*Version:[ \t]*(\S+)[ \t]*$/m.exec(text.slice(0, 8192));
  return m && isSemver(m[1]) ? m[1] : null;
}

/** True if the first 8 KB contain the WordPress identity header, e.g. "Plugin Name: ...". */
export const hasHeader = (text, name) => new RegExp(`^[ \\t/*#@]*${name}:[ \\t]*\\S`, 'm').test(text.slice(0, 8192));

const extension = (name) => (name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '');

/**
 * Collects files to ship. Deny by default: only allow-listed extensions and names are packaged; anything else aborts the
 * build (add it to the allow-list or the exclude list deliberately). Forbidden (secret-like) names abort the build wherever
 * they sit among the files that would be visited; excluded directories (tests, node_modules, ...) are never entered, so
 * nothing in them can ship. Symlinks and unsupported file types abort. Trusted-build assumption: the source tree is not
 * modified concurrently (symlink checks use lstat before reading).
 */
export function collectFiles(sourceDir, config) {
  const files = [];
  const limits = config.limits ?? {};
  let total = 0;
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const abs = join(dir, name);
      const rel = relative(sourceDir, abs).split(sep).join('/');
      const stat = lstatSync(abs);
      if (config.forbidden.some((p) => matches(name, p))) throw new Error(`forbidden file would be packaged: ${rel}`);
      if (config.exclude.some((p) => matches(name, p))) continue;
      if (stat.isSymbolicLink()) throw new Error(`symbolic links are not allowed in packages: ${rel}`);
      if (stat.isDirectory()) walk(abs);
      else if (stat.isFile()) {
        const contentRoot =
          config.contentAllowlist && Object.keys(config.contentAllowlist).find((root) => rel.startsWith(`${root}/`));
        if (contentRoot && !config.contentAllowlist[contentRoot].includes(rel.slice(contentRoot.length + 1)))
          throw new Error(`file is not on the content packaging allow-list: ${rel}`);
        const allowed = config.allowedNames?.includes(name) || config.allowedExtensions?.includes(extension(name));
        if (config.allowedExtensions && !allowed)
          throw new Error(
            `file type is not on the packaging allow-list: ${rel} (allow it in distributions.json or exclude it)`,
          );
        if (stat.size > (limits.maxFileBytes ?? Infinity))
          throw new Error(`file exceeds the per-file size limit: ${rel} (${stat.size} bytes)`);
        total += stat.size;
        if (total > (limits.maxTotalBytes ?? Infinity))
          throw new Error(`package exceeds the total size limit (${limits.maxTotalBytes} bytes)`);
        if (files.length + 1 > (limits.maxFiles ?? Infinity))
          throw new Error(`package exceeds the file count limit (${limits.maxFiles})`);
        files.push({ rel, abs, mode: stat.mode & 0o111 ? 0o755 : 0o644 });
      } else throw new Error(`unsupported file type: ${rel}`);
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
  if (!hasHeader(main, dist.identity))
    throw new Error(
      `${dist.slug}: ${dist.main} has no "${dist.identity}:" header (WordPress would not recognise the ${dist.kind})`,
    );
  const version = readVersion(main);
  if (!version) throw new Error(`${dist.slug}: no valid SemVer "Version:" header in ${dist.main}`);
  const pkgFile = join(sourceDir, 'package.json');
  if (!existsSync(pkgFile))
    throw new Error(
      `${dist.slug}: ${dist.source}/package.json is required (the workspace version must match the header)`,
    );
  const pkgVersion = JSON.parse(readFileSync(pkgFile, 'utf8')).version;
  if (pkgVersion !== version)
    throw new Error(`${dist.slug}: header version ${version} differs from package.json version ${pkgVersion}`);
  const files = collectFiles(sourceDir, {
    ...config,
    ...(dist.contentAllowlist ? { contentAllowlist: dist.contentAllowlist } : {}),
  });
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

export function buildAll({ root, config, outDir, only, allowMissing, includePaid = false }) {
  const results = [];
  for (const dist of config.distributions) {
    if (only && dist.slug !== only) continue;
    if (dist.tier === 'paid' && !includePaid) {
      results.push({ slug: dist.slug, status: 'not-built-paid' });
      continue;
    }
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
    buildAll({
      root,
      config,
      outDir,
      only: opt('--only'),
      allowMissing: args.includes('--allow-missing'),
      includePaid: args.includes('--include-paid'),
    });
  try {
    rmSync(outDir, { recursive: true, force: true });
    const first = run();
    for (const r of first)
      console.log(
        r.status === 'built'
          ? `built ${r.base}.zip (${r.fileCount} files, sha256 ${r.zipSha256.slice(0, 12)})`
          : r.status === 'not-built-paid'
            ? `skipped ${r.slug}: paid tier, built only in the protected release path (--include-paid)`
            : `skipped ${r.slug}: not scaffolded yet (missing ${r.missing.join(', ') || 'source directory'})`,
      );
    if (args.includes('--verify-reproducible')) {
      const second = buildAll({
        root,
        config,
        outDir: join(outDir, '.verify'),
        only: opt('--only'),
        allowMissing: args.includes('--allow-missing'),
        includePaid: args.includes('--include-paid'),
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
