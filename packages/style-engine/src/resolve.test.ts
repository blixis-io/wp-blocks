import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { breakpointsMatching, DEFAULT_BREAKPOINTS, validateBreakpoints, viewportBreakpoint } from './breakpoints.ts';
import {
  findDuplicateRule,
  inspectProperty,
  resolveProperty,
  resolveStyle,
  rulesFor,
  STATE_ORDER,
  type Mode,
  type ResolveRule,
  type State,
} from './resolve.ts';

const here = dirname(fileURLToPath(import.meta.url));
interface FixtureRule {
  origin: 'token' | 'class' | 'element';
  value: string;
  mode?: Mode;
  breakpoint?: string;
  state?: ResolveRule['state'];
  classOrder?: number;
}
interface Fixture {
  breakpoints: string[];
  viewports: Record<string, string[]>;
  cases: {
    id: string;
    rules: FixtureRule[];
    expect: { mode: Mode; viewport: string; states?: State[]; value: string | null }[];
  }[];
  invalid: { id: string; rules: FixtureRule[]; error: string }[];
}
const fixtures = JSON.parse(
  readFileSync(join(here, '..', '..', '..', 'tests', 'fixtures', 'style-resolution', 'cases.json'), 'utf8'),
) as Fixture;

const toRule = (r: FixtureRule): ResolveRule => ({
  origin: r.origin,
  ...(r.classOrder === undefined ? {} : { classOrder: r.classOrder }),
  ...(r.state === undefined ? {} : { state: r.state }),
  ...(r.mode === undefined ? {} : { mode: r.mode }),
  ...(r.breakpoint === undefined ? {} : { breakpoint: r.breakpoint }),
  declarations: { color: r.value },
});
/** The viewport names of the fixtures are the narrowest breakpoint they reach. */
const narrowest = (viewport: string): string => fixtures.viewports[viewport]?.at(-1) ?? 'base';

describe('breakpoints', () => {
  it('matches a width against nested max-width conditions, widest first', () => {
    expect(breakpointsMatching(DEFAULT_BREAKPOINTS, 1440)).toEqual(['base']);
    expect(breakpointsMatching(DEFAULT_BREAKPOINTS, 1024)).toEqual(['base', 'tablet']);
    expect(breakpointsMatching(DEFAULT_BREAKPOINTS, 641)).toEqual(['base', 'tablet']);
    expect(breakpointsMatching(DEFAULT_BREAKPOINTS, 640)).toEqual(['base', 'tablet', 'mobile']);
    expect(viewportBreakpoint(DEFAULT_BREAKPOINTS, 400)).toBe('mobile');
    expect(viewportBreakpoint(DEFAULT_BREAKPOINTS, 900)).toBe('tablet');
    expect(viewportBreakpoint(DEFAULT_BREAKPOINTS, 5000)).toBe('base');
  });

  it('validates registries: base first, unique ids, strictly decreasing integer widths', () => {
    expect(validateBreakpoints(DEFAULT_BREAKPOINTS)).toBeNull();
    expect(validateBreakpoints([{ id: 'base', maxWidth: null }])).toBeNull();
    for (const bad of [
      [],
      [{ id: 'tablet', maxWidth: 900 }],
      [{ id: 'base', maxWidth: 1200 }],
      [
        { id: 'base', maxWidth: null },
        { id: 'base', maxWidth: 500 },
      ],
      [
        { id: 'base', maxWidth: null },
        { id: 'a', maxWidth: 600 },
        { id: 'b', maxWidth: 600 },
      ],
      [
        { id: 'base', maxWidth: null },
        { id: 'a', maxWidth: 600.5 },
      ],
      [
        { id: 'base', maxWidth: null },
        { id: 'a', maxWidth: null },
      ],
      [
        { id: 'base', maxWidth: null },
        { id: 'a', maxWidth: 10_001 },
      ],
      [
        { id: 'base', maxWidth: null },
        { id: 'A b', maxWidth: 500 },
      ],
    ]) {
      expect(validateBreakpoints(bad)).not.toBeNull();
    }
  });

  it('keeps the state order of ADR 0005', () => {
    expect(STATE_ORDER).toEqual(['hover', 'focus', 'focus-visible', 'active']);
  });
});

