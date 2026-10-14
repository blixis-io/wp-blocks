import { at } from './at.ts';
import type { CssFailure } from './limits.ts';
import {
  ANGLE_UNITS,
  COLOR_ARG_IDENTS,
  COLOR_FUNCTIONS,
  GRADIENT_ARG_IDENTS,
  GRADIENT_FUNCTIONS,
  LENGTH_UNITS,
  MATH_FUNCTIONS,
  NAMED_COLORS,
  TIME_UNITS,
  TRACK_ARG_IDENTS,
  TRACK_FUNCTIONS,
  TRANSFORM_FUNCTIONS,
  WIDE_KEYWORDS,
  type Kind,
} from './properties.ts';
import type { Component } from './tokenize.ts';

type Fn = Extract<Component, { t: 'fn' }>;
type Failure = CssFailure | null;

const set = (...lists: readonly (readonly string[])[]): ReadonlySet<string> => new Set(lists.flat());
const LENGTH = set(LENGTH_UNITS);
const ANGLE = set(ANGLE_UNITS);
const TIME = set(TIME_UNITS);
const MATH = set(MATH_FUNCTIONS);
const COLOR_FN = set(COLOR_FUNCTIONS);
const GRADIENT_FN = set(GRADIENT_FUNCTIONS);
const TRACK_FN = set(TRACK_FUNCTIONS);
const TRANSFORM_FN = set(TRANSFORM_FUNCTIONS);
const COLORS = set(NAMED_COLORS);
const WIDE = set(WIDE_KEYWORDS);
const ALL_FN = set(MATH_FUNCTIONS, COLOR_FUNCTIONS, GRADIENT_FUNCTIONS, TRACK_FUNCTIONS, TRANSFORM_FUNCTIONS, ['var']);
const VAR_NAME = /^--blx-[a-z0-9-]{1,64}$/;

const bad = (code: CssFailure['code'], message: string): CssFailure => ({ code, message });

/** What a function argument list may contain. Anything else is refused, so a function can never smuggle in a URL or a string. */
interface Policy {
  idents: ReadonlySet<string> | 'any';
  units: ReadonlySet<string>;
  fns: ReadonlySet<string>;
  numbers: boolean;
  percent: boolean;
  hash: boolean;
  colorNames: boolean;
  commas: boolean;
  slash: boolean;
}

const POLICY_COLOR: Policy = {
  idents: set(COLOR_ARG_IDENTS, NAMED_COLORS),
  units: set(ANGLE_UNITS),
  fns: set(MATH_FUNCTIONS, COLOR_FUNCTIONS, ['var']),
  numbers: true,
  percent: true,
  hash: true,
  colorNames: true,
  commas: true,
  slash: true,
};
const POLICY_GRADIENT: Policy = {
  idents: set(GRADIENT_ARG_IDENTS, NAMED_COLORS),
  units: set(LENGTH_UNITS, ANGLE_UNITS),
  fns: set(MATH_FUNCTIONS, COLOR_FUNCTIONS, ['var']),
  numbers: true,
  percent: true,
  hash: true,
  colorNames: true,
  commas: true,
  slash: true,
};
const POLICY_TRACKS: Policy = {
  idents: set(TRACK_ARG_IDENTS),
  units: set(LENGTH_UNITS, ['fr']),
  fns: set(MATH_FUNCTIONS, TRACK_FUNCTIONS, ['var']),
  numbers: true,
  percent: true,
  hash: false,
  colorNames: false,
  commas: true,
  slash: false,
};
const POLICY_TRANSFORM: Policy = {
  idents: set(),
  units: set(LENGTH_UNITS, ANGLE_UNITS),
  fns: set(MATH_FUNCTIONS, ['var']),
  numbers: true,
  percent: true,
  hash: false,
  colorNames: false,
  commas: true,
  slash: false,
};
/** Values of `--blx-*` custom properties and `var()` fallbacks: any plain token, no free functions. */
const POLICY_CUSTOM: Policy = {
  idents: 'any',
  units: set(LENGTH_UNITS, ANGLE_UNITS, TIME_UNITS, ['fr']),
  fns: set(MATH_FUNCTIONS, COLOR_FUNCTIONS, GRADIENT_FUNCTIONS, TRACK_FUNCTIONS, TRANSFORM_FUNCTIONS, ['var']),
  numbers: true,
  percent: true,
  hash: true,
  colorNames: true,
  commas: true,
  slash: true,
};

