import type { BuilderDocument, ElementNode, StyleRule } from '@blixis/wp-core';
import { at } from './at.ts';
import { shortHash } from './hash.ts';
import { sanitizeDeclarations, validateDeclaration } from './validate.ts';

/** Bump when the emitted CSS changes for the same inputs (ADR 0005, Rollback). */
export const COMPILER_VERSION = 1;

type Mode = 'light' | 'dark';
type State = 'hover' | 'focus' | 'focus-visible' | 'active';

export interface BreakpointDef {
  id: string;
  /** `null` for the base (widest) breakpoint; a `max-width` in CSS pixels for the others. */
  maxWidth: number | null;
}

/** ADR 0005: base, `tablet` up to 1024px, `mobile` up to 640px. Widest first; the order is fixed, the widths are configurable. */
export const DEFAULT_BREAKPOINTS: readonly BreakpointDef[] = [
  { id: 'base', maxWidth: null },
  { id: 'tablet', maxWidth: 1024 },
  { id: 'mobile', maxWidth: 640 },
];

/** A site-wide global class. Its position in the list decides precedence between classes (later wins), not `classIds` order. */
export interface GlobalClass {
  id: string;
  rules: readonly StyleRule[];
}

/** A design token value: a `--blx-*` custom property, optionally for one appearance mode only. */
export interface TokenValue {
  name: string;
  value: string | number;
  mode?: Mode;
}

export interface CompileInput {
  document: BuilderDocument;
  /** Every global class the document may reference, in precedence order (first = lowest). Passed by value. */
  classes?: readonly GlobalClass[];
  tokens?: readonly TokenValue[];
  breakpoints?: readonly BreakpointDef[];
}

export interface CompileOptions {
  /** Replaces the stable hash (tests only). */
  hash?: (text: string) => string;
}

export type CompileIssueCode =
  | 'invalid-breakpoints'
  | 'invalid-declaration'
  | 'unknown-breakpoint'
  | 'duplicate-rule'
  | 'unknown-class'
  | 'duplicate-class'
  | 'duplicate-token'
  | 'hash-collision';

export interface CompileIssue {
  code: CompileIssueCode;
  path: string;
  message: string;
}

export interface CompileResult {
  css: string;
  /** Element id -> class names to put on its element (its own `blx-<hash>` when it has rules, then its global classes). */
  classNames: Map<string, string[]>;
  issues: CompileIssue[];
}

// ---- layers ---------------------------------------------------------------------------------------------------------

const STATE_LAYERS = ['s0', 'hover', 'focus', 'focus-visible', 'active'] as const;
const KIND_LAYERS = ['base', 'bp', 'mode', 'modebp'] as const;
const ORIGIN_LAYERS = ['class', 'el'] as const;

/** The declared `@layer` order (ADR 0005 section 3): theme, tokens, then origin x state x layer kind. Index = precedence. */
export const LAYER_ORDER: readonly string[] = [
  'blx.theme',
  'blx.tokens',
  ...ORIGIN_LAYERS.flatMap((origin) =>
    STATE_LAYERS.flatMap((state) => KIND_LAYERS.map((kind) => `blx.${origin}.${state}.${kind}`)),
  ),
];

const layerIndex = (
  origin: (typeof ORIGIN_LAYERS)[number],
  state: State | undefined,
  mode: boolean,
  bp: boolean,
): number => {
  const s = state === undefined ? 0 : STATE_LAYERS.indexOf(state);
  const k = mode ? (bp ? 3 : 2) : bp ? 1 : 0;
  return 2 + ORIGIN_LAYERS.indexOf(origin) * 20 + s * 4 + k;
};

// ---- selectors ------------------------------------------------------------------------------------------------------

const explicitScope = (mode: Mode): string => `:where(html[data-theme="${mode}"])`;
const AUTO_SCOPE = ':where(html:not([data-theme="light"]):not([data-theme="dark"]))';
const AUTO_QUERY: Record<Mode, string> = {
  dark: '(prefers-color-scheme:dark)',
  light: 'not all and (prefers-color-scheme:dark)',
};
const stateSuffix = (state: State | undefined): string => (state === undefined ? '' : `:where(:${state})`);

// ---- declarations ---------------------------------------------------------------------------------------------------

/**
 * Custom properties first, then shorthands before longhands (fewer name parts first), then by name, so that a longhand
 * always follows the shorthand that contains it (`border` < `border-top` < `border-top-width`).
 */
function declarationText(declarations: Readonly<Record<string, string>>): string {
  const rank = (name: string): number => (name.startsWith('--') ? 0 : name.split('-').length);
  return Object.keys(declarations)
    .sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0))
    .map((name) => `${name}:${declarations[name] ?? ''}`)
    .join(';');
}

