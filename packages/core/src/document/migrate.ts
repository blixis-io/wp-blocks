import { admitValue } from './gates.ts';
import type { DocumentIssue } from './issues.ts';

type Plain = Record<string, unknown>;

/**
 * One append-only step from schema version `from` to `from + 1`. A migration is a pure function: it receives a private
 * copy, must keep every field it does not understand (unknown fields round-trip, ADR 0003), and must set `schemaVersion`.
 * Its output is checked again by every input gate (reserved keys, value rules, depth, size) before the next step runs.
 */
export interface Migration {
  from: number;
  to: number;
  migrate: (document: Plain) => Plain;
}

export type MigrationResult =
  { ok: true; document: Plain; fromVersion: number; applied: number[] } | { ok: false; issue: DocumentIssue };

const isPlain = (value: unknown): value is Plain =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const fail = (code: DocumentIssue['code'], path: string, message: string): { ok: false; issue: DocumentIssue } => ({
  ok: false,
  issue: { code, path, message },
});

/**
 * Brings `input` to `target`. The input is first copied once into an inert snapshot (and passes every input gate); the
 * caller's object is never read again or modified. Documents that are already current, or newer than the code
 * understands, are never altered: a newer version fails safely so an older plugin cannot rewrite a newer document.
 */
export function migrateDocument(input: unknown, target: number, registry: readonly Migration[]): MigrationResult {
  const admitted = admitValue(input);
  if (!admitted.ok) {
    const issue = admitted.issues[0];
    return issue === undefined ? fail('invalid-value', '$', 'the input was rejected') : { ok: false, issue };
  }
  return migrateAdmitted(admitted.value, target, registry);
}

/** Same as `migrateDocument` for a value that already passed `admitValue` (used by `validateDocument`). */
export function migrateAdmitted(value: unknown, target: number, registry: readonly Migration[]): MigrationResult {
  if (!isPlain(value)) return fail('schema', '$', 'a document must be a JSON object');
  const version = value['schemaVersion'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return fail('schema', '$.schemaVersion', 'schemaVersion must be a positive integer');
  }
  if (version > target) {
    return fail(
      'unsupported-schema-version',
      '$.schemaVersion',
      `schema version ${String(version)} is newer than this software understands (${String(target)}); the document is left untouched`,
    );
  }
  const froms = registry.map((m) => m.from);
  if (new Set(froms).size !== froms.length)
    return fail('migration-failed', '$', 'the migration registry has two steps for the same version');

  let document: Plain = value;
  const applied: number[] = [];
  for (let current = version; current < target; current += 1) {
    const step = registry.find((m) => m.from === current);
    if (step?.to !== current + 1) {
      return fail(
        'migration-failed',
        '$.schemaVersion',
        `no migration from schema version ${String(current)} to ${String(current + 1)}`,
      );
    }
    let output: unknown;
    try {
      output = step.migrate(document);
    } catch (error) {
      return fail(
        'migration-failed',
        '$',
        `migration ${String(current)} -> ${String(current + 1)} failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
    // The output is untrusted: re-run every input gate on a fresh snapshot of it.
    const admitted = admitValue(output);
    if (!admitted.ok) {
      const issue = admitted.issues[0];
      return fail(
        'migration-failed',
        issue?.path ?? '$',
        `migration ${String(current)} -> ${String(current + 1)} produced unsafe output (${issue?.code ?? 'rejected'}): ${issue?.message ?? ''}`,
      );
    }
    if (!isPlain(admitted.value) || admitted.value['schemaVersion'] !== current + 1) {
      return fail(
        'migration-failed',
        '$.schemaVersion',
        `migration ${String(current)} -> ${String(current + 1)} did not set schemaVersion ${String(current + 1)}`,
      );
    }
    document = admitted.value;
    applied.push(current + 1);
  }
  return { ok: true, document, fromVersion: version, applied };
}
