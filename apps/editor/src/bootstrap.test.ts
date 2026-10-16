import { describe, expect, it } from 'vitest';
import {
  BOOTSTRAP_ELEMENT_ID,
  type EditorBootstrap,
  MAX_BOOTSTRAP_BYTES,
  parseBootstrap,
  readBootstrap,
} from './bootstrap';
import { makeBootstrap } from './test/fixtures';

const ORIGIN = location.origin;

function withScript(text: string, type = 'application/json', tag = 'script'): Document {
  document.body.innerHTML = '';
  const element = document.createElement(tag);
  element.id = BOOTSTRAP_ELEMENT_ID;
  element.setAttribute('type', type);
  element.textContent = text;
  document.body.append(element);
  return document;
}

describe('parseBootstrap', () => {
  it('accepts a valid v1 bootstrap', () => {
    const result = parseBootstrap(makeBootstrap(), ORIGIN);
    expect(result.ok).toBe(true);
  });

  it('accepts a null viewUrl and a lock reason', () => {
    expect(
      parseBootstrap(makeBootstrap({ viewUrl: null, editingEnabled: false, lockReason: 'Locked' }), ORIGIN).ok,
    ).toBe(true);
  });
  it('requires a boolean SEO plugin flag', () => {
    expect(parseBootstrap(makeBootstrap({ seoPluginActive: true }), ORIGIN).ok).toBe(true);
    expect(parseBootstrap({ ...makeBootstrap(), seoPluginActive: 'yes' }, ORIGIN).ok).toBe(false);
  });

  it.each([
    ['cross-origin previewUrl', { previewUrl: 'https://evil.example/?blixis_preview=x' }],
    ['javascript previewUrl', { previewUrl: 'javascript:alert(1)' }],
    ['relative previewUrl', { previewUrl: '/draft/' }],
  ])('refuses %s', (_name, override) => {
    expect(parseBootstrap(makeBootstrap(override), ORIGIN).ok).toBe(false);
  });

  it('accepts a null previewUrl', () => {
    expect(parseBootstrap(makeBootstrap({ previewUrl: null }), ORIGIN).ok).toBe(true);
  });

  it('accepts an absent, a null and a same-origin canvasUrl and returns the normalised href', () => {
    const url = `${location.origin}/wp-admin/admin.php?page=blixis-canvas&post=42&locale=fr_FR`;
    expect(parseBootstrap(makeBootstrap(), ORIGIN).ok).toBe(true);
    expect(parseBootstrap(makeBootstrap({ canvasUrl: null }), ORIGIN).ok).toBe(true);
    const result = parseBootstrap(makeBootstrap({ canvasUrl: url }), ORIGIN);
    expect(result.ok && result.value.canvasUrl).toBe(url);
  });

  it.each([
    ['javascript: canvasUrl', { canvasUrl: 'javascript:alert(1)' }],
    ['data: canvasUrl', { canvasUrl: 'data:text/html,<script>1</script>' }],
    ['cross-origin canvasUrl', { canvasUrl: 'https://evil.example/canvas' }],
    ['relative canvasUrl', { canvasUrl: '/wp-admin/admin.php?page=blixis-canvas' }],
    ['credentials in canvasUrl', { canvasUrl: `http://user:pw@${location.host}/c` }],
    ['backslash canvasUrl', { canvasUrl: `${ORIGIN}\\@evil.example/` }],
    ['non-string canvasUrl', { canvasUrl: 5 as unknown as string }],
  ])('refuses %s', (_name, override) => {
    expect(parseBootstrap(makeBootstrap(override), ORIGIN).ok).toBe(false);
  });

  it.each([
    ['javascript: restRoot', { restRoot: 'javascript:alert(1)' }],
    ['data: adminUrl', { adminUrl: 'data:text/html,hi' }],
    ['cross-origin restRoot', { restRoot: 'https://evil.example/wp-json/' }],
    ['cross-origin viewUrl', { viewUrl: 'https://evil.example/' }],
    ['credentials in URL', { adminUrl: `http://user:pw@${location.host}/wp-admin/` }],
    ['backslash trick', { adminUrl: `${ORIGIN}\\@evil.example/` }],
    ['relative URL', { adminUrl: '/wp-admin/' }],
    ['wrong type postId', { postId: '42' as unknown as number }],
    ['negative postId', { postId: -1 }],
    ['fractional postId', { postId: 1.5 }],
    ['wrong version', { version: 2 as unknown as 1 }],
    ['empty nonce', { nonce: '' }],
    ['missing csp nonce', { cspNonce: '' }],
    ['short csp nonce', { cspNonce: 'abc' }],
    ['csp nonce that could extend the policy', { cspNonce: "AAAAAAAAAAAAAAAA' 'unsafe-inline" }],
    ['csp nonce with a line break', { cspNonce: 'AAAAAAAAAAAAAAAA\r\nX-Evil: 1' }],
    ['huge title', { postTitle: 'x'.repeat(100_000) }],
    ['huge nonce', { nonce: 'x'.repeat(5000) }],
    ['bad locale', { contentLocale: '<script>' }],
    ['empty enabled locales', { enabledLocales: [] }],
    ['non-boolean editingEnabled', { editingEnabled: 'yes' as unknown as boolean }],
    ['bad postType', { postType: 'Page Type!' }],
  ])('refuses %s', (_name, override) => {
    expect(parseBootstrap(makeBootstrap(override), ORIGIN).ok).toBe(false);
  });

  it('refuses non-objects and missing fields', () => {
    for (const value of [null, undefined, 1, 'x', [], {}]) expect(parseBootstrap(value, ORIGIN).ok).toBe(false);
    const rest: Partial<EditorBootstrap> = makeBootstrap();
    delete rest.nonce;
    expect(parseBootstrap(rest, ORIGIN).ok).toBe(false);
  });

  it('refuses unknown top-level keys instead of stripping them', () => {
    expect(parseBootstrap({ ...makeBootstrap(), extra: 1 }, ORIGIN).ok).toBe(false);
  });

  it('refuses a __proto__ key explicitly and never pollutes', () => {
    const withProto = JSON.parse(
      JSON.stringify(makeBootstrap()).replace('{', '{"__proto__":{"polluted":true},'),
    ) as unknown;
    expect(Object.hasOwn(withProto as object, '__proto__')).toBe(true); // JSON.parse creates an own property
    expect(parseBootstrap(withProto, ORIGIN)).toEqual({ ok: false, code: 'invalid' });
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    const onlyProto = JSON.parse(`{"__proto__":{"polluted":true},"version":1}`) as unknown;
    expect(parseBootstrap(onlyProto, ORIGIN).ok).toBe(false);
  });

  it('returns normalised URLs and never the raw spelling', () => {
    const result = parseBootstrap(makeBootstrap({ adminUrl: `${location.protocol}${location.host}/x` }), ORIGIN);
    if (result.ok) {
      expect(result.value.adminUrl).toBe(`${location.origin}/x`);
    } else {
      expect(result.ok).toBe(false); // refused is equally safe: the raw form is never passed through
    }
    const upper = parseBootstrap(makeBootstrap({ restRoot: location.origin.toUpperCase() + '/wp-json/' }), ORIGIN);
    if (upper.ok) expect(upper.value.restRoot).toBe(`${location.origin}/wp-json/`);
  });

  it.each(['en_US', 'nl_NL', 'ar', 'de_DE_formal', 'zh_Hans_CN'])('accepts the WordPress locale %s', (locale) => {
    expect(parseBootstrap(makeBootstrap({ editorLocale: locale, contentLocale: locale }), ORIGIN).ok).toBe(true);
  });

  it.each(['en-US', 'EN_us', 'e', 'en_', 'en__US', 'en_U', 'en_US_aaaaaaaaaaaaaaaaaa', '<x>', 'en_US\n'])(
    'refuses the locale %j like the PHP side',
    (locale) => {
      expect(parseBootstrap(makeBootstrap({ contentLocale: locale }), ORIGIN).ok).toBe(false);
    },
  );

  it('accepts the optional contentLocaleExplicit flag and refuses other types', () => {
    expect(parseBootstrap(makeBootstrap({ contentLocaleExplicit: true }), ORIGIN).ok).toBe(true);
    expect(parseBootstrap(makeBootstrap({ contentLocaleExplicit: false }), ORIGIN).ok).toBe(true);
    expect(parseBootstrap(makeBootstrap(), ORIGIN).ok).toBe(true);
    expect(parseBootstrap({ ...makeBootstrap(), contentLocaleExplicit: 'yes' }, ORIGIN).ok).toBe(false);
  });

  it('never echoes input in the failure', () => {
    const result = parseBootstrap(makeBootstrap({ restRoot: 'javascript:SECRET' }), ORIGIN);
    expect(JSON.stringify(result)).not.toContain('SECRET');
  });
});

