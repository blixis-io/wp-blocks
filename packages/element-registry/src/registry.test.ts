import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyCommand, canonicalJson, validateDocument, type BuilderDocument } from '@blixis/wp-core';
import { describe, expect, it } from 'vitest';
import { generate } from '../scripts/generate-manifest.ts';
import {
  CORE_ELEMENTS,
  ElementRegistry,
  EXTENSION_API_VERSION,
  checkAgainstRegistry,
  createCoreRegistry,
  createEditorRegistry,
} from './index.ts';

const here = dirname(fileURLToPath(import.meta.url));
function defined<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('expected a value');
  return value;
}
const TYPES = ['blixis/section', 'blixis/container', 'blixis/heading', 'blixis/text', 'blixis/image', 'blixis/button'];

const vendorDef = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  type: 'acme/card',
  version: 1,
  title: 'Card',
  category: 'content',
  tier: 'free',
  requiresApi: 1,
  props: { title: { kind: 'string', classification: 'translatable', label: 'Title', maxLength: 100, default: 'Card' } },
  allowedParents: ['@layout'],
  allowedChildren: ['@content'],
  ...overrides,
});
const register = (def: unknown, source: 'core' | 'plus' | 'pro' | 'vendor' = 'vendor') =>
  new ElementRegistry().register(def, source);
const errorsOf = (def: unknown, source: 'core' | 'plus' | 'pro' | 'vendor' = 'vendor'): string[] => {
  const r = register(def, source);
  return r.ok ? [] : r.errors;
};

