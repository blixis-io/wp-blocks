import type {
  ApiResult,
  PreviewRequestBody,
  PublishOptions,
  PublicationResult,
  PreviewResult,
  PublicationState,
  RestClient,
  RollbackOptions,
  RevisionEntry,
  StreamRead,
  StreamWritten,
  PageSettings,
  PageSeo,
  PageSettingsWrite,
} from './types';

const LOCALE = /^[a-z]{2,3}(?:_[A-Za-z0-9]{2,8})*$/;
const ERROR_CODE = /^[a-z0-9_]{1,64}$/;
const DEFAULT_MAX_BYTES = 6 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;
const PREVIEW_REQUEST_BYTES = 2 * 1024 * 1024;
// WordPress JSON may escape every UTF-16 code unit as `\uXXXX`: 6 bytes per unit for
// the 1 MiB HTML + 256 KiB CSS decoded limits, plus 4 KiB for the JSON envelope.
const PREVIEW_RESPONSE_BYTES = 6 * (1_048_576 + 262_144) + 4_096;
interface Options {
  restRoot: string;
  nonce: string;
  postId: number;
  fetchImpl?: typeof fetch;
  maxResponseBytes?: number;
  timeoutMs?: number;
}
type Outcome<T> = ApiResult<T>;

function isObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}
function safeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function keysAre(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return Object.keys(value).length === expected.length && expected.every((key) => Object.hasOwn(value, key));
}
/**
 * Rejects prototype-polluting keys and bounds the walk. Every JSON value occupies at least 2 bytes of text (`1,` in an
 * array; an object member needs 6 or more) and the text was already capped at `maxResponseBytes`, so a response can hold at
 * most `maxResponseBytes / 2 + 1` values. With the 6 MiB default that is 3,145,729 values, far above what a maximal
 * document (2 MiB, 5,000 elements) needs, so the cap never refuses something core accepts; it only makes the bound explicit.
 */
function safeTree(value: unknown, maxValues: number): boolean {
  const pending: unknown[] = [value];
  let visited = 0;
  while (pending.length) {
    const item = pending.pop();
    if (++visited > maxValues) return false;
    if (Array.isArray(item)) {
      for (const child of item) pending.push(child);
      continue;
    }
    if (!isObject(item)) continue;
    for (const key of Object.keys(item)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') return false;
      pending.push(item[key]);
    }
  }
  return true;
}
function cleanData(value: unknown, nonce: string, includeFieldMessages = false): Record<string, unknown> | undefined {
  if (!isObject(value)) return undefined;
  let count = 0;
  const invalidData = new Error('Invalid REST error data');
  const copy = (item: unknown, depth: number): unknown => {
    if (++count > 2048 || depth > 5) {
      throw invalidData;
    }
    if (item === null || typeof item === 'boolean' || (typeof item === 'number' && Number.isFinite(item))) return item;
    if (typeof item === 'string') return nonce && item.includes(nonce) ? null : item;
    if (Array.isArray(item)) {
      if (item.length > 256) {
        throw invalidData;
      }
      return item.map((entry: unknown) => copy(entry, depth + 1));
    }
    if (!isObject(item) || Object.keys(item).length > 256) {
      throw invalidData;
    }
    const cloned: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const [key, nested] of Object.entries(item)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        throw invalidData;
      }
      if (key !== 'message' || includeFieldMessages) cloned[key] = copy(nested, depth + 1);
    }
    return cloned;
  };
  try {
    return copy(value, 0) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}