interface Group {
  layer: number;
  bp: number;
  order: number;
  mode: Mode | undefined;
  state: State | undefined;
  breakpoint: BreakpointDef | undefined;
  decls: string;
  names: Set<string>;
}

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function validBreakpoints(list: readonly BreakpointDef[]): string | null {
  const first = list[0];
  if (first?.id !== 'base' || first.maxWidth !== null) return 'the first breakpoint must be base without a width';
  const seen = new Set<string>(['base']);
  let previous = Number.POSITIVE_INFINITY;
  for (const bp of list.slice(1)) {
    if (!/^[a-z][a-z0-9-]{0,31}$/.test(bp.id) || seen.has(bp.id)) return `invalid or repeated breakpoint id "${bp.id}"`;
    seen.add(bp.id);
    const width = bp.maxWidth;
    if (width === null || !Number.isSafeInteger(width) || width < 1 || width > 10_000 || width >= previous) {
      return `breakpoint "${bp.id}" needs an integer max-width below the previous one`;
    }
    previous = width;
  }
  return null;
}

/**
 * Compiles a document, its global classes and design tokens into one deterministic stylesheet (ADR 0005 section 3).
 *
 * - Every selector has specificity (0,1,0): appearance and state conditions sit in `:where()`; precedence comes only from
 *   the declared `@layer` order and emission order inside a layer, never from source order of elements.
 * - Declarations are sanitized (`sanitizeDeclarations`); invalid ones are dropped and reported, never emitted.
 * - Elements with identical rules share one rule block; blocks and selectors are sorted, so the same inputs give
 *   byte-identical output wherever the elements sit in the document.
 *
 * Nothing throws. `classNames` tells the renderer which classes each element needs.
 */
export function compile(input: CompileInput, options: CompileOptions = {}): CompileResult {
  const hash = options.hash ?? shortHash;
  const issues: CompileIssue[] = [];
  const classNames = new Map<string, string[]>();
  const issue = (code: CompileIssueCode, path: string, message: string): void => {
    issues.push({ code, path, message });
  };

  const breakpoints = input.breakpoints ?? DEFAULT_BREAKPOINTS;
  const invalid = validBreakpoints(breakpoints);
  if (invalid !== null) {
    issue('invalid-breakpoints', 'breakpoints', invalid);
    return { css: '', classNames, issues };
  }
  const rankOf = new Map(breakpoints.map((bp, index) => [bp.id, index] as const));

  const groups = new Map<string, Group>();
  const add = (
    origin: (typeof ORIGIN_LAYERS)[number],
    name: string,
    order: number,
    rule: StyleRule,
    decls: string,
  ): void => {
    const breakpoint = rule.breakpoint === undefined ? undefined : breakpoints.find((bp) => bp.id === rule.breakpoint);
    const layer = layerIndex(origin, rule.state, rule.mode !== undefined, breakpoint !== undefined);
    const bp = breakpoint === undefined ? 0 : (rankOf.get(breakpoint.id) ?? 0);
    const key = [layer, bp, order, rule.mode ?? '-', decls].join('\u0000');
    let group = groups.get(key);
    if (group === undefined) {
      group = { layer, bp, order, mode: rule.mode, state: rule.state, breakpoint, decls, names: new Set() };
      groups.set(key, group);
    }
    group.names.add(name);
  };

  /** Validates one owner's rules (an element or a class) and returns those that can be emitted. */
  const usable = (rules: readonly StyleRule[], path: string): { rule: StyleRule; decls: string }[] => {
    const seen = new Set<string>();
    const out: { rule: StyleRule; decls: string }[] = [];
    rules.forEach((rule, index) => {
      const where = `${path}.style[${String(index)}]`;
      if (rule.breakpoint !== undefined && !rankOf.has(rule.breakpoint)) {
        issue(
          'unknown-breakpoint',
          `${where}.breakpoint`,
          `"${rule.breakpoint}" is not a registered breakpoint (or is base)`,
        );
        return;
      }
      if (rule.breakpoint === 'base') {
        issue('unknown-breakpoint', `${where}.breakpoint`, 'base is expressed by leaving the breakpoint out');
        return;
      }
      const identity = `${rule.state ?? '-'}|${rule.mode ?? '-'}|${rule.breakpoint ?? '-'}`;
      if (seen.has(identity)) {
        issue('duplicate-rule', where, 'two rules with the same state, mode and breakpoint; the first one is used');
        return;
      }
      seen.add(identity);
      const clean = sanitizeDeclarations(rule.declarations);
      for (const problem of clean.issues) {
        issue('invalid-declaration', `${where}.declarations.${problem.name}`, `${problem.code}: ${problem.message}`);
      }
      const decls = declarationText(clean.declarations);
      if (decls !== '') out.push({ rule, decls });
    });
    return out;
  };

  // Global classes: validated once, emitted only when an element uses them.
  const classInfo = new Map<string, { name: string; order: number; rules: { rule: StyleRule; decls: string }[] }>();
  (input.classes ?? []).forEach((cls, index) => {
    if (classInfo.has(cls.id)) {
      issue(
        'duplicate-class',
        `classes[${String(index)}]`,
        `the class ${cls.id} is defined twice; the first definition is used`,
      );
      return;
    }
    classInfo.set(cls.id, {
      name: `blx-c-${hash(cls.id)}`,
      order: index + 1,
      rules: usable(cls.rules, `classes[${String(index)}]`),
    });
  });
  const usedClasses = new Set<string>();

  // Elements, in document order (iterative).
  const owners = new Map<string, string>();
  const stack: { node: ElementNode; path: string }[] = [];
  for (let i = input.document.root.length - 1; i >= 0; i -= 1) {
    stack.push({ node: at(input.document.root, i), path: `$.root[${String(i)}]` });
  }
  while (stack.length > 0) {
    const { node, path } = at(stack, stack.length - 1);
    stack.pop();
    const names: string[] = [];
    const own = usable(node.style ?? [], path);
    if (own.length > 0) {
      const name = `blx-${hash(`${input.document.documentId}:${node.id}`)}`;
      const owner = owners.get(name);
      if (owner !== undefined && owner !== node.id) {
        issue('hash-collision', path, `the class name ${name} is already used by ${owner}; this element is not styled`);
      } else {
        owners.set(name, node.id);
        names.push(name);
        for (const { rule, decls } of own) add('el', name, 0, rule, decls);
      }
    }
    (node.classIds ?? []).forEach((id, index) => {
      const info = classInfo.get(id);
      if (info === undefined) {
        issue('unknown-class', `${path}.classIds[${String(index)}]`, `the class ${id} is not defined`);
        return;
      }
      if (!names.includes(info.name)) names.push(info.name);
      if (!usedClasses.has(id)) {
        usedClasses.add(id);
        for (const { rule, decls } of info.rules) add('class', info.name, info.order, rule, decls);
      }
    });
    if (names.length > 0) classNames.set(node.id, names);
    for (let i = node.children.length - 1; i >= 0; i -= 1) {
      stack.push({ node: at(node.children, i), path: `${path}.children[${String(i)}]` });
    }
  }

  const blocks = new Map<number, string[]>();
  const ordered = [...groups.values()].sort(
    (a, b) =>
      a.layer - b.layer ||
      a.bp - b.bp ||
      a.order - b.order ||
      compare(a.mode ?? '', b.mode ?? '') ||
      compare(a.decls, b.decls),
  );
  for (const g of ordered) {
    const names = [...g.names].sort(compare);
    const select = (scope: string): string =>
      names.map((n) => `${scope === '' ? '' : `${scope} `}.${n}${stateSuffix(g.state)}`).join(',');
    const wrap = (css: string): string =>
      g.breakpoint?.maxWidth === undefined || g.breakpoint.maxWidth === null
        ? css
        : `@media (max-width:${String(g.breakpoint.maxWidth)}px){${css}}`;
    const body = `{${g.decls}}`;
    const css =
      g.mode === undefined
        ? wrap(`${select('')}${body}`)
        : `${wrap(`${select(explicitScope(g.mode))}${body}`)}@media ${AUTO_QUERY[g.mode]}{${wrap(`${select(AUTO_SCOPE)}${body}`)}}`;
    const list = blocks.get(g.layer) ?? [];
    list.push(css);
    blocks.set(g.layer, list);
  }

  const tokenCss = compileTokens(input.tokens ?? [], issue);
  if (tokenCss !== '') blocks.set(1, [tokenCss]);

  const parts = [`/*blx-css:${String(COMPILER_VERSION)}*/`, `@layer ${LAYER_ORDER.join(',')};`];
  for (const index of [...blocks.keys()].sort((a, b) => a - b)) {
    parts.push(`@layer ${at(LAYER_ORDER, index)}{${(blocks.get(index) ?? []).join('')}}`);
  }
  return { css: `${parts.join('\n')}\n`, classNames, issues };
}