describe('the core registry', () => {
  const registry = createCoreRegistry();

  it('contains the six core elements, sorted, all free and all valid', () => {
    expect(registry.list().map((d) => d.type)).toEqual([...TYPES].sort());
    expect(CORE_ELEMENTS.every((d) => d.tier === 'free' && d.fallback === undefined)).toBe(true);
  });

  it('classifies text as translatable, links as locale-specific and structure as invariant (FR-051)', () => {
    const classes = (type: string): Record<string, string> =>
      Object.fromEntries(Object.entries(registry.get(type)?.props ?? {}).map(([k, v]) => [k, v.classification]));
    expect(classes('blixis/heading')).toEqual({ level: 'invariant', text: 'translatable' });
    expect(classes('blixis/text')).toEqual({ text: 'translatable' });
    expect(classes('blixis/image')).toEqual({
      attachmentId: 'invariant',
      alt: 'translatable',
      decorative: 'invariant',
    });
    expect(classes('blixis/button')).toEqual({
      label: 'translatable',
      href: 'locale-specific',
      variant: 'invariant',
      newTab: 'invariant',
    });
  });

  it('keeps image sources attachment-only', () => {
    expect(registry.get('blixis/image')?.props['attachmentId']?.kind).toBe('media');
    expect(registry.get('blixis/image')?.props['src']).toBeUndefined();
  });

  describe('canNest', () => {
    // rows: parent (null = page root); columns: child
    const expected: Record<string, string[]> = {
      '': ['blixis/section'],
      'blixis/section': ['blixis/container', 'blixis/heading', 'blixis/text', 'blixis/image', 'blixis/button'],
      'blixis/container': ['blixis/container', 'blixis/heading', 'blixis/text', 'blixis/image', 'blixis/button'],
      'blixis/heading': [],
      'blixis/text': [],
      'blixis/image': [],
      'blixis/button': [],
    };
    it.each(Object.entries(expected))('children allowed under %j', (parent, allowed) => {
      const actual = TYPES.filter((child) => registry.canNest(parent === '' ? null : parent, child));
      expect(actual.sort()).toEqual([...allowed].sort());
    });

    it('refuses unknown parents and children, and sections inside anything', () => {
      expect(registry.canNest(null, 'acme/unknown')).toBe(false);
      expect(registry.canNest('acme/unknown', 'blixis/text')).toBe(false);
      expect(registry.canNest('blixis/section', 'blixis/section')).toBe(false);
      expect(registry.canNest('blixis/container', 'blixis/section')).toBe(false);
    });
  });

  describe('defaults', () => {
    it('splits defaults into invariant props and translatable / locale-specific values', () => {
      expect(registry.defaultsFor('blixis/heading')).toEqual({
        props: { level: 2 },
        translatable: { text: 'Heading' },
      });
      expect(registry.defaultsFor('blixis/button')).toEqual({
        props: { variant: 'solid', newTab: false },
        translatable: { label: 'Button', href: '#' },
      });
      expect(registry.defaultsFor('blixis/image')).toEqual({ props: { decorative: false }, translatable: { alt: '' } });
      expect(registry.defaultsFor('acme/none')).toBeUndefined();
    });

    it('creates elements that are valid, and independent copies every time', () => {
      for (const type of TYPES) {
        const element = registry.createElement(type, 'el-new');
        expect(element, type).toBeDefined();
        expect(registry.validateProps(type, element?.props ?? {})).toEqual([]);
      }
      const a = registry.createElement('blixis/heading', 'el-a');
      const b = registry.createElement('blixis/heading', 'el-b');
      if (a !== undefined) a.props['level'] = 5;
      expect(b?.props['level']).toBe(2);
      expect(registry.createElement('acme/none', 'el-x')).toBeUndefined();
    });
  });

  describe('validateProps', () => {
    it('accepts valid invariant values and rejects the rest, naming the property', () => {
      expect(registry.validateProps('blixis/heading', { level: 3 })).toEqual([]);
      expect(registry.validateProps('blixis/heading', { level: 9 })[0]).toMatch(/^level:/);
      expect(registry.validateProps('blixis/heading', { level: 1.5 })[0]).toMatch(/^level:/);
      expect(registry.validateProps('blixis/heading', {})[0]).toBe('level: is required');
      expect(registry.validateProps('blixis/section', { tag: 'script' })[0]).toMatch(/^tag:/);
      expect(registry.validateProps('blixis/section', { nope: 1 })).toEqual(['nope: not a property of blixis/section']);
      expect(registry.validateProps('blixis/image', { attachmentId: 0 })[0]).toMatch(/^attachmentId:/);
      expect(registry.validateProps('blixis/image', { attachmentId: 42 })).toEqual([]);
    });

    it('keeps translatable values out of props', () => {
      expect(registry.validateProps('blixis/heading', { level: 2, text: 'Hi' })[0]).toMatch(
        /translatable and belongs in the translation streams|is translatable/,
      );
      expect(registry.validateProps('blixis/button', { href: '/x' })[0]).toMatch(/locale-specific/);
    });

    it('does not trip over property names that exist on every object (toString, constructor)', () => {
      expect(registry.validateProps('blixis/section', { toString: 'x' })).toEqual([
        'toString: not a property of blixis/section',
      ]);
      expect(registry.validateProps('blixis/section', { hasOwnProperty: 1 })).toEqual([
        'hasOwnProperty: not a property of blixis/section',
      ]);
    });

    it('treats unknown element types as nothing to validate', () => {
      expect(registry.validateProps('acme/none', { anything: 1 })).toEqual([]);
    });
  });

  describe('definitions are immutable', () => {
    it('cannot be changed through get() or list()', () => {
      const def = registry.get('blixis/heading');
      expect(() => {
        (defined(def) as { title: string }).title = 'Hacked';
      }).toThrow(TypeError);
      expect(() => {
        (def?.props['level'] as { default: number }).default = 99;
      }).toThrow(TypeError);
      expect(registry.get('blixis/heading')?.title).toBe('Heading');
    });

    it('copies the input, so later changes to the object that was registered have no effect', () => {
      const input = vendorDef() as { title: string };
      const r = new ElementRegistry();
      expect(r.register(input, 'vendor').ok).toBe(true);
      input.title = 'Changed';
      expect(r.get('acme/card')?.title).toBe('Card');
    });
  });
});

