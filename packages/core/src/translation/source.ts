import { canonicalJson } from '../json/canonical.ts';
import { sha256HexUtf8 } from '../json/sha256.ts';
import type { Json } from '../schema/primitives.ts';

/**
 * The marker a translation keeps of the source text it was made from (FR-053, ADR 0003): the first 16 hex characters of the
 * SHA-256 of the UTF-8 canonical JSON of the default-locale values that count as source text, as an object with the property
 * ids in byte order. `propertyIds` selects which default-locale values count (the registry passes the translatable ones, so a
 * link target that is meant to differ per language never makes a translation stale); without it every value counts.
 * Properties that have no value are left out, so adding an empty default does not change the marker.
 */
export function sourceDigest(values: Readonly<Record<string, Json>>, propertyIds?: readonly string[]): string {
  const wanted = propertyIds ?? Object.keys(values);
  const subset: Record<string, Json> = {};
  for (const id of [...new Set(wanted)]) {
    if (Object.hasOwn(values, id)) {
      Object.defineProperty(subset, id, { value: values[id], enumerable: true, writable: true, configurable: true });
    }
  }
  return sha256HexUtf8(canonicalJson(subset)).slice(0, 16);
}