// ---- numbers --------------------------------------------------------------------------------------------------------

const num = (c: Component): number => ('v' in c && typeof c.v === 'string' ? Number(c.v) : Number.NaN);
const isMath = (c: Component): c is Fn => c.t === 'fn' && MATH.has(c.name);
const isIdent = (c: Component, values: ReadonlySet<string>): boolean => c.t === 'ident' && values.has(c.v);
const isZero = (c: Component): boolean => c.t === 'number' && num(c) === 0;

const isLength = (c: Component, neg: boolean): boolean =>
  isMath(c) || isZero(c) || (c.t === 'dimension' && LENGTH.has(c.unit) && (neg || num(c) >= 0));
const isLengthPct = (c: Component, neg: boolean): boolean =>
  isLength(c, neg) || (c.t === 'percent' && (neg || num(c) >= 0));
const isColor = (c: Component): boolean =>
  (c.t === 'ident' && COLORS.has(c.v)) || c.t === 'hash' || (c.t === 'fn' && COLOR_FN.has(c.name));
const isInt = (c: Component): boolean => c.t === 'number' && Number.isInteger(num(c));

const hasVar = (list: readonly Component[]): boolean =>
  list.some((c) => c.t === 'fn' && (c.name === 'var' || hasVar(c.children)));

// ---- functions ------------------------------------------------------------------------------------------------------

function splitCommas(list: readonly Component[]): Component[][] {
  const out: Component[][] = [[]];
  for (const c of list) {
    if (c.t === 'comma') out.push([]);
    else at(out, out.length - 1).push(c);
  }
  return out;
}

/** `calc()`, `min()`, `max()`, `clamp()` and plain parentheses: operands joined by operators with the spaces CSS requires. */
function checkMath(fn: Fn): Failure {
  const args = splitCommas(fn.children);
  const [lo, hi]: [number, number] =
    fn.name === 'clamp' ? [3, 3] : fn.name === 'min' || fn.name === 'max' ? [1, 8] : [1, 1];
  if (args.length < lo || args.length > hi) {
    return bad('invalid-value', `${fn.name || 'parentheses'}() has the wrong number of arguments`);
  }
  for (const arg of args) {
    const failure = checkExpression(arg);
    if (failure !== null) return failure;
  }
  return null;
}

function checkExpression(list: readonly Component[]): Failure {
  const invalid = bad('invalid-value', 'invalid math expression');
  let i = 0;
  let expectOperand = true;
  let divide = false;
  while (i < list.length) {
    const c = at(list, i);
    if (expectOperand) {
      if (c.t === 'fn') {
        if (c.name !== 'var' && !MATH.has(c.name) && c.name !== '')
          return bad('forbidden-function', `${c.name}() is not allowed in a calculation`);
        const failure = c.name === 'var' ? checkVar(c) : checkMath(c);
        if (failure !== null) return failure;
      } else if (c.t === 'dimension') {
        if (!LENGTH.has(c.unit) && !ANGLE.has(c.unit) && !TIME.has(c.unit))
          return bad('forbidden-unit', `the unit "${c.unit}" is not allowed`);
      } else if (c.t !== 'number' && c.t !== 'percent') {
        return invalid;
      }
      if (divide && isZero(c)) return bad('invalid-value', 'division by zero');
      divide = false;
      expectOperand = false;
      i += 1;
    } else if (c.t === 'op' && c.v === '*') {
      expectOperand = true;
      i += 1;
    } else if (c.t === 'slash') {
      expectOperand = true;
      divide = true;
      i += 1;
    } else if (c.t === 'space' && list[i + 1]?.t === 'op' && list[i + 2]?.t === 'space') {
      const op = at(list, i + 1);
      if (op.t !== 'op' || op.v === '*') return invalid;
      expectOperand = true;
      i += 3;
    } else {
      return invalid;
    }
  }
  return expectOperand ? invalid : null;
}