describe('hostile registration input', () => {
  const fresh = () => new ElementRegistry();
  it('turns throwing getters, proxies and reserved JSON keys into errors, never exceptions', () => {
    const getter = {
      get type(): string {
        throw new Error('boom');
      },
    };
    const proxy = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error('boom');
        },
      },
    );
    for (const input of [getter, proxy, JSON.parse('{"__proto__":{"x":1}}')]) {
      const result = fresh().register(input, 'vendor');
      expect(result.ok).toBe(false);
    }
    const withReserved: unknown = JSON.parse(
      `{"type":"acme/box","label":"B","tier":"free","props":{},"allowedChildren":[],"__proto__":{"a":1}}`,
    );
    expect(fresh().register(withReserved, 'vendor').ok).toBe(false);
  });

  it('registrarFor binds the source', () => {
    const r = fresh();
    expect(r.registrarFor('vendor').register(vendorDef({ type: 'blixis/evil' })).ok).toBe(false);
    expect(r.registrarFor('vendor').register(vendorDef()).ok).toBe(true);
  });

  it('only invariant properties can be required', () => {
    const bad = vendorDef({
      props: {
        t: { kind: 'string', classification: 'translatable', label: 'T', maxLength: 10, required: true, default: 'x' },
      },
    });
    expect(errorsOf(bad).join()).toMatch(/only invariant properties can be required/);
  });

  it('relocating an unknown element is allowed only into the root or a container', () => {
    const r = new ElementRegistry();
    for (const d of CORE_ELEMENTS) r.register(d, 'core');
    expect(r.canNest(null, 'gone/thing')).toBe(false);
    expect(r.canNest(null, 'gone/thing', 'relocate')).toBe(true);
    expect(r.canNest('blixis/section', 'gone/thing', 'relocate')).toBe(true);
    expect(r.canNest('blixis/heading', 'gone/thing', 'relocate')).toBe(false);
    expect(r.canNest('gone/parent', 'blixis/text', 'relocate')).toBe(false);
  });

  it('propIssues returns stable codes', () => {
    const r = new ElementRegistry();
    for (const d of CORE_ELEMENTS) r.register(d, 'core');
    expect(r.propIssues('blixis/heading', { nope: 1 }).map((i) => i.code)).toContain('unknown-property');
  });
});

