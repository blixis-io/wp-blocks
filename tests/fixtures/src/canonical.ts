import { createHash } from 'node:crypto';
import { assertJsonValue, canonicalJson, compareCodePoints, type Json } from '@blixis/wp-core';

// Canonical JSON and the value rules live in @blixis/wp-core (documents are validated with them in production);
// fixtures re-export them under their historical names and add the SHA-256 helper.
export { canonicalJson, compareCodePoints, type Json };
export const assertFixtureValue = assertJsonValue;

export function canonicalHash(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}
