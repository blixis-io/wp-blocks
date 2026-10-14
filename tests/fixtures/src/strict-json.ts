/** Maximum container nesting accepted in fixtures; the PHP implementation enforces the same limit. */
export const MAX_DEPTH = 64;

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;

/**
 * Validates fixture JSON text *before* it is parsed, because parsing already hides what we must reject: `1.0`, `1e3`
 * and `-0` all become ordinary JavaScript integers. Rejected: non-integer number tokens, `-0`, integers beyond 2^53,
 * duplicate object keys, lone surrogate escapes, nesting deeper than MAX_DEPTH and anything that is not strict JSON.
 * `tooling/php/src/Fixtures.php` implements the same rules; parity.test.ts compares them.
 */
export function assertStrictJson(text: string): void {
  let i = 0;
  const fail = (message: string): never => {
    throw new Error(`invalid fixture JSON at offset ${String(i)}: ${message}`);
  };
  const ws = (): void => {
    while (i < text.length && ' \t\n\r'.includes(text.charAt(i))) i += 1;
  };
  const string = (): string => {
    const start = i;
    i += 1;
    while (i < text.length && text.charAt(i) !== '"') {
      if (text.charAt(i) === '\\') i += 1;
      else if (text.charCodeAt(i) < 0x20) fail('control character in string');
      i += 1;
    }
    if (i >= text.length) fail('unterminated string');
    i += 1;
    let decoded: unknown;
    try {
      decoded = JSON.parse(text.slice(start, i));
    } catch {
      return fail('invalid string escape');
    }
    if (typeof decoded !== 'string' || !decoded.isWellFormed()) return fail('lone surrogate in string');
    return decoded;
  };
  const number = (): void => {
    NUMBER.lastIndex = i;
    const match = NUMBER.exec(text);
    if (match === null) return fail('invalid number');
    const token = match[0];
    if (/[.eE]/.test(token)) fail(`non-integer number ${token}; use a string`);
    if (token === '-0') fail('negative zero is not allowed');
    const magnitude = BigInt(token.replace('-', ''));
    if (magnitude > MAX_SAFE) fail(`integer ${token} is beyond 2^53; use a string`);
    i += token.length;
  };
  const value = (depth: number): void => {
    ws();
    const c = text.charAt(i);
    if (c === '{' || c === '[') {
      if (depth + 1 > MAX_DEPTH) fail(`nesting deeper than ${String(MAX_DEPTH)}`);
      i += 1;
      ws();
      const close = c === '{' ? '}' : ']';
      if (text.charAt(i) === close) {
        i += 1;
        return;
      }
      const keys = new Set<string>();
      for (;;) {
        ws();
        if (c === '{') {
          if (text.charAt(i) !== '"') fail('object key must be a string');
          const key = string();
          if (keys.has(key)) fail(`duplicate key "${key}"`);
          keys.add(key);
          ws();
          if (text.charAt(i) !== ':') fail('expected ":"');
          i += 1;
        }
        value(depth + 1);
        ws();
        const next = text.charAt(i);
        i += 1;
        if (next === close) return;
        if (next !== ',') fail(`expected "," or "${close}"`);
      }
    }
    if (c === '"') {
      string();
      return;
    }
    if (c === '-' || (c >= '0' && c <= '9')) {
      number();
      return;
    }
    for (const literal of ['true', 'false', 'null']) {
      if (text.startsWith(literal, i)) {
        i += literal.length;
        return;
      }
    }
    fail('unexpected token');
  };
  value(0);
  ws();
  if (i !== text.length) fail('unexpected content after the value');
}
