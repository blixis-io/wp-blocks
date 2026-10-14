#!/usr/bin/env node
// Verifies workspace package boundaries against tooling/boundaries.json and pnpm-workspace.yaml
// (ADR 0010, BWB-011). Exit code 0 only if every rule holds. No third-party dependencies.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

/** The package a dependency really resolves to: handles `npm:` and `workspace:name@range` aliases. */
export function resolveTarget(key, value) {
  const v = String(value ?? '');
  const strip = (spec) => {
    const at = spec.lastIndexOf('@');
    return at > 0 ? spec.slice(0, at) : spec; // keep the leading @ of scoped names
  };
  if (v.startsWith('npm:')) return strip(v.slice(4));
  if (v.startsWith('workspace:')) {
    const rest = v.slice('workspace:'.length);
    if (/^[\^~*]|^\d|^$/.test(rest)) return key; // workspace:*, ^, ~, 1.2.3
    return strip(rest);
  }
  return key;
}

/** Reads the `packages:` list from pnpm-workspace.yaml (the only shape we use). */
export function readWorkspaceGlobs(root) {
  const file = join(root, 'pnpm-workspace.yaml');
  if (!existsSync(file)) return null;
  const globs = [];
  let inPackages = false;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (/^packages:\s*$/.test(line)) {
      inPackages = true;
      continue;
    }
    if (inPackages) {
      const m = line.match(/^\s+-\s+['"]?([^'"#\s]+)['"]?\s*(#.*)?$/);
      if (m) globs.push(m[1]);
      else if (line.trim() !== '' && !/^\s*#/.test(line)) inPackages = false;
    }
  }
  return globs;
}

function expand(root, glob) {
  if (glob.endsWith('/*')) {
    const dir = glob.slice(0, -2);
    const abs = join(root, dir);
    if (!existsSync(abs)) return [];
    return readdirSync(abs)
      .filter((e) => statSync(join(abs, e)).isDirectory())
      .map((e) => `${dir}/${e}`);
  }
  if (glob.includes('*'))
    throw new Error(`unsupported workspace glob "${glob}" (only "dir/*" and plain paths are supported)`);
  return existsSync(join(root, glob)) ? [glob] : [];
}

export function check(root, config) {
  const errors = [];
  const byShort = new Map();
  const seenNames = new Set();
  for (const [path, w] of Object.entries(config.workspaces)) {
    if (seenNames.has(w.name)) errors.push(`${path}: duplicate package name ${w.name} in boundaries.json`);
    seenNames.add(w.name);
    byShort.set(w.name.slice(config.scope.length), { path, ...w });
  }
  const denied = new Set(config.globalForbidExternal);

  const checkDeps = (label, all, w) => {
    const allowedNames = new Set(w ? w.allow.map((a) => config.scope + a) : []);
    for (const [dep, value] of Object.entries(all)) {
      const target = resolveTarget(dep, value);
      for (const name of new Set([dep, target])) {
        if (denied.has(name) || (w && w.forbidExternal.includes(name))) {
          errors.push(
            `${label}: forbidden dependency "${name}"${name !== dep ? ` (via alias "${dep}": "${value}")` : ''}`,
          );
        }
      }
      if (!w) continue;
      for (const name of new Set([dep, target])) {
        if (!name.startsWith(config.scope)) continue;
        if (!byShort.has(name.slice(config.scope.length)))
          errors.push(`${label}: depends on unknown internal package ${name}`);
        else if (!allowedNames.has(name))
          errors.push(`${label}: may not depend on ${name} (allowed: ${[...allowedNames].join(', ') || 'none'})`);
      }
      if (dep.startsWith(config.scope) && !String(value).startsWith('workspace:'))
        errors.push(`${label}: ${dep} must use the workspace: protocol`);
    }
  };

  for (const [path, w] of Object.entries(config.workspaces)) {
    const file = join(root, path, 'package.json');
    if (!existsSync(file)) {
      errors.push(`${path}: package.json missing`);
      continue;
    }
    let pkg;
    try {
      pkg = JSON.parse(readFileSync(file, 'utf8'));
    } catch (e) {
      errors.push(`${path}: package.json is not valid JSON (${e.message})`);
      continue;
    }
    if (pkg.name !== w.name) errors.push(`${path}: name is "${pkg.name}", expected "${w.name}"`);
    if (pkg.private !== true) errors.push(`${path}: must be "private": true (nothing is published to npm)`);
    const all = Object.assign({}, ...DEP_FIELDS.map((f) => pkg[f] ?? {}));
    checkDeps(path, all, w);
  }

  // The root manifest is part of the global ban (ADR 0008).
  const rootFile = join(root, 'package.json');
  if (existsSync(rootFile)) {
    try {
      const rootPkg = JSON.parse(readFileSync(rootFile, 'utf8'));
      checkDeps('package.json (root)', Object.assign({}, ...DEP_FIELDS.map((f) => rootPkg[f] ?? {})), null);
    } catch (e) {
      errors.push(`package.json (root): not valid JSON (${e.message})`);
    }
  }
  // ...and so is every resolution in the lockfile, which also catches transitive dependencies.
  const lock = join(root, 'pnpm-lock.yaml');
  if (existsSync(lock)) {
    const text = readFileSync(lock, 'utf8');
    for (const name of denied) {
      const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`(^|[\\s'"/])${esc}(@|['":\\s])`, 'm').test(text))
        errors.push(`pnpm-lock.yaml: resolves forbidden package "${name}"`);
    }
  }

  // Workspace discovery follows pnpm-workspace.yaml and must match boundaries.json in both directions.
  const globs = readWorkspaceGlobs(root);
  if (globs === null) errors.push('pnpm-workspace.yaml missing');
  else {
    const reserved = new Set(config.reserved ?? []);
    const discovered = new Set();
    for (const g of globs) {
      let dirs;
      try {
        dirs = expand(root, g);
      } catch (e) {
        errors.push(e.message);
        continue;
      }
      for (const d of dirs) {
        if (existsSync(join(root, d, 'package.json'))) discovered.add(d);
        else errors.push(`${d}: matched by pnpm-workspace.yaml but has no package.json`);
      }
    }
    for (const d of discovered) {
      if (!config.workspaces[d])
        errors.push(
          `${d}: workspace package is not declared in tooling/boundaries.json${reserved.has(d) ? ' (reserved path now in use: declare it)' : ''}`,
        );
    }
    for (const p of Object.keys(config.workspaces)) {
      if (!discovered.has(p)) errors.push(`${p}: declared in boundaries.json but not matched by pnpm-workspace.yaml`);
    }
  }

  // Internal dependency graph must be acyclic and allow-lists must name real packages.
  for (const w of byShort.values())
    for (const a of w.allow)
      if (!byShort.has(a)) errors.push(`${w.path}: boundaries.json allows unknown package "${a}"`);
  const visiting = new Set();
  const done = new Set();
  const visit = (short, trail) => {
    if (done.has(short)) return;
    if (visiting.has(short)) {
      errors.push(`dependency cycle: ${[...trail, short].join(' -> ')}`);
      return;
    }
    visiting.add(short);
    for (const next of byShort.get(short).allow) if (byShort.has(next)) visit(next, [...trail, short]);
    visiting.delete(short);
    done.add(short);
  };
  for (const short of byShort.keys()) visit(short, []);

  return errors;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const config = JSON.parse(readFileSync(join(root, 'tooling', 'boundaries.json'), 'utf8'));
  const errors = check(root, config);
  if (errors.length) {
    for (const e of errors) console.error(`boundary violation: ${e}`);
    process.exit(1);
  }
  console.log(`workspace boundaries OK (${Object.keys(config.workspaces).length} packages)`);
}
