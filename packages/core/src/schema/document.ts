import { z } from 'zod';
import {
  ElementTypeSchema,
  IdSchema,
  JsonValueSchema,
  LocaleIdSchema,
  NO_RESERVED_PROPERTY_NAMES,
  PropertyIdSchema,
  TimestampSchema,
  type Json,
} from './primitives.ts';
import { StyleRuleSchema, type StyleRule } from './style.ts';

/** The schema version this code writes. Older versions are migrated on load (BWB-020). */
export const CURRENT_SCHEMA_VERSION = 1;

/** Status of a translation entry (FR-052). `orphaned` marks an entry whose element no longer exists (ADR 0004). */
export const TranslationStatusSchema = z
  .enum(['missing', 'draft', 'translated', 'reviewed', 'stale', 'orphaned'])
  .meta({ id: 'TranslationStatus' });

export const TranslationEntrySchema = z
  .looseObject({
    /** Translatable property values, keyed by registered property id. */
    values: z.record(PropertyIdSchema, JsonValueSchema),
    /** Non-default locales: hash of the default-locale values this translation was made from (ADR 0004). */
    sourceHash: z
      .string()
      .regex(/^[0-9a-f]{8,64}$/)
      .optional(),
    status: TranslationStatusSchema,
  })
  .meta({ id: 'TranslationEntry', ...NO_RESERVED_PROPERTY_NAMES });

export interface ElementNode {
  id: string;
  type: string;
  /** Invariant property values only; translatable values live in `translations` (ADR 0003). */
  props: Record<string, Json>;
  /** Global class ids. The order is presentational; precedence comes from the class list (ADR 0005). */
  classIds?: string[] | undefined;
  style?: StyleRule[] | undefined;
  children: ElementNode[];
  /** Unknown fields from newer versions are preserved. */
  [extra: string]: unknown;
}

export const ElementNodeSchema: z.ZodType<ElementNode> = z.lazy(() =>
  z
    .looseObject({
      id: IdSchema,
      type: ElementTypeSchema,
      props: z.record(PropertyIdSchema, JsonValueSchema),
      classIds: z.array(IdSchema).max(64).optional(),
      style: z.array(StyleRuleSchema).max(256).optional(),
      children: z.array(ElementNodeSchema),
    })
    .meta({ id: 'ElementNode', ...NO_RESERVED_PROPERTY_NAMES }),
);

export const DocumentMetadataSchema = z
  .looseObject({
    updatedAt: TimestampSchema,
    editorVersion: z.string().min(1).max(64),
  })
  .meta({ id: 'DocumentMetadata', ...NO_RESERVED_PROPERTY_NAMES });

/**
 * The working builder document (ADR 0003). Published snapshots reference this shape per stream (ADR 0004).
 * Unknown top-level and element fields are allowed and must round-trip unchanged.
 */
export const BuilderDocumentSchema = z
  .looseObject({
    schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
    documentId: IdSchema,
    /** Working layout revision; bumps on structure or style changes. */
    layoutRevision: z.number().int().min(0),
    defaultLocale: LocaleIdSchema,
    locales: z.array(LocaleIdSchema).min(1).max(64),
    /** Ordered top-level siblings; a virtual page root is added when rendering. */
    root: z.array(ElementNodeSchema),
    /** Site-wide class list version this layout was last synced with, and the class versions it references. */
    classListVersion: z.number().int().min(0),
    classRefs: z.record(IdSchema, z.number().int().min(0)),
    /** locale -> element id -> entry. Includes the default locale (ADR 0003). */
    translations: z.record(LocaleIdSchema, z.record(IdSchema, TranslationEntrySchema)),
    metadata: DocumentMetadataSchema,
  })
  .meta({ ...NO_RESERVED_PROPERTY_NAMES });

export type BuilderDocument = z.infer<typeof BuilderDocumentSchema>;
export type TranslationEntry = z.infer<typeof TranslationEntrySchema>;
