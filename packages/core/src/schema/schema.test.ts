import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { generate } from '../../scripts/generate-schema.ts';
import { BuilderDocumentSchema, CURRENT_SCHEMA_VERSION } from '../index.ts';

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
  zod: BuilderDocumentSchema.safeParse(input).success,
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
      'a decimal in props',
      mutate((d) => {
        element(d)['props'] = { opacity: 0.5 };
      }),
      false,
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
    expect(BuilderDocumentSchema.parse(input)).toEqual(input);
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