/** `var(--blx-name)` or `var(--blx-name, fallback)`: only Blixis custom properties, fallbacks held to the custom-property rules. */
function checkVar(fn: Fn): Failure {
  const [name, ...rest] = fn.children;
  if (name?.t !== 'ident' || !VAR_NAME.test(name.v)) {
    return bad('invalid-var', 'var() may only reference --blx-* custom properties');
  }
  if (rest.length === 0) return null;
  if (rest[0]?.t !== 'comma' || rest.length < 2) return bad('invalid-var', 'invalid var() fallback');
  return checkList(rest.slice(1), POLICY_CUSTOM);
}

function checkColorFn(fn: Fn): Failure {
  const failure = checkList(fn.children, POLICY_COLOR);
  if (failure !== null) return failure;
  const values = fn.children.filter((c) => c.t !== 'comma' && c.t !== 'slash' && c.t !== 'space').length;
  const ok = fn.name === 'color-mix' ? values >= 3 : values >= 3 && values <= 4;
  return ok ? null : bad('invalid-value', `${fn.name}() has the wrong number of components`);
}

/** Validates one function against the global allow-list, with its own argument rules. */
function checkFunction(fn: Fn, allowed: ReadonlySet<string>): Failure {
  if (!allowed.has(fn.name)) {
    return bad('forbidden-function', `${fn.name === '' ? 'parentheses' : `${fn.name}()`} is not allowed here`);
  }
  if (fn.name === 'var') return checkVar(fn);
  if (MATH.has(fn.name)) return checkMath(fn);
  if (COLOR_FN.has(fn.name)) return checkColorFn(fn);
  if (GRADIENT_FN.has(fn.name)) return checkList(fn.children, POLICY_GRADIENT);
  if (TRACK_FN.has(fn.name)) return checkList(fn.children, POLICY_TRACKS);
  if (TRANSFORM_FN.has(fn.name)) return checkList(fn.children, POLICY_TRANSFORM);
  return bad('forbidden-function', `${fn.name}() is not allowed`);
}

/** Every token must be allowed by the policy. */
function checkList(list: readonly Component[], policy: Policy): Failure {
  for (const c of list) {
    switch (c.t) {
      case 'space':
        break;
      case 'comma':
        if (!policy.commas) return bad('syntax', 'unexpected ","');
        break;
      case 'slash':
        if (!policy.slash) return bad('syntax', 'unexpected "/"');
        break;
      case 'op':
        return bad('syntax', `unexpected "${c.v}"`);
      case 'ident':
        if (c.v.startsWith('--')) return bad('invalid-value', 'custom properties can only be used through var()');
        if (policy.idents !== 'any' && !policy.idents.has(c.v))
          return bad('invalid-value', `"${c.v}" is not allowed here`);
        break;
      case 'number':
        if (!policy.numbers) return bad('invalid-value', 'a number is not allowed here');
        break;
      case 'percent':
        if (!policy.percent) return bad('invalid-value', 'a percentage is not allowed here');
        break;
      case 'hash':
        if (!policy.hash) return bad('invalid-value', 'a colour is not allowed here');
        break;
      case 'dimension':
        if (!policy.units.has(c.unit)) return bad('forbidden-unit', `the unit "${c.unit}" is not allowed here`);
        break;
      case 'fn': {
        const failure = checkFunction(c, policy.fns);
        if (failure !== null) return failure;
        break;
      }
    }
  }
  return null;
}

/** Function-level checks for a whole value (every property): forbidden functions, units, var() and math. */
export function checkFunctions(list: readonly Component[]): Failure {
  for (const c of list) {
    if (c.t === 'fn') {
      const failure = checkFunction(c, ALL_FN);
      if (failure !== null) return failure;
    } else if (
      c.t === 'dimension' &&
      !LENGTH.has(c.unit) &&
      !ANGLE.has(c.unit) &&
      !TIME.has(c.unit) &&
      c.unit !== 'fr'
    ) {
      return bad('forbidden-unit', `the unit "${c.unit}" is not allowed`);
    } else if (c.t === 'op') {
      return bad('syntax', `unexpected "${c.v}"`);
    }
  }
  return null;
}

/** Value of a `--blx-*` custom property. */
export function checkCustomValue(list: readonly Component[]): Failure {
  return checkList(list, POLICY_CUSTOM);
}

// ---- property grammars ----------------------------------------------------------------------------------------------

const terms = (list: readonly Component[]): Component[] => list.filter((c) => c.t !== 'space');

