export {
  BuilderDocumentSchema,
  CURRENT_SCHEMA_VERSION,
  DocumentMetadataSchema,
  ElementNodeSchema,
  TranslationEntrySchema,
  TranslationStatusSchema,
  type BuilderDocument,
  type ElementNode,
  type TranslationEntry,
} from './schema/document.ts';
export { safeParseDocument, findReservedKeys } from './schema/parse.ts';
export { DOCUMENT_LIMITS } from './schema/limits.ts';
export { StyleRuleSchema, DECLARATION_NAME_PATTERN, type StyleRule } from './schema/style.ts';
export {
  BREAKPOINT_PATTERN,
  BreakpointIdSchema,
  ELEMENT_TYPE_PATTERN,
  ElementTypeSchema,
  ID_PATTERN,
  IdSchema,
  JsonValueSchema,
  LOCALE_PATTERN,
  LocaleIdSchema,
  ModeSchema,
  PROPERTY_ID_PATTERN,
  RESERVED_KEYS,
  PropertyIdSchema,
  StateSchema,
  TIMESTAMP_PATTERN,
  TimestampSchema,
  type Json,
} from './schema/primitives.ts';
export { ISSUE_CODES, type DocumentIssue, type IssueCode } from './document/issues.ts';
export { admitValue, snapshotInput, MAX_JSON_VALUES } from './document/gates.ts';
export { migrateDocument, type Migration, type MigrationResult } from './document/migrate.ts';
export {
  MIGRATIONS,
  serializeDocument,
  validateDocument,
  type ValidateOptions,
  type ValidationResult,
} from './document/validate.ts';
export { checkSemantics, type SemanticResult } from './document/semantic.ts';
export { assertStrictJson, MAX_DEPTH } from './json/strict.ts';
export { assertJsonValue, canonicalJson, compareCodePoints } from './json/canonical.ts';
export { utf8Length } from './json/utf8.ts';
export * from './commands/index.ts';
