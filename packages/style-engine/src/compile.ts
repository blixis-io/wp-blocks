import type { BuilderDocument, ElementNode, StyleRule } from '@blixis/wp-core';
import { at } from './at.ts';
import { DEFAULT_BREAKPOINTS, validateBreakpoints, type BreakpointDef } from './breakpoints.ts';
import { shortHash } from './hash.ts';
import { sanitizeDeclarations, validateDeclaration } from './validate.ts';

/** Bump when the emitted CSS changes for the same inputs (ADR 0005, Rollback). */
export const COMPILER_VERSION = 1;

type Mode = 'light' | 'dark';
type State = 'hover' | 'focus' | 'focus-visible' | 'active';

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
  category?: string;
}

export interface CompileInput {
  document: BuilderDocument;
  /** Every global class the document may reference, in precedence order (first = lowest). Passed by value. */
  classes?: readonly GlobalClass[];
  tokens?: readonly TokenValue[];
  breakpoints?: readonly BreakpointDef[];
}

/**
 * Bounds on the inputs that the document limits do not cover. Callers pass registries that were validated when saved; the
 * compiler still refuses to do unbounded work for the extras and reports them.
 */
export const COMPILE_LIMITS = { maxClasses: 1000, maxTokens: 1000, maxRulesPerOwner: 256 } as const;

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
  | 'duplicate-class-reference'
  | 'invalid-identifier'
  | 'too-many-classes'
  | 'too-many-rules'
  | 'too-many-tokens'
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
  'blx.marks',
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
  return 3 + ORIGIN_LAYERS.indexOf(origin) * 20 + s * 4 + k;
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
 * Position of a property among the ones that overlap it: a declaration that covers more comes first, so the narrower one
 * wins. Custom properties come first. Border properties are ranked explicitly (`border` < `border-width|style|color` <
 * `border-top|right|bottom|left` < `border-top-width|...`), because their hyphen counts do not follow how much they cover;
 * everything else is ranked by the number of name parts (`margin` < `margin-top`, `flex` < `flex-basis`, `gap` < `row-gap`).
 */
function overlapRank(name: string): number {
  if (name.startsWith('--')) return 0;
  if (name === 'border') return 10;
  if (name === 'border-width' || name === 'border-style' || name === 'border-color') return 20;
  if (/^border-(?:top|right|bottom|left)$/.test(name)) return 30;
  if (/^border-(?:top|right|bottom|left)-(?:width|style|color)$/.test(name)) return 40;
  return name.split('-').length * 100;
}