function matchShadow(list: readonly Component[]): boolean {
  const items = splitCommas(terms(list));
  if (items.length > 6) return false;
  return items.every((item) => {
    let inset = 0;
    let colors = 0;
    const lengths: number[] = [];
    item.forEach((c, index) => {
      if (isIdent(c, set(['inset']))) inset += 1;
      else if (isColor(c)) colors += 1;
      else if (isLength(c, true)) lengths.push(index);
      else inset += 99;
    });
    const contiguous = lengths.every((value, i) => i === 0 || value === at(lengths, i - 1) + 1);
    return inset <= 1 && colors <= 1 && lengths.length >= 2 && lengths.length <= 4 && contiguous;
  });
}

function matchBorder(list: readonly Component[]): boolean {
  const items = terms(list);
  if (items.length < 1 || items.length > 3) return false;
  let width = 0;
  let style = 0;
  let color = 0;
  for (const c of items) {
    if (isLength(c, false) || isIdent(c, set(['thin', 'medium', 'thick']))) width += 1;
    else if (
      isIdent(c, set(['none', 'hidden', 'dotted', 'dashed', 'solid', 'double', 'groove', 'ridge', 'inset', 'outset']))
    )
      style += 1;
    else if (isColor(c)) color += 1;
    else return false;
  }
  return width <= 1 && style <= 1 && color <= 1;
}

function matchGridLine(list: readonly Component[]): boolean {
  const segments: Component[][] = [[]];
  for (const c of terms(list)) {
    if (c.t === 'slash') segments.push([]);
    else at(segments, segments.length - 1).push(c);
  }
  if (segments.length > 2) return false;
  return segments.every((seg) => {
    const [a, b] = seg;
    if (a === undefined || seg.length > 2) return false;
    if (seg.length === 1) return isIdent(a, set(['auto'])) || (isInt(a) && num(a) !== 0 && Math.abs(num(a)) <= 1000);
    return isIdent(a, set(['span'])) && b !== undefined && isInt(b) && num(b) >= 1 && num(b) <= 1000;
  });
}

function matchFlex(list: readonly Component[]): boolean {
  const items = terms(list);
  const first = items[0];
  if (first === undefined) return false;
  if (items.length === 1 && isIdent(first, set(['none', 'auto']))) return true;
  let i = 0;
  let numbers = 0;
  for (let item = items[i]; item?.t === 'number' && num(item) >= 0 && numbers < 2; item = items[i]) {
    numbers += 1;
    i += 1;
  }
  if (numbers === 0 && items.length !== 1) return false;
  if (i === items.length) return numbers > 0;
  const basis = items[i];
  return (
    items.length - i === 1 &&
    basis !== undefined &&
    (isLengthPct(basis, false) || isIdent(basis, set(['auto', 'content'])))
  );
}

function matchPosition(list: readonly Component[]): boolean {
  const items = terms(list);
  if (items.length < 1 || items.length > 4) return false;
  const words = set(['left', 'right', 'top', 'bottom', 'center']);
  return items.every((c) => isIdent(c, words) || isLengthPct(c, true));
}