describe('registration rules', () => {
  it('accepts a valid vendor, plus and pro element', () => {
    expect(errorsOf(vendorDef())).toEqual([]);
    expect(errorsOf(vendorDef({ type: 'blixis-plus/query', tier: 'plus', fallback: 'retained' }), 'plus')).toEqual([]);
    expect(errorsOf(vendorDef({ type: 'blixis-pro/loop', tier: 'pro', fallback: 'unavailable' }), 'pro')).toEqual([]);
    expect(errorsOf(CORE_ELEMENTS[0], 'core')).toEqual([]);
  });

  it('reserves the blixis namespaces', () => {
    expect(errorsOf(vendorDef({ type: 'blixis/evil' }))[0]).toMatch(/reserved for Blixis/);
    expect(errorsOf(vendorDef({ type: 'blixis-plus/xy' }))[0]).toMatch(/reserved for Blixis/);
    expect(errorsOf(vendorDef({ type: 'blixis-anything/xy' }))[0]).toMatch(/reserved for Blixis/);
    expect(errorsOf(vendorDef({ type: 'acme/xy' }), 'core')[0]).toMatch(/namespace "blixis\/"/);
    expect(errorsOf(vendorDef({ type: 'blixis/xy', tier: 'plus', fallback: 'static' }), 'plus')[0]).toMatch(
      /namespace "blixis-plus\/"/,
    );
  });

  it('ties the tier to who registers, and requires a fallback class exactly for paid tiers (ADR 0009)', () => {
    expect(errorsOf(vendorDef({ type: 'blixis-plus/xy', tier: 'free' }), 'plus').join()).toMatch(
      /must declare tier "plus"/,
    );
    expect(errorsOf(vendorDef({ tier: 'pro', fallback: 'static' }), 'vendor').join()).toMatch(
      /must declare tier "free"/,
    );
    expect(errorsOf(vendorDef({ type: 'blixis-plus/xy', tier: 'plus' }), 'plus').join()).toMatch(
      /must declare a fallback class/,
    );
    expect(errorsOf(vendorDef({ fallback: 'static' })).join()).toMatch(/must not declare a fallback class/);
    expect(register(vendorDef({ type: 'blixis-plus/xy', tier: 'plus', fallback: 'sometimes' }), 'plus').ok).toBe(false);
  });

  it('refuses definitions that need a newer extension API', () => {
    expect(errorsOf(vendorDef({ requiresApi: EXTENSION_API_VERSION + 1 })).join()).toMatch(/requires extension API/);
  });

  it('refuses duplicates', () => {
    const r = new ElementRegistry();
    expect(r.register(vendorDef(), 'vendor').ok).toBe(true);
    const again = r.register(vendorDef(), 'vendor');
    expect(!again.ok && again.errors.join()).toMatch(/already registered/);
  });

  it.each([
    [
      'translatable non-string',
      { props: { n: { kind: 'integer', classification: 'translatable', label: 'N', min: 0, max: 5 } } },
      /only string or text properties can be translatable/,
    ],
    [
      'locale-specific boolean',
      { props: { b: { kind: 'boolean', classification: 'locale-specific', label: 'B' } } },
      /cannot be locale-specific/,
    ],
    [
      'integer min above max',
      { props: { n: { kind: 'integer', classification: 'invariant', label: 'N', min: 5, max: 1 } } },
      /min is greater than max/,
    ],
    [
      'required without default',
      { props: { n: { kind: 'boolean', classification: 'invariant', label: 'N', required: true } } },
      /needs a default/,
    ],
    [
      'enum default outside the values',
      { props: { e: { kind: 'enum', classification: 'invariant', label: 'E', values: ['a'], default: 'b' } } },
      /default value is not valid/,
    ],
    [
      'string default too long',
      { props: { s: { kind: 'string', classification: 'invariant', label: 'S', maxLength: 2, default: 'abc' } } },
      /default value is not valid/,
    ],
    [
      'url default with a dangerous scheme',
      { props: { u: { kind: 'url', classification: 'locale-specific', label: 'U', default: 'javascript:alert(1)' } } },
      /default value is not valid/,
    ],
    [
      'integer default out of range',
      { props: { n: { kind: 'integer', classification: 'invariant', label: 'N', min: 1, max: 3, default: 4 } } },
      /default value is not valid/,
    ],
  ])('rejects %s', (_name, patch, message) => {
    expect(errorsOf(vendorDef(patch)).join()).toMatch(message);
  });

  it.each([
    ['an unknown field', { extra: 1 }],
    ['a bad type', { type: 'Card' }],
    ['a bad property id', { props: { 'Bad-Id': { kind: 'boolean', classification: 'invariant', label: 'B' } } }],
    [
      'a reserved property id',
      { props: { constructor: { kind: 'boolean', classification: 'invariant', label: 'B' } } },
    ],
    ['a bad nesting entry', { allowedParents: ['container'] }],
    ['#root as an allowed child', { allowedChildren: ['#root'] }],
    ['no allowed parents', { allowedParents: [] }],
    ['a bad category', { category: 'misc' }],
    ['an unknown property kind', { props: { x: { kind: 'richtext', classification: 'invariant', label: 'X' } } }],
    ['version 0', { version: 0 }],
  ])('rejects %s', (_name, patch) => {
    expect(register(vendorDef(patch)).ok).toBe(false);
  });

  it.each([[null], [undefined], ['x'], [42], [[]], [() => 1], [Symbol('s')]])(
    'never throws on garbage input %#',
    (input) => {
      expect(() => register(input)).not.toThrow();
      expect(register(input).ok).toBe(false);
    },
  );

  it('accepts property ids that exist on every object (toString)', () => {
    const def = vendorDef({
      props: { toString: { kind: 'string', classification: 'invariant', label: 'T', maxLength: 5, default: 'x' } },
    });
    const r = new ElementRegistry();
    expect(r.register(def, 'vendor').ok).toBe(true);
    expect(r.validateProps('acme/card', { toString: 'abc' })).toEqual([]);
    expect(r.validateProps('acme/card', { toString: 'abcdefgh' })[0]).toMatch(/^toString:/);
  });
});

