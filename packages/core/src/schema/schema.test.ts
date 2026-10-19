import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { generate } from '../../scripts/generate-schema.ts';
import { CURRENT_SCHEMA_VERSION, DOCUMENT_LIMITS, findReservedKeys, safeParseDocument } from '../index.ts';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = join(here, '..', '..', '..', '..', 'tests', 'fixtures', 'documents');
const schemaPath = join(here, '..', '..', 'schema', 'document.schema.json');

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateJsonSchema = ajv.compile(JSON.parse(readFileSync(schemaPath, 'utf8')) as object);

type Doc = Record<string, unknown>;

const baseDocument = (): Doc => ({
  schemaVersion: 1,
  documentId: 'doc-001',
  layoutRevision: 1,
  defaultLocale: 'en_US',
  locales: ['en_US', 'nl_NL'],
  root: [
    {
      id: 'el-001',
      type: 'blixis/heading',
      props: { level: 2 },
      classIds: ['cls-001'],
      style: [
        { declarations: { color: 'black' } },
        { mode: 'dark', breakpoint: 'mobile', declarations: { color: 'lightgray' } },
      ],
      children: [{ id: 'el-002', type: 'blixis/text', props: {}, children: [] }],
    },
  ],
  classListVersion: 3,
  classRefs: { 'cls-001': 2 },
  translations: { en_US: { 'el-001': { status: 'translated', values: { text: 'Hello' } } }, nl_NL: {} },
  metadata: { updatedAt: '2026-01-01T00:00:00Z', editorVersion: '0.0.0' },
});

/** Returns a deep copy of the base document after applying `edit`. */
const mutate = (edit: (d: Doc) => void): Doc => {
  const d = structuredClone(baseDocument());
  edit(d);
  return d;
};
const element = (d: Doc): Doc => {
  const first = (d['root'] as Doc[])[0];
  if (first === undefined) throw new Error('the base document has an element');
  return first;
};

const verdicts = (input: unknown): { zod: boolean; jsonSchema: boolean } => ({
  zod: safeParseDocument(input).success,
  jsonSchema: validateJsonSchema(input),
});

describe('the generated JSON Schema', () => {
  it('is committed and up to date with the Zod schema', () => {
    expect(readFileSync(schemaPath, 'utf8')).toBe(generate());
  });

  it('declares its dialect, id and the current schema version', () => {
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as Record<string, unknown>;
    expect(schema['$schema']).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(schema['$id']).toBe(`urn:blixis:wp-blocks:document:${String(CURRENT_SCHEMA_VERSION)}`);
  });
});

