import { z } from 'zod';
import { BuilderDocumentSchema, type BuilderDocument } from './document.ts';
import { RESERVED_KEYS } from './primitives.ts';

/** Paths of every object that has a reserved own key (`__proto__`, `constructor`, `prototype`), at any depth. */
export function findReservedKeys(value: unknown, path = '$'): string[] {
  if (value === null || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap((item, i) => findReservedKeys(item, `${path}[${String(i)}]`));
  const found: string[] = [];
  for (const key of Object.getOwnPropertyNames(value)) {
    if ((RESERVED_KEYS as readonly string[]).includes(key)) found.push(`${path}.${key}`);
    found.push(...findReservedKeys((value as Record<string, unknown>)[key], `${path}.${key}`));
  }
  return found;
}

/**
 * Validates the shape of a document and rejects reserved keys anywhere in it. Use this instead of
 * `BuilderDocumentSchema.safeParse`: Zod would silently drop an own `__proto__` key from parsed JSON, breaking the
 * lossless round trip, so such documents are refused up front. Size, depth and node limits are separate gates
 * (`DOCUMENT_LIMITS`, applied by `validateDocument`).
 */
export function safeParseDocument(input: unknown): z.ZodSafeParseResult<BuilderDocument> {
  const reserved = findReservedKeys(input);
  if (reserved.length > 0) {
    return {
      success: false,
      // The error's type parameter is phantom (it only describes the input a failed parse was for).
      error: new z.ZodError(
        reserved.map((path) => ({
          code: 'custom' as const,
          path: path.split('.').slice(1),
          message: `reserved key at ${path}`,
          input,
        })),
      ) as unknown as z.ZodError<BuilderDocument>,
    };
  }
  return BuilderDocumentSchema.safeParse(input);
}
