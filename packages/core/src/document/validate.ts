import { assertJsonValue, canonicalJson } from '../json/canonical.ts';
import { assertStrictJson } from '../json/strict.ts';
import { utf8Length } from '../json/utf8.ts';
import { BuilderDocumentSchema, CURRENT_SCHEMA_VERSION, type BuilderDocument } from '../schema/document.ts';
import { DOCUMENT_LIMITS } from '../schema/limits.ts';
import { findReservedKeys } from '../schema/parse.ts';
import type { DocumentIssue } from './issues.ts';
import { migrateDocument, type Migration } from './migrate.ts';
import { checkSemantics } from './semantic.ts';

/** Append-only migrations to the current schema version. Empty while version 1 is the only version. */
export const MIGRATIONS: readonly Migration[] = [];

const MAX_REPORTED_ISSUES = 50;
const MAX_JSON_VALUES = 500_000;

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

/** Iterative depth/size guard for already-parsed values (also stops cycles): recursion is never used on untrusted input. */
function measureJsonShape(value: unknown): 'ok' | 'too-deep' | 'too-many-values' {
  const stack: [unknown, number][] = [[value, 1]];
  let seen = 0;
  while (stack.length > 0) {
    const item = stack.pop();
    if (item === undefined) break;
    const [current, depth] = item;
    seen += 1;
    if (seen > MAX_JSON_VALUES) return 'too-many-values';
    if (current === null || typeof current !== 'object') continue;
    if (depth > DOCUMENT_LIMITS.maxJsonDepth) return 'too-deep';
    for (const child of Object.values(current)) stack.push([child, depth + 1]);
  }
  return 'ok';
}

function pathOf(segments: readonly PropertyKey[]): string {
  return segments.reduce<string>(
    (acc, s) => (typeof s === 'number' ? `${acc}[${String(s)}]` : `${acc}.${String(s)}`),
    '$',
  );
}

/**
 * The only supported way to accept a document (docs/architecture/DOCUMENT-SCHEMA.md). Pass the stored/received *text*
 * whenever possible: that is the only way to enforce the byte limit before decoding and to reject JSON that decoding would
 * normalise (`1.0`, `-0`, duplicate keys). For already-parsed objects the caller must have enforced the byte limit.
 *
 * Order: byte limit -> strict JSON -> depth -> value rules (safe integers, NFC) -> reserved keys -> schema version and
 * migration -> shape -> semantic checks. Newer schema versions fail without being touched.
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

  const shape = measureJsonShape(value);
  if (shape !== 'ok')
    return fail(
      'too-deep',
      '$',
      shape === 'too-deep' ? `nesting deeper than ${String(DOCUMENT_LIMITS.maxJsonDepth)} levels` : 'too many values',
    );

  try {
    assertJsonValue(value);
  } catch (error) {
    return fail('invalid-value', '$', error instanceof Error ? error.message : 'invalid value');
  }

  const reserved = findReservedKeys(value);
  if (reserved.length > 0) {
    return {
      ok: false,
      errors: reserved.slice(0, MAX_REPORTED_ISSUES).map((path) => ({
        code: 'reserved-key',
        path,
        message: 'reserved key (__proto__, constructor, prototype) is not allowed',
      })),
    };
  }

  const migration = migrateDocument(value, CURRENT_SCHEMA_VERSION, options.migrations ?? MIGRATIONS);
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