/** Tokens: custom properties on the root, base values first, then light and dark overrides (and their `auto` media forms). */
function compileTokens(
  tokens: readonly TokenValue[],
  issue: (code: CompileIssueCode, path: string, message: string) => void,
): string {
  const byMode = new Map<Mode | 'base', Record<string, string>>();
  const seen = new Set<string>();
  tokens.forEach((token, index) => {
    const result = validateDeclaration(token.name, token.value);
    const path = `tokens[${String(index)}]`;
    if (!result.ok || !token.name.startsWith('--')) {
      issue(
        'invalid-declaration',
        path,
        result.ok ? 'tokens must be --blx-* custom properties' : `${result.code}: ${result.message}`,
      );
      return;
    }
    const mode = token.mode ?? 'base';
    const identity = `${mode}|${token.name}`;
    if (seen.has(identity)) {
      issue('duplicate-token', path, `${token.name} is set twice for ${mode}; the first value is used`);
      return;
    }
    seen.add(identity);
    const values = byMode.get(mode) ?? {};
    Object.defineProperty(values, token.name, {
      value: result.value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
    byMode.set(mode, values);
  });
  let css = '';
  const base = byMode.get('base');
  if (base !== undefined) css += `:where(:root){${declarationText(base)}}`;
  for (const mode of ['light', 'dark'] as const) {
    const values = byMode.get(mode);
    if (values === undefined) continue;
    const body = `{${declarationText(values)}}`;
    css += `${explicitScope(mode)}${body}@media ${AUTO_QUERY[mode]}{${AUTO_SCOPE}${body}}`;
  }
  return css;
}