function invalid<T>(): Outcome<T> {
  return { ok: false, error: { kind: 'invalid-response' } };
}
function validLocale(locale: unknown): locale is string {
  return typeof locale === 'string' && locale.length <= 20 && LOCALE.test(locale);
}
function validPreviewMode(mode: unknown): mode is 'light' | 'dark' {
  return mode === 'light' || mode === 'dark';
}
function isRevisionEntry(value: unknown): value is RevisionEntry {
  if (!isObject(value) || !keysAre(value, ['revision', 'savedAt', 'author'])) return false;
  return (
    safeInteger(value['revision']) &&
    typeof value['savedAt'] === 'string' &&
    Number.isSafeInteger(value['author']) &&
    (value['author'] as number) >= 0
  );
}
function streamRead(value: unknown): StreamRead | null {
  if (!isObject(value) || !keysAre(value, ['revision', 'locale', 'document']) || !safeInteger(value['revision']))
    return null;
  if (value['locale'] !== null && !validLocale(value['locale'])) return null;
  if (value['document'] !== null && !isObject(value['document'])) return null;
  return value as unknown as StreamRead;
}
function publication(value: unknown): PublicationState | null {
  if (
    !isObject(value) ||
    !keysAre(value, ['pointerRevision', 'layout', 'locales']) ||
    !safeInteger(value['pointerRevision']) ||
    !isObject(value['layout']) ||
    !isObject(value['locales'])
  )
    return null;
  const stream = (item: unknown): boolean =>
    isObject(item) &&
    keysAre(item, ['state', 'snapshot', 'workingRevision']) &&
    ['unpublished', 'published', 'published-with-pending-changes'].includes(String(item['state'])) &&
    safeInteger(item['snapshot']) &&
    safeInteger(item['workingRevision']);
  if (!stream(value['layout'])) return null;
  for (const [locale, item] of Object.entries(value['locales'])) if (!validLocale(locale) || !stream(item)) return null;
  return value as unknown as PublicationState;
}
function pageSeo(value: unknown): PageSeo | null {
  if (
    !isObject(value) ||
    !keysAre(value, [
      'metaTitle',
      'metaDescription',
      'ogTitle',
      'ogDescription',
      'ogImageId',
      'noindex',
      'nofollow',
      'canonical',
    ])
  )
    return null;
  return typeof value['metaTitle'] === 'string' &&
    value['metaTitle'].length <= 120 &&
    typeof value['metaDescription'] === 'string' &&
    value['metaDescription'].length <= 320 &&
    typeof value['ogTitle'] === 'string' &&
    value['ogTitle'].length <= 120 &&
    typeof value['ogDescription'] === 'string' &&
    value['ogDescription'].length <= 320 &&
    (value['ogImageId'] === null || safeInteger(value['ogImageId'])) &&
    typeof value['noindex'] === 'boolean' &&
    typeof value['nofollow'] === 'boolean' &&
    typeof value['canonical'] === 'string'
    ? (value as unknown as PageSeo)
    : null;
}
function pageSettings(value: unknown): PageSettings | null {
  if (
    !isObject(value) ||
    !keysAre(value, ['title', 'slug', 'status', 'excerpt', 'featuredImage', 'seo', 'locales', 'version'])
  )
    return null;
  const image = value['featuredImage'];
  if (
    image !== null &&
    (!isObject(image) ||
      !keysAre(image, ['id', 'url', 'alt', 'width', 'height']) ||
      !safeInteger(image['id']) ||
      typeof image['url'] !== 'string' ||
      typeof image['alt'] !== 'string' ||
      !safeInteger(image['width']) ||
      !safeInteger(image['height']))
  )
    return null;
  if (
    typeof value['title'] !== 'string' ||
    value['title'].length > 200 ||
    typeof value['slug'] !== 'string' ||
    value['slug'].length > 200 ||
    typeof value['status'] !== 'string' ||
    typeof value['excerpt'] !== 'string' ||
    value['excerpt'].length > 1000 ||
    typeof value['version'] !== 'string' ||
    !/^[a-f0-9]{40}$/.test(value['version']) ||
    !Array.isArray(value['locales']) ||
    !value['locales'].every(validLocale) ||
    !isObject(value['seo'])
  )
    return null;
  for (const [locale, seo] of Object.entries(value['seo'])) if (!validLocale(locale) || !pageSeo(seo)) return null;
  return value as unknown as PageSettings;
}

