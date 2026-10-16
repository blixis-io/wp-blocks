import { describe, expect, it, vi } from 'vitest';
import { createRestClient } from './client';
import { describeApiError } from './index';

const root = `${location.origin}/wp-json/blixis/v1/`;
const headersFor = (init: RequestInit) => new Headers(init.headers);
function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
function client(
  fetchImpl: typeof fetch = vi.fn(() => Promise.resolve(response({ revision: 1, locale: null, document: null }))),
) {
  return createRestClient({ restRoot: root, nonce: 'nonce-secret', postId: 42, fetchImpl });
}

describe('REST client requests', () => {
  it('publishes and rolls back with the pointer revision in If-Match', async () => {
    const calls: RequestInit[] = [];
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init) calls.push(init);
      return Promise.resolve(
        response({ pointerRevision: 3, layoutSnapshot: 2, contentSnapshot: 4, pinnedLocales: [] }),
      );
    });
    const api = client(fetchMock);
    expect(await api.publish({ pointerRevision: 2, layout: true, locale: 'nl_NL' })).toMatchObject({
      ok: true,
      value: { pointerRevision: 3 },
    });
    expect(await api.rollback({ pointerRevision: 3, locale: 'nl_NL', contentSnapshot: 1 })).toMatchObject({ ok: true });
    expect(calls.map((call) => [call.method, headersFor(call).get('If-Match'), call.body])).toEqual([
      ['POST', '"2"', JSON.stringify({ layout: true, locale: 'nl_NL' })],
      ['POST', '"3"', JSON.stringify({ locale: 'nl_NL', contentSnapshot: 1 })],
    ]);
  });

  it('preserves publication conflict details, retry-after and rejects malformed success bodies', async () => {
    const conflict = await client(
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              code: 'blixis_conflict',
              message: 'Changed elsewhere',
              data: { status: 409, currentRevision: 8, expectedRevision: 2 },
            }),
            { status: 409 },
          ),
        ),
      ),
    ).publish({ pointerRevision: 2, layout: true });
    expect(conflict).toMatchObject({
      ok: false,
      error: { status: 409, message: 'Changed elsewhere', data: { currentRevision: 8 } },
    });
    const limited = await client(
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ code: 'blixis_rate_limited', message: 'Wait', data: { status: 429, retryAfter: 7 } }),
            { status: 429, headers: { 'Retry-After': '7' } },
          ),
        ),
      ),
    ).publish({ pointerRevision: 2, layout: true });
    expect(limited).toMatchObject({ ok: false, error: { status: 429, retryAfter: 7 } });
    expect(
      await client(vi.fn(() => Promise.resolve(response({ pointerRevision: 3 })))).publish({
        pointerRevision: 2,
        layout: true,
      }),
    ).toEqual({ ok: false, error: { kind: 'invalid-response' } });
  });
  it.each([
    ['readLayout', ['documents/42/layout', 'GET']],
    ['readContent', ['documents/42/content/nl_NL', 'GET']],
    ['listRevisions', ['documents/42/layout/revisions', 'GET']],
    ['readPublication', ['documents/42/published', 'GET']],
    ['writeLayout', ['documents/42/layout', 'PUT']],
    ['writeContent', ['documents/42/content/nl_NL', 'PUT']],
  ] as const)('%s sends its documented route and security headers', async (method, [path, verb]) => {
    const calls: [RequestInfo | URL, RequestInit | undefined][] = [];
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      calls.push([input, init]);
      if (path.endsWith('/revisions')) return Promise.resolve(response({ current: 1, locale: null, revisions: [] }));
      if (path.endsWith('/published'))
        return Promise.resolve(
          response({
            pointerRevision: 0,
            layout: { state: 'unpublished', snapshot: 0, workingRevision: 0 },
            locales: {},
          }),
        );
      if (verb === 'PUT') return Promise.resolve(response({ revision: 2 }));
      return Promise.resolve(
        response({ revision: 1, locale: path.includes('/content/') ? 'nl_NL' : null, document: null }),
      );
    });
    const api = client(fetchMock);
    if (method === 'readLayout') await api.readLayout();
    if (method === 'readContent') await api.readContent('nl_NL');
    if (method === 'listRevisions') await api.listRevisions({ locale: null });
    if (method === 'readPublication') await api.readPublication();
    if (method === 'writeLayout') await api.writeLayout({ root: {} }, 1);
    if (method === 'writeContent') await api.writeContent('nl_NL', { entries: {} }, 1);
    const call = calls[0];
    if (!call) throw new Error('Expected one request');
    const [requestInput, initValue] = call;
    const url =
      requestInput instanceof URL
        ? requestInput
        : new URL(typeof requestInput === 'string' ? requestInput : requestInput.url);
    if (!initValue) throw new Error('Expected request options');
    const init = initValue;
    expect(url.href).toBe(new URL(path, root).href);
    expect(init.method).toBe(verb);
    expect(init.credentials).toBe('same-origin');
    expect(headersFor(init).get('Accept')).toBe('application/json');
    expect(headersFor(init).get('X-WP-Nonce')).toBe('nonce-secret');
    if (verb === 'PUT') {
      expect(headersFor(init).get('Content-Type')).toBe('application/json');
      expect(headersFor(init).get('If-Match')).toBe('"1"');
    }
  });

  it.each([401, 403, 409, 423, 428, 429, 500, 503])('maps HTTP %i without returning its message', async (status) => {
    const api = client(
      vi.fn(() =>
        Promise.resolve(
          response(
            {
              code: status === 403 ? 'rest_cookie_invalid_nonce' : 'blixis_conflict',
              message: 'nonce-secret private text',
              data: {
                currentRevision: 5,
                expectedRevision: 2,
                details: { revision: { code: 'blixis_invalid_revision' } },
              },
            },
            status,
          ),
        ),
      ),
    );
    const result = await api.readLayout();
    expect(result).toMatchObject({ ok: false, error: { kind: 'http', status } });
    expect(JSON.stringify(result)).not.toContain('nonce-secret');
    expect(JSON.stringify(result)).not.toContain('private text');
  });

  it('rejects malformed, oversized, polluted and extra-key payloads', async () => {
    const malformed = await client(vi.fn(() => Promise.resolve(new Response('{bad')))).readLayout();
    expect(malformed).toEqual({ ok: false, error: { kind: 'invalid-response' } });
    const extra = await client(
      vi.fn(() => Promise.resolve(response({ revision: 1, locale: null, document: null, secret: 1 }))),
    ).readLayout();
    expect(extra).toEqual({ ok: false, error: { kind: 'invalid-response' } });
    expect(
      await client(
        vi.fn(() => Promise.resolve(response({ revision: 1, locale: 'en_US', document: null }))),
      ).readContent('nl_NL'),
    ).toEqual({ ok: false, error: { kind: 'invalid-response' } });
    const polluted = JSON.parse('{"revision":1,"locale":null,"document":{"a":{"constructor":{"x":1}}}}') as unknown;
    expect(await client(vi.fn(() => Promise.resolve(response(polluted)))).readLayout()).toEqual({
      ok: false,
      error: { kind: 'invalid-response' },
    });
    expect(
      await createRestClient({
        restRoot: root,
        nonce: 'x',
        postId: 1,
        maxResponseBytes: 4,
        fetchImpl: vi.fn(() => Promise.resolve(response({ revision: 1 }))),
      }).readLayout(),
    ).toEqual({ ok: false, error: { kind: 'too-large' } });
  });

  it('keeps bounded WordPress argument error codes while dropping server messages', async () => {
    const api = client(
      vi.fn(() =>
        Promise.resolve(
          response(
            {
              code: 'rest_invalid_param',
              message: 'server-only text',
              data: { status: 400, details: { locale: { code: 'blixis_invalid_locale', message: 'also private' } } },
            },
            400,
          ),
        ),
      ),
    );
    const result = await api.readLayout();
    expect(result).toMatchObject({
      ok: false,
      error: {
        kind: 'http',
        status: 400,
        code: 'rest_invalid_param',
        data: { status: 400, details: { locale: { code: 'blixis_invalid_locale' } } },
      },
    });
    expect(JSON.stringify(result)).not.toContain('private');
  });

  it('validates revision and locale arguments before sending', async () => {
    const fetchMock = vi.fn();
    const api = client(fetchMock as typeof fetch);
    for (const revision of [-1, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
      expect(await api.writeLayout({}, revision)).toMatchObject({
        ok: false,
        error: { kind: 'http', status: 400, code: 'blixis_invalid_revision' },
      });
    }
    for (const locale of ['en-US', '../x', 'EN_us', 'en_US_123456789'])
      expect(await api.readContent(locale)).toMatchObject({
        ok: false,
        error: { kind: 'http', status: 400, code: 'blixis_invalid_locale' },
      });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails closed on a hostile REST root and keeps concurrent client state isolated', async () => {
    const calls: [RequestInfo | URL, RequestInit | undefined][] = [];
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      calls.push([input, init]);
      return Promise.resolve(
        response({
          revision: 1,
          locale: null,
          document: { requested: input instanceof URL ? input.href : typeof input === 'string' ? input : input.url },
        }),
      );
    });
    const hostile = createRestClient({
      restRoot: 'https://evil.example/wp-json/blixis/v1/',
      nonce: 'x',
      postId: 1,
      fetchImpl: fetchMock,
    });
    expect(await hostile.readLayout()).toEqual({ ok: false, error: { kind: 'network' } });
    const left = createRestClient({ restRoot: root, nonce: 'left', postId: 10, fetchImpl: fetchMock });
    const right = createRestClient({ restRoot: root, nonce: 'right', postId: 11, fetchImpl: fetchMock });
    await Promise.all([left.readLayout(), right.readLayout()]);
    expect(
      calls.map((call) => [
        call[0] instanceof URL ? call[0].href : typeof call[0] === 'string' ? call[0] : call[0].url,
        new Headers(call[1]?.headers).get('X-WP-Nonce'),
      ]),
    ).toEqual([
      [`${location.origin}/wp-json/blixis/v1/documents/10/layout`, 'left'],
      [`${location.origin}/wp-json/blixis/v1/documents/11/layout`, 'right'],
    ]);
  });

  it('distinguishes external aborts, timeouts and network failures', async () => {
    const abortController = new AbortController();
    const aborted = client(
      vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) =>
            init?.signal?.addEventListener('abort', () => {
              reject(new DOMException('Aborted', 'AbortError'));
            }),
          ),
      ),
    );
    const pendingAbort = aborted.readLayout({ signal: abortController.signal });
    abortController.abort();
    expect(await pendingAbort).toEqual({ ok: false, error: { kind: 'aborted' } });
    vi.useFakeTimers();
    const never = client(
      vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) =>
            init?.signal?.addEventListener('abort', () => {
              reject(new DOMException('Aborted', 'AbortError'));
            }),
          ),
      ),
    );
    const pendingTimeout = never.readLayout();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await pendingTimeout).toEqual({ ok: false, error: { kind: 'network' } });
    const slow = createRestClient({
      restRoot: root,
      nonce: 'x',
      postId: 1,
      timeoutMs: 10,
      fetchImpl: vi.fn(() => Promise.resolve(new Response(new ReadableStream<Uint8Array>(), { status: 200 }))),
    });
    const pendingBody = slow.readLayout();
    await vi.advanceTimersByTimeAsync(10);
    expect(await pendingBody).toEqual({ ok: false, error: { kind: 'network' } });
    vi.useRealTimers();
    expect(
      await client(
        vi.fn(() => {
          return Promise.reject(new Error('transport'));
        }),
      ).readLayout(),
    ).toEqual({ ok: false, error: { kind: 'network' } });
  });
});

