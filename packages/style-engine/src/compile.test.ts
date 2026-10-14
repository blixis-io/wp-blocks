import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDocument, type BuilderDocument, type StyleRule } from '@blixis/wp-core';
import { describe, expect, it } from 'vitest';
import { at } from './at.ts';
import { parse, resolve, resolveRoot, SELECTOR, type Context } from './cascade.test-helper.ts';
import { COMPILER_VERSION, LAYER_ORDER, compile, type GlobalClass } from './compile.ts';
import { sha256Hex, shortHash } from './hash.ts';
import { resolveProperty, rulesFor, type ResolveRule, type State } from './resolve.ts';

const here = dirname(fileURLToPath(import.meta.url));

function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Node {
  id: string;
  type: string;
  props: Record<string, unknown>;
  children: Node[];
  style?: StyleRule[];
  classIds?: string[];
}
const node = (id: string, extra: Partial<Node> = {}): Node => ({
  id,
  type: 'blixis/text',
  props: {},
  children: [],
  ...extra,
});
const doc = (root: Node[]): BuilderDocument => {
  const result = validateDocument({
    schemaVersion: 1,
    documentId: 'doc-001',
    layoutRevision: 1,
    defaultLocale: 'en_US',
    locales: ['en_US'],
    root,
    classListVersion: 0,
    classRefs: Object.fromEntries(root.flatMap((n) => n.classIds ?? []).map((id) => [id, 1])),
    translations: { en_US: {} },
    metadata: { updatedAt: '2026-01-01T00:00:00Z', editorVersion: '0.0.0' },
  });
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.document;
};

describe('sha256Hex', () => {
  it('matches the NIST test vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
    expect(sha256Hex('a'.repeat(1000))).toBe('41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3');
  });

  it('gives 12 lower-case hex characters and refuses non-ASCII', () => {
    expect(shortHash('doc-001:el-a')).toMatch(/^[0-9a-f]{12}$/);
    expect(() => sha256Hex('é')).toThrow(RangeError);
  });
});

const base = (css: string): ReturnType<typeof parse> => parse(css);
const ctx = (over: Partial<Context> = {}): Context => ({
  dataTheme: 'light',
  system: 'light',
  width: 1440,
  states: [],
  classes: [],
  ...over,
});

