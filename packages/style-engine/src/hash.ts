import { sha256Hex } from '@blixis/wp-core';

export { sha256Hex };

/** First 12 hex characters of the SHA-256 (48 bits): the stable part of a generated class name. */
export const shortHash = (text: string): string => sha256Hex(text).slice(0, 12);
