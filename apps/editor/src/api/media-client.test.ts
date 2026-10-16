import { describe, expect, it, vi } from 'vitest';
import { createMediaClient } from './media-client';

const origin = location.origin;
function attachment(id = 9, source = `${origin}/uploads/full.jpg`) {
  return {
    id,
    source_url: source,
    alt_text: 'A photo',
    title: { rendered: '<img>Photo</img>' },
    media_details: { width: 80, height: 60, sizes: { thumbnail: { source_url: `${origin}/uploads/thumb.jpg` } } },
    mime_type: 'image/jpeg',
  };
}
function response(value: unknown, headers: Record<string, string> = {}, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}
function client(fetchImpl: typeof fetch) {
  return createMediaClient({
    wpRestRoot: `${origin}/wp-json/wp/v2/`,
    nonce: 'rest-nonce',
    maxUploadBytes: 1000,
    fetchImpl,
  });
}

describe('createMediaClient', () => {
  it('resolves an existing attachment by id and refuses invalid ids before sending', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response(attachment()));
    const media = client(fetchImpl);
    expect(await media.get(9)).toMatchObject({ ok: true, value: { id: 9 } });
    expect((await media.get(0)).ok).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const requestUrl = fetchImpl.mock.calls[0]?.[0];
    expect(requestUrl instanceof URL ? requestUrl.pathname : '').toContain('/wp/v2/media/9');
  });

  it('lists images with pagination headers, search and strict URL filtering', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      response([attachment(), attachment(10, 'https://evil.example/x.jpg')], {
        'X-WP-Total': '7',
        'X-WP-TotalPages': '3',
      }),
    );
    const result = await client(fetchImpl).list({ search: 'hero image', page: 2 });
    expect(result).toEqual({
      ok: true,
      value: {
        items: [
          {
            id: 9,
            url: `${origin}/uploads/full.jpg`,
            thumbUrl: `${origin}/uploads/thumb.jpg`,
            alt: 'A photo',
            title: '<img>Photo</img>',
            width: 80,
            height: 60,
            mime: 'image/jpeg',
          },
        ],
        total: 7,
        totalPages: 3,
      },
    });
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    const requestUrl = url instanceof URL ? url.href : typeof url === 'string' ? url : (url?.url ?? '');
    expect(requestUrl).toContain('media_type=image');
    expect(requestUrl).toContain('per_page=24');
    expect(requestUrl).toContain('page=2');
    expect(requestUrl).toContain('search=hero+image');
    expect(new Headers(init?.headers).get('X-WP-Nonce')).toBe('rest-nonce');
  });

  it('rejects malformed response headers and invalid pagination', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response([attachment()], { 'X-WP-Total': 'x', 'X-WP-TotalPages': '1' }));
    expect((await client(fetchImpl).list()).ok).toBe(false);
    expect((await client(fetchImpl).list({ page: 0 })).ok).toBe(false);
  });

  it('uploads raw image bytes with a sanitized ASCII filename in the form WordPress parses and maps WordPress errors', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response(attachment(), {}, 201));
    const file = new File(['png'], 'a bad/filename.png', { type: 'image/png' });
    const result = await client(fetchImpl).upload(file);
    expect(result.ok).toBe(true);
    const [, init] = fetchImpl.mock.calls[0] ?? [];
    expect(init?.body).toBe(file);
    expect(new Headers(init?.headers).get('Content-Type')).toBe('image/png');
    expect(new Headers(init?.headers).get('Content-Disposition')).toBe('attachment; filename="a bad_filename.png"');
    const denied = await client(
      vi.fn<typeof fetch>().mockResolvedValue(response({ code: 'rest_upload_no_data', message: 'no' }, {}, 403)),
    ).upload(file);
    expect(denied).toMatchObject({ ok: false, error: { code: 'media_forbidden', status: 403 } });
  });

  it('rejects unsupported, empty and oversized files before the request', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const media = client(fetchImpl);
    expect((await media.upload(new File(['x'], 'x.svg', { type: 'image/svg+xml' }))).ok).toBe(false);
    expect((await media.upload(new File([], 'x.png', { type: 'image/png' }))).ok).toBe(false);
    const oversized = await media.upload(new File(['x'.repeat(1001)], 'x.png', { type: 'image/png' }));
    expect(oversized.ok ? null : oversized.error.code).toBe('media_file_too_large');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('upload filename header', () => {
  it('never lets a quote, semicolon, newline or non-ASCII character reach the Content-Disposition header', async () => {
    const calls: RequestInit[] = [];
    const client = createMediaClient({
      wpRestRoot: 'http://localhost:3000/wp-json/wp/v2',
      nonce: 'n',
      maxUploadBytes: 1_000_000,
      fetchImpl: (_url: unknown, init?: RequestInit) => {
        calls.push(init ?? {});
        return Promise.resolve(new Response('{}', { status: 400 }));
      },
    });
    await client.upload(new File(['x'], 'evil"; filename=shell.php\nÅngström ☃.png', { type: 'image/png' }));
    const header = new Headers(calls[0]?.headers).get('Content-Disposition') ?? '';
    expect(header).toMatch(/^attachment; filename="[A-Za-z0-9._ -]+"$/);
  });
});
