#!/usr/bin/env node
// Licence inventory and policy check (ADR 0008, BWB-015). Reads pnpm and Composer licence data, applies
// tooling/licenses.json and exits non-zero for any unknown, missing or disallowed licence.
// Production dependencies must use a 'distributed' licence; development dependencies may also use 'devOnly'. Exact
// package exceptions are checked in both inventories so accepted custom references remain pinned and auditable.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Evaluates an SPDX licence expression against a set of accepted ids.
 * Grammar: expr := term (OR term)*; term := factor (AND factor)*; factor := "(" expr ")" | id [WITH exception].
 * AND binds tighter than OR; parentheses are honoured. `WITH` exceptions, LicenseRef-* ids and malformed
 * expressions are rejected (conservative: they need a recorded decision).
 */
export function evaluate(expression, accepted) {
  const text = String(expression ?? '').trim();
  if (!text || /^(unknown|unlicensed|see license.*)$/i.test(text)) return false;
  const tokens = text.match(/\(|\)|[^\s()]+/g) ?? [];
  let pos = 0;
  const isOp = (t, op) => t !== undefined && t.toUpperCase() === op;
  function factor() {
    const t = tokens[pos++];
    if (t === undefined) throw new Error('unexpected end');
    if (t === '(') {
      const v = expr();
      if (tokens[pos++] !== ')') throw new Error('missing )');
      return v;
    }
    if (t === ')' || isOp(t, 'AND') || isOp(t, 'OR') || isOp(t, 'WITH')) throw new Error(`unexpected ${t}`);
    if (isOp(tokens[pos], 'WITH')) {
      pos += 2; // exceptions are not understood: treat the licence as not accepted
      return false;
    }
    return accepted.has(t.replace(/\+$/, '-or-later'));
  }
  function term() {
    let v = factor();
    while (isOp(tokens[pos], 'AND')) {
      pos++;
      const r = factor(); // evaluate both sides so syntax errors are never short-circuited away
      v = v && r;
    }
    return v;
  }
  function expr() {
    let v = term();
    while (isOp(tokens[pos], 'OR')) {
      pos++;
      const r = term();
      v = v || r;
    }
    return v;
  }
  try {
    const v = expr();
    return pos === tokens.length && v;
  } catch {
    return false;
  }
}

/** Checks one dependency list. `kind` is 'distributed' or 'dev'. Returns violation strings. */
export function classify(deps, kind, policy) {
  const accepted = new Set(policy.distributed);
  if (kind === 'dev') for (const id of Object.keys(policy.devOnly)) accepted.add(id);
  return deps
    .filter((d) => {
      if (evaluate(d.license, accepted)) return false;
      const exception = (policy.exceptions ?? []).find(
        (entry) =>
          entry.package === `${d.ecosystem}:${d.name}` &&
          entry.version === d.version &&
          entry.license === d.license &&
          typeof entry.reason === 'string' &&
          entry.reason.trim() &&
          typeof entry.decision === 'string' &&
          entry.decision.trim(),
      );
      return exception === undefined;
    })
    .map(
      (d) =>
        `${d.ecosystem}:${d.name}@${d.version}: licence "${d.license || 'missing'}" is not allowed for ${kind} dependencies`,
    );
}

function defaultExec(cmd, args, root) {
  return spawnSync(cmd, args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function runChecked(exec, cmd, args, root) {
  const r = exec(cmd, args, root);
  if (r.error || r.status !== 0)
    throw new Error(`${cmd} ${args.join(' ')} failed (status ${r.status}): ${r.error?.message ?? r.stderr}`);
  return String(r.stdout ?? '').trim();
}

/** pnpm licences. Empty production lists are printed as plain text by pnpm; any other non-JSON output is an error. */
export function pnpmDeps(root, prod, exec = defaultExec) {
  const raw = runChecked(exec, 'pnpm', ['licenses', 'list', '--json', ...(prod ? ['--prod'] : [])], root);
  if (!raw.startsWith('{')) {
    if (/^No licenses in packages found/i.test(raw)) return [];
    throw new Error(`unexpected pnpm licenses output: ${raw.slice(0, 120)}`);
  }
  const out = JSON.parse(raw);
  return Object.entries(out).flatMap(([license, pkgs]) => {
    if (!Array.isArray(pkgs)) throw new Error(`unexpected pnpm licenses entry for ${license}`);
    return pkgs.flatMap((p) =>
      (p.versions?.length ? p.versions : ['unknown']).map((version) => ({
        ecosystem: 'npm',
        name: p.name,
        version,
        license,
      })),
    );
  });
}

export function composerDeps(root, noDev, exec = defaultExec) {
  if (!existsSync(join(root, 'composer.lock'))) return [];
  const out = JSON.parse(
    runChecked(exec, 'composer', ['licenses', '--format=json', ...(noDev ? ['--no-dev'] : [])], root),
  );
  if (typeof out.dependencies !== 'object' || out.dependencies === null)
    throw new Error('unexpected composer licenses output');
  return Object.entries(out.dependencies).map(([name, d]) => ({
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
  if (all.length === 0) throw new Error('empty dependency inventory: refusing to pass vacuously');
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
