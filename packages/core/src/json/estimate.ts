import { utf8Length } from './utf8.ts';

/**
 * Estimated serialised size of an inert JSON value, with the same accounting as `snapshotInput` (so the two limits agree):
 * null 4, booleans 5, numbers their digits, strings their UTF-8 bytes + 2, containers 2 + one comma per member, object keys
 * their UTF-8 bytes + 3. Iterative; only for values that already passed `snapshotInput` (no accessors, no cycles).
 */
export function estimateJsonBytes(value: unknown): number {
  let bytes = 0;
  const stack: unknown[] = [value];
  while (stack.length > 0) {
    const v = stack.pop();
    if (v === null) bytes += 4;
    else if (typeof v === 'boolean') bytes += 5;
    else if (typeof v === 'number') bytes += String(v).length;
    else if (typeof v === 'string') bytes += utf8Length(v) + 2;
    else if (Array.isArray(v)) {
      bytes += 2 + v.length;
      for (const item of v) stack.push(item);
    } else if (typeof v === 'object') {
      const entries = Object.entries(v);
      bytes += 2 + entries.length;
      for (const [key, item] of entries) {
        bytes += utf8Length(key) + 3;
        stack.push(item);
      }
    }
  }
  return bytes;
}
