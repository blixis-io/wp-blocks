import { z } from 'zod';
import { ElementNodeSchema, TranslationEntrySchema, TranslationStatusSchema } from '../schema/document.ts';
import {
  BreakpointIdSchema,
  IdSchema,
  JsonValueSchema,
  LocaleIdSchema,
  ModeSchema,
  PropertyIdSchema,
  StateSchema,
} from '../schema/primitives.ts';
import { DOCUMENT_LIMITS } from '../schema/limits.ts';
import { StyleRuleSchema } from '../schema/style.ts';

const statusRecord = z.strictObject({ locale: LocaleIdSchema, elementId: IdSchema, status: TranslationStatusSchema });
const parentId = IdSchema.nullable();
const index = z.number().int();
const selector = z.strictObject({
  breakpoint: BreakpointIdSchema.optional(),
  mode: ModeSchema.optional(),
  state: StateSchema.optional(),
});

/** Runtime shape of every command (strict: unknown fields are errors). Commands cross trust boundaries (REST, macros, tests). */
export const CommandSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('insert'), parentId, index, element: ElementNodeSchema }),
  z.strictObject({ type: z.literal('remove'), id: IdSchema }),
  z.strictObject({ type: z.literal('move'), id: IdSchema, parentId, index }),
  z.strictObject({
    type: z.literal('update-props'),
    id: IdSchema,
    set: z.record(PropertyIdSchema, JsonValueSchema).optional(),
    unset: z.array(PropertyIdSchema).max(256).optional(),
  }),
  z.strictObject({
    type: z.literal('set-style-rule'),
    id: IdSchema,
    selector,
    declarations: StyleRuleSchema.shape.declarations.nullable(),
    index: index.optional(),
    emptyAs: z.enum(['omit', 'keep']).optional(),
  }),
  z.strictObject({ type: z.literal('restore-style-rule'), id: IdSchema, index, rule: StyleRuleSchema }),
  z.strictObject({ type: z.literal('set-class-ids'), id: IdSchema, classIds: z.array(IdSchema).max(64).nullable() }),
  z.strictObject({
    type: z.literal('restore'),
    parentId,
    index,
    element: ElementNodeSchema,
    statuses: z
      .array(z.strictObject({ locale: LocaleIdSchema, elementId: IdSchema, status: TranslationStatusSchema }))
      .max(10_000),
  }),
  z.strictObject({
    type: z.literal('set-translation'),
    locale: LocaleIdSchema,
    elementId: IdSchema,
    set: z.record(PropertyIdSchema, JsonValueSchema).optional(),
    unset: z.array(PropertyIdSchema).max(256).optional(),
    status: z.enum(['draft', 'translated', 'reviewed']).optional(),
  }),
  z.strictObject({
    type: z.literal('restore-translation'),
    locale: LocaleIdSchema,
    elementId: IdSchema,
    entry: TranslationEntrySchema.nullable(),
    dropStream: z.boolean().optional(),
    statuses: z.array(statusRecord).max(1000).optional(),
  }),
  z.strictObject({ type: z.literal('mark-stale'), locale: LocaleIdSchema.optional() }),
  z.strictObject({
    type: z.literal('restore-statuses'),
    statuses: z.array(statusRecord).max(DOCUMENT_LIMITS.maxNodes * 64),
  }),
]);