describe('compile: structure', () => {
  const document = doc([node('el-a', { style: [{ declarations: { color: 'red', margin: '0' } }] })]);

  it('declares the full layer order first and emits only layers that have rules', () => {
    const { css } = compile({ document });
    const lines = css.split('\n');
    expect(lines[0]).toBe(`/*blx-css:${String(COMPILER_VERSION)}*/`);
    expect(lines[1]).toBe(`@layer ${LAYER_ORDER.join(',')};`);
    expect(LAYER_ORDER).toHaveLength(42);
    expect(LAYER_ORDER.slice(0, 4)).toEqual(['blx.theme', 'blx.tokens', 'blx.class.s0.base', 'blx.class.s0.bp']);
    expect(LAYER_ORDER.at(-1)).toBe('blx.el.active.modebp');
    expect(lines).toHaveLength(4);
    expect(lines[2]).toMatch(/^@layer blx\.el\.s0\.base\{\.blx-[0-9a-f]{12}\{color:red;margin:0\}\}$/);
  });

  it('gives an element a stable class name derived from the document and element ids', () => {
    const result = compile({ document });
    expect(result.classNames.get('el-a')).toEqual([`blx-${shortHash('doc-001:el-a')}`]);
    expect(compile({ document }).css).toBe(result.css);
  });

  it('orders shorthands before longhands and custom properties first', () => {
    const d = doc([
      node('el-a', {
        style: [
          {
            declarations: { 'border-top-width': '1px', 'border-width': '2px', border: '3px solid red', '--blx-x': '1' },
          },
        ],
      }),
    ]);
    expect(compile({ document: d }).css).toContain(
      '{--blx-x:1;border:3px solid red;border-width:2px;border-top-width:1px}',
    );
  });

  it('wraps breakpoint rules in max-width media queries, narrower ones later', () => {
    const d = doc([
      node('el-a', {
        style: [
          { breakpoint: 'mobile', declarations: { color: 'green' } },
          { breakpoint: 'tablet', declarations: { color: 'blue' } },
        ],
      }),
    ]);
    const { css } = compile({ document: d });
    expect(css.indexOf('(max-width:1024px)')).toBeGreaterThan(-1);
    expect(css.indexOf('(max-width:1024px)')).toBeLessThan(css.indexOf('(max-width:640px)'));
    expect(css).toContain('@layer blx.el.s0.bp{@media (max-width:1024px){');
  });

  it('emits mode rules for an explicit theme and for auto (system preference)', () => {
    const d = doc([node('el-a', { style: [{ mode: 'dark', declarations: { color: 'white' } }] })]);
    const { css } = compile({ document: d });
    expect(css).toContain(':where(html[data-theme="dark"]) .blx-');
    expect(css).toContain(
      '@media (prefers-color-scheme:dark){:where(html:not([data-theme="light"]):not([data-theme="dark"])) .blx-',
    );
    const light = compile({
      document: doc([node('el-a', { style: [{ mode: 'light', declarations: { color: 'black' } }] })]),
    }).css;
    expect(light).toContain('@media not all and (prefers-color-scheme:dark){');
  });

  it('puts states in :where() so specificity does not grow', () => {
    const d = doc([node('el-a', { style: [{ state: 'focus-visible', declarations: { color: 'red' } }] })]);
    expect(compile({ document: d }).css).toMatch(/\.blx-[0-9a-f]{12}:where\(:focus-visible\)\{color:red\}/);
  });

  it('merges identical rule blocks across elements into one selector list, independent of document order', () => {
    const rule: StyleRule[] = [{ declarations: { color: 'red' } }];
    const one = compile({
      document: doc([
        node('el-a', { style: rule }),
        node('el-b', { style: rule }),
        node('el-c', { style: [{ declarations: { color: 'blue' } }] }),
      ]),
    });
    const two = compile({
      document: doc([
        node('el-c', { style: [{ declarations: { color: 'blue' } }] }),
        node('el-b', { style: rule }),
        node('el-a', { style: rule }),
      ]),
    });
    expect(one.css).toBe(two.css);
    const a = shortHash('doc-001:el-a');
    const b = shortHash('doc-001:el-b');
    const [first, second] = [a, b].sort();
    expect(one.css).toContain(`.blx-${first ?? ''},.blx-${second ?? ''}{color:red}`);
  });

  it('every selector has specificity (0,1,0): one class, scopes and states inside :where()', () => {
    const d = doc([
      node('el-a', {
        classIds: ['cls-001'],
        style: [
          { declarations: { color: 'red' } },
          { mode: 'dark', breakpoint: 'mobile', state: 'hover', declarations: { color: 'white' } },
          { mode: 'light', declarations: { color: 'black' } },
        ],
      }),
    ]);
    const classes: GlobalClass[] = [
      { id: 'cls-001', rules: [{ state: 'active', mode: 'dark', declarations: { opacity: '1' } }] },
    ];
    const parsed = base(compile({ document: d, classes }).css);
    expect(parsed.rules.length).toBeGreaterThan(5);
    for (const rule of parsed.rules) expect(SELECTOR.test(rule.selector), rule.selector).toBe(true);
  });
});