describe('Zod schema and JSON Schema agree', () => {
  const cases: [string, Doc, boolean][] = [
    ['the base document', baseDocument(), true],
    [
      'an unknown top-level field',
      mutate((d) => {
        d['x-future'] = { a: [1, 2] };
      }),
      true,
    ],
    [
      'an unknown field on an element',
      mutate((d) => {
        element(d)['x-note'] = 'kept';
      }),
      true,
    ],
    [
      'no optional element fields',
      mutate((d) => {
        delete element(d)['classIds'];
        delete element(d)['style'];
      }),
      true,
    ],
    [
      'an empty root',
      mutate((d) => {
        d['root'] = [];
      }),
      true,
    ],
    [
      'a deeply nested child',
      mutate((d) => {
        element(d)['children'] = [
          {
            id: 'el-003',
            type: 'a-b/c-d',
            props: {},
            children: [{ id: 'el-004', type: 'a-b/c-d', props: {}, children: [] }],
          },
        ];
      }),
      true,
    ],
    [
      'schemaVersion 2',
      mutate((d) => {
        d['schemaVersion'] = 2;
      }),
      false,
    ],
    [
      'schemaVersion as a string',
      mutate((d) => {
        d['schemaVersion'] = '1';
      }),
      false,
    ],
    [
      'an uppercase document id',
      mutate((d) => {
        d['documentId'] = 'Doc-001';
      }),
      false,
    ],
    [
      'a too short element id',
      mutate((d) => {
        element(d)['id'] = 'ab';
      }),
      false,
    ],
    [
      'an element id with a space',
      mutate((d) => {
        element(d)['id'] = 'el 001';
      }),
      false,
    ],
    [
      'an element type without a namespace',
      mutate((d) => {
        element(d)['type'] = 'heading';
      }),
      false,
    ],
    [
      'an uppercase element type',
      mutate((d) => {
        element(d)['type'] = 'Blixis/Heading';
      }),
      false,
    ],
    [
      'a locale with a hyphen',
      mutate((d) => {
        d['defaultLocale'] = 'en-US';
      }),
      false,
    ],
    [
      'no locales',
      mutate((d) => {
        d['locales'] = [];
      }),
      false,
    ],
    [
      'a bounded decimal in props',
      mutate((d) => {
        element(d)['props'] = { opacity: 0.5 };
      }),
      true,
    ],
    [
      'an integer beyond 2^53 in props',
      mutate((d) => {
        element(d)['props'] = { big: 2 ** 53 };
      }),
      false,
    ],
    [
      'an invalid property id',
      mutate((d) => {
        element(d)['props'] = { 'Bad-Key': 1 };
      }),
      false,
    ],
    [
      'a negative layout revision',
      mutate((d) => {
        d['layoutRevision'] = -1;
      }),
      false,
    ],
    [
      'a bogus translation status',
      mutate((d) => {
        d['translations'] = { en_US: { 'el-001': { status: 'done', values: {} } } };
      }),
      false,
    ],
    [
      'a translation entry without values',
      mutate((d) => {
        d['translations'] = { en_US: { 'el-001': { status: 'draft' } } };
      }),
      false,
    ],
    [
      'a translation keyed by a bad locale',
      mutate((d) => {
        d['translations'] = { 'en-US': {} };
      }),
      false,
    ],
    [
      'an unknown mode',
      mutate((d) => {
        element(d)['style'] = [{ mode: 'sepia', declarations: {} }];
      }),
      false,
    ],
    [
      'an unknown state',
      mutate((d) => {
        element(d)['style'] = [{ state: 'visited', declarations: {} }];
      }),
      false,
    ],
    [
      'the implicit base breakpoint written out',
      mutate((d) => {
        element(d)['style'] = [{ breakpoint: 'base', declarations: {} }];
      }),
      false,
    ],
    [
      'an uppercase declaration name',
      mutate((d) => {
        element(d)['style'] = [{ declarations: { Color: 'red' } }];
      }),
      false,
    ],
    [
      'a decimal declaration value',
      mutate((d) => {
        element(d)['style'] = [{ declarations: { 'z-index': 1.5 } }];
      }),
      false,
    ],
    [
      'a declaration value of the wrong type',
      mutate((d) => {
        element(d)['style'] = [{ declarations: { color: true } }];
      }),
      false,
    ],
    [
      'a style rule without declarations',
      mutate((d) => {
        element(d)['style'] = [{ mode: 'dark' }];
      }),
      false,
    ],
    [
      'too many class ids',
      mutate((d) => {
        element(d)['classIds'] = Array.from({ length: 65 }, (_, i) => `cls-${String(100 + i)}`);
      }),
      false,
    ],
    [
      'a bad timestamp',
      mutate((d) => {
        d['metadata'] = { updatedAt: '2026-01-01 00:00:00', editorVersion: '1' };
      }),
      false,
    ],
    [
      'a non-UTC timestamp',
      mutate((d) => {
        d['metadata'] = { updatedAt: '2026-01-01T00:00:00+01:00', editorVersion: '1' };
      }),
      false,
    ],
    [
      'an invalid child',
      mutate((d) => {
        element(d)['children'] = [{ id: 'x', type: 'blixis/text', props: {}, children: [] }];
      }),
      false,
    ],
    ['a non-object document', [] as unknown as Doc, false],
  ];

  it.each(cases)('%s', (_name, input, expected) => {
    expect(verdicts(input)).toEqual({ zod: expected, jsonSchema: expected });
  });

  it.each([
    'schemaVersion',
    'documentId',
    'layoutRevision',
    'defaultLocale',
    'locales',
    'root',
    'classListVersion',
    'classRefs',
    'translations',
    'metadata',
  ])('rejects a document without %s', (field) => {
    expect(
      verdicts(
        mutate((d) => {
          Reflect.deleteProperty(d, field);
        }),
      ),
    ).toEqual({ zod: false, jsonSchema: false });
  });

  it.each(['id', 'type', 'props', 'children'])('rejects an element without %s', (field) => {
    expect(
      verdicts(
        mutate((d) => {
          Reflect.deleteProperty(element(d), field);
        }),
      ),
    ).toEqual({ zod: false, jsonSchema: false });
  });
});