/** Creates an isolated, non-throwing REST client for one WordPress editor session. */
export function createRestClient({
  restRoot,
  nonce,
  postId,
  fetchImpl = globalThis.fetch,
  maxResponseBytes = DEFAULT_MAX_BYTES,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: Options): RestClient {
  let base: URL | null = null;
  try {
    const candidate = new URL(restRoot);
    if (
      (candidate.protocol === 'https:' || candidate.protocol === 'http:') &&
      !candidate.username &&
      !candidate.password &&
      candidate.origin === globalThis.location.origin
    )
      base = candidate;
  } catch {
    /* bad roots fail closed on the first call */
  }
  if (base && !base.pathname.endsWith('/')) base.pathname += '/';
  const rootPath = base?.pathname ?? '';
  const urlFor = (path: string): URL | null => {
    try {
      if (!base) return null;
      const url = new URL(path.split('/').map(encodeURIComponent).join('/'), base);
      return url.origin === base.origin && url.pathname.startsWith(rootPath) ? url : null;
    } catch {
      return null;
    }
  };
  async function request<T>(
    path: string,
    method: 'GET' | 'PUT' | 'POST',
    body: unknown,
    expectedRevision: number | string | undefined,
    external?: AbortSignal,
    validate?: (parsed: unknown) => T | null,
    responseCap = maxResponseBytes,
    requestCap?: number,
  ): Promise<Outcome<T>> {
    if (!Number.isSafeInteger(postId) || postId <= 0) return { ok: false, error: { kind: 'network' } };
    const url = urlFor(path);
    if (!url) return { ok: false, error: { kind: 'network' } };
    if (
      expectedRevision !== undefined &&
      !(
        safeInteger(expectedRevision) ||
        (typeof expectedRevision === 'string' && /^[a-f0-9]{40}$/.test(expectedRevision))
      )
    )
      return { ok: false, error: { kind: 'http', status: 400, code: 'blixis_invalid_revision' } };
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);
    const abort = () => {
      controller.abort();
    };
    external?.addEventListener('abort', abort, { once: true });
    if (external?.aborted) controller.abort();
    try {
      const headers = new Headers({ Accept: 'application/json', 'X-WP-Nonce': nonce });
      let serialized: string | undefined;
      if (method !== 'GET') {
        headers.set('Content-Type', 'application/json');
        try {
          serialized = JSON.stringify(body);
          if (typeof serialized !== 'string') return invalid<T>();
          if (requestCap !== undefined && new TextEncoder().encode(serialized).byteLength > requestCap)
            return { ok: false, error: { kind: 'too-large' } };
        } catch {
          return invalid<T>();
        }
      }
      if (expectedRevision !== undefined) {
        headers.set('If-Match', `"${String(expectedRevision)}"`);
      }
      const response = await fetchImpl(url, {
        method,
        credentials: 'same-origin',
        redirect: 'error',
        headers,
        ...(method !== 'GET' && serialized !== undefined ? { body: serialized } : {}),
        signal: controller.signal,
      });
      if (response.redirected) return { ok: false, error: { kind: 'network' } };
      const text = await readText(response, responseCap, controller);
      if (external?.aborted) return { ok: false, error: { kind: 'aborted' } };
      if (controller.signal.aborted) return { ok: false, error: { kind: 'network' } };
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return invalid<T>();
      }
      if (!safeTree(parsed, Math.floor(maxResponseBytes / 2) + 1)) return invalid<T>();
      if (!response.ok) {
        if (
          !isObject(parsed) ||
          !keysAre(parsed, ['code', 'message', 'data']) ||
          typeof parsed['code'] !== 'string' ||
          !ERROR_CODE.test(parsed['code']) ||
          (nonce.length > 0 && parsed['code'].includes(nonce)) ||
          typeof parsed['message'] !== 'string'
        )
          return invalid<T>();
        const data = cleanData(parsed['data'], nonce, parsed['code'] === 'blixis_invalid_page_settings');
        if (!data) return invalid<T>();
        const retryHeader = response.headers.get('Retry-After');
        const retryAfter = retryHeader !== null && /^\d{1,6}$/.test(retryHeader) ? Number(retryHeader) : undefined;
        return {
          ok: false,
          error: {
            kind: 'http',
            status: response.status,
            code: parsed['code'],
            data,
            ...(nonce.length === 0 || !parsed['message'].includes(nonce)
              ? { message: parsed['message'].slice(0, 1000) }
              : {}),
            ...(retryAfter !== undefined ? { retryAfter } : {}),
          },
        };
      }
      const value = validate?.(parsed);
      return value === null || value === undefined ? invalid<T>() : { ok: true, value };
    } catch (error) {
      if (error instanceof RangeError && error.message === 'too-large')
        return { ok: false, error: { kind: 'too-large' } };
      if (external?.aborted) return { ok: false, error: { kind: 'aborted' } };
      return { ok: false, error: { kind: 'network' } };
    } finally {
      clearTimeout(timer);
      external?.removeEventListener('abort', abort);
    }
  }
  const segment = (value: string) => value;
  const docPath = (locale: string | null, suffix = '') =>
    `documents/${String(postId)}/${locale === null ? 'layout' : `content/${segment(locale)}`}${suffix}`;
  const readStream = (locale: string | null, options?: { signal?: AbortSignal }) => {
    if (locale !== null && !validLocale(locale))
      return Promise.resolve({
        ok: false,
        error: { kind: 'http', status: 400, code: 'blixis_invalid_locale' },
      } as const);
    return request<StreamRead>(docPath(locale), 'GET', undefined, undefined, options?.signal, (value) => {
      const stream = streamRead(value);
      return stream?.locale === locale ? stream : null;
    });
  };
  const writeStream = (
    locale: string | null,
    document: unknown,
    revision: number,
    options?: { signal?: AbortSignal },
  ) => {
    if (locale !== null && !validLocale(locale))
      return Promise.resolve({
        ok: false,
        error: { kind: 'http', status: 400, code: 'blixis_invalid_locale' },
      } as const);
    return request<StreamWritten>(docPath(locale), 'PUT', document, revision, options?.signal, (value) =>
      isObject(value) && keysAre(value, ['revision']) && safeInteger(value['revision'])
        ? { revision: value['revision'] }
        : null,
    );
  };
  const publicationResult = (value: unknown): PublicationResult | null => {
    if (!isObject(value) || !keysAre(value, ['pointerRevision', 'layoutSnapshot', 'contentSnapshot', 'pinnedLocales']))
      return null;
    if (
      !safeInteger(value['pointerRevision']) ||
      (value['layoutSnapshot'] !== null && !safeInteger(value['layoutSnapshot'])) ||
      (value['contentSnapshot'] !== null && !safeInteger(value['contentSnapshot'])) ||
      !Array.isArray(value['pinnedLocales']) ||
      !value['pinnedLocales'].every(validLocale)
    )
      return null;
    return value as unknown as PublicationResult;
  };
  return {
    readPage: (options) =>
      request<PageSettings>(
        `documents/${String(postId)}/page`,
        'GET',
        undefined,
        undefined,
        options?.signal,
        pageSettings,
      ),
    writePage: (body: PageSettingsWrite, version, options) =>
      request<{ version: string }>(
        `documents/${String(postId)}/page`,
        'PUT',
        body,
        version,
        options?.signal,
        (value) =>
          isObject(value) &&
          keysAre(value, ['version']) &&
          typeof value['version'] === 'string' &&
          /^[a-f0-9]{40}$/.test(value['version'])
            ? { version: value['version'] }
            : null,
      ),
    readLayout: (options) => readStream(null, options),
    readContent: (locale, options) => readStream(locale, options),
    writeLayout: (document, revision, options) => writeStream(null, document, revision, options),
    writeContent: (locale, document, revision, options) => writeStream(locale, document, revision, options),
    listRevisions: ({ locale }, options) => {
      if (locale !== null && !validLocale(locale))
        return Promise.resolve({ ok: false, error: { kind: 'http', status: 400, code: 'blixis_invalid_locale' } });
      return request(
        `documents/${String(postId)}/${locale === null ? 'layout' : `content/${locale}`}/revisions`,
        'GET',
        undefined,
        undefined,
        options?.signal,
        (value) => {
          if (
            !isObject(value) ||
            !keysAre(value, ['current', 'locale', 'revisions']) ||
            !safeInteger(value['current']) ||
            value['locale'] !== locale ||
            (value['locale'] !== null && !validLocale(value['locale'])) ||
            !Array.isArray(value['revisions']) ||
            !value['revisions'].every(isRevisionEntry)
          )
            return null;
          return value as { current: number; revisions: RevisionEntry[] };
        },
      );
    },
    readPublication: (options) =>
      request<PublicationState>(
        `documents/${String(postId)}/published`,
        'GET',
        undefined,
        undefined,
        options?.signal,
        (value) => publication(value),
      ),
    publish: (options: PublishOptions, requestOptions) => {
      if (!safeInteger(options.pointerRevision) || (options.locale !== undefined && !validLocale(options.locale)))
        return Promise.resolve({ ok: false, error: { kind: 'http', status: 400, code: 'blixis_invalid_document' } });
      const { pointerRevision, ...body } = options;
      return request<PublicationResult>(
        `documents/${String(postId)}/publish`,
        'POST',
        body,
        pointerRevision,
        requestOptions?.signal,
        publicationResult,
      );
    },
    rollback: (options: RollbackOptions, requestOptions) => {
      if (!safeInteger(options.pointerRevision) || ('locale' in options && !validLocale(options.locale)))
        return Promise.resolve({ ok: false, error: { kind: 'http', status: 400, code: 'blixis_invalid_document' } });
      const { pointerRevision, ...body } = options;
      return request<PublicationResult>(
        `documents/${String(postId)}/rollback`,
        'POST',
        body,
        pointerRevision,
        requestOptions?.signal,
        publicationResult,
      );
    },
    preview: (body: PreviewRequestBody, options) => {
      if (body.locale !== undefined && !validLocale(body.locale))
        return Promise.resolve({ ok: false, error: { kind: 'http', status: 400, code: 'blixis_invalid_locale' } });
      if (body.mode !== undefined && !validPreviewMode(body.mode))
        return Promise.resolve({ ok: false, error: { kind: 'http', status: 400, code: 'blixis_invalid_mode' } });
      return request<PreviewResult>(
        `documents/${String(postId)}/preview`,
        'POST',
        body,
        undefined,
        options?.signal,
        (value) => {
          if (
            !isObject(value) ||
            !keysAre(value, ['html', 'css', 'locale', 'mode', 'layoutRevision', 'contentRevision', 'source'])
          )
            return null;
          if (
            typeof value['html'] !== 'string' ||
            value['html'].length > 1_048_576 ||
            typeof value['css'] !== 'string' ||
            value['css'].length > 262_144
          )
            return null;
          if (!validLocale(value['locale']) || (value['mode'] !== 'light' && value['mode'] !== 'dark')) return null;
          if (
            (value['layoutRevision'] !== null && !safeInteger(value['layoutRevision'])) ||
            (value['contentRevision'] !== null && !safeInteger(value['contentRevision']))
          )
            return null;
          if (value['source'] !== 'request' && value['source'] !== 'working') return null;
          return value as unknown as PreviewResult;
        },
        PREVIEW_RESPONSE_BYTES,
        PREVIEW_REQUEST_BYTES,
      );
    },
  };
}

async function readText(response: Response, maxBytes: number, controller: AbortController): Promise<string> {
  if (!response.body) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) throw new RangeError('too-large');
    return text;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => {
      void reader.cancel();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    controller.signal.addEventListener('abort', onAbort, { once: true });
  });
  while (size <= maxBytes) {
    const result = await Promise.race([reader.read(), aborted]);
    if (result.done) break;
    const value = result.value;
    size += value.byteLength;
    if (size > maxBytes) {
      controller.abort();
      await reader.cancel();
      throw new RangeError('too-large');
    }
    chunks.push(value);
  }
  if (onAbort) controller.signal.removeEventListener('abort', onAbort);
  const joined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(joined);
}