describe('compile: classes, tokens and problems', () => {
  it('emits only the global classes an element uses, named from the class id', () => {
    const classes: GlobalClass[] = [
      { id: 'cls-001', rules: [{ declarations: { color: 'red' } }] },
      { id: 'cls-002', rules: [{ declarations: { color: 'blue' } }] },
    ];
    const d = doc([node('el-a', { classIds: ['cls-002'] })]);
    const result = compile({ document: d, classes });
    const name = `blx-c-${shortHash('cls-002')}`;
    expect(result.classNames.get('el-a')).toEqual([name]);
    expect(result.css).toContain(`.${name}{color:blue}`);
    expect(result.css).not.toContain('color:red');
  });

  it('reports unknown classes, unknown breakpoints, duplicate rules, duplicate classes and invalid declarations', () => {
    const d = doc([
      node('el-a', {
        classIds: ['cls-404'],
        style: [
          { breakpoint: 'watch', declarations: { color: 'red' } },
          { declarations: { color: 'red', behavior: 'url(x)', width: 'calc(' } },
        ],
      }),
    ]);
    // validateDocument refuses these two shapes, so they are added afterwards: the compiler must not trust its input.
    const mutable = at(d.root, 0).style ?? [];
    mutable.push({ declarations: { color: 'blue' } }, { breakpoint: 'base', declarations: { color: 'blue' } });
    const result = compile({
      document: d,
      classes: [
        { id: 'cls-001', rules: [] },
        { id: 'cls-001', rules: [] },
      ],
    });
    expect(result.issues.map((i) => i.code)).toEqual([
      'duplicate-class',
      'unknown-breakpoint',
      'invalid-declaration',
      'invalid-declaration',
      'duplicate-rule',
      'unknown-breakpoint',
      'unknown-class',
    ]);
    expect(result.css).toContain('{color:red}');
    expect(result.css).not.toContain('behavior');
    expect(result.css).not.toContain('url');
  });

  it('refuses invalid breakpoint registries with an issue and empty output', () => {
    const d = doc([node('el-a')]);
    for (const breakpoints of [
      [],
      [{ id: 'tablet', maxWidth: 1024 }],
      [
        { id: 'base', maxWidth: null },
        { id: 'a', maxWidth: 500 },
        { id: 'b', maxWidth: 600 },
      ],
      [
        { id: 'base', maxWidth: null },
        { id: 'a', maxWidth: 0 },
      ],
      [
        { id: 'base', maxWidth: null },
        { id: 'A', maxWidth: 500 },
      ],
      [
        { id: 'base', maxWidth: null },
        { id: 'a', maxWidth: 500 },
        { id: 'a', maxWidth: 400 },
      ],
    ]) {
      const result = compile({ document: d, breakpoints });
      expect(result.css).toBe('');
      expect(result.issues[0]?.code).toBe('invalid-breakpoints');
    }
  });

  it('honours a custom breakpoint registry', () => {
    const d = doc([node('el-a', { style: [{ breakpoint: 'small', declarations: { color: 'red' } }] })]);
    const { css } = compile({
      document: d,
      breakpoints: [
        { id: 'base', maxWidth: null },
        { id: 'wide', maxWidth: 1600 },
        { id: 'small', maxWidth: 500 },
      ],
    });
    expect(css).toContain('@media (max-width:500px){');
  });

  it('detects class name collisions instead of styling two elements as one', () => {
    const d = doc([
      node('el-a', { style: [{ declarations: { color: 'red' } }] }),
      node('el-b', { style: [{ declarations: { color: 'blue' } }] }),
    ]);
    const result = compile({ document: d }, { hash: () => 'aaaaaaaaaaaa' });
    expect(result.issues.map((i) => i.code)).toEqual(['hash-collision']);
    expect(result.classNames.has('el-b')).toBe(false);
    expect(result.css).not.toContain('color:blue');
  });

  it('compiles tokens into layer blx.tokens with mode overrides and the auto form', () => {
    const d = doc([node('el-a')]);
    const result = compile({
      document: d,
      tokens: [
        { name: '--blx-color-bg', value: '#ffffff' },
        { name: '--blx-color-bg', value: '#111111', mode: 'dark' },
        { name: '--blx-space', value: 'clamp(1rem, 2vw, 2rem)' },
        { name: '--blx-color-bg', value: '#000000' },
        { name: 'color', value: 'red' },
        { name: '--evil', value: '1' },
        { name: '--blx-x', value: 'url(x)' },
      ],
    });
    expect(result.issues.map((i) => i.code)).toEqual([
      'duplicate-token',
      'invalid-declaration',
      'invalid-declaration',
      'invalid-declaration',
    ]);
    expect(result.css).toContain(
      '@layer blx.tokens{:where(:root){--blx-color-bg:#ffffff;--blx-space:clamp(1rem, 2vw, 2rem)}',
    );
    const parsed = base(result.css);
    const bg = '--blx-color-bg';
    expect(resolveRoot(parsed, bg, ctx({ dataTheme: 'light' }))).toBe('#ffffff');
    expect(resolveRoot(parsed, bg, ctx({ dataTheme: 'dark' }))).toBe('#111111');
    expect(resolveRoot(parsed, bg, ctx({ dataTheme: undefined, system: 'dark' }))).toBe('#111111');
    expect(resolveRoot(parsed, bg, ctx({ dataTheme: undefined, system: 'light' }))).toBe('#ffffff');
    expect(resolveRoot(parsed, bg, ctx({ dataTheme: 'light', system: 'dark' }))).toBe('#ffffff');
  });

  it('compiles 5,000 styled elements quickly and deterministically', () => {
    const root: Node[] = [];
    for (let i = 0; i < 5000; i += 1) {
      root.push(
        node(`el-${String(i).padStart(5, '0')}`, {
          style: [{ declarations: { color: i % 2 === 0 ? 'red' : 'blue', margin: `${String(i % 7)}px` } }],
        }),
      );
    }
    const document = doc(root);
    const started = Date.now();
    const first = compile({ document });
    const elapsed = Date.now() - started;
    expect(elapsed).toBeLessThan(2000);
    expect(compile({ document }).css).toBe(first.css);
    expect(first.issues).toEqual([]);
  });
});

