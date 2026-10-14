import { createHash } from 'node:crypto';

/** A JSON value restricted to what both TypeScript and PHP serialise identically. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/**
 * Checks the fixture value rules and returns the value unchanged. Fixtures may contain `null`, booleans, safe integers,
 * NFC-normalised strings, arrays and objects. Non-integer numbers are rejected because PHP and JavaScript print them
 * differently (`1.0`), and integers beyond 2^53 lose precision in JavaScript. Store such values as strings.
 */
export function assertFixtureValue(value: unknown, path = '$'): Json {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value))
      throw new Error(`${path}: only safe integers are allowed in fixtures (got ${String(value)}); use a string`);
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
    value.forEach((item, i) => assertFixtureValue(item, `${path}[${String(i)}]`));
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
      assertFixtureValue(item, `${path}.${key}`);
    }
    return value as Json;
  }
  throw new Error(`${path}: unsupported value of type ${typeof value}`);
}

/**
 * Serialises with keys in byte order. Object property order cannot be used for this: JavaScript always enumerates
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

/** Orders strings by Unicode code point, the order PHP's `ksort` with `SORT_STRING` produces on UTF-8 bytes. */
export function compareCodePoints(a: string, b: string): number {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return Buffer.compare(left, right);
}

/**
 * Canonical JSON: keys sorted by UTF-8 byte order at every level, no insignificant whitespace, unescaped slashes and
 * non-ASCII characters. Identical to the PHP implementation in `tooling/php/src/Fixtures.php`; used for comparison and hashing.
 */
export function canonicalJson(value: unknown): string {
  return serialize(assertFixtureValue(value));
}

export function canonicalHash(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}
