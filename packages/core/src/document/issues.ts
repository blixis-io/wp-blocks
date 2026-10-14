/** Stable machine-readable codes for everything `validateDocument` can report. Never rename a code: clients and tests depend on them. */
export const ISSUE_CODES = [
  'too-large',
  'invalid-json',
  'too-deep',
  'invalid-value',
  'reserved-key',
  'unsupported-schema-version',
  'migration-failed',
  'schema',
  'duplicate-element-id',
  'tree-too-deep',
  'too-many-nodes',
  'duplicate-locale',
  'default-locale-not-listed',
  'missing-default-locale-stream',
  'translation-locale-not-listed',
  'translation-for-missing-element',
  'orphaned-entry-for-existing-element',
  'unknown-class-reference',
  'duplicate-style-rule',
  'invalid-timestamp',
] as const;

export type IssueCode = (typeof ISSUE_CODES)[number];

export interface DocumentIssue {
  code: IssueCode;
  /** JSON path of the offending value, e.g. `$.root[0].children[2].id`. */
  path: string;
  message: string;
}
