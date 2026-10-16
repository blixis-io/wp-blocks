const SAFE_SCHEMES = new Set(['http:', 'https:', 'mailto:', 'tel:']);
function forbidden(code: number): boolean {
  return (
    code <= 0x20 ||
    (code >= 0x7f && code <= 0x9f) ||
    code === 0x5c ||
    code === 0xa0 ||
    code === 0x1680 ||
    (code >= 0x2000 && code <= 0x200f) ||
    (code >= 0x2028 && code <= 0x202f) ||
    (code >= 0x205f && code <= 0x206f) ||
    code === 0x3000 ||
    code === 0xfeff
  );
}
/** Compact copy of core's URL policy for iframe command validation; parity is tested against the canonical core helper. */
export function isSafeCanvasUrl(value: string): boolean {
  if (value === '') return true;
  if (value.length > 2048) return false;
  for (const char of value) if (forbidden(char.codePointAt(0) ?? 0)) return false;
  if (/[<>"']/u.test(value) || value.startsWith('//') || value.includes('&#') || /&[a-zA-Z0-9]+;/u.test(value))
    return false;
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/u.exec(value);
  if (scheme !== null) {
    const name = scheme[1]?.toLowerCase();
    return name !== undefined && SAFE_SCHEMES.has(`${name}:`);
  }
  const delimiter = value.search(/[/?#]/u);
  return !(delimiter < 0 ? value : value.slice(0, delimiter)).includes(':');
}