function matchKind(kind: Kind, list: readonly Component[]): boolean {
  const items = terms(list);
  const only = items.length === 1 ? items[0] : undefined;
  switch (kind.k) {
    case 'keywords':
      return only !== undefined && isIdent(only, set(kind.values));
    case 'keyword-list': {
      const allowed = set(kind.values);
      const seen = new Set<string>();
      return (
        items.length >= 1 &&
        items.length <= kind.max &&
        items.every((c) => c.t === 'ident' && allowed.has(c.v) && !seen.has(c.v) && Boolean(seen.add(c.v)))
      );
    }
    case 'ident-list': {
      const allowed = set(kind.values);
      const groups = splitCommas(items);
      return (
        groups.length <= kind.max && groups.every((g) => g[0] !== undefined && g.length === 1 && isIdent(g[0], allowed))
      );
    }
    case 'length':
      return (
        only !== undefined &&
        ((isLengthPct(only, kind.neg === true) && (kind.pct === true || only.t !== 'percent')) ||
          isIdent(only, set(kind.extra ?? [])))
      );
    case 'box':
      return (
        items.length >= 1 &&
        items.length <= 4 &&
        items.every((c) => isLengthPct(c, kind.neg === true) || isIdent(c, set(kind.extra ?? [])))
      );
    case 'color':
      return only !== undefined && isColor(only);
    case 'color-list':
      return items.length >= 1 && items.length <= kind.max && items.every(isColor);
    case 'number':
      return (
        only !== undefined &&
        ((only.t === 'number' && num(only) >= kind.min && num(only) <= kind.max) ||
          (kind.pct === true && only.t === 'percent' && num(only) >= kind.min * 100 && num(only) <= kind.max * 100))
      );
    case 'integer':
      return (
        only !== undefined &&
        ((isInt(only) && num(only) >= kind.min && num(only) <= kind.max) || isIdent(only, set(kind.extra ?? [])))
      );
    case 'font-family':
      return matchFontFamily(items);
    case 'font-weight':
      return (
        only !== undefined &&
        ((only.t === 'number' && num(only) >= 1 && num(only) <= 1000) ||
          isIdent(only, set(['normal', 'bold', 'lighter', 'bolder'])))
      );
    case 'line-height':
      return (
        only !== undefined &&
        ((only.t === 'number' && num(only) >= 0) || isLengthPct(only, false) || isIdent(only, set(['normal'])))
      );
    case 'shadow':
      return (only !== undefined && isIdent(only, set(['none']))) || matchShadow(items);
    case 'border':
      return matchBorder(items);
    case 'radius':
      return items.length >= 1 && items.length <= kind.max && items.every((c) => isLengthPct(c, false));
    case 'background-size':
      return (
        (only !== undefined && isIdent(only, set(['cover', 'contain']))) ||
        (items.length >= 1 &&
          items.length <= 2 &&
          items.every((c) => isLengthPct(c, false) || isIdent(c, set(['auto']))))
      );
    case 'position':
      return matchPosition(items);
    case 'gradient': {
      if (only !== undefined && isIdent(only, set(['none']))) return true;
      const groups = splitCommas(items);
      return (
        groups.length <= 4 && groups.every((g) => g.length === 1 && g[0]?.t === 'fn' && GRADIENT_FN.has(g[0].name))
      );
    }
    case 'tracks':
      return (
        items.length >= 1 &&
        items.length <= 24 &&
        checkList(items, POLICY_TRACKS) === null &&
        items.every((c) => c.t !== 'comma' && c.t !== 'slash')
      );
    case 'transform':
      return (
        (only !== undefined && isIdent(only, set(['none']))) ||
        (items.length >= 1 && items.length <= 6 && items.every((c) => c.t === 'fn' && TRANSFORM_FN.has(c.name)))
      );
    case 'aspect-ratio': {
      const positive = (c: Component | undefined): boolean => c?.t === 'number' && num(c) > 0;
      return (
        (only !== undefined && isIdent(only, set(['auto']))) ||
        (items.length === 1 && positive(items[0])) ||
        (items.length === 3 && positive(items[0]) && items[1]?.t === 'slash' && positive(items[2]))
      );
    }
    case 'flex':
      return matchFlex(items);
    case 'grid-line':
      return matchGridLine(items);
    case 'times': {
      const groups = splitCommas(items);
      return (
        groups.length <= 4 &&
        groups.every((g) => g.length === 1 && g[0]?.t === 'dimension' && TIME.has(g[0].unit) && num(g[0]) >= 0)
      );
    }
  }
}

function matchFontFamily(items: readonly Component[]): boolean {
  const families = splitCommas(items);
  if (families.length > 8) return false;
  return families.every(
    (family) =>
      family.length >= 1 &&
      family.length <= 4 &&
      family.every(
        (c, i) => (c.t === 'ident' && !WIDE.has(c.v) && !c.v.startsWith('--')) || (i > 0 && isInt(c) && num(c) >= 0),
      ),
  );
}

/** Does `list` (already function-checked) match the property's grammar? A lone CSS-wide keyword always does. */
export function matchesProperty(kind: Kind, list: readonly Component[]): boolean {
  const items = terms(list);
  const first = items[0];
  if (items.length === 1 && first !== undefined && isIdent(first, WIDE)) return true;
  // var() may expand to anything, but only to validated --blx-* values, so the property grammar cannot be applied to it.
  if (hasVar(list)) return true;
  return matchKind(kind, list);
}
