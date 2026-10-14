import type { Json } from '../schema/primitives.ts';

/**
 * Checks the document/fixture value rules and returns the value unchanged: `null`, booleans, safe integers, well-formed
 * NFC-normalised strings, arrays and plain objects. Non-integer numbers are rejected because PHP and JavaScript print
 * them differently, and integers beyond 2^53 lose precision; store such values as strings. Recursion is bounded by the
 * JSON depth limit, which callers apply first (`assertStrictJson` for text, `measureJsonShape` for parsed objects).
 */
export function assertJsonValue(value: unknown, path = '$'): Json {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value))
      throw new Error(`${path}: only safe integers are allowed (got ${String(value)}); use a string`);
    return value;
  }
  if (typeof value === 'string') {
    if (!value.isWellFormed()) throw new Error(`${path}: strings must be well-formed Unicode (no lone surrogates)`);
    if (value !== value.normalize('NFC')) throw new Error(`${path}: strings must be NFC-normalised`);
    return value;
  }
  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length || Object.getOwnPropertySymbols(value).length > 0) {
      throw new Error(`${path}: sparse arrays and arrays with extra properties are not JSON`);
    }
    value.forEach((item, i) => assertJsonValue(item, `${path}[${String(i)}]`));
    return value as Json;
  }
  if (typeof value === 'object') {
    const proto: unknown = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) throw new Error(`${path}: only plain objects are allowed`);
    if (
      Object.getOwnPropertySymbols(value).length > 0 ||
      Object.getOwnPropertyNames(value).length !== Object.keys(value).length
    ) {
      throw new Error(`${path}: objects with symbol or non-enumerable properties are not JSON`);
    }
    for (const [key, item] of Object.entries(value)) {
      if (!key.isWellFormed() || key !== key.normalize('NFC'))
        throw new Error(`${path}: object keys must be well-formed, NFC-normalised Unicode (${key})`);
      assertJsonValue(item, `${path}.${key}`);
    }
    return value as Json;
  }
  throw new Error(`${path}: unsupported value of type ${typeof value}`);
}

/**
 * Orders strings by Unicode code point, which equals UTF-8 byte order and what PHP's `ksort` with `SORT_STRING`
 * produces. (`<` on JavaScript strings compares UTF-16 code units, which differs for astral characters.)
 */
export function compareCodePoints(a: string, b: string): number {
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const x = a.codePointAt(i) ?? 0;
    const y = b.codePointAt(j) ?? 0;
    if (x !== y) return x < y ? -1 : 1;
    i += x > 0xffff ? 2 : 1;
    j += y > 0xffff ? 2 : 1;
  }
  if (i < a.length) return 1;
  if (j < b.length) return -1;
  return 0;
}

/**
 * Serialises with keys in code point order. Object property order cannot be used: JavaScript always enumerates
 * integer-like keys ("2", "10") numerically first, whatever order they were inserted in, which PHP does not.
 */
function serialize(value: Json): string {
  if (Array.isArray(value)) return `[${value.map(serialize).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value).sort(compareCodePoints);
    return `{${keys.map((key) => `${JSON.stringify(key)}:${serialize(value[key] as Json)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Canonical JSON: keys sorted at every level, no insignificant whitespace, unescaped slashes and non-ASCII characters. */
export function canonicalJson(value: unknown): string {
  return serialize(assertJsonValue(value));
}
