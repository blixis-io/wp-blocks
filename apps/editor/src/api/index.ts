export { createRestClient } from './client';
export type {
  ApiError,
  ApiResult,
  PublicationState,
  RestClient,
  RevisionEntry,
  StreamRead,
  StreamWritten,
} from './types';
import type { ApiError } from './types';

export type ApiErrorDescription =
  | 'unauthenticated'
  | 'forbidden'
  | 'conflict'
  | 'locked'
  | 'rate-limited'
  | 'not-found'
  | 'invalid'
  | 'too-large'
  | 'offline'
  | 'aborted'
  | 'server';

/** Converts transport errors to stable UI catalog keys without exposing server text. */
export function describeApiError(error: ApiError): ApiErrorDescription {
  if (error.kind === 'aborted') return 'aborted';
  if (error.kind === 'network') return 'offline';
  if (error.kind === 'too-large') return 'too-large';
  if (error.kind === 'invalid-response') return 'invalid';
  if (error.status === 401 || (error.status === 403 && error.code === 'rest_cookie_invalid_nonce'))
    return 'unauthenticated';
  if (error.status === 403) return 'forbidden';
  if (error.status === 409) return 'conflict';
  if (error.status === 423) return 'locked';
  if (error.status === 429) return 'rate-limited';
  if (error.status === 404) return 'not-found';
  if (error.status === 413) return 'too-large';
  if ([400, 422, 428].includes(error.status ?? 0)) return 'invalid';
  if ((error.status ?? 0) >= 500) return 'server';
  return 'server';
}
