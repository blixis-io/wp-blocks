import { isSafeUrl as coreIsSafeUrl } from '@blixis/wp-core';

/**
 * Is `value` a URL that is safe to put in an `href`? Allowed: `http(s)`, `mailto`, `tel`, and relative references
 * (`/path`, `path`, `?query`, `#fragment`). Rejected: every other scheme (`javascript:`, `data:`, `vbscript:`, `blob:`,
 * `file:` ...), protocol-relative `//host`, backslashes, whitespace, control and invisible characters, and anything longer
 * than 2048 characters. The check mirrors what a browser would resolve, so obfuscation cannot smuggle a dangerous scheme
 * past it. Server-side escaping (`esc_url`) still applies when the link is rendered.
 */
export function isSafeUrl(value: string): boolean {
  return coreIsSafeUrl(value);
}