describe('resolveProperty: the ADR 0005 fixtures (all of them, including token origins)', () => {
  for (const c of fixtures.cases) {
    it(c.id, () => {
      const rules = c.rules.map(toRule);
      for (const e of c.expect) {
        const got = resolveProperty(rules, 'color', {
          breakpoint: narrowest(e.viewport),
          mode: e.mode,
          states: e.states ?? [],
        });
        expect([e.mode, e.viewport, got?.value ?? null]).toEqual([e.mode, e.viewport, e.value]);
      }
    });
  }

  it('flags the documented invalid combinations', () => {
    expect(fixtures.invalid.length).toBeGreaterThan(0);
    for (const c of fixtures.invalid) expect(findDuplicateRule(c.rules.map(toRule)), c.id).toBeGreaterThanOrEqual(0);
    expect(findDuplicateRule(fixtures.cases.flatMap((c) => [c.rules.map(toRule)]).at(0) ?? [])).toBe(-1);
  });
});

describe('resolveProperty: behaviour', () => {
  const rule = (over: Partial<ResolveRule>, value: string | number): ResolveRule => ({
    origin: 'element',
    declarations: { width: value },
    ...over,
  });

  it('lets a property fall through to lower rules when the winner does not set it', () => {
    const rules: ResolveRule[] = [
      { origin: 'element', declarations: { color: 'red', width: '10px' } },
      { origin: 'element', breakpoint: 'mobile', declarations: { color: 'blue' } },
    ];
    const style = resolveStyle(rules, { breakpoint: 'mobile' });
    expect([...style.keys()]).toEqual(['color', 'width']);
    expect(style.get('color')).toEqual({ value: 'blue', source: { origin: 'element', breakpoint: 'mobile' } });
    expect(style.get('width')).toEqual({ value: '10px', source: { origin: 'element' } });
  });

  it('is independent of rule order and treats numbers as text', () => {
    const a = rule({}, 5);
    const b = rule({ breakpoint: 'mobile' }, 7);
    expect(resolveProperty([a, b], 'width', { breakpoint: 'mobile' })?.value).toBe('7');
    expect(resolveProperty([b, a], 'width', { breakpoint: 'mobile' })?.value).toBe('7');
    expect(resolveProperty([a, b], 'width', { breakpoint: 'tablet' })?.value).toBe('5');
  });

  it('applies rules of unknown breakpoints to nothing and ignores prototype-named properties', () => {
    const rules: ResolveRule[] = [{ origin: 'element', breakpoint: 'watch', declarations: { width: '1px' } }];
    expect(resolveProperty(rules, 'width', { breakpoint: 'mobile' })).toBeUndefined();
    expect(resolveProperty(rules, 'width', { breakpoint: 'watch' })).toBeUndefined();
    expect(
      resolveProperty([{ origin: 'element', declarations: {} }], 'constructor', { breakpoint: 'base' }),
    ).toBeUndefined();
  });

  it('honours a custom breakpoint registry', () => {
    const registry = [
      { id: 'base', maxWidth: null },
      { id: 'wide', maxWidth: 1600 },
      { id: 'small', maxWidth: 500 },
    ];
    const rules: ResolveRule[] = [
      { origin: 'element', breakpoint: 'wide', declarations: { width: '1px' } },
      { origin: 'element', breakpoint: 'small', declarations: { width: '2px' } },
    ];
    expect(resolveProperty(rules, 'width', { breakpoint: 'wide' }, registry)?.value).toBe('1px');
    expect(resolveProperty(rules, 'width', { breakpoint: 'small' }, registry)?.value).toBe('2px');
  });

  it('seeded random rule sets: the winner never depends on rule order', () => {
    let seed = 7;
    const next = (): number => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const pick = <T>(list: readonly T[]): T => list[Math.floor(next() * list.length)] as T;
    for (let n = 0; n < 500; n += 1) {
      const seen = new Set<string>();
      const rules: ResolveRule[] = [];
      for (let i = 0; i < 1 + Math.floor(next() * 8); i += 1) {
        const origin = pick(['token', 'class', 'element'] as const);
        const r: ResolveRule = { origin, declarations: { width: `${String(i)}px` } };
        if (origin === 'class') r.classOrder = 1 + Math.floor(next() * 3);
        if (next() < 0.4) r.state = pick(STATE_ORDER);
        if (next() < 0.5) r.mode = pick(['light', 'dark'] as const);
        if (next() < 0.5) r.breakpoint = pick(['tablet', 'mobile']);
        const identity = [r.origin, r.classOrder, r.state, r.mode, r.breakpoint].join('|');
        if (seen.has(identity)) continue;
        seen.add(identity);
        rules.push(r);
      }
      const ctx = {
        breakpoint: pick(['base', 'tablet', 'mobile']),
        mode: pick(['light', 'dark', undefined] as const),
        states: STATE_ORDER.filter(() => next() < 0.3),
      };
      const forward = resolveProperty(rules, 'width', ctx)?.value;
      expect(resolveProperty([...rules].reverse(), 'width', ctx)?.value).toBe(forward);
    }
  });
});

