#!/usr/bin/env node
// Licence inventory and policy check (ADR 0008, BWB-015). Reads pnpm and Composer licence data, applies
// tooling/licenses.json and exits non-zero for any unknown, missing or disallowed licence.
// Production (distributed) dependencies must use a 'distributed' licence; development dependencies may also use 'devOnly'.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Splits "MIT OR Apache-2.0" / "(MIT AND ISC)" into ids; OR means any one acceptable id suffices, AND needs all. */
export function evaluate(expression, accepted) {
  const text = String(expression ?? '').trim();
  if (!text || /^(unknown|unlicensed|see license.*)$/i.test(text)) return false;
  const clean = text.replace(/[()]/g, ' ');
  return clean
    .split(/\s+or\s+/i)
    .some((alt) => alt.split(/\s+and\s+/i).every((id) => accepted.has(id.trim().replace(/\+$/, '-or-later'))));
}

/** Checks one dependency list. `kind` is 'distributed' or 'dev'. Returns violation strings. */
export function classify(deps, kind, policy) {
  const accepted = new Set(policy.distributed);
  if (kind === 'dev') for (const id of Object.keys(policy.devOnly)) accepted.add(id);
  return deps
    .filter((d) => !evaluate(d.license, accepted))
    .map(
      (d) =>
        `${d.ecosystem}:${d.name}@${d.version}: licence "${d.license || 'missing'}" is not allowed for ${kind} dependencies`,
    );
}

function run(cmd, args, root) {
  const r = spawnSync(cmd, args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0 && !r.stdout) throw new Error(`${cmd} ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout;
}

function pnpmDeps(root, prod) {
  const raw = run('pnpm', ['licenses', 'list', '--json', ...(prod ? ['--prod'] : [])], root).trim();
  const out = raw.startsWith('{') ? JSON.parse(raw) : {}; // pnpm prints plain text when there is nothing to list
  return Object.entries(out).flatMap(([license, pkgs]) =>
    pkgs.flatMap((p) =>
      (p.versions?.length ? p.versions : ['?']).map((version) => ({
        ecosystem: 'npm',
        name: p.name,
        version,
        license,
      })),
    ),
  );
}

function composerDeps(root, noDev) {
  if (!existsSync(join(root, 'composer.lock'))) return [];
  const out = JSON.parse(run('composer', ['licenses', '--format=json', ...(noDev ? ['--no-dev'] : [])], root));
  return Object.entries(out.dependencies ?? {}).map(([name, d]) => ({
    ecosystem: 'composer',
    name,
    version: d.version,
    license: (d.license ?? []).join(' OR '),
  }));
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const policy = JSON.parse(readFileSync(join(root, 'tooling', 'licenses.json'), 'utf8'));
  const prod = [...pnpmDeps(root, true), ...composerDeps(root, true)].filter((d) => d.name !== 'blixis/wp-blocks-dev');
  const all = [...pnpmDeps(root, false), ...composerDeps(root, false)].filter((d) => d.name !== 'blixis/wp-blocks-dev');
  const violations = [...classify(prod, 'distributed', policy), ...classify(all, 'dev', policy)];
  const counts = {};
  for (const d of all) counts[d.license] = (counts[d.license] ?? 0) + 1;
  console.log(`licence inventory: ${all.length} dependencies (${prod.length} distributed)`);
  for (const [lic, n] of Object.entries(counts).sort((a, b) => b[1] - a[1]))
    console.log(`  ${String(n).padStart(4)}  ${lic}`);
  if (process.argv.includes('--write'))
    writeFileSync(process.argv[process.argv.indexOf('--write') + 1], JSON.stringify(all, null, 2));
  if (violations.length) {
    for (const v of [...new Set(violations)]) console.error(`licence violation: ${v}`);
    process.exit(1);
  }
  console.log('licence policy OK');
}
