import type { ElementNode, StyleRule } from '@blixis/wp-core';
import { at } from './at.ts';
import { DEFAULT_BREAKPOINTS, type BreakpointDef } from './breakpoints.ts';

export type Mode = 'light' | 'dark';
export type State = 'hover' | 'focus' | 'focus-visible' | 'active';
export type Origin = 'token' | 'class' | 'element';

/** States from lowest to highest precedence (ADR 0005 key component 2; no state is lowest of all). */
export const STATE_ORDER: readonly State[] = ['hover', 'focus', 'focus-visible', 'active'];

/** One rule with where it came from. Classes carry their position in the site-wide global class list (1 = lowest). */
export interface ResolveRule {
  origin: Origin;
  /** Position in the global class list; only for `class` rules. */
  classOrder?: number;
  /** The global class id, for `class` rules (reported in the source). */
  classId?: string;
  state?: State;
  mode?: Mode;
  breakpoint?: string;
  declarations: Readonly<Record<string, string | number>>;
}

/**
 * The situation a value is resolved for. `breakpoint` is the narrowest breakpoint of the viewport (all wider ones also
 * match). `mode` undefined is the mode-independent view: only rules without a mode apply (what the inspector shows when no
 * appearance override is selected).
 */
export interface ResolveContext {
  breakpoint: string;
  mode?: Mode | undefined;
  states?: readonly State[];
}

/** Which rule a value came from, for "inherited from ..." and "overridden" in the inspector. */
export interface StyleSource {
  origin: Origin;
  classId?: string;
  state?: State;
  mode?: Mode;
  breakpoint?: string;
}

export interface Resolved {
  value: string;
  source: StyleSource;
}

const ORIGIN_RANK: Record<Origin, number> = { token: 0, class: 1, element: 2 };

/** The ADR 0005 key as a tuple compared lexicographically: origin, state, layer, breakpoint rank, class order. */
function keyOf(rule: ResolveRule, rank: ReadonlyMap<string, number>): number[] {
  const layer =
    rule.mode !== undefined ? (rule.breakpoint !== undefined ? 3 : 2) : rule.breakpoint !== undefined ? 1 : 0;
  return [
    ORIGIN_RANK[rule.origin],
    rule.state === undefined ? 0 : STATE_ORDER.indexOf(rule.state) + 1,
    layer,
    rule.breakpoint === undefined ? -1 : (rank.get(rule.breakpoint) ?? -1),
    rule.classOrder ?? 0,
  ];
}

function greater(a: readonly number[], b: readonly number[]): boolean {
  for (let i = 0; i < a.length; i += 1) {
    const x = at(a, i);
    const y = at(b, i);
    if (x !== y) return x > y;
  }
  return false;
}

function matches(rule: ResolveRule, ctx: ResolveContext, rank: ReadonlyMap<string, number>): boolean {
  if (rule.mode !== undefined && rule.mode !== ctx.mode) return false;
  if (rule.breakpoint !== undefined) {
    const own = rank.get(rule.breakpoint);
    const viewport = rank.get(ctx.breakpoint);
    if (own === undefined || viewport === undefined || own > viewport) return false;
  }
  return rule.state === undefined || (ctx.states ?? []).includes(rule.state);
}

const toText = (value: string | number): string => String(value);

/**
 * The reference resolver of ADR 0005 section 1: the rule that wins `property` in `ctx`, with its source. Per property, the
 * matching rule with the highest key wins; properties a rule does not set fall through to lower rules. Source order never
 * decides. Production code uses it for the inspector and tests use it as the oracle for the compiler.
 */
export function resolveProperty(
  rules: readonly ResolveRule[],
  property: string,
  ctx: ResolveContext,
  breakpoints: readonly BreakpointDef[] = DEFAULT_BREAKPOINTS,
): Resolved | undefined {
  const rank = new Map(breakpoints.map((bp, index) => [bp.id, index] as const));
  let best: { rule: ResolveRule; key: number[]; value: string | number } | undefined;
  for (const rule of rules) {
    if (!Object.hasOwn(rule.declarations, property) || !matches(rule, ctx, rank)) continue;
    const value = rule.declarations[property];
    if (value === undefined) continue;
    const key = keyOf(rule, rank);
    if (best === undefined || greater(key, best.key)) best = { rule, key, value };
  }
  if (best === undefined) return undefined;
  const { rule, value } = best;
  const source: StyleSource = { origin: rule.origin };
  if (rule.classId !== undefined) source.classId = rule.classId;
  if (rule.state !== undefined) source.state = rule.state;
  if (rule.mode !== undefined) source.mode = rule.mode;
  if (rule.breakpoint !== undefined) source.breakpoint = rule.breakpoint;
  return { value: toText(value), source };
}