// ---- conformance with ADR 0005 -------------------------------------------------------------------------------------------

interface FixtureRule {
  origin: 'token' | 'class' | 'element';
  value: string;
  mode?: 'light' | 'dark';
  breakpoint?: string;
  state?: string;
  classOrder?: number;
}
interface Fixture {
  viewports: Record<string, string[]>;
  cases: {
    id: string;
    rules: FixtureRule[];
    expect: { mode: 'light' | 'dark'; viewport: string; states?: string[]; value: string | null }[];
  }[];
}
const fixtures = JSON.parse(
  readFileSync(join(here, '..', '..', '..', 'tests', 'fixtures', 'style-resolution', 'cases.json'), 'utf8'),
) as Fixture;
const WIDTH: Record<string, number> = { desktop: 1440, tablet: 900, mobile: 400 };

/** Builds compiler input from fixture-style rules (element and class origins; tokens are covered separately). */
const PALETTE = [
  'red',
  'blue',
  'green',
  'white',
  'black',
  'gray',
  'silver',
  'teal',
  'navy',
  'olive',
  'maroon',
  'purple',
  'orange',
  'pink',
  'brown',
  'gold',
];

/** Fixture values are labels ("first", "dark-mobile"); the compiler needs real colours, so each label gets one. */
function colorMap(values: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const v of values) if (!map.has(v)) map.set(v, PALETTE[map.size] ?? 'red');
  return map;
}

function build(
  rules: FixtureRule[],
  colors = new Map<string, string>(),
): { document: BuilderDocument; classes: GlobalClass[]; classNames: string[] } {
  const own: StyleRule[] = [];
  const byOrder = new Map<number, StyleRule[]>();
  for (const r of rules) {
    const rule: StyleRule = {
      ...(r.mode === undefined ? {} : { mode: r.mode }),
      ...(r.breakpoint === undefined ? {} : { breakpoint: r.breakpoint }),
      ...(r.state === undefined ? {} : { state: r.state as StyleRule['state'] }),
      declarations: { color: colors.get(r.value) ?? r.value },
    };
    if (r.origin === 'element') own.push(rule);
    else if (r.origin === 'class') byOrder.set(r.classOrder ?? 1, [...(byOrder.get(r.classOrder ?? 1) ?? []), rule]);
  }
  const orders = [...byOrder.keys()].sort((a, b) => a - b);
  const classes: GlobalClass[] = orders.map((order) => ({
    id: `cls-${String(order).padStart(3, '0')}`,
    rules: byOrder.get(order) ?? [],
  }));
  // Classes are attached in reverse to prove that classIds order is not what decides precedence.
  const document = doc([node('el-a', { style: own, classIds: classes.map((c) => c.id).reverse() })]);
  const result = compile({ document, classes });
  expect(result.issues).toEqual([]);
  return { document, classes, classNames: result.classNames.get('el-a') ?? [] };
}