describe('readBootstrap', () => {
  it('reads JSON from the script element', () => {
    const doc = withScript(JSON.stringify(makeBootstrap()));
    expect(readBootstrap(doc, ORIGIN).ok).toBe(true);
  });

  it('reports a missing element', () => {
    document.body.innerHTML = '';
    expect(readBootstrap(document, ORIGIN)).toEqual({ ok: false, code: 'missing' });
  });

  it('refuses an element with the wrong tag or type', () => {
    expect(readBootstrap(withScript('{}', 'text/javascript'), ORIGIN)).toEqual({ ok: false, code: 'missing' });
    expect(readBootstrap(withScript('{}', 'application/json', 'div'), ORIGIN)).toEqual({ ok: false, code: 'missing' });
  });

  it('refuses malformed JSON and oversized payloads without evaluating anything', () => {
    expect(readBootstrap(withScript('{nope'), ORIGIN)).toEqual({ ok: false, code: 'malformed-json' });
    expect(readBootstrap(withScript('alert(1)'), ORIGIN)).toEqual({ ok: false, code: 'malformed-json' });
    expect(readBootstrap(withScript(' '.repeat(MAX_BOOTSTRAP_BYTES + 1)), ORIGIN)).toEqual({
      ok: false,
      code: 'too-large',
    });
  });
});
