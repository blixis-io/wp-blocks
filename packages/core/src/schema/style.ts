import { z } from 'zod';
import { DOCUMENT_LIMITS } from './limits.ts';
import { BreakpointIdSchema, ModeSchema, NO_RESERVED_PROPERTY_NAMES, StateSchema } from './primitives.ts';

/** A CSS property name or a `--blx-*` custom property. The value allow-list is enforced by `@blixis/wp-style-engine` (BWB-023, docs/architecture/CSS-VALIDATION.md). */
export const DECLARATION_NAME_PATTERN = '^(?:--blx-[a-z0-9-]{1,64}|[a-z][a-z0-9-]{0,63})$';

/**
 * One sparse style rule (ADR 0003, ADR 0005). Which of `breakpoint`, `mode` and `state` are present decides the layer
 * the rule belongs to; two rules with the same combination on the same element are a validation error (BWB-020).
 */
export const StyleRuleSchema = z
  .looseObject({
    breakpoint: BreakpointIdSchema.optional(),
    mode: ModeSchema.optional(),
    state: StateSchema.optional(),
    /** Property name -> value. Numbers are safe integers; decimals are strings. */
    declarations: z
      .record(z.string().regex(new RegExp(DECLARATION_NAME_PATTERN)), z.union([z.string().max(2048), z.number().int()]))
      .refine((d) => Object.keys(d).length <= DOCUMENT_LIMITS.maxDeclarationsPerRule, {
        message: `at most ${String(DOCUMENT_LIMITS.maxDeclarationsPerRule)} declarations per rule`,
      })
      // Zod ignores refinements when generating JSON Schema, so the same limit is stated there explicitly.
      .meta({ maxProperties: DOCUMENT_LIMITS.maxDeclarationsPerRule }),
  })
  .meta({ id: 'StyleRule', ...NO_RESERVED_PROPERTY_NAMES });

export type StyleRule = z.infer<typeof StyleRuleSchema>;
