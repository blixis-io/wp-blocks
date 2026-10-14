import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DOCUMENT_LIMITS,
  ISSUE_CODES,
  MAX_JSON_VALUES,
  canonicalJson,
  migrateDocument,
  serializeDocument,
  validateDocument,
  type DocumentIssue,
  type Migration,
} from '../index.ts';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, '..', '..', '..', '..', 'tests', 'fixtures', 'documents');

type Doc = Record<string, unknown>;
const base = (): Doc => ({
  schemaVersion: 1,
  documentId: 'doc-001',
  layoutRevision: 1,
  defaultLocale: 'en_US',
  locales: ['en_US', 'nl_NL'],
  root: [{ id: 'el-001', type: 'blixis/heading', props: {}, children: [] }],
  classListVersion: 0,
  classRefs: {},
  translations: { en_US: { 'el-001': { status: 'translated', values: { text: 'Hello' } } }, nl_NL: {} },
  metadata: { updatedAt: '2026-01-01T00:00:00Z', editorVersion: '0.0.0' },
});
const make = (edit: (d: Doc) => void): Doc => {
  const d = structuredClone(base());
  edit(d);
  return d;
};
const rootOf = (d: Doc): Doc[] => d['root'] as Doc[];
const first = (d: Doc): Doc => {
  const el = rootOf(d)[0];
  if (el === undefined) throw new Error('the base document has a root element');
  return el;
};
const codes = (result: ReturnType<typeof validateDocument>): string[] =>
  result.ok ? [] : result.errors.map((e) => e.code);

describe('document limits', () => {
  it('leave room in the JSON nesting limit for the deepest legal element tree', () => {
    expect(DOCUMENT_LIMITS.maxJsonDepth).toBeGreaterThanOrEqual(2 * DOCUMENT_LIMITS.maxTreeDepth + 2 + 8);
  });
});

describe('validateDocument: accepting documents', () => {
  it('accepts the base document, as text and as an object, with identical results', () => {
    const asObject = validateDocument(base());
    const asText = validateDocument(JSON.stringify(base()));
    expect(asObject.ok && asText.ok).toBe(true);
    expect(asObject.ok && asObject.migrated).toBe(false);
    expect(asObject.ok && asText.ok && asObject.document).toEqual(asText.ok ? asText.document : undefined);
  });

  it.each(
    readdirSync(join(fixtures, 'valid'))
      .filter((f) => f.endsWith('.json'))
      .map((f) => [f, readFileSync(join(fixtures, 'valid', f), 'utf8')] as const),
  )('accepts the valid fixture %s', (_name, text) => {
    const fixture = JSON.parse(text) as { input: unknown };
    const result = validateDocument(JSON.stringify(fixture.input));
    expect(result.ok).toBe(true);
    expect(result.ok && result.warnings).toEqual([]);
  });

  it.each(
    readdirSync(join(fixtures, 'invalid'))
      .filter((f) => f.endsWith('.json'))
      .map(
        (f) =>
          [
            f,
            JSON.parse(readFileSync(join(fixtures, 'invalid', f), 'utf8')) as {
              input: unknown;
              expected: { error?: string; path?: string };
            },
          ] as const,
      )
      .filter(([, fixture]) => fixture.expected.error === 'schema'),
  )('rejects %s for the stated reason: a schema issue at the stated path', (_name, fixture) => {
    const result = validateDocument(JSON.stringify(fixture.input));
    expect(result.ok).toBe(false);
    expect(fixture.expected.path).toBeDefined();
    expect(result.ok ? [] : result.errors.map((e) => [e.code, e.path])).toContainEqual([
      'schema',
      fixture.expected.path,
    ]);
  });

  it("accepts hostile text as data (escaping is the renderer's job)", () => {
    const fixture = JSON.parse(
      readFileSync(join(fixtures, 'invalid', 'hostile-translation-markup.fixture.json'), 'utf8'),
    ) as { input: unknown };
    expect(validateDocument(JSON.stringify(fixture.input)).ok).toBe(true);
  });

  it('accepts a tree exactly at the depth limit and a document exactly at the node limit', () => {
    let node: Doc = { id: 'el-leaf', type: 'blixis/text', props: {}, children: [] };
    for (let depth = 2; depth <= DOCUMENT_LIMITS.maxTreeDepth; depth += 1)
      node = { id: `el-d${String(depth)}`, type: 'blixis/box', props: {}, children: [node] };
    expect(
      validateDocument(
        make((d) => {
          d['root'] = [node];
          d['translations'] = { en_US: {} };
        }),
      ).ok,
    ).toBe(true);
    const flat = Array.from({ length: DOCUMENT_LIMITS.maxNodes }, (_, i) => ({
      id: `el-${String(i).padStart(5, '0')}`,
      type: 'blixis/text',
      props: {},
      children: [],
    }));
    const started = Date.now();
    expect(
      validateDocument(
        JSON.stringify(
          make((d) => {
            d['root'] = flat;
            d['translations'] = { en_US: {} };
          }),
        ),
      ).ok,
    ).toBe(true);
    expect(Date.now() - started).toBeLessThan(3000);
  });
});