describe('generated editor registry', () => {
  it('adds ready template palette types with authored style metadata', () => {
    const registry = createEditorRegistry();
    for (const id of [
      'page',
      'stack',
      'row',
      'columns',
      'grid',
      'card',
      'navigation',
      'site-header',
      'site-footer',
      'site-logo',
      'div',
      'spacer',
      'separator',
      'list',
      'link',
      'steps',
      'breadcrumbs',
      'pagination',
      'paragraph',
      'rich-text',
      'eyebrow',
      'blockquote',
      'badge',
      'button-group',
      'counter',
      'progress-ring',
      'highlight-text',
      'progress',
      'spinner',
      'skeleton',
    ])
      expect(registry.has(`blixis/${id}`)).toBe(true);
    expect(createCoreRegistry().list()).toHaveLength(6);
    expect(registry.get('blixis/navigation')?.props['items']?.kind).toBe('json');
    expect(registry.localizedProperties('blixis/navigation')).toContainEqual({
      id: 'items',
      kind: 'json',
      classification: 'translatable',
    });
    expect(registry.get('blixis/spacer')?.styleProperties).toContain('height');
  });
});

describe('the manifest', () => {
  it('is committed and up to date', () => {
    expect(readFileSync(join(here, '..', 'manifest', 'core-elements.json'), 'utf8')).toBe(generate());
  });

  it('is plain JSON (no code), canonical and complete', () => {
    const manifest = createCoreRegistry().manifest();
    expect(manifest.apiVersion).toBe(EXTENSION_API_VERSION);
    expect(manifest.elements).toHaveLength(6);
    expect(JSON.parse(canonicalJson(manifest))).toEqual(JSON.parse(JSON.stringify(manifest)));
  });
});

describe('the registry works with the document commands (canNest hook)', () => {
  const registry = createCoreRegistry();
  const ctx = { canNest: registry.canNest };
  const doc = (): BuilderDocument => {
    const r = validateDocument({
      schemaVersion: 1,
      documentId: 'doc-001',
      layoutRevision: 1,
      defaultLocale: 'en_US',
      locales: ['en_US'],
      root: [
        {
          id: 'el-sec',
          type: 'blixis/section',
          props: { tag: 'section' },
          children: [{ id: 'el-h', type: 'blixis/heading', props: { level: 2 }, children: [] }],
        },
      ],
      classListVersion: 0,
      classRefs: {},
      translations: { en_US: { 'el-h': { status: 'translated', values: { text: 'Hello' } } } },
      metadata: { updatedAt: '2026-01-01T00:00:00Z', editorVersion: '0.0.0' },
    });
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    return r.document;
  };
  const code = (command: unknown): string => {
    const r = applyCommand(doc(), command, ctx);
    return r.ok ? 'ok' : r.error.code;
  };

  it('allows registered nestings and rejects the others', () => {
    const text = registry.createElement('blixis/text', 'el-t');
    expect(code({ type: 'insert', parentId: 'el-sec', index: 1, element: text })).toBe('ok');
    expect(code({ type: 'insert', parentId: null, index: 1, element: text })).toBe('disallowed-parent');
    expect(code({ type: 'insert', parentId: 'el-h', index: 0, element: text })).toBe('disallowed-parent');
    expect(
      code({ type: 'insert', parentId: null, index: 1, element: registry.createElement('blixis/section', 'el-s2') }),
    ).toBe('ok');
    expect(code({ type: 'move', id: 'el-h', parentId: null, index: 1 })).toBe('disallowed-parent');
    expect(
      code({
        type: 'insert',
        parentId: 'el-sec',
        index: 0,
        element: { id: 'el-u', type: 'acme/unknown', props: {}, children: [] },
      }),
    ).toBe('disallowed-parent');
  });

  it('moves a known container that holds an unknown (removed add-on) element, but cannot create or detach it', () => {
    const base = doc();
    const withUnknown = applyCommand(
      base,
      {
        type: 'insert',
        parentId: 'el-sec',
        index: 0,
        element: { id: 'el-u', type: 'acme/gone', props: {}, children: [] },
      },
      { canNest: () => true },
    );
    expect(withUnknown.ok).toBe(true);
    if (!withUnknown.ok) return;
    const second = registry.createElement('blixis/section', 'el-s2');
    const withSecond = applyCommand(
      withUnknown.document,
      { type: 'insert', parentId: null, index: 1, element: second },
      ctx,
    );
    expect(withSecond.ok).toBe(true);
    if (!withSecond.ok) return;
    const moved = applyCommand(withSecond.document, { type: 'move', id: 'el-sec', parentId: null, index: 1 }, ctx);
    expect(moved.ok).toBe(true);
    const detached = applyCommand(withSecond.document, { type: 'move', id: 'el-u', parentId: 'el-h', index: 0 }, ctx);
    expect(detached.ok).toBe(false);
  });

  it('a document built from createElement passes both validators', () => {
    const element = registry.createElement('blixis/button', 'el-b');
    const r = applyCommand(doc(), { type: 'insert', parentId: 'el-sec', index: 1, element }, ctx);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(checkAgainstRegistry(r.document, registry)).toEqual([]);
      expect(validateDocument(JSON.stringify(r.document)).ok).toBe(true);
    }
  });
});

