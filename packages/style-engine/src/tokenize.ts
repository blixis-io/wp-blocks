import { at } from './at.ts';
import { CSS_LIMITS, type CssFailure } from './limits.ts';

/** A parsed CSS component value. Functions own their children; whitespace is kept only where it is meaningful. */
export type Component =
  | { t: 'ident'; v: string }
  | { t: 'number'; v: string }
  | { t: 'dimension'; v: string; unit: string }
  | { t: 'percent'; v: string }
  | { t: 'hash'; v: string }
  | { t: 'string'; v: string }
  | { t: 'fn'; name: string; children: Component[] }
  | { t: 'comma' }
  | { t: 'slash' }
  | { t: 'op'; v: '+' | '-' | '*' }
  | { t: 'space' };

export type ParseResult = { ok: true; components: Component[] } | ({ ok: false } & CssFailure);

/** Characters that never appear in an allowed value: escapes, statement/block/at-rule syntax, strings, comments' `*` is handled separately. */
export const FORBIDDEN_CHARACTERS = [
  '\\',
  ';',
  '{',
  '}',
  '<',
  '>',
  '@',
  '!',
  '"',
  "'",
  '[',
  ']',
  '`',
  ':',
  '&',
  '|',
  '^',
  '~',
  '$',
  '?',
  '=',
  '_',
];
const FORBIDDEN = new Set(FORBIDDEN_CHARACTERS);