describe('round trip', () => {
  it('parsing keeps every field, including unknown ones, unchanged', () => {
    const input = mutate((d) => {
      d['x-future'] = { nested: [1, { a: null }] };
      element(d)['x-note'] = 'kept';
    });
    const result = safeParseDocument(input);
    expect(result.success && result.data).toEqual(input);
  });
});

describe('the committed document fixtures', () => {
  const read = (dir: string): { id: string; input: unknown; expected: Record<string, unknown> }[] =>
    readdirSync(join(fixturesRoot, dir))
      .filter((f) => f.endsWith('.fixture.json'))
      .map(
        (f) =>
          JSON.parse(readFileSync(join(fixturesRoot, dir, f), 'utf8')) as {
            id: string;
            input: unknown;
            expected: Record<string, unknown>;
          },
      );

  it.each(read('valid').map((f) => [f.id, f.input] as const))(
    'valid fixture %s is accepted by both schemas',
    (_id, input) => {
      expect(verdicts(input)).toEqual({ zod: true, jsonSchema: true });
    },
  );

  it.each(
    read('invalid')
      .filter((f) => f.expected['error'] === 'schema')
      .map((f) => [f.id, f.input] as const),
  )('schema-invalid fixture %s is rejected by both schemas', (_id, input) => {
    expect(verdicts(input)).toEqual({ zod: false, jsonSchema: false });
  });

  it('fixtures that fail only semantically (duplicate ids, hostile text) pass the shape check; BWB-020 rejects or neutralises them', () => {
    for (const f of read('invalid').filter((x) => x.expected['error'] !== 'schema')) {
      expect(verdicts(f.input), f.id).toEqual({ zod: true, jsonSchema: true });
    }
  });
});

/** Builds a document from JSON text, so own `__proto__` keys exist exactly as they would in a stored document. */
const fromJson = (edit: (d: Doc) => void, replaceInText?: [string, string]): unknown => {
  let text = JSON.stringify(mutate(edit));
  if (replaceInText) text = text.replace(replaceInText[0], replaceInText[1]);
  return JSON.parse(text);
};

