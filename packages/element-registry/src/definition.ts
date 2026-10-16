import { z } from 'zod';
import { ElementTypeSchema, PropertyIdSchema, richToPlain, validateRichText, type Json } from '@blixis/wp-core';
import { isSafeUrl } from './url.ts';

/** Version of the registration contract. A definition may require at most this version (docs/architecture/EXTENSION-API.md). */
export const EXTENSION_API_VERSION = 1;

export const CATEGORIES = ['layout', 'content', 'media', 'interactive'] as const;
export type Category = (typeof CATEGORIES)[number];

/**
 * How a property is stored (FR-051). `invariant` values live in `props` and are the same in every language;
 * `translatable` values live in the translation streams and are edited per locale; `locale-specific` values (for example a
 * link target) also live in the translation streams but are never offered for automatic translation.
 */
export const CLASSIFICATIONS = ['invariant', 'translatable', 'locale-specific'] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];

const common = {
  classification: z.enum(CLASSIFICATIONS),
  label: z.string().min(1).max(80),
  required: z.boolean().optional(),
};

export const PropDefinitionSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    ...common,
    kind: z.literal('string'),
    maxLength: z.number().int().min(1).max(100_000),
    default: z.string().optional(),
  }),
  z.strictObject({
    ...common,
    kind: z.literal('text'),
    inline: z.literal(true),
    maxLength: z.number().int().min(1).max(100_000),
    marks: z
      .array(z.enum(['strong', 'em', 'u', 's', 'code', 'link', 'style']))
      .min(1)
      .max(7)
      .optional(),
    default: z.string().optional(),
  }),
  z.strictObject({
    ...common,
    kind: z.literal('enum'),
    values: z.array(z.string().min(1).max(40)).min(1).max(32),
    default: z.string().optional(),
  }),
  z.strictObject({
    ...common,
    kind: z.literal('integer'),
    min: z.number().int(),
    max: z.number().int(),
    default: z.number().int().optional(),
  }),
  z.strictObject({ ...common, kind: z.literal('boolean'), default: z.boolean().optional() }),
  /** A WordPress media-library attachment id (a positive integer). */
  z.strictObject({ ...common, kind: z.literal('media'), default: z.number().int().min(1).optional() }),
  z.strictObject({ ...common, kind: z.literal('url'), default: z.string().max(2048).optional() }),
]);
export type PropDefinition = z.infer<typeof PropDefinitionSchema>;

const NESTING_ENTRY = new RegExp(`^(?:#root|@(?:${CATEGORIES.join('|')})|[a-z][a-z0-9-]{1,31}/[a-z][a-z0-9-]{1,63})$`);

/**
 * Registration data for one element type. `allowedParents` / `allowedChildren` entries are a type (`blixis/heading`), a
 * category (`@layout`) or, for parents only, `#root` (the page itself). A nesting is legal only if the parent accepts the
 * child *and* the child accepts the parent.
 */
export const ElementDefinitionSchema = z.strictObject({
  type: ElementTypeSchema,
  version: z.number().int().min(1),
  title: z.string().min(1).max(80),
  category: z.enum(CATEGORIES),
  /** Which distribution provides it. Everything but `free` needs a fallback class (ADR 0009). */
  tier: z.enum(['free', 'plus', 'pro']),
  /** What the public page shows when the add-on is inactive (ADR 0009 section 3). Required for plus and pro. */
  fallback: z.enum(['static', 'retained', 'unavailable']).optional(),
  requiresApi: z.number().int().min(1),
  props: z.record(PropertyIdSchema, PropDefinitionSchema),
  /** CSS properties this element exposes in the inspector. The style compiler remains the value authority. */
  styleProperties: z.array(z.string().min(1).max(64)).max(64).default([]),
  allowedParents: z.array(z.string().regex(NESTING_ENTRY)).min(1).max(64),
  allowedChildren: z
    .array(
      z
        .string()
        .regex(NESTING_ENTRY)
        .refine((e) => e !== '#root', '#root is not a child'),
    )
    .max(64),
});
export type ElementDefinition = z.infer<typeof ElementDefinitionSchema>;

/** Validator for one property value, built from its definition. */
export function valueSchemaFor(def: PropDefinition): z.ZodType<Json> {
  switch (def.kind) {
    case 'string':
      return z.string().max(def.maxLength);
    case 'text':
      return z.custom<Json>((value) => {
        if (typeof value === 'string') return value.length <= def.maxLength;
        const validated = validateRichText(value);
        return validated.ok && richToPlain(validated.value).length <= def.maxLength;
      });
    case 'enum':
      return z.enum(def.values as [string, ...string[]]);
    case 'integer':
      return z.number().int().min(def.min).max(def.max);
    case 'boolean':
      return z.boolean();
    case 'media':
      return z.number().int().min(1);
    case 'url':
      return z.string().refine(isSafeUrl, 'not a safe URL (allowed: http, https, mailto, tel and relative links)');
  }
}