describe('validateDocument: gates before and during decoding', () => {
  it('rejects oversized text before parsing it (even when it is not JSON)', () => {
    const result = validateDocument('x'.repeat(DOCUMENT_LIMITS.maxBytes + 1));
    expect(codes(result)).toEqual(['too-large']);
  });

  it('counts UTF-8 bytes, not characters', () => {
    const wide = '\u{1F600}'.repeat(Math.floor(DOCUMENT_LIMITS.maxBytes / 4) + 1); // 4 bytes each, fewer characters than the limit
    expect(codes(validateDocument(wide))).toEqual(['too-large']);
  });

  it.each([
    ['a decimal token', '"layoutRevision":1', '"layoutRevision":1.0'],
    ['an exponent token', '"layoutRevision":1', '"layoutRevision":1e0'],
    ['negative zero', '"layoutRevision":1', '"layoutRevision":-0'],
    ['a duplicate key', '"documentId":"doc-001"', '"documentId":"doc-001","documentId":"doc-002"'],
    ['a trailing comma', '"locales":["en_US","nl_NL"]', '"locales":["en_US","nl_NL",]'],
  ])('rejects %s in the text', (_name, from, to) => {
    expect(codes(validateDocument(JSON.stringify(base()).replace(from, to)))).toEqual(['invalid-json']);
  });

  it('rejects JSON nested deeper than the limit, as text and as an object', () => {
    const nested = `${'['.repeat(DOCUMENT_LIMITS.maxJsonDepth + 1)}${']'.repeat(DOCUMENT_LIMITS.maxJsonDepth + 1)}`;
    expect(codes(validateDocument(nested))).toEqual(['too-deep']);
    let value: unknown = [];
    for (let i = 0; i < 200; i += 1) value = [value];
    expect(codes(validateDocument(value))).toEqual(['too-deep']);
  });

  it('terminates on a cyclic object instead of recursing forever', () => {
    const cyclic: Doc = { schemaVersion: 1 };
    cyclic['self'] = cyclic;
    expect(codes(validateDocument(cyclic))).toEqual(['too-deep']);
  });

  it.each([
    [
      'a non-NFC string',
      make((d) => {
        d['documentId'] = 'doc-001';
        first(d)['props'] = { text: 'é' };
      }),
    ],
    [
      'a decimal number',
      make((d) => {
        d['layoutRevision'] = 1.5;
      }),
    ],
    [
      'a Date object',
      make((d) => {
        d['when'] = new Date(0);
      }),
    ],
    [
      'a sparse array',
      make((d) => {
        d['locales'] = new Array(2);
      }),
    ],
    [
      'a lone surrogate',
      make((d) => {
        first(d)['props'] = { text: '\ud800' };
      }),
    ],
  ])('rejects %s in an object', (_name, input) => {
    expect(codes(validateDocument(input))).toEqual(['invalid-value']);
  });

  it('reports every reserved key with its path', () => {
    const result = validateDocument(
      JSON.parse(
        JSON.stringify(make(() => undefined)).replace('"props":{}', '"props":{"opts":{"__proto__":1,"constructor":2}}'),
      ),
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.map((e) => `${e.code} ${e.path}`)).toEqual([
      'reserved-key $.root[0].props.opts.__proto__',
      'reserved-key $.root[0].props.opts.constructor',
    ]);
  });
});