describe('reserved keys are rejected everywhere by both validators (prototype-pollution hazards)', () => {
  const rejected: [string, unknown][] = [
    ['an unknown top-level __proto__', JSON.parse('{"__proto__":{"x":1},' + JSON.stringify(baseDocument()).slice(1))],
    [
      'an unknown top-level constructor',
      fromJson((d) => {
        Reflect.set(d, 'constructor', 1);
      }),
    ],
    [
      '__proto__ inside a nested props value',
      fromJson(
        (d) => {
          element(d)['props'] = { opts: { ok: 1 } };
        },
        ['"ok"', '"__proto__"'],
      ),
    ],
    [
      'constructor inside a nested props value',
      fromJson(
        (d) => {
          element(d)['props'] = { opts: { ok: 1 } };
        },
        ['"ok"', '"constructor"'],
      ),
    ],
    [
      'constructor as a property id',
      mutate((d) => {
        element(d)['props'] = { constructor: 1 };
      }),
    ],
    [
      'prototype as a property id',
      mutate((d) => {
        element(d)['props'] = { prototype: 1 };
      }),
    ],
    [
      'an unknown field named prototype on an element',
      fromJson((d) => {
        element(d)['prototype'] = 'x';
      }),
    ],
    [
      'an unknown __proto__ on a style rule',
      fromJson(
        (d) => {
          element(d)['style'] = [{ declarations: {}, ok: 1 }];
        },
        ['"ok"', '"__proto__"'],
      ),
    ],
    [
      'an unknown constructor on a translation entry',
      fromJson(
        (d) => {
          d['translations'] = { en_US: { 'el-001': { status: 'draft', values: {}, ok: 1 } } };
        },
        ['"ok"', '"constructor"'],
      ),
    ],
    [
      'constructor as an element id',
      mutate((d) => {
        element(d)['id'] = 'constructor';
      }),
    ],
    [
      'constructor as a class reference key',
      mutate((d) => {
        d['classRefs'] = { constructor: 1 };
      }),
    ],
  ];
  it.each(rejected)('%s', (_name, input) => {
    expect(verdicts(input)).toEqual({ zod: false, jsonSchema: false });
  });

  it('findReservedKeys reports every path, including own __proto__ keys from JSON text', () => {
    expect(findReservedKeys(JSON.parse('{"a":{"__proto__":1},"b":[{"constructor":2}]}'))).toEqual([
      '$.a.__proto__',
      '$.b[0].constructor',
    ]);
    expect(findReservedKeys({ a: { b: [1, { c: null }] } })).toEqual([]);
  });
});