describe('compile: conformance with the ADR 0005 fixtures', () => {
  const cases = fixtures.cases.filter((c) => c.rules.every((r) => r.origin !== 'token'));
  it('has fixtures to run', () => {
    expect(cases.length).toBeGreaterThanOrEqual(10);
  });

  for (const c of cases) {
    it(`${c.id}: explicit theme and system preference give the documented values`, () => {
      const colors = colorMap(c.rules.map((r) => r.value));
      const { document, classes, classNames } = build(c.rules, colors);
      const parsed = base(compile({ document, classes }).css);
      for (const e of c.expect) {
        const width = WIDTH[e.viewport] ?? 1440;
        const explicit = resolve(
          parsed,
          'color',
          ctx({
            dataTheme: e.mode,
            system: e.mode === 'dark' ? 'light' : 'dark',
            width,
            states: e.states ?? [],
            classes: classNames,
          }),
        );
        const auto = resolve(
          parsed,
          'color',
          ctx({ dataTheme: 'auto', system: e.mode, width, states: e.states ?? [], classes: classNames }),
        );
        const unset = resolve(
          parsed,
          'color',
          ctx({ dataTheme: undefined, system: e.mode, width, states: e.states ?? [], classes: classNames }),
        );
        expect([e.mode, e.viewport, explicit], c.id).toEqual([
          e.mode,
          e.viewport,
          e.value === null ? undefined : colors.get(e.value),
        ]);
        expect([e.mode, e.viewport, auto], c.id).toEqual([
          e.mode,
          e.viewport,
          e.value === null ? undefined : colors.get(e.value),
        ]);
        expect([e.mode, e.viewport, unset], c.id).toEqual([
          e.mode,
          e.viewport,
          e.value === null ? undefined : colors.get(e.value),
        ]);
      }
    });
  }

  it('the presence matrix of the four rule layers resolves as documented in every context', () => {
    let checked = 0;
    for (let bits = 0; bits < 16; bits += 1) {
      const present = [0, 1, 2, 3].map((n) => (bits >> n) & 1);
      const rules: FixtureRule[] = [];
      if (present[0]) rules.push({ origin: 'element', value: 'black' });
      if (present[1]) rules.push({ origin: 'element', breakpoint: 'mobile', value: 'gray' });
      if (present[2]) rules.push({ origin: 'element', mode: 'dark', value: 'white' });
      if (present[3]) rules.push({ origin: 'element', mode: 'dark', breakpoint: 'mobile', value: 'silver' });
      const { document, classes, classNames } = build(rules);
      const parsed = base(compile({ document, classes }).css);
      for (const mode of ['light', 'dark'] as const) {
        for (const [viewport, width] of Object.entries(WIDTH)) {
          const mobile = viewport === 'mobile';
          const expected =
            mode === 'dark' && mobile && present[3]
              ? 'silver'
              : mode === 'dark' && present[2]
                ? 'white'
                : mobile && present[1]
                  ? 'gray'
                  : present[0]
                    ? 'black'
                    : undefined;
          expect(
            resolve(parsed, 'color', ctx({ dataTheme: mode, width, classes: classNames })),
            `${String(bits)} ${mode} ${viewport}`,
          ).toBe(expected);
          checked += 1;
        }
      }
    }
    expect(checked).toBe(96);
  });
});

// The reference resolver (resolve.ts) is the oracle: it implements the lexicographic key of ADR 0005 section 1 and is
// independent of the compiler's layer and emission logic.
function resolveByKey(
  rules: FixtureRule[],
  mode: 'light' | 'dark',
  viewport: string,
  states: string[],
): string | undefined {
  const mapped: ResolveRule[] = rules.map((r) => ({
    origin: r.origin as 'class' | 'element',
    ...(r.classOrder === undefined ? {} : { classOrder: r.classOrder }),
    ...(r.state === undefined ? {} : { state: r.state as State }),
    ...(r.mode === undefined ? {} : { mode: r.mode }),
    ...(r.breakpoint === undefined ? {} : { breakpoint: r.breakpoint }),
    declarations: { color: r.value },
  }));
  return resolveProperty(mapped, 'color', {
    breakpoint: viewport === 'desktop' ? 'base' : viewport,
    mode,
    states: states as State[],
  })?.value;
}