describe('validateDocument: schema versions', () => {
  it.each([
    [
      'a missing version',
      make((d) => {
        Reflect.deleteProperty(d, 'schemaVersion');
      }),
      'schema',
    ],
    [
      'version 0',
      make((d) => {
        d['schemaVersion'] = 0;
      }),
      'schema',
    ],
    [
      'a string version',
      make((d) => {
        d['schemaVersion'] = '1';
      }),
      'schema',
    ],
    [
      'a decimal version',
      make((d) => {
        d['schemaVersion'] = 1.5;
      }),
      'invalid-value',
    ],
  ])('rejects %s', (_name, input, code) => {
    expect(codes(validateDocument(input))).toEqual([code]);
  });

  it('refuses a newer schema version without touching the input', () => {
    const input = make((d) => {
      d['schemaVersion'] = 2;
      d['futureField'] = { a: 1 };
    });
    const before = JSON.stringify(input);
    const result = validateDocument(input);
    expect(codes(result)).toEqual(['unsupported-schema-version']);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('shape errors carry JSON paths and are capped', () => {
    const result = validateDocument(
      make((d) => {
        d['root'] = Array.from({ length: 80 }, () => ({ id: 'x', type: 'nope', props: {}, children: [] }));
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeLessThanOrEqual(50);
      expect(result.errors[0]).toMatchObject({ code: 'schema', path: '$.root[0].id' });
    }
  });
});

describe('semantic checks', () => {
  const expectCode = (input: unknown, code: string, path?: string): void => {
    const result = validateDocument(input);
    expect(result.ok, code).toBe(false);
    const issue = !result.ok ? result.errors.find((e: DocumentIssue) => e.code === code) : undefined;
    expect(issue, `${code}: ${JSON.stringify(!result.ok && result.errors)}`).toBeDefined();
    if (path !== undefined) expect(issue?.path).toBe(path);
  };

  it('rejects duplicate element ids anywhere in the tree', () => {
    const fixture = JSON.parse(
      readFileSync(join(fixtures, 'invalid', 'duplicate-element-id.fixture.json'), 'utf8'),
    ) as { input: unknown };
    expectCode(fixture.input, 'duplicate-element-id', '$.root[1].id');
    expectCode(
      make((d) => {
        first(d)['children'] = [{ id: 'el-001', type: 'blixis/text', props: {}, children: [] }];
      }),
      'duplicate-element-id',
      '$.root[0].children[0].id',
    );
  });

  it('rejects trees deeper than the limit and documents with too many elements', () => {
    let node: Doc = { id: 'el-leaf', type: 'blixis/text', props: {}, children: [] };
    for (let depth = 2; depth <= DOCUMENT_LIMITS.maxTreeDepth + 1; depth += 1)
      node = { id: `el-d${String(depth)}`, type: 'blixis/box', props: {}, children: [node] };
    expectCode(
      make((d) => {
        d['root'] = [node];
        d['translations'] = { en_US: {} };
      }),
      'tree-too-deep',
    );
    const flat = Array.from({ length: DOCUMENT_LIMITS.maxNodes + 1 }, (_, i) => ({
      id: `el-${String(i).padStart(5, '0')}`,
      type: 'blixis/text',
      props: {},
      children: [],
    }));
    expectCode(
      make((d) => {
        d['root'] = flat;
        d['translations'] = { en_US: {} };
      }),
      'too-many-nodes',
    );
  });

  it('checks locales: duplicates, default locale listed, default stream present, translation locales listed', () => {
    expectCode(
      make((d) => {
        d['locales'] = ['en_US', 'en_US'];
      }),
      'duplicate-locale',
      '$.locales[1]',
    );
    expectCode(
      make((d) => {
        d['defaultLocale'] = 'fr_FR';
        d['translations'] = { fr_FR: {} };
      }),
      'default-locale-not-listed',
    );
    expectCode(
      make((d) => {
        d['translations'] = { nl_NL: {} };
      }),
      'missing-default-locale-stream',
    );
    expectCode(
      make((d) => {
        d['translations'] = { en_US: {}, de_DE: {} };
      }),
      'translation-locale-not-listed',
      '$.translations.de_DE',
    );
  });

  it('keeps orphaned entries but rejects silently stale ones for missing elements', () => {
    expectCode(
      make((d) => {
        d['translations'] = { en_US: { 'el-999': { status: 'translated', values: {} } } };
      }),
      'translation-for-missing-element',
    );
    const orphan = validateDocument(
      make((d) => {
        d['translations'] = { en_US: { 'el-999': { status: 'orphaned', values: { text: 'kept' } } } };
      }),
    );
    expect(orphan.ok).toBe(true);
    const wrong = validateDocument(
      make((d) => {
        d['translations'] = { en_US: { 'el-001': { status: 'orphaned', values: {} } } };
      }),
    );
    expect(wrong.ok && wrong.warnings.map((w) => w.code)).toEqual(['orphaned-entry-for-existing-element']);
  });

  it('rejects classes used by an element but missing from classRefs', () => {
    expectCode(
      make((d) => {
        first(d)['classIds'] = ['cls-001'];
      }),
      'unknown-class-reference',
    );
    expect(
      validateDocument(
        make((d) => {
          first(d)['classIds'] = ['cls-001'];
          d['classRefs'] = { 'cls-001': 1 };
        }),
      ).ok,
    ).toBe(true);
  });

  it('rejects two style rules with the same breakpoint, mode and state', () => {
    expectCode(
      make((d) => {
        first(d)['style'] = [
          { mode: 'dark', declarations: { color: 'white' } },
          { mode: 'dark', declarations: { color: 'black' } },
        ];
      }),
      'duplicate-style-rule',
      '$.root[0].style[1]',
    );
    expect(
      validateDocument(
        make((d) => {
          first(d)['style'] = [
            { mode: 'dark', declarations: {} },
            { mode: 'light', declarations: {} },
            { declarations: {} },
            { mode: 'dark', breakpoint: 'mobile', declarations: {} },
          ];
        }),
      ).ok,
    ).toBe(true);
  });

  it('rejects impossible calendar dates', () => {
    for (const updatedAt of ['2026-02-31T00:00:00Z', '2026-04-31T10:00:00Z', '2025-02-29T00:00:00Z']) {
      expectCode(
        make((d) => {
          d['metadata'] = { updatedAt, editorVersion: '1' };
        }),
        'invalid-timestamp',
      );
    }
    expect(
      validateDocument(
        make((d) => {
          d['metadata'] = { updatedAt: '2024-02-29T23:59:59Z', editorVersion: '1' };
        }),
      ).ok,
    ).toBe(true);
  });

  it('only ever reports documented issue codes', () => {
    const results = [
      validateDocument('nope'),
      validateDocument(
        make((d) => {
          d['locales'] = ['en_US', 'en_US'];
        }),
      ),
    ];
    for (const r of results) for (const e of r.ok ? [] : r.errors) expect(ISSUE_CODES).toContain(e.code);
  });
});

describe('migrations', () => {
  const v2: Migration = {
    from: 1,
    to: 2,
    migrate: (d) => {
      const { old, ...rest } = d;
      return { ...rest, schemaVersion: 2, renamed: old };
    },
  };
  const v3: Migration = { from: 2, to: 3, migrate: (d) => ({ ...d, schemaVersion: 3, extra: 'added' }) };

  it('applies steps in order on a private copy and preserves unknown fields', () => {
    const input = { schemaVersion: 1, old: 'value', unknown: { keep: [1, 2] } };
    const snapshot = structuredClone(input);
    const result = migrateDocument(input, 3, [v3, v2]);
    expect(result).toMatchObject({ ok: true, fromVersion: 1, applied: [2, 3] });
    expect(result.ok && result.document).toMatchObject({
      schemaVersion: 3,
      renamed: 'value',
      unknown: { keep: [1, 2] },
      extra: 'added',
    });
    expect(input).toEqual(snapshot);
  });

  it('does nothing for a current document', () => {
    expect(migrateDocument({ schemaVersion: 3, a: 1 }, 3, [v2, v3])).toMatchObject({ ok: true, applied: [] });
  });

  it('fails safely for newer versions, gaps, steps that forget the version, and steps that throw', () => {
    expect(migrateDocument({ schemaVersion: 4 }, 3, [v2, v3])).toMatchObject({
      ok: false,
      issue: { code: 'unsupported-schema-version' },
    });
    expect(migrateDocument({ schemaVersion: 1 }, 3, [v3])).toMatchObject({
      ok: false,
      issue: { code: 'migration-failed' },
    });
    expect(migrateDocument({ schemaVersion: 1 }, 2, [{ from: 1, to: 2, migrate: (d) => d }])).toMatchObject({
      ok: false,
      issue: { code: 'migration-failed' },
    });
    expect(
      migrateDocument({ schemaVersion: 1 }, 2, [
        {
          from: 1,
          to: 2,
          migrate: () => {
            throw new Error('boom');
          },
        },
      ]),
    ).toMatchObject({
      ok: false,
      issue: { code: 'migration-failed', message: expect.stringContaining('boom') as string },
    });
    expect(migrateDocument({ schemaVersion: 1 }, 2, [{ from: 1, to: 3, migrate: (d) => d }])).toMatchObject({
      ok: false,
    });
  });

  it.each([[[]], [[1]], [null], ['x']])('rejects a non-object or bad version input %j', (input) => {
    expect(migrateDocument(input, 1, [])).toMatchObject({ ok: false, issue: { code: 'schema' } });
  });

  it('identity migrations lose no data on any valid fixture (no field disappears)', () => {
    const identity = (from: number): Migration => ({
      from,
      to: from + 1,
      migrate: (d) => ({ ...d, schemaVersion: from + 1 }),
    });
    for (const f of readdirSync(join(fixtures, 'valid')).filter((x) => x.endsWith('.json'))) {
      const { input } = JSON.parse(readFileSync(join(fixtures, 'valid', f), 'utf8')) as { input: Doc };
      const result = migrateDocument(input, 3, [identity(1), identity(2)]);
      expect(result.ok && { ...result.document, schemaVersion: 1 }).toEqual(input);
    }
  });
});

describe('serializeDocument', () => {
  it('is deterministic, independent of key order, and round-trips through validateDocument', () => {
    const a = validateDocument(base());
    const b = validateDocument(Object.fromEntries(Object.entries(base()).reverse()));
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(serializeDocument(a.document)).toBe(serializeDocument(b.document));
      expect(serializeDocument(a.document)).toBe(canonicalJson(base()));
      const again = validateDocument(serializeDocument(a.document));
      expect(again.ok && again.document).toEqual(a.document);
    }
  });

  it('keeps unknown fields so a stored document survives a load and save cycle unchanged', () => {
    const input = make((d) => {
      d['x-future'] = { z: 1, a: [true] };
      first(d)['x-note'] = 'kept';
    });
    const result = validateDocument(JSON.stringify(input));
    expect(result.ok && serializeDocument(result.document)).toBe(canonicalJson(input));
  });
});

describe('hostile parsed input (time-of-check / time-of-use, exotic objects, size)', () => {
  const value = (text: string): unknown => JSON.parse(text) as unknown;

  it('reads a getter at most once and never lets it show different values to different gates', () => {
    let reads = 0;
    const doc = make(() => undefined);
    // First read is benign, any later read would smuggle a reserved key and a non-NFC string.
    Object.defineProperty(doc, 'x-sneaky', {
      enumerable: true,
      get: () => {
        reads += 1;
        return reads === 1 ? { safe: 1 } : value('{"__proto__":1,"t":"e\u0301"}');
      },
    });
    const result = validateDocument(doc);
    expect(codes(result)).toEqual(['invalid-value']); // accessors are refused outright
    expect(reads).toBe(0);
  });

  it('rejects accessor properties in arrays too, without invoking them', () => {
    const arr: unknown[] = [1];
    let called = false;
    Object.defineProperty(arr, 0, {
      enumerable: true,
      get: () => {
        called = true;
        return 1;
      },
    });
    expect(
      codes(
        validateDocument(
          make((d) => {
            d['locales'] = arr;
          }),
        ),
      ),
    ).toEqual(['invalid-value']);
    expect(called).toBe(false);
  });

  it('turns throwing getters, throwing Proxies and exotic values into issues instead of exceptions', () => {
    const throwing = {
      get a(): never {
        throw new Error('boom');
      },
    };
    const proxy = new Proxy(
      {},
      {
        ownKeys: () => {
          throw new Error('trap');
        },
      },
    );
    const inputs: unknown[] = [
      throwing,
      proxy,
      () => 1,
      Symbol('s'),
      10n,
      undefined,
      new Map(),
      new Date(0),
      Object.create({ inherited: 1 }),
      new (class Foo {
        a = 1;
      })(),
      Object.assign(new Array<number>(3), { 0: 1, 2: 3 }),
      Object.assign([1], { extra: 2 }),
      { [Symbol('k')]: 1 },
      Number.NaN,
      Infinity,
      -0.5,
      2 ** 60,
    ];
    for (const input of inputs) {
      let result: ReturnType<typeof validateDocument> | undefined;
      expect(() => {
        result = validateDocument(input);
      }).not.toThrow();
      expect(result?.ok, String(input)).toBe(false);
    }
    expect(() => migrateDocument(throwing, 1, [])).not.toThrow();
    expect(migrateDocument(throwing, 1, [])).toMatchObject({ ok: false });
  });

  it("does not mutate or retain the caller's object", () => {
    const input = make(() => undefined);
    const before = JSON.stringify(input);
    const result = validateDocument(input);
    expect(JSON.stringify(input)).toBe(before);
    if (result.ok) {
      expect(result.document).not.toBe(input);
      (result.document as Record<string, unknown>)['layoutRevision'] = 99;
      expect(input['layoutRevision']).toBe(1);
    }
  });

  it('applies the size limit to parsed objects by estimating their serialised size', () => {
    const big = make((d) => {
      first(d)['props'] = { a: 'x'.repeat(1_100_000), b: 'y'.repeat(1_100_000) };
    });
    expect(codes(validateDocument(big))).toEqual(['too-large']);
    const wideKeys = make((d) => {
      first(d)['props'] = Object.fromEntries(
        Array.from({ length: 120_000 }, (_, i) => [`k${String(i)}`, 'x'.repeat(12)]),
      );
    });
    expect(codes(validateDocument(wideKeys))).toEqual(['too-large']);
  });

  it('rejects documents with too many values with its own code', () => {
    const many = make((d) => {
      first(d)['props'] = { list: new Array<number>(MAX_JSON_VALUES + 1).fill(1) };
    });
    expect(codes(validateDocument(many))).toEqual(['too-many-values']);
  });

  it('reports at most 50 semantic errors and stops collecting there', () => {
    const root = Array.from({ length: 400 }, () => ({ id: 'el-dup', type: 'blixis/text', props: {}, children: [] }));
    const result = validateDocument(
      make((d) => {
        d['root'] = root;
        d['translations'] = { en_US: {} };
      }),
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.length).toBe(50);
  });

  it.each(['0050-06-15T12:00:00Z', '0000-01-01T00:00:00Z', '9999-12-31T23:59:59Z'])(
    'accepts the real timestamp %s',
    (updatedAt) => {
      expect(
        validateDocument(
          make((d) => {
            d['metadata'] = { updatedAt, editorVersion: '1' };
          }),
        ).ok,
      ).toBe(true);
    },
  );
});

describe('migration safety', () => {
  const step = (f: (d: Doc) => unknown): Migration => ({ from: 1, to: 2, migrate: f as Migration['migrate'] });
  const run = (f: (d: Doc) => unknown) => migrateDocument({ schemaVersion: 1, a: 1 }, 2, [step(f)]);

  it('rejects two steps for the same version', () => {
    const ok = (d: Doc): Doc => ({ ...d, schemaVersion: 2 });
    expect(migrateDocument({ schemaVersion: 1 }, 2, [step(ok), step(ok)])).toMatchObject({
      ok: false,
      issue: { code: 'migration-failed' },
    });
  });

  it.each([
    ['a reserved key', () => JSON.parse('{"schemaVersion":2,"__proto__":{"x":1}}') as unknown],
    ['a non-NFC string', (d: Doc) => ({ ...d, schemaVersion: 2, text: 'e\u0301' })],
    ['a decimal number', (d: Doc) => ({ ...d, schemaVersion: 2, ratio: 0.5 })],
    ['undefined values', (d: Doc) => ({ ...d, schemaVersion: 2, gone: undefined })],
    ['a class instance', (d: Doc) => ({ ...d, schemaVersion: 2, when: new Date(0) })],
    [
      'a getter',
      (d: Doc) => Object.defineProperty({ ...d, schemaVersion: 2 }, 'g', { enumerable: true, get: () => 1 }),
    ],
    [
      'excessive nesting',
      (d: Doc) => {
        let v: unknown = [];
        for (let i = 0; i < 300; i += 1) v = [v];
        return { ...d, schemaVersion: 2, deep: v };
      },
    ],
    ['a huge string', (d: Doc) => ({ ...d, schemaVersion: 2, big: 'x'.repeat(DOCUMENT_LIMITS.maxBytes + 1) })],
    ['a non-object result', () => 'not a document'],
  ])('rejects unsafe migration output: %s', (_name, f) => {
    expect(run(f)).toMatchObject({
      ok: false,
      issue: { code: expect.stringMatching(/migration-failed|schema/) as string },
    });
  });

  it('a real-looking migration keeps every field it does not rename (no data loss)', () => {
    const rename: Migration = {
      from: 1,
      to: 2,
      migrate: (d) => {
        const { oldName, ...rest } = d;
        return { ...rest, schemaVersion: 2, newName: oldName };
      },
    };
    const input = { schemaVersion: 1, oldName: 'x', untouched: { deep: [1, { z: null }] }, 'x-future': true };
    const result = migrateDocument(input, 2, [rename]);
    expect(result.ok && result.document).toEqual({
      schemaVersion: 2,
      newName: 'x',
      untouched: { deep: [1, { z: null }] },
      'x-future': true,
    });
    expect(input).toEqual({ schemaVersion: 1, oldName: 'x', untouched: { deep: [1, { z: null }] }, 'x-future': true });
  });
});
