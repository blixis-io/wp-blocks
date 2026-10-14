import { z } from 'zod';

/**
 * Value rules shared with the fixtures (docs/engineering/FIXTURES.md): numbers are safe integers only, so documents
 * serialise identically in TypeScript and PHP. Decimal quantities (opacity, line height) are stored as strings.
 * Unicode normalisation (NFC) and the size/depth/node caps cannot be expressed in JSON Schema and are checked by
 * `validateDocument` (BWB-020).
 */
/**
 * Object keys that must never appear anywhere in a document: they are prototype-pollution hazards in JavaScript and are
 * silently dropped by some parsers, which would break the lossless round trip. Enforced by `safeParseDocument` for every
 * object (including unknown fields) and by the JSON Schema for every key pattern and `propertyNames` below.
 */
export const RESERVED_KEYS = ['__proto__', 'constructor', 'prototype'] as const;
const NOT_RESERVED = '(?!(?:__proto__|constructor|prototype)$)';
/** `propertyNames` fragment (JSON Schema) forbidding the reserved keys on loose objects. */
export const NO_RESERVED_PROPERTY_NAMES = { propertyNames: { not: { enum: [...RESERVED_KEYS] } } };

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export const JsonValueSchema: z.ZodType<Json> = z
  .lazy(() =>
    z.union([
      z.null(),
      z.boolean(),
      z.number().int(),
      z.string(),
      z.array(JsonValueSchema),
      z.record(z.string().regex(new RegExp(`^${NOT_RESERVED}[\\s\\S]*$`)), JsonValueSchema),
    ]),
  )
  .meta({ id: 'JsonValue' });

/** Opaque, immutable identifier of an element (or document): lowercase letters, digits, `-` and `_`, 3 to 64 characters. */
export const ID_PATTERN = `^${NOT_RESERVED}[a-z0-9][a-z0-9_-]{2,63}$`;
export const IdSchema = z.string().regex(new RegExp(ID_PATTERN)).meta({ id: 'Id' });

/** Namespaced element type, e.g. `blixis/heading` or `acme-shop/product-card`. */
export const ELEMENT_TYPE_PATTERN = '^[a-z][a-z0-9-]{1,31}/[a-z][a-z0-9-]{1,63}$';
export const ElementTypeSchema = z.string().regex(new RegExp(ELEMENT_TYPE_PATTERN)).meta({ id: 'ElementType' });

/** A WordPress locale id such as `en_US`, `nl_NL`, `de_DE_formal`. */
export const LOCALE_PATTERN = '^[a-z]{2,3}(?:_[A-Z]{2})?(?:_[a-z0-9]{3,12})?$';
export const LocaleIdSchema = z.string().regex(new RegExp(LOCALE_PATTERN)).meta({ id: 'LocaleId' });

/** Registered property key of an element, e.g. `text`, `href`, `alt`. */
export const PROPERTY_ID_PATTERN = `^${NOT_RESERVED}[a-z][a-zA-Z0-9]{0,63}$`;
export const PropertyIdSchema = z.string().regex(new RegExp(PROPERTY_ID_PATTERN)).meta({ id: 'PropertyId' });

/** Registered breakpoint id. `base` is implicit and is expressed by leaving `breakpoint` out. */
export const BREAKPOINT_PATTERN = '^(?!base$)[a-z][a-z0-9-]{0,31}$';
export const BreakpointIdSchema = z.string().regex(new RegExp(BREAKPOINT_PATTERN)).meta({ id: 'BreakpointId' });

export const ModeSchema = z.enum(['light', 'dark']).meta({ id: 'Mode' });
export const StateSchema = z.enum(['hover', 'focus', 'focus-visible', 'active']).meta({ id: 'State' });

/** UTC timestamp with second precision, e.g. `2026-01-01T00:00:00Z`. */
export const TIMESTAMP_PATTERN =
  '^\\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\\d|3[01])T(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\dZ$';
export const TimestampSchema = z.string().regex(new RegExp(TIMESTAMP_PATTERN)).meta({ id: 'Timestamp' });
