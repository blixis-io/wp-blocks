import { z } from 'zod';

/** Id of the `<script type="application/json">` element printed by the PHP admin screen. */
export const BOOTSTRAP_ELEMENT_ID = 'blixis-editor-bootstrap';
/** The JSON is small by design; anything larger is refused before it is parsed. */
export const MAX_BOOTSTRAP_BYTES = 64 * 1024;

/**
 * WordPress locale ids, exactly as `MetaKeys::is_valid_locale` in the plugin accepts them: a lower-case language code
 * followed by underscore-separated alphanumeric subtags, at most 20 characters. BCP 47 hyphens are not accepted.
 */
const LOCALE = z
  .string()
  .max(20)
  .regex(/^[a-z]{2,3}(?:_[A-Za-z0-9]{2,8})*$/);

function hasControlOrBackslash(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f || code === 0x5c) return true;
  }
  return false;
}

/**
 * Builds a URL schema that accepts only credential-free http(s) URLs on the given origin and returns the NORMALISED
 * `href`, so odd spellings the URL parser repairs (for example `https:host/x`) never reach the page as written.
 */
function sameOriginUrl(origin: string) {
  return z
    .string()
    .max(2048)
    .transform((value, ctx) => {
      const reject = () => {
        ctx.issues.push({ code: 'custom', message: 'must be a same-origin http(s) URL', input: value });
        return z.NEVER;
      };
      if (hasControlOrBackslash(value)) return reject();
      try {
        const url = new URL(value);
        const allowed =
          (url.protocol === 'https:' || url.protocol === 'http:') &&
          url.origin === origin &&
          url.username === '' &&
          url.password === '';
        return allowed ? url.href : reject();
      } catch {
        return reject();
      }
    });
}

export function createBootstrapSchema(origin: string) {
  const url = sameOriginUrl(origin);
  return z.strictObject({
    version: z.literal(1),
    restRoot: url,
    nonce: z.string().min(1).max(128),
    postId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    postTitle: z.string().max(2000),
    postType: z.string().regex(/^[a-z0-9_-]{1,20}$/),
    contentLocale: LOCALE,
    defaultLocale: LOCALE,
    enabledLocales: z.array(LOCALE).min(1).max(100),
    editorLocale: LOCALE,
    pluginVersion: z.string().min(1).max(64),
    themeName: z.string().max(200),
    editingEnabled: z.boolean(),
    lockReason: z.string().max(1000).nullable(),
    adminUrl: url,
    viewUrl: url.nullable(),
    // Per-response CSP nonce: the bundled UI libraries inject <style> elements (Radix dialogs lock scrolling that way) and the
    // strict policy only allows those that carry it.
    cspNonce: z.string().regex(/^[A-Za-z0-9+/_=-]{16,64}$/),
  });
}

export type EditorBootstrap = z.output<ReturnType<typeof createBootstrapSchema>>;

export type BootstrapResult =
  { ok: true; value: EditorBootstrap } | { ok: false; code: 'missing' | 'too-large' | 'malformed-json' | 'invalid' };

/**
 * Validates an untrusted value. The result never carries the offending data or zod messages, so an error screen built
 * from it cannot leak anything the page author did not intend to show.
 */
export function parseBootstrap(raw: unknown, origin: string = globalThis.location.origin): BootstrapResult {
  const parsed = createBootstrapSchema(origin).safeParse(raw);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, code: 'invalid' };
}

/** Reads and validates the bootstrap JSON. The text is parsed with `JSON.parse` only; it is never evaluated. */
export function readBootstrap(doc: Document = document, origin: string = globalThis.location.origin): BootstrapResult {
  const element = doc.getElementById(BOOTSTRAP_ELEMENT_ID);
  if (element?.tagName !== 'SCRIPT' || element.getAttribute('type') !== 'application/json') {
    return { ok: false, code: 'missing' };
  }
  const text = element.textContent;
  if (text.length > MAX_BOOTSTRAP_BYTES) return { ok: false, code: 'too-large' };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, code: 'malformed-json' };
  }
  return parseBootstrap(json, origin);
}