function declarationText(declarations: Readonly<Record<string, string>>): string {
  return Object.keys(declarations)
    .sort((a, b) => overlapRank(a) - overlapRank(b) || (a < b ? -1 : a > b ? 1 : 0))
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
  // Hashing refuses non-ASCII text; compile reports it instead of throwing.
  const safeHash = (text: string): string | null => {
    try {
      return hash(text);
    } catch {
      return null;
    }
  };
  const issues: CompileIssue[] = [];
  const classNames = new Map<string, string[]>();
  const issue = (code: CompileIssueCode, path: string, message: string): void => {
    issues.push({ code, path, message });
  };

  const breakpoints = input.breakpoints ?? DEFAULT_BREAKPOINTS;
  const invalid = validateBreakpoints(breakpoints);
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
  const usable = (all: readonly StyleRule[], path: string, field: string): { rule: StyleRule; decls: string }[] => {
    const seen = new Set<string>();
    const out: { rule: StyleRule; decls: string }[] = [];
    if (all.length > COMPILE_LIMITS.maxRulesPerOwner) {
      issue('too-many-rules', path, `more than ${String(COMPILE_LIMITS.maxRulesPerOwner)} rules; the rest are ignored`);
    }
    const rules = all.slice(0, COMPILE_LIMITS.maxRulesPerOwner);
    rules.forEach((rule, index) => {
      const where = `${path}.${field}[${String(index)}]`;
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
      const clean = sanitizeDeclarations(rule.declarations);
      for (const problem of clean.issues) {
        issue('invalid-declaration', `${where}.declarations.${problem.name}`, `${problem.code}: ${problem.message}`);
      }
      const decls = declarationText(clean.declarations);
      if (decls === '') return;
      // The first rule that has something to emit owns its (state, mode, breakpoint) combination.
      const identity = `${rule.state ?? '-'}|${rule.mode ?? '-'}|${rule.breakpoint ?? '-'}`;
      if (seen.has(identity)) {
        issue('duplicate-rule', where, 'two rules with the same state, mode and breakpoint; the first one is used');
        return;
      }
      seen.add(identity);
      out.push({ rule, decls });
    });
    return out;
  };

  // Global classes: validated once, emitted only when an element uses them.
  const classInfo = new Map<string, { name: string; order: number; rules: { rule: StyleRule; decls: string }[] }>();
  const classNameOwners = new Map<string, string>();
  const allClasses = input.classes ?? [];
  if (allClasses.length > COMPILE_LIMITS.maxClasses) {
    issue(
      'too-many-classes',
      'classes',
      `more than ${String(COMPILE_LIMITS.maxClasses)} classes; the rest are ignored`,
    );
  }
  allClasses.slice(0, COMPILE_LIMITS.maxClasses).forEach((cls, index) => {
    if (classInfo.has(cls.id)) {
      issue(
        'duplicate-class',
        `classes[${String(index)}]`,
        `the class ${cls.id} is defined twice; the first definition is used`,
      );
      return;
    }
    const digest = safeHash(cls.id);
    if (digest === null) {
      issue('invalid-identifier', `classes[${String(index)}].id`, 'class ids must be ASCII');
      return;
    }
    const name = `blx-c-${digest}`;
    const other = classNameOwners.get(name);
    if (other !== undefined) {
      issue(
        'hash-collision',
        `classes[${String(index)}]`,
        `the class name ${name} is already used by ${other}; this class is ignored`,
      );
      return;
    }
    classNameOwners.set(name, cls.id);
    classInfo.set(cls.id, { name, order: index + 1, rules: usable(cls.rules, `classes[${String(index)}]`, 'rules') });
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
    const own = usable(node.style ?? [], path, 'style');
    const digest = own.length > 0 ? safeHash(`${input.document.documentId}:${node.id}`) : '';
    if (digest === null) issue('invalid-identifier', path, 'document and element ids must be ASCII');
    else if (own.length > 0) {
      const name = `blx-${digest}`;
      const owner = owners.get(name);
      if (owner !== undefined && owner !== node.id) {
        issue('hash-collision', path, `the class name ${name} is already used by ${owner}; this element is not styled`);
      } else {
        owners.set(name, node.id);
        names.push(name);
        for (const { rule, decls } of own) add('el', name, 0, rule, decls);
      }
    }
    const referenced = new Set<string>();
    (node.classIds ?? []).forEach((id, index) => {
      if (referenced.has(id)) {
        issue('duplicate-class-reference', `${path}.classIds[${String(index)}]`, `the class ${id} is listed twice`);
        return;
      }
      referenced.add(id);
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
  const markCss = compileMarkCss(input.tokens ?? []);
  if (markCss !== '') blocks.set(2, [markCss]);

  const parts = [`/*blx-css:${String(COMPILER_VERSION)}*/`, `@layer ${LAYER_ORDER.join(',')};`];
  for (const index of [...blocks.keys()].sort((a, b) => a - b)) {
    parts.push(`@layer ${at(LAYER_ORDER, index)}{${(blocks.get(index) ?? []).join('')}}`);
  }
  return { css: `${parts.join('\n')}\n`, classNames, issues };
}

/** Fixed mark utility classes reference active design tokens and follow the token layer's color mode values. */
function compileMarkCss(tokens: readonly TokenValue[]): string {
  const ids = [
    ...new Set(
      tokens
        .filter(
          (token) =>
            token.category === 'color' &&
            /^--blx-[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(token.name) &&
            validateDeclaration(token.name, token.value).ok,
        )
        .map((token) => token.name.slice(6)),
    ),
  ].sort(compare);
  const rules = ids.flatMap((id) => [
    `.blx-mc-${id}{color:var(--blx-${id})}`,
    `.blx-mh-${id}{background-color:var(--blx-${id})}`,
  ]);
  rules.push('.blx-mw-normal{font-weight:400}', '.blx-mw-medium{font-weight:500}', '.blx-mw-bold{font-weight:700}');
  return rules.join('');
}

/** Tokens: custom properties on the root, base values first, then light and dark overrides (and their `auto` media forms). */
function compileTokens(
  allTokens: readonly TokenValue[],
  issue: (code: CompileIssueCode, path: string, message: string) => void,
): string {
  if (allTokens.length > COMPILE_LIMITS.maxTokens) {
    issue('too-many-tokens', 'tokens', `more than ${String(COMPILE_LIMITS.maxTokens)} tokens; the rest are ignored`);
  }
  const tokens = allTokens.slice(0, COMPILE_LIMITS.maxTokens);
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