describe('compile: randomized equivalence with the resolution key', () => {
  it('agrees with the lexicographic key for 1,500 seeded rule sets in random contexts', () => {
    const next = rng(20261014);
    const pick = <T>(list: readonly T[]): T => list[Math.floor(next() * list.length)] as T;
    const colors = ['red', 'blue', 'green', 'white', 'black', 'gray', 'silver', 'teal', 'navy', 'olive'];
    let checked = 0;
    for (let n = 0; n < 1500; n += 1) {
      const seen = new Set<string>();
      const rules: FixtureRule[] = [];
      for (let i = 0; i < 1 + Math.floor(next() * 9); i += 1) {
        const origin = pick(['class', 'element'] as const);
        const rule: FixtureRule = { origin, value: pick(colors) };
        if (origin === 'class') rule.classOrder = 1 + Math.floor(next() * 3);
        if (next() < 0.4) rule.state = pick(['hover', 'focus', 'focus-visible', 'active']);
        if (next() < 0.5) rule.mode = pick(['light', 'dark'] as const);
        if (next() < 0.5) rule.breakpoint = pick(['tablet', 'mobile']);
        const identity = [rule.origin, rule.classOrder, rule.state, rule.mode, rule.breakpoint].join('|');
        if (seen.has(identity)) continue;
        seen.add(identity);
        rules.push(rule);
      }
      const { document, classes, classNames } = build(rules);
      const parsed = base(compile({ document, classes }).css);
      for (let k = 0; k < 4; k += 1) {
        const mode = pick(['light', 'dark'] as const);
        const viewport = pick(['desktop', 'tablet', 'mobile']);
        const states = ['hover', 'focus', 'focus-visible', 'active'].filter(() => next() < 0.3);
        const theme = pick(['explicit', 'auto', 'unset']);
        const actual = resolve(
          parsed,
          'color',
          ctx({
            dataTheme: theme === 'explicit' ? mode : theme === 'auto' ? 'auto' : undefined,
            system:
              mode === 'dark' ? (theme === 'explicit' ? 'light' : 'dark') : theme === 'explicit' ? 'dark' : 'light',
            width: WIDTH[viewport] ?? 1440,
            states,
            classes: classNames,
          }),
        );
        expect(actual, JSON.stringify({ rules, mode, viewport, states, theme })).toBe(
          resolveByKey(rules, mode, viewport, states),
        );
        checked += 1;
      }
    }
    expect(checked).toBe(6000);
  });
});

describe('compile and resolver agree on an explicit "base" breakpoint', () => {
  it('neither applies it', () => {
    const d = doc([node('el-a')]);
    (at(d.root, 0) as { style?: StyleRule[] }).style = [{ breakpoint: 'base', declarations: { color: 'red' } }];
    const result = compile({ document: d });
    expect(result.issues.map((i) => i.code)).toEqual(['unknown-breakpoint']);
    expect(result.css).not.toContain('color:red');
    expect(resolveProperty(rulesFor(at(d.root, 0), []), 'color', { breakpoint: 'base' })).toBeUndefined();
  });
});