describe('inspectProperty (inheritance for the inspector)', () => {
  const element = {
    style: [
      { declarations: { color: 'black' } },
      { breakpoint: 'mobile', declarations: { color: 'gray' } },
      { mode: 'dark' as const, declarations: { color: 'white' } },
      { mode: 'dark' as const, breakpoint: 'mobile', declarations: { color: 'lightgray' } },
    ],
  };
  const rules = rulesFor(element, []);

  it('reports the owner example per edit target, with source and whether it is overridden', () => {
    const at = (t: Parameters<typeof inspectProperty>[2]) => inspectProperty(rules, 'color', t);
    expect(at({})).toMatchObject({ overridden: true, resolved: { value: 'black' } });
    expect(at({ breakpoint: 'tablet' })).toMatchObject({
      overridden: false,
      resolved: { value: 'black', source: { origin: 'element' } },
    });
    expect(at({ breakpoint: 'mobile' })).toMatchObject({ overridden: true, resolved: { value: 'gray' } });
    expect(at({ mode: 'dark', breakpoint: 'tablet' })).toMatchObject({
      overridden: false,
      resolved: { value: 'white', source: { mode: 'dark' } },
    });
    expect(at({ mode: 'dark', breakpoint: 'mobile' })).toMatchObject({
      overridden: true,
      resolved: { value: 'lightgray' },
    });
    expect(at({ mode: 'dark' })).toMatchObject({ overridden: true, resolved: { value: 'white' } });
    expect(at({ state: 'hover' })).toMatchObject({ overridden: false, resolved: { value: 'black' } });
  });

  it('shows class and missing values, and a reset falls back to the inherited value', () => {
    const classes = [{ id: 'cls-001', rules: [{ declarations: { color: 'red', width: '1px' } }] }];
    const all = rulesFor(
      { classIds: ['cls-001'], style: [{ breakpoint: 'mobile', declarations: { color: 'blue' } }] },
      classes,
    );
    expect(inspectProperty(all, 'width', { breakpoint: 'mobile' })).toMatchObject({
      overridden: false,
      resolved: { value: '1px', source: { origin: 'class', classId: 'cls-001' } },
    });
    expect(inspectProperty(all, 'margin', {})).toEqual({ resolved: undefined, overridden: false });
    const reset = rulesFor({ classIds: ['cls-001'], style: [] }, classes);
    expect(inspectProperty(reset, 'color', { breakpoint: 'mobile' })).toMatchObject({
      overridden: false,
      resolved: { value: 'red' },
    });
  });

  it('rulesFor orders by the global class list, not the element classIds order, and skips unknown classes', () => {
    const classes = [
      { id: 'cls-001', rules: [{ declarations: { color: 'red' } }] },
      { id: 'cls-002', rules: [{ declarations: { color: 'blue' } }] },
    ];
    for (const classIds of [
      ['cls-001', 'cls-002'],
      ['cls-002', 'cls-001'],
      ['cls-404', 'cls-001'],
    ]) {
      const winner = resolveProperty(rulesFor({ classIds }, classes), 'color', { breakpoint: 'base' });
      expect(winner?.value).toBe(classIds.includes('cls-002') ? 'blue' : 'red');
    }
  });
});
