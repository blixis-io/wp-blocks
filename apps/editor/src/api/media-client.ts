import type { ApiResult, MediaClient, MediaItem } from './types';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif']);
const FIELDS = 'id,source_url,alt_text,title,media_details,mime_type';
interface Options {
  wpRestRoot: string;
  nonce: string;
  maxUploadBytes: number;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxResponseBytes?: number;
}
type Result<T> = ApiResult<T>;
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function text(value: unknown): string | null {
  if (typeof value === 'string') return value;
  return object(value) && typeof value['rendered'] === 'string' ? value['rendered'] : null;
}
function integer(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function failure<T>(
  kind: 'network' | 'aborted' | 'http' | 'invalid-response' | 'too-large',
  code?: string,
  status?: number,
): Result<T> {
  return { ok: false, error: { kind, ...(code ? { code } : {}), ...(status ? { status } : {}) } };
}

/** Core media REST API client; every operation resolves to an ApiResult. */
export function createMediaClient({
  wpRestRoot,
  nonce,
  maxUploadBytes,
  fetchImpl = globalThis.fetch,
  timeoutMs = 30_000,
  maxResponseBytes = 2 * 1024 * 1024,
}: Options): MediaClient {
  let base: URL | null = null;
  try {
    const candidate = new URL(wpRestRoot);
    if (
      ['http:', 'https:'].includes(candidate.protocol) &&
      candidate.origin === globalThis.location.origin &&
      !candidate.username &&
      !candidate.password
    )
      base = candidate;
  } catch {
    /* fail closed */
  }
  if (base && !base.pathname.endsWith('/')) base.pathname += '/';
  const safeUrl = (value: unknown): string | null => {
    if (typeof value !== 'string' || !base) return null;
    try {
      const url = new URL(value);
      return url.origin === base.origin && ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
        ? url.href
        : null;
    } catch {
      return null;
    }
  };
  const parseItem = (value: unknown): MediaItem | 'unsafe-url' | null => {
    if (!object(value) || !integer(value['id']) || value['id'] < 1 || !object(value['media_details'])) return null;
    const details = value['media_details'];
    const sizes = object(details['sizes']) ? details['sizes'] : {};
    const thumbCandidate = (['thumbnail', 'medium'] as const)
      .map((key) => (object(sizes[key]) ? safeUrl(sizes[key]['source_url']) : null))
      .find((item) => item !== null);
    const title = text(value['title']);
    if (
      title === null ||
      typeof value['alt_text'] !== 'string' ||
      typeof value['mime_type'] !== 'string' ||
      !IMAGE_TYPES.has(value['mime_type'])
    )
      return null;
    const url = safeUrl(value['source_url']);
    if (!url) return 'unsafe-url';
    const thumb = thumbCandidate ?? url;
    return {
      id: value['id'],
      url,
      thumbUrl: thumb,
      alt: value['alt_text'],
      title,
      width: integer(details['width']) ? details['width'] : 0,
      height: integer(details['height']) ? details['height'] : 0,
      mime: value['mime_type'],
    };
  };
  async function request<T>(
    url: URL | null,
    init: RequestInit,
    signal: AbortSignal | undefined,
    validate: (value: unknown, response: Response) => T | null,
  ): Promise<Result<T>> {
    if (!url || !base) return failure('network');
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);
    const abort = () => {
      controller.abort();
    };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) controller.abort();
    try {
      const headers = new Headers({ Accept: 'application/json', 'X-WP-Nonce': nonce });
      new Headers(init.headers).forEach((value, key) => {
        headers.set(key, value);
      });
      const response = await fetchImpl(url, {
        ...init,
        credentials: 'same-origin',
        redirect: 'error',
        headers,
        signal: controller.signal,
      });
      if (response.redirected) return failure('network');
      let body: string;
      const stream = response.body;
      if (stream === null) {
        body = await response.text();
        if (new TextEncoder().encode(body).byteLength > maxResponseBytes) return failure('too-large');
      } else {
        const reader = stream.getReader();
        const chunks: Uint8Array[] = [];
        let bytes = 0;
        let done = false;
        while (!done) {
          const chunk = await reader.read();
          if (chunk.value === undefined) {
            done = true;
            continue;
          }
          bytes += chunk.value.byteLength;
          if (bytes > maxResponseBytes) {
            controller.abort();
            return failure('too-large');
          }
          chunks.push(chunk.value);
        }
        const joined = new Uint8Array(bytes);
        let offset = 0;
        for (const chunk of chunks) {
          joined.set(chunk, offset);
          offset += chunk.length;
        }
        body = new TextDecoder().decode(joined);
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        return failure('invalid-response');
      }
      if (!response.ok) {
        const code = object(parsed) && typeof parsed['code'] === 'string' ? parsed['code'] : undefined;
        const mapped =
          response.status === 413
            ? 'media_upload_too_large'
            : response.status === 401
              ? 'media_unauthenticated'
              : response.status === 403
                ? 'media_forbidden'
                : code?.startsWith('rest_upload_')
                  ? 'media_upload_rejected'
                  : code;
        return failure('http', mapped, response.status);
      }
      const result = validate(parsed, response);
      return result === null ? failure('invalid-response') : { ok: true, value: result };
    } catch {
      return signal?.aborted ? failure('aborted') : failure('network');
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  }
  return {
    get: (id, { signal } = {}) => {
      if (!Number.isSafeInteger(id) || id < 1) return Promise.resolve(failure('http', 'media_invalid_id', 400));
      if (!base) return Promise.resolve(failure('network'));
      return request(new URL(`media/${String(id)}`, base), { method: 'GET' }, signal, (value) => {
        const item = parseItem(value);
        return item === 'unsafe-url' ? null : item;
      });
    },
    list: ({ search, page = 1, perPage = 24, signal } = {}) => {
      if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(perPage) || perPage < 1 || perPage > 100)
        return Promise.resolve(failure('http', 'media_invalid_pagination', 400));
      if (!base) return Promise.resolve(failure('network'));
      const url = new URL('media', base);
      url.searchParams.set('media_type', 'image');
      url.searchParams.set('per_page', String(perPage));
      url.searchParams.set('page', String(page));
      url.searchParams.set('_fields', FIELDS);
      if (search?.trim()) url.searchParams.set('search', search.trim().slice(0, 200));
      return request(url, { method: 'GET' }, signal, (value, response) => {
        if (!Array.isArray(value)) return null;
        const parsedItems = value.map(parseItem);
        if (parsedItems.some((item) => item === null)) return null;
        const items = parsedItems.filter((item): item is MediaItem => item !== null && item !== 'unsafe-url');
        const total = response.headers.get('X-WP-Total');
        const pages = response.headers.get('X-WP-TotalPages');
        if (!total || !pages || !/^\d+$/.test(total) || !/^\d+$/.test(pages)) return null;
        const totalCount = Number(total);
        const totalPages = Number(pages);
        return integer(totalCount) && integer(totalPages) ? { items, total: totalCount, totalPages } : null;
      });
    },
    upload: (file, { signal } = {}) => {
      if (!IMAGE_TYPES.has(file.type)) return Promise.resolve(failure('http', 'media_unsupported_type', 415));
      if (file.size <= 0) return Promise.resolve(failure('http', 'media_empty_file', 400));
      if (file.size > maxUploadBytes) return Promise.resolve(failure('too-large', 'media_file_too_large', 413));
      if (!base) return Promise.resolve(failure('network'));
      // WordPress core only parses `filename="..."` (not the RFC 5987 `filename*=` form) and sanitises the name itself:
      // send plain ASCII so the header can never need escaping or smuggle a quote or a parameter.
      const name =
        file.name
          .normalize('NFKD')
          .replace(/[^A-Za-z0-9._ -]/g, '_')
          .slice(0, 180) || 'upload';
      return request(
        new URL('media', base),
        {
          method: 'POST',
          headers: {
            'Content-Type': file.type,
            'Content-Disposition': `attachment; filename="${name}"`,
          },
          body: file,
        },
        signal,
        (value) => {
          const item = parseItem(value);
          return item === 'unsafe-url' ? null : item;
        },
      );
    },
  };
}