describe('REST client redirects and size envelope', () => {
  it('asks fetch to fail on redirects for every route', async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(response({ revision: 1, locale: null, document: null })),
    );
    await client(fetchMock).readLayout();
    await client(fetchMock).writeLayout({ root: [] }, 1);
    expect(fetchMock.mock.calls).toHaveLength(2);
    for (const [, init] of fetchMock.mock.calls) expect(init?.redirect).toBe('error');
  });

  it('treats a fetch that rejects because of a redirect as a network error', async () => {
    const api = client(vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    expect(await api.readLayout()).toEqual({ ok: false, error: { kind: 'network' } });
  });

  it('rejects a response that reports having been redirected', async () => {
    const redirected = response({ revision: 1, locale: null, document: null });
    Object.defineProperty(redirected, 'redirected', { value: true });
    const api = client(vi.fn(() => Promise.resolve(redirected)));
    expect(await api.readLayout()).toEqual({ ok: false, error: { kind: 'network' } });
  });

  it('loads a maximal document (5,000 elements, close to 2 MiB) that core accepts', async () => {
    const element = (n: number) => ({
      id: `el-${String(n).padStart(5, '0')}`,
      type: 'text',
      props: Object.fromEntries(
        Array.from({ length: 3 }, (_, k) => [`prop${String(k)}`, `value ${String(n)} ${'x'.repeat(8)}`]),
      ),
      styles: Array.from({ length: 2 }, (_, r) => ({
        breakpoint: 'base',
        state: 'default',
        declarations: Object.fromEntries(
          Array.from({ length: 4 }, (_, d) => [`prop-${String(d)}-${String(r)}`, `${String(d)}px`]),
        ),
      })),
      children: [],
    });
    const document = { schemaVersion: 1, root: Array.from({ length: 5000 }, (_, n) => element(n)) };
    const text = JSON.stringify({ revision: 3, locale: null, document });
    const bytes = new TextEncoder().encode(text).byteLength;
    expect(bytes).toBeLessThanOrEqual(2 * 1024 * 1024);
    expect(bytes).toBeGreaterThan(1.5 * 1024 * 1024);
    const api = client(vi.fn(() => Promise.resolve(new Response(text, { status: 200 }))));
    const result = await api.readLayout();
    expect(result.ok).toBe(true);
  });
});

