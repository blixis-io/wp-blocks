const SAFE_SCHEMES = new Set(['http:', 'https:', 'mailto:', 'tel:']);

/**
 * Characters that may never appear in a link: control characters, the backslash (browsers treat it like a slash), every kind
 * of whitespace, and invisible or direction-changing characters that browsers drop while parsing a scheme (so
 * `java<tab>script:` would otherwise slip through). Written as code point ranges so no special character sits in this file.
 */
function isForbiddenChar(code: number): boolean {
  return (
    code <= 0x20 || // C0 controls and the space
    (code >= 0x7f && code <= 0x9f) || // DEL and C1 controls
    code === 0x5c || // backslash
    code === 0xa0 || // no-break space
    code === 0x1680 ||
    (code >= 0x2000 && code <= 0x200f) || // spaces, zero-width and direction marks
    (code >= 0x2028 && code <= 0x202f) || // line/paragraph separators, direction overrides, narrow no-break space
    (code >= 0x205f && code <= 0x206f) || // medium space, word joiner, invisible operators, deprecated format characters
    code === 0x3000 ||
    code === 0xfeff // byte order mark / zero-width no-break space
  );
}

/**
 * Is `value` a URL that is safe to put in an `href`? Allowed: `http(s)`, `mailto`, `tel`, and relative references
 * (`/path`, `path`, `?query`, `#fragment`). Rejected: every other scheme (`javascript:`, `data:`, `vbscript:`, `blob:`,
 * `file:` ...), protocol-relative `//host`, backslashes, whitespace, control and invisible characters, and anything longer
 * than 2048 characters. The check mirrors what a browser would resolve, so obfuscation cannot smuggle a dangerous scheme
 * past it. Server-side escaping (`esc_url`) still applies when the link is rendered.
 */
export function isSafeUrl(value: string): boolean {
  if (value.length === 0) return true; // empty = no link
  if (value.length > 2048) return false;
  for (const char of value) {
    if (isForbiddenChar(char.codePointAt(0) ?? 0)) return false;
  }
  if (value.startsWith('//')) return false;
  // A character reference such as &colon; is decoded by the HTML parser inside attribute values, so it could rebuild a scheme.
  // Numeric references are decoded even without the closing semicolon (&#58 is a colon), so '&#' is never accepted.
  if (value.includes('&#') || /&[a-zA-Z0-9]+;/.test(value)) return false;
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(value);
  if (scheme !== null) return SAFE_SCHEMES.has(`${(scheme[1] ?? '').toLowerCase()}:`);
  // No scheme: it is relative. A colon before the first '/', '?' or '#' would still make a browser read a scheme.
  const firstDelimiter = value.search(/[/?#]/);
  const head = firstDelimiter === -1 ? value : value.slice(0, firstDelimiter);
  return !head.includes(':');
}
