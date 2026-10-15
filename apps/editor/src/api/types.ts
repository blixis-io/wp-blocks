/**
 * Contract between the REST client (`src/api/**`) and the editor state (`src/state/**`). Both sides are implemented against
 * this file; change it only together with both. Everything coming back from the server is UNTRUSTED data.
 */

/** A failed call. `kind` tells the UI what to do; `status`/`code` mirror the server (`blixis_*`) when there was a response. */
export interface ApiError {
  kind: 'network' | 'aborted' | 'http' | 'invalid-response' | 'too-large';
  /** HTTP status when the server answered. */
  status?: number;
  /** Stable server error code such as `blixis_conflict` or `blixis_theme_incompatible`. */
  code?: string;
  /** Server-provided details (revisions of a 409, the lock reason of a 423 ...). Plain data only. */
  data?: Record<string, unknown>;
}

export type ApiResult<T> = { ok: true; value: T } | { ok: false; error: ApiError };

/** One working stream as the document routes return it. `document` is the stored envelope, validated only as "a JSON object". */
export interface StreamRead {
  /** Current revision; 0 when the stream was never written (then `document` is null). */
  revision: number;
  /** The locale of a content stream; null for the layout stream. */
  locale: string | null;
  document: Record<string, unknown> | null;
}

/** Result of a successful write: the new revision (the server also sends it as the ETag). */
export interface StreamWritten {
  revision: number;
}

/** Entry of a stream's saved history. */
export interface RevisionEntry {
  revision: number;
  savedAt: string;
  author: number;
}

/** Publication state as `GET /documents/{id}/published` returns it. */
export interface PublicationState {
  pointerRevision: number;
  layout: {
    state: 'unpublished' | 'published' | 'published-with-pending-changes';
    snapshot: number;
    workingRevision: number;
  };
  locales: Record<
    string,
    { state: 'unpublished' | 'published' | 'published-with-pending-changes'; snapshot: number; workingRevision: number }
  >;
}

/**
 * The REST client of one editor session (one post). Created with the validated bootstrap (`restRoot`, `nonce`, `postId`).
 * All methods resolve (never reject): failures are `{ ok: false }`.
 */
export interface RestClient {
  readLayout(options?: { signal?: AbortSignal }): Promise<ApiResult<StreamRead>>;
  readContent(locale: string, options?: { signal?: AbortSignal }): Promise<ApiResult<StreamRead>>;
  /** `If-Match: "<expectedRevision>"`; a stale revision is `{ ok: false, error: { kind: 'http', status: 409, code: 'blixis_conflict', data: { currentRevision, expectedRevision, locale? } } }`. */
  writeLayout(
    document: unknown,
    expectedRevision: number,
    options?: { signal?: AbortSignal },
  ): Promise<ApiResult<StreamWritten>>;
  writeContent(
    locale: string,
    document: unknown,
    expectedRevision: number,
    options?: { signal?: AbortSignal },
  ): Promise<ApiResult<StreamWritten>>;
  listRevisions(
    stream: { locale: string | null },
    options?: { signal?: AbortSignal },
  ): Promise<ApiResult<{ current: number; revisions: RevisionEntry[] }>>;
  readPublication(options?: { signal?: AbortSignal }): Promise<ApiResult<PublicationState>>;
}