describe('more Zod / JSON Schema agreement', () => {
  const declarations = (count: number): Record<string, string> =>
    Object.fromEntries(Array.from({ length: count }, (_, i) => [`prop-${String(i)}`, 'x']));
  const withStyle = (rule: unknown): Doc =>
    mutate((d) => {
      element(d)['style'] = [rule];
    });
  const withEntry = (entry: unknown): Doc =>
    mutate((d) => {
      d['translations'] = { en_US: { 'el-001': entry } };
    });
  const cases: [string, Doc, boolean][] = [
    [
      '64 declarations in one rule',
      withStyle({ declarations: declarations(DOCUMENT_LIMITS.maxDeclarationsPerRule) }),
      true,
    ],
    [
      '65 declarations in one rule',
      withStyle({ declarations: declarations(DOCUMENT_LIMITS.maxDeclarationsPerRule + 1) }),
      false,
    ],
    ['a custom property --blx-x', withStyle({ declarations: { '--blx-x': 'red' } }), true],
    ['a custom property outside --blx-', withStyle({ declarations: { '--other-x': 'red' } }), false],
    ['an empty --blx- custom property', withStyle({ declarations: { '--blx-': 'red' } }), false],
    ['a vendor-prefixed declaration', withStyle({ declarations: { '-webkit-x': 'red' } }), false],
    ['a 64 character declaration name', withStyle({ declarations: { [`a${'b'.repeat(63)}`]: 'x' } }), true],
    ['a 65 character declaration name', withStyle({ declarations: { [`a${'b'.repeat(64)}`]: 'x' } }), false],
    ['a 2048 character declaration value', withStyle({ declarations: { content: 'x'.repeat(2048) } }), true],
    ['a 2049 character declaration value', withStyle({ declarations: { content: 'x'.repeat(2049) } }), false],
    ['an unknown field on a style rule', withStyle({ declarations: {}, future: 'keep' }), true],
    ['a valid sourceHash', withEntry({ status: 'stale', values: {}, sourceHash: 'd41d8cd9' }), true],
    ['a 7 character sourceHash', withEntry({ status: 'stale', values: {}, sourceHash: 'd41d8cd' }), false],
    ['a 65 character sourceHash', withEntry({ status: 'stale', values: {}, sourceHash: 'a'.repeat(65) }), false],
    ['a non-hex sourceHash', withEntry({ status: 'stale', values: {}, sourceHash: 'xyzxyzxy' }), false],
    ['an uppercase sourceHash', withEntry({ status: 'stale', values: {}, sourceHash: 'D41D8CD9' }), false],
    [
      'a translation value key that is not a property id',
      withEntry({ status: 'draft', values: { 'Bad-Key': 'x' } }),
      false,
    ],
    [
      'a translation entry keyed by a bad element id',
      mutate((d) => {
        d['translations'] = { en_US: { 'EL 1': { status: 'draft', values: {} } } };
      }),
      false,
    ],
    [
      'a classRefs key that is not an id',
      mutate((d) => {
        d['classRefs'] = { 'Bad Key': 1 };
      }),
      false,
    ],
    [
      'a negative classRefs version',
      mutate((d) => {
        d['classRefs'] = { 'cls-001': -1 };
      }),
      false,
    ],
    [
      'a decimal classRefs version',
      mutate((d) => {
        d['classRefs'] = { 'cls-001': 1.5 };
      }),
      false,
    ],
    [
      '64 locales',
      mutate((d) => {
        d['locales'] = Array.from(
          { length: 64 },
          (_, i) =>
            `a${String.fromCharCode(97 + (i % 26))}_${String.fromCharCode(65 + Math.floor(i / 26))}${String.fromCharCode(65 + (i % 26))}`,
        );
      }),
      true,
    ],
    [
      '65 locales',
      mutate((d) => {
        d['locales'] = Array.from(
          { length: 65 },
          (_, i) =>
            `a${String.fromCharCode(97 + (i % 26))}_${String.fromCharCode(65 + Math.floor(i / 26))}${String.fromCharCode(65 + (i % 26))}`,
        );
      }),
      false,
    ],
    [
      'WordPress locales de_DE_formal, ckb, pt_PT_ao90, sr_RS',
      mutate((d) => {
        d['locales'] = ['de_DE_formal', 'ckb', 'pt_PT_ao90', 'sr_RS'];
      }),
      true,
    ],
    [
      'a timestamp with an impossible month',
      mutate((d) => {
        d['metadata'] = { updatedAt: '2026-13-01T00:00:00Z', editorVersion: '1' };
      }),
      false,
    ],
    [
      'a timestamp with hour 24',
      mutate((d) => {
        d['metadata'] = { updatedAt: '2026-01-01T24:00:00Z', editorVersion: '1' };
      }),
      false,
    ],
    [
      'a timestamp with a day beyond the month (calendar checks belong to validateDocument)',
      mutate((d) => {
        d['metadata'] = { updatedAt: '2026-02-31T00:00:00Z', editorVersion: '1' };
      }),
      true,
    ],
    [
      'an empty editorVersion',
      mutate((d) => {
        d['metadata'] = { updatedAt: '2026-01-01T00:00:00Z', editorVersion: '' };
      }),
      false,
    ],
  ];
  it.each(cases)('%s', (_name, input, expected) => {
    expect(verdicts(input)).toEqual({ zod: expected, jsonSchema: expected });
  });

  it.each([
    ['translation entry values', () => withEntry({ status: 'draft' })],
    ['translation entry status', () => withEntry({ values: {} })],
    ['style rule declarations', () => withStyle({ mode: 'dark' })],
    [
      'metadata updatedAt',
      () =>
        mutate((d) => {
          d['metadata'] = { editorVersion: '1' };
        }),
    ],
    [
      'metadata editorVersion',
      () =>
        mutate((d) => {
          d['metadata'] = { updatedAt: '2026-01-01T00:00:00Z' };
        }),
    ],
  ])('rejects a missing %s', (_name, build) => {
    expect(verdicts(build())).toEqual({ zod: false, jsonSchema: false });
  });

  it('unknown fields on style rules, translation entries and metadata round-trip unchanged', () => {
    const input = mutate((d) => {
      element(d)['style'] = [{ declarations: { color: 'red' }, future: { a: 1 } }];
      d['translations'] = { en_US: { 'el-001': { status: 'draft', values: {}, note: 'kept' } } };
      d['metadata'] = { updatedAt: '2026-01-01T00:00:00Z', editorVersion: '1', build: 7 };
    });
    const result = safeParseDocument(input);
    expect(result.success && result.data).toEqual(input);
  });
});