describe('checkAgainstRegistry', () => {
  const registry = createCoreRegistry();
  const base = (): BuilderDocument => {
    const r = validateDocument({
      schemaVersion: 1,
      documentId: 'doc-001',
      layoutRevision: 1,
      defaultLocale: 'en_US',
      locales: ['en_US', 'nl_NL'],
      root: [
        {
          id: 'el-sec',
          type: 'blixis/section',
          props: { tag: 'main' },
          children: [
            { id: 'el-h', type: 'blixis/heading', props: { level: 1 }, children: [] },
            { id: 'el-btn', type: 'blixis/button', props: { variant: 'outline' }, children: [] },
          ],
        },
      ],
      classListVersion: 0,
      classRefs: {},
      translations: {
        en_US: {
          'el-h': { status: 'translated', values: { text: 'Welcome' } },
          'el-btn': { status: 'translated', values: { label: 'Go', href: '/go' } },
        },
        nl_NL: {
          'el-h': { status: 'draft', values: { text: 'Welkom' } },
          'el-btn': { status: 'draft', values: { href: 'https://example.nl/' } },
        },
      },
      metadata: { updatedAt: '2026-01-01T00:00:00Z', editorVersion: '0.0.0' },
    });
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    return r.document;
  };
  const edit = (change: (d: Record<string, unknown>) => void): BuilderDocument => {
    const d = structuredClone(base()) as unknown as Record<string, unknown>;
    change(d);
    const r = validateDocument(d);
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    return r.document;
  };
  const sections = (d: Record<string, unknown>): Record<string, unknown>[] => d['root'] as Record<string, unknown>[];
  const children = (d: Record<string, unknown>): Record<string, unknown>[] =>
    sections(d)[0]?.['children'] as Record<string, unknown>[];
  const codes = (doc: BuilderDocument): string[] => checkAgainstRegistry(doc, registry).map((i) => i.code);

  it('accepts a correct document', () => {
    expect(checkAgainstRegistry(base(), registry)).toEqual([]);
  });

  it('warns about unknown element types but keeps going (add-on removed)', () => {
    const doc = edit((d) => {
      children(d).push({ id: 'el-x', type: 'acme/gone', props: { whatever: 1 }, children: [] });
    });
    const issues = checkAgainstRegistry(doc, registry);
    expect(issues.map((i) => `${i.severity} ${i.code}`)).toEqual(['warning unknown-element-type']);
    expect(issues[0]?.path).toBe('$.root[0].children[2].type');
  });

  it('reports illegal nesting, including at the page root and inside leaf elements', () => {
    expect(
      codes(
        edit((d) => {
          sections(d).push({ id: 'el-t', type: 'blixis/text', props: {}, children: [] });
        }),
      ),
    ).toEqual(['invalid-nesting']);
    expect(
      codes(
        edit((d) => {
          defined(children(d)[0])['children'] = [{ id: 'el-t', type: 'blixis/text', props: {}, children: [] }];
        }),
      ),
    ).toEqual(['invalid-nesting']);
  });

  it('reports unknown properties, translatable values in props, invalid values and missing required properties', () => {
    expect(
      codes(
        edit((d) => {
          (children(d)[0] as Record<string, Record<string, unknown>>)['props'] = { level: 1, nope: 1 };
        }),
      ),
    ).toEqual(['unknown-property']);
    expect(
      codes(
        edit((d) => {
          (children(d)[0] as Record<string, Record<string, unknown>>)['props'] = { level: 1, text: 'in props' };
        }),
      ),
    ).toEqual(['translatable-property-in-props']);
    expect(
      codes(
        edit((d) => {
          (children(d)[0] as Record<string, Record<string, unknown>>)['props'] = { level: 7 };
        }),
      ),
    ).toEqual(['invalid-property-value']);
    expect(
      codes(
        edit((d) => {
          (children(d)[0] as Record<string, Record<string, unknown>>)['props'] = {};
        }),
      ),
    ).toEqual(['missing-required-property']);
  });

  it('checks translation values: only translatable or locale-specific properties, valid values, safe links', () => {
    const withValues = (locale: string, id: string, values: Record<string, unknown>): BuilderDocument =>
      edit((d) => {
        const streams = d['translations'] as Record<string, Record<string, Record<string, unknown>>>;
        defined(streams[locale])[id] = { status: 'draft', values };
      });
    expect(codes(withValues('en_US', 'el-h', { level: 3 }))).toEqual(['untranslatable-property']);
    expect(codes(withValues('en_US', 'el-h', { nope: 'x' }))).toEqual(['untranslatable-property']);
    expect(codes(withValues('en_US', 'el-h', { text: 'x'.repeat(501) }))).toEqual(['invalid-translation-value']);
    expect(codes(withValues('nl_NL', 'el-btn', { href: 'javascript:alert(1)' }))).toEqual([
      'invalid-translation-value',
    ]);
    expect(codes(withValues('nl_NL', 'el-btn', { href: 'https://example.nl/ok', label: 'Ga' }))).toEqual([]);
  });

  it('ignores translations of removed elements and of unknown types', () => {
    const doc = edit((d) => {
      const streams = d['translations'] as Record<string, Record<string, unknown>>;
      defined(streams['en_US'])['el-gone'] = {
        status: 'orphaned',
        values: { anything: 1 },
      };
    });
    expect(checkAgainstRegistry(doc, registry)).toEqual([]);
  });

  it('stops collecting at 50 issues and handles deep trees without recursion', () => {
    const many = edit((d) => {
      for (let i = 0; i < 120; i += 1)
        sections(d).push({ id: `el-t${String(i).padStart(3, '0')}`, type: 'blixis/text', props: {}, children: [] });
    });
    expect(checkAgainstRegistry(many, registry)).toHaveLength(50);
    let node: Record<string, unknown> = { id: 'el-leaf', type: 'blixis/text', props: {}, children: [] };
    for (let i = 0; i < 30; i += 1)
      node = { id: `el-c${String(i).padStart(2, '0')}`, type: 'blixis/container', props: {}, children: [node] };
    const deep = edit((d) => {
      children(d).push(node);
    });
    expect(checkAgainstRegistry(deep, registry)).toEqual([]);
  });
});
