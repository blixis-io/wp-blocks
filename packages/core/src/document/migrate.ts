import type { DocumentIssue } from './issues.ts';

type Plain = Record<string, unknown>;

/**
 * One append-only step from schema version `from` to `from + 1`. A migration is a pure function: it receives a private
 * copy, must keep every field it does not understand (unknown fields round-trip, ADR 0003), and must set `schemaVersion`.
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

/**
 * Brings `input` to `target`. Documents that are already current, or newer than the code understands, are never touched:
 * a newer version fails safely so an older plugin cannot rewrite (and silently corrupt) a newer document.
 */
export function migrateDocument(input: unknown, target: number, registry: readonly Migration[]): MigrationResult {
  if (!isPlain(input)) return fail('schema', '$', 'a document must be a JSON object');
  const version = input['schemaVersion'];
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
  let document: Plain = structuredClone(input);
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
    try {
      document = step.migrate(structuredClone(document));
    } catch (error) {
      return fail(
        'migration-failed',
        '$',
        `migration ${String(current)} -> ${String(current + 1)} failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
    if (!isPlain(document) || document['schemaVersion'] !== current + 1) {
      return fail(
        'migration-failed',
        '$.schemaVersion',
        `migration ${String(current)} -> ${String(current + 1)} did not set schemaVersion ${String(current + 1)}`,
      );
    }
    applied.push(current + 1);
  }
  return { ok: true, document, fromVersion: version, applied };
}

function fail(code: DocumentIssue['code'], path: string, message: string): { ok: false; issue: DocumentIssue } {
  return { ok: false, issue: { code, path, message } };
}
