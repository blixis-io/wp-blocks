/** Loop fallback: no regular expression lookbehind (unsupported before Safari 16.4) and no ES2024 API. */
function hasNoLoneSurrogate(value: string): boolean {
  const length = value.length;
  for (let i = 0; i < length; i += 1) {
    const unit = value.charCodeAt(i);
    if (unit < 0xd800 || unit > 0xdfff) continue;
    // A high surrogate must be followed by a low one (which is then consumed); a low surrogate seen here is lone.
    if (unit > 0xdbff) return false;
    const next = i + 1 < length ? value.charCodeAt(i + 1) : 0;
    if (next < 0xdc00 || next > 0xdfff) return false;
    i += 1;
  }
  return true;
}

/**
 * `true` when the string holds no lone UTF-16 surrogate. Uses the native `String.prototype.isWellFormed` (ES2024) when the
 * runtime has it and an equivalent loop otherwise, so older browsers need no ES2024 API. Identical results.
 */
export function isWellFormed(value: string): boolean {
  const native = (String.prototype as { isWellFormed?: () => boolean }).isWellFormed;
  if (typeof native === 'function') return native.call(value);
  return hasNoLoneSurrogate(value);
}
