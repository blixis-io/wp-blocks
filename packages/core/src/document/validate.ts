import { canonicalJson } from '../json/canonical.ts';
import { assertStrictJson } from '../json/strict.ts';
import { utf8Length } from '../json/utf8.ts';
import { BuilderDocumentSchema, CURRENT_SCHEMA_VERSION, type BuilderDocument } from '../schema/document.ts';
import { DOCUMENT_LIMITS } from '../schema/limits.ts';
import type { DocumentIssue } from './issues.ts';
import { admitValue } from './gates.ts';
import { migrateAdmitted, type Migration } from './migrate.ts';
import { checkSemantics } from './semantic.ts';

/** Append-only migrations to the current schema version. Empty while version 1 is the only version. */
export const MIGRATIONS: readonly Migration[] = [];

const MAX_REPORTED_ISSUES = 50;

export interface ValidateOptions {
  /** Override the migration chain (tests). Defaults to `MIGRATIONS`. */
  migrations?: readonly Migration[];
}

export type ValidationResult =
  | {
      ok: true;
      document: BuilderDocument;
      warnings: DocumentIssue[];
      /** Version found in the input; the returned document is always the current version. */
      fromVersion: number;
      migrated: boolean;
    }
  | { ok: false; errors: DocumentIssue[] };

const fail = (code: DocumentIssue['code'], path: string, message: string): ValidationResult => ({
  ok: false,
  errors: [{ code, path, message }],
});

function pathOf(segments: readonly PropertyKey[]): string {
  return segments.reduce<string>(
    (acc, s) => (typeof s === 'number' ? `${acc}[${String(s)}]` : `${acc}.${String(s)}`),
    '$',
  );
}

/**
 * The only supported way to accept a document (docs/architecture/DOCUMENT-SCHEMA.md). Pass the stored/received *text*
 * whenever possible: that is the only way to enforce the byte limit before decoding and to reject JSON that decoding would
 * normalise (`1.0`, `-0`, duplicate keys). Already-parsed objects are accepted too: they are snapshotted once and bounded by the same limits (size is estimated from their contents).
 *
 * Order: byte limit -> strict JSON -> inert snapshot (depth, value count, size estimate, no accessors or exotic objects) ->
 * value rules (canonical integers/decimals, NFC) -> reserved keys -> schema version and migration (output re-checked) -> shape -> semantic
 * checks. Parsed objects are copied once and bounded by the same size limit as text; they are never read again.
 */
export function validateDocument(input: unknown, options: ValidateOptions = {}): ValidationResult {
  let value: unknown = input;
  if (typeof input === 'string') {
    if (utf8Length(input) > DOCUMENT_LIMITS.maxBytes) {
      return fail('too-large', '$', `the document is larger than ${String(DOCUMENT_LIMITS.maxBytes)} bytes`);
    }
    try {
      assertStrictJson(input);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'invalid JSON';
      return fail(message.includes('nesting deeper') ? 'too-deep' : 'invalid-json', '$', message);
    }
    value = JSON.parse(input);
  }

  // One inert snapshot of the input; every later gate and the returned document come from it, never from `input` again.
  const admitted = admitValue(value);
  if (!admitted.ok) return { ok: false, errors: admitted.issues };

  const migration = migrateAdmitted(admitted.value, CURRENT_SCHEMA_VERSION, options.migrations ?? MIGRATIONS);
  if (!migration.ok) return { ok: false, errors: [migration.issue] };

  const parsed = BuilderDocumentSchema.safeParse(migration.document);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues
        .slice(0, MAX_REPORTED_ISSUES)
        .map((issue) => ({ code: 'schema', path: pathOf(issue.path), message: issue.message })),
    };
  }

  const semantic = checkSemantics(parsed.data);
  if (semantic.errors.length > 0) return { ok: false, errors: semantic.errors.slice(0, MAX_REPORTED_ISSUES) };
  return {
    ok: true,
    document: parsed.data,
    warnings: semantic.warnings,
    fromVersion: migration.fromVersion,
    migrated: migration.applied.length > 0,
  };
}

/**
 * Deterministic text form of a document for storage, revision hashes and equality: canonical JSON (keys sorted by code
 * point at every level, no whitespace). Parsing it with `validateDocument` yields an equal document.
 */
export function serializeDocument(document: BuilderDocument): string {
  return canonicalJson(document);
}
