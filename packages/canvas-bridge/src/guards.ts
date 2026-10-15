/**
 * Failure of a validator. It names a category only: the offending data is never echoed, so a log line or an error screen
 * built from it cannot carry attacker-controlled text.
 */
export type Failure = 'malformed' | 'unknown-type' | 'invalid-field' | 'too-large';
export type Parsed<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: Failure };

export const fail = (reason: Failure): { ok: false; reason: Failure } => ({ ok: false, reason });
export const succeed = <T>(value: T): { ok: true; value: T } => ({ ok: true, value });

export type Fields = Readonly<Record<string, unknown>>;

/**
 * Reads a plain data object with exactly the allowed keys. It refuses (returns `null`) arrays, class instances, objects with
 * a foreign prototype, symbol keys, accessor properties (a getter would run attacker code), non-enumerable data, unknown keys
 * (this also refuses `__proto__`, `constructor` and `prototype` unless a schema lists them, and none does) and missing
 * required keys. The result is a null-prototype copy, so reading a key can never reach `Object.prototype`.
 */
export function readExact(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): Fields | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const proto: unknown = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return null;
  const keys = Reflect.ownKeys(value);
  const copy: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    if (typeof key !== 'string') return null;
    if (!required.includes(key) && !optional.includes(key)) return null;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !('value' in descriptor) || descriptor.enumerable !== true) return null;
    copy[key] = descriptor.value;
  }
  for (const key of required) if (!(key in copy)) return null;
  return copy;
}

export const isInt = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;

export const isFiniteWithin = (value: unknown, limit: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= -limit && value <= limit;

export const isStringMax = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length <= max;