const isDigit = (c: string): boolean => c >= '0' && c <= '9' && c.length === 1;
const isAlpha = (c: string): boolean => c.length === 1 && ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z'));
const isIdentChar = (c: string): boolean => isAlpha(c) || isDigit(c) || c === '-';
const isHex = (c: string): boolean =>
  c.length === 1 && (isDigit(c) || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F'));

const fail = (code: CssFailure['code'], message: string): ParseResult => ({ ok: false, code, message });

/** Strips whitespace at the edges of a component list and next to commas, slashes and `*` (where it carries no meaning). */
function tidy(list: Component[]): Component[] {
  const out: Component[] = [];
  for (const c of list) {
    if (c.t === 'space') {
      const prev = out[out.length - 1];
      if (prev === undefined || prev.t === 'space' || prev.t === 'comma' || prev.t === 'slash') continue;
      if (prev.t === 'op' && prev.v === '*') continue;
      out.push(c);
    } else {
      const prev = out[out.length - 1];
      if (prev?.t === 'space' && (c.t === 'comma' || c.t === 'slash' || (c.t === 'op' && c.v === '*'))) {
        out.pop();
      }
      out.push(c);
    }
  }
  while (out.length > 0 && out[out.length - 1]?.t === 'space') out.pop();
  return out;
}

function normalizeNumber(text: string): string {
  let sign = '';
  let body = text;
  if (body.startsWith('-')) {
    sign = '-';
    body = body.slice(1);
  } else if (body.startsWith('+')) {
    body = body.slice(1);
  }
  if (body.startsWith('.')) body = `0${body}`;
  return sign + body;
}

interface Frame {
  name: string;
  children: Component[];
}

/**
 * Tokenizes and parses one declaration value. A hand-written, linear scanner (no regular expressions on the value, so no
 * backtracking): printable ASCII only, no escapes, comments, strings, `;`, braces or at-rules, bounded length, components
 * and nesting. Identifiers, units and function names are lower-cased. It does not decide what is allowed; the grammar does.
 */
export function parseValue(value: string, options: { strings?: boolean } = {}): ParseResult {
  const strings = options.strings === true;
  if (value.length > CSS_LIMITS.maxValueLength)
    return fail('value-too-long', `longer than ${String(CSS_LIMITS.maxValueLength)} characters`);
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    const c = value[i] ?? '';
    if (code < 0x20 || code > 0x7e)
      return fail(
        'forbidden-character',
        'only printable ASCII is allowed (no control, newline or non-ASCII characters)',
      );
    if (FORBIDDEN.has(c) && !(strings && c === '"'))
      return fail('forbidden-character', `the character "${c}" is not allowed in a value`);
  }
  if (value.includes('/*') || value.includes('*/')) return fail('forbidden-character', 'comments are not allowed');

  const stack: Frame[] = [{ name: '', children: [] }];
  let count = 0;
  let i = 0;
  const top = (): Frame => at(stack, stack.length - 1);
  const VALUE = new Set(['ident', 'number', 'dimension', 'percent', 'hash', 'string', 'fn']);
  // Two value tokens with nothing between them (`none+0`, `)calc(`) would serialize into different tokens: refuse them.
  const adjacent = (c: Component): boolean => VALUE.has(c.t) && VALUE.has(top().children.at(-1)?.t ?? '');
  const push = (c: Component): ParseResult | null => {
    if (adjacent(c)) return fail('syntax', 'values must be separated by whitespace or an operator');
    count += 1;
    if (count > CSS_LIMITS.maxComponents)
      return fail('too-complex', `more than ${String(CSS_LIMITS.maxComponents)} components`);
    top().children.push(c);
    return null;
  };

  while (i < value.length) {
    const c = value[i] ?? '';
    const n = value[i + 1] ?? '';
    let error: ParseResult | null = null;
    if (c === ' ') {
      while (value[i] === ' ') i += 1;
      error = push({ t: 'space' });
    } else if (c === '(') {
      if (stack.length > CSS_LIMITS.maxDepth)
        return fail('too-complex', `nesting deeper than ${String(CSS_LIMITS.maxDepth)} levels`);
      count += 1;
      stack.push({ name: '', children: [] });
      i += 1;
    } else if (c === ')') {
      if (stack.length === 1) return fail('syntax', 'unbalanced ")"');
      const frame = at(stack, stack.length - 1);
      stack.pop();
      const closed: Component = { t: 'fn', name: frame.name, children: tidy(frame.children) };
      if (adjacent(closed)) return fail('syntax', 'values must be separated by whitespace or an operator');
      top().children.push(closed);
      i += 1;
    } else if (c === ',') {
      error = push({ t: 'comma' });
      i += 1;
    } else if (c === '/') {
      error = push({ t: 'slash' });
      i += 1;
    } else if (c === '*') {
      error = push({ t: 'op', v: '*' });
      i += 1;
    } else if (c === '"') {
      // Only where the caller opted in (font family names): a short, plain name; no escapes can occur, `\` is forbidden above.
      const end = value.indexOf('"', i + 1);
      const text = end < 0 ? '' : value.slice(i + 1, end);
      if (!/^[A-Za-z0-9][A-Za-z0-9 -]{0,62}$/.test(text)) return fail('syntax', 'invalid quoted name');
      error = push({ t: 'string', v: text });
      i = end + 1;
    } else if (c === '#') {
      let j = i + 1;
      while (isHex(value[j] ?? '')) j += 1;
      const len = j - i - 1;
      if ((len !== 3 && len !== 4 && len !== 6 && len !== 8) || isIdentChar(value[j] ?? ''))
        return fail('syntax', 'invalid hex colour');
      error = push({ t: 'hash', v: value.slice(i + 1, j).toLowerCase() });
      i = j;
    } else if (
      isDigit(c) ||
      (c === '.' && isDigit(n)) ||
      ((c === '+' || c === '-') && (isDigit(n) || (n === '.' && isDigit(value[i + 2] ?? ''))))
    ) {
      let j = i + (c === '+' || c === '-' ? 1 : 0);
      const startDigits = j;
      while (isDigit(value[j] ?? '')) j += 1;
      if (value[j] === '.') {
        j += 1;
        if (!isDigit(value[j] ?? '')) return fail('syntax', 'invalid number');
        while (isDigit(value[j] ?? '')) j += 1;
      }
      if (j - startDigits - (value.slice(startDigits, j).includes('.') ? 1 : 0) > CSS_LIMITS.maxDigits)
        return fail('syntax', `numbers may have at most ${String(CSS_LIMITS.maxDigits)} digits`);
      const text = normalizeNumber(value.slice(i, j));
      if (value[j] === '%') {
        error = push({ t: 'percent', v: text });
        j += 1;
      } else if (isAlpha(value[j] ?? '')) {
        const u = j;
        while (isAlpha(value[j] ?? '')) j += 1;
        if (isDigit(value[j] ?? '') || value[j] === '-') return fail('syntax', 'invalid unit');
        error = push({ t: 'dimension', v: text, unit: value.slice(u, j).toLowerCase() });
      } else {
        if (isIdentChar(value[j] ?? '')) return fail('syntax', 'invalid number');
        error = push({ t: 'number', v: text });
      }
      i = j;
    } else if (isAlpha(c) || (c === '-' && (isAlpha(n) || n === '-'))) {
      let j = i;
      while (isIdentChar(value[j] ?? '')) j += 1;
      const name = value.slice(i, j).toLowerCase();
      if (value[j] === '(') {
        if (stack.length > CSS_LIMITS.maxDepth)
          return fail('too-complex', `nesting deeper than ${String(CSS_LIMITS.maxDepth)} levels`);
        count += 1;
        stack.push({ name, children: [] });
        j += 1;
      } else {
        error = push({ t: 'ident', v: name });
      }
      i = j;
    } else if ((c === '+' || c === '-') && (n === ' ' || n === ')' || n === '')) {
      error = push({ t: 'op', v: c });
      i += 1;
    } else {
      return fail('syntax', `unexpected "${c}"`);
    }
    if (error !== null) return error;
  }
  if (stack.length !== 1) return fail('syntax', 'unbalanced "("');
  return { ok: true, components: tidy(top().children) };
}

/** Canonical text of a parsed value (lower case, single spaces); the output of sanitization. */
export function serialize(list: readonly Component[]): string {
  let out = '';
  for (const c of list) {
    switch (c.t) {
      case 'ident':
      case 'number':
        out += c.v;
        break;
      case 'dimension':
        out += c.v + c.unit;
        break;
      case 'percent':
        out += `${c.v}%`;
        break;
      case 'hash':
        out += `#${c.v}`;
        break;
      case 'string':
        out += `"${c.v}"`;
        break;
      case 'fn':
        out += `${c.name}(${serialize(c.children)})`;
        break;
      case 'comma':
        out += ', ';
        break;
      case 'slash':
        out += ' / ';
        break;
      case 'op':
        out += c.v === '*' ? ' * ' : c.v;
        break;
      case 'space':
        out += ' ';
        break;
    }
  }
  return out;
}
