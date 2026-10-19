import { assertJsonValue } from '../json/canonical.ts';
import { isSafeJsonNumber } from '../json/number.ts';
import { utf8Length } from '../json/utf8.ts';
import { DOCUMENT_LIMITS } from '../schema/limits.ts';
import { findReservedKeys } from '../schema/parse.ts';
import type { Json } from '../schema/primitives.ts';
import type { DocumentIssue } from './issues.ts';

/** Upper bound on values (scalars, arrays, objects) in one document. */
export const MAX_JSON_VALUES = 500_000;
const MAX_REPORTED = 50;

type Gate = { ok: true; value: Json } | { ok: false; issues: DocumentIssue[] };
const reject = (code: DocumentIssue['code'], path: string, message: string): Gate => ({
  ok: false,
  issues: [{ code, path, message }],
});

interface Task {
  src: unknown;
  depth: number;
  parent: Json[] | Record<string, Json> | null;
  key: string | number;
  path: string;
}

function put(parent: Json[] | Record<string, Json>, key: string | number, value: Json): void {
  if (Array.isArray(parent)) parent[key as number] = value;
  else Object.defineProperty(parent, key, { value, enumerable: true, writable: true, configurable: true }); // keeps an own `__proto__` as data
}

/**
 * Copies untrusted parsed input exactly once into a fresh, inert tree. Every later gate then works on that copy, so a
 * getter, Proxy or exotic object cannot show one value to the checks and another to the consumer. Iterative (no recursion),
 * and bounded while it copies: nesting depth, value count and an estimate of the serialised size (which gives parsed objects
 * the same byte limit as text). Accessors, sparse arrays, class instances, symbols, functions, bigint, undefined and
 * non-safe-integer numbers are rejected. Anything that throws while being read becomes an `invalid-value` issue.
 */
export function snapshotInput(input: unknown): Gate {
  const holder: Record<string, Json> = {};
  const stack: Task[] = [{ src: input, depth: 1, parent: holder, key: 'v', path: '$' }];
  let values = 0;
  let bytes = 0;
  try {
    while (stack.length > 0) {
      const task = stack.pop();
      if (task === undefined) break;
      const { src, depth, parent, key, path } = task;
      values += 1;
      if (values > MAX_JSON_VALUES)
        return reject('too-many-values', path, `more than ${String(MAX_JSON_VALUES)} values`);
      if (parent === null) break;

      if (src === null) {
        bytes += 4;
        put(parent, key, null);
      } else if (typeof src === 'boolean') {
        bytes += 5;
        put(parent, key, src);
      } else if (typeof src === 'number') {
        if (!isSafeJsonNumber(src))
          return reject(
            'invalid-value',
            path,
            `number is outside the canonical integer/decimal range (got ${String(src)})`,
          );
        bytes += String(src).length;
        put(parent, key, src);
      } else if (typeof src === 'string') {
        bytes += utf8Length(src) + 2;
        put(parent, key, src);
      } else if (typeof src === 'object') {
        if (depth > DOCUMENT_LIMITS.maxJsonDepth)
          return reject('too-deep', path, `nesting deeper than ${String(DOCUMENT_LIMITS.maxJsonDepth)} levels`);
        const isArray = Array.isArray(src);
        const proto: unknown = Object.getPrototypeOf(src);
        if (isArray ? proto !== Array.prototype : proto !== Object.prototype && proto !== null) {
          return reject('invalid-value', path, 'only plain objects and arrays are allowed');
        }
        if (Object.getOwnPropertySymbols(src).length > 0)
          return reject('invalid-value', path, 'symbol keys are not JSON');
        const names = Object.getOwnPropertyNames(src).filter((n) => !isArray || n !== 'length');
        const target: Json[] | Record<string, Json> = isArray ? [] : {};
        put(parent, key, target);
        bytes += 2 + names.length;
        const children: Task[] = [];
        for (const name of names) {
          const d = Object.getOwnPropertyDescriptor(src, name);
          if (d === undefined || !d.enumerable || !('value' in d)) {
            return reject('invalid-value', `${path}.${name}`, 'accessors and non-enumerable properties are not JSON');
          }
          if (isArray && String(Number(name)) !== name)
            return reject('invalid-value', `${path}.${name}`, 'arrays with extra properties are not JSON');
          bytes += isArray ? 0 : utf8Length(name) + 3;
          children.push({
            src: d.value,
            depth: depth + 1,
            parent: target,
            key: isArray ? Number(name) : name,
            path: `${path}${isArray ? `[${name}]` : `.${name}`}`,
          });
        }
        if (isArray && children.length !== (src as unknown[]).length)
          return reject('invalid-value', path, 'sparse arrays are not JSON');
        // Pushed in reverse so the first child is processed first. (No spread: a huge array would overflow the call stack.)
        for (let i = children.length - 1; i >= 0; i -= 1) {
          const child = children[i];
          if (child !== undefined) stack.push(child);
        }
      } else {
        return reject('invalid-value', path, `unsupported value of type ${typeof src}`);
      }
      if (bytes > DOCUMENT_LIMITS.maxBytes)
        return reject('too-large', path, `the document is larger than ${String(DOCUMENT_LIMITS.maxBytes)} bytes`);
    }
  } catch (error) {
    return reject(
      'invalid-value',
      '$',
      `the input could not be read safely: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
  }
  return { ok: true, value: holder['v'] as Json };
}

/** Snapshot, then the value rules (NFC, well-formed Unicode) and the reserved-key rule, all on the inert copy. */
export function admitValue(input: unknown): Gate {
  const snap = snapshotInput(input);
  if (!snap.ok) return snap;
  try {
    assertJsonValue(snap.value);
  } catch (error) {
    return reject('invalid-value', '$', error instanceof Error ? error.message : 'invalid value');
  }
  const reserved = findReservedKeys(snap.value);
  if (reserved.length > 0) {
    return {
      ok: false,
      issues: reserved.slice(0, MAX_REPORTED).map((path) => ({
        code: 'reserved-key' as const,
        path,
        message: 'reserved key (__proto__, constructor, prototype) is not allowed',
      })),
    };
  }
  return snap;
}