describe('preview client contract', () => {
  const preview = {
    html: '<p>safe</p>',
    css: '.x{}',
    locale: 'en_US',
    mode: 'light',
    layoutRevision: 2,
    contentRevision: null,
    source: 'working',
  };
  it('sends the bounded preview POST without If-Match', async () => {
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(response(preview)));
    expect(await client(fetchMock as typeof fetch).preview({ locale: 'en_US', mode: 'light' })).toEqual({
      ok: true,
      value: preview,
    });
    const [input, init] = fetchMock.mock.calls[0] ?? [];
    const requestUrl = input instanceof URL ? input.href : typeof input === 'string' ? input : (input?.url ?? '');
    expect(requestUrl).toBe(`${location.origin}/wp-json/blixis/v1/documents/42/preview`);
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json');
    expect(new Headers(init?.headers).get('X-WP-Nonce')).toBe('nonce-secret');
    expect(new Headers(init?.headers).has('If-Match')).toBe(false);
    expect(init?.body).toBe(JSON.stringify({ locale: 'en_US', mode: 'light' }));
  });

  it('rejects invalid inputs and oversized request bodies without sending', async () => {
    const fetchMock = vi.fn();
    const api = client(fetchMock as typeof fetch);
    expect(await api.preview({ locale: '../x' })).toMatchObject({
      ok: false,
      error: { code: 'blixis_invalid_locale' },
    });
    expect(await api.preview({ mode: 'auto' as 'light' })).toMatchObject({
      ok: false,
      error: { code: 'blixis_invalid_mode' },
    });
    expect(await api.preview({ document: { text: 'x'.repeat(2 * 1024 * 1024) } })).toEqual({
      ok: false,
      error: { kind: 'too-large' },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects hostile or oversized responses and maps server errors', async () => {
    const invalidValues = [
      { ...preview, extra: 1 },
      { ...preview, locale: '../x' },
      { ...preview, source: 'published' },
      { ...preview, mode: 'auto' },
      { ...preview, layoutRevision: -1 },
      { ...preview, html: 'x'.repeat(1_048_577) },
      { ...preview, css: 'x'.repeat(262_145) },
      JSON.parse(
        '{"html":"","css":"","locale":"en_US","mode":"light","layoutRevision":null,"contentRevision":null,"source":"request","__proto__":{}}',
      ),
    ];
    for (const value of invalidValues)
      expect(await client(vi.fn(() => Promise.resolve(response(value)))).preview({})).toEqual({
        ok: false,
        error: { kind: 'invalid-response' },
      });
    for (const status of [413, 422, 403, 423]) {
      const code =
        status === 413
          ? 'blixis_too_large'
          : status === 422
            ? 'blixis_invalid_document'
            : status === 403
              ? 'rest_forbidden'
              : 'blixis_theme_incompatible';
      const api = client(
        vi.fn(() => Promise.resolve(response({ code, message: 'private', data: { status } }, status))),
      );
      expect(await api.preview({})).toMatchObject({ ok: false, error: { kind: 'http', status, code } });
    }
  });

  it('applies the streamed response cap and abort handling to previews', async () => {
    const hugeUtf8 = { ...preview, html: '😀'.repeat(600_000) };
    expect(await client(vi.fn(() => Promise.resolve(response(hugeUtf8)))).preview({})).toEqual({
      ok: false,
      error: { kind: 'invalid-response' },
    });
    const abort = new AbortController();
    const api = client(
      vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) =>
            init?.signal?.addEventListener('abort', () => {
              reject(new DOMException('Aborted', 'AbortError'));
            }),
          ),
      ),
    );
    const pending = api.preview({}, { signal: abort.signal });
    abort.abort();
    expect(await pending).toEqual({ ok: false, error: { kind: 'aborted' } });
    vi.useFakeTimers();
    const timed = createRestClient({
      restRoot: root,
      nonce: 'nonce-secret',
      postId: 42,
      timeoutMs: 10,
      fetchImpl: vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) =>
            init?.signal?.addEventListener('abort', () => {
              reject(new DOMException('Aborted', 'AbortError'));
            }),
          ),
      ),
    });
    const pendingTimeout = timed.preview({});
    await vi.advanceTimersByTimeAsync(10);
    expect(await pendingTimeout).toEqual({ ok: false, error: { kind: 'network' } });
    vi.useRealTimers();
  });

  it('accepts WordPress escaped non-ASCII JSON while keeping decoded output limits', async () => {
    const arabic = 'ع'.repeat(200_000);
    const encoded = JSON.stringify({ ...preview, html: arabic }).replaceAll('ع', '\\u0639');
    expect(new TextEncoder().encode(encoded).byteLength).toBeGreaterThan(1_200_000);
    const escapedResponse = () => new Response(encoded, { headers: { 'Content-Type': 'application/json' } });
    expect(await client(vi.fn(() => Promise.resolve(escapedResponse()))).preview({})).toMatchObject({
      ok: true,
      value: { html: arabic },
    });

    const overTransportCap = new Response('x'.repeat(6 * (1_048_576 + 262_144) + 4_097));
    expect(await client(vi.fn(() => Promise.resolve(overTransportCap))).preview({})).toEqual({
      ok: false,
      error: { kind: 'too-large' },
    });
    const decodedHtmlOverLimit = response({ ...preview, html: 'ع'.repeat(1_048_577) });
    expect(await client(vi.fn(() => Promise.resolve(decodedHtmlOverLimit))).preview({})).toEqual({
      ok: false,
      error: { kind: 'invalid-response' },
    });
  });
});

describe('describeApiError', () => {
  it.each([
    [{ kind: 'http', status: 401 }, 'unauthenticated'],
    [{ kind: 'http', status: 403 }, 'forbidden'],
    [{ kind: 'http', status: 403, code: 'rest_cookie_invalid_nonce' }, 'unauthenticated'],
    [{ kind: 'http', status: 409 }, 'conflict'],
    [{ kind: 'http', status: 423 }, 'locked'],
    [{ kind: 'http', status: 429 }, 'rate-limited'],
    [{ kind: 'http', status: 404 }, 'not-found'],
    [{ kind: 'http', status: 400 }, 'invalid'],
    [{ kind: 'http', status: 413 }, 'too-large'],
    [{ kind: 'http', status: 422 }, 'invalid'],
    [{ kind: 'http', status: 500 }, 'server'],
    [{ kind: 'network' }, 'offline'],
    [{ kind: 'aborted' }, 'aborted'],
    [{ kind: 'too-large' }, 'too-large'],
  ] as const)('maps %j', (error, description) => {
    expect(describeApiError(error)).toBe(description);
  });
  it('classifies an untrusted response as invalid', () => {
    expect(describeApiError({ kind: 'invalid-response' })).toBe('invalid');
  });
});