describe('compile: review hardening', () => {
  it('detects collisions between global class names and ignores the second class', () => {
    const classes: GlobalClass[] = [
      { id: 'cls-001', rules: [{ declarations: { color: 'red' } }] },
      { id: 'cls-002', rules: [{ declarations: { color: 'blue' } }] },
    ];
    const d = doc([node('el-a', { classIds: ['cls-001'] }), node('el-b', { classIds: ['cls-002'] })]);
    const result = compile({ document: d, classes }, { hash: () => 'cccccccccccc' });
    expect(result.issues.map((i) => i.code)).toEqual(['hash-collision', 'unknown-class']);
    expect(result.css).toContain('color:red');
    expect(result.css).not.toContain('color:blue');
    expect(result.classNames.has('el-b')).toBe(false);
  });

  it('bounds classes, tokens and rules per owner', () => {
    const classes: GlobalClass[] = Array.from({ length: 1001 }, (_v, i) => ({
      id: `cls-${String(i).padStart(4, '0')}`,
      rules: [],
    }));
    const tokens = Array.from({ length: 1001 }, (_v, i) => ({ name: `--blx-t${String(i)}`, value: '1' }));
    const result = compile({ document: doc([node('el-a')]), classes, tokens });
    expect(result.issues.map((i) => i.code)).toEqual(['too-many-classes', 'too-many-tokens']);
    expect(result.css).not.toContain('--blx-t1000');
    expect(result.css).toContain('--blx-t999:1');
    const rules: StyleRule[] = Array.from({ length: 257 }, (_v, i) => ({ declarations: { width: `${String(i)}px` } }));
    const mutated = doc([node('el-a')]);
    const first = at(mutated.root, 0) as { style?: StyleRule[] };
    first.style = rules;
    const limited = compile({ document: mutated });
    expect(limited.issues[0]?.code).toBe('too-many-rules');
    expect(limited.issues).toHaveLength(256);
    expect(limited.css).toContain('width:0px');
    expect(limited.css).not.toContain('width:256px');
  });

  it('puts narrower border settings after broader ones', () => {
    const d = doc([
      node('el-a', {
        style: [
          {
            declarations: {
              'border-top-color': 'red',
              'border-top': '1px solid blue',
              'border-color': 'green',
              'border-width': '2px',
              border: '3px solid black',
              'border-top-width': '4px',
              'border-radius': '4px',
              'border-top-left-radius': '8px',
            },
          },
        ],
      }),
    ]);
    const { css } = compile({ document: d });
    expect(css.indexOf('border:3px')).toBeLessThan(css.indexOf('border-width:2px'));
    expect(css.indexOf('border-width:2px')).toBeLessThan(css.indexOf('border-top:1px'));
    expect(css.indexOf('border-color:green')).toBeLessThan(css.indexOf('border-top:1px'));
    expect(css.indexOf('border-top:1px')).toBeLessThan(css.indexOf('border-top-width:4px'));
    expect(css.indexOf('border-radius:4px')).toBeLessThan(css.indexOf('border-top-left-radius:8px'));
  });

  it('lets the first rule that has something to emit own its combination', () => {
    const d = doc([node('el-a')]);
    (at(d.root, 0) as { style?: StyleRule[] }).style = [
      { declarations: { behavior: 'url(x)' } },
      { declarations: { color: 'red' } },
      { declarations: { color: 'blue' } },
    ];
    const result = compile({ document: d });
    expect(result.issues.map((i) => i.code)).toEqual(['invalid-declaration', 'duplicate-rule']);
    expect(result.css).toContain('color:red');
    expect(result.css).not.toContain('color:blue');
  });

  it('reports repeated class references and non-ASCII identifiers instead of throwing', () => {
    const d = doc([node('el-a', { classIds: ['cls-001'] })]);
    (at(d.root, 0) as { classIds?: string[] }).classIds = ['cls-001', 'cls-001'];
    const classes: GlobalClass[] = [{ id: 'cls-001', rules: [{ declarations: { color: 'red' } }] }];
    expect(compile({ document: d, classes }).issues.map((i) => i.code)).toEqual(['duplicate-class-reference']);
    expect(compile({ document: d, classes }).classNames.get('el-a')).toHaveLength(1);

    const unicode = doc([node('el-a', { style: [{ declarations: { color: 'red' } }] })]);
    (unicode as { documentId: string }).documentId = 'döc-001';
    const result = compile({ document: unicode, classes: [{ id: 'cls-é', rules: [] }] });
    expect(result.issues.map((i) => i.code)).toEqual(['invalid-identifier', 'invalid-identifier']);
    expect(result.classNames.size).toBe(0);
  });
});
