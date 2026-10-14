import { z } from 'zod';

/**
 * What a token holds. The category decides which CSS grammar its value must satisfy (checked by `@blixis/wp-style-engine`,
 * which owns the CSS validator) and where the editor offers it: colours in colour pickers, spacing in padding and gap
 * controls, and so on (FR-004).
 */
export const TOKEN_CATEGORIES = [
  'color',
  'font-family',
  'font-size',
  'spacing',
  'radius',
  'container',
  'shadow',
] as const;
export type TokenCategory = (typeof TOKEN_CATEGORIES)[number];

export const TOKEN_LIMITS = { maxTokens: 500, maxNameLength: 48, maxValueLength: 512, maxLabelLength: 80 } as const;

/** Lower-case words joined by single hyphens; becomes the CSS custom property `--blx-<name>`. */
export const TOKEN_NAME_PATTERN = '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$';

export const CURRENT_TOKEN_SCHEMA_VERSION = 1;
export const CURRENT_PRESET_SCHEMA_VERSION = 1;
export const CUSTOM_PRESET_ID = 'custom';

/** Object keys that are prototype-pollution hazards; refused anywhere in a token set. */
export const RESERVED_KEYS = ['__proto__', 'constructor', 'prototype'] as const;

export const TokenSchema = z
  .looseObject({
    /** Semantic name, for example `color-primary` or `space-4`. */
    name: z.string().min(1).max(TOKEN_LIMITS.maxNameLength).regex(new RegExp(TOKEN_NAME_PATTERN)),
    category: z.enum(TOKEN_CATEGORIES),
    /** The value for light mode and, unless `dark` is set, for dark mode. A CSS value; may reference other tokens with `var(--blx-name)`. */
    value: z.string().min(1).max(TOKEN_LIMITS.maxValueLength),
    /** Optional dark-mode override (modes are sparse: everything else is shared). */
    dark: z.string().min(1).max(TOKEN_LIMITS.maxValueLength).optional(),
    /** Human-readable name shown in the editor. */
    label: z.string().min(1).max(TOKEN_LIMITS.maxLabelLength).optional(),
  })
  .meta({ id: 'Token', propertyNames: { not: { enum: [...RESERVED_KEYS] } } });

/**
 * The site-wide design system: tokens are live settings (ADR 0004): changing one updates every published page, and
 * `tokenVersion` only invalidates caches. A preset seeds a token set; from then on the user's set is canonical.
 */
export const TokenSetSchema = z
  .looseObject({
    schemaVersion: z.literal(CURRENT_TOKEN_SCHEMA_VERSION),
    /** Incremented on every change, for cache keys (ADR 0004). */
    tokenVersion: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    tokens: z.array(TokenSchema).max(TOKEN_LIMITS.maxTokens),
  })
  .meta({ id: 'TokenSet', propertyNames: { not: { enum: [...RESERVED_KEYS] } } });

/** A named seed for a site's canonical token set. Custom starts from the default set and has no preset file. */
export const PresetSchema = z
  .looseObject({
    schemaVersion: z.literal(CURRENT_PRESET_SCHEMA_VERSION),
    id: z.string().min(1).max(TOKEN_LIMITS.maxNameLength).regex(new RegExp(TOKEN_NAME_PATTERN)),
    label: z.string().min(1).max(TOKEN_LIMITS.maxLabelLength),
    description: z.string().min(1).max(512),
    tokens: z.array(TokenSchema).max(TOKEN_LIMITS.maxTokens),
  })
  .meta({ id: 'Preset', propertyNames: { not: { enum: [...RESERVED_KEYS] } } });

export type Token = z.infer<typeof TokenSchema>;
export type TokenSet = z.infer<typeof TokenSetSchema>;
export type Preset = z.infer<typeof PresetSchema>;
export type Mode = 'light' | 'dark';

/** `--blx-<name>`: the custom property a token is emitted as. */
export const tokenProperty = (name: string): string => `--blx-${name}`;

/** The value a token has in a mode. */
export const tokenValueFor = (token: Pick<Token, 'value' | 'dark'>, mode: Mode): string =>
  mode === 'dark' ? (token.dark ?? token.value) : token.value;