/** Every property that any rule sets, resolved for `ctx`, sorted by name. */
export function resolveStyle(
  rules: readonly ResolveRule[],
  ctx: ResolveContext,
  breakpoints: readonly BreakpointDef[] = DEFAULT_BREAKPOINTS,
): Map<string, Resolved> {
  const names = new Set<string>();
  for (const rule of rules) for (const name of Object.keys(rule.declarations)) names.add(name);
  const out = new Map<string, Resolved>();
  for (const name of [...names].sort()) {
    const resolved = resolveProperty(rules, name, ctx, breakpoints);
    if (resolved !== undefined) out.set(name, resolved);
  }
  return out;
}

/** An element's own rules plus the rules of the global classes it uses, tagged with origin and class position. */
export function rulesFor(
  element: Pick<ElementNode, 'style' | 'classIds'>,
  classes: readonly { id: string; rules: readonly StyleRule[] }[],
): ResolveRule[] {
  const out: ResolveRule[] = [];
  const position = new Map(classes.map((cls, index) => [cls.id, index + 1] as const));
  for (const id of element.classIds ?? []) {
    const order = position.get(id);
    const cls = classes[(order ?? 0) - 1];
    if (order === undefined || cls === undefined) continue;
    for (const rule of cls.rules) out.push({ ...ruleParts(rule), origin: 'class', classOrder: order, classId: id });
  }
  for (const rule of element.style ?? []) out.push({ ...ruleParts(rule), origin: 'element' });
  return out;
}

function ruleParts(rule: StyleRule): Pick<ResolveRule, 'state' | 'mode' | 'breakpoint' | 'declarations'> {
  return {
    ...(rule.state === undefined ? {} : { state: rule.state }),
    ...(rule.mode === undefined ? {} : { mode: rule.mode }),
    ...(rule.breakpoint === undefined ? {} : { breakpoint: rule.breakpoint }),
    declarations: rule.declarations,
  };
}

/** The place an inspector edit lands: a rule for this combination of breakpoint, mode and state on the element. */
export interface EditTarget {
  breakpoint?: string;
  mode?: Mode;
  state?: State;
}

export interface Inspected {
  /** `undefined` when nothing sets the property. */
  resolved: Resolved | undefined;
  /**
   * `true` when the element has its own rule exactly at the edit target ("overridden"), `false` when the value is inherited
   * from a wider breakpoint, the mode-independent value, another state, a class or a token ("inherited from `source`").
   */
  overridden: boolean;
}

/**
 * What the inspector shows for `property` when the author edits `target`: the value that applies there (the target
 * breakpoint, the target mode or none, and only the target state) and whether the element overrides it at that very place.
 * Resetting an override deletes the rule's declaration, so the value falls back to the inherited one.
 */
export function inspectProperty(
  rules: readonly ResolveRule[],
  property: string,
  target: EditTarget,
  breakpoints: readonly BreakpointDef[] = DEFAULT_BREAKPOINTS,
): Inspected {
  const resolved = resolveProperty(
    rules,
    property,
    {
      breakpoint: target.breakpoint ?? 'base',
      mode: target.mode,
      states: target.state === undefined ? [] : [target.state],
    },
    breakpoints,
  );
  const own =
    resolved?.source.origin === 'element' &&
    resolved.source.breakpoint === target.breakpoint &&
    resolved.source.mode === target.mode &&
    resolved.source.state === target.state;
  return { resolved, overridden: own };
}

/**
 * Two rules of the same owner with the same origin, class, state, mode and breakpoint are a validation error (ADR 0005).
 * Returns the index of the first repeated rule, or -1.
 */
export function findDuplicateRule(rules: readonly ResolveRule[]): number {
  const seen = new Set<string>();
  for (const [index, rule] of rules.entries()) {
    const identity = [
      rule.origin,
      rule.classOrder ?? '-',
      rule.state ?? '-',
      rule.mode ?? '-',
      rule.breakpoint ?? '-',
    ].join('|');
    if (seen.has(identity)) return index;
    seen.add(identity);
  }
  return -1;
}
