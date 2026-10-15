import type { MessageKey } from './i18n';
import type { LoadError } from './state';

/**
 * Maps a failed load to a generic, translated message. Server text and validation details are never shown: only the kind of
 * failure decides which catalog entry is used.
 */
export function loadErrorMessageKey(error: LoadError): MessageKey {
  if (error.type === 'invalid') return 'load.error.invalid';
  const { kind, status, code } = error.error;
  if (kind === 'network') return 'load.error.network';
  if (kind === 'invalid-response' || kind === 'too-large') return 'load.error.invalid';
  if (kind !== 'http') return 'load.error.server';
  if (status === 401 || (status === 403 && code === 'rest_cookie_invalid_nonce')) return 'load.error.unauthenticated';
  if (status === 403) return 'load.error.forbidden';
  if (status === 409) return 'load.error.conflict';
  if (status === 423) return 'load.error.locked';
  return 'load.error.server';
}
